import asyncio
import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from contextlib import asynccontextmanager

import bcrypt
import jwt
from fastapi import FastAPI, Request, Depends, Query, HTTPException, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, func, desc, cast, Date, text

from config import settings
from database import engine, AsyncSessionLocal, get_db
from models import Base, Rule, Reply, BotLog, BotState, User
from fb_client import FBClient
from bot import run_auto_reply, import_json_data, _process_comment as process_single_comment, _load_rules as load_bot_rules, load_replied_ids

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fb-api")

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
PARENT_DIR = BASE_DIR.parent

fb = FBClient(settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID)
_bot_task: asyncio.Task | None = None
_post_cursors: dict[int, str] = {}  # ponytail: page→after cursor; single-session only, resets on restart
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
            rules_file = BASE_DIR / "facebook_automation.json"
            state_file = BASE_DIR / ".replied_comments.json"
            await import_json_data(session, str(rules_file), str(state_file))


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
    while True:
        try:
            await run_auto_reply(fb)
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
        "dm_template": "",
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
                description=description)
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
    rule.description = description
    await db.commit()
    return {"ok": True}
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
async def list_replies(page: int = Query(1), per_page: int = Query(20), db=Depends(get_db), _=Depends(get_current_user)):
    offset = (page - 1) * per_page
    total = await db.scalar(select(func.count(Reply.id)))
    rows = await db.execute(
        select(Reply).order_by(desc(Reply.created_at)).offset(offset).limit(per_page)
    )
    return {
        "total": total, "page": page, "per_page": per_page,
        "items": [{
            "id": r.id, "commenter_name": r.commenter_name, "comment_text": r.comment_text,
            "reply_text": r.reply_text, "fb_comment_id": r.fb_comment_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows.scalars().all()]
    }


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
        await run_auto_reply(fb)
    except Exception as e:
        log.error(f"Forced cycle error: {e}")


@app.post("/api/bot/trigger")
async def trigger_manual_reply(_=Depends(require_role("admin"))):
    """Force one bot cycle NOW — useful after commenting on Facebook."""
    asyncio.create_task(_run_single_cycle())
    return {"ok": True, "message": "Bot cycle triggered — replies will appear in /api/logs"}


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
        async with AsyncSessionLocal() as session:
            rules_data = await load_bot_rules(session)
            if not rules_data:
                return
            replied_ids = await load_replied_ids(session)
            # Load dm_map from JSON
            import json as _j, pathlib as _p
            _dm = {}
            try:
                _json_path = _p.Path(__file__).resolve().parent / "facebook_automation.json"
                _d = _j.loads(open(_json_path, encoding='utf-8').read())
                _dm = {_r["id"]: _r.get("dm_template", "") for _r in _d.get("rules", []) if _r.get("dm_template")}
            except Exception:
                pass
            welcomed_senders: set[str] = set()
            # Fetch full comment data from API for richer fields
            full = await fb.get_post_comments(post_id, 5) if post_id else []
            matched = next((c for c in full if c["id"] == comment["id"]), comment)

            await process_single_comment(fb, session, matched, post_id,
                                         replied_ids, rules_data, welcomed_senders)
    except Exception as e:
        log.error(f"Webhook comment processing error: {e}", exc_info=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
