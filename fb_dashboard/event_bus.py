from __future__ import annotations
"""In-process pub/sub event bus for cross-module broadcasting (WS + SSE) with tenant isolation."""
import logging
from collections import defaultdict
from typing import Any, Callable

log = logging.getLogger("fb-eventbus")


class EventBus:
    def __init__(self):
        # event -> list of (callback, tenant_filter)
        self._subscribers: dict[str, list[tuple[Callable, int | None]]] = defaultdict(list)

    def subscribe(self, event: str, callback: Callable, tenant_id: int | None = None):
        """
        Subscribe to an event.
        If tenant_id is provided, only events for that tenant will be delivered.
        If tenant_id is None, all events (global subscription) will be delivered.
        """
        if (callback, tenant_id) not in self._subscribers[event]:
            self._subscribers[event].append((callback, tenant_id))

    def unsubscribe(self, event: str, callback: Callable, tenant_id: int | None = None):
        try:
            self._subscribers[event].remove((callback, tenant_id))
        except ValueError:
            pass

    async def emit(self, event: str, data: Any = None, tenant_id: int | None = None):
        """
        Emit an event.
        If tenant_id is provided, only subscribers for that tenant (or global) will receive it.
        If tenant_id is None, all subscribers will receive it (legacy behavior).
        """
        for cb, sub_tenant_id in list(self._subscribers.get(event, [])):
            # Check if subscriber wants this tenant's events
            if sub_tenant_id is not None and tenant_id is not None and sub_tenant_id != tenant_id:
                continue  # Subscriber is for different tenant
            try:
                # Pass tenant_id to callback if it accepts it
                import inspect
                sig = inspect.signature(cb)
                if 'tenant_id' in sig.parameters:
                    await cb(data, tenant_id=tenant_id)
                else:
                    await cb(data)
            except Exception:
                log.exception(f"EventBus subscriber error for event={event}")


event_bus = EventBus()
