"""v22-D2 (W2-FIN) — inbox thread staleness re-sync + page-sent persist.

THE LIVE EVIDENCE (W1-D2, 2026-09-10): the stored thread had 46 messages
while the Graph conversation had 47 — the missing «الو» (11:02:54) was sent
BEFORE the owner re-opened the thread at 11:29:50 and still never appeared,
because a NON-EMPTY DB thread short-circuited before any live fetch (the v21
persist only ran for empty threads). The thread froze at its first persist
forever. Companion defect: `inbox_reply` sends via POST /{page}/messages but
never persists the page-sent message — it only (maybe) appears on a future
empty-thread fetch, which can never happen once the thread is non-empty.

This suite pins the closure (hermetic — Graph fakes, no network):

  1. stale thread (Graph updated_time > newest DB message) → refetch +
     dedup-persist (v21 naive-UTC pattern) → the NEW message is served and
     stored, existing rows are NOT duplicated
  2. second open after a re-sync → marker now equals the newest DB message
     → NO second refetch (the probe is the only Graph call)
  3. fresh thread (marker == newest DB message) → served from DB, zero
     message fetches
  4. probe failure (meta=None / client raising / old fake without
     get_conversation_meta) → the DB copy serves, never a 500
  5. inbox_reply → the page-sent message is persisted at send time
     (fb_message_id from the Graph response, is_from_page=True, conversation
     counters bumped)
  6. inbox_reply dedup: a pre-existing fb_message_id is never duplicated
"""
from __future__ import annotations

import os
import uuid

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod-0123456789")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DEBUG", "True")

import pytest
from database import engine as db_engine
from httpx import ASGITransport, AsyncClient
from models import Base


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


async def _register(ac: AsyncClient, prefix: str) -> dict:
    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = await ac.post("/api/register", json={
        "username": uname, "email": f"{uname}@t.ly",
        "password": "Str0ngPass!ly", "name": prefix,
    })
    assert r.status_code == 200, r.text
    d = r.json()["data"]["user"]
    return {"id": d["id"], "username": uname, "tenant_id": d["tenant_id"]}


class FakeResyncFB:
    """Fake tenant FB client with the v22-D2 meta-probe seam."""

    def __init__(self) -> None:
        self.page_id = "fake-page"
        # bare thread — each test composes its own live truth
        self.thread: list[dict] = [
            {"id": "m1", "message": "مرحبا",
             "from": {"id": "1001", "name": "زبون"},
             "created_time": "2026-09-10T01:00:00+0000", "is_from_page": False},
        ]
        self.meta: dict | None = {
            "id": "t_x", "updated_time": "2026-09-10T01:01:00+0000",
            "message_count": 2,
        }
        self.meta_calls = 0
        self.msg_calls = 0
        self.sent: list[tuple[str, str]] = []
        self.next_mid = "mid_reply_1"
        self.send_fails = False

    async def get_conversation_meta(self, conversation_id: str):
        self.meta_calls += 1
        if self.meta is None:
            return None
        return dict(self.meta)

    async def get_conversation_messages(self, conversation_id: str,
                                        limit: int = 50):
        self.msg_calls += 1
        return [dict(m) for m in self.thread]

    async def send_conversation_message(self, conversation_id: str,
                                        message: str):
        if self.send_fails:
            return None  # the real FBClient failure contract (never raises)
        self.sent.append((conversation_id, message))
        return {"recipient_id": "1001", "message_id": self.next_mid}

    async def send_private_reply(self, comment_id: str, message: str):
        return {"_error": True, "body": "fake: no private reply path"}


@pytest.fixture
def fake_fb():
    import routers.inbox as inbox_mod

    fake = FakeResyncFB()

    async def _factory(tenant_id: int):
        return fake

    mp = pytest.MonkeyPatch()
    mp.setattr(inbox_mod, "get_tenant_fb_client", _factory)
    mp.setattr(inbox_mod, "_tenant_fb_cache", {})
    try:
        yield fake
    finally:
        mp.undo()


async def _seed_convo(tid: int, cid: str, msgs: list[dict],
                      message_count: int | None = None) -> int:
    """Conversation row + Message rows; returns the conversation row id."""
    from database import AsyncSessionLocal
    from models import Conversation, Message

    async with AsyncSessionLocal() as db:
        conv = Conversation(
            tenant_id=tid, fb_conversation_id=cid,
            fb_user_id="1001", user_name="زبون",
            message_count=(message_count if message_count is not None
                           else len(msgs)),
            unread_count=1,
        )
        db.add(conv)
        await db.flush()
        for m in msgs:
            db.add(Message(
                tenant_id=tid, conversation_id=conv.id,
                fb_message_id=m["id"], fb_conversation_id=cid,
                sender_id=m.get("sender_id", "1001"),
                sender_name=m.get("sender_name", ""),
                text=m.get("text", ""), is_from_page=m.get("is_from_page", False),
                created_at=m.get("created_at"),
            ))
        await db.commit()
        return conv.id


async def _tenant_messages(tid: int):
    from database import AsyncSessionLocal
    from models import Message
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Message).where(Message.tenant_id == tid)
            .order_by(Message.id.asc())
        )).scalars().all()
        return rows


# ── 1) stale thread → refetch + dedup-persist + serve the new message ────


async def test_stale_thread_resyncs_persists_and_serves(app_client, fake_fb):
    """DB 2 (newest 01:01) vs Graph marker 01:05 → the thread refetches, the
    missing message lands in the DB AND in the response (the W1-D2 «الو»
    reproduction: 46 vs 47)."""
    from datetime import datetime as dt

    user = await _register(app_client, "v22rs")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [
        {"id": "m1", "text": "مرحبا", "created_at": dt(2026, 9, 10, 1, 0, 0)},
        {"id": "m2", "text": "أهلاً", "created_at": dt(2026, 9, 10, 1, 1, 0),
         "is_from_page": True, "sender_id": "fake-page"},
    ])
    # live truth: the full thread — m2 (already stored) + m3 (the missing one)
    fake_fb.thread.append({
        "id": "m2", "message": "أهلاً بك",
        "from": {"id": "fake-page", "name": "الصفحة"},
        "created_time": "2026-09-10T01:01:00+0000", "is_from_page": True})
    fake_fb.thread.append({
        "id": "m3", "message": "الو",
        "from": {"id": "1001", "name": "زبون"},
        "created_time": "2026-09-10T01:05:00+0000", "is_from_page": False})
    fake_fb.meta = {"id": "t_v22", "updated_time": "2026-09-10T01:05:00+0000",
                    "message_count": 3}

    r = await app_client.get("/api/inbox/conversations/t_v22")
    assert r.status_code == 200, r.text
    msgs = r.json()["data"]
    assert [m["id"] for m in msgs] == ["m1", "m2", "m3"], msgs
    assert msgs[2]["message"] == "الو"
    assert msgs[2]["is_from_page"] is False

    assert fake_fb.meta_calls == 1
    assert fake_fb.msg_calls == 1  # the actual refetch happened

    rows = await _tenant_messages(tid)
    assert [rw.fb_message_id for rw in rows] == ["m1", "m2", "m3"]
    # v21 naive-UTC contract: the newly persisted row is tz-NAIVE (asyncpg
    # DataError class — an aware datetime 500s the read on production PG)
    m3 = rows[2]
    assert m3.created_at is not None and m3.created_at.tzinfo is None
    assert m3.created_at == dt(2026, 9, 10, 1, 5, 0)
    assert m3.is_from_page is False


async def test_resync_is_dedup_idempotent_on_second_open(app_client, fake_fb):
    """After the re-sync the marker equals the newest DB message → the second
    open serves the merged DB thread with NO second messages fetch (and no
    duplicate rows)."""
    from datetime import datetime as dt

    user = await _register(app_client, "v22rd")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [
        {"id": "m1", "text": "مرحبا", "created_at": dt(2026, 9, 10, 1, 0, 0)},
    ])
    fake_fb.thread.append({
        "id": "m2", "message": "جديد",
        "from": {"id": "1001", "name": "زبون"},
        "created_time": "2026-09-10T01:05:00+0000", "is_from_page": False})
    fake_fb.meta = {"id": "t_v22", "updated_time": "2026-09-10T01:05:00+0000",
                    "message_count": 2}
    r1 = await app_client.get("/api/inbox/conversations/t_v22")
    assert [m["id"] for m in r1.json()["data"]] == ["m1", "m2"]
    assert fake_fb.msg_calls == 1

    # second open: marker == newest DB message (01:05) → fresh, DB serves
    r2 = await app_client.get("/api/inbox/conversations/t_v22")
    assert r2.status_code == 200
    assert [m["id"] for m in r2.json()["data"]] == ["m1", "m2"]
    assert fake_fb.msg_calls == 1  # NO second fetch — dedup proven
    assert fake_fb.meta_calls == 2  # the probe DID run (cheap GET contract)

    rows = await _tenant_messages(tid)
    assert [rw.fb_message_id for rw in rows] == ["m1", "m2"]


# ── 2) fresh thread → DB serves, zero message fetches ─────────────────────


async def test_fresh_thread_no_refetch(app_client, fake_fb):
    from datetime import datetime as dt

    user = await _register(app_client, "v22fr")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [
        {"id": "m1", "text": "مرحبا", "created_at": dt(2026, 9, 10, 1, 0, 0)},
        {"id": "m2", "text": "أهلاً", "created_at": dt(2026, 9, 10, 1, 1, 0),
         "is_from_page": True, "sender_id": "fake-page"},
    ])
    # marker == newest stored message → nothing to fetch
    fake_fb.meta = {"id": "t_v22", "updated_time": "2026-09-10T01:01:00+0000",
                    "message_count": 2}

    r = await app_client.get("/api/inbox/conversations/t_v22")
    assert r.status_code == 200
    assert [m["id"] for m in r.json()["data"]] == ["m1", "m2"]
    assert fake_fb.meta_calls == 1
    assert fake_fb.msg_calls == 0  # fresh → no refetch


async def test_marker_older_than_db_no_refetch(app_client, fake_fb):
    """Page-sent messages persisted at send time can be NEWER than the Graph
    marker (clock granularity) — that is NOT staleness; no refetch loop."""
    from datetime import datetime as dt

    user = await _register(app_client, "v22mo")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [
        {"id": "m1", "text": "مرحبا", "created_at": dt(2026, 9, 10, 1, 0, 0)},
        {"id": "m2", "text": "ردنا", "created_at": dt(2026, 9, 10, 1, 2, 30),
         "is_from_page": True, "sender_id": "fake-page"},
    ])
    fake_fb.meta = {"id": "t_v22", "updated_time": "2026-09-10T01:02:00+0000",
                    "message_count": 2}

    r = await app_client.get("/api/inbox/conversations/t_v22")
    assert r.status_code == 200
    assert fake_fb.msg_calls == 0


# ── 3) probe failures → the DB copy serves, never a 500 ──────────────────


async def test_probe_failure_serves_db_copy(app_client, fake_fb):
    from datetime import datetime as dt

    user = await _register(app_client, "v22pf")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [
        {"id": "m1", "text": "مرحبا", "created_at": dt(2026, 9, 10, 1, 0, 0)},
    ])
    fake_fb.meta = None  # probe failed (expired token / offline)

    r = await app_client.get("/api/inbox/conversations/t_v22")
    assert r.status_code == 200, r.text
    assert [m["id"] for m in r.json()["data"]] == ["m1"]
    assert fake_fb.msg_calls == 0


async def test_probe_exception_serves_db_copy(app_client, fake_fb):
    from datetime import datetime as dt

    user = await _register(app_client, "v22pe")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [
        {"id": "m1", "text": "مرحبا", "created_at": dt(2026, 9, 10, 1, 0, 0)},
    ])

    async def _boom(conversation_id: str):
        raise RuntimeError("graph exploded")

    fake_fb.get_conversation_meta = _boom  # type: ignore[method-assign]

    r = await app_client.get("/api/inbox/conversations/t_v22")
    assert r.status_code == 200, r.text
    assert [m["id"] for m in r.json()["data"]] == ["m1"]


async def test_old_fake_without_meta_probe_serves_db(app_client, fake_fb):
    """Back-compat: fakes without the v22 meta seam (the v21 test doubles)
    keep serving the stored thread — getattr fallback, never AttributeError."""
    from datetime import datetime as dt

    user = await _register(app_client, "v22of")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [
        {"id": "m1", "text": "مرحبا", "created_at": dt(2026, 9, 10, 1, 0, 0)},
    ])
    fake_fb.__dict__.pop("get_conversation_meta", None)
    # simulate a class without the method entirely
    import routers.inbox as inbox_mod

    probe = inbox_mod.get_tenant_fb_client

    class OldFake:
        page_id = "fake-page"

        async def get_conversation_messages(self, conversation_id: str,
                                            limit: int = 50):
            return fake_fb.thread

    async def _factory(tenant_id: int):
        return OldFake()

    mp = pytest.MonkeyPatch()
    mp.setattr(inbox_mod, "get_tenant_fb_client", _factory)
    mp.setattr(inbox_mod, "_tenant_fb_cache", {})
    try:
        r = await app_client.get("/api/inbox/conversations/t_v22")
        assert r.status_code == 200, r.text
        assert [m["id"] for m in r.json()["data"]] == ["m1"]
    finally:
        mp.setattr(inbox_mod, "get_tenant_fb_client", probe)
        mp.undo()


async def test_not_connected_tenant_still_serves_db_thread(app_client, fake_fb):
    """The probe must NOT break the DB-first read when the tenant is not
    connected at all (the _get_inbox_fb 400 must stay swallowed here)."""
    from datetime import datetime as dt

    user = await _register(app_client, "v22nc")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [
        {"id": "m1", "text": "مرحبا", "created_at": dt(2026, 9, 10, 1, 0, 0)},
    ])

    import routers.inbox as inbox_mod
    from fastapi import HTTPException

    async def _factory_none(tenant_id: int):
        raise HTTPException(400, "لم يتم إعداد فيسبوك بعد")

    mp = pytest.MonkeyPatch()
    mp.setattr(inbox_mod, "get_tenant_fb_client", _factory_none)
    mp.setattr(inbox_mod, "_tenant_fb_cache", {})
    try:
        r = await app_client.get("/api/inbox/conversations/t_v22")
        assert r.status_code == 200, r.text
        assert [m["id"] for m in r.json()["data"]] == ["m1"]
    finally:
        mp.undo()


# ── 4) message_count fallback marker ─────────────────────────────────────


async def test_count_marker_triggers_resync_without_time(app_client, fake_fb):
    """A thread whose stored rows predate timestamps (created_at NULL) has no
    comparable marker — the message_count delta still detects staleness."""
    user = await _register(app_client, "v22cm")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [
        {"id": "m1", "text": "مرحبا", "created_at": None},
        {"id": "m2", "text": "أهلاً", "created_at": None},
    ])
    # marker without a parseable updated_time; count says 3 live vs 2 stored
    fake_fb.meta = {"id": "t_v22", "updated_time": "", "message_count": 3}
    fake_fb.thread.append({
        "id": "m2", "message": "الثانية",
        "from": {"id": "1001", "name": "زبون"},
        "created_time": "2026-09-10T01:04:00+0000", "is_from_page": False})
    fake_fb.thread.append({
        "id": "m3", "message": "الثالثة",
        "from": {"id": "1001", "name": "زبون"},
        "created_time": "2026-09-10T01:05:00+0000", "is_from_page": False})

    r = await app_client.get("/api/inbox/conversations/t_v22")
    assert r.status_code == 200, r.text
    # seeded rows carry NULL created_at → ASC ordering is undefined across
    # NULLs (SQLite sorts NULLs first); assert presence, not order
    assert sorted(m["id"] for m in r.json()["data"]) == ["m1", "m2", "m3"]
    rows = await _tenant_messages(tid)
    assert [rw.fb_message_id for rw in rows] == ["m1", "m2", "m3"]


# ── 5) inbox_reply persists the page-sent message at send time ───────────


async def test_reply_persists_page_sent_message(app_client, fake_fb):
    """W1-D2 §4.2: the sent reply previously appeared only on a (never-again)
    empty-thread fetch. It must land in the DB at send time, attributed to
    the page, and the conversation counters must move."""
    from database import AsyncSessionLocal
    from models import Conversation
    from sqlalchemy import select

    user = await _register(app_client, "v22rp")
    tid = user["tenant_id"]
    conv_id = await _seed_convo(tid, "t_v22", [], message_count=0)

    r = await app_client.post("/api/inbox/conversations/t_v22/reply",
                              data={"message": "رد الاختبار"})
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"ok": True}

    assert fake_fb.sent == [("t_v22", "رد الاختبار")]

    rows = await _tenant_messages(tid)
    assert len(rows) == 1
    sent = rows[0]
    assert sent.fb_message_id == "mid_reply_1"
    assert sent.is_from_page is True
    assert sent.sender_id == "fake-page"
    assert sent.text == "رد الاختبار"
    assert sent.conversation_id == conv_id
    assert sent.fb_conversation_id == "t_v22"
    assert sent.created_at is not None and sent.created_at.tzinfo is None

    async with AsyncSessionLocal() as db:
        conv = (await db.execute(
            select(Conversation).where(Conversation.id == conv_id)
        )).scalar_one()
        assert conv.message_count == 1
        assert conv.last_message_text == "رد الاختبار"
        assert conv.last_message_at is not None


async def test_reply_persist_is_deduped(app_client, fake_fb):
    """A Graph echo (or a webhook redelivery racing the send) can persist the
    same message_id first — the send-time persist must never duplicate it."""
    from datetime import datetime as dt

    user = await _register(app_client, "v22dd")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [
        {"id": "mid_reply_1", "text": "رد الاختبار",
         "created_at": dt(2026, 9, 10, 1, 0, 0), "is_from_page": True,
         "sender_id": "fake-page"},
    ])

    r = await app_client.post("/api/inbox/conversations/t_v22/reply",
                              data={"message": "رد الاختبار"})
    assert r.status_code == 200, r.text

    rows = await _tenant_messages(tid)
    assert len(rows) == 1  # no duplicate row
    assert rows[0].fb_message_id == "mid_reply_1"


async def test_reply_failure_persists_nothing(app_client, fake_fb):
    user = await _register(app_client, "v22rf")
    tid = user["tenant_id"]
    await _seed_convo(tid, "t_v22", [], message_count=0)
    fake_fb.send_fails = True

    r = await app_client.post("/api/inbox/conversations/t_v22/reply",
                              data={"message": "لن يصل"})
    assert r.status_code == 400
    assert await _tenant_messages(tid) == []
