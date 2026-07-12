"""API response cache: decorator-based, per-endpoint TTL, auto-invalidate on writes."""
import asyncio
import time
import json
from functools import wraps

_cache_store: dict[str, tuple[float, str]] = {}
_cache_locks: dict[str, asyncio.Lock] = {}
_invalidate_on_write: set[str] = set()

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

        The decorated function's first positional arg is used as the request-like
        object — it must have a `.url.path` (or be a string path) and optionally
        `.query_params` (a dict-like).
        """
        def decorator(fn):
            @wraps(fn)
            async def wrapper(*args, **kwargs):
                req = args[0] if args else None
                # ponytail: first arg is FastAPI Request; cache by path+query
                path = req.url.path if hasattr(req, 'url') else str(req)
                qp = dict(req.query_params) if hasattr(req, 'query_params') else None
                key = _make_key(path, qp)

                # store ttl
                _cache_ttl[key] = ttl

                # concurrent-dedup lock per key
                async with _lock_for(key):
                    now = time.time()
                    cached = _cache_store.get(key)
                    if cached and (now - cached[0]) < ttl:
                        return json.loads(cached[1])

                    result = await fn(*args, **kwargs)
                    _cache_store[key] = (now, json.dumps(result, default=str))
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
        _invalidate_on_write.add(resource_prefix)

        def decorator(fn):
            @wraps(fn)
            async def wrapper(*args, **kwargs):
                result = await fn(*args, **kwargs)
                # invalidate matching cache entries
                to_del = [k for k in _cache_store if resource_prefix in k]
                for k in to_del:
                    _cache_store.pop(k, None)
                    _cache_locks.pop(k, None)
                    _cache_ttl.pop(k, None)
                return result
            return wrapper
        return decorator

    def clear_all(self):
        _cache_store.clear()
        _cache_locks.clear()
        _cache_ttl.clear()
