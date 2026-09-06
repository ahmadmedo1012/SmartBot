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
import logging

log = logging.getLogger("fb-api")

# Strong references to in-flight background tasks. The done-callback removes
# each entry the moment it finishes, so the set only holds live tasks.
_bg_tasks: set[asyncio.Task] = set()


def _log_task_exception(task: asyncio.Task) -> None:
    """v12-E3.5 — done-callback that surfaces background-task failures.

    A fire-and-forget task that raised was COMPLETELY silent before: the
    "Task exception was never retrieved" line only appears when the loop's
    exception handler runs at GC time, and nothing ever reached Sentry.
    Now every spawn()ed task that ends in an exception logs it with the full
    traceback (exc_info) and reports it to Sentry. Deliberate cancellation is
    normal shutdown, not a failure — logged nowhere.
    """
    if task.cancelled():
        return
    try:
        exc = task.exception()
    except Exception:  # defensive: exception() only raises on a still-pending task
        return
    if exc is None:
        return
    log.error("Background task %s failed: %s", task.get_name(), exc, exc_info=exc)
    try:
        from _observability import capture_exception

        capture_exception(exc)
    except Exception:
        # observability must never amplify a background failure
        pass


def spawn(coro, *, name: str | None = None) -> asyncio.Task:
    """Schedule a background task that the GC cannot collect mid-flight.

    Keeps a strong reference until completion (RUF006 fix). Long-lived
    scheduler loops also end up here — that is fine, the registry is bounded
    by the number of actually-running tasks.
    """
    t = asyncio.create_task(coro, name=name)
    _bg_tasks.add(t)
    t.add_done_callback(_bg_tasks.discard)
    # v12-E3.5 — registered alongside the discard callback, so any task that
    # ends in an exception gets it surfaced (log + Sentry) instead of dying
    # silently ("Task exception was never retrieved" at GC time, if ever).
    t.add_done_callback(_log_task_exception)
    return t
