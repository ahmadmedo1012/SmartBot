"""World-class launch plan v3 — Stage 4/5 regression suite (2026-09-06).

Covers the three critical functional fixes:
  1. Messenger webhook ingestion: POST /webhook entry[].messaging[] events
     are persisted (Conversation + Message rows) — previously dropped.
  2. Message auto-reply: BotEngine.process_single_message matches rules and
     sends a DM (mocked FBClient).
  3. Tenant-scoped FB endpoints: /api/messages, /api/posts, /api/ads/* reject
     with a clear Arabic message when the caller's tenant has no page
     connected (previously used the GLOBAL env client → empty data).
  4. Dashboard bundle: exposes connection.connected + messages stats.
  5. Telegram DB-backed config: get_bot_token/get_admin_ids resolve from
     SystemConfig/TelegramApprover; POST /api/telegram/config saves.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod-0123456789")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("FACEBOOK_APP_SECRET", "test-app-secret")
os.environ.setdefault("DEBUG", "True")

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from database import engine as db_engine, AsyncSessionLocal
from models import Base, User, Tenant, BotState, Conversation, Message, Rule, SystemConfig, TelegramApprover


@pytest.fixture(scope="module")
async def app_client():
    from runner import app
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # This suite registers MANY users from the single test-client IP; the
    # per-IP register limit would 429 mid-suite. Rate limiting has its own
    # dedicated tests — neutralised HERE only (same pattern as security suite).
    import _rate_limit as _rl

    async def _allow(db, key, max_attempts=10, window_seconds=60):
        return True

    mp = pytest.MonkeyPatch()
    mp.setattr(_rl, "check_rate_limit", _allow)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
            yield ac
    finally:
        mp.undo()


def _sign(body: bytes) -> str:
    return "sha256=" + hmac.new(b"test-app-secret", body, hashlib.sha256).hexdigest()


async def _register(ac: AsyncClient, prefix: str) -> dict:
    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = await ac.post("/api/register", json={
        "username": uname, "email": f"{uname}@t.ly",
        "password": "Str0ngPass!ly", "name": prefix,
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["user"]


async def _login(ac: AsyncClient, username: str, password: str = "Str0ngPass!ly") -> str:
    """Login — the API authenticates via httpOnly cookie, persisted by AsyncClient.
    Returns the username for convenience."""
    r = await ac.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return username


def _auth(token: str) -> dict:
    # auth rides on the AsyncClient cookie jar (token arg kept for readability)
    return {}


async def _connect_page(ac: AsyncClient, token: str, page_id: str) -> None:
    """Save FB page credentials for the caller's tenant (encrypted like prod)."""
    r = await ac.put("/api/facebook/settings", headers=_auth(token), json={
        "page_id": page_id,
        "access_token": "EAAGfake-token-for-tests",
        "subscribe_webhook": False,
    })
    assert r.status_code == 200, r.text


# ────────────────────────────────────────────────────────────────────
# 1. Messenger webhook ingestion (persist Conversation + Message)
# ────────────────────────────────────────────────────────────────────

async def test_webhook_messaging_event_persists_conversation_and_message(app_client):
    ac = app_client
    user = await _register(ac, "msg")
    tok = await _login(ac, user["username"])
    await _connect_page(ac, tok, "111222333")

    ts = 1757000000000
    payload = {
        "object": "page",
        "entry": [{
            "id": "111222333",
            "time": ts,
            "messaging": [{
                "sender": {"id": "999888777", "name": "أحمد المرسل"},
                "recipient": {"id": "111222333"},
                "timestamp": ts,
                "message": {"mid": f"mid.{uuid.uuid4().hex[:10]}", "text": "مرحبا، ما هي الأسعار؟"},
            }],
        }],
    }
    body = json.dumps(payload).encode()
    r = await ac.post("/webhook", content=body, headers={"x-hub-signature-256": _sign(body)})
    assert r.status_code == 200, r.text

    async with AsyncSessionLocal() as db:
        conv = (await db.execute(
            select(Conversation).where(Conversation.fb_conversation_id == f"w_111222333_999888777")
        )).scalar_one_or_none()
        assert conv is not None, "conversation row must be persisted"
        assert conv.tenant_id == user["tenant_id"]
        assert conv.fb_user_id == "999888777"
        assert conv.message_count >= 1
        assert conv.unread_count == 1
        msg = (await db.execute(
            select(Message).where(Message.fb_conversation_id == conv.fb_conversation_id)
        )).scalars().first()
        assert msg is not None and msg.text == "مرحبا، ما هي الأسعار؟"
        assert msg.is_from_page is False


async def test_webhook_message_replay_is_deduplicated(app_client):
    ac = app_client
    user = await _register(ac, "msgrep")
    tok = await _login(ac, user["username"])
    await _connect_page(ac, tok, "444555666")

    mid = f"mid.{uuid.uuid4().hex[:12]}"
    payload = {
        "object": "page",
        "entry": [{
            "id": "444555666", "time": 1757000001000,
            "messaging": [{
                "sender": {"id": "123", "name": "ر"},
                "recipient": {"id": "444555666"},
                "timestamp": 1757000001000,
                "message": {"mid": mid, "text": "رسالة مكررة"},
            }],
        }],
    }
    body = json.dumps(payload).encode()
    headers = {"x-hub-signature-256": _sign(body)}
    r1 = await ac.post("/webhook", content=body, headers=headers)
    r2 = await ac.post("/webhook", content=body, headers=headers)
    assert r1.status_code == 200 and r2.status_code == 200

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Message).where(
                Message.tenant_id == user["tenant_id"], Message.fb_message_id == mid)
        )).scalars().all()
        assert len(rows) == 1, "webhook redelivery must not duplicate messages"


async def test_webhook_echo_persists_as_outbound(app_client):
    ac = app_client
    user = await _register(ac, "msgecho")
    tok = await _login(ac, user["username"])
    await _connect_page(ac, tok, "777888999")

    payload = {
        "object": "page",
        "entry": [{
            "id": "777888999", "time": 1757000002000,
            "messaging": [{
                "sender": {"id": "777888999"},
                "recipient": {"id": "321"},
                "timestamp": 1757000002000,
                "message": {"mid": f"mid.{uuid.uuid4().hex[:10]}", "text": "رد الصفحة", "is_echo": True},
            }],
        }],
    }
    body = json.dumps(payload).encode()
    r = await ac.post("/webhook", content=body, headers={"x-hub-signature-256": _sign(body)})
    assert r.status_code == 200

    async with AsyncSessionLocal() as db:
        msg = (await db.execute(
            select(Message).where(Message.text == "رد الصفحة")
        )).scalars().first()
        assert msg is not None and msg.is_from_page is True


async def test_webhook_rejects_bad_signature(app_client):
    body = json.dumps({"object": "page", "entry": []}).encode()
    r = await app_client.post("/webhook", content=body, headers={"x-hub-signature-256": "sha256=deadbeef"})
    assert r.status_code == 401


# ────────────────────────────────────────────────────────────────────
# 2. Message auto-reply engine (mocked FB send)
# ────────────────────────────────────────────────────────────────────

async def test_process_single_message_matches_rule_and_sends_dm():
    from bot import BotEngine

    class FakeFB:
        page_id = "111222333"
        async def send_dm(self, user_id, message, messaging_type="RESPONSE", tag=None):
            self.sent = (user_id, message)
            return {"message_id": f"mid.reply.{uuid.uuid4().hex[:8]}"}

    async with AsyncSessionLocal() as db:
        db.add(Rule(tenant_id=1, name="greeting", keywords=["مرحبا", "السلام"],
                    reply_template="أهلاً {name}! كيف نساعدك؟", enabled=True,
                    priority=1, bot_type="reply"))
        await db.commit()

    fake = FakeFB()
    engine = BotEngine(fake, tenant_id=1)
    result = await engine.process_single_message({
        "sender": {"id": "555666777", "name": "سالم"},
        "recipient": {"id": "111222333"},
        "message": {"mid": "mid.test.1", "text": "مرحبا عندي استفسار"},
    })
    assert result is not None, "a matching rule (seeded or test) must fire"
    assert fake.sent[0] == "555666777", "DM must go to the message sender"
    assert "سالم" in result["text"]  # {name} placeholder rendered


async def test_process_single_message_skips_echo_and_empty():
    from bot import BotEngine

    class FakeFB:
        page_id = "p"
        async def send_dm(self, *a, **k):
            raise AssertionError("must not send")

    engine = BotEngine(FakeFB(), tenant_id=99)
    assert await engine.process_single_message({
        "sender": {"id": "p"}, "message": {"mid": "m", "text": "echo", "is_echo": True},
    }) is None
    assert await engine.process_single_message({
        "sender": {"id": "u"}, "message": {"mid": "m2", "text": ""},
    }) is None


# ────────────────────────────────────────────────────────────────────
# 3. Tenant-scoped FB endpoints (no global client leakage)
# ────────────────────────────────────────────────────────────────────

async def test_messages_endpoint_requires_tenant_connection(app_client):
    ac = app_client
    user = await _register(ac, "scope")
    tok = await _login(ac, user["username"])
    r = await ac.get("/api/messages", headers=_auth(tok))
    assert r.status_code == 400
    assert "ربط" in r.text or "connect" in r.text


async def test_posts_endpoint_requires_tenant_connection(app_client):
    ac = app_client
    user = await _register(ac, "scope2")
    tok = await _login(ac, user["username"])
    r = await ac.get("/api/posts", headers=_auth(tok))
    assert r.status_code == 400


async def test_ads_endpoint_requires_tenant_connection(app_client):
    ac = app_client
    user = await _register(ac, "scope3")
    tok = await _login(ac, user["username"])
    r = await ac.get("/api/ads/accounts", headers=_auth(tok))
    assert r.status_code == 400


# ────────────────────────────────────────────────────────────────────
# 4. Dashboard bundle: connection + messages stats
# ────────────────────────────────────────────────────────────────────

async def test_dashboard_bundle_reports_connection_and_messages(app_client):
    ac = app_client
    user = await _register(ac, "dash")
    tok = await _login(ac, user["username"])
    await _connect_page(ac, tok, "121212121")

    r = await ac.get("/api/dashboard/bundle", headers=_auth(tok))
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert "connection" in data
    assert data["connection"]["connected"] is True
    assert "messages" in data
    assert data["messages"]["total_conversations"] >= 0
    assert "total_messages" in data["messages"]


async def test_facebook_settings_returns_page_name(app_client):
    ac = app_client
    user = await _register(ac, "pname")
    tok = await _login(ac, user["username"])
    await _connect_page(ac, tok, "343434343")
    # snapshot written directly (as the connect flow does after profile fetch)
    async with AsyncSessionLocal() as db:
        db.add(BotState(tenant_id=user["tenant_id"], key="fb_page_name", value="مطعم الاختبار"))
        await db.commit()
    r = await ac.get("/api/facebook/settings", headers=_auth(tok))
    assert r.status_code == 200
    assert r.json()["data"]["page_name"] == "مطعم الاختبار"
    assert r.json()["data"]["connected"] is True


# ────────────────────────────────────────────────────────────────────
# 5. Telegram DB-backed config (fixes "no notifications")
# ────────────────────────────────────────────────────────────────────

async def test_telegram_bot_token_resolves_from_db():
    import asyncio
    from telegram_bot import get_bot_token
    async with AsyncSessionLocal() as db:
        db.add(SystemConfig(key="telegram_bot_token", value="123456789:AAHfAk_dummy_token_for_tests", is_secret=True))
        await db.commit()
    token = await get_bot_token()
    assert token == "123456789:AAHfAk_dummy_token_for_tests"


async def test_telegram_admin_ids_merge_env_and_db():
    from telegram_bot import get_admin_ids
    async with AsyncSessionLocal() as db:
        db.add(TelegramApprover(telegram_id="987654321", label="مالك"))
        await db.commit()
    ids = await get_admin_ids()
    assert 987654321 in ids


async def test_telegram_config_endpoint_saves_for_platform_admin(app_client):
    ac = app_client
    user = await _register(ac, "tgadmin")
    tok = await _login(ac, user["username"])
    # promote to platform admin
    async with AsyncSessionLocal() as db:
        u = (await db.execute(select(User).where(User.username == user["username"]))).scalar_one()
        u.is_platform_admin = True
        await db.commit()

    r = await ac.post("/api/telegram/config", headers=_auth(tok), json={
        "botToken": "112233445:AAHdummytokenvalueis_long_enough_ok1",
        "chatId": "55667788",
    })
    assert r.status_code == 200, r.text

    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(SystemConfig).where(SystemConfig.key == "telegram_bot_token")
        )).scalar_one()
        assert row.value == "112233445:AAHdummytokenvalueis_long_enough_ok1"
    r2 = await ac.get("/api/telegram/config", headers=_auth(tok))
    assert r2.status_code == 200
    assert r2.json()["data"]["botTokenSource"] == "db"


async def test_telegram_config_rejects_malformed_token(app_client):
    ac = app_client
    user = await _register(ac, "tgadmin2")
    tok = await _login(ac, user["username"])
    async with AsyncSessionLocal() as db:
        u = (await db.execute(select(User).where(User.username == user["username"]))).scalar_one()
        u.is_platform_admin = True
        await db.commit()
    r = await ac.post("/api/telegram/config", headers=_auth(tok), json={
        "botToken": "not-a-token",
    })
    assert r.status_code == 400


async def test_notify_admins_iterates_db_approvers(monkeypatch):
    import telegram_bot as tb
    sent = []
    async def fake_send(chat_id, text, buttons=None):
        sent.append(chat_id)
        return {"ok": True}
    monkeypatch.setattr(tb, "send_message", fake_send)
    async with AsyncSessionLocal() as db:
        db.add(TelegramApprover(telegram_id="246813579", label="ثاني"))
        await db.commit()
    await tb.notify_admins_new_payment(1, "tester", 50, "liyana", "0911")
    assert 246813579 in sent, "DB approver must receive the notification"


# ────────────────────────────────────────────────────────────────────
# 6. Facebook app secret from SystemConfig (final gap §4)
# ────────────────────────────────────────────────────────────────────

async def test_webhook_app_secret_resolves_from_db(app_client, monkeypatch):
    """POST /webhook must accept a correctly-signed event when the app secret
    lives in SystemConfig (env unset — exactly the production situation)."""
    import runner as runner_mod
    # ensure env secret is not what signs our payload
    monkeypatch.setattr(runner_mod, "WEBHOOK_APP_SECRET", "")
    secret = "0" * 31 + "1"  # 32 hex chars
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(SystemConfig).where(SystemConfig.key == "facebook_app_secret"))
        row = existing.scalar_one_or_none()
        if row:
            row.value = secret
        else:
            db.add(SystemConfig(key="facebook_app_secret", value=secret, is_secret=True))
        await db.commit()

    user = await _register(app_client, "wsecret")
    await _login(app_client, user["username"])
    await _connect_page(app_client, user["username"], "555000111")

    payload = {
        "object": "page",
        "entry": [{
            "id": "555000111", "time": 1757000009999,
            "messaging": [{
                "sender": {"id": "424242", "name": "م"},
                "recipient": {"id": "555000111"},
                "timestamp": 1757000009999,
                "message": {"mid": f"mid.{uuid.uuid4().hex[:10]}", "text": "اختبار السر"},
            }],
        }],
    }
    body = json.dumps(payload).encode()
    sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    r = await app_client.post("/webhook", content=body, headers={"x-hub-signature-256": sig})
    assert r.status_code == 200, r.text
    async with AsyncSessionLocal() as db:
        msg = (await db.execute(select(Message).where(Message.text == "اختبار السر"))).scalars().first()
        assert msg is not None, "signed webhook event must be ingested with DB-resolved secret"
