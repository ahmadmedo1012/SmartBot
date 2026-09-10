from __future__ import annotations

import logging
from datetime import datetime, timedelta

from _responses import ok
from _services import fb, get_ai, get_tenant_fb_client, has_global_fb_credentials
from _utils import iso_z, utcnow
from api_cache import get_or_compute
from config import settings
from database import get_db
from fastapi import APIRouter, Depends, HTTPException
from models import BotLog, BotState, Conversation, Message, Reply, Rule, User
from sqlalchemy import Date, cast, desc, func, select

from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(prefix="", tags=["dashboard"])

# v15-E7 (D8-B3): per-tenant TTL bundle cache. The key embeds tenant_id (the
# D10 §8 warning: a path-keyed cache would leak one tenant's bundle to
# another). 60s matches the FE's dashboard polling cadence — the accepted
# staleness bound is one poll cycle; get_tenant_fb_client + all queries run
# at most once per window per tenant instead of once per request. The cache
# is cleared automatically at module boundaries by the root conftest and by
# v10_world teardown (both clear api_cache._cache_store / clear_all()).
_BUNDLE_CACHE_TTL = 60


def _trend_pct(current, prior) -> float:
    """Identical math to _services._get_trend_data (kept byte-for-byte in
    behavior; see _build_dashboard_bundle for why it now runs locally)."""
    current = current or 0
    prior = prior or 0
    if prior:
        return round((current - prior) / prior * 100, 1)
    return 100 if current else 0


def _day_expr(col, db):
    """Portable DATE truncation (v9-A1 pdf_reports_engine pattern).

    cast(col, Date) is correct on PostgreSQL, but SQLite's CAST(... AS DATE)
    applies NUMERIC affinity and mangles the stored ISO string — as a filter
    it silently mis-counts (today=0 with today's rows), and as an OUTPUT
    column SQLAlchemy's Date result processor raises TypeError on row fetch
    (the old chart query crashed on SQLite the moment any reply existed —
    invisible until v15-E7 tests seeded replies). func.date() is the correct
    SQLite spelling and yields 'YYYY-MM-DD'.
    """
    bind = getattr(db, "bind", None)
    if bind is not None and bind.dialect.name == "sqlite":
        return func.date(col)
    return cast(col, Date)


async def _build_dashboard_bundle(db, _tid: int) -> dict:
    """All bundle data, computed with the minimum number of round-trips.

    v15-E7 (D8-B3) — the router previously issued ~17 sequential queries +
    a live Graph fan_count call on EVERY dashboard load (the most-hit
    authenticated route, polled every 60s per open tab). Now:
      * 6 reply COUNTs (total/today + the 4 trend windows of
        _get_trend_data) → ONE conditional-count aggregation (the
        analytics_engine.get_dashboard_overview pattern);
      * 4 message COUNTs → 2 conditional-count aggregations (one per table);
      * fan_count + page_name snapshots → ONE BotState IN(...) query, and
        NO live Graph call for connected tenants — the heartbeat cron
        (routers/bot.py §2) refreshes fb_fan_count for every connected
        tenant each beat, and the connect flow writes it at connect time;
        the legacy env-credential fallback keeps its live call ONLY in the
        bootstrap single-tenant space (tenant 0 — v22-F2, was every
        unconnected tenant before: cross-tenant fan bleed);
      * 60s per-tenant response cache (see dashboard_bundle).
    """
    now = utcnow()
    today = now.date()
    today_start = datetime(now.year, now.month, now.day)
    yesterday_start = today_start - timedelta(days=1)
    week_start = now - timedelta(days=7)
    prior_week_start = now - timedelta(days=14)
    day_expr = _day_expr(Reply.created_at, db)

    # ── reply stats + trend: ONE aggregation (6 COUNTs → 1) ──
    stats_row = (await db.execute(
        select(
            func.count(Reply.id).label("total"),
            func.count(Reply.id).filter(day_expr == today).label("today"),
            func.count(Reply.id).filter(
                Reply.created_at >= today_start).label("t_today"),
            func.count(Reply.id).filter(
                Reply.created_at >= yesterday_start,
                Reply.created_at < today_start).label("t_yesterday"),
            func.count(Reply.id).filter(
                Reply.created_at >= week_start).label("t_week"),
            func.count(Reply.id).filter(
                Reply.created_at >= prior_week_start,
                Reply.created_at < week_start).label("t_prior_week"),
        ).where(Reply.tenant_id == _tid)
    )).one()
    total_replies = stats_row.total or 0
    today_replies = stats_row.today or 0
    trend = {
        "today": _trend_pct(stats_row.t_today, stats_row.t_yesterday),
        "week": _trend_pct(stats_row.t_week, stats_row.t_prior_week),
    }

    chart_rows = await db.execute(
        select(day_expr.label("d"), func.count(Reply.id))
        .where(Reply.tenant_id == _tid, Reply.created_at >= now - timedelta(days=7))
        .group_by(day_expr)
    )
    chart = {str(row[0]): row[1] for row in chart_rows if row[0]}

    # ── connection + fan/page identity: ONE BotState snapshot query ──
    # (was: get_tenant_fb_client + live Graph + 2 snapshot queries)
    snap = dict((await db.execute(
        select(BotState.key, BotState.value).where(
            BotState.tenant_id == _tid,
            BotState.key.in_(("fb_fan_count", "fb_page_name")))
    )).all())

    fan_count = None
    connected = False
    connection_error = ""
    try:
        tenant_fb = await get_tenant_fb_client(_tid)
        if tenant_fb is not None:
            # v15-E7 (D8-B3): connected tenant → snapshot ONLY. The old live
            # get_page_fan_count() sat in the critical path (100-600ms variable
            # latency per dashboard load); the heartbeat refreshes this value
            # for every connected tenant on each beat, so the snapshot is at
            # worst one beat old.
            connected = True
        elif _tid == 0 and has_global_fb_credentials():
            # v22-F2 (W1-D9) — cross-tenant bleed closed. The legacy
            # env-credential fallback is the BOOTSTRAP single-tenant space
            # (tenant 0) ONLY — the same gate agent_engine._get_fb(0) has
            # kept since v15 («tenant 0 مع اعتمادات env: عميل المنصة —
            # سلوك التوافق محفوظ عمداً»). Production carries global env
            # credentials for the OWNER's page, so the old unconditional
            # fallback served the owner's fan_count (5) + connected=true to
            # EVERY unconnected tenant (fresh t42, also t22) while
            # /api/analytics/overview honestly showed 0 — two different
            # KPIs for the same tenant on two dashboard pages. Real tenants
            # (tid ≠ 0) now derive fan_count/connected strictly from their
            # OWN BotState (snapshot above), same source as the analytics
            # overview — consistent everywhere.
            fan_count = await fb.get_page_fan_count()
            connected = True
    except Exception as e:
        connection_error = str(e)[:120]

    # v4 §3.7 — honest fallback: serve the stored connect-time/heartbeat
    # value; when nothing is stored yet, say so instead of a fake 0+healthy.
    snap_fans = snap.get("fb_fan_count") or ""
    if fan_count is None and snap_fans.isdigit():
        fan_count = int(snap_fans)
    if fan_count is None and connected:
        connection_error = connection_error or (
            "لا يوجد رقم معجبين محفوظ بعد — يظهر تلقائياً بعد أول تحديث للنبضة")
    fan_count = fan_count or 0
    page_name = snap.get("fb_page_name") or ""

    # ── message stats: 2 conditional-count aggregations (4 COUNTs → 2) ──
    try:
        conv_row = (await db.execute(
            select(
                func.count(Conversation.id).label("total"),
                func.count(Conversation.id).filter(
                    Conversation.unread_count > 0).label("unread"),
            ).where(Conversation.tenant_id == _tid)
        )).one()
        msg_row = (await db.execute(
            select(
                func.count(Message.id).label("total"),
                func.count(Message.id).filter(
                    Message.replied_by_bot.is_(True)).label("bot"),
            ).where(Message.tenant_id == _tid)
        )).one()
        total_conversations = conv_row.total or 0
        unread_messages = conv_row.unread or 0
        total_messages = msg_row.total or 0
        bot_message_replies = msg_row.bot or 0
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
    # v15-E7 (D8-X1): consume the result ONCE. The old code called
    # .scalars().all() twice on the SAME Result — SQLAlchemy 2.0 exhausts
    # the cursor on the first call, so the second (recent_replies payload)
    # was ALWAYS [] and the «آخر الردود» card on the main dashboard showed
    # "لا توجد ردود بعد" forever, while recent_activity (consumed first)
    # kept working.
    recent_replies_list = recent_replies_rows.scalars().all()
    activities = []
    for r in recent_replies_list:
        activities.append({
            "type": "reply", "text": f"رد على {r.commenter_name}",
            "detail": r.reply_text[:60], "time": iso_z(r.created_at),
        })
    for lg in recent_logs_rows.scalars().all():
        activities.append({
            "type": "log", "level": lg.level, "text": lg.message[:100],
            "detail": "", "time": iso_z(lg.created_at),
        })
    activities.sort(key=lambda a: a.get("time", ""), reverse=True)
    activities = activities[:8]

    recent_replies = [{
        "id": r.id, "commenter_name": r.commenter_name, "comment_text": r.comment_text,
        "reply_text": r.reply_text, "fb_comment_id": r.fb_comment_id, "rule_id": r.rule_id,
        "created_at": iso_z(r.created_at),
    } for r in recent_replies_list[:5]]

    return {
        "stats": {
            "total_replies": total_replies,
            "today_replies": today_replies,
            "fan_count": fan_count,
            "top_rule_id": int(top[0]) if top and top[0] is not None else None,
            "chart": chart,
            "trend": trend,
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
    }


@router.get("/api/dashboard/bundle")
async def dashboard_bundle(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Returns ALL dashboard data in one request. Reduces 7 API calls -> 1.

    v15-E7 (D8-B3): the whole payload is cached 60s per tenant (the FE polls
    at the same cadence — staleness bound is one poll cycle). Cache hits skip
    every query; the factory runs under a per-key singleflight lock.
    """
    _tid = current_user._tenant_id
    try:
        payload = await get_or_compute(
            f"v15:dashboard-bundle:tenant:{_tid}",
            _BUNDLE_CACHE_TTL,
            lambda: _build_dashboard_bundle(db, _tid),
        )
        return ok(payload)
    except Exception:
        log.exception("dashboard_bundle error")
        raise HTTPException(status_code=500, detail="تعذر حساب إحصاءات لوحة البيانات — حاول لاحقاً") from None


# v12-E2.8: GET /api/stats + GET /api/stats/hourly REMOVED — dead legacy
# routes (superseded by /api/dashboard/bundle; D4 consumer map: zero
# frontend/e2e/test callers). The live system stats live at /api/system/stats.


@router.get("/api/system/stats")
async def get_system_stats(db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    # Tenant-scoped: an admin only sees their own tenant's stats.
    # Platform-wide stats require the SUPER_ADMIN role (out of scope here).
    _tid = current_user._tenant_id or 0
    total_users = await db.scalar(select(func.count(User.id)).where(User.tenant_id == _tid)) or 0
    total_tenants = 1 if _tid else 0
    total_replies = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid)) or 0
    today = utcnow().date()
    # v15-E7: portable DATE filter (the old bare cast() silently mis-counted
    # on SQLite — see _day_expr) — same numeric contract on both dialects.
    today_replies = await db.scalar(
        select(func.count(Reply.id)).where(
            Reply.tenant_id == _tid, _day_expr(Reply.created_at, db) == today)
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
    # v12-E2.9: mechanical ok() rename — byte-identical shape to the raw dict.
    return ok({
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
    })


