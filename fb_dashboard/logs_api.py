"""Logs API router — structured log endpoints."""
import json
import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query, Depends
from fastapi.responses import StreamingResponse

from monitor import get_logger
from database import get_db
from sqlalchemy import select, desc, func

logs_router = APIRouter(prefix="/api/logs")


@logs_router.get("/stream")
async def stream_logs(
    level: str = Query(""),
    module: str = Query(""),
    limit: int = Query(100),
    since: str = Query(""),
    _=Depends(lambda: None),  # placeholder; real auth at app level
):
    """Return filtered log events from StructuredLogger buffer."""
    logger = get_logger()
    events = logger.get_buffer(
        level=level or None,
        module=module or None,
        since=since or None,
        limit=limit,
    )
    return {"events": events, "total": len(events)}


@logs_router.get("/realtime")
async def realtime_logs(
    _=Depends(lambda: None),
):
    """SSE endpoint streaming log events as they happen."""
    import queue

    q: asyncio.Queue[dict] = asyncio.Queue()

    original_emit = get_logger()._emit

    async def bridge(event):
        try:
            await q.put(event.to_dict())
        except Exception:
            pass

    # monkey-patch: bridge events to SSE queue
    from monitor import StructuredLogger

    async def sse_generator():
        logger = get_logger()
        logger._emit = bridge  # ponytail: replaces _emit; single-session, fine
        try:
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=30)
                    yield f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'event': 'heartbeat'})}\n\n"
        finally:
            logger._emit = original_emit

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
async def log_stats(_=Depends(lambda: None)):
    """Log volume stats per level."""
    logger = get_logger()
    return logger.get_stats()
