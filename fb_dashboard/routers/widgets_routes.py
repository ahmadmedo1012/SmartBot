from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, desc
from _utils import utcnow
from datetime import datetime, timedelta
from config import settings
from database import get_db
from models import Reply, BotLog, AISuggestion, Rule, ReplyTemplate, User
from routers.auth import get_current_user
from _services import log, get_ai

router = APIRouter(prefix="", tags=["widgets"])


@router.get("/api/widgets/recent-activity")
async def widget_recent_activity(limit: int = Query(10), db=Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    """Recent activity timeline for the dashboard."""
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
            "detail": r.reply_text[:60], "time": r.created_at.isoformat() if r.created_at else None,
        })
    for l in recent_logs.scalars().all():
        activities.append({
            "type": "log", "level": l.level, "text": l.message[:100],
            "detail": "", "time": l.created_at.isoformat() if l.created_at else None,
        })
    activities.sort(key=lambda a: a.get("time", ""), reverse=True)
    return activities[:limit]


@router.get("/api/widgets/ai-insights")
async def widget_ai_insights(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Dashboard widget: AI status & quick stats with template count."""
    ai = get_ai()
    rows = await db.execute(select(func.count(ReplyTemplate.id)).where(ReplyTemplate.tenant_id == current_user._tenant_id))
    template_count = rows.scalar() or 0
    return {
        "ai_available": ai.available,
        "ai_provider": ai.provider_name,
        "template_count": template_count,
    }


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
    return {
        "total_replies": total,
        "period_days": days,
        "avg_per_day": round(total / max(days, 1), 1),
    }


@router.get("/api/widgets/sentiment-trend")
async def widget_sentiment_trend(days: int = Query(7), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Sentiment distribution over time."""
    _tid = current_user._tenant_id
    from sqlalchemy import cast as sql_cast, Date
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
        if d not in trend: trend[d] = {}
        trend[d][row.sentiment or "محايد"] = row.count
    return {"trend": trend}


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
            return []
        rule_ids = [r.rule_id for r in top if r.rule_id is not None]
        rules_map = {}
        if rule_ids:
            rule_rows = await db.execute(select(Rule).where(Rule.tenant_id == _tid, Rule.id.in_(rule_ids)))
            for r in rule_rows.scalars().all():
                rules_map[r.id] = r
        count_map = {r.rule_id: r.cnt for r in top}
        return [{
            "rule_id": rid,
            "rule_name": rules_map[rid].name if rid in rules_map else f"#{rid}",
            "count": count_map.get(rid, 0),
            "keywords": (rules_map[rid].keywords or [])[:3] if rid in rules_map else [],
        } for rid in rule_ids if rid]
    except Exception as e:
        log.error(f"widget_top_keywords failed: {e}")
        return []
