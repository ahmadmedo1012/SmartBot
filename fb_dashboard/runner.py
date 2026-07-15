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
from datetime import datetime, timedelta, timezone
from _utils import utcnow
from pathlib import Path
from contextlib import asynccontextmanager
# ponytail: Any unused but preserved for type annotation patterns

import jwt
from fastapi import FastAPI, Request, Depends, Query, HTTPException, Form, Body, Response, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, StreamingResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, func, desc, asc, cast, Date, text, or_, and_, update

from _lazy import lazy
from telegram_bot import notify_admins_new_payment, notify_admins_new_subscription, send_message, edit_keyboard, edit_message, answer_callback

from config import settings
from database import engine, AsyncSessionLocal, get_db
from models import Base, Rule, Reply, BotLog, BotState, Tenant, User, ConversationNote, BlacklistedToken
from models import ReplyTemplate, AISuggestion, ConversationTag, ConversationLabel, ScheduledPost, AnalyticsEvent, BotAlert, Offer, OfferClaim, BrandConfig, Customer, Flow, FlowExecution
from models import Subscriber, Tag, SubscriberTag, Sequence, SequenceStep, SequenceSubscription, Broadcast, BroadcastRecipient, ConversationAssignee, ReportSchedule, PaymentRequest
from models import SubscriptionPlan, SubscriptionPayment, UsageCounter, SystemConfig
from bot import BotEngine, IntentAwareMatcher
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

# Lazy AI import — graceful if no API key configured
_ai_service = None

def get_ai():
    global _ai_service
    if _ai_service is None:
        from ai_service import AIService
        _ai_service = AIService()
        if not _ai_service.available:
            log.info("AI Service: no provider configured (set OPENAI_API_KEY or GEMINI_API_KEY)")
    return _ai_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fb-api")

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
PARENT_DIR = BASE_DIR.parent

_post_cursors: dict[int, str] = {}  # ponytail: page->after cursor; single-session only, resets on restart
_bot_task: asyncio.Task | None = None

# ── Lazy engine proxies: zero-cost at import, constructed on first use ──
fb = lazy(lambda: __import__('fb_client', fromlist=['FBClient']).FBClient(
    settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID))
sequence_engine = lazy(lambda: __import__('sequence_engine', fromlist=['SequenceEngine']).SequenceEngine(fb))
broadcast_engine = lazy(lambda: __import__('broadcast_engine', fromlist=['BroadcastEngine']).BroadcastEngine(fb))
subscriber_engine = lazy(lambda: __import__('subscriber_engine', fromlist=['SubscriberEngine']).SubscriberEngine())
tag_engine = lazy(lambda: __import__('subscriber_engine', fromlist=['TagEngine']).TagEngine())
analytics_engine = lazy(lambda: __import__('analytics_engine', fromlist=['AnalyticsEngine']).AnalyticsEngine())
report_engine = lazy(lambda: __import__('report_engine', fromlist=['ReportEngine']).ReportEngine(analytics_engine))
pdf_engine = lazy(lambda: __import__('pdf_reports_engine', fromlist=['PdfReportsEngine']).PdfReportsEngine())
content_calendar_engine = lazy(lambda: __import__('content_calendar', fromlist=['ContentCalendarEngine']).ContentCalendarEngine(fb))
team_engine = lazy(lambda: __import__('team_engine', fromlist=['TeamEngine']).TeamEngine())
commerce_engine = lazy(lambda: __import__('commerce_engine', fromlist=['CommerceEngine']).CommerceEngine())
_publisher = lazy(lambda: __import__('publisher_engine', fromlist=['PublisherEngine']).PublisherEngine())
api_cache = lazy(lambda: __import__('api_cache', fromlist=['APICache']).APICache())


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


@api_cache.cached(ttl=3600)
@app.get("/api/plans")
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


@app.post("/api/repair")
async def repair(current_user: User = Depends(require_role("admin"))):
    """Manual DB repair: create tables, run migrations, seed admin. Admin only."""
    try:
        async with engine.connect() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.commit()
        async with AsyncSessionLocal() as session:
            await seed_admin(session)
        return {"ok": True, "message": "DB repaired"}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


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


_bot_engine_singleton: BotEngine | None = None

def get_bot_engine(fb_client: FBClient | None = None, tenant_id: int = 0) -> BotEngine:
    global _bot_engine_singleton
    if fb_client is not None:
        _bot_engine_singleton = BotEngine(fb_client, tenant_id=tenant_id)
        return _bot_engine_singleton
    if _bot_engine_singleton is None:
        _bot_engine_singleton = BotEngine(None)
    return _bot_engine_singleton


async def get_tenant_fb_client(tenant_id: int) -> FBClient | None:
    """Create a per-tenant FBClient using stored encrypted credentials."""
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == "fb_page_id")
        )
        page_id_bs = row.scalar_one_or_none()
        row = await db.execute(
            select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == "fb_access_token")
        )
        token_bs = row.scalar_one_or_none()
    if not page_id_bs or not token_bs or not token_bs.value:
        return None
    try:
        token = decrypt_token(token_bs.value)
    except Exception:
        return None
    return FBClient(token, page_id_bs.value or "")



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


# Extracted to routers/payments.py (validate, subscriptions, upgrade, status, admin)

@app.get("/api/config")
async def public_config(db=Depends(get_db)):
    """Public platform config — payment provider phone numbers etc."""
    rows = await db.execute(select(SystemConfig))
    config = {}
    for r in rows.scalars().all():
        if not r.is_secret:
            config[r.key] = r.value
    return config


@app.post("/api/telegram/test")
async def telegram_test(current_user: User = Depends(get_current_user)):
    """Test Telegram bot connection."""
    from telegram_bot import BOT_TOKEN
    if not BOT_TOKEN:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN غير مضبوط — اضبطه في متغيرات البيئة"}
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"https://api.telegram.org/bot{BOT_TOKEN}/getMe")
            if r.status_code == 200:
                data = r.json()
                if data.get("ok"):
                    bot_user = data["result"]
                    return {"ok": True, "bot_name": bot_user.get("first_name", ""), "bot_username": bot_user.get("username", "")}
            return {"ok": False, "error": f"فشل الاتصال: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


# Extracted to routers/users.py



@app.get("/api/facebook/settings")
async def get_facebook_settings(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    tenant_id = current_user.tenant_id or 0
    page_id = settings.FACEBOOK_PAGE_ID or ""
    has_token = bool(settings.FACEBOOK_ACCESS_TOKEN)

    if tenant_id:
        row = await db.execute(
            select(BotState).where(
                BotState.tenant_id == tenant_id,
                BotState.key == "fb_page_id",
            )
        )
        bs = row.scalar_one_or_none()
        if bs and bs.value:
            page_id = bs.value

        row = await db.execute(
            select(BotState).where(
                BotState.tenant_id == tenant_id, BotState.key == "fb_access_token"
            )
        )
        bs = row.scalar_one_or_none()
        if bs and bs.value:
            has_token = True

    return {
        "page_id": page_id,
        "has_token": has_token,
        "connected": bool(page_id and has_token),
        "page_name": "",
    }


@app.put("/api/facebook/settings")
async def update_facebook_settings(
    request: Request,
    db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    body = await request.json()
    page_id = body.get("page_id", "").strip()
    access_token = body.get("access_token", "").strip()
    tenant_id = current_user.tenant_id or 0

    if page_id:
        existing = await db.execute(
            select(BotState).where(
                BotState.tenant_id == tenant_id, BotState.key == "fb_page_id"
            )
        )
        row = existing.scalar_one_or_none()
        if row:
            row.value = page_id
        else:
            db.add(BotState(tenant_id=tenant_id, key="fb_page_id", value=page_id))

    if access_token:
        encrypted = encrypt_token(access_token)
        existing = await db.execute(
            select(BotState).where(
                BotState.tenant_id == tenant_id, BotState.key == "fb_access_token"
            )
        )
        row = existing.scalar_one_or_none()
        if row:
            row.value = encrypted
        else:
            db.add(
                BotState(
                    tenant_id=tenant_id, key="fb_access_token", value=encrypted
                )
            )

    await db.commit()
    return {"ok": True}


@app.post("/api/facebook/test")
async def test_facebook_connection(
    db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    tenant_id = current_user.tenant_id or 0
    page_id = ""
    token = ""

    row = await db.execute(
        select(BotState).where(
            BotState.tenant_id == tenant_id, BotState.key == "fb_page_id"
        )
    )
    bs = row.scalar_one_or_none()
    if bs:
        page_id = bs.value

    row = await db.execute(
        select(BotState).where(
            BotState.tenant_id == tenant_id, BotState.key == "fb_access_token"
        )
    )
    bs = row.scalar_one_or_none()
    if bs and bs.value:
        token = decrypt_token(bs.value)

    if not token or not page_id:
        return {"connected": False, "fan_count": 0, "error": "لم يتم تعيين بيانات فيسبوك"}

    try:
        from fb_client import FBClient

        tmp = FBClient(token, page_id)
        fan_count = await tmp.get_page_fan_count()
        return {"connected": True, "fan_count": fan_count}
    except Exception as e:
        return {"connected": False, "fan_count": 0, "error": str(e)[:200]}



@app.get("/healthz")
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


@app.get("/api/env")
async def get_env():
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


@app.get("/api/system/stats")
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


async def _get_trend_data(db, tenant_id: int) -> dict:
    """Trend data: today vs yesterday, last 7d vs prior 7d."""
    now = utcnow()
    today_start = datetime(now.year, now.month, now.day, tzinfo=now.tzinfo)
    yesterday_start = today_start - timedelta(days=1)
    week_start = now - timedelta(days=7)
    prior_week_start = now - timedelta(days=14)

    today_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id, Reply.created_at >= today_start,
    )) or 0
    yesterday_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id,
        Reply.created_at >= yesterday_start, Reply.created_at < today_start,
    )) or 0
    week_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id, Reply.created_at >= week_start,
    )) or 0
    prior_week_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id,
        Reply.created_at >= prior_week_start, Reply.created_at < week_start,
    )) or 0

    return {
        "today": round((today_replies - yesterday_replies) / yesterday_replies * 100, 1)
        if yesterday_replies else (100 if today_replies else 0),
        "week": round((week_replies - prior_week_replies) / prior_week_replies * 100, 1)
        if prior_week_replies else (100 if week_replies else 0),
    }


# ── Dashboard Bundle Endpoint ──────────────────────────────────────────────────
@app.get("/api/dashboard/bundle")
async def dashboard_bundle(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Returns ALL dashboard data in one request. Reduces 7 API calls → 1."""
    _tid = current_user._tenant_id
    # ponytail: bot cycle removed from dashboard — use cron or manual trigger instead
    try:
        now = utcnow()
        today = now.date()

        # Stats — merged queries
        total_replies = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid)) or 0
        today_replies = await db.scalar(
            select(func.count(Reply.id)).where(Reply.tenant_id == _tid, cast(Reply.created_at, Date) == today)
        ) or 0

        # Chart data — single query
        chart_rows = await db.execute(
            select(cast(Reply.created_at, Date).label("d"), func.count(Reply.id))
            .where(Reply.tenant_id == _tid, Reply.created_at >= now - timedelta(days=7))
            .group_by(cast(Reply.created_at, Date))
        )
        chart = {str(row[0]): row[1] for row in chart_rows if row[0]}

        # Fan count (cached internally by FBClient so no issue calling it)
        fan_count = 0
        try:
            fan_count = await fb.get_page_fan_count()
        except Exception:
            pass

        # ponytail: trend computed by _get_trend_data() below

        # Top rule
        top = None
        try:
            stmt = select(Reply.rule_id, func.count(Reply.id).label("cnt")).where(Reply.tenant_id == _tid).group_by(Reply.rule_id).order_by(desc("cnt")).limit(1)
            top = (await db.execute(stmt)).first()
        except Exception:
            pass

        # Rules — just count + enabled count for dashboard
        rule_rows = await db.execute(select(Rule).where(Rule.tenant_id == _tid))
        all_rules = rule_rows.scalars().all()
        rules = [{
            "id": r.id, "name": r.name, "enabled": r.enabled,
        } for r in all_rules]
        rules_count = len(all_rules)
        active_rules_count = sum(1 for r in all_rules if r.enabled)

        # Bot status
        running = _bot_task is not None and not _bot_task.done()

        # AI status
        ai = get_ai()

        # Recent activity — last 8 entries
        recent_replies_rows = await db.execute(
            select(Reply).where(Reply.tenant_id == _tid).order_by(desc(Reply.created_at)).limit(8)
        )
        recent_logs_rows = await db.execute(
            select(BotLog).where(BotLog.tenant_id == _tid).order_by(desc(BotLog.created_at)).limit(8)
        )
        activities = []
        for r in recent_replies_rows.scalars().all():
            activities.append({
                "type": "reply", "text": f"رد على {r.commenter_name}",
                "detail": r.reply_text[:60], "time": r.created_at.isoformat() if r.created_at else None,
            })
        for l in recent_logs_rows.scalars().all():
            activities.append({
                "type": "log", "level": l.level, "text": l.message[:100],
                "detail": "", "time": l.created_at.isoformat() if l.created_at else None,
            })
        activities.sort(key=lambda a: a.get("time", ""), reverse=True)
        activities = activities[:8]

        # Recent replies — last 5 (reuse from activities data)
        recent_replies = [{
            "id": r.id, "commenter_name": r.commenter_name, "comment_text": r.comment_text,
            "reply_text": r.reply_text, "fb_comment_id": r.fb_comment_id,
            "rule_id": r.rule_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in recent_replies_rows.scalars().all()[:5]]

        return {
            "stats": {
                "total_replies": total_replies,
                "today_replies": today_replies,
                "fan_count": fan_count,
                "top_rule_id": int(top[0]) if top and top[0] is not None else None,
                "chart": chart,
                "trend": await _get_trend_data(db, _tid),
            },
            "rules": rules,
            "rules_count": rules_count,
            "active_rules_count": active_rules_count,
            "bot_status": {"running": running, "interval": settings.BOT_INTERVAL_SECONDS},
            "ai_status": {"available": ai.available, "provider": ai.provider_name},
            "recent_activity": activities,
            "recent_replies": recent_replies,
        }
    except Exception as e:
        log.error(f"dashboard_bundle error: {e}", exc_info=True)
        return {"error": str(e)}, 500



@app.get("/api/stats")
async def get_stats(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    total_replies = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid)) or 0
    today = utcnow().date()
    today_replies = await db.scalar(
        select(func.count(Reply.id)).where(Reply.tenant_id == _tid, cast(Reply.created_at, Date) == today)
    ) or 0

    top = None
    try:
        stmt = select(Reply.rule_id, func.count(Reply.id).label("cnt")).where(Reply.tenant_id == _tid).group_by(Reply.rule_id).order_by(desc("cnt")).limit(1)
        top = (await db.execute(stmt)).first()
    except Exception:
        pass

    fan_count = 0
    try:
        fan_count = await fb.get_page_fan_count()
    except Exception:
        pass

    chart_data = {}
    try:
        rows = await db.execute(
            select(cast(Reply.created_at, Date).label("d"), func.count(Reply.id))
            .where(Reply.tenant_id == _tid, Reply.created_at >= utcnow() - timedelta(days=7))
            .group_by(cast(Reply.created_at, Date))
        )
        chart_data = {str(row[0]): row[1] for row in rows if row[0]}
    except Exception:
        pass

    return {
        "total_replies": total_replies,
        "today_replies": today_replies,
        "fan_count": fan_count,
        "top_rule_id": int(top[0]) if top and top[0] is not None else None,
        "chart": chart_data,
    }


# Protected by get_current_user — roles enforced in frontend hiding (DELETE/POST require editor+)

# Extracted to routers/rules.py

# Extracted to routers/replies.py

@app.get("/api/stats/hourly")
async def get_hourly_stats(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    cutoff = utcnow() - timedelta(days=7)
    rows = await db.execute(
        select(func.extract("hour", Reply.created_at).label("hour"), func.count(Reply.id).label("count"))
        .where(Reply.tenant_id == _tid, Reply.created_at >= cutoff)
        .group_by(text("hour")).order_by(text("hour"))
    )
    return [{"hour": int(r.hour), "count": r.count} for r in rows]



@app.get("/api/posts")
async def list_posts(page: int = Query(1), per_page: int = Query(10), _=Depends(get_current_user)):
    after_cursor = _post_cursors.get(page - 1) if page > 1 else None
    posts, paging = await fb.get_page_posts(per_page, after_cursor)
    if paging and paging.get("cursors", {}).get("after"):
        _post_cursors[page] = paging["cursors"]["after"]
    has_next = bool(paging and paging.get("next"))
    # ponytail: FB doesn't return total count; approximate for pagination UI
    total = (page - 1) * per_page + len(posts) + (1 if has_next else 0)
    return {
        "items": [{
            "id": p["id"], "message": p.get("message", "")[:200],
            "created_time": p.get("created_time", ""),
            "likes": (p.get("likes", {}) or {}).get("summary", {}).get("total_count", 0),
            "shares": (p.get("shares", {}) or {}).get("count", 0),
            "comments": (p.get("comments", {}) or {}).get("summary", {}).get("total_count", 0),
        } for p in posts],
        "total": total,
        "page": page,
        "per_page": per_page,
        "has_next": has_next,
    }


@app.get("/api/posts/{post_id}")
async def get_post_detail(post_id: str, _=Depends(get_current_user)):
    detail = await fb.get_post_detail(post_id)
    if not detail:
        raise HTTPException(404, "Post not found")
    return detail


@app.delete("/api/posts/{post_id}")
async def delete_post(post_id: str, _=Depends(require_role("editor"))):
    result = await fb.delete_post(post_id)
    if not result:
        raise HTTPException(400, "Failed to delete post")
    return {"ok": True}


@app.post("/api/publish")
async def publish_post(message: str = Form(...), _=Depends(require_role("editor"))):
    result = await fb.post_to_page(message)
    return result or {"error": "Failed to post"}


@app.get("/api/messages")
async def list_conversations(_=Depends(get_current_user)):
    convos = await fb.get_conversations(25)
    return [{
        "id": c["id"], "subject": c.get("subject", ""),
        "senders": c.get("senders", {}).get("data", []),
        "message_count": c.get("message_count", 0),
        "unread_count": c.get("unread_count", 0),
        "updated_time": c.get("updated_time", ""),
    } for c in convos]


@app.get("/api/messages/{conversation_id}")
async def get_conversation_messages(conversation_id: str, _=Depends(get_current_user)):
    messages = await fb.get_conversation_messages(conversation_id)
    return [{
        "id": m["id"], "message": m.get("message", ""),
        "from": m.get("from", {}),
        "created_time": m.get("created_time", ""),
    } for m in messages]


@app.post("/api/messages/{conversation_id}/reply")
async def reply_to_conversation(conversation_id: str, message: str = Form(...),
                                _=Depends(require_role("editor"))):
    result = await fb.send_conversation_message(conversation_id, message)
    if not result:
        raise HTTPException(400, "لم يتم إرسال الرسالة — تحقق من صلاحية التوكن والمراسلة")
    return {"ok": True}



@app.get("/api/ads/accounts")
async def list_ad_accounts(_=Depends(require_role("admin"))):
    accounts = await fb.get_ad_accounts()
    return [{
        "id": a["id"], "name": a.get("name", ""),
        "account_status": a.get("account_status", 0),
        "currency": a.get("currency", ""),
        "amount_spent": a.get("amount_spent", "0"),
        "balance": a.get("balance", "0"),
    } for a in accounts]


@app.get("/api/ads/campaigns/{account_id}")
async def list_campaigns(account_id: str, _=Depends(require_role("editor"))):
    return await fb.get_campaigns(account_id)


@app.get("/api/ads/ads/{account_id}")
async def list_ads(account_id: str, _=Depends(require_role("editor"))):
    return await fb.get_ads(account_id)



# Extracted to routers/bot.py


# ═══════════════════════════════════════════════════════════════════════════════
# :: PROFESSIONAL FEATURES ::
# ═══════════════════════════════════════════════════════════════════════════════

# Extracted to routers/ai.py


# Extracted to routers/inbox.py


# ── Reply Templates (Quick Replies) ──────────────────────────────────────────

@app.get("/api/templates")
async def list_templates(category: str = Query(""), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    stmt = select(ReplyTemplate).where(ReplyTemplate.tenant_id == _tid)
    if category:
        stmt = stmt.where(ReplyTemplate.category == category)
    rows = await db.execute(stmt.order_by(ReplyTemplate.category, ReplyTemplate.name))
    return [{"id": t.id, "name": t.name, "text": t.text, "category": t.category, "shortcut": t.shortcut}
            for t in rows.scalars().all()]


@app.post("/api/templates")
async def create_template(name: str = Form(...), text: str = Form(...), category: str = Form("general"),
                          shortcut: str = Form(""), db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    t = ReplyTemplate(name=name, text=text, category=category, shortcut=shortcut, tenant_id=current_user._tenant_id)
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return {"id": t.id}


@app.put("/api/templates/{template_id}")
async def update_template(template_id: int, name: str = Form(...), text: str = Form(...),
                          category: str = Form("general"), shortcut: str = Form(""),
                          db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    t = (await db.execute(
        select(ReplyTemplate).where(ReplyTemplate.id == template_id, ReplyTemplate.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    t.name = name; t.text = text; t.category = category; t.shortcut = shortcut
    await db.commit()
    return {"ok": True}


@app.delete("/api/templates/{template_id}")
async def delete_template(template_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    t = (await db.execute(
        select(ReplyTemplate).where(ReplyTemplate.id == template_id, ReplyTemplate.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    await db.delete(t)
    await db.commit()
    return {"ok": True}


# ── Scheduled Posts ──────────────────────────────────────────────────────────

@app.get("/api/scheduled-posts")
async def list_scheduled_posts(status: str = Query(""), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    stmt = select(ScheduledPost).where(ScheduledPost.tenant_id == _tid)
    if status:
        stmt = stmt.where(ScheduledPost.status == status)
    rows = await db.execute(stmt.order_by(desc(ScheduledPost.scheduled_at)))
    return [{
        "id": p.id, "message": p.message, "image_url": p.image_url,
        "scheduled_at": p.scheduled_at.isoformat() if p.scheduled_at else None,
        "status": p.status, "fb_post_id": p.fb_post_id,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "published_at": p.published_at.isoformat() if p.published_at else None,
    } for p in rows.scalars().all()]


@app.post("/api/scheduled-posts")
async def create_scheduled_post(
    message: str = Form(...), image_url: str = Form(""),
    scheduled_at: str = Form(""), db=Depends(get_db),
    current_user: User = Depends(require_role("editor")),
):
    sched = None
    if scheduled_at:
        try:
            sched = datetime.fromisoformat(scheduled_at)
        except ValueError:
            raise HTTPException(400, "صيغة التاريخ غير صالحة — استخدم ISO 8601")

    post = ScheduledPost(
        message=message, image_url=image_url, scheduled_at=sched,
        status="draft" if not sched else "scheduled",
        created_by=current_user.username or "",
        tenant_id=current_user._tenant_id,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return {"id": post.id, "status": post.status}


@app.post("/api/scheduled-posts/{post_id}/publish")
async def publish_scheduled_post(post_id: int, db=Depends(get_db),
                                 current_user: User = Depends(require_role("editor"))):
    """Publish a scheduled post immediately or at its scheduled time."""
    post = (await db.execute(
        select(ScheduledPost).where(ScheduledPost.id == post_id, ScheduledPost.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "المنشور غير موجود")
    result = await fb.post_to_page(post.message)
    if not result:
        raise HTTPException(400, "فشل النشر على فيسبوك")
    post.status = "published"
    post.fb_post_id = result.get("id", "")
    post.published_at = utcnow()
    await db.commit()
    _track_event("post_published", {"scheduled_post_id": post_id})
    return {"ok": True, "fb_post_id": post.fb_post_id}


@app.delete("/api/scheduled-posts/{post_id}")
async def delete_scheduled_post(post_id: int, db=Depends(get_db),
                                current_user: User = Depends(require_role("editor"))):
    post = (await db.execute(
        select(ScheduledPost).where(ScheduledPost.id == post_id, ScheduledPost.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not post:
        raise HTTPException(404, "المنشور غير موجود")
    await db.delete(post)
    await db.commit()
    return {"ok": True}



# ── Dashboard Widgets ────────────────────────────────────────────────────────

@app.get("/api/widgets/recent-activity")
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


@app.get("/api/widgets/ai-insights")
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


@app.get("/api/widgets/response-time")
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


@app.get("/api/widgets/sentiment-trend")
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


@app.get("/api/widgets/top-keywords")
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


# ── Bot Health / Alerts ──────────────────────────────────────────────────────

@app.get("/api/health/alerts")
async def get_bot_alerts(resolved: bool = Query(False), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get bot health alerts."""
    stmt = select(BotAlert).where(BotAlert.tenant_id == current_user._tenant_id)
    if not resolved:
        stmt = stmt.where(BotAlert.resolved == False)
    rows = await db.execute(stmt.order_by(desc(BotAlert.created_at)).limit(20))
    return [{
        "id": a.id, "alert_type": a.alert_type, "severity": a.severity,
        "message": a.message, "resolved": a.resolved,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in rows.scalars().all()]


@app.post("/api/health/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    alert = (await db.execute(
        select(BotAlert).where(BotAlert.id == alert_id, BotAlert.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not alert:
        raise HTTPException(404, "Alert not found")
    alert.resolved = True
    alert.resolved_at = utcnow()
    await db.commit()
    return {"ok": True}


@app.get("/api/health/bot-check")
async def health_bot_check(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Run bot health checks and return status."""
    _tid = current_user._tenant_id
    issues = []

    # 1. Check recent reply volume
    hour_ago = utcnow() - timedelta(hours=1)
    recent = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid, Reply.created_at >= hour_ago)) or 0
    if recent == 0:
        issues.append({"type": "no_replies", "severity": "warning", "message": "لا توجد ردود في آخر ساعة"})

    # 2. Check token connectivity
    try:
        fan_count = await fb.get_page_fan_count()
    except Exception:
        fan_count = None
        issues.append({"type": "fb_token", "severity": "critical", "message": "فشل الاتصال بفيسبوك — تحقق من التوكن"})

    # 3. Check rules
    rule_count = await db.scalar(select(func.count(Rule.id)).where(Rule.tenant_id == _tid)) or 0
    if rule_count == 0:
        issues.append({"type": "no_rules", "severity": "critical", "message": "لا توجد قواعد رد — البوت لن يعمل"})

    # 4. Check bot running
    running = _bot_task is not None and not _bot_task.done()

    return {
        "status": "ok" if not issues else "warning",
        "running": running,
        "fan_count": fan_count,
        "replies_last_hour": recent,
        "rule_count": rule_count,
        "issues": issues,
        "alerts_count": 0,
    }


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


# ── SUBSCRIBERS API ───────────────────────────────────────────────────────────

@app.get("/api/subscribers")
async def list_subscribers(
    search: str = Query(""), platform: str = Query(""), tag: str = Query(""),
    page: int = Query(1), per_page: int = Query(20),
    db=Depends(get_db), current_user: User = Depends(get_current_user),
):
    return await subscriber_engine.search(
        query=search, platform=platform, tag=tag,
        page=page, per_page=per_page, session=db,
        tenant_id=current_user._tenant_id,
    )


@app.get("/api/subscribers/{sub_id}")
async def get_subscriber(sub_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    detail = await subscriber_engine.get_detail(sub_id, db, tenant_id=current_user._tenant_id)
    if not detail:
        raise HTTPException(404, "Subscriber not found")
    return detail


@app.post("/api/subscribers/{sub_id}/tags")
async def assign_subscriber_tag(sub_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    body = await request.json()
    ok = await subscriber_engine.add_tag(sub_id, body["tag_id"], db, tenant_id=current_user._tenant_id)
    return {"ok": ok}


@app.delete("/api/subscribers/{sub_id}/tags/{tag_id}")
async def remove_subscriber_tag(sub_id: int, tag_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    ok = await subscriber_engine.remove_tag(sub_id, tag_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Tag not assigned to subscriber")
    return {"ok": True}


# ── TAGS API ──────────────────────────────────────────────────────────────────

@app.get("/api/tags")
async def list_tags(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await tag_engine.list_tags(db, tenant_id=current_user._tenant_id)


@app.post("/api/tags")
async def create_tag(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    body = await request.json()
    try:
        result = await tag_engine.create_tag(body["name"], body.get("color", "#6366f1"), db, tenant_id=current_user._tenant_id)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/tags/{tag_id}")
async def delete_tag(tag_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    ok = await tag_engine.delete_tag(tag_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Tag not found")
    return {"ok": True}


# Extracted to routers/sequences.py


# Extracted to routers/broadcasts.py



# Extracted to routers/inbox.py


# ── Content Calendar ───────────────────────────────────────────────────────────

@app.get("/api/calendar")
async def calendar_list(year: int = Query(utcnow().year), month: int = Query(utcnow().month),
                        db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await content_calendar_engine.get_calendar_posts(year, month, db, tenant_id=current_user._tenant_id)


@app.get("/api/calendar/day")
async def calendar_day(year: int = Query(...), month: int = Query(...), day: int = Query(...),
                       db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await content_calendar_engine.get_calendar_posts_by_date(year, month, day, db, tenant_id=current_user._tenant_id)


@app.post("/api/calendar")
async def calendar_create(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    body = await request.json()
    try:
        post_id = await content_calendar_engine.create_post(
            message=body["message"],
            image_url=body.get("image_url", ""),
            scheduled_at=body.get("scheduled_at", ""),
            platform=body.get("platform", "facebook"),
            created_by="editor",
            session=db,
            tenant_id=current_user._tenant_id,
        )
        return {"id": post_id}
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.put("/api/calendar/{post_id}")
async def calendar_update(post_id: int, request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    data = await request.json()
    ok = await content_calendar_engine.update_post(post_id, data, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Post not found")
    return {"ok": True}


@app.delete("/api/calendar/{post_id}")
async def calendar_delete(post_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    ok = await content_calendar_engine.delete_post(post_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Post not found")
    return {"ok": True}


@app.post("/api/calendar/{post_id}/publish")
async def calendar_publish(post_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    ok = await content_calendar_engine.publish_post(post_id, db, tenant_id=current_user._tenant_id)
    if not ok:
        raise HTTPException(404, "Post not found or publish failed")
    return {"ok": True}


@app.get("/api/calendar/month-summary")
async def calendar_month_summary(year: int = Query(...), month: int = Query(...),
                                 db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await content_calendar_engine.get_month_summary(year, month, db, tenant_id=current_user._tenant_id)


# ── Publisher (Multi-Platform) ──────────────────────────────────────────────────

@app.get("/api/publisher/status")
async def publisher_status(current_user: User = Depends(get_current_user)):
    _publisher.load_credentials(None, tenant_id=current_user._tenant_id)
    return _publisher.get_status()


@app.get("/api/publisher/settings/{platform}")
async def publisher_settings(platform: str, _=Depends(get_current_user)):
    return {
        "platform": platform,
        "fields": _publisher.get_platform_settings_template(platform),
    }


@app.post("/api/publisher/configure")
async def publisher_configure(data: dict = Body(...), db=Depends(get_db),
                               current_user: User = Depends(require_role("admin"))):
    platform = data.get("platform", "")
    creds = data.get("credentials", {})
    if not platform or not creds:
        raise HTTPException(400, "platform and credentials required")
    ok = await _publisher.save_credentials(db, platform, creds, tenant_id=current_user._tenant_id)
    return {"ok": ok, "platform": platform}


@app.post("/api/publisher/publish")
async def publisher_publish(data: dict = Body(...), db=Depends(get_db),
                             current_user = Depends(require_role("editor"))):
    platform = data.get("platform", "facebook")
    message = data.get("message", "")
    image_url = data.get("image_url", "")
    scheduled_at = data.get("scheduled_at", "")

    if not message.strip():
        raise HTTPException(400, "Message required")

    if scheduled_at:
        try:
            sched = datetime.fromisoformat(scheduled_at)
        except ValueError:
            raise HTTPException(400, "Invalid date format — use ISO 8601")
        _publisher.load_credentials(db, tenant_id=current_user._tenant_id)
        post = ScheduledPost(
            message=message, image_url=image_url, platform=platform,
            scheduled_at=sched, status="scheduled",
            created_by=current_user.username or "",
            tenant_id=current_user._tenant_id,
        )
        db.add(post)
        await db.commit()
        _track_event("post_scheduled", {"platform": platform})
        return {"id": post.id, "status": "scheduled", "scheduled_at": scheduled_at}

    # Publish immediately
    if platform == "facebook":
        result = await fb.post_to_page(message)
        if not result:
            raise HTTPException(400, "فشل النشر على فيسبوك")
        fb_post_id = result.get("id", "")
        _track_event("post_published", {"platform": "facebook"})
        return {"platform": "facebook", "post_id": fb_post_id, "status": "published"}
    else:
        _publisher.load_credentials(db, tenant_id=current_user._tenant_id)
        result = await _publisher.publish_to_platform(platform, message, image_url)
        if not result:
            raise HTTPException(400, f"فشل النشر على {_publisher.get_platform_display_name(platform)}")
        _track_event("post_published", {"platform": platform})
        return {**result, "status": "published"}


# ── Team ───────────────────────────────────────────────────────────────────────

@app.get("/api/team/members")
async def team_members(db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    return await team_engine.get_team_members(db, tenant_id=current_user._tenant_id)


@app.get("/api/team/activity")
async def team_activity(days: int = Query(7), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await team_engine.get_team_activity(days, db, tenant_id=current_user._tenant_id)


@app.get("/api/team/performance")
async def team_performance(db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    return await team_engine.get_team_performance(db, tenant_id=current_user._tenant_id)


@app.get("/api/team/role-summary")
async def team_role_summary(db=Depends(get_db), _=Depends(get_current_user)):
    return await team_engine.get_user_role_summary(db)


# ── Commerce / Shopify ────────────────────────────────────────────────────

@app.get("/api/commerce/status")
async def commerce_status(_=Depends(get_current_user)):
    return commerce_engine.get_status()


@app.post("/api/commerce/shopify/configure")
async def shopify_configure(request: Request, db=Depends(get_db), _=Depends(require_role("admin"))):
    from commerce_engine import ShopifyIntegration
    body = await request.json()
    for key, value in body.items():
        existing = await db.execute(select(BotState).where(BotState.key == f"shopify_{key}"))
        row = existing.scalar_one_or_none()
        val = str(value)
        if key == "access_token":
            from _crypto import encrypt_token
            val = encrypt_token(val) or val
        if row:
            row.value = val
        else:
            db.add(BotState(key=f"shopify_{key}", value=val))
    await db.commit()
    commerce_engine.shopify = ShopifyIntegration(
        store_domain=body.get("store_domain", ""),
        access_token=body.get("access_token", ""),
        webhook_secret=body.get("webhook_secret", ""),
    )
    return {"ok": True, "store": body.get("store_domain", "")}


@app.post("/api/commerce/shopify/webhook/{topic:path}")
async def shopify_webhook(topic: str, request: Request):
    if not getattr(commerce_engine, 'shopify', None):
        raise HTTPException(503, "Shopify not configured")
    if not await commerce_engine.shopify.verify_webhook(request):
        raise HTTPException(401, "Invalid HMAC signature")
    body = await request.json()
    ctx = await commerce_engine.shopify.handle_webhook(topic, body)
    return ctx


@app.get("/api/commerce/shopify/products")
async def shopify_products(limit: int = Query(10), _=Depends(get_current_user)):
    return {"products": await commerce_engine.shopify.get_products(limit)}


@app.get("/api/commerce/shopify/orders")
async def shopify_orders(limit: int = Query(10), status: str = Query("any"), _=Depends(get_current_user)):
    return {"orders": await commerce_engine.shopify.get_orders(limit, status)}


# ── PDF Reports Engine ──────────────────────────────────────────────

@app.get("/api/reports/status")
async def pdf_reports_status(_=Depends(get_current_user)):
    """Check PDF generation engine availability."""
    return {"available": pdf_engine.is_available(), "engine": pdf_engine.engine_name}


@app.post("/api/reports/generate")
async def generate_pdf_report(request: Request, _=Depends(require_role("editor"))):
    """Generate a PDF report.  Returns PDF bytes directly."""
    body = await request.json()
    rtype = body.get("type", "monthly")
    days = body.get("days", 30)
    b = body.get("branding", {})
    from pdf_reports_engine import BrandingConfig
    branding = BrandingConfig(
        logo_url=b.get("logo_url", ""),
        company_name=b.get("company_name", "SmartBot"),
        primary_color=b.get("primary_color", "#dc2626"),
    )
    if rtype == "monthly":
        pdf_bytes = await pdf_engine.monthly_report(days=days, branding=branding)
    elif rtype == "subscriber":
        pdf_bytes = await pdf_engine.subscriber_report(days=days, branding=branding)
    elif rtype == "campaign":
        campaign_type = body.get("campaign_type", "broadcast")
        campaign_id = body.get("campaign_id", "0")
        pdf_bytes = await pdf_engine.campaign_report(campaign_type, campaign_id, branding=branding)
    else:
        raise HTTPException(400, f"Unknown report type: {rtype}")
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=report-{rtype}-{utcnow().strftime('%Y%m%d')}.pdf"})


@app.post("/api/reports/schedule")
async def reports_create_schedule(
    report_type: str = Form("monthly"), email: str = Form(""),
    schedule: str = Form("monthly"), db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Create a report schedule."""
    rs = ReportSchedule(report_type=report_type, email=email, schedule=schedule, enabled=True, tenant_id=current_user._tenant_id)
    db.add(rs)
    await db.commit()
    await db.refresh(rs)
    return {"id": rs.id, "report_type": rs.report_type, "schedule": rs.schedule, "email": rs.email}


@app.get("/api/reports/schedules")
async def reports_list_schedules(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all report schedules."""
    rows = await db.execute(select(ReportSchedule).where(ReportSchedule.tenant_id == current_user._tenant_id).order_by(ReportSchedule.created_at.desc()))
    return [{
        "id": r.id, "report_type": r.report_type, "email": r.email,
        "enabled": r.enabled, "schedule": r.schedule,
        "last_sent": r.last_sent.isoformat() if r.last_sent else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows.scalars().all()]


@app.delete("/api/reports/schedules/{schedule_id}")
async def reports_delete_schedule(schedule_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """Delete a report schedule."""
    rs = (await db.execute(
        select(ReportSchedule).where(ReportSchedule.id == schedule_id, ReportSchedule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rs:
        raise HTTPException(404, "الجدول غير موجود")
    await db.delete(rs)
    await db.commit()
    return {"ok": True}


# ── Offers / Coupons ──────────────────────────────────────────────────────────


@app.get("/api/offers")
async def list_offers(active_only: bool = Query(False), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    stmt = select(Offer).where(Offer.tenant_id == _tid)
    if active_only:
        stmt = stmt.where(Offer.is_active == True)
    rows = await db.execute(stmt.order_by(Offer.created_at.desc()))
    return [{
        "id": o.id, "title": o.title, "code": o.code, "description": o.description,
        "discount_type": o.discount_type, "discount_value": o.discount_value,
        "max_uses": o.max_uses, "used_count": o.used_count,
        "auto_reply_rule_id": o.auto_reply_rule_id, "is_active": o.is_active,
        "expires_at": o.expires_at.isoformat() if o.expires_at else None,
    } for o in rows.scalars().all()]


@app.post("/api/offers")
async def create_offer(
    title: str = Form(...), code: str = Form(""), description: str = Form(""),
    discount_type: str = Form("percentage"), discount_value: int = Form(0),
    expires_at: str = Form(""), db=Depends(get_db), current_user: User = Depends(require_role("admin")),
):
    exp = datetime.fromisoformat(expires_at) if expires_at else None
    offer = Offer(title=title, code=code, description=description,
                  discount_type=discount_type, discount_value=discount_value, expires_at=exp,
                  tenant_id=current_user._tenant_id)
    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    return {"id": offer.id}


@app.post("/api/offers/{offer_id}/toggle")
async def toggle_offer(offer_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    offer = (await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not offer: raise HTTPException(404, "العرض غير موجود")
    offer.is_active = not offer.is_active
    await db.commit()
    return {"ok": True, "is_active": offer.is_active}


@app.delete("/api/offers/{offer_id}")
async def delete_offer(offer_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    offer = (await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not offer: raise HTTPException(404, "العرض غير موجود")
    await db.delete(offer)
    await db.commit()
    return {"ok": True}


# ── Notification Broadcast (Admin) ───────────────────────────

@app.post("/api/notifications/broadcast")
async def broadcast_notification(
    notif_type: str = Form("info"), title: str = Form(...),
    message: str = Form(""), link: str = Form(""),
    _=Depends(require_role("admin")),
):
    """Broadcast a notification to all connected dashboard clients."""
    asyncio.create_task(ws_manager.broadcast("notification", {
        "type": notif_type, "title": title, "message": message, "link": link or None,
    }))
    return {"ok": True}


# Extracted to routers/diagnostics.py


@app.delete("/api/admin/tenants/{tenant_id}")
async def delete_tenant(tenant_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """GDPR-compliant tenant deletion. Deletes all tenant-scoped data."""
    # Guard: only platform admin (no tenant) can delete other tenants
    if current_user._tenant_id and current_user._tenant_id != tenant_id:
        raise HTTPException(403, "لا يمكنك حذف مستأجر آخر")
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    tables = [
        SequenceSubscription, SequenceStep, BroadcastRecipient, SubscriberTag,
        Subscriber, Tag, FlowExecution, ConversationLabel, ConversationNote, ConversationAssignee,
        Customer, OfferClaim, Offer, ScheduledPost, AISuggestion, ReplyTemplate,
        Reply, BotLog, BotState, BrandConfig, Rule, AnalyticsEvent, BotAlert,
    ]
    for table in tables:
        await db.execute(table.__table__.delete().where(table.tenant_id == tenant_id))

    await db.execute(User.__table__.delete().where(User.tenant_id == tenant_id))
    await db.delete(tenant)
    await db.commit()
    return {"ok": True, "deleted_tenant_id": tenant_id}


@app.post("/api/admin/rules/{rule_id}/priority")
async def set_rule_priority(rule_id: int, priority: int = Form(...), db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule: raise HTTPException(404, "Rule not found")
    rule.priority = max(0, min(9999, priority))
    await db.commit()
    return {"ok": True, "priority": rule.priority}


@app.post("/api/admin/cooldown")
async def set_cooldown(seconds: int = Form(...), _=Depends(require_role("admin"))):
    if seconds < 10 or seconds > 3600:
        raise HTTPException(400, "يجب أن تكون المدة بين 10 و3600 ثانية")
    from bot import BotEngine
    eng = BotEngine._instance
    if eng: eng.cooldown.adjust_window("global", seconds)
    return {"ok": True, "cooldown_seconds": seconds}


@app.get("/api/admin/template-vars")
async def template_vars(_=Depends(get_current_user)):
    return {"vars": {"{name}": "الاسم الأول", "{full_name}": "الاسم الكامل",
                     "{username}": "اسم المستخدم", "{message}": "النص", "{mention}": "تاغ الإشعار"},
            "example": "شكراً {name} على تعليقك!"}


@app.get("/api/admin/rules-categories")
async def rule_categories(_=Depends(get_current_user)):
    return {"categories": [
        {"id": "negative", "label": "شكوى", "color": "red"},
        {"id": "complaint", "label": "شكوى صريحة", "color": "red"},
        {"id": "price_inquiry", "label": "استفسار سعر", "color": "blue"},
        {"id": "order", "label": "طلب شراء", "color": "green"},
        {"id": "contact", "label": "طلب تواصل", "color": "purple"},
        {"id": "question", "label": "سؤال", "color": "indigo"},
        {"id": "praise", "label": "إشادة", "color": "emerald"},
        {"id": "greeting", "label": "تحية", "color": "sky"},
        {"id": "urgent", "label": "عاجل", "color": "orange"},
        {"id": "neutral", "label": "محايد", "color": "gray"},
    ]}


# ── Brand / Copyright ────────────────────────────────────────────────────

@app.get("/api/brand")
async def get_brand(db=Depends(get_db), _=Depends(get_current_user)):
    """Smart Link brand info and copyright."""
    # ponytail: BrandConfig at module level
    brand = await db.execute(select(BrandConfig).limit(1))
    brand = brand.scalar_one_or_none()
    if not brand:
        # Seed default
        brand = BrandConfig(
            brand_name="Smart Link",
            tagline="اللي يواكب التطور يسبق الجميع",
            copyright_text="© 2025 Smart Link. جميع الحقوق محفوظة. Smart Menu®",
            website="https://smart-menu-sigma.vercel.app",
            whatsapp="+218910089975",
            projects=["Smart Menu", "Smart Bot (قريباً)", "Smart POS (قريباً)"],
        )
        db.add(brand)
        await db.commit()
        await db.refresh(brand)
    return {
        "brand_name": brand.brand_name,
        "tagline": brand.tagline,
        "copyright": brand.copyright_text,
        "website": brand.website,
        "whatsapp": brand.whatsapp,
        "projects": brand.projects,
    }


@app.put("/api/brand")
async def update_brand(
    brand_name: str = Form(...), tagline: str = Form(""),
    copyright_text: str = Form(""), website: str = Form(""),
    whatsapp: str = Form(""), projects: str = Form(""),
    db=Depends(get_db), _=Depends(require_role("admin")),
):
    # ponytail: BrandConfig at module level
    brand = await db.execute(select(BrandConfig).limit(1))
    brand = brand.scalar_one_or_none()
    if not brand:
        brand = BrandConfig()
        db.add(brand)
    brand.brand_name = brand_name
    brand.tagline = tagline
    brand.copyright_text = copyright_text
    brand.website = website
    brand.whatsapp = whatsapp
    brand.projects = [p.strip() for p in projects.split(",") if p.strip()]
    await db.commit()
    return {"ok": True}


# ── CRM / Customers ──────────────────────────────────────────────────────

@app.get("/api/crm/customers")
async def crm_list(
    stage: str = Query(""), search: str = Query(""),
    page: int = Query(1), per_page: int = Query(25),
    db=Depends(get_db), current_user: User = Depends(get_current_user),
):
    # ponytail: Customer at module level
    _tid = current_user._tenant_id
    stmt = select(Customer).where(Customer.tenant_id == _tid)
    if stage:
        stmt = stmt.where(Customer.stage == stage)
    if search:
        stmt = stmt.where(
            or_(Customer.name.ilike(f"%{search}%"), Customer.phone.ilike(f"%{search}%"))
        )
    total = await db.scalar(select(func.count(Customer.id)).select_from(stmt.subquery()))
    rows = await db.execute(
        stmt.order_by(desc(Customer.last_contacted_at)).offset((page-1)*per_page).limit(per_page)
    )
    return {
        "total": total or 0, "page": page, "per_page": per_page,
        "items": [{
            "id": c.id, "name": c.name, "phone": c.phone,
            "source": c.source, "stage": c.stage,
            "total_interactions": c.total_interactions,
            "interested_in": c.interested_in,
            "last_intent": c.last_intent,
            "notes": c.notes,
            "first_seen_at": c.first_seen_at.isoformat() if c.first_seen_at else None,
            "last_contacted_at": c.last_contacted_at.isoformat() if c.last_contacted_at else None,
        } for c in rows.scalars().all()],
    }


@app.post("/api/crm/customers")
async def crm_create(
    fb_user_id: str = Form(...), name: str = Form(""),
    phone: str = Form(""), stage: str = Form("lead"),
    interested_in: str = Form(""),
    db=Depends(get_db), current_user: User = Depends(require_role("editor")),
):
    # ponytail: Customer at module level
    existing = await db.execute(select(Customer).where(Customer.fb_user_id == fb_user_id))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "العميل موجود بالفعل")
    c = Customer(fb_user_id=fb_user_id, name=name, phone=phone,
                 stage=stage, interested_in=interested_in, tenant_id=current_user._tenant_id)
    db.add(c)
    await db.commit()
    return {"id": c.id}


@app.put("/api/crm/customers/{customer_id}")
async def crm_update(
    customer_id: int, name: str = Form(""), phone: str = Form(""),
    stage: str = Form(""), notes: str = Form(""), interested_in: str = Form(""),
    db=Depends(get_db), current_user: User = Depends(require_role("editor")),
):
    # ponytail: Customer at module level
    c = (await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "العميل غير موجود")
    if name: c.name = name
    if phone: c.phone = phone
    if stage: c.stage = stage
    if notes: c.notes = notes
    if interested_in: c.interested_in = interested_in
    await db.commit()
    return {"ok": True}


# ── Alerts / Notifications ───────────────────────────────────────────────

@app.get("/api/alerts")
async def list_alerts(resolved: bool = Query(False), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    # ponytail: BotAlert at module level
    stmt = select(BotAlert).where(BotAlert.tenant_id == current_user._tenant_id, BotAlert.resolved == resolved).order_by(desc(BotAlert.created_at)).limit(20)
    rows = await db.execute(stmt)
    return [{
        "id": a.id, "type": a.alert_type, "severity": a.severity,
        "message": a.message, "resolved": a.resolved,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    } for a in rows.scalars().all()]


@app.post("/api/alerts")
async def create_alert(
    alert_type: str = Form(...), severity: str = Form("info"),
    message: str = Form(...), db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    # ponytail: BotAlert at module level
    alert = BotAlert(alert_type=alert_type, severity=severity, message=message, tenant_id=current_user._tenant_id)
    db.add(alert)
    await db.commit()
    # Broadcast via WebSocket
    try:
        from ws_manager import ws_manager
        asyncio.create_task(ws_manager.broadcast("alert", {
            "type": alert_type, "severity": severity, "message": message,
        }))
    except Exception:
        pass
    return {"id": alert.id}


@app.post("/api/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    # ponytail: BotAlert at module level
    a = (await db.execute(
        select(BotAlert).where(BotAlert.id == alert_id, BotAlert.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "التنبيه غير موجود")
    a.resolved = True
    a.resolved_at = utcnow()
    await db.commit()
    return {"ok": True}


# ── SPA catch-all: serve index.html for any unmatched browser route ──────────
@app.get("/{path:path}", response_class=HTMLResponse, include_in_schema=False)
async def spa_catch_all(path: str):
    # Don't catch API or static paths
    if path.startswith(("api/", "static/", "healthz", "webhook", "favicon")):
        return HTMLResponse("", status_code=404)
    return HTMLResponse(_get_spa())

