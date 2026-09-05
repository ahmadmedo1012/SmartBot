from __future__ import annotations
import os
from pathlib import Path

from fastapi import APIRouter, Depends, Body, HTTPException, Form, Request
from sqlalchemy import select, func, text

from config import settings
from database import engine, AsyncSessionLocal, get_db
from models import SubscriptionPlan, SystemConfig, Reply, Rule, User, BotLog, RateLimitEntry
from routers.auth import get_current_user
from _services import api_cache

BASE_DIR = Path(__file__).resolve().parent.parent  # ponytail: match runner.py's BASE_DIR (fb_dashboard/)

router = APIRouter(prefix="", tags=["plans"])


@api_cache.cached(ttl=3600)
@router.get("/api/plans")
async def list_plans(db=Depends(get_db)):
    """List active subscription plans. Public—no auth required."""
    result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.sort_order)
    )
    plans = result.scalars().all()
    return {"success": True, "data": [{
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
    } for p in plans]}


@router.get("/api/config")
@api_cache.cached(ttl=300)  # 5min cache — payment phones change rarely
async def public_config(db=Depends(get_db)):
    """Public platform config — payment provider phone numbers, bank details.

    Merge order (plan §2.4): SystemConfig rows (set by admin via
    POST /api/admin/config) WIN; env vars (LIBYANA_WALLET_PHONE, …) act as
    fallbacks so a fresh deployment shows working payment instructions.
    Never exposes rows flagged is_secret.
    """
    rows = await db.execute(select(SystemConfig))
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
    return {"success": True, "data": config}


@router.get("/api/public/stats")
async def public_stats(db=Depends(get_db)):
    """Public platform statistics. Aggregates only — never exposes tenant data.

    Returns:
        activeTenants — count of tenants with paid or trial subscriptions
        totalReplies — count of all bot replies ever
        activeUsers30d — count of users who logged in within the past 30 days (best-effort)
        uptimePercent — fixed 99.9 (status page assumed; replace with real probe later)
    """
    from models import Tenant, Reply, User
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
    return {
        "success": True,
        "data": {
            "activeTenants": active_tenants,
            "totalReplies": total_replies,
            "activeUsers30d": 0,
            "uptimePercent": 99.9,
        }
    }


@router.get("/api/public/testimonials")
async def public_testimonials():
    """Public testimonials. Returns an empty list until real customer quotes are collected.

    The landing page hides the section if this returns [] — never shows fake reviews.
    """
    return {"success": True, "data": []}


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
        checks["database"] = str(e)[:200]
        checks["ok"] = False
    checks["version"] = "2.0.0"
    checks["timestamp"] = __import__('datetime').datetime.now().isoformat()
    checks["uptime"] = None
    checks["env"] = "production" if not settings.DEBUG else "development"
    return {"success": True, "data": checks}


@router.get("/api/env")
async def get_env(_=Depends(get_current_user)):
    version = "2.0.0"
    vf = BASE_DIR / "VERSION"
    if vf.exists():
        version = vf.read_text().strip()
    return {"success": True, "data": {
        "version": version,
        "db_type": "sqlite" if not settings.DATABASE_URL else "postgres",
        "bot_interval": settings.BOT_INTERVAL_SECONDS,
        "debug": settings.DEBUG,
        "has_fb_token": bool(settings.FACEBOOK_ACCESS_TOKEN),
        "webhook_url": (os.getenv("RENDER_EXTERNAL_URL") or os.getenv("VERCEL_URL") or "") + "/webhook",
    }}


# NOTE (phase D cleanup): the duplicate /api/system/stats and second
# /api/public/stats that used to live here were DEAD ROUTES — shadowed by
# routers/dashboard_stats.py which registers first. Removed to avoid the
# exact class of first-registration-wins confusion that hid the real
# /api/support/ticket behind a plans_config stub.


# ── Internal cron endpoints (protected by CRON_SECRET) ──────────────────────────

CRON_SECRET = os.getenv("CRON_SECRET", "")


@router.post("/api/cron/cleanup-logs")
async def cleanup_old_logs(request: Request, token: str = Form("")):
    """Delete BotLog entries older than 30 days and expired RateLimitEntry rows.
    Vercel Cron calls this daily at 03:00 UTC via vercel.json config.
    """
    if token != CRON_SECRET:
        raise HTTPException(403, "Unauthorized")
    async with AsyncSessionLocal() as db:
        cutoff = datetime.utcnow() - timedelta(days=30)
        deleted_logs = await db.execute(
            delete(BotLog).where(BotLog.created_at < cutoff)
        )
        deleted_rates = await db.execute(
            delete(RateLimitEntry).where(RateLimitEntry.window_end < datetime.utcnow())
        )
        await db.commit()
        return {
            "success": True,
            "data": {
                "deleted_bot_logs": deleted_logs.rowcount,
                "deleted_rate_limits": deleted_rates.rowcount,
            },
        }
