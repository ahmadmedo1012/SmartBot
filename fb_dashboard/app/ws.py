from __future__ import annotations

"""WebSocket + SSE real-time endpoints (v11-A1 extraction).

Registered in runner.py: ``/ws`` (add_api_websocket_route) and
``GET /api/events`` (SSE). Bodies are verbatim moves.
"""

import asyncio
import json
import logging

import jwt
from _utils import utcnow
from config import settings
from database import AsyncSessionLocal
from event_bus import event_bus
from fastapi import Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from models import BlacklistedToken, Reply, Tenant, User
from routers.auth import ALGORITHM, get_current_user
from sqlalchemy import Date, cast, func, select
from ws_manager import ws_manager

log = logging.getLogger("fb-api")


def _extract_ws_token(ws: WebSocket) -> str:
    """v14-E2: Authorization header → ?token= query → cookie (in that order).

    Accepts ``Authorization: Bearer <jwt>`` (and a bare token) in the WS
    handshake headers. Starlette lowercases header names, so a single
    lowercase lookup covers all clients.
    """
    auth = ws.headers.get("authorization") or ""
    auth = auth.strip()
    if auth:
        if auth.lower().startswith("bearer "):
            auth = auth[7:].strip()
        if auth:
            return auth
    return ws.query_params.get("token") or ws.cookies.get("token") or ""


# ── WebSocket Real-Time Updates ─────────────────────────────────────────────

async def websocket_endpoint(ws: WebSocket):
    """WebSocket endpoint for real-time dashboard data.
    Sends events: stats_update, new_reply, bot_status, alert."""
    # v14-E2 (D8-L7 / D6 #6-adjacent): token from the Authorization handshake
    # HEADER first (a token in the URL query lands in access logs, proxy logs
    # and browser history — the documented D8 low finding), then the legacy
    # ?token= query for existing clients, then the session cookie.
    token = _extract_ws_token(ws)
    if not token:
        await ws.close(code=4001, reason="Missing token")
        return
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti", "")
        if jti:
            async with AsyncSessionLocal() as _db:
                blocked = await _db.execute(
                    select(BlacklistedToken).where(BlacklistedToken.jti == jti)
                )
                if blocked.scalar_one_or_none():
                    await ws.close(code=4001, reason="Token revoked")
                    return
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        await ws.close(code=4001, reason="Invalid or expired token")
        return
    sub = payload.get("sub", "")
    tid = payload.get("tid")
    async with AsyncSessionLocal() as db:
        # v10-A1-WS — tenant-scoped lookup (same treatment as get_current_user):
        # usernames are unique PER TENANT only, so the old unscoped username
        # query could raise MultipleResultsFound (crashing the WS handshake)
        # or resolve a namesake from a different tenant. make_token always
        # embeds {"sub", "tid"}; legacy tokens without tid take the safe
        # .limit(1) fallback — MultipleResultsFound can never escape.
        _stmt = select(User).where(User.username == sub)
        if tid is not None:
            _stmt = _stmt.where(User.tenant_id == tid)
        else:
            _stmt = _stmt.limit(1)
        user = (await db.execute(_stmt)).scalar_one_or_none()
        if not user or not user.tenant_id:
            await ws.close(code=4001, reason="Invalid tenant")
            return
        # v14-E2 (D6 #6-adjacent / auth parity): token VERSION check — the WS
        # handshake used to skip it entirely, so a token minted before the
        # user's token_ver was bumped (password change / admin reset) kept a
        # live socket for its full 24h lifetime. Mirrors routers/auth.py:78
        # (legacy tokens/DBs treat the column as 0 = accept).
        if int(payload.get("ver", 0) or 0) != int(getattr(user, "token_ver", 0) or 0):
            await ws.close(code=4001, reason="Token outdated — re-login required")
            return
        tenant = await db.get(Tenant, user.tenant_id)
        if not tenant or not tenant.is_active:
            await ws.close(code=4001, reason="Tenant inactive")
            return
        ws_tid = user.tenant_id  # authoritative from DB
    await ws_manager.connect(ws, tenant_id=ws_tid, user_id=user.id)
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text(json.dumps({"event": "pong"}))
            elif data == "stats":
                try:
                    async with AsyncSessionLocal() as db:
                        total = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == ws_tid)) or 0
                        today_date = utcnow().date()
                        today = await db.scalar(
                            select(func.count(Reply.id))
                            .where(Reply.tenant_id == ws_tid, cast(Reply.created_at, Date) == today_date)
                        ) or 0
                        await ws.send_text(json.dumps({
                            "event": "stats_update",
                            "data": {"total_replies": total, "today_replies": today}
                        }, default=str))
                except Exception as e:
                    # v12-E3.5 — was a bare `pass`: a failing stats query
                    # (e.g. DB outage) silently returned nothing to the client.
                    log.warning("WS stats query failed tenant=%s: %s", ws_tid, e, exc_info=True)
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception as e:
        # v12-E3.5 — non-disconnect WS failures were a bare silent discard
        # (no log, no Sentry event — an auth-adjacent or stats-query bug in
        # the receive loop simply vanished). Log with the full traceback and
        # capture, then keep the historical cleanup behavior.
        log.warning("WebSocket handler error tenant=%s: %s", ws_tid, e, exc_info=True)
        try:
            from _observability import capture_exception

            capture_exception(e)
        except Exception:
            pass
        ws_manager.disconnect(ws)


# ── Server-Sent Events ─────────────────────────────────────────────

async def sse_endpoint(request: Request, user: User = Depends(get_current_user)):
    """SSE endpoint: emits same events as WebSocket (stats_update, new_reply, bot_status, bot_health).

    SECURITY (v8-A2): subscribes with the authenticated user's tenant_id.
    The old global subscription (tenant_id=None) delivered EVERY queued
    event — including other tenants' customer names ("sender") and full AI
    agent replies — to any authenticated user. Tenant-scoped emits are now
    filtered by event_bus; only genuine platform-wide broadcasts
    (emit(tenant_id=None)) still reach everyone.
    """
    sub_tenant: int | None = user._tenant_id

    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        handlers = {}
        async def _make_handler(evt: str):
            async def _h(data, tenant_id: int | None = None):
                await queue.put({"event": evt, "data": data, "tenant_id": tenant_id})
            return _h
        for evt_name in ("stats_update", "bot_health", "agent_message"):
            h = await _make_handler(evt_name)
            handlers[evt_name] = h
            event_bus.subscribe(evt_name, h, tenant_id=sub_tenant)
        try:
            yield "data: {\"event\":\"connected\"}\n\n"
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=30)
                    payload = json.dumps(item, default=str)
                    yield f"data: {payload}\n\n"
                except TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            for evt_name, h in handlers.items():
                event_bus.unsubscribe(evt_name, h, tenant_id=sub_tenant)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
