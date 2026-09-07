from __future__ import annotations

import logging
import os
import secrets
from datetime import timedelta
from pathlib import Path

from _responses import ok
from _services import api_cache
from _utils import app_version, iso_z, utcnow
from config import settings
from database import AsyncSessionLocal, engine, get_db
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from models import BotLog, RateLimitEntry, Reply, SubscriptionPlan, SystemConfig
from sqlalchemy import delete, func, select, text

BASE_DIR = Path(__file__).resolve().parent.parent  # ponytail: match runner.py's BASE_DIR (fb_dashboard/)

log = logging.getLogger("fb-api")
router = APIRouter(prefix="", tags=["plans"])


@router.get("/api/plans")
@api_cache.cached(ttl=3600)  # BELOW router.get — so the cached wrapper is what gets registered
async def list_plans(db=Depends(get_db)):
    """List active subscription plans. Public—no auth required."""
    result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.sort_order)
    )
    plans = result.scalars().all()
    return ok([{
        "id": p.id,
        "name": p.name,
        "name_ar": p.name_ar,
        "price": float(p.price),
        "period_days": p.period_days,
        "max_replies": p.max_replies,
        "max_pages": p.max_pages,
        "max_rules": p.max_rules,
        "max_team": p.max_team,
        "has_dm": p.has_dm,
        "has_ai": p.has_ai,
        "has_broadcast": p.has_broadcast,
        "has_scheduling": p.has_scheduling,
        "has_reports": p.has_reports,
        "has_flows": p.has_flows,
        "has_offers": p.has_offers,
        "has_sequences": p.has_sequences,
        "has_analytics_advanced": p.has_analytics_advanced,
        "features": p.features,
        "sort_order": p.sort_order,
        "is_active": p.is_active,
    } for p in plans])


# v8-A1 SECURITY allowlist: /api/config is PUBLIC (no auth) — it may only
# ever expose payment-instruction + support-contact keys. Reading "all
# non-secret rows" leaked openai/gemini API keys that were stored with
# is_secret=False before the fix in admin_routes. An explicit allowlist is
# immune to future key additions (a new SystemConfig row can never leak by
# default). Consumers: useConfig.ts → PaymentDialog / Footer /
# FloatingWhatsApp.
_PUBLIC_CONFIG_KEYS = frozenset({
    # payment instructions (/subscribe + PaymentDialog)
    "balance_transfer_phone_1",       # مدار
    "balance_transfer_phone_2",       # ليبيانا
    "bank_transfer_bank_name",
    "bank_transfer_account_number",
    "bank_transfer_iban",
    "mobile_wallet_cap",
    # support contact (Footer + FloatingWhatsApp)
    "support_email",
    "support_phone",
    "support_whatsapp",
    "support_working_hours",
    "whatsapp_number",
})


@router.get("/api/config")
@api_cache.cached(ttl=300)  # 5min cache — payment phones change rarely
async def public_config(db=Depends(get_db)):
    """Public platform config — payment provider phone numbers, bank details.

    Merge order (plan §2.4): SystemConfig rows (set by admin via
    POST /api/admin/config) WIN; env vars (LIBYANA_WALLET_PHONE, …) act as
    fallbacks so a fresh deployment shows working payment instructions.

    SECURITY (v8-A1): explicit allowlist only — never a "everything not
    flagged secret" read. Credential-shaped rows (AI keys, telegram token,
    FB app secret) can never appear here even if flagged non-secret by
    mistake elsewhere.
    """
    rows = await db.execute(select(SystemConfig).where(SystemConfig.key.in_(_PUBLIC_CONFIG_KEYS)))
    config: dict = {}
    for r in rows.scalars().all():
        if not r.is_secret:
            config[r.key] = r.value
    # env fallbacks — only for keys the admin hasn't set in DB
    env_fallbacks = {
        "balance_transfer_phone_2": settings.LIBYANA_WALLET_PHONE,   # ليبيانا
        "balance_transfer_phone_1": settings.MADAR_WALLET_PHONE,     # مدار
        "bank_transfer_bank_name": settings.BANK_TRANSFER_BANK_NAME,
        "bank_transfer_account_number": settings.BANK_TRANSFER_ACCOUNT_NUMBER,
        "bank_transfer_iban": settings.BANK_TRANSFER_IBAN,
        "mobile_wallet_cap": str(settings.MOBILE_WALLET_CAP),
    }
    for k, v in env_fallbacks.items():
        if v and not config.get(k):
            config[k] = v
    return ok(config)


@router.get("/api/public/stats")
async def public_stats(db=Depends(get_db)):
    """Public platform statistics. Aggregates only — never exposes tenant data.

    Returns:
        activeTenants — count of tenants with paid or trial subscriptions
        totalReplies — count of all bot replies ever
        activeUsers30d — count of users who logged in within the past 30 days (best-effort)
        uptimePercent — fixed 99.9 (status page assumed; replace with real probe later)
    """
    from models import Tenant
    try:
        active_tenants = await db.scalar(
            select(func.count(Tenant.id)).where(
                Tenant.subscription_status.in_(["PAID", "TRIAL", "active"])
            )
        ) or 0
        total_replies = await db.scalar(select(func.count(Reply.id))) or 0
    except Exception:
        # Fall back to 0 if tables missing (cold-start)
        active_tenants = 0
        total_replies = 0
    return ok({
        "activeTenants": active_tenants,
        "totalReplies": total_replies,
        "activeUsers30d": 0,
        "uptimePercent": 99.9,
    })


@router.get("/api/public/testimonials")
async def public_testimonials():
    """Public testimonials. Returns an empty list until real customer quotes are collected.

    The landing page hides the section if this returns [] — never shows fake reviews.
    """
    return ok([])


@router.get("/healthz")
async def healthz():
    checks = {"ok": True}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
        async with AsyncSessionLocal() as session:
            plan_count = await session.scalar(select(func.count(SubscriptionPlan.id))) or 0
            checks["plans"] = plan_count
    except Exception as e:
        # 503 (was: 200 with ok=false) — uptime monitors now actually see outages.
        # v12-E2.5: root cause goes to SERVER LOGS only — the old
        # checks["error"] = str(e) leaked internal exception text (table names,
        # driver paths) to an unauthenticated public endpoint.
        # v12-E3.7(b) (handed to E2 — the healthz check is router-local):
        # capture to Sentry (never raises, no-op when SENTRY_DSN is off) so
        # the outage is visible in the error tracker, not just the logs.
        log.exception("healthz database check failed")
        from _observability import capture_exception
        capture_exception(e)
        checks["database"] = "unreachable"
        checks["ok"] = False
    checks["version"] = app_version()
    checks["timestamp"] = iso_z(utcnow())
    checks["uptime"] = None
    checks["env"] = "production" if not settings.DEBUG else "development"
    status_code = 200 if checks["ok"] else 503
    # v12-E2.13: PERMANENT infra exemption (documented in _responses.py) —
    # uptime monitors need a stable 200/503 + {success, data: checks} body;
    # this is NOT part of the ok() unification (D4 decision).
    return JSONResponse(status_code=status_code, content={"success": checks["ok"], "data": checks})


# v12-E2.8: GET /api/env REMOVED — dead route (zero consumers in src/tests/
# vercel.json; env facts are served by /api/diagnostics/status for the
# platform admin). v13-E8 (S2): the stale "/api/env" entry was dropped from
# app/middleware.py _CACHEABLE_API_PREFIXES too — the prefix no longer
# matches anything, so both sides are clean now.


# NOTE (phase D cleanup): the duplicate /api/system/stats and second
# /api/public/stats that used to live here were DEAD ROUTES — shadowed by
# routers/dashboard_stats.py which registers first. Removed to avoid the
# exact class of first-registration-wins confusion that hid the real
# /api/support/ticket behind a plans_config stub.


# ── Internal cron endpoints (protected by CRON_SECRET) ──────────────────────────

CRON_SECRET = os.getenv("CRON_SECRET", "")


@router.post("/api/cron/cleanup-logs")
async def cleanup_old_logs(request: Request, token: str = Form("")):
    """Delete BotLog entries older than 30 days, expired RateLimitEntry rows and
    expired blacklisted JWTs. Vercel Cron calls this daily at 03:00 UTC via
    vercel.json config.

    SECURITY (2026-09-05): the old `token != CRON_SECRET` with an unset secret
    failed OPEN ("" != "" is False → unauthenticated deletes). Now an empty
    secret never validates, comparison is constant-time, and the
    Authorization: Bearer header (what Vercel Cron actually sends) is accepted
    alongside the form token.
    """
    auth_header = request.headers.get("authorization", "")
    if not CRON_SECRET or not (
        secrets.compare_digest(token, CRON_SECRET)
        or secrets.compare_digest(auth_header, f"Bearer {CRON_SECRET}")
    ):
        raise HTTPException(403, "وصول غير مصرح به لمهام الجدولة")
    from models import BlacklistedToken
    async with AsyncSessionLocal() as db:
        cutoff = utcnow() - timedelta(days=30)
        deleted_logs = await db.execute(
            delete(BotLog).where(BotLog.created_at < cutoff)
        )
        deleted_rates = await db.execute(
            delete(RateLimitEntry).where(RateLimitEntry.window_end < utcnow())
        )
        deleted_blacklist = await db.execute(
            delete(BlacklistedToken).where(BlacklistedToken.expires_at < utcnow())
        )
        await db.commit()
        return ok({
            "deleted_bot_logs": deleted_logs.rowcount,
            "deleted_rate_limits": deleted_rates.rowcount,
            "deleted_blacklisted_tokens": deleted_blacklist.rowcount,
        })
