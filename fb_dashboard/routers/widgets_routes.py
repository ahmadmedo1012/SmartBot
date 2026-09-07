# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from datetime import timedelta

from _responses import ok
from _services import get_ai, log
from _utils import iso_z, utcnow
from database import get_db
from fastapi import APIRouter, Depends, Query
from models import AISuggestion, BotLog, Reply, ReplyTemplate, Rule, User
from sqlalchemy import desc, func, select

from routers.auth import get_current_user

router = APIRouter(prefix="", tags=["widgets"])


@router.get("/api/widgets/recent-activity")
async def widget_recent_activity(limit: int = Query(10, ge=1, le=100), db=Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    """Recent activity timeline for the dashboard.

    v12-E2.7: bounded limit (was a bare default 10 — unbounded from client)."""
    _tid = current_user._tenant_id
    recent_replies = await db.execute(
        select(Reply).where(Reply.tenant_id == _tid).order_by(desc(Reply.created_at)).limit(limit)
    )
    recent_logs = await db.execute(
        select(BotLog).where(BotLog.tenant_id == _tid).order_by(desc(BotLog.created_at)).limit(limit)
    )
    activities = []
    for r in recent_replies.scalars().all():
        activities.append({
            "type": "reply", "text": f"رد على {r.commenter_name}",
            "detail": r.reply_text[:60], "time": iso_z(r.created_at),
        })
    for lg in recent_logs.scalars().all():
        activities.append({
            "type": "log", "level": lg.level, "text": lg.message[:100],
            "detail": "", "time": iso_z(lg.created_at),
        })
    activities.sort(key=lambda a: a.get("time", ""), reverse=True)
    return ok(activities[:limit])


@router.get("/api/widgets/ai-insights")
async def widget_ai_insights(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Dashboard widget: AI status & quick stats with template count."""
    ai = get_ai()
    rows = await db.execute(select(func.count(ReplyTemplate.id)).where(ReplyTemplate.tenant_id == current_user._tenant_id))
    template_count = rows.scalar() or 0
    return ok(
        {
        "ai_available": ai.available,
        "ai_provider": ai.provider_name,
        "template_count": template_count,
    }
    )


@router.get("/api/widgets/response-time")
async def widget_response_time(days: int = Query(7), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Average response time (mock — FB doesn't return timing, so we use reply count by hour as proxy)."""
    _tid = current_user._tenant_id
    cutoff = utcnow() - timedelta(days=days)
    row = await db.execute(
        select(func.count(Reply.id).label("cnt"))
        .where(Reply.tenant_id == _tid, Reply.created_at >= cutoff)
    )
    total = row.scalar() or 0
    return ok(
        {
        "total_replies": total,
        "period_days": days,
        "avg_per_day": round(total / max(days, 1), 1),
    }
    )


@router.get("/api/widgets/sentiment-trend")
async def widget_sentiment_trend(days: int = Query(7), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Sentiment distribution over time."""
    _tid = current_user._tenant_id
    from sqlalchemy import Date
    from sqlalchemy import cast as sql_cast
    cutoff = utcnow() - timedelta(days=days)
    rows = await db.execute(
        select(AISuggestion.sentiment, sql_cast(AISuggestion.created_at, Date).label("d"), func.count(AISuggestion.id))
        .where(AISuggestion.tenant_id == _tid, AISuggestion.created_at >= cutoff)
        .group_by(AISuggestion.sentiment, sql_cast(AISuggestion.created_at, Date))
        .order_by(sql_cast(AISuggestion.created_at, Date))
    )
    trend = {}
    for row in rows:
        d = str(row.d)
        if d not in trend:
            trend[d] = {}
        trend[d][row.sentiment or "محايد"] = row.count
    return ok({"trend": trend})


@router.get("/api/widgets/top-keywords")
async def widget_top_keywords(limit: int = Query(10), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Most triggered rules (keywords proxy)."""
    _tid = current_user._tenant_id
    try:
        agg_rows = await db.execute(
            select(Reply.rule_id, func.count(Reply.id).label("cnt"))
            .where(Reply.tenant_id == _tid, Reply.rule_id.isnot(None))
            .group_by(Reply.rule_id).order_by(desc("cnt")).limit(limit)
        )
        top = agg_rows.all()
        if not top:
            return ok([])
        rule_ids = [r.rule_id for r in top if r.rule_id is not None]
        rules_map = {}
        if rule_ids:
            rule_rows = await db.execute(select(Rule).where(Rule.tenant_id == _tid, Rule.id.in_(rule_ids)))
            for r in rule_rows.scalars().all():
                rules_map[r.id] = r
        count_map = {r.rule_id: r.cnt for r in top}
        return ok(
            [{
            "rule_id": rid,
            "rule_name": rules_map[rid].name if rid in rules_map else f"#{rid}",
            "count": count_map.get(rid, 0),
            "keywords": (rules_map[rid].keywords or [])[:3] if rid in rules_map else [],
        } for rid in rule_ids if rid]
        )
    except Exception as e:
        log.error(f"widget_top_keywords failed: {e}", exc_info=True)
        return ok([])
