# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations
"""Analytics routes."""
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select, func, desc, cast, Date, text

from _utils import utcnow, iso_z
from database import get_db
from models import Reply, User, AISuggestion, ScheduledPost, Rule, Message
from routers.auth import get_current_user, require_role
from _responses import ok

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

    # Top rules — v4 §7.24: with NAMES (the old query returned rule_id only;
    # the UI showed raw ids) and now including Messenger DM replies
    # (Message.rule_id) so rules that answer DMs finally appear.
    top_rules_rows = await db.execute(
        select(Reply.rule_id, func.count(Reply.id).label("cnt"))
        .where(Reply.tenant_id == _tid, Reply.created_at >= cutoff)
        .group_by(Reply.rule_id).order_by(desc("cnt")).limit(10)
    )
    counts: dict[int, int] = {}
    for r in top_rules_rows:
        if r[0] is not None:
            counts[int(r[0])] = r[1]
    dm_rows = await db.execute(
        select(Message.rule_id, func.count(Message.id).label("cnt"))
        .where(
            Message.tenant_id == _tid, Message.rule_id.isnot(None),
            Message.is_from_page == True, Message.created_at >= cutoff,
        )
        .group_by(Message.rule_id)
    )
    for r in dm_rows:
        counts[int(r[0])] = counts.get(int(r[0]), 0) + r[1]
    rule_name_rows = await db.execute(
        select(Rule.id, Rule.name).where(Rule.tenant_id == _tid)
    ) if counts else []
    rule_names = {row[0]: row[1] for row in rule_name_rows} if counts else {}
    top_rules = sorted(
        [{"rule_id": rid, "name": rule_names.get(rid) or f"قاعدة #{rid}", "count": cnt}
         for rid, cnt in counts.items()],
        key=lambda x: x["count"], reverse=True,
    )[:10]

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

    # v4 §3.11 — tenant's page client (was the GLOBAL env client → the
    # analytics/audience fan KPIs were permanently 0 in production),
    # with the stored connect-time snapshot as an honest fallback.
    fan_count = None
    try:
        from _services import get_tenant_fb_client
        tenant_fb = await get_tenant_fb_client(_tid)
        if tenant_fb is not None:
            fan_count = await tenant_fb.get_page_fan_count()
    except Exception:
        fan_count = None
    if fan_count is None:
        try:
            from models import BotState
            snap = await db.execute(
                select(BotState).where(
                    BotState.tenant_id == _tid, BotState.key == "fb_fan_count"))
            bs = snap.scalar_one_or_none()
            fan_count = int(bs.value) if bs and (bs.value or "").isdigit() else 0
        except Exception:
            fan_count = 0

    return ok(
        {
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
    )


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
        "fb_comment_id": r.fb_comment_id, "created_at": iso_z(r.created_at),
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
    from _services import fb as _fb
    from _services import _publisher

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
    return ok({"published": published})


@router.get("/api/analytics/dashboard")
async def analytics_dashboard(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import analytics_engine
    return ok(await analytics_engine.get_dashboard_overview(days, db, tenant_id=current_user._tenant_id))


@router.get("/api/analytics/daily-trend")
async def analytics_daily_trend(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import analytics_engine
    return ok(await analytics_engine.get_daily_trend(days, db, tenant_id=current_user._tenant_id))


@router.get("/api/analytics/hourly-heatmap")
async def analytics_hourly_heatmap(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import analytics_engine
    return ok(await analytics_engine.get_hourly_heatmap(days, db, tenant_id=current_user._tenant_id))


@router.get("/api/analytics/top-rules")
async def analytics_top_rules(days: int = Query(30), limit: int = Query(10), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import analytics_engine
    return ok(await analytics_engine.get_top_rules(days, limit, db, tenant_id=current_user._tenant_id))


@router.get("/api/analytics/sentiment-trend")
async def analytics_sentiment_trend(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import analytics_engine
    return ok(await analytics_engine.get_sentiment_trend(days, db, tenant_id=current_user._tenant_id))


@router.get("/api/analytics/peak-hour")
async def analytics_peak_hour(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import analytics_engine
    peak = await analytics_engine.get_peak_hour(days, db, tenant_id=current_user._tenant_id)
    return ok({"peak_hour": peak})


@router.get("/api/analytics/top-commenters")
async def analytics_top_commenters(days: int = Query(30), limit: int = Query(10), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import analytics_engine
    return ok(await analytics_engine.get_top_commenters(days, limit, db, tenant_id=current_user._tenant_id))


@router.get("/api/analytics/period-comparison")
async def analytics_period_comparison(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    from _services import analytics_engine
    return ok(await analytics_engine.get_period_comparison(days, db, tenant_id=current_user._tenant_id))
