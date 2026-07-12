import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from _utils import utcnow
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Any

import bcrypt
import jwt
from fastapi import FastAPI, Request, Depends, Query, HTTPException, Form, Body, Response, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, func, desc, asc, cast, Date, text, or_, and_

from api_cache import APICache

from config import settings
from database import engine, AsyncSessionLocal, get_db
from models import Base, Rule, Reply, BotLog, BotState, Tenant, User, ConversationNote
from models import ReplyTemplate, AISuggestion, ConversationTag, ConversationLabel, ScheduledPost, AnalyticsEvent, BotAlert, Offer, OfferClaim, BrandConfig, Customer
from fb_client import FBClient
from bot import BotEngine, IntentAwareMatcher
from ws_manager import ws_manager
from flow_engine import FlowEngine
from sequence_engine import SequenceEngine, SequenceScheduler
from broadcast_engine import BroadcastEngine
from subscriber_engine import SubscriberEngine, TagEngine
from models import Flow, FlowExecution, Subscriber, Tag, SubscriberTag, Sequence, SequenceStep, SequenceSubscription, Broadcast, BroadcastRecipient, ConversationAssignee, ReportSchedule
from analytics_engine import AnalyticsEngine
from report_engine import ReportEngine, REPORT_DIR
from pdf_reports_engine import PdfReportsEngine, BrandingConfig
from inbox_engine import InboxEngine
from content_calendar import ContentCalendarEngine, CalendarScheduler
from team_engine import TeamEngine
from commerce_engine import CommerceEngine
from publisher_engine import PublisherEngine
from event_bus import event_bus
from logs_api import logs_router
from agent_engine import get_agent
from _crypto import encrypt_token, decrypt_token

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
fb = FBClient(settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID)
_bot_task: asyncio.Task | None = None
flow_engine = FlowEngine(fb)
sequence_engine = SequenceEngine(fb)
broadcast_engine = BroadcastEngine(fb)
subscriber_engine = SubscriberEngine()
tag_engine = TagEngine()
analytics_engine = AnalyticsEngine()
report_engine = ReportEngine(analytics_engine)
pdf_engine = PdfReportsEngine()
inbox_engine = InboxEngine(fb)
content_calendar_engine = ContentCalendarEngine(fb)
team_engine = TeamEngine()
commerce_engine = CommerceEngine()
_publisher = PublisherEngine()
api_cache = APICache()


# ── Login rate limiter: memory-based, per-IP, 5 attempts per 60s ──
_login_attempts: dict[str, list[float]] = {}
_LOGIN_RATE_LIMIT = 5
_LOGIN_RATE_WINDOW = 60
_LOGIN_CLEANUP_EVERY = 300  # purge stale IPs every 5 min
_login_last_cleanup: float = 0

_register_attempts: dict[str, list[float]] = {}
_REGISTER_RATE_LIMIT = 3
_REGISTER_RATE_WINDOW = 300


def _check_register_rate(ip: str) -> bool:
    now = time.time()
    attempts = _register_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < _REGISTER_RATE_WINDOW]
    if len(attempts) >= _REGISTER_RATE_LIMIT:
        return False
    attempts.append(now)
    _register_attempts[ip] = attempts
    return True


def _check_login_rate(ip: str) -> bool:
    global _login_last_cleanup
    now = time.time()
    # periodic full cleanup to prevent unbounded growth
    if now - _login_last_cleanup > _LOGIN_CLEANUP_EVERY:
        cutoff = now - _LOGIN_RATE_WINDOW
        _login_attempts.clear()
        _login_last_cleanup = now
    attempts = _login_attempts.get(ip, [])
    # prune old entries
    attempts = [t for t in attempts if now - t < _LOGIN_RATE_WINDOW]
    if len(attempts) >= _LOGIN_RATE_LIMIT:
        return False
    attempts.append(now)
    _login_attempts[ip] = attempts
    return True


# ── Request deduplication: serializes concurrent identical GETs → cache serves second ──
_dedup_locks: dict[str, asyncio.Lock] = {}
_dedup_lock = asyncio.Lock()


async def dedup_middleware(request: Request, call_next):
    if request.method != "GET":
        return await call_next(request)

    qp = dict(sorted(request.query_params.items())) if request.query_params else {}
    key = f"{request.method}:{request.url.path}?{json.dumps(qp, sort_keys=True)}"

    async with _dedup_lock:
        if key not in _dedup_locks:
            _dedup_locks[key] = asyncio.Lock()
        lock = _dedup_locks[key]

    async with lock:
        # ponytail: second concurrent caller will re-execute but hit the APICache if decorated
        # Remove lock entry after a brief delay to avoid unbounded growth
        response = await call_next(request)

    async with _dedup_lock:
        if key in _dedup_locks:
            del _dedup_locks[key]

    return response
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE = timedelta(hours=24)

# ponytail: detect Vercel to skip long-running background tasks
_IS_VERCEL = bool(os.getenv("VERCEL"))


def make_token(username: str, tenant_id: int = 0) -> str:
    return jwt.encode(
        {"sub": username, "tid": tenant_id, "exp": utcnow() + ACCESS_TOKEN_EXPIRE},
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )


async def get_current_user(request: Request, db=Depends(get_db)):
    token = request.cookies.get("token")
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.execute(select(User).where(User.username == payload["sub"]))
    user = user.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "User not found")
    user._tenant_id = payload.get("tid", 0)
    return user


ROLE_HIERARCHY = {"admin": 3, "editor": 2, "viewer": 1}


def require_role(min_role: str):
    async def checker(current_user: User = Depends(get_current_user)):
        if ROLE_HIERARCHY.get(current_user.role, 0) < ROLE_HIERARCHY.get(min_role, 0):
            raise HTTPException(403, "Insufficient permissions")
        return current_user
    return checker


async def seed_admin(db):
    """Seed initial admin user from env vars if no users exist."""
    count = await db.scalar(select(func.count(User.id))) or 0
    if count > 0:
        return  # ponytail: users already exist — do not reset passwords
    username = os.environ.get("INITIAL_ADMIN_USERNAME", "admin")
    password = os.environ.get("INITIAL_ADMIN_PASSWORD", "admin")
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
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
    from models import Rule
    result = await db.execute(select(Rule))
    for rule in result.scalars().all():
        if not rule.dm_template and rule.name in json_rules:
            rule.dm_template = json_rules[rule.name]
    await db.commit()
    log.info("DM templates seeded from JSON")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        # ponytail: fail-fast if default SECRET_KEY in production (belt-and-suspenders with config.py)
        if settings.SECRET_KEY == "smartbot-fallback-dev-key-change-in-production" and not settings.DEBUG:
            raise RuntimeError("SECRET_KEY is default — set SECRET_KEY env var for production")
        async with engine.connect() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Migration: add missing columns (safe — IF NOT EXISTS equivalent via try/except)
            for col_sql in [
                "ALTER TABLE rules ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 999",
                "ALTER TABLE rules ADD COLUMN IF NOT EXISTS bot_type VARCHAR(20) DEFAULT 'reply'",
                "ALTER TABLE rules ADD COLUMN IF NOT EXISTS dm_template TEXT DEFAULT ''",
                "ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'facebook'",
                "ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS fb_post_id VARCHAR(100) DEFAULT ''",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(200) DEFAULT ''",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER DEFAULT NULL",
            ]:
                try:
                    await conn.execute(text(col_sql))
                except Exception:
                    pass  # column already exists
            await conn.commit()
        log.info("DB tables ready")

        async with AsyncSessionLocal() as session:
            await seed_admin(session)
            await _seed_dm_templates(session)

        # Bot runs via background loop locally, Vercel Cron on serverless
        if settings.START_BOT and not _IS_VERCEL:
            global _bot_task
            _bot_task = asyncio.create_task(_run_bot_loop())
            log.info("Bot started in background")
        _seq_scheduler = SequenceScheduler(sequence_engine)
        asyncio.create_task(_seq_scheduler.start())
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
        await fb.close()
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

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.middleware("http")(dedup_middleware)

# Register logs API router
app.include_router(logs_router)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
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
    engine = get_bot_engine()
    while True:
        try:
            await engine.cycle()
        except Exception as e:
            log.error(f"Bot loop err: {e}")
        await asyncio.sleep(settings.BOT_INTERVAL_SECONDS)


_bot_engine_singleton: BotEngine | None = None

def get_bot_engine(fb_client: FBClient | None = None) -> BotEngine:
    global _bot_engine_singleton
    if fb_client is not None:
        _bot_engine_singleton = BotEngine(fb_client)
        return _bot_engine_singleton
    if _bot_engine_singleton is None:
        _bot_engine_singleton = BotEngine(fb)
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



@app.post("/api/login")
async def login(username: str = Form(...), password: str = Form(...), request: Request = None, db=Depends(get_db)):
    ip = request.client.host if request and request.client else "unknown"
    if not _check_login_rate(ip):
        raise HTTPException(429, "محاولات كثيرة جداً — حاول بعد 60 ثانية")
    user = await db.execute(select(User).where(or_(User.username == username, User.email == username)))
    user = user.scalar_one_or_none()
    if not user or not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(username, user.tenant_id)
    resp = JSONResponse({"ok": True, "role": user.role, "username": user.username})
    resp.set_cookie(key="token", value=token, httponly=True, secure=True, samesite="strict", max_age=int(ACCESS_TOKEN_EXPIRE.total_seconds()))
    return resp


@app.post("/api/logout")
async def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("token")
    return resp


@app.post("/api/register")
async def register(request: Request, username: str = Form(...), email: str = Form(...), password: str = Form(...), db=Depends(get_db)):
    """Register a new user. Creates both a User and a Tenant."""
    ip = request.client.host if request.client else "unknown"
    if not _check_register_rate(ip):
        raise HTTPException(429, "محاولات كثيرة جداً — حاول بعد 5 دقائق")

    if len(username) < 3:
        raise HTTPException(400, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل")
    if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        raise HTTPException(400, "البريد الإلكتروني غير صالح")

    existing = await db.execute(select(User).where(or_(User.username == username, User.email == email)))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "اسم المستخدم أو البريد موجود مسبقاً")
    if len(password) < 6:
        raise HTTPException(400, "كلمة المرور يجب أن تكون 6 أحرف على الأقل")

    tenant = Tenant(name=username)
    db.add(tenant)
    await db.flush()

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = User(username=username, email=email, password_hash=pw_hash, tenant_id=tenant.id, role="admin")
    db.add(user)
    await db.commit()

    token = make_token(username, tenant.id)
    resp = JSONResponse({"ok": True, "username": username, "tenant_id": tenant.id})
    resp.set_cookie(key="token", value=token, httponly=True, secure=True, samesite="strict", max_age=int(ACCESS_TOKEN_EXPIRE.total_seconds()))
    return resp


# ponytail: /api/pricing removed — dead endpoint, hardcoded plans in landing.jsx

@app.get("/api/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "role": current_user.role, "tenant_id": getattr(current_user, '_tenant_id', 0)}



@app.get("/api/users")
async def list_users(db=Depends(get_db), _=Depends(require_role("admin"))):
    rows = await db.execute(select(User).order_by(User.id))
    return [{"id": u.id, "username": u.username, "role": u.role, "created_at": u.created_at.isoformat() if u.created_at else None}
            for u in rows.scalars().all()]


@app.post("/api/users")
async def create_user(username: str = Form(...), password: str = Form(...), role: str = Form("viewer"),
                      db=Depends(get_db), _=Depends(require_role("admin"))):
    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Username exists")
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user = User(username=username, password_hash=pw_hash, role=role)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id}


@app.put("/api/users/{user_id}")
async def update_user(user_id: int, role: str = Form(...), password: str = Form(""),
                      db=Depends(get_db), _=Depends(require_role("admin"))):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.role = role
    if password:
        user.password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    await db.commit()
    return {"ok": True}


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == current_user.id:
        raise HTTPException(400, "Cannot delete yourself")
    await db.delete(user)
    await db.commit()
    return {"ok": True}



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
    return {"ok": True}


@app.get("/api/env")
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


@app.get("/api/debug")
async def debug(_=Depends(get_current_user)):
    return {
        "has_secret_key": bool(settings.SECRET_KEY),
        "has_db_url": bool(settings.DATABASE_URL),
        "has_fb_token": bool(settings.FACEBOOK_ACCESS_TOKEN),
        "has_fb_page": bool(settings.FACEBOOK_PAGE_ID),
        "debug_mode": settings.DEBUG,
        "bot_interval": settings.BOT_INTERVAL_SECONDS,
        "start_bot": settings.START_BOT,
        "db_type": "sqlite" if not settings.DATABASE_URL else "postgres",
        "python_version": __import__("sys").version,
    }



@app.get("/", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    static_index = STATIC_DIR / "index.html"
    if static_index.exists():
        return HTMLResponse(static_index.read_text(encoding="utf-8"))
    html_path = TEMPLATES_DIR / "index.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>SmartBot Dashboard</h1><p>Loading...</p>")


# ── Static file caching headers ────────────────────────────────────────────────
@app.middleware("http")
async def static_cache_middleware(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/") and "?" in request.url.path:
        # ponytail: hashed assets (vite-style), immutable
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif request.url.path in ("/", "/index.html"):
        response.headers["Cache-Control"] = "no-cache"
    return response


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

        # Recent replies — last 5
        recent_replies_data = await db.execute(
            select(Reply).where(Reply.tenant_id == _tid).order_by(desc(Reply.created_at)).limit(5)
        )
        recent_replies = [{
            "id": r.id, "commenter_name": r.commenter_name, "comment_text": r.comment_text,
            "reply_text": r.reply_text, "fb_comment_id": r.fb_comment_id,
            "rule_id": r.rule_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in recent_replies_data.scalars().all()]

        return {
            "stats": {
                "total_replies": total_replies,
                "today_replies": today_replies,
                "fan_count": fan_count,
                "top_rule_id": int(top[0]) if top and top[0] is not None else None,
                "chart": chart,
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

@app.get("/api/rules")
async def list_rules(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    rows = await db.execute(select(Rule).where(Rule.tenant_id == _tid).order_by(Rule.id))
    rules = rows.scalars().all()
    counts_stmt = select(Reply.rule_id, func.count(Reply.id).label("cnt")).where(Reply.tenant_id == _tid).group_by(Reply.rule_id)
    counts = {row[0]: row[1] for row in (await db.execute(counts_stmt))}
    return [{
        "id": r.id, "name": r.name, "keywords": r.keywords,
        "reply_template": r.reply_template,
        "dm_template": r.dm_template or "",
        "enabled": r.enabled, "description": r.description,
        "bot_type": "reply",
        "priority": getattr(r, "priority", 999),
        "replies_count": counts.get(r.id, 0),
    } for r in rules]


@app.post("/api/rules")
async def create_rule(
    name: str = Form(...), keywords: str = Form(...),
    reply_template: str = Form(...), description: str = Form(""),
    bot_type: str = Form("reply"), dm_template: str = Form(""),
    db=Depends(get_db), current_user: User = Depends(require_role("editor")),
):
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()]
    rule = Rule(name=name, keywords=kw_list, reply_template=reply_template,
                description=description, dm_template=dm_template)
    rule.tenant_id = current_user._tenant_id
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"id": rule.id}


@app.put("/api/rules/{rule_id}")
async def update_rule(
    rule_id: int, name: str = Form(...), keywords: str = Form(...),
    reply_template: str = Form(...), description: str = Form(""),
    dm_template: str = Form(""),
    db=Depends(get_db), _=Depends(require_role("editor")),
):
    rule = await db.get(Rule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    rule.name = name
    rule.keywords = [k.strip() for k in keywords.split(",") if k.strip()]
    rule.reply_template = reply_template
    rule.dm_template = dm_template
    rule.description = description
    await db.commit()
    return {"ok": True}


@app.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    rule = await db.get(Rule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    await db.delete(rule)
    await db.commit()
    return {"ok": True}


@app.post("/api/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    rule = await db.get(Rule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    rule.enabled = not rule.enabled
    await db.commit()
    return {"enabled": rule.enabled}



@app.get("/api/replies")
async def list_replies(page: int = Query(1), per_page: int = Query(20), rule_id: int = Query(None), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    offset = (page - 1) * per_page
    stmt = select(Reply).where(Reply.tenant_id == _tid)
    if rule_id:
        stmt = stmt.where(Reply.rule_id == rule_id)
        total = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid, Reply.rule_id == rule_id))
    else:
        total = await db.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == _tid))
    rows = await db.execute(
        stmt.order_by(desc(Reply.created_at)).offset(offset).limit(per_page)
    )
    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [{
            "id": r.id, "commenter_name": r.commenter_name, "comment_text": r.comment_text,
            "reply_text": r.reply_text, "fb_comment_id": r.fb_comment_id,
            "rule_id": r.rule_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows.scalars().all()]
    }


@app.get("/api/comments")
async def list_comments(limit: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    all_comments = await fb.get_recent_comments(limit)
    # Pre‑fetch replied_at for all known fb_comment_ids
    fb_ids = [c["id"] for c in all_comments if c.get("id")]
    replied_map = {}
    if fb_ids:
        rows = await db.execute(
            select(Reply.fb_comment_id, Reply.reply_text, Reply.created_at)
            .where(Reply.tenant_id == _tid, Reply.fb_comment_id.in_(fb_ids))
        )
        for r in rows:
            replied_map[r.fb_comment_id] = {
                "replied_at": r.created_at.isoformat() if r.created_at else None,
                "reply_text": r.reply_text,
            }
    items = []
    for c in all_comments:
        from_data = c.get("from", {}) or {}
        cid = c.get("id", "")
        extra = replied_map.get(cid, {})
        items.append({
            "id": cid,
            "message": c.get("message", ""),
            "from_name": from_data.get("name", ""),
            "from_id": from_data.get("id", ""),
            "created_time": c.get("created_time", ""),
            "post_id": c.get("_post_id", ""),
            "post_message": c.get("_post_message", ""),
            "replied_at": extra.get("replied_at"),
            "reply_text": extra.get("reply_text"),
        })
    items.sort(key=lambda x: x.get("created_time", ""), reverse=True)
    items = items[:limit]
    return {"items": items}


@app.post("/api/comments/{comment_id}/hide")
async def hide_comment(comment_id: str, _=Depends(require_role("editor"))):
    result = await fb.hide_comment(comment_id)
    if not result:
        raise HTTPException(400, "Failed to hide comment")
    return {"ok": True}


@app.delete("/api/comments/{comment_id}")
async def delete_api_comment(comment_id: str, _=Depends(require_role("editor"))):
    result = await fb.delete_comment(comment_id)
    if not result:
        raise HTTPException(400, "Failed to delete comment")
    return {"ok": True}


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



@app.post("/api/replies/{comment_id}/reply")
async def reply_to_comment(comment_id: str, message: str = Form(...), db=Depends(get_db),
                           current_user: User = Depends(require_role("editor"))):
    result = await fb.reply_to_comment(comment_id, message)
    if not result:
        raise HTTPException(400, "Failed to send reply")
    # Fetch original comment context from FB for accurate recording
    commenter_name = "[يدوي]"
    comment_text = message
    try:
        comment_data = await fb._get(comment_id, {"fields": "from{name},message,parent"})
        if comment_data:
            from_data = comment_data.get("from", {}) or {}
            commenter_name = from_data.get("name", commenter_name)
            comment_text = comment_data.get("message", comment_text)
    except Exception:
        pass  # ponytail: non-critical enrichment; keep placeholders on failure
    reply = Reply(
        commenter_name=commenter_name,
        comment_text=comment_text,
        reply_text=message,
        fb_comment_id=comment_id,
        fb_post_id="",
        rule_id=None,
        tenant_id=current_user._tenant_id,
    )
    db.add(reply)
    await db.commit()
    log.info(f"Manual reply: user={current_user.username} comment={comment_id} reply_id={reply.id}")
    await ws_manager.broadcast("new_reply")
    await ws_manager.broadcast("notification")
    return {"ok": True, "reply_id": reply.id}



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



@app.get("/api/bot/status")
async def bot_status(_=Depends(get_current_user)):
    # On Vercel, bot runs as short-lived cycles triggered by dashboard.
    # running=true means a cycle is currently executing — not needed for normal UX.
    return {
        "running": _IS_VERCEL or (_bot_task is not None and not _bot_task.done()),
        "interval": settings.BOT_INTERVAL_SECONDS,
        "mode": "vercel-on-demand" if _IS_VERCEL else "background-loop",
    }


@app.post("/api/bot/restart")
async def restart_bot(_=Depends(require_role("admin"))):
    global _bot_task
    if _bot_task:
        _bot_task.cancel()
    _bot_task = asyncio.create_task(_run_bot_loop())
    asyncio.create_task(ws_manager.broadcast("notification", {
        "type": "bot_started", "title": "تم تشغيل البوت",
        "message": "تم إعادة تشغيل البوت بنجاح", "link": "/settings",
    }))
    return {"ok": True}


@app.post("/api/bot/stop")
async def stop_bot(_=Depends(require_role("admin"))):
    global _bot_task
    if _bot_task and not _bot_task.done():
        _bot_task.cancel()
        _bot_task = None
    asyncio.create_task(ws_manager.broadcast("notification", {
        "type": "bot_stopped", "title": "تم إيقاف البوت",
        "message": "تم إيقاف البوت يدوياً", "link": "/settings",
    }))
    return {"ok": True}


@app.post("/api/bot/interval")
async def set_bot_interval(interval: int = Form(...), _=Depends(require_role("admin"))):
    if interval < 3 or interval > 3600:
        raise HTTPException(400, "Interval must be between 3 and 3600 seconds")
    settings.BOT_INTERVAL_SECONDS = interval
    return {"ok": True, "interval": interval}


_cron_lock = asyncio.Lock()

@app.get("/api/cron/bot-cycle")
async def cron_bot_cycle(request: Request):
    """Vercel Cron: runs one bot cycle per active tenant. Auth via CRON_SECRET env var."""
    secret = os.getenv("CRON_SECRET")
    if not secret or request.headers.get("authorization", "") != f"Bearer {secret}":
        raise HTTPException(403, "Unauthorized cron")
    async with _cron_lock:
        try:
            async with AsyncSessionLocal() as db:
                tenants = await db.execute(select(Tenant).where(Tenant.is_active == True))
            results = []
            for tenant in tenants.scalars().all():
                fb_cli = await get_tenant_fb_client(tenant.id)
                if not fb_cli:
                    continue
                engine = get_bot_engine(fb_cli)
                await engine.cycle()
                results.append({"tenant_id": tenant.id, "status": "ok"})
            return {"ok": True, "tenants_processed": len(results)}
        except Exception as e:
            log.error(f"Cron bot cycle error: {e}")
            return {"ok": False, "error": str(e)[:200]}



@app.get("/api/logs")
async def get_logs(limit: int = Query(50), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await db.execute(
        select(BotLog).where(BotLog.tenant_id == current_user._tenant_id).order_by(desc(BotLog.created_at)).limit(limit)
    )
    return [{
        "level": r.level, "message": r.message,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows.scalars().all()]


@app.post("/api/logs/clear")
async def clear_logs(payload: dict = None, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    _tid = current_user._tenant_id
    days = (payload or {}).get("days", 30)
    cutoff = utcnow() - timedelta(days=days)
    result = await db.execute(select(func.count(BotLog.id)).where(BotLog.tenant_id == _tid, BotLog.created_at < cutoff))
    count = result.scalar() or 0
    await db.execute(BotLog.__table__.delete().where(BotLog.tenant_id == _tid, BotLog.created_at < cutoff))
    await db.commit()
    return {"deleted": count}


# ponytail: WEBHOOK globals — defined early, used by /api/webhook/check and /webhook endpoints
WEBHOOK_VERIFY_TOKEN = os.getenv("FB_WEBHOOK_VERIFY_TOKEN", "smartbot_verify_123")
WEBHOOK_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")
if not WEBHOOK_APP_SECRET:
    log.warning("FACEBOOK_APP_SECRET not set — webhook HMAC verification disabled")


@app.get("/api/webhook/events")
async def get_webhook_events(limit: int = Query(20), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await db.execute(
        select(BotLog).where(BotLog.tenant_id == current_user._tenant_id, BotLog.message.contains("webhook")).order_by(desc(BotLog.created_at)).limit(limit)
    )
    return [{
        "id": r.id, "level": r.level, "message": r.message,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows.scalars().all()]



@app.get("/api/webhook/check")
async def check_webhook(_=Depends(get_current_user)):
    """Check if webhook is properly configured."""
    webhook_url = os.getenv("RENDER_EXTERNAL_URL") or os.getenv("VERCEL_URL") or ""
    if webhook_url and not webhook_url.startswith("http"):
        webhook_url = "https://" + webhook_url
    webhook_url += "/webhook"
    if not webhook_url.startswith("http"):
        webhook_url = "https://smartbot-6lxo.onrender.com/webhook"
    return {
        "configured": bool(WEBHOOK_APP_SECRET),
        "verify_token": "***" if WEBHOOK_VERIFY_TOKEN else "",
        "webhook_url": webhook_url,
        "instructions": [
            "1. Go to https://developers.facebook.com/apps",
            "2. Select your app -> Webhooks -> Page",
            "3. Set Callback URL to: " + webhook_url,
            "4. Set Verify Token in your Facebook app settings",
            "5. Subscribe to 'feed' field",
            "6. After setup, POST /api/webhook/test to verify",
        ],
    }


@app.get("/api/webhook/test")
async def test_facebook_comment_flow(_=Depends(get_current_user)):
    """Simulate a test comment flow — fetches latest posts and tries to reply."""
    try:
        engine = get_bot_engine()
        await engine.cycle()
        return {"ok": True, "message": "Bot cycle completed successfully"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}


@app.post("/api/webhook/test")
async def trigger_bot_cycle(_=Depends(require_role("admin"))):
    """Trigger an immediate bot cycle to check for new comments."""
    asyncio.create_task(_run_single_cycle())
    return {"ok": True, "message": "Bot cycle triggered — check /api/logs for results"}


async def _run_single_cycle():
    try:
        engine = get_bot_engine()
        await engine.cycle()
    except Exception as e:
        log.error(f"Forced cycle error: {e}")


@app.post("/api/bot/trigger")
async def trigger_manual_reply(_=Depends(require_role("admin"))):
    """Force one bot cycle NOW — useful after commenting on Facebook."""
    asyncio.create_task(_run_single_cycle())
    return {"ok": True, "message": "Bot cycle triggered — replies will appear in /api/logs"}


# ═══════════════════════════════════════════════════════════════════════════════
# :: PROFESSIONAL FEATURES ::
# ═══════════════════════════════════════════════════════════════════════════════

# ── AI Powered Replies ────────────────────────────────────────────────────────

@app.post("/api/ai/suggest")
async def ai_suggest_replies(
    comment_text: str = Form(...), commenter_name: str = Form(""), page_context: str = Form(""),
    _=Depends(get_current_user),
):
    """Generate 3 AI-powered reply suggestions for a comment."""
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل — قم بتعيين OPENAI_API_KEY أو GEMINI_API_KEY في المتغيرات")
    t0 = __import__("time").time()
    result = await ai.suggest_replies(comment_text, commenter_name, page_context)
    latency = int((__import__("time").time() - t0) * 1000)
    return {"suggestions": result.get("suggestions", []), "intent": result.get("intent", ""),
            "sentiment": result.get("sentiment", ""), "confidence": result.get("confidence", 0), "latency_ms": latency}


@app.post("/api/ai/analyze")
async def ai_analyze_tone(comment_text: str = Form(...), _=Depends(get_current_user)):
    """Analyze comment tone, sentiment, urgency."""
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل")
    result = await ai.analyze_tone(comment_text)
    return result


@app.post("/api/ai/generate-reply")
async def ai_generate_reply(
    comment_text: str = Form(...), commenter_name: str = Form(""),
    tone: str = Form(""), keywords: str = Form(""), _=Depends(require_role("editor")),
):
    """Generate one auto-reply with keyword context."""
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل")
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else None
    reply = await ai.generate_reply(comment_text, commenter_name, tone, kw_list)
    return {"reply": reply or ""}


@app.post("/api/ai/analyze-image")
async def ai_analyze_image(data: dict = Body(...), _: User = Depends(require_role("editor"))):
    ai = get_ai()
    if not ai.available:
        return {"analysis": ""}
    text = data.get("text", "")
    prompt = f"حلل هذا الطلب: {text}\n\nماذا يحتوي؟ قدم وصف مختصر بالعربية"
    try:
        if ai._provider == "openai" and ai._openai_client:
            r = await ai._openai_client.chat.completions.create(
                model=ai._openai_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=100, temperature=0.3,
            )
            return {"analysis": (r.choices[0].message.content or "").strip()[:100]}
        elif ai._provider == "gemini" and ai._google_module:
            model = ai._google_module.GenerativeModel(ai._model)
            r = await model.generate_content_async(prompt)
            return {"analysis": (r.text or "").strip()[:100]}
    except Exception:
        pass
    return {"analysis": ""}


@app.get("/api/ai/status")
async def ai_status(_=Depends(get_current_user)):
    """Check AI provider status."""
    ai = get_ai()
    return {"available": ai.available, "provider": ai.provider_name}


@app.post("/api/agent/interpret")
async def agent_interpret(
    text: str = Form(...),
    image: UploadFile | None = File(None),
    has_image: str = Form(""),
    db=Depends(get_db),
    current_user: User = Depends(require_role("editor")),
):
    """AI Agent: interpret Arabic command, auto-execute via brain+tools+memory."""
    agent = get_agent()

    # Handle image upload — compress with Pillow before save
    image_url = ""
    if image and has_image == "true":
        img_data = await image.read()
        if len(img_data) > 10 * 1024 * 1024:
            raise HTTPException(400, "Image too large — max 10MB")
        try:
            from PIL import Image as PILImage
            import io
            pil_img = PILImage.open(io.BytesIO(img_data))
            # Convert RGBA/P to RGB for JPEG save compatibility
            if pil_img.mode in ("RGBA", "P"):
                pil_img = pil_img.convert("RGB")
            # Resize if wider than 2048px (vision model limit)
            max_dim = 2048
            if pil_img.width > max_dim or pil_img.height > max_dim:
                ratio = min(max_dim / pil_img.width, max_dim / pil_img.height)
                new_size = (int(pil_img.width * ratio), int(pil_img.height * ratio))
                pil_img = pil_img.resize(new_size, PILImage.LANCZOS)
            buf = io.BytesIO()
            pil_img.save(buf, "JPEG", quality=85, optimize=True)
            compressed = buf.getvalue()
            log.info(f"Image compressed: {len(img_data)}→{len(compressed)} bytes ({pil_img.width}x{pil_img.height})")
            from pathlib import PurePosixPath
            safe_name = os.path.basename(image.filename or "photo.jpg")
            img_filename = f"agent_{int(time.time())}_{safe_name}"
            img_path = STATIC_DIR / "uploads" / img_filename
            img_path.parent.mkdir(parents=True, exist_ok=True)
            img_path.write_bytes(compressed)
            image_url = f"/static/uploads/{img_filename}"
        except ImportError:
            # Pillow not installed — save raw
            safe_name = os.path.basename(image.filename or "photo.jpg")
            img_filename = f"agent_{int(time.time())}_{safe_name}"
            img_path = STATIC_DIR / "uploads" / img_filename
            img_path.parent.mkdir(parents=True, exist_ok=True)
            img_path.write_bytes(img_data)
            image_url = f"/static/uploads/{img_filename}"
        except Exception as e:
            log.warning(f"Image compression failed, saving raw: {e}")
            safe_name = os.path.basename(image.filename or "photo.jpg")
            img_filename = f"agent_{int(time.time())}_{safe_name}"
            img_path = STATIC_DIR / "uploads" / img_filename
            img_path.parent.mkdir(parents=True, exist_ok=True)
            img_path.write_bytes(img_data)
            image_url = f"/static/uploads/{img_filename}"

    try:
        result = await agent.process(text, image_url=image_url, username=current_user.username, db=db)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log.error(f"agent.process failed: {e}\n{tb}")
        return {"action": "error", "params": {}, "response_ar": f"خطأ: {str(e)[:200]}",
                "data": {}, "success": False}

    # Broadcast via event_bus → SSE reaches all dashboard clients
    asyncio.create_task(event_bus.emit("agent_message", {
        "role": "agent", "text": result.get("response_ar", ""),
        "action": result.get("action", "unknown"),
        "success": result.get("success", False),
    }))

    return {
        "action": result.get("action", "unknown"),
        "params": result.get("params", {}),
        "response_ar": result.get("response_ar", ""),
        "data": result.get("data", {}),
        "success": result.get("success", False),
    }


# ── Agent Memory Endpoints ─────────────────────────────────────────────

@app.get("/api/agent/memory")
async def agent_get_memory(db=Depends(get_db), current_user=Depends(get_current_user)):
    """View current agent session history + user memory."""
    import agent_memory as amem
    session = await amem.get_session(db, current_user.username)
    user = await amem.get_user_memory(db, current_user.username)
    return {"session": session[-10:], "user_memory": user}


@app.post("/api/agent/memory/clear")
async def agent_clear_memory(db=Depends(get_db), current_user=Depends(get_current_user)):
    """Reset session history (keeps user memory/preferences)."""
    import agent_memory as amem
    await amem.clear_session(db, current_user.username)
    return {"ok": True, "message": "تم مسح الذاكرة المؤقتة ✅"}


# ── Smart Inbox (Professional Conversations) ─────────────────────────────────

@app.get("/api/inbox/conversations")
async def inbox_list(
    status: str = Query("all"), tag: str = Query(""), search: str = Query(""),
    page: int = Query(1), per_page: int = Query(25), _=Depends(get_current_user),
):
    """Professional inbox: list conversations with filters, tags, search."""
    convos = await fb.get_conversations(50)
    items = []
    for c in convos:
        items.append({
            "id": c["id"], "subject": c.get("subject", "بدون موضوع"),
            "senders": c.get("senders", {}).get("data", []),
            "message_count": c.get("message_count", 0),
            "unread_count": c.get("unread_count", 0),
            "updated_time": c.get("updated_time", ""),
            "tags": [],  # populated below
        })

    # Load tags from DB for all conversation IDs
    if items:
        async with AsyncSessionLocal() as s:
            ids = [it["id"] for it in items]
            lbls = await s.execute(
                select(ConversationLabel, ConversationTag)
                .join(ConversationTag, ConversationLabel.tag_id == ConversationTag.id)
                .where(ConversationLabel.conversation_id.in_(ids))
            )
            tag_map: dict[str, list] = {}
            for lbl, tag in lbls:
                tag_map.setdefault(lbl.conversation_id, []).append({"id": tag.id, "name": tag.name, "color": tag.color})
            for it in items:
                it["tags"] = tag_map.get(it["id"], [])

    # Server-side search filter
    if search:
        sl = search.lower()
        items = [it for it in items if sl in it["subject"].lower()
                 or any(sl in (s.get("name", "") or "").lower() for s in it["senders"])]

    # Tag filter
    if tag:
        items = [it for it in items if any(t["name"] == tag for t in it["tags"])]

    # Status filter
    if status == "unread":
        items = [it for it in items if it["unread_count"] > 0]
    elif status == "read":
        items = [it for it in items if it["unread_count"] == 0]
    elif status == "needs_reply":
        items = [it for it in items if it["unread_count"] > 0 and it["message_count"] > 0]

    total = len(items)
    offset = (page - 1) * per_page
    paged = items[offset:offset + per_page]
    return {"items": paged, "total": total, "page": page, "per_page": per_page}


@app.get("/api/inbox/conversations/{conversation_id}")
async def inbox_messages(conversation_id: str, _=Depends(get_current_user)):
    """Get full conversation messages with AI analysis hints."""
    messages = await fb.get_conversation_messages(conversation_id)
    return [{
        "id": m["id"], "message": m.get("message", ""),
        "from": m.get("from", {}),
        "created_time": m.get("created_time", ""),
    } for m in messages]


@app.post("/api/inbox/conversations/{conversation_id}/reply")
async def inbox_reply(
    conversation_id: str, message: str = Form(...),
    _=Depends(require_role("editor")),
):
    """Send a reply in a conversation. Tries Messenger first, falls back to private_reply."""
    # Try Messenger conversation reply
    result = await fb.send_conversation_message(conversation_id, message)
    if result:
        _track_event("inbox_reply_sent", {"conversation_id": conversation_id})
        return {"ok": True}

    # Fallback: try private_reply (works for ANY comment, no prior conversation needed)
    result = await fb.send_private_reply(conversation_id, message)
    if result and not result.get("_error"):
        _track_event("inbox_reply_sent", {"conversation_id": conversation_id})
        return {"ok": True}

    raise HTTPException(400, "لم يتم الرد — راجع سجل الخادم لتفاصيل خطأ فيسبوك")


@app.post("/api/debug/fb-reply")
async def debug_fb_reply(
    conversation_id: str = Form(...), message: str = Form("اهلا"),
    _=Depends(require_role("admin")),
):
    """Debug endpoint that shows raw Facebook API response."""
    import httpx
    async with httpx.AsyncClient(timeout=15) as client:
        page_id = settings.FACEBOOK_PAGE_ID
        tok = settings.FACEBOOK_ACCESS_TOKEN

        # ── Get the conversation to find real user ID ──
        conv = await client.get(
            f"https://graph.facebook.com/v22.0/{conversation_id}",
            params={"access_token": tok, "fields": "senders{id,name},messages.limit(1){from{id,name}}"},
        )
        conv_data = conv.json() if conv.status_code == 200 else {}
        senders = (conv_data.get("senders", {}) or {}).get("data", [])
        user_id = None
        for s in senders:
            sid = str(s.get("id", ""))
            if sid != str(page_id):
                user_id = sid
                break

        # ── Method 1: direct conv message ──
        d = {"access_token": tok, "message": message}
        r1 = await client.post(f"https://graph.facebook.com/v22.0/{conversation_id}/messages", data=d)
        m1 = {"status": r1.status_code, "body": r1.text[:500]}

        # ── Method 2: RESPONSE type (correct for replying to existing thread) ──
        r2 = await client.post(f"https://graph.facebook.com/v22.0/{page_id}/messages", data={
            "access_token": tok,
            "recipient": json.dumps({"id": user_id or conversation_id.replace("t_", "")}),
            "message": json.dumps({"text": message}),
            "messaging_type": "RESPONSE",
        })
        m2 = {"status": r2.status_code, "body": r2.text[:500]}

        # ── Method 3: UPDATE type ──
        r3 = await client.post(f"https://graph.facebook.com/v22.0/{page_id}/messages", data={
            "access_token": tok,
            "recipient": json.dumps({"id": user_id or conversation_id.replace("t_", "")}),
            "message": json.dumps({"text": message}),
            "messaging_type": "UPDATE",
        })
        m3 = {"status": r3.status_code, "body": r3.text[:500]}

        # ── Method 4: explicit conversation sender ID ──
        r4 = None
        msg_senders = (conv_data.get("messages", {}) or {}).get("data", [])
        if msg_senders:
            from_id = str((msg_senders[0].get("from", {}) or {}).get("id", ""))
            if from_id and from_id != str(page_id):
                r4 = await client.post(f"https://graph.facebook.com/v22.0/{page_id}/messages", data={
                    "access_token": tok,
                    "recipient": json.dumps({"id": from_id}),
                    "message": json.dumps({"text": message}),
                    "messaging_type": "RESPONSE",
                })
                r4 = {"status": r4.status_code, "body": r4.text[:500]}
        else:
            r4 = {"status": "skip", "body": "no messages found"}

        # ── Method 5: token permissions check ──
        r5 = await client.get(f"https://graph.facebook.com/v22.0/{page_id}", params={
            "access_token": tok,
            "fields": "access_token,id,name",
        })

        return {
            "found_user_id": user_id,
            "conv_data": {"status": conv.status_code, "data": conv_data},
            "methods": {
                "1_direct_conv": m1,
                "2_response_with_uid": m2,
                "3_update": m3,
                "4_msg_sender_id": r4,
            },
            "page_id": page_id,
            "page_info": {"status": r5.status_code, "body": r5.text[:500]},
        }


@app.get("/api/inbox/tags")
async def inbox_list_tags(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all conversation tags."""
    rows = await db.execute(select(ConversationTag).where(ConversationTag.tenant_id == current_user._tenant_id))
    return [{"id": t.id, "name": t.name, "color": t.color} for t in rows.scalars().all()]


@app.post("/api/inbox/tags")
async def inbox_create_tag(name: str = Form(...), color: str = Form("#6366f1"),
                           db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    """Create a new tag."""
    existing = await db.execute(select(ConversationTag).where(ConversationTag.name == name))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "اسم الوسم موجود مسبقاً")
    tag = ConversationTag(name=name, color=color, tenant_id=current_user._tenant_id)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return {"id": tag.id, "name": tag.name, "color": tag.color}


@app.delete("/api/inbox/tags/{tag_id}")
async def inbox_delete_tag(tag_id: int, db=Depends(get_db), _=Depends(require_role("admin"))):
    tag = await db.get(ConversationTag, tag_id)
    if not tag:
        raise HTTPException(404, "الوسم غير موجود")
    await db.execute(ConversationLabel.__table__.delete().where(ConversationLabel.tag_id == tag_id))
    await db.delete(tag)
    await db.commit()
    return {"ok": True}


@app.post("/api/inbox/conversations/{conv_id}/tags")
async def inbox_assign_tag(conv_id: str, tag_id: int = Form(...),
                           db=Depends(get_db), _=Depends(require_role("editor"))):
    """Assign a tag to a conversation."""
    tag = await db.get(ConversationTag, tag_id)
    if not tag:
        raise HTTPException(404, "الوسم غير موجود")
    existing = await db.execute(
        select(ConversationLabel).where(
            and_(ConversationLabel.conversation_id == conv_id, ConversationLabel.tag_id == tag_id))
    )
    if not existing.scalar_one_or_none():
        db.add(ConversationLabel(conversation_id=conv_id, tag_id=tag_id))
        await db.commit()
    return {"ok": True}


@app.delete("/api/inbox/conversations/{conv_id}/tags/{tag_id}")
async def inbox_remove_tag(conv_id: str, tag_id: int,
                           db=Depends(get_db), _=Depends(require_role("editor"))):
    await db.execute(
        ConversationLabel.__table__.delete().where(
            and_(ConversationLabel.conversation_id == conv_id, ConversationLabel.tag_id == tag_id))
    )
    await db.commit()
    return {"ok": True}


@app.post("/api/inbox/conversations/{conv_id}/assign")
async def inbox_assign_user(conv_id: str, user_id: int = Form(...),
                             db=Depends(get_db), current_user=Depends(require_role("editor"))):
    """Assign a user to a conversation."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    await inbox_engine.assign_user(conv_id, user_id, db)
    _track_event("conversation_assigned", {"conv_id": conv_id, "user_id": user_id})
    return {"ok": True}


@app.post("/api/inbox/conversations/{conv_id}/unassign")
async def inbox_unassign_user(conv_id: str, user_id: int = Form(...),
                               db=Depends(get_db), _=Depends(require_role("editor"))):
    """Remove user assignment from a conversation."""
    ok = await inbox_engine.unassign_user(conv_id, user_id, db)
    if not ok:
        raise HTTPException(404, "التعيين غير موجود")
    return {"ok": True}


@app.get("/api/inbox/conversations/{conv_id}/assignee")
async def inbox_get_assignee(conv_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    """Get the assigned user for a conversation."""
    result = await inbox_engine.get_assignee(conv_id, db)
    return result or {"user_id": None, "username": "", "assigned_at": None}


@app.get("/api/inbox/conversations/{conv_id}/notes")
async def inbox_list_notes(conv_id: str, db=Depends(get_db), _=Depends(get_current_user)):
    """Get all notes for a conversation."""
    return await inbox_engine.get_notes(conv_id, db)


@app.post("/api/inbox/conversations/{conv_id}/notes")
async def inbox_create_note(conv_id: str, content: str = Form(...),
                             db=Depends(get_db), current_user=Depends(require_role("editor"))):
    """Add a note to a conversation."""
    note = await inbox_engine.add_note(conv_id, content, current_user.username, db)
    return note


@app.delete("/api/inbox/notes/{note_id}")
async def inbox_delete_note(note_id: int, db=Depends(get_db),
                             current_user=Depends(require_role("editor"))):
    """Delete a note."""
    note = await db.get(ConversationNote, note_id)
    if not note:
        raise HTTPException(404, "الملاحظة غير موجودة")
    if current_user.role != "admin" and note.created_by != current_user.username:
        raise HTTPException(403, "ليس لديك صلاحية حذف هذه الملاحظة")
    ok = await inbox_engine.delete_note(note_id, db)
    return {"ok": ok}


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
                          db=Depends(get_db), _=Depends(require_role("editor"))):
    t = await db.get(ReplyTemplate, template_id)
    if not t:
        raise HTTPException(404, "القالب غير موجود")
    t.name = name; t.text = text; t.category = category; t.shortcut = shortcut
    await db.commit()
    return {"ok": True}


@app.delete("/api/templates/{template_id}")
async def delete_template(template_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    t = await db.get(ReplyTemplate, template_id)
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
                                 _=Depends(require_role("editor"))):
    """Publish a scheduled post immediately or at its scheduled time."""
    post = await db.get(ScheduledPost, post_id)
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
                                _=Depends(require_role("editor"))):
    post = await db.get(ScheduledPost, post_id)
    if not post:
        raise HTTPException(404, "المنشور غير موجود")
    await db.delete(post)
    await db.commit()
    return {"ok": True}


# ── Advanced Analytics ───────────────────────────────────────────────────────

@app.get("/api/analytics/overview")
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
    try: fan_count = await fb.get_page_fan_count()
    except Exception: pass

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


@app.get("/api/analytics/export")
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


@app.get("/api/analytics/scheduler-check")
async def analytics_scheduler_check(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Check and publish overdue scheduled posts."""
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
            result = await fb.post_to_page(post.message)
        else:
            _publisher.load_credentials(db)
            result = await _publisher.publish_to_platform(platform, post.message, post.image_url)
        if result:
            post.status = "published"
            post.fb_post_id = result.get("post_id", "")
            post.published_at = now
            published += 1
    await db.commit()
    return {"published": published}


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
async def resolve_alert(alert_id: int, db=Depends(get_db), _=Depends(require_role("admin"))):
    alert = await db.get(BotAlert, alert_id)
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
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        await ws.close(code=4001, reason="Invalid or expired token")
        return
    ws_tid = payload.get("tid", 0)
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

def _track_event(event_type: str, metadata: dict | None = None):
    """Async-fire AnalyticsEvent (non-blocking)."""
    async def _write():
        try:
            async with AsyncSessionLocal() as s:
                s.add(AnalyticsEvent(event_type=event_type, metadata_json=json.dumps(metadata or {}, ensure_ascii=False)))
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
        return int(hub_challenge)
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
        await engine.process_single_comment(comment, post_id)
        _track_event("webhook_comment_processed", {"comment_id": comment.get("id","")})
    except Exception as e:
        log.error(f"Webhook comment processing error: {e}", exc_info=True)


# ═══════════════════════════════════════════════════════════════════════════════
# :: SMART ARMY FEATURES ::
# ═══════════════════════════════════════════════════════════════════════════════

# ── FLOWS API ─────────────────────────────────────────────────────────────────

@app.get("/api/flows")
async def list_flows(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await db.execute(select(Flow).where(Flow.tenant_id == current_user._tenant_id).order_by(Flow.created_at.desc()))
    return [{
        "id": f.id, "name": f.name, "description": f.description,
        "status": f.status, "version": f.version, "total_replies": f.total_replies,
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
    } for f in rows.scalars().all()]


@app.post("/api/flows")
async def create_flow(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    body = await request.json()
    flow = Flow(
        name=body["name"],
        description=body.get("description", ""),
        nodes=body.get("nodes", []),
        edges=body.get("edges", []),
        tenant_id=current_user._tenant_id,
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    return {"id": flow.id}


@app.get("/api/flows/{flow_id}")
async def get_flow(flow_id: int, db=Depends(get_db), _=Depends(get_current_user)):
    flow = await db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404, "Flow not found")
    return {
        "id": flow.id, "name": flow.name, "description": flow.description,
        "nodes": flow.nodes, "edges": flow.edges,
        "status": flow.status, "version": flow.version,
        "total_replies": flow.total_replies,
        "created_by": flow.created_by,
        "last_triggered_at": flow.last_triggered_at.isoformat() if flow.last_triggered_at else None,
        "created_at": flow.created_at.isoformat() if flow.created_at else None,
        "updated_at": flow.updated_at.isoformat() if flow.updated_at else None,
    }


@app.put("/api/flows/{flow_id}")
async def update_flow(flow_id: int, request: Request, db=Depends(get_db), _=Depends(require_role("editor"))):
    flow = await db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404, "Flow not found")
    body = await request.json()
    for key in ("name", "description", "nodes", "edges", "status"):
        if key in body:
            setattr(flow, key, body[key])
    await db.commit()
    return {"ok": True}


@app.delete("/api/flows/{flow_id}")
async def delete_flow(flow_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    flow = await db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404, "Flow not found")
    await db.execute(FlowExecution.__table__.delete().where(FlowExecution.flow_id == flow_id))
    await db.delete(flow)
    await db.commit()
    return {"ok": True}


ST_CYCLE = {"draft": "active", "active": "paused", "paused": "active"}

@app.post("/api/flows/{flow_id}/toggle")
async def toggle_flow(flow_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    flow = await db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404, "Flow not found")
    flow.status = ST_CYCLE.get(flow.status, "active")
    await db.commit()
    return {"status": flow.status}


@app.post("/api/flows/{flow_id}/test")
async def test_flow(flow_id: int, request: Request, db=Depends(get_db), _=Depends(require_role("editor"))):
    body = await request.json()
    flow = await db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404, "Flow not found")
    from flow_engine import FlowContext
    ctx = FlowContext(
        from_id=body.get("from_id", "test_123"),
        from_name=body.get("from_name", "Test"),
        text=body.get("text", ""),
        trigger_type="manual",
    )
    result = await flow_engine.execute(flow_id, ctx, db)
    return result


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
async def get_subscriber(sub_id: int, db=Depends(get_db), _=Depends(get_current_user)):
    detail = await subscriber_engine.get_detail(sub_id, db)
    if not detail:
        raise HTTPException(404, "Subscriber not found")
    return detail


@app.post("/api/subscribers/{sub_id}/tags")
async def assign_subscriber_tag(sub_id: int, request: Request, db=Depends(get_db), _=Depends(require_role("editor"))):
    body = await request.json()
    ok = await subscriber_engine.add_tag(sub_id, body["tag_id"], db)
    return {"ok": ok}


@app.delete("/api/subscribers/{sub_id}/tags/{tag_id}")
async def remove_subscriber_tag(sub_id: int, tag_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    ok = await subscriber_engine.remove_tag(sub_id, tag_id, db)
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
async def delete_tag(tag_id: int, db=Depends(get_db), _=Depends(require_role("admin"))):
    ok = await tag_engine.delete_tag(tag_id, db)
    if not ok:
        raise HTTPException(404, "Tag not found")
    return {"ok": True}


# ── SEQUENCES API ─────────────────────────────────────────────────────────────

@app.get("/api/sequences")
async def list_sequences(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await sequence_engine.list_sequences(db, tenant_id=current_user._tenant_id)


@app.post("/api/sequences")
async def create_sequence(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    body = await request.json()
    seq_id = await sequence_engine.create_sequence(
        name=body["name"],
        description=body.get("description", ""),
        created_by=body.get("created_by", ""),
        session=db,
        tenant_id=current_user._tenant_id,
    )
    await db.commit()
    await db.refresh(await db.get(Sequence, seq_id))
    return {"id": seq_id}


@app.get("/api/sequences/{seq_id}")
async def get_sequence(seq_id: int, db=Depends(get_db), _=Depends(get_current_user)):
    seq = await sequence_engine.get_sequence(seq_id, db)
    if not seq:
        raise HTTPException(404, "Sequence not found")
    return seq


@app.put("/api/sequences/{seq_id}")
async def update_sequence(seq_id: int, request: Request, db=Depends(get_db), _=Depends(require_role("editor"))):
    body = await request.json()
    ok = await sequence_engine.update_sequence(seq_id, body, db)
    if not ok:
        raise HTTPException(404, "Sequence not found")
    await db.commit()
    return {"ok": True}


@app.delete("/api/sequences/{seq_id}")
async def delete_sequence(seq_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    ok = await sequence_engine.delete_sequence(seq_id, db)
    if not ok:
        raise HTTPException(404, "Sequence not found")
    await db.commit()
    return {"ok": True}


@app.post("/api/sequences/{seq_id}/steps")
async def add_sequence_step(seq_id: int, request: Request, db=Depends(get_db), _=Depends(require_role("editor"))):
    body = await request.json()
    step_id = await sequence_engine.add_step(seq_id, body, db)
    await db.commit()
    return {"id": step_id}


@app.put("/api/sequences/steps/{step_id}")
async def update_sequence_step(step_id: int, request: Request, db=Depends(get_db), _=Depends(require_role("editor"))):
    body = await request.json()
    ok = await sequence_engine.update_step(step_id, body, db)
    if not ok:
        raise HTTPException(404, "Step not found")
    await db.commit()
    return {"ok": True}


@app.delete("/api/sequences/steps/{step_id}")
async def delete_sequence_step(step_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    ok = await sequence_engine.delete_step(step_id, db)
    if not ok:
        raise HTTPException(404, "Step not found")
    await db.commit()
    return {"ok": True}


@app.post("/api/sequences/{seq_id}/subscribe/{sub_id}")
async def subscribe_to_sequence(seq_id: int, sub_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    ok = await sequence_engine.subscribe(sub_id, seq_id, db)
    await db.commit()
    return {"ok": ok}


@app.post("/api/sequences/{seq_id}/unsubscribe/{sub_id}")
async def unsubscribe_from_sequence(seq_id: int, sub_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    ok = await sequence_engine.unsubscribe(sub_id, seq_id, db)
    await db.commit()
    return {"ok": ok}


# ── BROADCASTS API ────────────────────────────────────────────────────────────

@app.get("/api/broadcasts")
async def list_broadcasts(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await broadcast_engine.list_broadcasts(db, tenant_id=current_user._tenant_id)


@app.post("/api/broadcasts")
async def create_broadcast(request: Request, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    body = await request.json()
    bcast_id = await broadcast_engine.create_broadcast(
        name=body["name"],
        message_template=body.get("message_template", ""),
        platform_filter=body.get("platform_filter", {}),
        segment_filters=body.get("segment_filters", {}),
        created_by="",
        session=db,
        tenant_id=current_user._tenant_id,
    )
    return {"id": bcast_id}


@app.get("/api/broadcasts/{bcast_id}")
async def get_broadcast(bcast_id: int, db=Depends(get_db), _=Depends(get_current_user)):
    bcast = await broadcast_engine.get_broadcast(bcast_id, db)
    if not bcast:
        raise HTTPException(404, "Broadcast not found")
    return bcast


@app.put("/api/broadcasts/{bcast_id}")
async def update_broadcast(bcast_id: int, request: Request, db=Depends(get_db), _=Depends(require_role("editor"))):
    body = await request.json()
    ok = await broadcast_engine.update_broadcast(bcast_id, body, db)
    if not ok:
        raise HTTPException(404, "Broadcast not found")
    return {"ok": True}


@app.post("/api/broadcasts/{bcast_id}/send")
async def send_broadcast(bcast_id: int, db=Depends(get_db), _=Depends(require_role("admin"))):
    bcast = await db.get(Broadcast, bcast_id)
    if not bcast:
        raise HTTPException(404, "Broadcast not found")
    if bcast.status != "draft":
        raise HTTPException(400, "Only draft broadcasts can be sent")
    bc_id = bcast_id
    async def _send():
        async with AsyncSessionLocal() as s:
            await broadcast_engine.send_broadcast(bc_id, s)
    asyncio.create_task(_send())
    return {"ok": True, "message": "Broadcast sending started"}


@app.post("/api/broadcasts/{bcast_id}/cancel")
async def cancel_broadcast(bcast_id: int, db=Depends(get_db), _=Depends(require_role("admin"))):
    ok = await broadcast_engine.cancel_broadcast(bcast_id, db)
    if not ok:
        raise HTTPException(400, "Broadcast not found or not cancellable")
    return {"ok": True}


@app.post("/api/broadcasts/estimate")
async def estimate_broadcast_audience(request: Request, db=Depends(get_db), _=Depends(require_role("editor"))):
    body = await request.json()
    result = await broadcast_engine.estimate_audience(
        segment_filters=body.get("segment_filters", {}),
        platform_filter=body.get("platform_filter", {}),
        session=db,
    )
    return {"count": result["count"]}


# ═══════════════════════════════════════════════════════════════════════════════
# :: PHASE 2 — NEW ENGINES ::
# ═══════════════════════════════════════════════════════════════════════════════

# ── Analytics ──────────────────────────────────────────────────────────────────

@app.get("/api/analytics/dashboard")
async def analytics_dashboard(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await analytics_engine.get_dashboard_overview(days, db, tenant_id=current_user._tenant_id)


@app.get("/api/analytics/daily-trend")
async def analytics_daily_trend(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await analytics_engine.get_daily_trend(days, db, tenant_id=current_user._tenant_id)


@app.get("/api/analytics/hourly-heatmap")
async def analytics_hourly_heatmap(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await analytics_engine.get_hourly_heatmap(days, db, tenant_id=current_user._tenant_id)


@app.get("/api/analytics/top-rules")
async def analytics_top_rules(days: int = Query(30), limit: int = Query(10), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await analytics_engine.get_top_rules(days, limit, db, tenant_id=current_user._tenant_id)


@app.get("/api/analytics/sentiment-trend")
async def analytics_sentiment_trend(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await analytics_engine.get_sentiment_trend(days, db, tenant_id=current_user._tenant_id)


@app.get("/api/analytics/peak-hour")
async def analytics_peak_hour(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    peak = await analytics_engine.get_peak_hour(days, db, tenant_id=current_user._tenant_id)
    return {"peak_hour": peak}


@app.get("/api/analytics/top-commenters")
async def analytics_top_commenters(days: int = Query(30), limit: int = Query(10), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await analytics_engine.get_top_commenters(days, limit, db, tenant_id=current_user._tenant_id)


@app.get("/api/analytics/period-comparison")
async def analytics_period_comparison(days: int = Query(30), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await analytics_engine.get_period_comparison(days, db, tenant_id=current_user._tenant_id)


# ── Inbox ──────────────────────────────────────────────────────────────────────

@app.get("/api/inbox/stats")
async def inbox_stats(db=Depends(get_db), _=Depends(get_current_user)):
    return await inbox_engine.get_conversation_stats(db)


@app.get("/api/inbox/all")
async def inbox_all(search: str = Query(""), db=Depends(get_db), _=Depends(get_current_user)):
    conversations = await inbox_engine.fetch_all_conversations(db)
    if search:
        conversations = await inbox_engine.search_conversations(search, conversations)
    return {"items": conversations}


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
async def calendar_update(post_id: int, request: Request, db=Depends(get_db), _=Depends(require_role("editor"))):
    data = await request.json()
    ok = await content_calendar_engine.update_post(post_id, data, db)
    if not ok:
        raise HTTPException(404, "Post not found")
    return {"ok": True}


@app.delete("/api/calendar/{post_id}")
async def calendar_delete(post_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    ok = await content_calendar_engine.delete_post(post_id, db)
    if not ok:
        raise HTTPException(404, "Post not found")
    return {"ok": True}


@app.post("/api/calendar/{post_id}/publish")
async def calendar_publish(post_id: int, db=Depends(get_db), _=Depends(require_role("editor"))):
    ok = await content_calendar_engine.publish_post(post_id, db)
    if not ok:
        raise HTTPException(404, "Post not found or publish failed")
    return {"ok": True}


@app.get("/api/calendar/month-summary")
async def calendar_month_summary(year: int = Query(...), month: int = Query(...),
                                 db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return await content_calendar_engine.get_month_summary(year, month, db, tenant_id=current_user._tenant_id)


# ── Publisher (Multi-Platform) ──────────────────────────────────────────────────

@app.get("/api/publisher/status")
async def publisher_status(_=Depends(get_current_user)):
    _publisher.load_credentials(None)
    return _publisher.get_status()


@app.get("/api/publisher/settings/{platform}")
async def publisher_settings(platform: str, _=Depends(get_current_user)):
    return {
        "platform": platform,
        "fields": _publisher.get_platform_settings_template(platform),
    }


@app.post("/api/publisher/configure")
async def publisher_configure(data: dict = Body(...), db=Depends(get_db),
                               _=Depends(require_role("admin"))):
    platform = data.get("platform", "")
    creds = data.get("credentials", {})
    if not platform or not creds:
        raise HTTPException(400, "platform and credentials required")
    ok = await _publisher.save_credentials(db, platform, creds)
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
        _publisher.load_credentials(db)
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
        _publisher.load_credentials(db)
        result = await _publisher.publish_to_platform(platform, message, image_url)
        if not result:
            raise HTTPException(400, f"فشل النشر على {_publisher.get_platform_display_name(platform)}")
        _track_event("post_published", {"platform": platform})
        return {**result, "status": "published"}


# ── Team ───────────────────────────────────────────────────────────────────────

@app.get("/api/team/members")
async def team_members(db=Depends(get_db), _=Depends(require_role("admin"))):
    return await team_engine.get_team_members(db)


@app.get("/api/team/activity")
async def team_activity(days: int = Query(7), db=Depends(get_db), _=Depends(get_current_user)):
    return await team_engine.get_team_activity(days, db)


@app.get("/api/team/performance")
async def team_performance(db=Depends(get_db), _=Depends(require_role("admin"))):
    return await team_engine.get_team_performance(db)


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
        if row:
            row.value = str(value)
        else:
            db.add(BotState(key=f"shopify_{key}", value=str(value)))
    await db.commit()
    commerce_engine.shopify = ShopifyIntegration(
        store_domain=body.get("store_domain", ""),
        access_token=body.get("access_token", ""),
    )
    return {"ok": True, "store": body.get("store_domain", "")}


@app.post("/api/commerce/shopify/webhook/{topic:path}")
async def shopify_webhook(topic: str, request: Request):
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
async def reports_delete_schedule(schedule_id: int, db=Depends(get_db), _=Depends(require_role("admin"))):
    """Delete a report schedule."""
    rs = await db.get(ReportSchedule, schedule_id)
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
async def toggle_offer(offer_id: int, db=Depends(get_db), _=Depends(require_role("admin"))):
    offer = await db.get(Offer, offer_id)
    if not offer: raise HTTPException(404, "العرض غير موجود")
    offer.is_active = not offer.is_active
    await db.commit()
    return {"ok": True, "is_active": offer.is_active}


@app.delete("/api/offers/{offer_id}")
async def delete_offer(offer_id: int, db=Depends(get_db), _=Depends(require_role("admin"))):
    offer = await db.get(Offer, offer_id)
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


# ── Diagnostics & Admin Endpoints ─────────────────────────────


@app.get("/api/diagnostics/status")
async def diagnostic_status(_=Depends(get_current_user)):
    from diagnostics import get_diagnostics
    from monitor import get_logger
    d = get_diagnostics()
    l = get_logger()
    return {"system": d.get_system_info(), "cycles": d.get_cycle_stats(),
            "errors": {"recent": d.get_recent_errors(10), "rate_pct": d.get_error_rate()},
            "logs": l.get_stats()}


@app.get("/api/diagnostics/cycle-stats")
async def diagnostic_cycles(_=Depends(get_current_user)):
    from diagnostics import get_diagnostics
    return get_diagnostics().get_cycle_stats()


@app.get("/api/diagnostics/recent-errors")
async def diagnostic_errors(limit: int = Query(20), _=Depends(get_current_user)):
    from diagnostics import get_diagnostics
    return {"errors": get_diagnostics().get_recent_errors(limit)}


@app.get("/api/diagnostics/logs")
async def diagnostic_logs(level: str = Query(""), module: str = Query(""),
                          since: str = Query(""), limit: int = Query(50),
                          _=Depends(get_current_user)):
    from monitor import get_logger
    return {"logs": get_logger().get_buffer(level or None, module=module or None,
                                            since=since or None, limit=limit)}


@app.get("/api/diagnostics/stats")
async def diagnostic_stats(_=Depends(get_current_user)):
    from monitor import get_logger
    return get_logger().get_stats()


@app.get("/api/diagnostics/events")
async def diagnostic_events(limit: int = Query(100), _=Depends(get_current_user)):
    from monitor import get_logger
    return {"events": get_logger().get_buffer(limit=limit)}


@app.get("/api/diagnostics/permissions")
async def diagnostic_permissions(_=Depends(get_current_user)):
    from fb_client import FBClient
    from config import settings
    if not settings.FACEBOOK_ACCESS_TOKEN:
        return {"has_token": False}
    fb = FBClient(settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID)
    debug = await fb._get("debug_token", {"input_token": settings.FACEBOOK_ACCESS_TOKEN})
    perms = []
    if debug and "data" in debug:
        perms = (debug["data"].get("scopes", []) or debug["data"].get("granular_scopes", []))
    return {"has_token": True, "permissions": perms}


@app.post("/api/diagnostics/demo-test-comment")
async def diagnostic_demo_comment(comment_text: str = Form(...), _=Depends(require_role("admin"))):
    from enhanced_intent import EnhancedIntentClassifier
    from bot import TextNormalizer
    classification = EnhancedIntentClassifier.classify(comment_text)
    normalized = TextNormalizer.normalize_for_matching(comment_text)
    return {"original": comment_text, "normalized": normalized, "classification": classification}


@app.post("/api/admin/rules/{rule_id}/priority")
async def set_rule_priority(rule_id: int, priority: int = Form(...), db=Depends(get_db), _=Depends(require_role("admin"))):
    rule = await db.get(Rule, rule_id)
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
    if eng: eng.cooldown.adjust_window(seconds)
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
    from models import BrandConfig
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
    from models import BrandConfig
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
    from models import Customer
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
    from models import Customer
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
    db=Depends(get_db), _=Depends(require_role("editor")),
):
    from models import Customer
    c = await db.get(Customer, customer_id)
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
async def list_alerts(resolved: bool = Query(False), db=Depends(get_db), _=Depends(get_current_user)):
    from models import BotAlert
    stmt = select(BotAlert).where(BotAlert.resolved == resolved).order_by(desc(BotAlert.created_at)).limit(20)
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
    from models import BotAlert
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
async def resolve_alert(alert_id: int, db=Depends(get_db), _=Depends(require_role("admin"))):
    from models import BotAlert
    a = await db.get(BotAlert, alert_id)
    if not a:
        raise HTTPException(404, "التنبيه غير موجود")
    a.resolved = True
    a.resolved_at = utcnow()
    await db.commit()
    return {"ok": True}

