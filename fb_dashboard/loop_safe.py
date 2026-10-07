"""Loop-local asyncio.Lock — test-infra repair (2026-10-07).

pytest-asyncio (auto mode) runs every test on a fresh event loop, but the
module-level singleton locks (``redis_cache._redis_lock``,
``fb_client._http_lock``, ``api_cache._cache_locks``,
``payments.plans._SUB_PENDING_LOCKS``) were plain ``asyncio.Lock`` objects
created at import time — they bound to the first loop they saw, and every
later test running on another loop raised::

    RuntimeError: <asyncio.locks.Lock ...> is bound to a different event loop

(26 red tests; SmartBot CI red since 2026-09-05 while the failures were
masked behind other red gates.)

Production serves a SINGLE event loop, where ``LoopLocalLock`` is
behaviourally identical to ``asyncio.Lock``: the wrapped lock is re-created
only when ``get_running_loop()`` differs from the loop it was created
under — which never happens in production, and happens per-test under
pytest-asyncio, which is exactly the desired isolation.
"""
from __future__ import annotations

import asyncio


class LoopLocalLock:
    """An ``asyncio.Lock`` factory that follows the running event loop.

    Usage::

        _my_lock = LoopLocalLock()

        async def critical():
            async with _my_lock.get():
                ...

    ``get()`` must be called from a coroutine (it needs a running loop).
    """

    __slots__ = ("_lock", "_loop")

    def __init__(self) -> None:
        self._lock: asyncio.Lock | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def get(self) -> asyncio.Lock:
        loop = asyncio.get_running_loop()
        if self._lock is None or self._loop is not loop:
            self._lock = asyncio.Lock()
            self._loop = loop
        return self._lock
