"""Distributed Redis cache — shared across all Vercel instances."""
from __future__ import annotations
import asyncio
import json
import logging
import os
import time
from typing import Any, Callable, Optional

log = logging.getLogger("redis-cache")

_redis = None
_redis_lock = asyncio.Lock()

# ponytail: single async Redis client per process, created on first use
def _build_url() -> str:
    url = os.getenv("REDIS_URL", "")
    if not url:
        return ""
    return url


async def get_client():
    global _redis
    if _redis is None:
        async with _redis_lock:
            if _redis is None:
                url = _build_url()
                if not url:
                    return None
                try:
                    import redis.asyncio as aioredis
                    _redis = aioredis.from_url(
                        url,
                        decode_responses=True,
                        socket_timeout=5,
                        retry_on_timeout=True,
                        max_connections=10,
                    )
                    await _redis.ping()
                    log.info("Redis connected")
                except Exception as e:
                    log.warning(f"Redis unavailable: {e}")
                    _redis = False  # sentinel — don't retry per-request
    return _redis if _redis is not False else None


async def disconnect():
    global _redis
    if _redis and _redis is not False:
        await _redis.close()
        _redis = None


async def get(key: str) -> Any | None:
    c = await get_client()
    if not c:
        return None
    try:
        raw = await c.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def set(key: str, value: Any, ttl: int = 300) -> bool:
    c = await get_client()
    if not c:
        return False
    try:
        await c.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception:
        return False


async def delete(key: str) -> bool:
    c = await get_client()
    if not c:
        return False
    try:
        await c.delete(key)
        return True
    except Exception:
        return False


async def get_or_set(key: str, ttl: int, loader: Callable) -> Any:
    cached = await get(key)
    if cached is not None:
        return cached
    value = await loader()
    await set(key, value, ttl)
    return value
