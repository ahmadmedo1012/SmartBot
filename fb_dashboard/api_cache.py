from __future__ import annotations
"""API response cache: Redis-backed on Vercel, in-memory fallback locally."""
import asyncio
import time
import json
from functools import wraps

# ponytail: process-local fallback — used when Redis is unreachable
_cache_store: dict[str, tuple[float, str]] = {}
_cache_locks: dict[str, asyncio.Lock] = {}
_cache_ttl: dict[str, int] = {}
MAX_KEYS = 1000


def _lock_for(key: str) -> asyncio.Lock:
    if key not in _cache_locks:
        _cache_locks[key] = asyncio.Lock()
    return _cache_locks[key]


def _make_key(path: str, query_params: dict | None) -> str:
    if query_params:
        sorted_qs = "&".join(f"{k}={v}" for k, v in sorted(query_params.items()))
        return f"{path}?{sorted_qs}"
    return path


async def _rcache_get(key: str) -> str | None:
    from redis_cache import get
    return await get(key)


async def _rcache_set(key: str, val: str, ttl: int):
    from redis_cache import set
    await set(key, val, ttl)


class APICache:
    """Decorator-based API cache.

    Usage:
        cache = APICache()

        @cache.cached(ttl=30)
        async def my_endpoint(req, db=Depends(get_db)):
            ...

        @cache.invalidate_on_write("/api/stats")
        async def write_endpoint(req, db=Depends(get_db)):
            ...
    """

    def cached(self, ttl: int = 30):
        """Decorator: cache function response for `ttl` seconds.

        Uses Redis when available (Vercel), falls back to in-memory dict.
        The decorated function's first positional arg is used as the request-like
        object — it must have a `.url.path` (or be a string path) and optionally
        `.query_params` (a dict-like).
        """
        def decorator(fn):
            @wraps(fn)
            async def wrapper(*args, **kwargs):
                req = args[0] if args else None
                path = req.url.path if hasattr(req, 'url') else str(req)
                qp = dict(req.query_params) if hasattr(req, 'query_params') else None
                key = _make_key(path, qp)

                # Try Redis first
                cached = await _rcache_get(key)
                if cached is not None:
                    return json.loads(cached)

                # Process-local fallback
                async with _lock_for(key):
                    now = time.time()
                    cached = _cache_store.get(key)
                    if cached and (now - cached[0]) < ttl:
                        return json.loads(cached[1])

                    result = await fn(*args, **kwargs)
                    serialized = json.dumps(result, default=str)
                    _cache_store[key] = (now, serialized)
                    # Also write to Redis for other instances
                    await _rcache_set(key, serialized, ttl)
                    if len(_cache_store) > MAX_KEYS:
                        to_evict = sorted(_cache_store, key=lambda k: _cache_store[k][0])[:MAX_KEYS // 5]
                        for k in to_evict:
                            _cache_store.pop(k, None)
                            _cache_locks.pop(k, None)
                            _cache_ttl.pop(k, None)
                return result
            return wrapper
        return decorator

    def invalidate_on_write(self, resource_prefix: str):
        """Decorator for write endpoints: invalidates caches for paths containing prefix."""
        def decorator(fn):
            @wraps(fn)
            async def wrapper(*args, **kwargs):
                result = await fn(*args, **kwargs)
                # Invalidate from Redis and local store
                to_del = [k for k in _cache_store if resource_prefix in k]
                for k in to_del:
                    _cache_store.pop(k, None)
                    _cache_locks.pop(k, None)
                    _cache_ttl.pop(k, None)
                    asyncio.create_task(_rcache_set(k, '', 1))  # immediate expiry
                return result
            return wrapper
        return decorator

    def clear_all(self):
        _cache_store.clear()
        _cache_locks.clear()
        _cache_ttl.clear()
