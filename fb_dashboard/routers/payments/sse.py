"""Server-Sent Events stream for subscription payment status.

v13-L4: split out of the former 594-line ``routers/payments.py`` monolith —
endpoint body moved VERBATIM. This is the documented byte-stream exception
to the ok() envelope contract (see the routers package docstring).

v14-E2 (D6 §SSE / D5-M): TWO structural fixes —
1. ONE db session per connection (was: a fresh session every 2s poll for up
   to 10 minutes — connection churn per idle browser tab). The session is
   rolled back between polls so the pooled connection is released while
   sleeping and instances are expired → every poll still reads FRESH rows.
2. Per-tenant concurrent stream cap (5) — a runaway tab farm could hold an
   unbounded number of 10-minute streams. The 6th+ stream gets a 429; the
   frontend EventSource ``onerror`` falls back to the documented poll
   endpoint (Track B.5 design), so nothing breaks for the user.
"""
import logging

from database import AsyncSessionLocal
from fastapi import APIRouter, Depends, HTTPException, Query
from models import SubscriptionPayment, User

from routers.auth import get_current_user

log = logging.getLogger("fb-api")
router = APIRouter(tags=["payments"])

# ── SSE: instant activation push (latest_plan.md Track B.5) ──────────────────
# The admin's approval activates the subscription server-side immediately; this
# stream pushes the status change to the waiting browser the moment it happens
# (≤2s) instead of relying on 5s polling. Frontend uses EventSource with the
# poll endpoint as automatic fallback when SSE is unavailable (also on 429).
_SSE_POLL_SECONDS = 2
_SSE_MAX_LIFETIME = 600  # 10 min cap — subscription approvals never take longer
_SSE_MAX_PER_TENANT = 5  # v14-E2: concurrent streams per tenant (tab-farm guard)

# v14-E2: tenant_id → live stream count. Route + generator run on the same
# event loop, and check→increment has no await between them (atomic).
_sse_tenant_counts: dict[int, int] = {}


@router.get("/api/subscriptions/status-stream")
async def subscription_status_stream(payment_id: int = Query(...),
                                     current_user: User = Depends(get_current_user)):
    """Server-Sent Events stream for a payment's status (Track B.5).

    Events:
      data: {"id", "status", "plan_id", "plan_name"}   — on connect and on change
      event: close                                      — terminal status or lifetime cap
    """
    import asyncio as _asyncio
    import json as _json
    import time as _time

    from fastapi.responses import StreamingResponse

    # v14-E2: per-tenant concurrent cap BEFORE any session is opened.
    _tid = current_user._tenant_id or 0
    if _sse_tenant_counts.get(_tid, 0) >= _SSE_MAX_PER_TENANT:
        # Transport-level refusal (documented exception): EventSource fires
        # onerror and the payment page falls back to polling.
        raise HTTPException(429, "عدد كبير من الاتصالات المباشرة — تم التحويل إلى التحديث الدوري")
    _sse_tenant_counts[_tid] = _sse_tenant_counts.get(_tid, 0) + 1

    async def event_gen():
        try:
            deadline = _time.monotonic() + _SSE_MAX_LIFETIME
            last_status: str | None = None
            # v14-E2: ONE session for the whole connection. rollback() after
            # each poll (a) releases the pooled connection while sleeping and
            # (b) expires all loaded instances → the next ``get`` re-reads the
            # row from the DB (fresh status, no identity-map staleness).
            async with AsyncSessionLocal() as sdb:
                while _time.monotonic() < deadline:
                    try:
                        sp = await sdb.get(SubscriptionPayment, payment_id)
                        if not sp or (sp.user_id != current_user.id
                                      and sp.tenant_id != (current_user._tenant_id or 0)):
                            yield f"event: error\ndata: {_json.dumps({'error': 'الدفعة غير موجودة'})}\n\n"
                            return  # tenant-isolation identical to the poll endpoint
                        if sp.status != last_status:
                            last_status = sp.status
                            payload = {"id": sp.id, "status": sp.status,
                                       "plan_id": sp.plan_id, "plan_name": sp.plan_name}
                            yield f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"
                            if sp.status in ("verified", "rejected", "EXPIRED_TRIAL"):
                                yield "event: close\ndata: {}\n\n"
                                return
                    except Exception:
                        log.warning("SSE poll failed for payment %s", payment_id, exc_info=True)
                    finally:
                        try:
                            await sdb.rollback()
                        except Exception:
                            pass
                    await _asyncio.sleep(_SSE_POLL_SECONDS)
            yield "event: close\ndata: {}\n\n"
        finally:
            remaining = _sse_tenant_counts.get(_tid, 1) - 1
            if remaining > 0:
                _sse_tenant_counts[_tid] = remaining
            else:
                _sse_tenant_counts.pop(_tid, None)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
