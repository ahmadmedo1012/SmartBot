from __future__ import annotations
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, desc, cast, Date, text

from _utils import utcnow
from config import settings
from database import get_db
from models import Reply, Rule, BotLog, User, Tenant
from routers.auth import get_current_user, require_role
from _services import fb, get_ai, _get_trend_data, _track_event

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

        fan_count = 0
        try:
            fan_count = await fb.get_page_fan_count()
        except Exception:
            pass

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
                "detail": r.reply_text[:60], "time": r.created_at.isoformat() if r.created_at else None,
            })
        for l in recent_logs_rows.scalars().all():
            activities.append({
                "type": "log", "level": l.level, "text": l.message[:100],
                "detail": "", "time": l.created_at.isoformat() if l.created_at else None,
            })
        activities.sort(key=lambda a: a.get("time", ""), reverse=True)
        activities = activities[:8]

        recent_replies = [{
            "id": r.id, "commenter_name": r.commenter_name, "comment_text": r.comment_text,
            "reply_text": r.reply_text, "fb_comment_id": r.fb_comment_id, "rule_id": r.rule_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in recent_replies_rows.scalars().all()[:5]]

        return {
            "stats": {
                "total_replies": total_replies,
                "today_replies": today_replies,
                "fan_count": fan_count,
                "top_rule_id": int(top[0]) if top and top[0] is not None else None,
                "chart": chart,
                "trend": await _get_trend_data(db, _tid),
            },
            "rules": rules,
            "rules_count": rules_count,
            "active_rules_count": active_rules_count,
            "bot_status": {"running": running, "interval": settings.BOT_INTERVAL_SECONDS},
            "ai_status": {"available": ai.available, "provider": ai.provider_name},
            "recent_activity": activities,
            "recent_replies": recent_replies,
        }
    except Exception as e:
        log.error(f"dashboard_bundle error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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

    fan_count = 0
    try:
        fan_count = await fb.get_page_fan_count()
    except Exception:
        pass

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
        "top_rule_id": int(top[0]) if top and top[0] is not None else None,
        "reply_chart": chart_data,
    }}


@router.get("/api/system/stats")
async def get_system_stats(db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    total_users = await db.scalar(select(func.count(User.id))) or 0
    total_tenants = await db.scalar(select(func.count(Tenant.id))) or 0
    total_replies = await db.scalar(select(func.count(Reply.id))) or 0
    today = utcnow().date()
    today_replies = await db.scalar(
        select(func.count(Reply.id)).where(cast(Reply.created_at, Date) == today)
    ) or 0
    active_pages = await db.scalar(
        select(func.count(Tenant.id)).where(Tenant.is_active == True)
    ) or 0
    return {"success": True, "data": {
        "totalUsers": total_users,
        "totalTenants": total_tenants,
        "totalReplies": total_replies,
        "todayReplies": today_replies,
        "activePages": active_pages,
        "totalRevenue": 0,
        "userGrowthPct": 0,
        "revenueTrend": [],
        "recentSignups": [],
        "recentLogins": [],
    }}


@router.get("/api/stats/hourly")
async def get_hourly_stats(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    cutoff = utcnow() - timedelta(days=7)
    rows = await db.execute(
        select(func.extract("hour", Reply.created_at).label("hour"), func.count(Reply.id).label("count"))
        .where(Reply.tenant_id == _tid, Reply.created_at >= cutoff)
        .group_by(text("hour")).order_by(text("hour"))
    )
    return [{"hour": int(r.hour), "count": r.count} for r in rows]
