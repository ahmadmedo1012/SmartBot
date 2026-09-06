"""v5 §3 — depth tests: previously-uncovered critical paths.

Coverage-driven (measured with pytest-cov before writing):
  - routers/flows.py was at 38% and shipped a live 500: POST /api/flows/{id}/test
    referenced an undefined ``current_user`` (found by ruff F821 in v5 §2).
    This file locks that regression closed.
  - webhook verification GET handshake (hub.challenge echo + token mismatch).

v10-W4: section 1 (subscription_decisions — dead copy of the live atomic-claim
resolve in payments.py/runner.py) and section 5 (inbox_engine — dead copy of
routers/inbox.py DB-first) were removed together with those dead modules.
"""
from __future__ import annotations

import uuid

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
    return r.json()["data"]["user"]


async def _login(ac: AsyncClient, username: str, password: str = "Str0ngPass!ly") -> None:
    r = await ac.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


# ══════════════════════════════════════════════════════════════════
# 2. flows — regression for the live 500 (ruff F821, v5 §2)
# ══════════════════════════════════════════════════════════════════

async def test_flows_test_endpoint_never_500s(app_client):
    """POST /api/flows/{id}/test used to crash with NameError (undefined
    current_user) — any authenticated call returned 500. It must now either
    succeed or 404 for a missing flow — never a server error."""
    ac = app_client
    user = await _register(ac, "flw")
    await _login(ac, user["username"])
    r = await ac.post("/api/flows/999999/test", json={"text": "مرحبا"})
    assert r.status_code in (200, 404), f"endpoint crashed or misbehaves: {r.status_code} {r.text[:200]}"
    if r.status_code == 404:
        body = r.json()
        assert body.get("detail") == "Flow not found"


async def test_flows_crud_roundtrip(app_client):
    """Basic flows CRUD through the API — the 38%-covered router gets its
    happy path locked."""
    ac = app_client
    user = await _register(ac, "flc")
    await _login(ac, user["username"])
    r = await ac.post("/api/flows", json={
        "name": "مسار ترحيب", "description": "v5 depth", "trigger_type": "keyword",
        "steps": [{"action": "reply", "text": "أهلاً"}],
    })
    assert r.status_code == 200, r.text
    flow_id = r.json()["data"]["id"]

    r = await ac.get("/api/flows")
    assert r.status_code == 200
    assert any(f["id"] == flow_id for f in r.json()["data"])

    r = await ac.post(f"/api/flows/{flow_id}/toggle")
    assert r.status_code == 200, r.text

    r = await ac.delete(f"/api/flows/{flow_id}")
    assert r.status_code == 200, r.text


# ══════════════════════════════════════════════════════════════════
# 3. webhook verification handshake (GET) — uncovered branch
# ══════════════════════════════════════════════════════════════════

async def test_webhook_events_requires_auth():
    """FRESH client — no session carried over: must be 401, never a leak."""
    from runner import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.get("/api/webhook/events")
    assert r.status_code == 401, f"unauthenticated access must be rejected: {r.status_code}"


async def test_webhook_events_returns_envelope_for_owner(app_client):
    ac = app_client
    user = await _register(ac, "whk")
    await _login(ac, user["username"])
    r = await ac.get("/api/webhook/events?limit=5")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)


# ══════════════════════════════════════════════════════════════════
# 4. cache_layer — TTLCache set/invalidate + RuleCache sort + dedup
# ══════════════════════════════════════════════════════════════════

async def test_ttlcache_set_and_invalidate_beat_ttl():
    """set() refreshes recency; invalidate() forces a reload on next get."""
    from cache_layer import TTLCache

    calls = {"n": 0}

    async def refresher():
        calls["n"] += 1
        return calls["n"]

    cache = TTLCache(ttl_seconds=60, refresh_fn=refresher)
    assert await cache.get() == 1          # first load
    await cache.set(42)
    assert await cache.get() == 42         # set() wins, no reload
    await cache.invalidate()
    assert await cache.get() == 2          # reload after invalidate
    assert calls["n"] == 2


async def test_rulecache_sorts_by_priority():
    from cache_layer import RuleCache

    async def loader():
        return [
            {"id": 1, "priority": 30, "keywords": ["ب"]},
            {"id": 2, "priority": 5, "keywords": ["أ"]},
            {"id": 3, "priority": 999, "keywords": ["__catch_all__"]},
        ]

    rc = RuleCache(loader, ttl=60)
    rules = await rc.get_rules()
    assert [r["id"] for r in rules] == [2, 1, 3], "rules must be priority-sorted (lower first)"


async def test_replydedup_roundtrip_and_ttl_reset():
    import time as _t

    from cache_layer import ReplyDedupCache

    d = ReplyDedupCache(ttl=60)
    await d.mark("c1")
    await d.mark("c2")
    assert await d.is_dup("c1") is True
    assert await d.is_dup("c3") is False
    await d.load({"c9"})
    assert await d.is_dup("c1") is False, "load() replaces the set"
    assert await d.is_dup("c9") is True
    # TTL reset clears the set without dropping recent marks semantics
    d._loaded_at = _t.time() - 61
    assert await d.is_dup("c9") is False, "expired window must forget everything"


# ══════════════════════════════════════════════════════════════════
# 6. GET /webhook — Facebook subscription handshake
# ══════════════════════════════════════════════════════════════════

async def test_webhook_get_handshake():
    """subscribe + correct token → echo hub.challenge; wrong token → 403."""
    import os

    from runner import WEBHOOK_VERIFY_TOKEN, app

    token = WEBHOOK_VERIFY_TOKEN or os.getenv("FB_WEBHOOK_VERIFY_TOKEN", "")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        if token:
            r = await ac.get("/webhook", params={
                "hub.mode": "subscribe", "hub.verify_token": token,
                "hub.challenge": "challenge_12345",
            })
            assert r.status_code == 200
            assert r.text == "challenge_12345"
        # wrong token is always rejected, even when verification is enabled
        r = await ac.get("/webhook", params={
            "hub.mode": "subscribe", "hub.verify_token": "definitely-wrong",
            "hub.challenge": "x",
        })
        assert r.status_code == 403


# ══════════════════════════════════════════════════════════════════
# 7. Vercel entrypoint export — the deployment killer (v5 §9)
# ══════════════════════════════════════════════════════════════════

def test_vercel_entrypoint_exports_app():
    """api/index.py MUST export `app` — Vercel's FastAPI adapter imports it
    from that module. A ruff F401 auto-fix once removed it (looked like an
    unused import) and every API deployment silently stopped updating.
    This test makes that class of breakage loud."""
    import importlib
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(root))
    mod = importlib.import_module("api.index")
    exported = getattr(mod, "app", None)
    assert exported is not None, (
        "api/index.py lost its `app` export — Vercel deployments are broken"
    )
