"""v14-E6 (D9 gap G3) — Messenger webhook MULTI-ENTRY contract.

Facebook delivers BATCHES: one POST can carry ``entry[]`` for several pages,
and a single entry can carry BOTH ``messaging[]`` (Messenger events) and
``changes[]`` (feed comments) — the daily production shape. Every pre-v14
webhook test sends exactly one entry with one event, so the per-entry loop
logic and the cross-entry tenant routing were never pinned:

  1. three entries → three pages → three tenants in ONE payload: ALL are
     processed (one Message row per tenant, with the right tenant_id and
     text — not just an HTTP 200)
  2. the real mixed payload: ``entry[].messaging[]`` AND
     ``entry[].changes[]`` (field=feed, item=comment, verb=add) in the SAME
     POST — the Messenger row AND the feed Comment row both land
  3. redelivery idempotency: the SAME ``mid`` delivered twice → ONE bot
     reply — the documented v4 §5.13 replay guard (storage dedup feeds the
     reply gate), proven via the ``send_dm`` CALL COUNT on an injected fake
     FB client (stronger than the row-count-only pin in test_world_class_v3)

Hermetic by design: ``app.webhooks.get_tenant_fb_client`` is patched to a
counting fake, so no Graph call ever leaves the process (the v3 suite's
real client needs live network just to fail conversation resolution).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod-0123456789")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("FACEBOOK_APP_SECRET", "test-app-secret")
os.environ.setdefault("DEBUG", "True")

import pytest
from database import AsyncSessionLocal
from database import engine as db_engine
from httpx import ASGITransport, AsyncClient
from models import Base, Comment, Message, Rule
from sqlalchemy import select

_APP_SECRET = os.environ["FACEBOOK_APP_SECRET"]


@pytest.fixture(scope="module")
async def app_client():
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # This suite registers MANY users from one client IP; per-IP register
    # limits would 429 mid-module. Rate limiting has dedicated tests —
    # neutralised HERE only (pattern of test_world_class_v3).
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


class FakeFBClient:
    """Counting FB stand-in: replies recorded, conversation resolution
    resolves nothing (synthetic-id fallback — same as a token failure)."""

    def __init__(self) -> None:
        self.page_id = "fake"
        self.dm_calls: list[tuple[str, str]] = []

    async def send_dm(self, user_id, message, messaging_type="RESPONSE", tag=None):
        self.dm_calls.append((str(user_id), str(message)))
        return {"message_id": f"mid.reply.{len(self.dm_calls)}"}

    async def _get(self, path, params=None):
        return {"data": []}


@pytest.fixture
def fake_fb():
    """Swap the webhook's tenant FB client factory for the counting fake."""
    import app.webhooks as webhooks_mod

    fake = FakeFBClient()

    async def _factory(tenant_id: int):
        return fake

    mp = pytest.MonkeyPatch()
    mp.setattr(webhooks_mod, "get_tenant_fb_client", _factory)
    try:
        yield fake
    finally:
        mp.undo()


def _sign(body: bytes) -> str:
    return "sha256=" + hmac.new(_APP_SECRET.encode(), body, hashlib.sha256).hexdigest()


async def _register(ac: AsyncClient, prefix: str) -> dict:
    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = await ac.post("/api/register", json={
        "username": uname, "email": f"{uname}@t.ly",
        "password": "Str0ngPass!ly", "name": prefix,
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["user"]


async def _connect_page(ac: AsyncClient, page_id: str) -> None:
    r = await ac.put("/api/facebook/settings", json={
        "page_id": page_id,
        "access_token": "EAAGfake-token-for-tests",
        "subscribe_webhook": False,
    })
    assert r.status_code == 200, r.text


def _now_ms() -> int:
    return int(time.time() * 1000) - 1000


def _messaging_entry(page_id: str, sender_id: str, sender_name: str,
                      mid: str, text: str, ts: int) -> dict:
    """One real-shape Messenger entry (page-level)."""
    return {
        "id": page_id,
        "time": ts,
        "messaging": [{
            "sender": {"id": sender_id, "name": sender_name},
            "recipient": {"id": page_id},
            "timestamp": ts,
            "message": {"mid": mid, "text": text},
        }],
    }


async def _post_webhook(ac: AsyncClient, payload: dict):
    body = json.dumps(payload).encode()
    r = await ac.post("/webhook", content=body,
                      headers={"x-hub-signature-256": _sign(body)})
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}
    return r


async def _messages_for(tenant_id: int, mid: str) -> list[Message]:
    async with AsyncSessionLocal() as db:
        return (await db.execute(
            select(Message).where(
                Message.tenant_id == tenant_id,
                Message.fb_message_id == mid,
            )
        )).scalars().all()


# ────────────────────────────────────────────────────────────────────
# 1. multi-entry batch: 3 pages → 3 tenants, all processed
# ────────────────────────────────────────────────────────────────────

async def test_webhook_three_entries_in_one_payload_all_processed(app_client, fake_fb):
    ac = app_client
    users = []
    pages = []
    for i in range(3):
        u = await _register(ac, f"multi{i}")
        await _connect_page(ac, f"10000000{i + 1}")
        users.append(u)
        pages.append(f"10000000{i + 1}")
    # drop the register cookies — the webhook path needs none (page routing)
    ac.cookies.clear()

    ts = _now_ms()
    payload = {"object": "page", "entry": [
        _messaging_entry(pages[i], f"99000000{i}", f"مرسل {i}",
                         f"mid.multi.{i}.{uuid.uuid4().hex[:6]}",
                         f"رسالة العميل رقم {i} — كم السعر؟", ts)
        for i in range(3)
    ]}
    await _post_webhook(ac, payload)

    for i, u in enumerate(users):
        rows = await _messages_for(u["tenant_id"], payload["entry"][i]["messaging"][0]["message"]["mid"])
        assert len(rows) == 1, (
            f"entry {i} (page {pages[i]}) was not persisted exactly once for "
            f"tenant {u['tenant_id']}"
        )
        assert rows[0].text == f"رسالة العميل رقم {i} — كم السعر؟"
        assert rows[0].is_from_page is False
        assert rows[0].sender_id == f"99000000{i}"
    # no rules exist for these tenants → the engine must not have replied
    assert fake_fb.dm_calls == []


# ────────────────────────────────────────────────────────────────────
# 2. real Facebook shape: messaging[] + changes[] (feed) in ONE payload
# ────────────────────────────────────────────────────────────────────

async def test_webhook_mixed_messaging_and_feed_changes_one_payload(app_client, fake_fb):
    ac = app_client
    msg_user = await _register(ac, "mixmsg")
    await _connect_page(ac, "2000000001")
    cmt_user = await _register(ac, "mixcmt")
    await _connect_page(ac, "2000000002")
    ac.cookies.clear()

    ts = _now_ms()
    comment_id = f"c_{uuid.uuid4().hex[:10]}"
    payload = {
        "object": "page",
        "entry": [
            # entry A — Messenger event
            _messaging_entry("2000000001", "990000009", "سالم",
                             f"mid.mix.{uuid.uuid4().hex[:6]}",
                             "مرحبا، ما هي الأسعار؟", ts),
            # entry B — feed change (new comment on a page post)
            {
                "id": "2000000002",
                "time": ts,
                "changes": [{
                    "field": "feed",
                    "value": {
                        "item": "comment",
                        "verb": "add",
                        "comment_id": comment_id,
                        "post_id": "post_2000000002_1",
                        "message": "هل التوصيل متاح لبنغازي؟",
                        "from": {"id": "888777666", "name": "علي المهيري"},
                        "created_time": ts,
                    },
                }],
            },
        ],
    }
    await _post_webhook(ac, payload)

    # the Messenger branch landed for tenant A
    msg_mid = payload["entry"][0]["messaging"][0]["message"]["mid"]
    msg_rows = await _messages_for(msg_user["tenant_id"], msg_mid)
    assert len(msg_rows) == 1
    assert msg_rows[0].text == "مرحبا، ما هي الأسعار؟"

    # the feed-comment branch landed for tenant B (v4 §4.10 DB-first persist)
    async with AsyncSessionLocal() as db:
        cmt = (await db.execute(
            select(Comment).where(
                Comment.tenant_id == cmt_user["tenant_id"],
                Comment.fb_comment_id == comment_id,
            )
        )).scalar_one_or_none()
    assert cmt is not None, "feed change[] comment was not persisted"
    assert cmt.comment_text == "هل التوصيل متاح لبنغازي؟"
    assert cmt.fb_post_id == "post_2000000002_1"
    assert cmt.commenter_id == "888777666"
    assert cmt.commenter_name == "علي المهيري"
    # no rules on either tenant → nothing was sent
    assert fake_fb.dm_calls == []


# ────────────────────────────────────────────────────────────────────
# 3. redelivery idempotency: same mid twice → ONE reply (sender mock)
# ────────────────────────────────────────────────────────────────────

async def test_webhook_same_mid_delivered_twice_replies_once(app_client, fake_fb):
    ac = app_client
    user = await _register(ac, "idem")
    await _connect_page(ac, "3000000001")
    ac.cookies.clear()

    # a matching rule so the webhook actually replies (DM path)
    async with AsyncSessionLocal() as db:
        db.add(Rule(
            tenant_id=user["tenant_id"], name="pricing",
            keywords=["السعر", "سعر"],
            reply_template="السعر يبدأ من 50 د.ل يا {name}",
            dm_template="", enabled=True, priority=10, bot_type="reply",
        ))
        await db.commit()

    mid = f"mid.idem.{uuid.uuid4().hex[:8]}"
    payload = {"object": "page", "entry": [
        _messaging_entry("3000000001", "990000001", "فاطمة", mid,
                         "كم السعر؟", _now_ms()),
    ]}
    body = json.dumps(payload).encode()
    headers = {"x-hub-signature-256": _sign(body)}

    # Facebook redelivers when the 200 is slow: same body, same signature
    r1 = await ac.post("/webhook", content=body, headers=headers)
    r2 = await ac.post("/webhook", content=body, headers=headers)
    assert r1.status_code == 200 and r2.status_code == 200

    # THE pin: the replay guard (v4 §5.13) let exactly ONE reply through —
    # measured on the sender mock, not on DB row counts
    assert len(fake_fb.dm_calls) == 1, (
        f"redelivered mid must not double-reply — send_dm calls: "
        f"{fake_fb.dm_calls}"
    )
    assert fake_fb.dm_calls[0][0] == "990000001"  # replied to the sender
    assert "السعر يبدأ من 50" in fake_fb.dm_calls[0][1]

    # storage stayed deduplicated too (one inbound row + one bot reply row)
    inbound = await _messages_for(user["tenant_id"], mid)
    assert len(inbound) == 1
    async with AsyncSessionLocal() as db:
        replies = (await db.execute(
            select(Message).where(
                Message.tenant_id == user["tenant_id"],
                Message.is_from_page.is_(True),
                Message.replied_by_bot.is_(True),
            )
        )).scalars().all()
    assert len(replies) == 1, "bot reply row must exist exactly once"


async def test_webhook_non_page_object_is_acknowledged_without_processing(app_client, fake_fb):
    """object != page (e.g. Instagram) → 200 ok, entries never touched."""
    ac = app_client
    body = json.dumps({"object": "instagram", "entry": [{"id": "x", "changes": []}]}).encode()
    r = await ac.post("/webhook", content=body,
                      headers={"x-hub-signature-256": _sign(body)})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert fake_fb.dm_calls == []
