from __future__ import annotations

"""Background-task registry (v9-A11, kills RUF006 fleet-wide).

`asyncio.create_task` returns a Task the caller usually drops — the event
loop only keeps a WEAK reference, so the garbage collector may destroy a
running task mid-flight (payments confirmations, broadcast fan-outs, WS
pushes silently dying). `spawn()` keeps a strong reference in a module-level
set until the task completes, then discards it automatically.

Usage:  spawn(some_coro(), name="payments-notify")
Behavior is otherwise identical to asyncio.create_task.
"""
import asyncio

# Strong references to in-flight background tasks. The done-callback removes
# each entry the moment it finishes, so the set only holds live tasks.
_bg_tasks: set[asyncio.Task] = set()


def spawn(coro, *, name: str | None = None) -> asyncio.Task:
    """Schedule a background task that the GC cannot collect mid-flight.

    Keeps a strong reference until completion (RUF006 fix). Long-lived
    scheduler loops also end up here — that is fine, the registry is bounded
    by the number of actually-running tasks.
    """
    t = asyncio.create_task(coro, name=name)
    _bg_tasks.add(t)
    t.add_done_callback(_bg_tasks.discard)
    return t
