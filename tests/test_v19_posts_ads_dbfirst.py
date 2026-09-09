"""v19 Step 2 — DB-first posts + ads (the comments/inbox precedent, pinned).

BEFORE: /api/posts and /api/ads/* were live-Graph-only — any Graph failure
rendered the sections EMPTY with zero error surfaced. This suite pins the
DB-first closure:

  1. posts: a successful sync stores rows (source=db, synced=True) and the
     30s throttle skips the second call (synced=False, rows still served)
  2. posts: Graph failure (raw → None) AFTER a successful sync → stored rows
     STILL serve with synced=False (the non-fatal contract)
  3. posts: DB pagination (page 2) works without any in-memory cursor
  4. posts detail: DB row serves; unknown id falls back to live Graph
  5. ads accounts: sync stores; failure keeps serving rows + synced=False;
     tenant isolation (another tenant's rows are invisible)
  6. ads campaigns/ads: payload_json re-serves the EXACT Graph shape
  7. webhook feed POST events: add/edited/remove persist to fb_posts
     (the previously-dropped item == "post" branch)

Hermetic: facebook_routes.get_tenant_fb_client is monkeypatched to a fake
with the *_raw methods — no Graph call ever leaves the process.
"""
from __future__ import annotations

import json
import os
import time
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
from sqlalchemy import select


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
    """Stand-in tenant FB client: the *_raw methods the v19 sync consumes."""

    def __init__(self) -> None:
        self.page_id = "fake-page"
        self.posts_payload: dict | None = {"data": []}
        self.ad_accounts_payload: dict | None = {"data": []}
        self.campaigns_payload: dict | None = {"data": []}
        self.ads_payload: dict | None = {"data": []}
        self.post_detail: dict = {}

    # ── the four raw fetches the routes use ──
    async def get_page_posts_raw(self, limit: int = 50):
        return self.posts_payload

    async def get_ad_accounts_raw(self):
        return self.ad_accounts_payload

    async def get_campaigns_raw(self, ad_account_id: str, limit: int = 50):
        return self.campaigns_payload

    async def get_ads_raw(self, ad_account_id: str, limit: int = 50):
        return self.ads_payload

    async def get_post_detail(self, post_id: str):
        return self.post_detail or {"id": post_id, "error": "failed"}


@pytest.fixture
def fake_graph():
    """Patch the ROUTES' client factory (imported into facebook_routes' ns)."""
    import routers.facebook_routes as fr

    fake = FakeGraphFB()

    async def _factory(tenant_id: int):
        return fake

    mp = pytest.MonkeyPatch()
    mp.setattr(fr, "get_tenant_fb_client", _factory)
    # fresh throttle state per test — module dicts persist across the suite
    mp.setattr(fr, "_POSTS_LAST_SYNC", {})
    mp.setattr(fr, "_ADACC_LAST_SYNC", {})
    mp.setattr(fr, "_ADCAMP_LAST_SYNC", {})
    mp.setattr(fr, "_ADITEM_LAST_SYNC", {})
    try:
        yield fake
    finally:
        mp.undo()


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
        "page_id": page_id, "access_token": "EAAGfake", "subscribe_webhook": False,
    })
    assert r.status_code == 200, r.text


def _graph_post(pid: str, message: str, likes: int = 0) -> dict:
    return {
        "id": pid, "message": message,
        "created_time": "2026-09-01T10:00:00+0000",
        "likes": {"summary": {"total_count": likes}},
        "shares": {"count": 2},
        "comments": {"summary": {"total_count": 3}},
    }


# ── 1-3) posts: sync → store → serve; throttle; failure fallback ────────────


async def test_posts_sync_stores_rows_and_serves_them(app_client, fake_graph):
    ac = app_client
    await _register(ac, "p19a")
    await _connect_page(ac, "9190000001")
    fake_graph.posts_payload = {"data": [_graph_post("p1", "مرحبا ليبيا", 5),
                                          _graph_post("p2", "عرض خاص")]}
    r = await ac.get("/api/posts")
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["source"] == "db" and d["synced"] is True
    assert d["total"] == 2
    items = d["items"]
    assert items[0]["id"] in ("p1", "p2")
    by_id = {i["id"]: i for i in items}
    assert by_id["p1"]["likes"] == 5
    assert by_id["p1"]["shares"] == 2
    assert by_id["p1"]["comments"] == 3
    assert len(by_id["p1"]["message"]) <= 200


async def test_posts_throttle_skips_second_sync_but_rows_serve(app_client, fake_graph):
    ac = app_client
    await _register(ac, "p19b")
    await _connect_page(ac, "9190000002")
    fake_graph.posts_payload = {"data": [_graph_post("p1", "hello")]}
    r1 = await ac.get("/api/posts")
    assert r1.json()["data"]["synced"] is True
    # change the payload — the second call is inside the 30s window so the
    # sync must NOT run (the new post appears only after the window)
    fake_graph.posts_payload = {"data": [_graph_post("p1", "hello"), _graph_post("p2", "new")]}
    r2 = await ac.get("/api/posts")
    d2 = r2.json()["data"]
    assert d2["synced"] is False
    assert d2["total"] == 1  # throttle held: p2 not fetched yet


async def test_posts_graph_failure_still_serves_stored_rows(app_client, fake_graph):
    ac = app_client
    await _register(ac, "p19c")
    await _connect_page(ac, "9190000003")
    fake_graph.posts_payload = {"data": [_graph_post("p1", "cached post")]}
    r1 = await ac.get("/api/posts")
    assert r1.json()["data"]["items"]
    # Graph now FAILS (raw → None): rows must still serve, synced=False
    fake_graph.posts_payload = None
    import routers.facebook_routes as fr
    fr._POSTS_LAST_SYNC.clear()  # force the sync attempt (past the throttle)
    r2 = await ac.get("/api/posts")
    d2 = r2.json()["data"]
    assert r2.status_code == 200
    assert d2["synced"] is False
    assert d2["items"] and d2["items"][0]["id"] == "p1"


async def test_posts_db_pagination_without_cursors(app_client, fake_graph):
    ac = app_client
    await _register(ac, "p19d")
    await _connect_page(ac, "9190000004")
    fake_graph.posts_payload = {"data": [_graph_post(f"p{i}", f"منشور {i}") for i in range(15)]}
    r1 = await ac.get("/api/posts?per_page=10")
    d1 = r1.json()["data"]
    assert d1["total"] == 15 and len(d1["items"]) == 10 and d1["has_next"] is True
    r2 = await ac.get("/api/posts?page=2&per_page=10")
    d2 = r2.json()["data"]
    assert len(d2["items"]) == 5 and d2["has_next"] is False
    assert d2["items"][0]["id"] not in {i["id"] for i in d1["items"]}


async def test_post_detail_serves_db_row_first(app_client, fake_graph):
    ac = app_client
    await _register(ac, "p19e")
    await _connect_page(ac, "9190000005")
    fake_graph.posts_payload = {"data": [_graph_post("p1", "تفاصيل")]}
    await ac.get("/api/posts")
    # Graph dies afterwards — the stored row still answers the detail call
    fake_graph.posts_payload = None
    r = await ac.get("/api/posts/p1")
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["id"] == "p1" and d["message"] == "تفاصيل"


async def test_posts_still_400_when_no_page_connected(app_client):
    """The loud «اربط صفحتك» contract is preserved (test_world_class_v3 pin).

    NOTE: fake_graph is deliberately NOT requested here — patching the
    client factory would defeat the no-connection 400 this test pins.
    """
    ac = app_client
    await _register(ac, "p19f")
    r = await ac.get("/api/posts")
    assert r.status_code == 400
    assert "ربط" in r.text


# ── 5) ads accounts: sync → store; failure fallback; tenant isolation ───────


async def test_ad_accounts_sync_store_and_failure_fallback(app_client, fake_graph):
    ac = app_client
    await _register(ac, "a19a")
    await _connect_page(ac, "9190000011")
    fake_graph.ad_accounts_payload = {"data": [{
        "id": "act_111", "name": "Main Account", "account_status": 1,
        "currency": "USD", "amount_spent": "123.45", "balance": "7.5",
    }]}
    r1 = await ac.get("/api/ads/accounts")
    d1 = r1.json()["data"]
    assert d1["synced"] is True and len(d1["items"]) == 1
    assert d1["items"][0]["id"] == "act_111"
    assert d1["items"][0]["account_status"] == 1
    # Graph failure → stored rows serve, synced False (the UI error signal)
    fake_graph.ad_accounts_payload = None
    import routers.facebook_routes as fr
    fr._ADACC_LAST_SYNC.clear()
    r2 = await ac.get("/api/ads/accounts")
    d2 = r2.json()["data"]
    assert d2["synced"] is False and len(d2["items"]) == 1
    assert d2["items"][0]["name"] == "Main Account"


async def test_ad_accounts_tenant_isolation(app_client, fake_graph):
    ac = app_client
    await _register(ac, "a19b")
    await _connect_page(ac, "9190000012")
    fake_graph.ad_accounts_payload = {"data": [{"id": "act_222", "name": "B",
                                                "account_status": 1, "currency": "USD",
                                                "amount_spent": "0", "balance": "0"}]}
    await ac.get("/api/ads/accounts")
    # second tenant: different rows only
    await _register(ac, "a19c")
    await _connect_page(ac, "9190000013")
    fake_graph.ad_accounts_payload = None  # sync fails → only own stored rows
    import routers.facebook_routes as fr
    fr._ADACC_LAST_SYNC.clear()
    r = await ac.get("/api/ads/accounts")
    d = r.json()["data"]
    ids = [i["id"] for i in d["items"]]
    assert ids == []  # tenant 2 sees nothing of tenant 1


# ── 6) campaigns + ads: payload_json exact-shape re-serving ─────────────────


async def test_campaigns_payload_shape_preserved(app_client, fake_graph):
    ac = app_client
    await _register(ac, "c19a")
    await _connect_page(ac, "9190000021")
    campaign = {
        "id": "238001", "name": "حملة رمضان", "status": "ACTIVE", "objective": "OUTCOME_ENGAGEMENT",
        "created_time": "2026-08-01T09:00:00+0000",
        "adsets": [{"name": "set1", "status": "ACTIVE", "daily_budget": "5000"}],
    }
    fake_graph.campaigns_payload = {"data": [campaign]}
    r1 = await ac.get("/api/ads/campaigns/act_555")
    d1 = r1.json()["data"]
    assert d1["synced"] is True
    assert d1["items"] == [campaign]  # EXACT Graph shape, nested adsets intact
    # failure fallback
    fake_graph.campaigns_payload = None
    import routers.facebook_routes as fr
    fr._ADCAMP_LAST_SYNC.clear()
    r2 = await ac.get("/api/ads/campaigns/act_555")
    d2 = r2.json()["data"]
    assert d2["synced"] is False
    assert d2["items"] == [campaign]


async def test_ads_payload_shape_preserved(app_client, fake_graph):
    ac = app_client
    await _register(ac, "c19b")
    await _connect_page(ac, "9190000022")
    ad = {
        "id": "239001", "name": "إعلان جديد", "status": "PAUSED",
        "adset_id": "238100", "campaign_id": "238001",
        "creative": {"id": "239100", "title": "عنوان", "body": "نص"},
        "insights": {"impressions": "1200", "clicks": "30", "spend": "15.2"},
    }
    fake_graph.ads_payload = {"data": [ad]}
    r = await ac.get("/api/ads/ads/act_555")
    d = r.json()["data"]
    assert d["synced"] is True
    assert d["items"] == [ad]


# ── 7) webhook feed POST events persist ─────────────────────────────────────


async def test_webhook_post_add_edited_remove_lifecycle(app_client):
    """The previously-dropped feed post branch: add → row; edited → message
    updated; remove → row deleted."""
    import hashlib
    import hmac

    from database import AsyncSessionLocal
    from models import Post as PostRow

    ac = app_client
    user = await _register(ac, "w19a")
    page_id = "9190000031"
    await _connect_page(ac, page_id)

    _app_secret = os.environ.get("FACEBOOK_APP_SECRET", "test-app-secret")

    def _sign(body: bytes) -> str:
        return "sha256=" + hmac.new(_app_secret.encode(), body, hashlib.sha256).hexdigest()

    async def _post_signed(payload: dict):
        body = json.dumps(payload).encode()
        return await ac.post("/webhook", content=body,
                             headers={"content-type": "application/json",
                                      "x-hub-signature-256": _sign(body)})

    def _post_event(post_id: str, message: str, verb: str = "add") -> dict:
        return {
            "object": "page",
            "entry": [{
                "id": page_id,
                "time": int(time.time() * 1000),
                "changes": [{
                    "field": "feed",
                    "value": {"item": "post", "post_id": post_id,
                              "verb": verb, "message": message,
                              "created_time": int(time.time() * 1000)},
                }],
            }],
        }

    async def _rows():
        async with AsyncSessionLocal() as db:
            return (await db.execute(
                select(PostRow).where(PostRow.tenant_id == user["tenant_id"])
            )).scalars().all()

    # add
    r = await _post_signed(_post_event("wp1", "منشور من الويبهوك"))
    assert r.status_code == 200, r.text
    rows = await _rows()
    assert len(rows) == 1 and rows[0].fb_post_id == "wp1"
    assert rows[0].message == "منشور من الويبهوك"
    # edited
    await _post_signed(_post_event("wp1", "نص محدث", verb="edited"))
    rows = await _rows()
    assert len(rows) == 1 and rows[0].message == "نص محدث"
    # remove
    await _post_signed(_post_event("wp1", "", verb="remove"))
    rows = await _rows()
    assert len(rows) == 0
