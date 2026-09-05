from __future__ import annotations
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, desc, cast, Date, text

from _utils import utcnow, iso_z
from config import settings
from _responses import ok
from database import get_db
from models import Reply, Rule, BotLog, User, Tenant, Conversation, Message
from routers.auth import get_current_user, require_role
from _services import fb, get_ai, get_tenant_fb_client, _get_trend_data, _track_event

log = logging.getLogger("fb-api")
router = APIRouter(prefix="", tags=["dashboard"])


@router.get("/api/dashboard/bundle")
async def dashboard_bundle(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Returns ALL dashboard data in one request. Reduces 7 API calls -> 1."""
    _tid = current_user._tenant_id
    try:
        now = utcnow()
        today = now.date()

        total_replies = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid)) or 0
        today_replies = await db.scalar(
            select(func.count(Reply.id)).where(Reply.tenant_id == _tid, cast(Reply.created_at, Date) == today)
        ) or 0

        chart_rows = await db.execute(
            select(cast(Reply.created_at, Date).label("d"), func.count(Reply.id))
            .where(Reply.tenant_id == _tid, Reply.created_at >= now - timedelta(days=7))
            .group_by(cast(Reply.created_at, Date))
        )
        chart = {str(row[0]): row[1] for row in chart_rows if row[0]}

        fan_count = None
        page_name = ""
        connected = False
        connection_error = ""
        try:
            tenant_fb = await get_tenant_fb_client(_tid)
            if tenant_fb is not None:
                connected = True
                fan_count = await tenant_fb.get_page_fan_count()  # None on failure (v4 §3.7)
            else:
                # legacy single-tenant env fallback (bootstrap mode only)
                fan_count = await fb.get_page_fan_count()
                connected = bool(fan_count) or bool(settings.FACEBOOK_ACCESS_TOKEN and settings.FACEBOOK_PAGE_ID)
        except Exception as e:
            connection_error = str(e)[:120]

        # v4 §3.7 — snapshot fallback: a failed/expired token previously showed
        # fan_count=0 with a healthy "connected" badge. Serve the stored
        # connect-time value and surface the error text instead.
        if fan_count is None and connected:
            connection_error = connection_error or "تعذر جلب عدد المعجبين — يُعرض آخر رقم محفوظ"
        try:
            from models import BotState as _BS
            _snap = await db.execute(
                select(_BS).where(_BS.tenant_id == _tid, _BS.key == "fb_fan_count"))
            _sbs = _snap.scalar_one_or_none()
            if _sbs and (_sbs.value or "").isdigit():
                fan_count = int(_sbs.value) if fan_count is None else fan_count
        except Exception:
            pass
        fan_count = fan_count or 0

        # Page identity from the connect snapshot (no live call — plan v3 §4.5)
        try:
            from models import BotState
            row = await db.execute(
                select(BotState).where(
                    BotState.tenant_id == _tid, BotState.key == "fb_page_name"))
            bs = row.scalar_one_or_none()
            page_name = (bs.value or "") if bs else ""
        except Exception:
            page_name = ""

        # Message stats (persisted Messenger data — plan v3 §4.2)
        try:
            total_conversations = await db.scalar(
                select(func.count(Conversation.id)).where(Conversation.tenant_id == _tid)) or 0
            total_messages = await db.scalar(
                select(func.count(Message.id)).where(Message.tenant_id == _tid)) or 0
            unread_messages = await db.scalar(
                select(func.count(Conversation.id)).where(
                    Conversation.tenant_id == _tid,
                    Conversation.unread_count > 0,
                )) or 0
            bot_message_replies = await db.scalar(
                select(func.count(Message.id)).where(
                    Message.tenant_id == _tid, Message.replied_by_bot.is_(True),
                )) or 0
        except Exception:
            total_conversations = total_messages = unread_messages = bot_message_replies = 0

        top = None
        try:
            stmt = select(Reply.rule_id, func.count(Reply.id).label("cnt")).where(Reply.tenant_id == _tid).group_by(Reply.rule_id).order_by(desc("cnt")).limit(1)
            top = (await db.execute(stmt)).first()
        except Exception:
            pass

        rule_rows = await db.execute(select(Rule).where(Rule.tenant_id == _tid))
        all_rules = rule_rows.scalars().all()
        rules = [{"id": r.id, "name": r.name, "enabled": r.enabled} for r in all_rules]
        rules_count = len(all_rules)
        active_rules_count = sum(1 for r in all_rules if r.enabled)

        from runner import _bot_task as _bt
        running = _bt is not None and not _bt.done()
        ai = get_ai()

        recent_replies_rows = await db.execute(
            select(Reply).where(Reply.tenant_id == _tid).order_by(desc(Reply.created_at)).limit(8)
        )
        recent_logs_rows = await db.execute(
            select(BotLog).where(BotLog.tenant_id == _tid).order_by(desc(BotLog.created_at)).limit(8)
        )
        activities = []
        for r in recent_replies_rows.scalars().all():
            activities.append({
                "type": "reply", "text": f"رد على {r.commenter_name}",
                "detail": r.reply_text[:60], "time": iso_z(r.created_at),
            })
        for l in recent_logs_rows.scalars().all():
            activities.append({
                "type": "log", "level": l.level, "text": l.message[:100],
                "detail": "", "time": iso_z(l.created_at),
            })
        activities.sort(key=lambda a: a.get("time", ""), reverse=True)
        activities = activities[:8]

        recent_replies = [{
            "id": r.id, "commenter_name": r.commenter_name, "comment_text": r.comment_text,
            "reply_text": r.reply_text, "fb_comment_id": r.fb_comment_id, "rule_id": r.rule_id,
            "created_at": iso_z(r.created_at),
        } for r in recent_replies_rows.scalars().all()[:5]]

        return ok({
            "stats": {
                "total_replies": total_replies,
                "today_replies": today_replies,
                "fan_count": fan_count,
                "top_rule_id": int(top[0]) if top and top[0] is not None else None,
                "chart": chart,
                "trend": await _get_trend_data(db, _tid),
            },
            "connection": {
                "connected": connected,
                "page_name": page_name,
                "error": connection_error,
            },
            "messages": {
                "total_conversations": total_conversations,
                "total_messages": total_messages,
                "unread_conversations": unread_messages,
                "bot_replies": bot_message_replies,
            },
            "rules": rules,
            "rules_count": rules_count,
            "active_rules_count": active_rules_count,
            "bot_status": {"running": running, "interval": settings.BOT_INTERVAL_SECONDS},
            "ai_status": {"available": ai.available, "provider": ai.provider_name},
            "recent_activity": activities,
            "recent_replies": recent_replies,
        })
    except Exception as e:
        log.error("dashboard_bundle error", exc_info=True)
        raise HTTPException(status_code=500, detail="تعذر حساب إحصاءات لوحة البيانات — حاول لاحقاً")


@router.get("/api/stats")
async def get_stats(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    total_replies = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid)) or 0
    today = utcnow().date()
    today_replies = await db.scalar(
        select(func.count(Reply.id)).where(Reply.tenant_id == _tid, cast(Reply.created_at, Date) == today)
    ) or 0

    top = None
    try:
        stmt = select(Reply.rule_id, func.count(Reply.id).label("cnt")).where(Reply.tenant_id == _tid).group_by(Reply.rule_id).order_by(desc("cnt")).limit(1)
        top = (await db.execute(stmt)).first()
    except Exception:
        pass

    fan_count = None
    connected = False
    try:
        tenant_fb = await get_tenant_fb_client(_tid)
        if tenant_fb is not None:
            connected = True
            fan_count = await tenant_fb.get_page_fan_count()  # None on failure (v4 §3.7)
        else:
            fan_count = await fb.get_page_fan_count()
    except Exception:
        fan_count = None
    if fan_count is None:
        try:
            from models import BotState as _BS
            _snap = await db.execute(
                select(_BS).where(_BS.tenant_id == _tid, _BS.key == "fb_fan_count"))
            _sbs = _snap.scalar_one_or_none()
            if _sbs and (_sbs.value or "").isdigit():
                fan_count = int(_sbs.value)
        except Exception:
            pass
    fan_count = fan_count or 0

    chart_data = {}
    try:
        rows = await db.execute(
            select(cast(Reply.created_at, Date).label("d"), func.count(Reply.id))
            .where(Reply.tenant_id == _tid, Reply.created_at >= utcnow() - timedelta(days=7))
            .group_by(cast(Reply.created_at, Date))
        )
        chart_data = {str(row[0]): row[1] for row in rows if row[0]}
    except Exception:
        pass

    return {"success": True, "data": {
        "total_replies": total_replies,
        "today_replies": today_replies,
        "total_fan_count": fan_count,
        "connected": connected,
        "top_rule_id": int(top[0]) if top and top[0] is not None else None,
        "reply_chart": chart_data,
    }}


@router.get("/api/system/stats")
async def get_system_stats(db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    # Tenant-scoped: an admin only sees their own tenant's stats.
    # Platform-wide stats require the SUPER_ADMIN role (out of scope here).
    _tid = current_user._tenant_id or 0
    total_users = await db.scalar(select(func.count(User.id)).where(User.tenant_id == _tid)) or 0
    total_tenants = 1 if _tid else 0
    total_replies = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid)) or 0
    today = utcnow().date()
    today_replies = await db.scalar(
        select(func.count(Reply.id)).where(Reply.tenant_id == _tid, cast(Reply.created_at, Date) == today)
    ) or 0
    active_pages = 1 if _tid else 0
    # v4 §7.27 — real revenue from confirmed PaymentRequests (was a literal 0)
    from models import PaymentRequest as _PR
    total_revenue = float(await db.scalar(
        select(func.coalesce(func.sum(_PR.amount), 0)).where(
            _PR.tenant_id == _tid, _PR.status == "confirmed"
        )
    ) or 0)
    recent_signups = [
        {"username": u.username, "created_at": iso_z(u.created_at)}
        for u in (await db.execute(
            select(User).where(User.tenant_id == _tid)
            .order_by(desc(User.created_at)).limit(5)
        )).scalars().all()
    ]
    return {"success": True, "data": {
        "totalUsers": total_users,
        "totalTenants": total_tenants,
        "totalReplies": total_replies,
        "todayReplies": today_replies,
        "activePages": active_pages,
        "totalRevenue": total_revenue,
        "userGrowthPct": 0,
        "revenueTrend": [],
        "recentSignups": recent_signups,
        "recentLogins": [],
    }}


@router.get("/api/stats/hourly")
async def get_hourly_stats(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    cutoff = utcnow() - timedelta(days=7)
    hour_label = func.extract("hour", Reply.created_at).label("h")
    rows = await db.execute(
        select(hour_label, func.count(Reply.id).label("count"))
        .where(Reply.tenant_id == _tid, Reply.created_at >= cutoff)
        .group_by(hour_label).order_by(hour_label)
    )
    return {"success": True, "data": [{"hour": int(r.h), "count": r.count} for r in rows]}
