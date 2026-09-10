"""v21 — sync_error live-diagnosis surface + page-token scopes verdict.

THE LIVE EVIDENCE (2026-09-10, worklog Task 0): the production posts sync
has been failing for hours with ``synced:false`` and ZERO outside-visible
reason — log.warning evidence sits in Vercel logs an operator can't read,
while the API response looked identical for "Graph failed", "DB write
failed" and "throttled". This suite pins the closure:

  1. /api/posts + /api/ads/accounts expose ``sync_error`` (short class:
     reason) + ``sync_attempted`` — additive keys, existing contract keys
     (items/total/source/synced) unchanged
  2. graph failure → sync_error carries "graph_failed"; success → ""
  3. throttled call → sync_attempted=False and NO error text (a skip is
     not a failure)
  4. check_token_scopes: /me/permissions is a USER-token endpoint — page
     tokens get 400 ("nonexisting field") and the old fallback claimed all
     four scopes missing (a FALSE user-facing warning). A page token (me
     id == page id) now reports only the two genuinely-needed engagement
     scopes; a user token keeps the four-scope contract.

Hermetic: the routes' client factory is monkeypatched (v19 pattern); the
scopes tests patch FBClient._get (v20 pattern) — no Graph call ever leaves
the process.
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


class FakeGraphFB:
    def __init__(self) -> None:
        self.page_id = "fake-page"
        self.posts_payload: dict | None = {"data": [
            {"id": "p1", "message": "منشور تجريبي", "created_time":
             "2026-09-10T00:00:00+0000"}]}
        self.ad_accounts_payload: dict | None = {"data": [
            {"id": "act_1", "name": "حساب", "account_status": 2,
             "currency": "USD", "amount_spent": "0", "balance": "0"}]}

    async def get_page_posts_raw(self, limit: int = 50):
        return self.posts_payload

    async def get_ad_accounts_raw(self):
        return self.ad_accounts_payload


@pytest.fixture
def fake_graph():
    import routers.facebook_routes as fr

    fake = FakeGraphFB()

    async def _factory(tenant_id: int):
        return fake

    mp = pytest.MonkeyPatch()
    mp.setattr(fr, "get_tenant_fb_client", _factory)
    mp.setattr(fr, "_POSTS_LAST_SYNC", {})
    mp.setattr(fr, "_ADACC_LAST_SYNC", {})
    try:
        yield fake
    finally:
        mp.undo()


async def _reset_throttles():
    """Clear the per-module sync throttles so the NEXT call re-attempts
    (the 30s window otherwise skips the second call in the same test)."""
    import routers.facebook_routes as fr

    fr._POSTS_LAST_SYNC.clear()
    fr._ADACC_LAST_SYNC.clear()


async def _register(ac: AsyncClient, prefix: str) -> dict:
    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = await ac.post("/api/register", json={
        "username": uname, "email": f"{uname}@t.ly",
        "password": "Str0ngPass!ly", "name": prefix,
    })
    assert r.status_code == 200, r.text
    d = r.json()["data"]["user"]
    return {"id": d["id"], "username": uname, "tenant_id": d["tenant_id"]}


# ── 1) posts sync_error: success → "" ────────────────────────────────────


async def test_posts_sync_success_empty_error(app_client, fake_graph):
    user = await _register(app_client, "v21a")
    r = await app_client.get("/api/posts")
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["synced"] is True
    assert d["sync_attempted"] is True
    assert d["sync_error"] == ""
    assert d["total"] == 1  # the row was written


# ── 2) posts graph failure → class-prefixed reason ──────────────────────


async def test_posts_sync_error_graph_failed(app_client, fake_graph):
    user = await _register(app_client, "v21b")
    # first sync succeeds and stores a row
    r = await app_client.get("/api/posts")
    assert r.json()["data"]["synced"] is True
    # Graph now dies (raw → None): the reason must SURFACE in the response
    fake_graph.posts_payload = None
    await _reset_throttles()
    r2 = await app_client.get("/api/posts")
    d2 = r2.json()["data"]
    assert d2["synced"] is False
    assert d2["sync_attempted"] is True
    assert d2["sync_error"].startswith("graph_failed"), d2["sync_error"]
    # non-fatal contract intact: stored rows still serve
    assert d2["total"] == 1


# ── 3) posts throttled call → not attempted, no error text ──────────────


async def test_posts_throttled_not_attempted_no_error(app_client, fake_graph):
    user = await _register(app_client, "v21c")
    r = await app_client.get("/api/posts")
    assert r.json()["data"]["sync_attempted"] is True
    # second call inside the 30s window: skipped, NOT an error
    fake_graph.posts_payload = None
    r2 = await app_client.get("/api/posts")
    d2 = r2.json()["data"]
    assert d2["sync_attempted"] is False
    assert d2["sync_error"] == ""
    assert d2["synced"] is False


# ── 4) ads accounts: same surface ────────────────────────────────────────


async def test_ads_accounts_sync_error_surface(app_client, fake_graph):
    user = await _register(app_client, "v21d")
    r = await app_client.get("/api/ads/accounts")
    d = r.json()["data"]
    assert d["synced"] is True and d["sync_error"] == ""
    fake_graph.ad_accounts_payload = None
    await _reset_throttles()
    r2 = await app_client.get("/api/ads/accounts")
    d2 = r2.json()["data"]
    assert d2["sync_attempted"] is True
    assert d2["sync_error"].startswith("graph_failed"), d2["sync_error"]
    # rows still serve (non-fatal)
    assert len(d2["items"]) == 1


# ── 5) check_token_scopes: page-token verdict ────────────────────────────


def _patch_fb_get(monkeypatch, responses: dict):
    import fb_client as fb_mod

    async def fake_get(self, path, params=None):
        for key, value in responses.items():
            if path == key or path.endswith("/" + key):
                if value is None:
                    return None
                return dict(value)
        return None

    monkeypatch.setattr(fb_mod.FBClient, "_get", fake_get)
    monkeypatch.setattr(fb_mod.FBClient, "_fan_count_cache", None)


@pytest.mark.asyncio
async def test_scopes_page_token_two_scope_verdict(monkeypatch):
    """/me/permissions 400s for page tokens → /me probe says page identity
    → only the two engagement scopes are reported missing (NOT the false
    four-scope warning that scared users with a working page token)."""
    from fb_client import FBClient

    PAGE_ID = "9190021000"
    _patch_fb_get(monkeypatch, {
        "me/permissions": None,  # 400 for page tokens (live-evidenced)
        "me": {"id": PAGE_ID, "name": "صفحة"},
    })
    sc = await FBClient("PAGE_TOK", PAGE_ID).check_token_scopes()
    assert sc.get("page_token") is True
    assert sc["missing"] == ["pages_read_engagement", "pages_read_user_content"]
    assert "pages_messaging" not in sc["missing"]


@pytest.mark.asyncio
async def test_scopes_user_token_keeps_four_scope_contract(monkeypatch):
    """/me/permissions fails AND /me is a user identity → the old four-scope
    fallback contract is preserved (user tokens genuinely need all four)."""
    from fb_client import FBClient

    _patch_fb_get(monkeypatch, {
        "me/permissions": None,
        "me": {"id": "2483103915469106", "name": "احمد"},
    })
    sc = await FBClient("USER_TOK", "1235690416285843").check_token_scopes()
    assert "page_token" not in sc
    assert set(sc["missing"]) == {
        "pages_messaging", "pages_manage_metadata",
        "pages_read_engagement", "pages_read_user_content"}


@pytest.mark.asyncio
async def test_scopes_permissions_ok_unchanged(monkeypatch):
    """A token whose /me/permissions answers (user token) keeps the granted
    diff — the v20 contract, untouched by the v21 fallback change."""
    from fb_client import FBClient

    _patch_fb_get(monkeypatch, {
        "me/permissions": {"data": [
            {"permission": "pages_messaging", "status": "granted"},
            {"permission": "pages_read_engagement", "status": "granted"},
        ]},
    })
    sc = await FBClient("USER_TOK", "1235690416285843").check_token_scopes()
    assert sc["scopes"] == ["pages_messaging", "pages_read_engagement"]
    assert set(sc["missing"]) == {"pages_manage_metadata",
                                  "pages_read_user_content"}


# ── 6) inbox empty-thread fall-through (browser-evidenced defect) ────────


class FakeInboxFB:
    """Fake inbox FB client — thread fetch returns a fixed payload."""

    def __init__(self) -> None:
        self.page_id = "fake-page"
        self.thread: list = [
            {"id": "m1", "message": "مرحبا",
             "from": {"id": "1001", "name": "زبون"}, "created_time":
             "2026-09-10T01:00:00+0000", "is_from_page": False},
            {"id": "m2", "message": "أهلاً بك",
             "from": {"id": "fake-page", "name": "الصفحة"}, "created_time":
             "2026-09-10T01:01:00+0000", "is_from_page": True},
        ]
        self.calls = 0

    async def get_conversation_messages(self, conversation_id: str,
                                        limit: int = 50):
        self.calls += 1
        return self.thread if self.calls == 1 else [
            dict(m) for m in self.thread]  # later calls: same thread


@pytest.fixture
def fake_inbox_fb():
    import routers.inbox as inbox_mod

    fake = FakeInboxFB()

    async def _factory(tenant_id: int):
        return fake

    mp = pytest.MonkeyPatch()
    mp.setattr(inbox_mod, "get_tenant_fb_client", _factory)
    mp.setattr(inbox_mod, "_tenant_fb_cache", {})
    try:
        yield fake
    finally:
        mp.undo()


async def test_inbox_empty_thread_falls_through_and_persists(
        app_client, fake_inbox_fb):
    """The list sync creates Conversation rows (message_count from Graph
    metadata) with ZERO persisted messages — the thread pane showed
    «لا توجد رسائل» while the list said «45 رسالة». The row-with-empty-
    thread must fall through to the live fetch AND persist the result."""
    from database import AsyncSessionLocal
    from models import Conversation, Message
    from sqlalchemy import select

    user = await _register(app_client, "v21e")
    tid = user["tenant_id"]
    async with AsyncSessionLocal() as db:
        db.add(Conversation(
            tenant_id=tid, fb_conversation_id="t_v21x",
            fb_user_id="1001", user_name="زبون",
            message_count=45, unread_count=2,
        ))
        await db.commit()

    # FIRST open: empty persisted thread → live fetch serves the messages
    r = await app_client.get("/api/inbox/conversations/t_v21x")
    assert r.status_code == 200, r.text
    msgs = r.json()["data"]
    assert len(msgs) == 2, msgs
    assert msgs[0]["message"] == "مرحبا"
    assert msgs[1]["is_from_page"] is True
    assert fake_inbox_fb.calls == 1

    # the fetched thread was PERSISTED — second open serves from the DB
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Message).where(Message.tenant_id == tid)
        )).scalars().all()
        assert len(rows) == 2
        assert rows[0].fb_message_id == "m1"
        assert rows[1].is_from_page is True
        # v21 hotfix pin: Graph "+0000" times must persist tz-NAIVE — an
        # aware datetime made asyncpg DataError→500 on production Postgres
        for rw in rows:
            assert rw.created_at is not None and rw.created_at.tzinfo is None

    r2 = await app_client.get("/api/inbox/conversations/t_v21x")
    msgs2 = r2.json()["data"]
    assert len(msgs2) == 2
    # no SECOND live fetch needed — DB now has the thread
    assert fake_inbox_fb.calls == 1


async def test_inbox_thread_no_row_live_only(app_client, fake_inbox_fb):
    """DB-miss contract unchanged: unknown conversation id → live fetch,
    nothing persisted (no row to attach to)."""
    r = await app_client.get("/api/inbox/conversations/t_unknown99")
    assert r.status_code == 200
    msgs = r.json()["data"]
    assert len(msgs) == 2  # served live
    from database import AsyncSessionLocal
    from models import Message
    from sqlalchemy import select
    user = None
    async with AsyncSessionLocal() as db:
        n = (await db.execute(
            select(Message).where(
                Message.fb_conversation_id == "t_unknown99"))).scalars().all()
        assert n == []


# ── 7) _parse_fb_time: naive-UTC contract (the production root cause) ────
# Live-evidenced 2026-09-10: an aware datetime bound to the naive DateTime
# columns made asyncpg raise DataError "invalid input for query argument"
# on production Postgres — EVERY posts sync rolled back for 13h while the
# same code passed on SQLite (aiosqlite serializes any datetime). The
# parser must now ALWAYS return tz-naive UTC — the whole API convention.


def test_parse_fb_time_returns_naive_utc():
    from routers.facebook_routes import _parse_fb_time

    # Graph format "+0000" — the exact live input that killed production
    dt = _parse_fb_time("2026-09-09T15:00:00+0000")
    assert dt is not None
    assert dt.tzinfo is None, "aware datetime → asyncpg DataError on Postgres"
    assert (dt.year, dt.month, dt.day, dt.hour) == (2026, 9, 9, 15)

    # Z-suffix form normalizes identically
    dt2 = _parse_fb_time("2026-07-15T12:30:00Z")
    assert dt2 is not None and dt2.tzinfo is None
    assert (dt2.hour, dt2.minute) == (12, 30)

    # Non-UTC offset converts to the correct UTC instant, then stripped
    dt3 = _parse_fb_time("2026-07-15T18:00:00+03:00")
    assert dt3 is not None and dt3.tzinfo is None
    assert (dt3.hour,) == (15,)  # 18:00+03:00 == 15:00 UTC

    # already-naive input passes through untouched
    dt4 = _parse_fb_time("2026-07-15T10:00:00")
    assert dt4 is not None and dt4.tzinfo is None and dt4.hour == 10

    # garbage / empty contract unchanged
    assert _parse_fb_time("") is None
    assert _parse_fb_time(None) is None
    assert _parse_fb_time("not-a-date") is None


async def test_posts_sync_persists_naive_created_time(app_client, fake_graph):
    """End-to-end pin: the stored row's created_time is tz-naive (the asyncpg
    contract) and the response serializes with the Z suffix (iso_z)."""
    user = await _register(app_client, "v21g")
    r = await app_client.get("/api/posts")
    d = r.json()["data"]
    assert d["synced"] is True and d["total"] == 1
    assert d["items"][0]["created_time"].endswith("Z"), d["items"][0]

    from database import AsyncSessionLocal
    from models import Post as PostModel
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(PostModel).where(PostModel.tenant_id == user["tenant_id"])
        )).scalar_one()
        assert row.created_time is not None
        assert row.created_time.tzinfo is None, "aware row → asyncpg DataError"
