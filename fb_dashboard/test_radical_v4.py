"""Radical plan v4 — regression suite (2026-09-06).

Covers the v4 critical fixes:
  1.  G2  — webhook comment routing resolves the tenant from the ENTRY PAGE id
      (was the commenter's user id → engine fell to a tokenless singleton).
  2.  §4.10 — webhook comments are persisted (Comment rows) so /api/comments
      is DB-first and alive.
  3.  §5.12/§5.13 — redelivery no longer double-replies; consecutive messages
      are NOT swallowed by the 60s cooldown anymore.
  4.  §5.14 — rule priority is settable via API + cache invalidation on CRUD.
  5.  §5.17 — Subscriber ingestion from messenger events (audience alive).
  6.  §4.11 — attachments/postbacks persist (no empty-text bubbles).
  7.  §3.6 — /api/comments works tenant-scoped with no global client.
  8.  §6.21 — /api/cron/heartbeat auth + idempotent report shape.
  9.  §2.2 — /api/notifications returns unread INSIDE the data envelope.
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
from models import (
    Base, User, Tenant, BotState, Conversation, Message, Rule,
    SystemConfig, Subscriber, Comment, Reply,
)


@pytest.fixture(scope="module")
async def app_client():
    from runner import app
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
    r = await ac.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return username


async def _connect_page(ac: AsyncClient, page_id: str) -> None:
    r = await ac.put("/api/facebook/settings", json={
        "page_id": page_id,
        "access_token": "EAAGfake-token-for-tests",
        "subscribe_webhook": False,
    })
    assert r.status_code == 200, r.text


async def _mk_rule(tenant_id: int, name: str, keywords: list[str], reply: str,
                   priority: int = 999, dm: str = "") -> int:
    async with AsyncSessionLocal() as db:
        rule = Rule(name=name, keywords=keywords, reply_template=reply,
                    dm_template=dm, priority=priority, tenant_id=tenant_id)
        db.add(rule)
        await db.commit()
        await db.refresh(rule)
        return rule.id


def _msg_event(page_id: str, sender_id: str, text: str, mid: str, ts: int = 1757000000000) -> dict:
    """The INNER messaging event — exactly what handle_messaging_event takes."""
    return {
        "sender": {"id": sender_id},
        "recipient": {"id": page_id},
        "timestamp": ts,
        "message": {"mid": mid, "seq": 1, "text": text},
    }


# ────────────────────────────────────────────────────────────────────
# 1. G2 + §4.10 — webhook comment: tenant resolved from entry page id + persisted
# ────────────────────────────────────────────────────────────────────

async def test_webhook_comment_resolves_tenant_and_persists(app_client):
    ac = app_client
    user = await _register(ac, "cmt")
    await _login(ac, user["username"])
    page_id = f"999888{uuid.uuid4().hex[:4]}"
    await _connect_page(ac, page_id)
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(BotState).where(BotState.key == "fb_page_id")
        )
        bs = row.scalars().first()
        assert bs and bs.value == page_id

    comment_id = f"c100_{uuid.uuid4().hex[:6]}"
    payload = {
        "object": "page",
        "entry": [{
            "id": page_id, "time": 1757000000000,
            "changes": [{
                "field": "feed",
                "value": {
                    "item": "comment", "verb": "add",
                    "comment_id": comment_id,
                    "post_id": "p_777",
                    "message": "شحال السعر؟",
                    "from": {"id": "100001", "name": "زبون تجريبي"},
                    "created_time": "2026-09-05T10:00:00+0000",
                },
            }],
        }],
    }
    body = json.dumps(payload).encode()
    r = await ac.post("/webhook", content=body, headers={"X-Hub-Signature-256": _sign(body)})
    assert r.status_code == 200, r.text

    # The comment must be PERSISTED under the page owner's tenant (G2+§4.10)
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(Comment).where(Comment.fb_comment_id == comment_id)
        )
        c = row.scalar_one_or_none()
        assert c is not None, "webhook comment was not persisted (G2 routing still broken)"
        assert c.tenant_id == user["tenant_id"]
        assert c.comment_text == "شحال السعر؟"
        assert c.commenter_name == "زبون تجريبي"
        assert c.fb_post_id == "p_777"


async def test_webhook_comment_unknown_page_is_skipped(app_client):
    ac = app_client
    payload = {
        "object": "page",
        "entry": [{
            "id": "unknown_page_000", "time": 1757000000000,
            "changes": [{
                "field": "feed",
                "value": {
                    "item": "comment", "verb": "add",
                    "comment_id": f"cX_{uuid.uuid4().hex[:6]}",
                    "post_id": "p_1", "message": "hi",
                    "from": {"id": "1", "name": "n"},
                },
            }],
        }],
    }
    import json as _json
    body = _json.dumps(payload).encode()
    r = await ac.post("/webhook", content=body, headers={"X-Hub-Signature-256": _sign(body)})
    assert r.status_code == 200  # webhook always acks; unknown page is skipped internally


# ────────────────────────────────────────────────────────────────────
# 2. §5.13 — redelivery does not double-reply
# ────────────────────────────────────────────────────────────────────

async def test_webhook_message_replay_does_not_reply_twice(app_client):
    ac = app_client
    user = await _register(ac, "rpl")
    await _login(ac, user["username"])
    page_id = f"777666{uuid.uuid4().hex[:4]}"
    await _connect_page(ac, page_id)
    tenant_id = user["tenant_id"]

    sent = {"n": 0}

    _pid = page_id

    class FakeFB:
        page_id = _pid
        async def send_dm(self, uid, text, messaging_type="RESPONSE", tag=None):
            sent["n"] += 1
            return {"message_id": f"mid_out_{sent['n']}"}
        async def _get(self, *a, **k):
            return None

    from messenger_service import handle_messaging_event
    # a matching rule + a CURRENT timestamp (the 10-min replay guard skips old events)
    await _mk_rule(tenant_id, "تحية", ["سلام", "عليكم"], "أهلاً وسهلاً!", priority=10)
    import time as _time
    ev = _msg_event(page_id, "555000111", "السلام عليكم",
                    f"m_{uuid.uuid4().hex[:8]}", ts=int(_time.time() * 1000))
    s1 = await handle_messaging_event(tenant_id, page_id, ev, FakeFB())
    assert s1["stored"] is True
    assert s1["replied"] is True, f"expected the rule to fire: {s1}"
    # FB redelivery: same mid → stored False → NO second reply (§5.13)
    s2 = await handle_messaging_event(tenant_id, page_id, ev, FakeFB())
    assert s2["stored"] is False
    assert s2["replied"] is False
    assert sent["n"] == 1, f"redelivery produced a duplicate reply: {sent['n']}"


# ────────────────────────────────────────────────────────────────────
# 3. §5.12 — consecutive messages are both answered (no 60s cooldown)
# ────────────────────────────────────────────────────────────────────

async def test_consecutive_messages_both_replied(app_client):
    ac = app_client
    user = await _register(ac, "con")
    await _login(ac, user["username"])
    page_id = f"555444{uuid.uuid4().hex[:4]}"
    await _connect_page(ac, page_id)
    tenant_id = user["tenant_id"]
    await _mk_rule(tenant_id, "السعر", ["سعر", "شحال"], "السعر 50 دينار", priority=10)

    sent = []

    _pid = page_id

    class FakeFB:
        page_id = _pid
        async def send_dm(self, uid, text, messaging_type="RESPONSE", tag=None):
            sent.append(text)
            return {"message_id": f"mid_{len(sent)}"}
        async def _get(self, *a, **k):
            return None

    from _services import reset_bot_engines
    reset_bot_engines()
    from messenger_service import handle_messaging_event
    s1 = await handle_messaging_event(
        tenant_id, page_id, _msg_event(page_id, "555000222", "سلام", f"a_{uuid.uuid4().hex[:6]}"), FakeFB())
    s2 = await handle_messaging_event(
        tenant_id, page_id, _msg_event(page_id, "555000222", "شحال السعر؟", f"b_{uuid.uuid4().hex[:6]}"), FakeFB())
    # second consecutive question MUST get an answer (the old 60s cooldown
    # swallowed it — the exact owner complaint "bot ignores customers")
    assert s2["replied"] is True, "consecutive message was swallowed (cooldown regression)"


# ────────────────────────────────────────────────────────────────────
# 4. §5.14 — priority settable + cache invalidation on rule CRUD
# ────────────────────────────────────────────────────────────────────

async def test_rule_crud_priority_and_cache_invalidation(app_client):
    ac = app_client
    user = await _register(ac, "pri")
    tok = await _login(ac, user["username"])
    tenant_id = user["tenant_id"]

    # create with priority 5 via the API (was: not settable at all)
    r = await ac.post("/api/rules", data={
        "name": "أولوية عالية", "keywords": "عاجل,مهم",
        "reply_template": "سنرد حالاً", "priority": "5",
    })
    assert r.status_code == 200, r.text
    rule_id = r.json()["data"]["id"]

    async with AsyncSessionLocal() as db:
        rule = await db.get(Rule, rule_id)
        assert rule.priority == 5

    # the engine cache must reflect the new rule immediately (no 120s staleness)
    from _services import get_bot_engine, _bot_engines
    _bot_engines.pop(tenant_id, None)
    engine = get_bot_engine(None, tenant_id=tenant_id)
    await engine._ensure_cache()
    rules = await engine._rule_cache.get_rules()
    assert any(x["id"] == rule_id for x in rules), "new rule not visible to the engine (cache not invalidated)"

    # toggle → cache invalidated again (engine sees enabled=False)
    r = await ac.post(f"/api/rules/{rule_id}/toggle")
    assert r.status_code == 200
    rules = await engine._rule_cache.get_rules()
    target = [x for x in rules if x["id"] == rule_id]
    assert target and target[0]["enabled"] is False, "toggle not reflected in engine cache"


# ────────────────────────────────────────────────────────────────────
# 5. §5.17 — subscriber ingestion from messenger events
# ────────────────────────────────────────────────────────────────────

async def test_messenger_event_creates_subscriber(app_client):
    ac = app_client
    user = await _register(ac, "sub")
    await _login(ac, user["username"])
    page_id = f"333222{uuid.uuid4().hex[:4]}"
    await _connect_page(ac, page_id)
    tenant_id = user["tenant_id"]

    _pid = page_id

    class FakeFB:
        page_id = _pid
        async def send_dm(self, uid, text, messaging_type="RESPONSE", tag=None):
            return {"message_id": "m1"}
        async def _get(self, *a, **k):
            return None

    from messenger_service import handle_messaging_event
    sid = f"111222333{uuid.uuid4().hex[:4]}"
    await handle_messaging_event(
        tenant_id, page_id, _msg_event(page_id, sid, "مرحبا", f"s_{uuid.uuid4().hex[:8]}"), FakeFB())

    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(Subscriber).where(
                Subscriber.tenant_id == tenant_id, Subscriber.fb_user_id == sid)
        )
        sub = row.scalar_one_or_none()
        assert sub is not None, "messenger event did not create a Subscriber (audience stays 0)"
        assert sub.platform == "messenger"


# ────────────────────────────────────────────────────────────────────
# 6. §4.11 — attachments + postback persist
# ────────────────────────────────────────────────────────────────────

async def test_attachment_and_postback_persist(app_client):
    ac = app_client
    user = await _register(ac, "att")
    await _login(ac, user["username"])
    page_id = f"111000{uuid.uuid4().hex[:4]}"
    await _connect_page(ac, page_id)
    tenant_id = user["tenant_id"]

    from messenger_service import persist_message
    async with AsyncSessionLocal() as db:
        # image attachment
        m = await persist_message(db, tenant_id, page_id, {
            "sender": {"id": "9001"}, "recipient": {"id": page_id},
            "message": {"mid": f"img_{uuid.uuid4().hex[:8]}", "attachments": [
                {"type": "image", "payload": {"url": "https://cdn.fb/x.jpg"}}]},
        }, f"w_{page_id}_9001", is_from_page=False)
        assert m is not None
        assert m.attachment_type == "image"
        assert m.attachment_url == "https://cdn.fb/x.jpg"

        # postback (no message.mid at all — previously DROPPED)
        pb = await persist_message(db, tenant_id, page_id, {
            "sender": {"id": "9002"}, "recipient": {"id": page_id},
            "timestamp": 1757000000000,
            "postback": {"payload": "GET_PRICES", "title": "الأسعار"},
        }, f"w_{page_id}_9002", is_from_page=False)
        assert pb is not None, "postback event was dropped (no mid)"
        assert pb.postback_payload == "GET_PRICES"
        assert pb.text == "الأسعار"
        await db.commit()


# ────────────────────────────────────────────────────────────────────
# 7. §3.6/§4.10 — /api/comments is DB-first (works with no global token)
# ────────────────────────────────────────────────────────────────────

async def test_comments_endpoint_serves_stored_rows(app_client):
    ac = app_client
    user = await _register(ac, "cdb")
    await _login(ac, user["username"])
    tenant_id = user["tenant_id"]
    cid = f"cc_{uuid.uuid4().hex[:6]}"
    async with AsyncSessionLocal() as db:
        db.add(Comment(
            tenant_id=tenant_id, fb_comment_id=cid, fb_post_id="p_9",
            commenter_id="7001", commenter_name="معلق",
            comment_text="تعليق مخزن", reply_text="رد مخزن", replied_by_bot=True,
        ))
        await db.commit()

    r = await ac.get("/api/comments?limit=30")
    assert r.status_code == 200, r.text
    items = r.json()["data"]["items"]
    match = [i for i in items if i["id"] == cid]
    assert match, "stored comment not served by /api/comments (DB-first broken)"
    assert match[0]["reply_text"] == "رد مخزن"


# ────────────────────────────────────────────────────────────────────
# 8. §6.21 — heartbeat cron: auth + report shape
# ────────────────────────────────────────────────────────────────────

async def test_heartbeat_cron_requires_secret(app_client):
    ac = app_client
    r = await ac.get("/api/cron/heartbeat")
    assert r.status_code == 403
    r = await ac.get("/api/cron/heartbeat?token=wrong")
    assert r.status_code == 403


async def test_heartbeat_cron_report_shape(app_client):
    ac = app_client
    r = await ac.get("/api/cron/heartbeat?token=test-cron-secret")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert set(data.keys()) >= {"published_posts", "fan_refreshed", "cycles", "errors"}


# ────────────────────────────────────────────────────────────────────
# 9. §2.2 — notifications unread INSIDE data envelope
# ────────────────────────────────────────────────────────────────────

async def test_notifications_unread_inside_data(app_client):
    ac = app_client
    user = await _register(ac, "ntf")
    await _login(ac, user["username"])
    r = await ac.get("/api/notifications")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "data" in body
    assert "items" in body["data"]
    assert "unread" in body["data"], "unread must live inside data (unwrapApi strips siblings)"


# ────────────────────────────────────────────────────────────────────
# 10. §5.19 — DM replies count toward rule stats
# ────────────────────────────────────────────────────────────────────

async def test_dm_reply_counted_in_rule_stats(app_client):
    ac = app_client
    user = await _register(ac, "stt")
    await _login(ac, user["username"])
    tenant_id = user["tenant_id"]
    rule_id = await _mk_rule(tenant_id, "تحية", ["سلام"], "أهلاً بك!", priority=20)
    async with AsyncSessionLocal() as db:
        conv = Conversation(tenant_id=tenant_id, fb_conversation_id="w_test_stats",
                            fb_user_id="4242", user_name="زبون")
        db.add(conv)
        await db.flush()
        db.add(Message(
            tenant_id=tenant_id, conversation_id=conv.id,
            fb_message_id=f"st_{uuid.uuid4().hex[:8]}",
            fb_conversation_id="w_test_stats", sender_id="999000",
            sender_name="SmartBot", text="أهلاً بك!", is_from_page=True,
            replied_by_bot=True, rule_id=rule_id,
        ))
        await db.commit()

    r = await ac.get("/api/rules")
    assert r.status_code == 200
    rules = r.json()["data"]
    match = [x for x in rules if x["id"] == rule_id]
    assert match and match[0]["replies_count"] >= 1, "DM reply not counted in rule stats"
