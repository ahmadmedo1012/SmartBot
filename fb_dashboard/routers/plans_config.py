from __future__ import annotations
import os
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import select, func, text

from config import settings
from database import engine, AsyncSessionLocal, get_db
from models import SubscriptionPlan, SystemConfig, Reply, Rule, User
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
    return [{
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
    } for p in plans]


@router.get("/api/config")
async def public_config(db=Depends(get_db)):
    """Public platform config — payment provider phone numbers etc."""
    rows = await db.execute(select(SystemConfig))
    config = {}
    for r in rows.scalars().all():
        if not r.is_secret:
            config[r.key] = r.value
    return config


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
    return checks


@router.get("/api/env")
async def get_env(_=Depends(get_current_user)):
    version = "2.0.0"
    vf = BASE_DIR / "VERSION"
    if vf.exists():
        version = vf.read_text().strip()
    return {
        "version": version,
        "db_type": "sqlite" if not settings.DATABASE_URL else "postgres",
        "bot_interval": settings.BOT_INTERVAL_SECONDS,
        "debug": settings.DEBUG,
        "has_fb_token": bool(settings.FACEBOOK_ACCESS_TOKEN),
        "webhook_url": (os.getenv("RENDER_EXTERNAL_URL") or os.getenv("VERCEL_URL") or "") + "/webhook",
    }


@router.get("/api/system/stats")
async def get_system_stats(db=Depends(get_db), _=Depends(get_current_user)):
    version = "2.0.0"
    vf = BASE_DIR / "VERSION"
    if vf.exists():
        version = vf.read_text().strip()
    reply_count = await db.scalar(select(func.count(Reply.id))) or 0
    rule_count = await db.scalar(select(func.count(Rule.id))) or 0
    user_count = await db.scalar(select(func.count(User.id))) or 0
    db_size = "—"
    try:
        if not settings.DATABASE_URL:
            row = await db.execute(text("SELECT page_count * page_size FROM pragma_page_count, pragma_page_size"))
        else:
            row = await db.execute(text("SELECT pg_database_size(current_database())"))
        val = row.scalar()
        if val:
            db_size = f"{val/1024/1024:.1f} MB" if val >= 1024*1024 else f"{val/1024:.1f} KB" if val >= 1024 else f"{val} bytes"
    except Exception:
        pass
    return {"version": version, "reply_count": reply_count, "rule_count": rule_count, "user_count": user_count, "db_size": db_size}
