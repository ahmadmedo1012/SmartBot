from __future__ import annotations
import asyncio
import hashlib
import time
import hmac
import json
import logging
import os
import re
import secrets
from datetime import datetime, timedelta
from _utils import utcnow
from pathlib import Path
from contextlib import asynccontextmanager
# ponytail: Any unused but preserved for type annotation patterns

import jwt
from fastapi import FastAPI, Request, Depends, Query, HTTPException, Form, Body, Response, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, func, desc, cast, Date, text, or_, update

from _lazy import lazy
from telegram_bot import notify_admins_new_payment, notify_admins_new_subscription, send_message, edit_keyboard, edit_message, answer_callback

from config import settings
from database import engine, AsyncSessionLocal, get_db
from models import Base, Rule, Reply, BotLog, BotState, Tenant, User, ConversationNote, BlacklistedToken
from models import ReplyTemplate, AISuggestion, ConversationTag, ConversationLabel, ScheduledPost, AnalyticsEvent, BotAlert, Offer, OfferClaim, BrandConfig, Customer, Flow, FlowExecution
from models import Subscriber, Tag, SubscriberTag, Sequence, SequenceStep, SequenceSubscription, Broadcast, BroadcastRecipient, ConversationAssignee, ReportSchedule, PaymentRequest
from models import SubscriptionPlan, SubscriptionPayment, UsageCounter, SystemConfig
from bot import BotEngine
from ws_manager import ws_manager
from event_bus import event_bus
from logs_api import logs_router
from _crypto import encrypt_token, decrypt_token
from routers import auth as auth_router
from routers import payments as payments_router
from routers import users as users_router
from routers import rules as rules_router
from routers import replies as replies_router
from routers import webhooks as webhooks_router
from routers import analytics as analytics_router
from routers import inbox as inbox_router
from routers import bot as bot_router
from routers import diagnostics as diagnostics_router
from routers import ai as ai_router
from routers import flows as flows_router
from routers import sequences as sequences_router
from routers import broadcasts as broadcasts_router
from routers import admin_routes as admin_router
from routers import alerts_routes as alerts_router
from routers import brand_routes as brand_router
from routers import calendar_routes as calendar_router
from routers import commerce_routes as commerce_router
from routers import crm_routes as crm_router
from routers import dashboard_stats as dashboard_router
from routers import facebook_routes as facebook_router
from routers import health_alerts_routes as health_alerts_router
from routers import offers_routes as offers_router
from routers import plans_config as plans_router
from routers import publisher_routes as publisher_router
from routers import reports_routes as reports_router
from routers import scheduled_posts_routes as scheduled_router
from routers import subscribers_tags_routes as subscribers_router
from routers import team_routes as team_router
from routers import templates_routes as templates_router
from routers import widgets_routes as widgets_router

# Lazy AI import — single source of truth in _services.py
from _services import get_ai

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fb-api")

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
PARENT_DIR = BASE_DIR.parent

_bot_task: asyncio.Task | None = None

# ── Engine proxies: single source of truth in _services.py ──
from _services import (fb, sequence_engine, broadcast_engine, subscriber_engine,
    tag_engine, analytics_engine, report_engine, pdf_engine,
    content_calendar_engine, team_engine, commerce_engine, _publisher, api_cache)


# ── Request deduplication: serializes concurrent identical GETs → cache serves second ──
MAX_LOCKS = 1000
LOCK_TTL = 300  # seconds (5 min)
_dedup_locks: dict[str, tuple[asyncio.Lock, float]] = {}
_dedup_lock = asyncio.Lock()
_dedup_ops = 0


async def dedup_middleware(request: Request, call_next):
    if request.method != "GET":
        return await call_next(request)

    qp = dict(sorted(request.query_params.items())) if request.query_params else {}
    key = f"{request.method}:{request.url.path}?{json.dumps(qp, sort_keys=True)}"

    async with _dedup_lock:
        if key not in _dedup_locks:
            _dedup_locks[key] = (asyncio.Lock(), time.time())
        lock = _dedup_locks[key][0]

    async with lock:
        # ponytail: second concurrent caller will re-execute but hit the APICache if decorated
        response = await call_next(request)

    async with _dedup_lock:
        if key in _dedup_locks:
            del _dedup_locks[key]
        _maybe_evict()

    return response


def _maybe_evict():
    """Every 50 calls, purge expired entries; if still over limit, evict oldest."""
    global _dedup_ops
    _dedup_ops += 1
    if _dedup_ops < 50:
        return
    _dedup_ops = 0
    now = time.time()
    stale = [k for k, (_, ts) in _dedup_locks.items() if now - ts > LOCK_TTL]
    for k in stale:
        del _dedup_locks[k]
    # ponytail: LRU via sorted insertion order; if throughput matters replace with OrderedDict
    while len(_dedup_locks) > MAX_LOCKS:
        oldest = min(_dedup_locks, key=lambda k: _dedup_locks[k][1])
        del _dedup_locks[oldest]

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE = timedelta(hours=24)

# ponytail: detect Vercel to skip long-running background tasks
_IS_VERCEL = bool(os.getenv("VERCEL"))

# Import shared auth primitives from extracted router
from routers.auth import get_current_user, require_role, make_token, ACCESS_TOKEN_EXPIRE, ALGORITHM, ROLE_HIERARCHY

async def seed_admin(db):
    """Seed initial admin user from env vars if no users exist."""
    count = await db.scalar(select(func.count(User.id))) or 0
    if count > 0:
        return  # ponytail: users already exist — do not reset passwords
    username = os.environ.get("INITIAL_ADMIN_USERNAME", "admin")
    password = os.environ.get("INITIAL_ADMIN_PASSWORD", "admin")
    from _hash import hash_password
    pw_hash = hash_password(password)
    db.add(User(username=username, password_hash=pw_hash, role="admin"))
    await db.commit()
    log.info("Initial admin user seeded")


async def _seed_dm_templates(db):
    """Copy dm_template from JSON to DB rows where DB dm_template is empty."""
    json_path = (Path(__file__).resolve().parent / "facebook_automation.json")
    if not json_path.exists():
        return
    try:
        with open(json_path, encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return
    json_rules = {r.get("name", ""): r.get("dm_template", "") for r in data.get("rules", [])}
    if not json_rules:
        return
    # ponytail: local imports — already at module level, kept for clarity
    result = await db.execute(select(Rule))
    for rule in result.scalars().all():
        if not rule.dm_template and rule.name in json_rules:
            rule.dm_template = json_rules[rule.name]
    await db.commit()
    log.info("DM templates seeded from JSON")


async def _seed_subscription_plans(db):
    """Seed default subscription plans. Idempotent — skips if plans exist."""
    existing = await db.scalar(select(func.count(SubscriptionPlan.id))) or 0
    if existing > 0:
        return
    plans = [
        SubscriptionPlan(
            name="Free", name_ar="مجاني", price=0, period_days=30,
            max_replies=100, max_pages=1, max_rules=5, max_team=0,
            has_dm=False, has_ai=False, has_broadcast=False,
            has_scheduling=False, has_reports=False, has_flows=False,
            has_offers=False, has_sequences=False, has_analytics_advanced=False,
            sort_order=1, is_active=True,
            features=["ردود تلقائية (100/شهر)", "صفحة فيسبوك واحدة", "5 قواعد رد", "إحصائيات أساسية"],
        ),
        SubscriptionPlan(
            name="Basic", name_ar="أساسي", price=19, period_days=30,
            max_replies=2000, max_pages=1, max_rules=20, max_team=1,
            has_dm=True, has_ai=True, has_broadcast=False,
            has_scheduling=False, has_reports=True, has_flows=False,
            has_offers=False, has_sequences=False, has_analytics_advanced=False,
            sort_order=2, is_active=True,
            features=["2,000 رد/شهر", "صفحة فيسبوك واحدة", "20 قاعدة رد", "رد خاص على التعليقات",
                      "ردود ذكية بالذكاء الاصطناعي", "تقارير أسبوعية", "دعم فوري"],
        ),
        SubscriptionPlan(
            name="Premium", name_ar="مميز", price=29, period_days=30,
            max_replies=10000, max_pages=2, max_rules=50, max_team=2,
            has_dm=True, has_ai=True, has_broadcast=True,
            has_scheduling=True, has_reports=True, has_flows=True,
            has_offers=True, has_sequences=False, has_analytics_advanced=True,
            sort_order=3, is_active=True,
            features=["10,000 رد/شهر", "صفحتين فيسبوك", "50 قاعدة رد", "رد خاص + ذكاء اصطناعي",
                      "بث جماعي للرسائل", "جدولة المنشورات", "تقارير PDF",
                      "محرك العروض الترويجية", "تحليلات متقدمة", "فريق حتى 2"],
        ),
        SubscriptionPlan(
            name="Pro", name_ar="احترافي", price=129, period_days=30,
            max_replies=50000, max_pages=5, max_rules=100, max_team=5,
            has_dm=True, has_ai=True, has_broadcast=True,
            has_scheduling=True, has_reports=True, has_flows=True,
            has_offers=True, has_sequences=True, has_analytics_advanced=True,
            sort_order=4, is_active=True,
            features=["50,000 رد/شهر", "5 صفحات فيسبوك", "100 قاعدة رد", "جميع الميزات المتقدمة",
                      "حملات تسلسلية", "فريق حتى 5 أعضاء", "دعم فني ممتاز"],
        ),
        SubscriptionPlan(
            name="Enterprise", name_ar="مؤسسي", price=299, period_days=30,
            max_replies=999999, max_pages=999, max_rules=999, max_team=999,
            has_dm=True, has_ai=True, has_broadcast=True,
            has_scheduling=True, has_reports=True, has_flows=True,
            has_offers=True, has_sequences=True, has_analytics_advanced=True,
            sort_order=5, is_active=True,
            features=["ردود غير محدودة", "صفحات غير محدودة", "قواعد غير محدودة",
                      "جميع الميزات بدون استثناء", "فريق غير محدود", "دعم 24/7"],
        ),
    ]
    for p in plans:
        db.add(p)
    await db.commit()
    log.info(f"Seeded {len(plans)} subscription plans")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        # ponytail: fail-fast if default SECRET_KEY in production (belt-and-suspenders with config.py)
        if settings.SECRET_KEY == "smartbot-fallback-dev-key-change-in-production" and not settings.DEBUG:
            raise RuntimeError("SECRET_KEY is default — set SECRET_KEY env var for production")
        async with engine.connect() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.commit()
        log.info("DB tables ready")

        async with AsyncSessionLocal() as session:
            await seed_admin(session)
            await _seed_dm_templates(session)
            await _seed_subscription_plans(session)
            # Migrate existing tenants: set FREE plan if no plan_id assigned
            result = await session.execute(select(Tenant).where(Tenant.plan_id == None))
            for t in result.scalars().all():
                t.plan_id = 1  # Free plan
                t.subscription_status = "FREE"
            if result:
                await session.commit()

        # Bot runs via background loop locally, Vercel Cron on serverless
        if settings.START_BOT and not _IS_VERCEL:
            global _bot_task
            _bot_task = asyncio.create_task(_run_bot_loop())
            log.info("Bot started in background")
        if not _IS_VERCEL:
            from sequence_engine import SequenceScheduler
            _seq_scheduler = SequenceScheduler(sequence_engine)
            asyncio.create_task(_seq_scheduler.start())
            from content_calendar import CalendarScheduler
            _calendar_scheduler = CalendarScheduler(content_calendar_engine)
            asyncio.create_task(_calendar_scheduler.start())

        # Bridge event bus → WebSocket
        async def _ws_bridge(data):
            await ws_manager.broadcast("stats_update", data)
        event_bus.subscribe("stats_update", _ws_bridge)

        # Health push background task (every 30s)
        async def _health_push():
            while True:
                try:
                    async with AsyncSessionLocal() as db:
                        hour_ago = utcnow() - timedelta(hours=1)
                        recent = await db.scalar(select(func.count(Reply.id)).where(Reply.created_at >= hour_ago)) or 0
                        running = _bot_task is not None and not _bot_task.done() if _bot_task else False
                        payload = {"replies_last_hour": recent, "running": running,
                                   "timestamp": utcnow().isoformat()}
                        await ws_manager.broadcast("bot_health", payload)
                        await event_bus.emit("bot_health", payload)
                except Exception:
                    pass
                await asyncio.sleep(30)
        if not _IS_VERCEL:
            asyncio.create_task(_health_push())
    except Exception as e:
        log.error(f"Startup error (app continues): {e}")

    yield

    if not _IS_VERCEL:
        if _bot_task:
            _bot_task.cancel()
        # fb is lazy — only close if actually initialized
        r = object.__getattribute__(fb, '_v')
        if r is not None:
            await r.close()
        from redis_cache import disconnect as rdisconnect
        await rdisconnect()
        await engine.dispose()


app = FastAPI(title="FB Dashboard", lifespan=lifespan)


# ponytail: friendly 422 → readable Arabic message
@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    msgs = []
    for e in errors:
        field = ".".join(str(x) for x in e.get("loc", []))
        msgs.append(f"الحقل '{field}' مطلوب")
    return JSONResponse(status_code=422, content={"detail": "؛ ".join(msgs) or "بيانات غير صالحة"})


# ponytail: catch-all 500 — log full traceback server-side, return generic message
@app.exception_handler(Exception)
async def global_500_handler(request: Request, exc: Exception):
    import traceback
    log.error(f"Unhandled 500 | {request.method} {request.url.path} | {traceback.format_exc()}")
    return JSONResponse(status_code=500, content={"detail": "حدث خطأ داخلي — الرجاء المحاولة لاحقاً"})

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://bot.smart-link.ly", "http://localhost:5173", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(dedup_middleware)

# Register routers
app.include_router(logs_router)
app.include_router(auth_router.router)
app.include_router(payments_router.router)
app.include_router(users_router.router)
app.include_router(rules_router.router)
app.include_router(replies_router.router)
app.include_router(webhooks_router.router)
app.include_router(analytics_router.router)
app.include_router(inbox_router.router)
app.include_router(bot_router.router)
app.include_router(diagnostics_router.router)
app.include_router(ai_router.router)
app.include_router(flows_router.router)
app.include_router(sequences_router.router)
app.include_router(broadcasts_router.router)
app.include_router(admin_router.router)
app.include_router(alerts_router.router)
app.include_router(brand_router.router)
app.include_router(calendar_router.router)
app.include_router(commerce_router.router)
app.include_router(crm_router.router)
app.include_router(dashboard_router.router)
app.include_router(facebook_router.router)
app.include_router(health_alerts_router.router)
app.include_router(offers_router.router)
app.include_router(plans_router.router)
app.include_router(publisher_router.router)
app.include_router(reports_router.router)
app.include_router(scheduled_router.router)
app.include_router(subscribers_router.router)
app.include_router(team_router.router)
app.include_router(templates_router.router)
app.include_router(widgets_router.router)

if STATIC_DIR.exists():
    try:
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    except Exception as e:
        log.error(f"StaticFiles mount failed: {e}")
# ponytail: Vercel includeFiles bundles fb_dashboard/static/** but the Python
# function may see files at a different path. Log diagnostic on startup.
log.info(f"STATIC_DIR={STATIC_DIR} exists={STATIC_DIR.exists()}")
_assets = sorted(STATIC_DIR.glob("assets/index-*.js")) if STATIC_DIR.exists() else []
log.info(f"Static index.js files: {[a.name for a in _assets]}")
if not _assets and STATIC_DIR.exists():
    log.warning(f"STATIC_DIR contents: {list(STATIC_DIR.iterdir())[:10]}")
# Mobile app - serve from mobile/dist/
_app_mobile_dir = Path(__file__).resolve().parent.parent / "mobile" / "dist"
if _app_mobile_dir.is_dir():
    try:
        _mobile_app = StaticFiles(directory=str(_app_mobile_dir), html=True)
        app.mount("/app", _mobile_app, name="mobile")
    except Exception:
        pass
    # HEAD handler for StaticFiles 405
    @app.api_route("/app", methods=["HEAD"])
    @app.api_route("/app/{path:path}", methods=["HEAD"])
    async def mobile_head(path: str = ""):
        return HTMLResponse()

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


async def _run_bot_loop():
    while True:
        try:
            async with AsyncSessionLocal() as db:
                tenants = await db.execute(select(Tenant).where(Tenant.is_active == True))
            for tenant in tenants.scalars().all():
                fb = await get_tenant_fb_client(tenant.id)
                if not fb:
                    continue
                BotEngine.reset_instance()
                engine = get_bot_engine(fb, tenant_id=tenant.id)
                await engine.cycle()
        except Exception as e:
            log.error(f"Bot loop err: {e}")
        await asyncio.sleep(settings.BOT_INTERVAL_SECONDS)


# Bot engine — single source of truth in _services.py
from _services import get_bot_engine, get_tenant_fb_client



# ponytail: /api/pricing removed — dead endpoint, hardcoded plans in landing.jsx


# Extracted to routers/payments.py


# ── Telegram Payment Webhook ────────────────────────────────────────────


_TG_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
_ALLOW_UNVERIFIED = os.getenv("TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED", "") == "true"


@app.post("/api/telegram/webhook")
async def telegram_webhook(request: Request, body: dict = Body(...)):
    """Handle Telegram callback queries for payment approve/reject."""
    # Webhook secret check — Telegram sends via x-telegram-bot-api-secret-token
    if _TG_SECRET and not _ALLOW_UNVERIFIED:
        if request.headers.get("x-telegram-bot-api-secret-token", "") != _TG_SECRET:
            raise HTTPException(403, "Forbidden")
    cq = (body or {}).get("callback_query")
    if not cq:
        return {"ok": True}
    data = cq.get("data", "")
    colon = data.find(":")
    if colon == -1 or not (data.startswith("pay_") or data.startswith("sub_")):
        return {"ok": True}
    action = data[:colon]
    payment_id = int(data[colon + 1:])
    from_id = cq.get("from", {}).get("id")
    # Verify admin
    from telegram_bot import ADMIN_IDS
    if from_id not in ADMIN_IDS:
        await answer_callback(cq["id"], "عذراً، لا تمتلك الصلاحية", True)
        return {"ok": True}
    async with AsyncSessionLocal() as db:
        msg = cq.get("message", {})
        # Handle subscription payment (sub_ prefix)
        if data.startswith("sub_"):
            new_status = "verified" if action == "sub_app" else "cancelled"
            sp = await db.get(SubscriptionPayment, payment_id)
            if not sp or sp.status != "pending":
                await answer_callback(cq["id"], "تمت معالجة هذا الطلب مسبقاً", True)
                return {"ok": True}
            sp.status = new_status
            if new_status == "verified":
                # Activate plan for tenant
                tenant = await db.get(Tenant, sp.tenant_id)
                if tenant:
                    plan = await db.get(SubscriptionPlan, sp.plan_id)
                    if plan:
                        tenant.plan_id = sp.plan_id
                        tenant.subscription_status = "PAID"
                        tenant.plan_start = utcnow()
                        tenant.plan_end = utcnow() + timedelta(days=plan.period_days)
                        tenant.plan = plan.name.lower()
                if sp.user_id:
                    user = await db.get(User, sp.user_id)
                    if user:
                        user.plan_id = sp.plan_id
                        user.subscription_status = "PAID"
            await db.commit()
            msg_text = f"✅ *تم تأكيد الاشتراك* #{payment_id}\nالباقة: {sp.plan_name}\nالمستخدم: {sp.extra_data.get('username','')}"
            if msg.get("chat") and msg.get("message_id"):
                await edit_message(msg["chat"]["id"], msg["message_id"], msg_text)
                await edit_keyboard(msg["chat"]["id"], msg["message_id"])
            await answer_callback(cq["id"], "✅ تم تأكيد الاشتراك")
            return {"ok": True}

        # Legacy payment handling (pay_ prefix)
        new_status = "confirmed" if action == "pay_app" else "cancelled"
        result = await db.execute(
            update(PaymentRequest)
            .where(PaymentRequest.id == payment_id, PaymentRequest.status == "pending")
            .values(status=new_status)
            .returning(PaymentRequest)
        )
        pr = result.scalar_one_or_none()
        if not pr:
            await answer_callback(cq["id"], "تمت معالجة هذا الطلب مسبقاً", True)
            msg = cq.get("message", {})
            if msg.get("chat") and msg.get("message_id"):
                await edit_keyboard(msg["chat"]["id"], msg["message_id"])
            return {"ok": True}
        if action == "pay_app":
            # Credit balance
            existing = await db.execute(
                select(BotState).where(BotState.tenant_id == pr.tenant_id, BotState.key == "balance")
            )
            bs = existing.scalar_one_or_none()
            new_bal = (int(float(bs.value)) if bs and bs.value else 0) + int(float(pr.amount))
            if bs:
                bs.value = str(new_bal)
            else:
                db.add(BotState(tenant_id=pr.tenant_id, key="balance", value=str(new_bal)))
            await db.commit()
            msg = cq.get("message", {})
            if msg.get("chat") and msg.get("message_id"):
                await edit_message(msg["chat"]["id"], msg["message_id"],
                                   f"✅ *تم تأكيد الدفع* #{payment_id}\nالمبلغ: {pr.amount} د.ل\nالمستخدم: {pr.username}")
                await edit_keyboard(msg["chat"]["id"], msg["message_id"])
            await answer_callback(cq["id"], "✅ تم تأكيد الدفع وإضافة الرصيد")
        else:
            await db.commit()
            msg = cq.get("message", {})
            if msg.get("chat") and msg.get("message_id"):
                await edit_message(msg["chat"]["id"], msg["message_id"],
                                   f"❌ *تم رفض الدفع* #{payment_id}\nالمبلغ: {pr.amount} د.ل\nالمستخدم: {pr.username}")
                await edit_keyboard(msg["chat"]["id"], msg["message_id"])
            await answer_callback(cq["id"], "❌ تم رفض طلب الدفع")
    return {"ok": True}


# Extracted to routers/payments.py

# Extracted to routers/users.py

# Extracted to routers/diagnostics.py


# ── SPA index.html: cached in memory, refreshed on VERSION change ──
_spa_html: str | None = None
_spa_mtime: float = 0

def _get_spa() -> str:
    """Cached SPA HTML — re-reads only if file mtime changes (deploy = new build)."""
    global _spa_html, _spa_mtime
    static_index = STATIC_DIR / "index.html"
    html_path = TEMPLATES_DIR / "index.html"
    src = static_index if static_index.exists() else (html_path if html_path.exists() else None)
    if not src:
        return "<h1>SmartBot Dashboard</h1><p>Loading...</p>"
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


# ── Static file & API caching headers ─────────────────────────────────────
_CACHEABLE_API_PREFIXES = ("/api/plans", "/api/config", "/api/env", "/api/debug")


@app.middleware("http")
async def static_cache_middleware(request: Request, call_next):
    response = await call_next(request)
    # ponytail: vite hashed assets under /static/assets/, immutable
    if request.url.path.startswith("/static/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif request.url.path in ("/", "/index.html"):
        response.headers["Cache-Control"] = "no-cache"
    # API GET responses that don't need real-time freshness
    elif request.method == "GET" and any(request.url.path.startswith(p) for p in _CACHEABLE_API_PREFIXES):
        response.headers["Cache-Control"] = "public, max-age=60"
    return response


# Protected by get_current_user — roles enforced in frontend hiding (DELETE/POST require editor+)

# Extracted to routers/rules.py

# Extracted to routers/replies.py

# Extracted to routers/bot.py


# ═══════════════════════════════════════════════════════════════════════════════
# :: PROFESSIONAL FEATURES ::
# ═══════════════════════════════════════════════════════════════════════════════

# Extracted to routers/ai.py

# Extracted to routers/inbox.py


# ── WebSocket Real-Time Updates ─────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket endpoint for real-time dashboard data.
    Sends events: stats_update, new_reply, bot_status, alert."""
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4001, reason="Missing token")
        return
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti", "")
        if jti:
            async with AsyncSessionLocal() as _db:
                blocked = await _db.execute(
                    select(BlacklistedToken).where(BlacklistedToken.jti == jti)
                )
                if blocked.scalar_one_or_none():
                    await ws.close(code=4001, reason="Token revoked")
                    return
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        await ws.close(code=4001, reason="Invalid or expired token")
        return
    async with AsyncSessionLocal() as db:
        user = await db.execute(select(User).where(User.username == payload["sub"]))
        user = user.scalar_one_or_none()
        if not user or not user.tenant_id or user.tenant_id != payload.get("tid", 0):
            await ws.close(code=4001, reason="Invalid tenant")
            return
        tenant = await db.get(Tenant, user.tenant_id)
        if not tenant or not tenant.is_active:
            await ws.close(code=4001, reason="Tenant inactive")
            return
        ws_tid = user.tenant_id  # authoritative from DB
    await ws_manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_text(json.dumps({"event": "pong"}))
            elif data == "stats":
                try:
                    async with AsyncSessionLocal() as db:
                        total = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == ws_tid)) or 0
                        today_date = utcnow().date()
                        today = await db.scalar(
                            select(func.count(Reply.id))
                            .where(Reply.tenant_id == ws_tid, cast(Reply.created_at, Date) == today_date)
                        ) or 0
                        await ws.send_text(json.dumps({
                            "event": "stats_update",
                            "data": {"total_replies": total, "today_replies": today}
                        }, default=str))
                except Exception:
                    pass
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)


# ── Server-Sent Events ─────────────────────────────────────────────

@app.get("/api/events")
async def sse_endpoint(request: Request, _user: User = Depends(get_current_user)):
    """SSE endpoint: emits same events as WebSocket (stats_update, new_reply, bot_status, bot_health)."""
    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        handlers = {}
        async def _make_handler(evt: str):
            async def _h(data):
                await queue.put({"event": evt, "data": data})
            return _h
        for evt_name in ("stats_update", "bot_health", "agent_message"):
            h = await _make_handler(evt_name)
            handlers[evt_name] = h
            event_bus.subscribe(evt_name, h)
        try:
            yield "data: {\"event\":\"connected\"}\n\n"
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=30)
                    payload = json.dumps(item, default=str)
                    yield f"data: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            for evt_name, h in handlers.items():
                event_bus.unsubscribe(evt_name, h)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ── Analytics Events (internal) ──────────────────────────────────────────────

def _track_event(event_type: str, metadata: dict | None = None, tenant_id: int = 0):
    """Async-fire AnalyticsEvent (non-blocking)."""
    async def _write():
        try:
            async with AsyncSessionLocal() as s:
                ev = AnalyticsEvent(event_type=event_type, metadata_json=json.dumps(metadata or {}, ensure_ascii=False))
                if tenant_id:
                    ev.tenant_id = tenant_id
                s.add(ev)
                await s.commit()
        except Exception:
            pass
    asyncio.create_task(_write())
    return


WEBHOOK_VERIFY_TOKEN = os.getenv("FB_WEBHOOK_VERIFY_TOKEN", "smartbot_verify_123")
WEBHOOK_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")


@app.get("/webhook")
async def webhook_verify(
    hub_mode: str = Query("", alias="hub.mode"),
    hub_token: str = Query("", alias="hub.verify_token"),
    hub_challenge: str = Query("", alias="hub.challenge"),
):
    """Facebook subscription verification."""
    if hub_mode == "subscribe" and hub_token == WEBHOOK_VERIFY_TOKEN:
        return PlainTextResponse(hub_challenge)
    raise HTTPException(403, "Verification failed")


@app.post("/webhook")
async def webhook_receive(request: Request):
    """Receive real-time Facebook webhook events and process immediately."""
    body = await request.body()

    # Validate signature if app secret configured
    if WEBHOOK_APP_SECRET:
        sig = request.headers.get("x-hub-signature-256", "")
        expected = "sha256=" + hmac.new(
            WEBHOOK_APP_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(401, "Invalid signature")

    data = json.loads(body)
    log.debug(f"Webhook received: {json.dumps(data, ensure_ascii=False)[:500]}")

    for entry in data.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            if change.get("field") != "feed":
                continue
            if value.get("item") != "comment":
                continue
            verb = value.get("verb", "")
            # Only process new comments (not edits or deletes)
            if verb not in ("add", ""):
                continue

            # Extract comment from webhook payload directly
            comment_payload = {
                "id": value.get("comment_id", ""),
                "message": value.get("message", ""),
                "from": value.get("from", {}),
                "created_time": value.get("created_time", ""),
            }
            post_id = value.get("post_id", "")

            if not comment_payload["id"]:
                continue

            # Process this single comment immediately (inline, not fire-and-forget — Vercel kills background tasks)
            await _process_webhook_comment(comment_payload, post_id)

    return {"ok": True}


async def _process_webhook_comment(comment: dict, post_id: str):
    """Process a single webhook comment using shared singleton engine."""
    try:
        engine = get_bot_engine()
        # ponytail: webhook has no tenant context — uses global singleton engine.
        # In multi-tenant mode, webhook must dispatch by page_id → lookup tenant.
        # For now this only works for the deployment's single Facebook page.
        if not engine._tenant_id:
            await engine.process_single_comment(comment, post_id)
        else:
            log.warning("webhook skipped — no tenant context for per-tenant engine")
        _track_event("webhook_comment_processed", {"comment_id": comment.get("id","")})
    except Exception as e:
        log.error(f"Webhook comment processing error: {e}", exc_info=True)


# ═══════════════════════════════════════════════════════════════════════════════
# :: SMART ARMY FEATURES ::
# ═══════════════════════════════════════════════════════════════════════════════

# Extracted to routers/flows.py

# Extracted to routers/sequences.py

# Extracted to routers/broadcasts.py

# Extracted to routers/inbox.py


# ── SPA catch-all: serve index.html for any unmatched browser route ──────────
@app.get("/{path:path}", response_class=HTMLResponse, include_in_schema=False)
async def spa_catch_all(path: str):
    # Don't catch API or static paths
    if path.startswith(("api/", "static/", "healthz", "webhook", "favicon")):
        return HTMLResponse("", status_code=404)
    return HTMLResponse(_get_spa())
