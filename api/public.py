"""Public entrypoint — lightweight FastAPI app.
Serves: health, plans, config, env, debug, SPA, auth, webhooks.
Cold start ~0.3s on Vercel Free."""
from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import select, func
from database import engine, AsyncSessionLocal
from models import Base, Reply
from config import settings
from _utils import utcnow

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fb-public")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.connect() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.commit()
    yield
    await engine.dispose()


app = FastAPI(title="SmartBot Public", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Public routes ──
from routers import auth as auth_r
from routers import webhooks as webhook_r
app.include_router(auth_r.router)
app.include_router(webhook_r.router)


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.get("/api/plans")
async def list_plans():
    async with AsyncSessionLocal() as db:
        from models import SubscriptionPlan
        result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.sort_order)
        )
        plans = result.scalars().all()
        return [{
            "id": p.id, "name": p.name, "name_ar": p.name_ar,
            "price": float(p.price), "period_days": p.period_days,
            "max_replies": p.max_replies, "max_pages": p.max_pages,
            "max_rules": p.max_rules, "max_team": p.max_team,
            "has_dm": p.has_dm, "has_ai": p.has_ai, "has_broadcast": p.has_broadcast,
            "has_scheduling": p.has_scheduling, "has_reports": p.has_reports,
            "has_flows": p.has_flows, "has_offers": p.has_offers,
            "has_sequences": p.has_sequences, "has_analytics_advanced": p.has_analytics_advanced,
            "features": p.features,
        } for p in plans]


@app.get("/api/config")
async def public_config():
    async with AsyncSessionLocal() as db:
        from models import SystemConfig
        rows = await db.execute(select(SystemConfig))
        conf = {}
        for r in rows.scalars().all():
            if not r.is_secret:
                conf[r.key] = r.value
        return conf


@app.get("/api/env")
async def get_env():
    return {
        "version": "2.0.0",
        "bot_interval": settings.BOT_INTERVAL_SECONDS,
        "debug": settings.DEBUG,
        "has_fb_token": bool(settings.FACEBOOK_ACCESS_TOKEN),
    }


@app.get("/api/debug")
async def debug():
    return {
        "has_secret_key": bool(settings.SECRET_KEY),
        "has_db_url": bool(settings.DATABASE_URL),
        "has_fb_token": bool(settings.FACEBOOK_ACCESS_TOKEN),
        "has_fb_page": bool(settings.FACEBOOK_PAGE_ID),
        "debug_mode": settings.DEBUG,
        "bot_interval": settings.BOT_INTERVAL_SECONDS,
        "start_bot": settings.START_BOT,
    }


# ── SPA ──
from pathlib import Path
STATIC_DIR = Path(__file__).resolve().parent.parent / "fb_dashboard" / "static"
TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "fb_dashboard" / "templates"
_spa_html: str | None = None
_spa_mtime: float = 0


def _get_spa() -> str:
    global _spa_html, _spa_mtime
    src = STATIC_DIR / "index.html"
    if not src.exists():
        src = TEMPLATES_DIR / "index.html"
    if not src.exists():
        return "<h1>SmartBot</h1><p>Loading...</p>"
    try:
        mtime = src.stat().st_mtime
        if _spa_html is None or mtime > _spa_mtime:
            _spa_html = src.read_text(encoding="utf-8")
            _spa_mtime = mtime
    except Exception:
        pass
    return _spa_html or src.read_text(encoding="utf-8")


@app.get("/", response_class=HTMLResponse)
async def dashboard_page():
    return HTMLResponse(_get_spa())
