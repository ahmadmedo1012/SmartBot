"""Marketing campaigns — create, target, schedule, send, stats (plan §4.4).

Audiences:
  all      → every subscriber of the tenant
  active   → subscribers active in the last 30 days
  engaged  → subscribers with a reply/tag interaction
  new      → subscribers created in the last 14 days

Sending uses the tenant's subscriber base and records per-campaign stats
(sent/delivered/opened/clicked). Real message delivery goes through the
existing broadcast engine when a tenant FB client is configured; otherwise
the campaign is queued and stats reflect the queued audience size.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from _responses import ok
from _utils import iso_z, utcnow
from database import AsyncSessionLocal, get_db
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from models import MarketingCampaign, Subscriber, User
from sqlalchemy import desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from routers.auth import get_current_user, require_role
from routers.notifications import push_notification

log = logging.getLogger("fb-api")
router = APIRouter(prefix="/api/marketing", tags=["marketing"])

_AUDIENCES = {"all", "active", "engaged", "new"}


def _audience_filter(audience: str):
    """Audience segmentation over the real Subscriber schema
    (fb_user_id / last_interaction_at / reply_count / created_at)."""
    now = utcnow()
    if audience == "active":
        return Subscriber.last_interaction_at >= (now - timedelta(days=30))
    if audience == "engaged":
        return or_(Subscriber.reply_count > 0,
                   Subscriber.last_interaction_at >= (now - timedelta(days=30)))
    if audience == "new":
        return Subscriber.created_at >= (now - timedelta(days=14))
    return None  # all


@router.get("/campaigns")
async def list_campaigns(
    limit: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the tenant's campaigns with stats (plan §4.4 reports)."""
    q = select(MarketingCampaign).where(MarketingCampaign.tenant_id == current_user._tenant_id)
    q = q.order_by(desc(MarketingCampaign.created_at)).limit(limit)
    rows = await db.execute(q)
    total = await db.scalar(
        select(func.count(MarketingCampaign.id)).where(
            MarketingCampaign.tenant_id == current_user._tenant_id)
    ) or 0
    # v12-E2.12: ok() envelope with {items, total} — the campaign rows moved
    # from a bare array to data.items (the top-level `total` sibling is now
    # INSIDE data; frontend dual-shape guard shipped in the same round).
    return ok({
        "items": [
            {
                "id": c.id, "name": c.name, "message": c.message, "audience": c.audience,
                "status": c.status,
                "scheduled_at": iso_z(c.scheduled_at),
                "sent_count": c.sent_count, "delivered_count": c.delivered_count,
                "opened_count": c.opened_count, "clicked_count": c.clicked_count,
                "created_at": iso_z(c.created_at),
            } for c in rows.scalars().all()
        ],
        "total": total,
    })


@router.post("/campaigns")
async def create_campaign(
    payload: dict = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a campaign (plan §4.4 step 1: name + message + audience + schedule)."""
    name = (payload.get("name") or "").strip()
    message = (payload.get("message") or "").strip()
    audience = (payload.get("audience") or "all").strip().lower()
    scheduled_at = payload.get("scheduled_at")

    if len(name) < 2:
        raise HTTPException(400, "اسم الحملة مطلوب (حرفان على الأقل)")
    if len(message) < 5:
        raise HTTPException(400, "نص الرسالة قصير جداً")
    if audience not in _AUDIENCES:
        raise HTTPException(400, f"الجمهور يجب أن يكون إحدى: {', '.join(sorted(_AUDIENCES))}")

    status = "draft"
    sched = None
    if scheduled_at:
        try:
            from datetime import UTC, datetime
            sched = datetime.fromisoformat(str(scheduled_at))
            # v15-E3 (D1-M5): normalize aware timestamps to naive UTC — the
            # consumer's claim compares scheduled_at with naive utcnow(), and
            # on SQLite an unnormalized aware value stores with an offset
            # suffix that breaks the comparison. Past dates stay accepted:
            # they simply become due on the next sweep.
            if sched.tzinfo is not None:
                sched = sched.astimezone(UTC).replace(tzinfo=None)
            status = "scheduled"
        except ValueError:
            raise HTTPException(400, "تاريخ الجدولة غير صالح (ISO 8601)") from None

    c = MarketingCampaign(
        tenant_id=current_user._tenant_id,
        user_id=current_user.id,
        name=name[:150],
        message=message,
        audience=audience,
        status=status,
        scheduled_at=sched,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return ok({"id": c.id, "status": c.status})


@router.get("/audience-size")
async def audience_size(
    audience: str = Query("all"),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Preview how many subscribers a campaign would reach."""
    audience = audience.strip().lower()
    if audience not in _AUDIENCES:
        raise HTTPException(400, "جمهور غير صالح")
    q = select(func.count(Subscriber.id)).where(Subscriber.tenant_id == current_user._tenant_id)
    f = _audience_filter(audience)
    if f is not None:
        q = q.where(f)
    count = await db.scalar(q) or 0
    return ok({"audience": audience, "count": count})


@router.post("/campaigns/{campaign_id}/send")
async def send_campaign(
    campaign_id: int,
    db=Depends(get_db),
    current_user: User = Depends(require_role("editor")),
):
    """Send (or queue) a campaign now (plan §4.4 steps 2-3).

    v9-A7: sending is a WRITE action with cost side-effects (broadcast fan-out
    + notifications) — was open to any viewer role; now requires editor.
    v15-E3 (D1-H3): the dispatch core moved to :func:`_dispatch_campaign` so
    the scheduled-campaign consumer (``process_pending_campaigns``) runs the
    exact same path — manual and scheduled sends can no longer drift."""
    c = await db.get(MarketingCampaign, campaign_id)
    if not c or c.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "الحملة غير موجودة")
    if c.status in ("sent", "sending", "queued"):
        raise HTTPException(400, "الحملة أُرسلت مسبقاً")

    c.status = "sending"
    c.sent_at = utcnow()
    dispatched = await _dispatch_campaign(db, c, actor=current_user.username or "")
    if c.status == "sending":
        # v4 §3.8 — no connected page / dispatch unavailable → honest "queued"
        # (the audience is selected; delivery starts once a page is connected),
        # NOT fake "sent". "failed" is reserved for a dispatch that actually
        # ran and delivered to zero recipients.
        c.status = "queued"
        c.delivered_count = 0

    await push_notification(
        db, c.tenant_id,
        title=f"تم إرسال حملة '{c.name}'",
        body=f"وصلت إلى {c.delivered_count or 0} مشترك" + ("" if dispatched else " (في قائمة الانتظار)"),
        type_="marketing", link="/dashboard/marketing",
    )
    await db.commit()
    return ok({
        "id": c.id, "status": c.status, "sent_count": c.sent_count,
        "delivered_count": c.delivered_count or 0,
        "dispatched": dispatched,
    })


@router.get("/campaigns/{campaign_id}/stats")
async def campaign_stats(
    campaign_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delivery/open/click stats (plan §4.4 step 4)."""
    c = await db.get(MarketingCampaign, campaign_id)
    if not c or c.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "الحملة غير موجودة")
    return ok({
        "id": c.id, "status": c.status, "audience": c.audience,
        "sent": c.sent_count, "delivered": c.delivered_count,
        "opened": c.opened_count, "clicked": c.clicked_count,
        "sent_at": iso_z(c.sent_at),
    })


@router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: int,
    db=Depends(get_db),
    current_user: User = Depends(require_role("editor")),
):
    """v9-A7: destructive action — requires editor (was any viewer)."""
    c = await db.get(MarketingCampaign, campaign_id)
    if not c or c.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "الحملة غير موجودة")
    if c.status == "sending":
        raise HTTPException(400, "لا يمكن حذف حملة قيد الإرسال")
    await db.delete(c)
    await db.commit()
    return ok()


# ── v15-E3 (D1-H3): the scheduled-campaign consumer ──────────────────────────


async def _dispatch_campaign(db, c: MarketingCampaign, actor: str) -> bool:
    """Dispatch core shared by the manual send endpoint and the scheduled
    consumer (v15-E3 / D1-H3) — one path, no drift.

    v4 §3.8 (G7) semantics preserved: creates the tenant-scoped broadcast and
    runs it inline (the old code created a draft broadcast nothing consumed,
    and LIED with delivered_count = audience size before anything was sent).
    Sets ``c.status``/``c.sent_count``/``c.delivered_count``; returns True
    when a real fan-out ran.
    """
    q = select(Subscriber).where(Subscriber.tenant_id == c.tenant_id)
    f = _audience_filter(c.audience)
    if f is not None:
        q = q.where(f)
    rows = await db.execute(q)
    recipients = rows.scalars().all()
    c.sent_count = len(recipients)

    dispatched = False
    if recipients:
        try:
            from _services import broadcast_engine, get_tenant_fb_client
            from models import Broadcast
            fb_cli = await get_tenant_fb_client(c.tenant_id)
            if fb_cli is not None:
                b = Broadcast(
                    tenant_id=c.tenant_id,
                    name=f"campaign:{c.id}:{c.name[:120]}",
                    message_template=c.message,
                    status="draft",
                    segment_filters={"campaign_id": c.id, "audience": c.audience},
                    total_recipients=len(recipients),
                    created_by=actor,
                )
                db.add(b)
                await db.flush()
                broadcast_id = b.id
                await db.commit()
                # Run the real send (per-recipient status, honest counts).
                # v15-E3: broadcast_engine.send_broadcast claims draft→sending
                # atomically before fanning out, so a scheduled consumer
                # racing a manual send cannot double-deliver.
                async with AsyncSessionLocal() as s:
                    await broadcast_engine.send_broadcast(broadcast_id, s)
                async with AsyncSessionLocal() as s:
                    fresh = await s.get(Broadcast, broadcast_id)
                    c2 = await s.get(MarketingCampaign, c.id)
                    if fresh is not None and c2 is not None:
                        c2.delivered_count = fresh.sent_count or 0
                        c2.status = "sent" if (fresh.sent_count or 0) > 0 else "failed"
                        await s.commit()
                c.status = "sent"
                dispatched = True
                # refresh honest counts onto the ORM instance in this session
                fresh_b = await db.get(Broadcast, broadcast_id)
                if fresh_b is not None:
                    c.delivered_count = fresh_b.sent_count or 0
        except Exception as e:
            log.warning(f"campaign {c.id} dispatch deferred: {e}")
    return dispatched


async def _campaign_dispatched_push(db, c: MarketingCampaign, dispatched: bool) -> None:
    """Tenant notification after a dispatch attempt (manual or scheduled)."""
    try:
        await push_notification(
            db, c.tenant_id,
            title=f"تم إرسال حملة '{c.name}'",
            body=f"وصلت إلى {c.delivered_count or 0} مشترك" + ("" if dispatched else " (في قائمة الانتظار)"),
            type_="marketing", link="/dashboard/marketing",
        )
    except Exception:
        log.warning(f"campaign {c.id} push notification failed", exc_info=True)


async def process_pending_campaigns(session: AsyncSession) -> int:
    """Outbox consumer for scheduled marketing campaigns — v15-E3 / D1-H3.

    CONTRACT (v15 plan §2 — E1 calls it at the end of every bot cycle inside
    try/except, so a failure here never breaks the cycle)::

        async def process_pending_campaigns(session: AsyncSession) -> int

    Before v15 nothing consumed ``status='scheduled'`` — the campaign row
    rotted silently while the UI showed a "مجدولة" badge (D1-H3). Due
    campaigns (scheduled_at <= now) are now claimed ATOMICALLY —::

        UPDATE marketing_campaigns SET status='sending'
        WHERE status='scheduled' AND scheduled_at <= now RETURNING

    — the approvals.py v9-A8 pattern, so two overlapping cycles can never
    both dispatch the same campaign. Each claimed campaign is dispatched via
    :func:`_dispatch_campaign` (the exact manual-send path) and the tenant is
    notified. A campaign that cannot dispatch (no connected page) lands on
    'queued' — the same honest state the manual path uses; the manual send
    button remains the retry path once the page is connected.

    Returns the number of campaigns claimed this pass.
    """
    claimed = (await session.execute(
        update(MarketingCampaign)
        .where(MarketingCampaign.status == "scheduled",
               MarketingCampaign.scheduled_at <= utcnow())
        .values(status="sending")
        .returning(MarketingCampaign.id)
    )).scalars().all()
    if not claimed:
        return 0
    await session.commit()  # publish the claim before any slow fan-out

    for cid in claimed:
        try:
            c = await session.get(MarketingCampaign, cid)
            if c is None:
                continue
            c.sent_at = utcnow()
            dispatched = await _dispatch_campaign(session, c, actor="scheduler")
            if c.status == "sending":
                # no connected page / dispatch unavailable → honest "queued"
                c.status = "queued"
                c.delivered_count = 0
            await _campaign_dispatched_push(session, c, dispatched)
            await session.commit()
        except Exception as e:
            # one broken campaign must never poison the sweep
            log.exception(f"process_pending_campaigns: campaign {cid} failed: {e}")
            await session.rollback()
            try:
                c2 = await session.get(MarketingCampaign, cid)
                if c2 is not None and c2.status == "sending":
                    c2.status = "failed"
                    await session.commit()
            except Exception:
                log.exception(f"process_pending_campaigns: marking campaign {cid} failed did not work")
                await session.rollback()
    return len(claimed)
