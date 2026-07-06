import asyncio
import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Any

import bcrypt
import jwt
from fastapi import FastAPI, Request, Depends, Query, HTTPException, Form, Body, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, func, desc, asc, cast, Date, text, or_, and_

from config import settings
from database import engine, AsyncSessionLocal, get_db
from models import Base, Rule, Reply, BotLog, BotState, User
from models import ReplyTemplate, AISuggestion, ConversationTag, ConversationLabel, ScheduledPost, AnalyticsEvent
from fb_client import FBClient
from bot import BotEngine

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
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE = timedelta(hours=24)


def make_token(username: str) -> str:
    return jwt.encode(
        {"sub": username, "exp": datetime.utcnow() + ACCESS_TOKEN_EXPIRE},
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
    return user


ROLE_HIERARCHY = {"admin": 3, "editor": 2, "viewer": 1}


def require_role(min_role: str):
    async def checker(current_user: User = Depends(get_current_user)):
        if ROLE_HIERARCHY.get(current_user.role, 0) < ROLE_HIERARCHY.get(min_role, 0):
            raise HTTPException(403, "Insufficient permissions")
        return current_user
    return checker


async def seed_admin(db):
    existing = await db.execute(select(User).where(User.username == "admin"))
    if existing.scalar_one_or_none():
        return
    pw_hash = bcrypt.hashpw("admin".encode(), bcrypt.gensalt()).decode()
    db.add(User(username="admin", password_hash=pw_hash, role="admin"))
    await db.commit()
    log.info("Default admin user seeded (admin/admin) — CHANGE PASSWORD")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        log.info("DB tables ready")

        async with AsyncSessionLocal() as session:
            await seed_admin(session)

        if settings.START_BOT:
            global _bot_task
            _bot_task = asyncio.create_task(_run_bot_loop())
            log.info("Bot started in background")
    except Exception as e:
        log.error(f"Startup error (app continues): {e}")

    yield

    if _bot_task:
        _bot_task.cancel()
    await fb.close()
    await engine.dispose()


app = FastAPI(title="FB Dashboard", lifespan=lifespan)
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


async def _run_bot_loop():
    engine = BotEngine(fb)
    while True:
        try:
            await engine.cycle()
        except Exception as e:
            log.error(f"Bot loop err: {e}")
        await asyncio.sleep(settings.BOT_INTERVAL_SECONDS)


# ---- Auth ----

@app.post("/api/login")
async def login(username: str = Form(...), password: str = Form(...), db=Depends(get_db)):
    user = await db.execute(select(User).where(User.username == username))
    user = user.scalar_one_or_none()
    if not user or not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(username)
    resp = JSONResponse({"ok": True, "role": user.role, "username": user.username})
    resp.set_cookie(key="token", value=token, httponly=True, secure=True, samesite="strict", max_age=int(ACCESS_TOKEN_EXPIRE.total_seconds()))
    return resp


@app.post("/api/logout")
async def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("token")
    return resp


@app.get("/api/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "role": current_user.role}


# ---- Users CRUD (admin only) ----

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


# ---- API: Facebook Settings ----

@app.get("/api/facebook/settings")
async def get_facebook_settings(_=Depends(require_role("admin"))):
    return {
        "page_id": settings.FACEBOOK_PAGE_ID or "",
        "has_token": bool(settings.FACEBOOK_ACCESS_TOKEN),
        "token_preview": settings.FACEBOOK_ACCESS_TOKEN[:8] + "..." if settings.FACEBOOK_ACCESS_TOKEN else "",
        "connected": bool(settings.FACEBOOK_ACCESS_TOKEN and settings.FACEBOOK_PAGE_ID),
        "page_name": "",
    }


@app.put("/api/facebook/settings")
async def update_facebook_settings(_=Depends(require_role("admin"))):
    # In production, these would be written to .env or DB.
    # For now, return instructions since Render env vars are set via dashboard.
    raise HTTPException(400, "تعديل إعدادات فيسبوك يتم من خلال Render Dashboard → Environment Variables")


# ---- Health ----

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
        "webhook_url": (os.getenv("RENDER_EXTERNAL_URL") or "") + "/webhook",
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
async def debug():
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


# ---- Pages ----

@app.get("/", response_class=HTMLResponse)
async def dashboard_page(request: Request):
    static_index = STATIC_DIR / "index.html"
    if static_index.exists():
        return HTMLResponse(static_index.read_text(encoding="utf-8"))
    html_path = TEMPLATES_DIR / "index.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>SmartBot Dashboard</h1><p>Loading...</p>")


# ---- API: Stats ----

@app.get("/api/stats")
async def get_stats(db=Depends(get_db), _=Depends(get_current_user)):
    total_replies = await db.scalar(select(func.count(Reply.id))) or 0
    today = datetime.utcnow().date()
    today_replies = await db.scalar(
        select(func.count(Reply.id)).where(cast(Reply.created_at, Date) == today)
    ) or 0

    top = None
    try:
        stmt = select(Reply.rule_id, func.count(Reply.id).label("cnt")).group_by(Reply.rule_id).order_by(desc("cnt")).limit(1)
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
            .where(Reply.created_at >= datetime.utcnow() - timedelta(days=7))
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


# ---- API: Rules ----
# Protected by get_current_user — roles enforced in frontend hiding (DELETE/POST require editor+)

@app.get("/api/rules")
async def list_rules(db=Depends(get_db), _=Depends(get_current_user)):
    rows = await db.execute(select(Rule).order_by(Rule.id))
    rules = rows.scalars().all()
    counts_stmt = select(Reply.rule_id, func.count(Reply.id).label("cnt")).group_by(Reply.rule_id)
    counts = {row[0]: row[1] for row in (await db.execute(counts_stmt))}
    return [{
        "id": r.id, "name": r.name, "keywords": r.keywords,
        "reply_template": r.reply_template,
        "dm_template": r.dm_template or "",
        "enabled": r.enabled, "description": r.description,
        "bot_type": "reply",
        "replies_count": counts.get(r.id, 0),
    } for r in rules]


@app.post("/api/rules")
async def create_rule(
    name: str = Form(...), keywords: str = Form(...),
    reply_template: str = Form(...), description: str = Form(""),
    bot_type: str = Form("reply"), dm_template: str = Form(""),
    db=Depends(get_db), _=Depends(require_role("editor")),
):
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()]
    rule = Rule(name=name, keywords=kw_list, reply_template=reply_template,
                description=description, dm_template=dm_template)
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


# ---- API: Replies ----

@app.get("/api/replies")
async def list_replies(page: int = Query(1), per_page: int = Query(20), rule_id: int = Query(None), db=Depends(get_db), _=Depends(get_current_user)):
    offset = (page - 1) * per_page
    stmt = select(Reply)
    if rule_id:
        stmt = stmt.where(Reply.rule_id == rule_id)
        total = await db.scalar(select(func.count(Reply.id)).where(Reply.rule_id == rule_id))
    else:
        total = await db.scalar(select(func.count(Reply.id)))
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


@app.get("/api/stats/hourly")
async def get_hourly_stats(db=Depends(get_db), _=Depends(get_current_user)):
    cutoff = datetime.utcnow() - timedelta(days=7)
    rows = await db.execute(
        select(func.extract("hour", Reply.created_at).label("hour"), func.count(Reply.id).label("count"))
        .where(Reply.created_at >= cutoff)
        .group_by(text("hour")).order_by(text("hour"))
    )
    return [{"hour": int(r.hour), "count": r.count} for r in rows]


# ---- API: Posts ----

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


# ---- API: Comments / Replies ----

@app.post("/api/replies/{comment_id}/reply")
async def reply_to_comment(comment_id: str, message: str = Form(...), db=Depends(get_db),
                           current_user: User = Depends(require_role("editor"))):
    result = await fb.reply_to_comment(comment_id, message)
    if not result:
        raise HTTPException(400, "Failed to send reply")
    # Log the reply
    log.info(f"User {current_user.username} replied to comment {comment_id}")
    return {"ok": True}


# ---- API: Messages ----

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
        raise HTTPException(400, "Failed to send message")
    return {"ok": True}


# ---- API: Ads ----

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


# ---- API: Bot Control ----

@app.get("/api/bot/status")
async def bot_status(_=Depends(get_current_user)):
    return {
        "running": _bot_task is not None and not _bot_task.done(),
        "interval": settings.BOT_INTERVAL_SECONDS,
    }


@app.post("/api/bot/restart")
async def restart_bot(_=Depends(require_role("admin"))):
    global _bot_task
    if _bot_task:
        _bot_task.cancel()
    _bot_task = asyncio.create_task(_run_bot_loop())
    return {"ok": True}


@app.post("/api/bot/stop")
async def stop_bot(_=Depends(require_role("admin"))):
    global _bot_task
    if _bot_task and not _bot_task.done():
        _bot_task.cancel()
        _bot_task = None
    return {"ok": True}


@app.post("/api/bot/interval")
async def set_bot_interval(interval: int = Form(...), _=Depends(require_role("admin"))):
    if interval < 3 or interval > 3600:
        raise HTTPException(400, "Interval must be between 3 and 3600 seconds")
    settings.BOT_INTERVAL_SECONDS = interval
    return {"ok": True, "interval": interval}


# ---- API: Logs ----

@app.get("/api/logs")
async def get_logs(limit: int = Query(50), db=Depends(get_db), _=Depends(get_current_user)):
    rows = await db.execute(
        select(BotLog).order_by(desc(BotLog.created_at)).limit(limit)
    )
    return [{
        "level": r.level, "message": r.message,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows.scalars().all()]


@app.post("/api/logs/clear")
async def clear_logs(payload: dict = None, db=Depends(get_db), _=Depends(require_role("admin"))):
    days = (payload or {}).get("days", 30)
    cutoff = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(select(func.count(BotLog.id)).where(BotLog.created_at < cutoff))
    count = result.scalar() or 0
    await db.execute(BotLog.__table__.delete().where(BotLog.created_at < cutoff))
    await db.commit()
    return {"deleted": count}


@app.get("/api/webhook/events")
async def get_webhook_events(limit: int = Query(20), db=Depends(get_db), _=Depends(get_current_user)):
    rows = await db.execute(
        select(BotLog).where(BotLog.message.contains("webhook")).order_by(desc(BotLog.created_at)).limit(limit)
    )
    return [{
        "id": r.id, "level": r.level, "message": r.message,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows.scalars().all()]


# ---- API: Webhook Check & Force Cycle ----

@app.get("/api/webhook/check")
async def check_webhook(_=Depends(get_current_user)):
    """Check if webhook is properly configured."""
    webhook_url = os.getenv("RENDER_EXTERNAL_URL", "") + "/webhook"
    if not webhook_url.startswith("http"):
        webhook_url = "https://smartbot-6lxo.onrender.com/webhook"
    return {
        "configured": bool(WEBHOOK_APP_SECRET),
        "verify_token": WEBHOOK_VERIFY_TOKEN,
        "webhook_url": webhook_url,
        "instructions": [
            "1. Go to https://developers.facebook.com/apps",
            "2. Select your app -> Webhooks -> Page",
            "3. Set Callback URL to: " + webhook_url,
            f"4. Set Verify Token to: {WEBHOOK_VERIFY_TOKEN}",
            "5. Subscribe to 'feed' field",
            "6. After setup, POST /api/webhook/test to verify",
        ],
    }


@app.get("/api/webhook/test")
async def test_facebook_comment_flow(_=Depends(get_current_user)):
    """Simulate a test comment flow — fetches latest posts and tries to reply."""
    try:
        from bot import BotEngine
        engine = BotEngine(fb)
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
        engine = BotEngine(fb)
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


@app.get("/api/ai/status")
async def ai_status(_=Depends(get_current_user)):
    """Check AI provider status."""
    ai = get_ai()
    return {"available": ai.available, "provider": ai.provider_name}


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
    """Send a reply in a conversation."""
    result = await fb.send_conversation_message(conversation_id, message)
    if not result:
        raise HTTPException(400, "فشل إرسال الرد")
    _track_event("inbox_reply_sent", {"conversation_id": conversation_id})
    return {"ok": True}


@app.get("/api/inbox/tags")
async def inbox_list_tags(db=Depends(get_db), _=Depends(get_current_user)):
    """List all conversation tags."""
    rows = await db.execute(select(ConversationTag))
    return [{"id": t.id, "name": t.name, "color": t.color} for t in rows.scalars().all()]


@app.post("/api/inbox/tags")
async def inbox_create_tag(name: str = Form(...), color: str = Form("#6366f1"),
                           db=Depends(get_db), _=Depends(require_role("editor"))):
    """Create a new tag."""
    existing = await db.execute(select(ConversationTag).where(ConversationTag.name == name))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "اسم الوسم موجود مسبقاً")
    tag = ConversationTag(name=name, color=color)
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


# ── Reply Templates (Quick Replies) ──────────────────────────────────────────

@app.get("/api/templates")
async def list_templates(category: str = Query(""), db=Depends(get_db), _=Depends(get_current_user)):
    stmt = select(ReplyTemplate)
    if category:
        stmt = stmt.where(ReplyTemplate.category == category)
    rows = await db.execute(stmt.order_by(ReplyTemplate.category, ReplyTemplate.name))
    return [{"id": t.id, "name": t.name, "text": t.text, "category": t.category, "shortcut": t.shortcut}
            for t in rows.scalars().all()]


@app.post("/api/templates")
async def create_template(name: str = Form(...), text: str = Form(...), category: str = Form("general"),
                          shortcut: str = Form(""), db=Depends(get_db), _=Depends(require_role("editor"))):
    t = ReplyTemplate(name=name, text=text, category=category, shortcut=shortcut)
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
async def list_scheduled_posts(status: str = Query(""), db=Depends(get_db), _=Depends(get_current_user)):
    stmt = select(ScheduledPost)
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
    post.published_at = datetime.utcnow()
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
async def analytics_overview(days: int = Query(30), db=Depends(get_db), _=Depends(get_current_user)):
    """Aggregated analytics overview."""
    cutoff = datetime.utcnow() - timedelta(days=days)

    total_replies = await db.scalar(select(func.count(Reply.id)).where(Reply.created_at >= cutoff)) or 0
    today_replies = await db.scalar(
        select(func.count(Reply.id)).where(cast(Reply.created_at, Date) == datetime.utcnow().date())
    ) or 0

    # Daily breakdown
    daily_rows = await db.execute(
        select(cast(Reply.created_at, Date).label("d"), func.count(Reply.id).label("cnt"))
        .where(Reply.created_at >= cutoff)
        .group_by(cast(Reply.created_at, Date)).order_by(cast(Reply.created_at, Date))
    )
    daily = {str(row[0]): row[1] for row in daily_rows if row[0]}

    # Hourly heatmap data
    hourly_rows = await db.execute(
        select(func.extract("hour", Reply.created_at).label("h"),
               cast(Reply.created_at, Date).label("d"),
               func.count(Reply.id).label("cnt"))
        .where(Reply.created_at >= cutoff)
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
        .where(Reply.created_at >= cutoff)
        .group_by(Reply.rule_id).order_by(desc("cnt")).limit(10)
    )
    top_rules = [{"rule_id": int(r[0]), "count": r[1]} for r in top_rules_rows if r[0] is not None]

    # Sentiment distribution (from AI suggestions if available)
    sentiment = {}
    try:
        sent_rows = await db.execute(
            select(AISuggestion.sentiment, func.count(AISuggestion.id))
            .where(AISuggestion.created_at >= cutoff)
            .group_by(AISuggestion.sentiment)
        )
        sentiment = {row[0]: row[1] for row in sent_rows}
    except Exception:
        pass

    # Peak hour
    peak_hour_rows = await db.execute(
        select(func.extract("hour", Reply.created_at).label("h"),
               func.count(Reply.id).label("cnt"))
        .where(Reply.created_at >= cutoff)
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
                           db=Depends(get_db), _=Depends(require_role("admin"))):
    """Export replies as CSV or JSON."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = await db.execute(
        select(Reply).where(Reply.created_at >= cutoff).order_by(desc(Reply.created_at))
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
                    headers={"Content-Disposition": f"attachment; filename=replies-export-{datetime.utcnow().date()}.csv"})


@app.get("/api/analytics/scheduler-check")
async def analytics_scheduler_check(db=Depends(get_db), _=Depends(get_current_user)):
    """Check and publish overdue scheduled posts."""
    now = datetime.utcnow()
    due = await db.execute(
        select(ScheduledPost).where(
            ScheduledPost.status == "scheduled",
            ScheduledPost.scheduled_at <= now,
        )
    )
    published = 0
    for post in due.scalars().all():
        result = await fb.post_to_page(post.message)
        if result:
            post.status = "published"
            post.fb_post_id = result.get("id", "")
            post.published_at = now
            published += 1
    await db.commit()
    return {"published": published}


# ── Dashboard Widgets ────────────────────────────────────────────────────────

@app.get("/api/widgets/recent-activity")
async def widget_recent_activity(limit: int = Query(10), db=Depends(get_db),
                                 _=Depends(get_current_user)):
    """Recent activity timeline for the dashboard."""
    recent_replies = await db.execute(
        select(Reply).order_by(desc(Reply.created_at)).limit(limit)
    )
    recent_logs = await db.execute(
        select(BotLog).order_by(desc(BotLog.created_at)).limit(limit)
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
async def widget_ai_insights(_=Depends(get_current_user)):
    """Dashboard widget: AI status & quick stats."""
    ai = get_ai()
    return {
        "ai_available": ai.available,
        "ai_provider": ai.provider_name,
        "template_count": 0,  # populated at query time if needed
    }


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


# ---- Webhook (Facebook real-time comments) ----
# Set your webhook URL in Facebook App Dashboard -> Webhooks -> Page -> feed
# Set your webhook URL in Facebook App Dashboard → Webhooks → Page → feed
# Verify token must match FB_WEBHOOK_VERIFY_TOKEN env var

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

            # Process this single comment immediately
            asyncio.create_task(
                _process_webhook_comment(comment_payload, post_id)
            )

    return {"ok": True}


async def _process_webhook_comment(comment: dict, post_id: str):
    """Process a single comment from webhook payload immediately."""
    try:
        engine = BotEngine(fb)
        await engine.cycle()
    except Exception as e:
        log.error(f"Webhook comment processing error: {e}", exc_info=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
