"""Server-Sent Events stream for subscription payment status.

v13-L4: split out of the former 594-line ``routers/payments.py`` monolith —
endpoint body moved VERBATIM. This is the documented byte-stream exception
to the ok() envelope contract (see the routers package docstring).
"""
import logging

from database import AsyncSessionLocal
from fastapi import APIRouter, Depends, Query
from models import SubscriptionPayment, User

from routers.auth import get_current_user

log = logging.getLogger("fb-api")
router = APIRouter(tags=["payments"])

# ── SSE: instant activation push (latest_plan.md Track B.5) ──────────────────
# The admin's approval activates the subscription server-side immediately; this
# stream pushes the status change to the waiting browser the moment it happens
# (≤2s) instead of relying on 5s polling. Frontend uses EventSource with the
# poll endpoint as automatic fallback when SSE is unavailable.
_SSE_POLL_SECONDS = 2
_SSE_MAX_LIFETIME = 600  # 10 min cap — subscription approvals never take longer


@router.get("/api/subscriptions/status-stream")
async def subscription_status_stream(payment_id: int = Query(...), current_user: User = Depends(get_current_user)):
    """Server-Sent Events stream for a payment's status (Track B.5).

    Events:
      data: {"id", "status", "plan_id", "plan_name"}   — on connect and on change
      event: close                                      — terminal status or lifetime cap
    """
    import asyncio as _asyncio
    import json as _json
    import time as _time

    from fastapi.responses import StreamingResponse

    async def event_gen():
        deadline = _time.monotonic() + _SSE_MAX_LIFETIME
        last_status: str | None = None
        while _time.monotonic() < deadline:
            try:
                async with AsyncSessionLocal() as sdb:
                    sp = await sdb.get(SubscriptionPayment, payment_id)
                if not sp or (sp.user_id != current_user.id and sp.tenant_id != (current_user._tenant_id or 0)):
                    yield f"event: error\ndata: {_json.dumps({'error': 'الدفعة غير موجودة'})}\n\n"
                    return  # tenant-isolation identical to the poll endpoint
                if sp.status != last_status:
                    last_status = sp.status
                    payload = {"id": sp.id, "status": sp.status, "plan_id": sp.plan_id, "plan_name": sp.plan_name}
                    yield f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"
                    if sp.status in ("verified", "rejected", "EXPIRED_TRIAL"):
                        yield "event: close\ndata: {}\n\n"
                        return
            except Exception:
                log.warning("SSE poll failed for payment %s", payment_id, exc_info=True)
            await _asyncio.sleep(_SSE_POLL_SECONDS)
        yield "event: close\ndata: {}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
