"""v20 — token-type gate + stored-token self-heal + silent-failure logging.

THE LIVE EVIDENCE (2026-09-10, documented in docs/reports/v20-live-diagnosis.md):
a USER access token passes every public-field probe (name/fan_count/picture →
"connected ✓") while /posts, /conversations and /comments all fail with Graph
code 190 subcode 2069032 / code 10 — silently, across every data path. This
suite pins the closure:

  1. FBClient.ensure_page_token: the 4-verdict matrix (page/user-exchanged/
     not-page-admin/unverified) — the single cheapest reliable type probe
  2. connect gate (PUT /api/facebook/settings): user token that administers
     the page is EXCHANGED and the PAGE token is what gets stored; a user
     token that cannot administer the page is a loud Arabic 400 (nothing
     stored)
  3. onboarding connect-page: the SAME gate (the wizard was the primary
     entry point for the bug)
  4. POST /api/facebook/test: connected:true now requires a working PAGE
     token + a successful fan_count read; a detected user token is exchanged
     AND persisted (self-heal on test click)
  5. get_tenant_fb_client self-heal: a stored user token is exchanged,
     re-encrypted and persisted, the page-identity snapshot (name/fans) is
     refreshed, and the inbox cache is evicted — throttled by a 6h TTL with
     a persisted verdict (fb_token_check)
  6. silent failures now LOG: token decrypt failure (was a bare return None),
     inbox live-sync exception (was convos = None with zero evidence)

Hermetic: FBClient._get is monkeypatched per test — no Graph call ever leaves
the process; the DB is the root-conftest temp-file SQLite.
"""
from __future__ import annotations

import uuid

import pytest

# ── shared helpers ─────────────────────────────────────────────────────────


PAGE_ID = "1235690416285843"
USER_ID = "2483103915469106"
PAGE_TOKEN = "PAGE_TOKEN_xxx_205chars"
USER_TOKEN = "USER_TOKEN_EAAVnD"


def _pid(n: int) -> str:
    """Unique page id per test — the uq_botstate_key_value double-bind index
    would 409 a second tenant binding the same page (test-order coupling)."""
    return f"91900{n:07d}"


def _patch_graph(monkeypatch, responses: dict):
    """Route-level Graph fake: responses maps path → dict|None.

    Keys are matched by suffix (``me``, ``<PAGE_ID>``), params ignored. A
    value of None simulates a network/5xx failure (the ``_get`` contract).
    """
    import fb_client as fb_mod

    async def fake_get(self, path, params=None):
        for key, value in responses.items():
            if path == key or path.endswith("/" + key):
                if value is None:
                    return None  # network/5xx — the honest-None contract
                return dict(value)
        return None

    monkeypatch.setattr(fb_mod.FBClient, "_get", fake_get)
    # reset the class-level fan_count cache (test isolation)
    monkeypatch.setattr(fb_mod.FBClient, "_fan_count_cache", None)
    return fake_get


async def _register(ac, prefix: str) -> dict:
    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = await ac.post("/api/register", json={
        "username": uname, "email": f"{uname}@t.ly",
        "password": "Str0ngPass!ly", "name": prefix,
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["user"]


@pytest.fixture(scope="module")
async def app_client():
    from database import engine as db_engine
    from httpx import ASGITransport, AsyncClient
    from models import Base
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # the suite shares one client IP — without this the Nth register in this
    # file hits the per-IP mutate limiter (429 «محاولات كثيرة جداً»), the
    # same hermetic patch test_v19's app_client applies.
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


@pytest.fixture(scope="module")
async def tables(app_client):
    """Tables exist for direct-DB tests too (seeding without app_client)."""
    yield True


@pytest.fixture(autouse=True)
def _fresh_token_type_cache():
    """Every test starts with a cold self-heal throttle (the 6h TTL would
    otherwise swallow the very repair under test)."""
    import _services
    _services._reset_token_type_cache()
    yield
    _services._reset_token_type_cache()


async def _seed_tenant_with_stored_token(page_id: str, token: str) -> int:
    """Direct DB seeding: a tenant row + fb_page_id + encrypted token."""
    from _crypto import encrypt_token
    from database import AsyncSessionLocal
    from models import BotState, Tenant, User

    async with AsyncSessionLocal() as db:
        t = Tenant(name=f"T-{uuid.uuid4().hex[:6]}", subscription_status="PAID",
                   is_active=True)
        db.add(t)
        await db.flush()
        u = User(username=f"u_{uuid.uuid4().hex[:8]}", email=f"{uuid.uuid4().hex[:8]}@t.ly",
                 password_hash="x", tenant_id=t.id, role="admin")
        db.add(u)
        db.add(BotState(tenant_id=t.id, key="fb_page_id", value=page_id))
        db.add(BotState(tenant_id=t.id, key="fb_access_token",
                        value=encrypt_token(token)))
        await db.commit()
        return t.id


# ── 1) ensure_page_token verdict matrix ────────────────────────────────────


async def test_ensure_page_token_page_token_short_circuits(monkeypatch):
    """A PAGE token: /me returns the page id → keep, zero extra calls."""
    calls: list[str] = []

    import fb_client as fb_mod

    async def fake_get(self, path, params=None):
        calls.append(path)
        if path == "me":
            return {"id": PAGE_ID, "name": "Smart Link"}
        raise AssertionError(f"unexpected call: {path}")

    monkeypatch.setattr(fb_mod.FBClient, "_get", fake_get)
    verdict = await fb_mod.FBClient(PAGE_TOKEN, PAGE_ID).ensure_page_token()
    assert verdict == {"status": "page_token"}
    assert calls == ["me"]


async def test_ensure_page_token_user_token_exchanges(monkeypatch):
    """/me → user id, /{page}?fields=access_token → the page token."""
    _patch_graph(monkeypatch, {
        "me": {"id": USER_ID, "name": "احمد"},
        PAGE_ID: {"id": PAGE_ID, "access_token": PAGE_TOKEN},
    })
    from fb_client import FBClient
    verdict = await FBClient(USER_TOKEN, PAGE_ID).ensure_page_token()
    assert verdict["status"] == "exchanged"
    assert verdict["token"] == PAGE_TOKEN
    assert verdict["identity"]["id"] == USER_ID


async def test_ensure_page_token_user_not_page_admin(monkeypatch):
    """/me → user id, exchange unavailable → not_page_admin (the loud case)."""
    _patch_graph(monkeypatch, {
        "me": {"id": USER_ID, "name": "احمد"},
        PAGE_ID: {"id": PAGE_ID},  # no access_token field
    })
    from fb_client import FBClient
    verdict = await FBClient(USER_TOKEN, PAGE_ID).ensure_page_token()
    assert verdict["status"] == "not_page_admin"
    assert verdict["identity"]["id"] == USER_ID


async def test_ensure_page_token_unverified_when_me_fails(monkeypatch):
    """/me unreachable (invalid/network) → unverified (non-fatal)."""
    _patch_graph(monkeypatch, {"me": None})
    from fb_client import FBClient
    verdict = await FBClient(USER_TOKEN, PAGE_ID).ensure_page_token()
    assert verdict == {"status": "unverified"}


# ── 2) connect gate: PUT /api/facebook/settings ────────────────────────────


async def test_connect_exchanges_user_token_and_stores_page_token(
        app_client, monkeypatch):
    """A user token that administers the page → the PAGE token is what lands
    in BotState (the exact production incident, closed)."""
    _patch_graph(monkeypatch, {
        "me": {"id": USER_ID, "name": "احمد"},
        PAGE_ID: {"id": PAGE_ID, "access_token": PAGE_TOKEN,
                  "name": "Smart Link-الربط الذكي", "fan_count": 5,
                  "picture": {"data": {"url": "https://x/p.jpg"}}},
    })
    ac = app_client
    user = await _register(ac, "v20a")
    r = await ac.put("/api/facebook/settings", json={
        "page_id": PAGE_ID, "access_token": USER_TOKEN,
        "subscribe_webhook": False,
    })
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["token_exchanged"] is True
    assert d["page_name"] == "Smart Link-الربط الذكي"

    # what actually got stored is the EXCHANGED page token + identity snapshot
    from _crypto import decrypt_token
    from database import AsyncSessionLocal
    from models import BotState
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(BotState).where(BotState.tenant_id == user["tenant_id"]))
        state = {b.key: b.value for b in rows.scalars().all()}
    assert decrypt_token(state["fb_access_token"]) == PAGE_TOKEN
    assert state["fb_page_name"] == "Smart Link-الربط الذكي"
    assert state["fb_fan_count"] == "5"


async def test_connect_rejects_user_token_that_cannot_administer_page(
        app_client, monkeypatch, caplog):
    """A user token that does NOT administer the page → loud Arabic 400,
    NOTHING stored (never a silently-empty dashboard later)."""
    pid = _pid(1)
    _patch_graph(monkeypatch, {
        "me": {"id": USER_ID, "name": "احمد"},
        pid: {"id": pid},  # no access_token
    })
    ac = app_client
    user = await _register(ac, "v20b")
    r = await ac.put("/api/facebook/settings", json={
        "page_id": pid, "access_token": USER_TOKEN,
        "subscribe_webhook": True,
    })
    assert r.status_code == 400
    assert "رمز مستخدم" in r.json()["detail"]
    assert "Page Access Token" in r.json()["detail"]

    from database import AsyncSessionLocal
    from models import BotState
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(BotState).where(BotState.tenant_id == user["tenant_id"],
                                   BotState.key == "fb_access_token"))
        assert row.scalar_one_or_none() is None  # nothing stored
    assert any("does not administer" in rec.message for rec in caplog.records)


async def test_connect_page_token_saved_asis(app_client, monkeypatch):
    """A genuine PAGE token: stored unchanged, no exchange reported."""
    pid = _pid(2)
    _patch_graph(monkeypatch, {
        "me": {"id": pid, "name": "Smart Link"},
        pid: {"id": pid, "name": "Smart Link", "fan_count": 5,
              "picture": {"data": {"url": "https://x/p.jpg"}}},
    })
    ac = app_client
    user = await _register(ac, "v20c")
    r = await ac.put("/api/facebook/settings", json={
        "page_id": pid, "access_token": PAGE_TOKEN,
        "subscribe_webhook": False,
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"]["token_exchanged"] is False

    from _crypto import decrypt_token
    from database import AsyncSessionLocal
    from models import BotState
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(BotState).where(BotState.tenant_id == user["tenant_id"],
                                   BotState.key == "fb_access_token"))
        bs = row.scalar_one()
    assert decrypt_token(bs.value) == PAGE_TOKEN


# ── 3) onboarding connect-page: the SAME gate (the bug's entry point) ──────


async def test_onboarding_connect_rejects_user_token(app_client, monkeypatch):
    """The wizard was the PRIMARY entry point for the user-token bug — it
    accepted ANY token with zero validation. Now: same loud 400."""
    pid = _pid(3)
    _patch_graph(monkeypatch, {
        "me": {"id": USER_ID, "name": "احمد"},
        pid: {"id": pid},
    })
    ac = app_client
    user = await _register(ac, "v20d")
    r = await ac.post("/api/onboarding/connect-page", json={
        "page_id": pid, "access_token": USER_TOKEN,
    })
    assert r.status_code == 400
    assert "رمز مستخدم" in r.json()["detail"]

    from database import AsyncSessionLocal
    from models import BotState
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(BotState).where(BotState.tenant_id == user["tenant_id"]))
        assert row.scalars().first() is None


async def test_onboarding_test_connection_reports_token_type(app_client, monkeypatch):
    """The wizard's own test: a USER token is reported as user (was «متصل ✓»
    on public fields while every data path was dead)."""
    pid = _pid(4)
    _patch_graph(monkeypatch, {
        "me": {"id": USER_ID, "name": "احمد"},
        pid: {"id": pid},  # no access_token → not admin
    })
    ac = app_client
    await _register(ac, "v20e")
    r = await ac.post("/api/onboarding/test-connection", json={
        "page_id": pid, "access_token": USER_TOKEN,
    })
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["connected"] is False
    assert d["token_type"] == "user"
    assert "Page Access Token" in (d.get("error") or "")


# ── 4) POST /api/facebook/test — honest connected + self-heal on click ─────


async def test_facebook_test_detects_exchanges_and_persists(app_client, monkeypatch):
    """Stored USER token + test click → exchange + PERSIST the page token +
    refresh the identity snapshot (the user's own click repairs prod)."""
    graph = {
        "me": {"id": USER_ID, "name": "احمد"},
        # the exchange AND the fan_count/profile probes must answer with the
        # PAGE token semantics — fake_get ignores params, so /{page} answers
        # access_token + profile fields together.
        PAGE_ID: {"id": PAGE_ID, "access_token": PAGE_TOKEN,
                  "name": "Smart Link-الربط الذكي", "fan_count": 5,
                  "picture": {"data": {"url": "https://x/p.jpg"}}},
        "me/permissions": {"data": [{"permission": "pages_messaging",
                                     "status": "granted"}]},
    }
    _patch_graph(monkeypatch, graph)
    ac = app_client
    user = await _register(ac, "v20f")

    # NOTE: PAGE_ID here is the suite's canonical page — but a previous test
    # in this module may already hold it (double-bind 409). Seeding direct DB
    # rows for a fresh tenant + a fresh unique page avoids the pre-check.
    pid = _pid(5)
    graph[pid] = dict(graph[PAGE_ID], id=pid)

    from _crypto import encrypt_token
    from database import AsyncSessionLocal
    from models import BotState
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        db.add(BotState(tenant_id=user["tenant_id"], key="fb_page_id",
                        value=pid))
        db.add(BotState(tenant_id=user["tenant_id"], key="fb_access_token",
                        value=encrypt_token(USER_TOKEN)))
        await db.commit()

    r = await ac.post("/api/facebook/test")
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["connected"] is True
    assert d["token_type"] == "user"
    assert d["token_exchanged"] is True

    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(BotState).where(BotState.tenant_id == user["tenant_id"]))
        state = {b.key: b.value for b in rows.scalars().all()}
    from _crypto import decrypt_token
    assert decrypt_token(state["fb_access_token"]) == PAGE_TOKEN
    assert state["fb_page_name"] == "Smart Link-الربط الذكي"
    verdict = json.loads(state["fb_token_check"]) if "fb_token_check" in state else {}
    assert verdict.get("status") == "user_token_exchanged"


async def test_facebook_test_connected_false_when_fan_count_unreadable(
        app_client, monkeypatch):
    """connected:true requires the fan_count READ to succeed — the old code
    answered connected:true even when the Graph call failed (None)."""
    pid = _pid(6)
    _patch_graph(monkeypatch, {
        "me": {"id": pid, "name": "Smart Link"},  # a page token...
        pid: None,  # ...but the fan_count read fails (network/5xx → None)
    })
    ac = app_client
    user = await _register(ac, "v20g")
    from _crypto import encrypt_token
    from database import AsyncSessionLocal
    from models import BotState
    async with AsyncSessionLocal() as db:
        db.add(BotState(tenant_id=user["tenant_id"], key="fb_page_id",
                        value=pid))
        db.add(BotState(tenant_id=user["tenant_id"], key="fb_access_token",
                        value=encrypt_token(PAGE_TOKEN)))
        await db.commit()

    r = await ac.post("/api/facebook/test")
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["connected"] is False
    assert d["token_type"] == "page"


# ── 5) get_tenant_fb_client self-heal (the fleet-wide repair) ──────────────


async def test_self_heal_exchanges_stored_user_token(monkeypatch, tables):
    """A stored USER token is exchanged + persisted + snapshot refreshed + the
    inbox cache evicted — and the returned client carries the PAGE token."""
    pid = _pid(7)
    _patch_graph(monkeypatch, {
        "me": {"id": USER_ID, "name": "احمد"},
        pid: {"id": pid, "access_token": PAGE_TOKEN,
              "name": "Smart Link-الربط الذكي", "fan_count": 5,
              "picture": {"data": {"url": "https://x/p.jpg"}}},
    })
    from routers.inbox import _tenant_fb_cache
    import time as _time

    tenant_id = await _seed_tenant_with_stored_token(pid, USER_TOKEN)
    _tenant_fb_cache[tenant_id] = ("stale-user-token-client",
                                   _time.monotonic() + 600.0)

    import _services
    fb = await _services.get_tenant_fb_client(tenant_id)
    assert fb is not None
    assert fb.token == PAGE_TOKEN  # the REPAIRED token, not the stored one

    from _crypto import decrypt_token
    from database import AsyncSessionLocal
    from models import BotState
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(BotState).where(BotState.tenant_id == tenant_id))
        state = {b.key: b.value for b in rows.scalars().all()}
    assert decrypt_token(state["fb_access_token"]) == PAGE_TOKEN
    assert state["fb_page_name"] == "Smart Link-الربط الذكي"
    verdict = json.loads(state.get("fb_token_check", "{}"))
    assert verdict.get("status") == "user_token_exchanged"
    # the stale cached client was evicted
    assert tenant_id not in _tenant_fb_cache


async def test_self_heal_throttled_by_ttl(monkeypatch, tables):
    """Within the TTL window (module cache) the repair does not re-probe —
    the hot path stays at zero Graph cost."""
    probes: list[str] = []
    import fb_client as fb_mod

    async def fake_get(self, path, params=None):
        probes.append(path)
        if path == "me":
            return {"id": PAGE_ID, "name": "Smart Link"}
        return {"id": PAGE_ID}

    monkeypatch.setattr(fb_mod.FBClient, "_get", fake_get)
    tenant_id = await _seed_tenant_with_stored_token(_pid(8), PAGE_TOKEN)

    import _services
    fb1 = await _services.get_tenant_fb_client(tenant_id)
    n_after_first = len(probes)
    assert fb1 is not None and n_after_first >= 1
    fb2 = await _services.get_tenant_fb_client(tenant_id)
    assert fb2 is not None
    assert len(probes) == n_after_first  # no re-probe inside the window


async def test_self_heal_page_token_verdict_persisted(monkeypatch, tables):
    """A healthy PAGE token: verdict persisted (page_token) — surfaces via
    GET /api/facebook/settings as token_ok:true."""
    pid = _pid(9)
    _patch_graph(monkeypatch, {
        "me": {"id": pid, "name": "Smart Link"},
    })
    tenant_id = await _seed_tenant_with_stored_token(pid, PAGE_TOKEN)
    import _services
    fb = await _services.get_tenant_fb_client(tenant_id)
    assert fb is not None and fb.token == PAGE_TOKEN

    from database import AsyncSessionLocal
    from models import BotState
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(BotState).where(BotState.tenant_id == tenant_id,
                                   BotState.key == "fb_token_check"))
        verdict = json.loads((row.scalar_one_or_none() or type("x", (), {"value": "{}"})()).value)
    assert verdict.get("status") == "page_token"


# ── 6) silent failures now LOG (the regression the whole v20 plan targets) ─


async def test_decrypt_failure_is_logged_not_silent(monkeypatch, caplog, tables):
    """A corrupted/undecryptable stored token: None + a loud ERROR with the
    real exception (was a bare silent None — the most invisible failure)."""
    tenant_id = await _seed_tenant_with_stored_token(_pid(10), "irrelevant")
    # _seed encrypts properly — corrupt the row directly instead:
    from database import AsyncSessionLocal
    from models import BotState
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(BotState).where(BotState.tenant_id == tenant_id,
                                   BotState.key == "fb_access_token"))
        row.scalar_one().value = "garbage-not-fernet!!"
        await db.commit()

    import _services
    import logging
    with caplog.at_level(logging.ERROR, logger="fb-api"):
        fb = await _services.get_tenant_fb_client(tenant_id)
    assert fb is None
    assert any("decrypt FAILED" in rec.message for rec in caplog.records)


async def test_inbox_live_sync_failure_is_logged(app_client, monkeypatch, caplog):
    """A live-sync exception in the inbox route: still non-fatal (DB rows
    serve) but now LOGGED with the tenant id (was convos = None, silently)."""
    import routers.inbox as inbox_mod

    async def _boom(tenant_id: int):
        raise RuntimeError("graph exploded (code 10)")

    monkeypatch.setattr(inbox_mod, "_get_inbox_fb", _boom)
    ac = app_client
    await _register(ac, "v20h")
    import logging
    with caplog.at_level(logging.WARNING, logger="fb-api"):
        r = await ac.get("/api/inbox/conversations")
    assert r.status_code == 200, r.text  # non-fatal contract intact
    assert any("inbox live sync failed" in rec.message for rec in caplog.records)


import json  # noqa: E402 — used by verdict assertions above
