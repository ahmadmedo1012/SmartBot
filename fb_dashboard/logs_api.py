from __future__ import annotations

"""Logs API router — structured log endpoints.

v9-A6: the StructuredLogger buffer is a GLOBAL in-memory ring — its events
carry NO tenant marker (messages can embed other tenants' comment texts and
usernames), so stream/realtime/stats are restricted to the platform admin.
Tenant activity logs remain available through the DB-backed /api/logs
(routers/bot.py), which filters BotLog by tenant_id.
"""
import asyncio
import json

from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from monitor import get_logger

logs_router = APIRouter(prefix="/api/logs")


async def _require_platform_admin(request: Request, db=Depends(get_db)):
    """v9-A6 guard: buffer entries are global (no tenant marker) — tenant
    users must not read them. Lazy-import to avoid circular import with runner."""
    from routers.auth import get_current_user, is_platform_admin
    user = await get_current_user(request, db)
    if not is_platform_admin(user):
        raise HTTPException(403, "سجلات النظام الحية متاحة لمسؤول المنصة فقط")
    return user


@logs_router.get("/stream")
async def stream_logs(
    level: str = Query(""),
    module: str = Query(""),
    limit: int = Query(100, ge=1, le=1000),
    since: str = Query(""),
    _=Depends(_require_platform_admin),
):
    """Return filtered log events from StructuredLogger buffer."""
    logger = get_logger()
    events = logger.get_buffer(
        level=level or None,
        module=module or None,
        since=since or None,
        limit=limit,
    )
    return {"success": True, "data": {"events": events, "total": len(events)}}


@logs_router.get("/realtime")
async def realtime_logs(
    _=Depends(_require_platform_admin),
):
    """SSE endpoint streaming log events as they happen.

    v9-A6: platform-admin only (global buffer, no tenant marker)."""
    from event_bus import event_bus

    async def sse_generator():
        q: asyncio.Queue[dict] = asyncio.Queue()

        async def handler(data):
            await q.put(data)

        event_bus.subscribe("log_event", handler)
        try:
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"
                except TimeoutError:
                    yield "data: {\"event\":\"heartbeat\"}\n\n"
        finally:
            event_bus.unsubscribe("log_event", handler)

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@logs_router.get("/stats")
async def log_stats(_=Depends(_require_platform_admin)):
    """Log volume stats per level (v9-A6: platform-admin only)."""
    logger = get_logger()
    return {"success": True, "data": logger.get_stats()}
