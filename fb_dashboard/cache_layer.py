"""
TTL-based cache and connection management for SmartBot.
Reduces DB load and FB API calls on hot paths.
"""
import asyncio
import logging
import time
from typing import Any, Callable

log = logging.getLogger("fb-cache")


class TTLCache:
    """Simple TTL cache with async refresh."""
    def __init__(self, ttl_seconds: int = 60, refresh_fn: Callable | None = None):
        self._ttl = ttl_seconds
        self._refresh_fn = refresh_fn
        self._data: Any = None
        self._loaded_at: float = 0
        self._lock = asyncio.Lock()

    async def get(self) -> Any:
        now = time.time()
        if self._data is not None and (now - self._loaded_at) < self._ttl:
            return self._data
        async with self._lock:
            # Double-check after acquiring lock
            if self._data is not None and (now - self._loaded_at) < self._ttl:
                return self._data
            if self._refresh_fn:
                self._data = await self._refresh_fn()
            self._loaded_at = time.time()
        return self._data

    async def invalidate(self):
        async with self._lock:
            self._data = None
            self._loaded_at = 0

    async def set(self, data: Any):
        async with self._lock:
            self._data = data
            self._loaded_at = time.time()


class RuleCache(TTLCache):
    """Cached rules with pre-normalized keywords, sorted by priority."""
    def __init__(self, refresh_fn: Callable, ttl: int = 120):
        super().__init__(ttl_seconds=ttl, refresh_fn=self._load_and_sort)
        self._raw_loader = refresh_fn

    async def _load_and_sort(self) -> list[dict]:
        rules = await self._raw_loader()
        # Sort by priority (lower = higher priority)
        return sorted(rules, key=lambda r: r.get("priority", 999))

    async def get_rules(self) -> list[dict]:
        return await self.get() or []


class ReplyDedupCache(TTLCache):
    """In-memory dedup set with TTL to prevent unbounded growth."""
    def __init__(self, initial: set | None = None, ttl: int = 300):
        super().__init__(ttl_seconds=ttl)
        self._seen: set[str] = set(initial or [])
        self._loaded_at = time.time()

    def is_dup(self, comment_id: str) -> bool:
        now = time.time()
        if (now - self._loaded_at) > self._ttl:
            self._seen.clear()
            self._loaded_at = now
        return comment_id in self._seen

    def mark(self, comment_id: str):
        self._seen.add(comment_id)

    def load(self, ids: set[str]):
        self._seen = set(ids)
        self._loaded_at = time.time()
