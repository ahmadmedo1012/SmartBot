from __future__ import annotations
"""Analytics routes."""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select, func, desc, cast, Date, text

from _utils import utcnow
from database import get_db
from models import Reply, User, AISuggestion, ScheduledPost
from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["analytics"])


@router.get("/api/analytics/overview")
async def analytics_overview(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Aggregated analytics overview."""
    _tid = current_user._tenant_id
    cutoff = utcnow() - timedelta(days=days)

    total_replies = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid, Reply.created_at >= cutoff)) or 0
    today_replies = await db.scalar(
        select(func.count(Reply.id)).where(Reply.tenant_id == _tid, cast(Reply.created_at, Date) == utcnow().date())
    ) or 0

    # Daily breakdown
    daily_rows = await db.execute(
        select(cast(Reply.created_at, Date).label("d"), func.count(Reply.id).label("cnt"))
        .where(Reply.tenant_id == _tid, Reply.created_at >= cutoff)
        .group_by(cast(Reply.created_at, Date)).order_by(cast(Reply.created_at, Date))
    )
    daily = {str(row[0]): row[1] for row in daily_rows if row[0]}

    # Hourly heatmap data
    hourly_rows = await db.execute(
        select(func.extract("hour", Reply.created_at).label("h"),
               cast(Reply.created_at, Date).label("d"),
               func.count(Reply.id).label("cnt"))
        .where(Reply.tenant_id == _tid, Reply.created_at >= cutoff)
        .group_by(text("h"), cast(Reply.created_at, Date))
    )
    heatmap = {}
    for row in hourly_rows:
        h = int(row.h); d = str(row.d)
        if d not in heatmap: heatmap[d] = {}
        heatmap[d][h] = row.cnt

    # Top rules
    top_rules_rows = await db.execute(
        select(Reply.rule_id, func.count(Reply.id).label("cnt"))
        .where(Reply.tenant_id == _tid, Reply.created_at >= cutoff)
        .group_by(Reply.rule_id).order_by(desc("cnt")).limit(10)
    )
    top_rules = [{"rule_id": int(r[0]), "count": r[1]} for r in top_rules_rows if r[0] is not None]

    # Sentiment distribution (from AI suggestions if available)
    sentiment = {}
    try:
        sent_rows = await db.execute(
            select(AISuggestion.sentiment, func.count(AISuggestion.id))
            .where(AISuggestion.tenant_id == _tid, AISuggestion.created_at >= cutoff)
            .group_by(AISuggestion.sentiment)
        )
        sentiment = {row[0]: row[1] for row in sent_rows}
    except Exception:
        pass

    # Peak hour
    peak_hour_rows = await db.execute(
        select(func.extract("hour", Reply.created_at).label("h"),
               func.count(Reply.id).label("cnt"))
        .where(Reply.tenant_id == _tid, Reply.created_at >= cutoff)
        .group_by(text("h")).order_by(desc("cnt")).limit(1)
    )
    peak_hour = peak_hour_rows.first()
    peak = int(peak_hour.h) if peak_hour else None

    fan_count = 0
    try:
        from runner import fb as _fb
        fan_count = await _fb.get_page_fan_count()
    except Exception:
        pass

    return {
        "total_replies": total_replies,
        "today_replies": today_replies,
        "daily_breakdown": daily,
        "hourly_heatmap": heatmap,
        "top_rules": top_rules,
        "sentiment_distribution": sentiment,
        "peak_hour": peak,
        "fan_count": fan_count,
        "date_range_days": days,
    }


@router.get("/api/analytics/export")
async def analytics_export(format: str = Query("csv"), days: int = Query(30),
                           db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """Export replies as CSV or JSON."""
    _tid = current_user._tenant_id
    cutoff = utcnow() - timedelta(days=days)
    rows = await db.execute(
        select(Reply).where(Reply.tenant_id == _tid, Reply.created_at >= cutoff).order_by(desc(Reply.created_at))
    )
    items = [{
        "id": r.id, "commenter": r.commenter_name, "comment": r.comment_text,
        "reply": r.reply_text, "rule_id": r.rule_id,
        "fb_comment_id": r.fb_comment_id, "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows.scalars().all()]

    if format == "json":
        return JSONResponse(items)

    # CSV
    import csv, io
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "commenter", "comment", "reply", "rule_id", "fb_comment_id", "created_at"])
    for it in items:
        w.writerow([it["id"], it["commenter"], it["comment"], it["reply"], it["rule_id"], it["fb_comment_id"], it["created_at"]])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=replies-export-{utcnow().date()}.csv"})


@router.get("/api/analytics/scheduler-check")
async def analytics_scheduler_check(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Check and publish overdue scheduled posts."""
    from runner import fb as _fb
    from runner import _publisher

    _tid = current_user._tenant_id
    now = utcnow()
    due = await db.execute(
        select(ScheduledPost).where(
            ScheduledPost.tenant_id == _tid,
            ScheduledPost.status == "scheduled",
            ScheduledPost.scheduled_at <= now,
        )
    )
    published = 0
    for post in due.scalars().all():
        platform = getattr(post, "platform", "facebook") or "facebook"
        if platform == "facebook":
            result = await _fb.post_to_page(post.message)
        else:
            _publisher.load_credentials(db, tenant_id=_tid)
            result = await _publisher.publish_to_platform(platform, post.message, post.image_url)
        if result:
            post.status = "published"
            post.fb_post_id = result.get("post_id", "")
            post.published_at = now
            published += 1
    await db.commit()
    return {"published": published}


@router.get("/api/analytics/dashboard")
async def analytics_dashboard(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from runner import analytics_engine
    return await analytics_engine.get_dashboard_overview(days, db, tenant_id=current_user._tenant_id)


@router.get("/api/analytics/daily-trend")
async def analytics_daily_trend(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from runner import analytics_engine
    return await analytics_engine.get_daily_trend(days, db, tenant_id=current_user._tenant_id)


@router.get("/api/analytics/hourly-heatmap")
async def analytics_hourly_heatmap(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from runner import analytics_engine
    return await analytics_engine.get_hourly_heatmap(days, db, tenant_id=current_user._tenant_id)


@router.get("/api/analytics/top-rules")
async def analytics_top_rules(days: int = Query(30), limit: int = Query(10), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from runner import analytics_engine
    return await analytics_engine.get_top_rules(days, limit, db, tenant_id=current_user._tenant_id)


@router.get("/api/analytics/sentiment-trend")
async def analytics_sentiment_trend(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from runner import analytics_engine
    return await analytics_engine.get_sentiment_trend(days, db, tenant_id=current_user._tenant_id)


@router.get("/api/analytics/peak-hour")
async def analytics_peak_hour(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from runner import analytics_engine
    peak = await analytics_engine.get_peak_hour(days, db, tenant_id=current_user._tenant_id)
    return {"peak_hour": peak}


@router.get("/api/analytics/top-commenters")
async def analytics_top_commenters(days: int = Query(30), limit: int = Query(10), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from runner import analytics_engine
    return await analytics_engine.get_top_commenters(days, limit, db, tenant_id=current_user._tenant_id)


@router.get("/api/analytics/period-comparison")
async def analytics_period_comparison(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from runner import analytics_engine
    return await analytics_engine.get_period_comparison(days, db, tenant_id=current_user._tenant_id)
