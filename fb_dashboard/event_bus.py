from __future__ import annotations
"""In-process pub/sub event bus for cross-module broadcasting (WS + SSE)."""
import logging
from collections import defaultdict
from typing import Any, Callable

log = logging.getLogger("fb-eventbus")


class EventBus:
    def __init__(self):
        self._subscribers: dict[str, list[Callable]] = defaultdict(list)

    def subscribe(self, event: str, callback: Callable):
        # ponytail: callback ref prevents GC of enclosing scope — add weakref if subscriber lifecycle mismatches
        if callback not in self._subscribers[event]:
            self._subscribers[event].append(callback)

    def unsubscribe(self, event: str, callback: Callable):
        try:
            self._subscribers[event].remove(callback)
        except ValueError:
            pass

    async def emit(self, event: str, data: Any = None):
        for cb in list(self._subscribers.get(event, [])):
            try:
                await cb(data)
            except Exception:
                log.exception(f"EventBus subscriber error for event={event}")


event_bus = EventBus()
