"""Distributed Redis cache — shared across all Vercel instances.

v24-R3 (M5 — serialization owner): THIS module is the single serialization
layer for everything it stores — ``set`` json-encodes once, ``get`` json-
decodes once, callers pass/receive live objects. ``api_cache`` used to
pre-dump its values to a JSON string and hand that string here (double
encoding: Redis held a JSON string OF a JSON string, and the two layers
used incompatible read conventions — a mixed consumer corrupted silently).
api_cache now passes objects and namespaces its keys under ``apic:v2:``
so pre-v24 double-encoded entries are never read back (they age out via
their own TTL). Keep this contract: never store a pre-encoded JSON string
through ``set``.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import weakref
from collections.abc import Callable
from typing import Any

log = logging.getLogger("redis-cache")

_redis = None
_redis_lock: asyncio.Lock | None = None
_redis_loop_ref: weakref.ref | None = None

# ponytail: single async Redis client per process, created on first use
def _build_url() -> str:
    url = os.getenv("REDIS_URL", "")
    if not url:
        return ""
    return url


async def get_client():
    """(loop-aware singleton — v28 D-ENV2, same rationale as fb_client.py:
    the old module-level ``asyncio.Lock`` bound to the first event loop and
    refused every later loop; a loop change now rebuilds the guard and the
    client. Production runs one loop per process — behavior unchanged.)"""
    global _redis, _redis_lock, _redis_loop_ref
    loop = asyncio.get_running_loop()
    if _redis_loop_ref is None or _redis_loop_ref() is not loop:
        # per-loop state: the ``False`` "don't retry" sentinel is also reset —
        # a new loop (a new test) deserves a fresh probe; prod never rebuilds.
        _redis = None
        _redis_lock = None
        _redis_loop_ref = weakref.ref(loop)
    if _redis_lock is None:
        _redis_lock = asyncio.Lock()
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
