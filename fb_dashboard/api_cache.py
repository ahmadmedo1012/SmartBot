from __future__ import annotations

"""API response cache: Redis-backed on Vercel, in-memory fallback locally.

v24-R3 (M5 — unified serialization): this module and ``redis_cache`` used to
run INCOMPATIBLE serialization conventions on the same keys. ``api_cache``
pre-dumped its values to a JSON *string* and handed that string to
``redis_cache.set``, which json-encoded it AGAIN — Redis stored a doubly
encoded string, every read double-decoded, and a consumer that used
``redis_cache`` directly on the same key received a STRING where it expected
an object (and vice-versa a silent corruption). Now ``redis_cache`` is the
SINGLE serialization owner: ``_rcache_set`` passes the live object and
``_rcache_get`` returns the decoded object. Redis keys are namespaced +
versioned (``apic:v2:``) so entries written by the old double-encoding code
are never read back — they simply age out via their own TTL (≤ 3600s).
"""
import asyncio
import json
import time
from functools import wraps

# ponytail: process-local fallback — used when Redis is unreachable
_cache_store: dict[str, tuple[float, str]] = {}
_cache_locks: dict[str, asyncio.Lock] = {}
_cache_ttl: dict[str, int] = {}
MAX_KEYS = 1000

# v24-R3 (M5): Redis-key namespace + serialization version. See module doc.
_REDIS_PREFIX = "apic:v2:"
# v24-R3 (M4): keys this process has written to Redis — the delete set for
# invalidate_on_write (bounded; see _track_redis_key).
_redis_keys: set[str] = set()
_REDIS_KEYS_MAX = 10_000


def _track_redis_key(key: str) -> None:
    """Remember a Redis-written key so invalidation can DELETE it later.

    Coarse bound: past the cap the whole set resets — the worst case is that
    a (currently unused) invalidate_on_write call misses some keys, which is
    exactly the pre-v24 status quo, never a correctness regression.
    """
    if len(_redis_keys) >= _REDIS_KEYS_MAX:
        _redis_keys.clear()
    _redis_keys.add(key)


def _lock_for(key: str) -> asyncio.Lock:
    if key not in _cache_locks:
        _cache_locks[key] = asyncio.Lock()
    return _cache_locks[key]


def _make_key(path: str, query_params: dict | None) -> str:
    if query_params:
        sorted_qs = "&".join(f"{k}={v}" for k, v in sorted(query_params.items()))
        return f"{path}?{sorted_qs}"
    return path


def _evict_local() -> None:
    """Keep the process-local store under MAX_KEYS (oldest-first, 20% cut)."""
    if len(_cache_store) > MAX_KEYS:
        to_evict = sorted(_cache_store, key=lambda k: _cache_store[k][0])[:MAX_KEYS // 5]
        for k in to_evict:
            _cache_store.pop(k, None)
            _cache_locks.pop(k, None)
            _cache_ttl.pop(k, None)


async def _rcache_get(key: str):
    """Redis read → the decoded OBJECT (single decode; redis_cache owns json).

    Returns None on a miss / unavailable Redis (unchanged contract)."""
    from redis_cache import get
    return await get(_REDIS_PREFIX + key)


async def _rcache_set(key: str, val, ttl: int):
    """Redis write of the live OBJECT — redis_cache does the ONE json.dumps."""
    from redis_cache import set
    _track_redis_key(key)
    await set(_REDIS_PREFIX + key, val, ttl)


async def _rcache_delete(key: str) -> None:
    from redis_cache import delete
    await delete(_REDIS_PREFIX + key)
    _redis_keys.discard(key)


async def get_or_compute(key: str, ttl: float, factory):
    """v15-E7 (D8-B3): explicit-key TTL cache with singleflight semantics.

    Unlike ``APICache.cached`` (request-path keyed), the CALLER owns the key —
    mandatory for tenant-scoped responses whose URL is identical across
    tenants (D10 §8: a path-keyed cache would serve tenant A's dashboard
    bundle to tenant B). Flow: Redis first (cross-instance on Vercel), then
    the process-local store; on a miss the per-key lock collapses concurrent
    callers into ONE factory execution (they then read the fresh entry).
    """
    cached = await _rcache_get(key)
    if cached is not None:
        return cached
    result = None
    async with _lock_for(key):
        now = time.time()
        entry = _cache_store.get(key)
        if entry and (now - entry[0]) < ttl:
            return json.loads(entry[1])
        result = await factory()
        serialized = json.dumps(result, default=str)
        _cache_store[key] = (now, serialized)
        # v24-R3 (M5): pass the OBJECT — redis_cache owns serialization now.
        await _rcache_set(key, result, int(ttl))
        _evict_local()
    return result


def invalidate_prefix(prefix: str) -> None:
    """Drop local entries whose key contains ``prefix`` (Redis keeps its TTL)."""
    for k in [k for k in _cache_store if prefix in k]:
        _cache_store.pop(k, None)
        _cache_locks.pop(k, None)
        _cache_ttl.pop(k, None)


class APICache:
    """Decorator-based API cache.

    Usage:
        cache = APICache()

        @cache.cached(ttl=30)
        async def my_endpoint(req, db=Depends(get_db)):
            ...

        @cache.invalidate_on_write("/api/dashboard/bundle")
        async def write_endpoint(req, db=Depends(get_db)):
            ...
    """

    def cached(self, ttl: int = 30):
        """Decorator: cache function response for `ttl` seconds.

        Uses Redis when available (Vercel), falls back to in-memory dict.
        The decorated function's first positional arg is used as the request-like
        object — it must have a `.url.path` (or be a string path) and optionally
        `.query_params` (a dict-like). FastAPI endpoints WITHOUT a `Request`
        parameter are called with kwargs only, so the wrapper falls back to
        `"<module>.<qualname>"` — a stable, per-endpoint cache key. (The old
        `str(req)` fallback produced the literal key "None", which would have
        COLLIDED across different cached endpoints.)
        """
        def decorator(fn):
            @wraps(fn)
            async def wrapper(*args, **kwargs):
                req = args[0] if args else None
                if hasattr(req, 'url'):
                    path = req.url.path
                    qp = dict(req.query_params)
                else:
                    path = f"{fn.__module__}.{fn.__qualname__}"
                    qp = None
                key = _make_key(path, qp)

                # Try Redis first — v24-R3 (M5): the decoded OBJECT comes back
                # (was: a JSON string needing a second json.loads here).
                cached = await _rcache_get(key)
                if cached is not None:
                    return cached

                # Process-local fallback
                async with _lock_for(key):
                    now = time.time()
                    cached = _cache_store.get(key)
                    if cached and (now - cached[0]) < ttl:
                        return json.loads(cached[1])

                    result = await fn(*args, **kwargs)
                    serialized = json.dumps(result, default=str)
                    _cache_store[key] = (now, serialized)
                    # Also write to Redis for other instances (v24-R3 M5:
                    # the OBJECT, single-encoded by redis_cache).
                    await _rcache_set(key, result, ttl)
                    _evict_local()
                return result
            return wrapper
        return decorator

    def invalidate_on_write(self, resource_prefix: str):
        """Decorator for write endpoints: invalidates caches for keys containing prefix.

        v24-R3 (M4): the old implementation wrote ``''`` to Redis as a
        "poison marker" — but redis_cache json-encoded that to ``'""'`` and
        the next read decoded it back to ``''``, a value that blew up
        ``json.loads`` in every reader (a latent 500 for the first future
        user of this decorator; the double-encoding bug is M5). It also only
        covered keys still present in the LOCAL store, leaving other
        instances' Redis entries alive until TTL. Now:

        * the tracked Redis keys (every key THIS process wrote) matching the
          prefix get a REAL ``redis_cache.delete`` — no poison value, no
          decode hazard, cross-instance for our own writes;
        * local entries are dropped exactly as before;
        * limits: keys written ONLY by other instances need a SCAN-based
          sweep (not available through redis_cache) — ``clear_all``/TTL
          remain the documented ops path for those.
        """
        def decorator(fn):
            @wraps(fn)
            async def wrapper(*args, **kwargs):
                result = await fn(*args, **kwargs)
                # Invalidate from the local store
                for k in [k for k in _cache_store if resource_prefix in k]:
                    _cache_store.pop(k, None)
                    _cache_locks.pop(k, None)
                    _cache_ttl.pop(k, None)
                # v24-R3 (M4): REAL delete of the Redis copies (awaited so the
                # write response only leaves once invalidation is done; the
                # old fire-and-forget spawn could race the next read).
                for k in [k for k in _redis_keys if resource_prefix in k]:
                    await _rcache_delete(k)
                return result
            return wrapper
        return decorator

    def clear_all(self):
        _cache_store.clear()
        _cache_locks.clear()
        _cache_ttl.clear()
        _redis_keys.clear()
