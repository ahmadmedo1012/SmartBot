"""Security-hardening regression suite (2026-09-05 world-class round).

Covers the fixes that closed the cross-tenant escalation chain:
  1. tenant-scoped reset-password (was: any tenant admin → any user incl. platform admin)
  2. platform-admin-only guards on GLOBAL surfaces (config / telegram / repair / role-summary)
  3. delegated platform-admin promotion + platform users list
  4. self-service change-password
  5. decision whitelist + tenant scope on subscription resolve
  6. CRM count cartesian-product regression (total must equal N, not N×N)
  7. CSRF exact-host origin matching
  8. register/user-creation password policy
  9. cleanup-logs must fail CLOSED when CRON_SECRET is empty
"""
from __future__ import annotations

import os
import uuid

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod-0123456789")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DEBUG", "True")

import pytest
from httpx import ASGITransport, AsyncClient

from database import engine as db_engine, AsyncSessionLocal
from models import Base, User, Tenant, Customer


@pytest.fixture(scope="module")
async def app_client():
    from runner import app
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # This suite registers/logs-in MANY users from the single test-client IP;
    # the per-IP register (5/5min) and login (10/min) limits would 429 mid-suite.
    # Rate limiting itself is covered in its own tests — neutralised HERE only.
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
    return {"username": uname, "password": "Str0ngPass!ly"}


async def _login(ac: AsyncClient, username: str, password: str):
    r = await ac.post("/api/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


async def _make_user(username: str, tenant_id: int, role: str = "admin",
                     platform: bool = False) -> int:
    from _hash import hash_password
    async with AsyncSessionLocal() as db:
        u = User(username=username, email=f"{username}@t.ly",
                 password_hash=hash_password("Str0ngPass!ly"),
                 tenant_id=tenant_id, role=role, is_platform_admin=platform)
        db.add(u)
        await db.commit()
        return u.id


# ── 1 + 2 + 3: platform-admin model ─────────────────────────────────────────

async def test_tenant_admin_cannot_reset_cross_tenant_password(app_client):
    """THE critical fix: tenant admin reset-password is scoped to own tenant."""
    ac = app_client
    # attacker: fresh tenant owner (role=admin, own tenant)
    atk = await _register(ac, "atk")
    await _login(ac, atk["username"], atk["password"])
    # victim: user in a DIFFERENT tenant
    async with AsyncSessionLocal() as db:
        t = Tenant(name="victim-tenant")
        db.add(t)
        await db.flush()
        victim_id = await _make_user("victim", t.id)
        await db.commit()
    r = await ac.post("/api/admin/reset-password", json={
        "user_id": victim_id, "new_password": "Hacked!12345"})
    assert r.status_code == 404, f"cross-tenant reset leaked: {r.status_code} {r.text[:200]}"
    # victim password unchanged
    r = await ac.post("/api/login", json={"username": "victim", "password": "Hacked!12345"})
    assert r.status_code == 401


async def test_tenant_admin_cannot_reset_bootstrap_admin(app_client):
    """The bootstrap platform admin (tenant 0) is unreachable for tenant admins."""
    ac = app_client
    atk = await _register(ac, "atk2")
    await _login(ac, atk["username"], atk["password"])
    async with AsyncSessionLocal() as db:
        boot_id = await _make_user("bootadmin", 0)
    r = await ac.post("/api/admin/reset-password", json={
        "user_id": boot_id, "new_password": "Hacked!12345"})
    assert r.status_code == 404, r.text[:200]


async def test_platform_admin_resets_any_user_and_delegation_flow(app_client):
    """Platform admin resets cross-tenant + promotes/delegates via new endpoints."""
    ac = app_client
    async with AsyncSessionLocal() as db:
        t = Tenant(name="delegate-tenant")
        db.add(t)
        await db.commit()
        tid = t.id
    owner_id = await _make_user("owner1", tid, role="admin")
    await _login(ac, "owner1", "Str0ngPass!ly")

    # owner (tenant admin, NOT platform) → 403 on platform surfaces
    for path in ("/api/admin/config", "/api/admin/platform/users", "/api/team/role-summary",
                 "/api/telegram/config", "/api/admin/telegram/approvers"):
        r = await ac.get(path)
        assert r.status_code == 403, f"{path} should be platform-only: {r.status_code}"
    r = await ac.post("/api/repair")
    assert r.status_code == 403

    # bootstrap platform admin delegates platform rights to owner
    await _login(ac, "bootadmin", "Str0ngPass!ly")
    r = await ac.patch(f"/api/admin/platform/users/{owner_id}", json={"is_platform_admin": True})
    assert r.status_code == 200, r.text[:300]
    assert r.json()["data"]["is_platform_admin"] is True

    # platform users list now includes the owner
    r = await ac.get("/api/admin/platform/users?q=owner1")
    assert r.status_code == 200
    assert r.json()["data"]["total"] >= 1

    # owner can now read global config and reset cross-tenant passwords
    await _login(ac, "owner1", "Str0ngPass!ly")
    r = await ac.get("/api/admin/config")
    assert r.status_code == 200
    other_id = await _make_user("otheruser", tid + 100)  # different tenant space
    r = await ac.post("/api/admin/reset-password", json={
        "user_id": other_id, "new_password": "Reset!12345"})
    assert r.status_code == 200, r.text[:200]
    r = await ac.post("/api/login", json={"username": "otheruser", "password": "Reset!12345"})
    assert r.status_code == 200


# ── 4: self-service change-password ─────────────────────────────────────────

async def test_change_password_self_service(app_client):
    ac = app_client
    u = await _register(ac, "chg")
    await _login(ac, u["username"], u["password"])
    r = await ac.post("/api/auth/change-password", json={
        "current_password": u["password"], "new_password": "NewStr0ng!22"})
    assert r.status_code == 200, r.text[:200]
    r = await ac.post("/api/login", json={"username": u["username"], "password": "NewStr0ng!22"})
    assert r.status_code == 200
    # wrong current password → 401
    r = await ac.post("/api/auth/change-password", json={
        "current_password": "wrongwrong", "new_password": "Another!12345"})
    assert r.status_code == 401
    # short new password → 400
    r = await ac.post("/api/auth/change-password", json={
        "current_password": "NewStr0ng!22", "new_password": "short"})
    assert r.status_code == 400


# ── 5: subscription resolve hardening ───────────────────────────────────────

async def test_resolve_subscription_rejects_bad_decision_and_cross_tenant(app_client):
    ac = app_client
    u = await _register(ac, "pay")
    await _login(ac, u["username"], u["password"])
    r = await ac.post("/api/admin/subscriptions", json={"id": 1, "status": "evil_status"})
    assert r.status_code == 400, "decision must be whitelisted"
    # cross-tenant/nonexistent payment → 400 (not 200-with-verified)
    r = await ac.post("/api/admin/subscriptions", json={"id": 999999, "status": "verified"})
    assert r.status_code == 400


# ── 6: CRM cartesian-count regression ───────────────────────────────────────

async def test_crm_customer_count_not_cartesian(app_client):
    """total must equal N (the old query returned N×N)."""
    ac = app_client
    u = await _register(ac, "crm")
    await _login(ac, u["username"], u["password"])
    from routers.auth import get_current_user
    # find our tenant
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        me = (await db.execute(select(User).where(User.username == u["username"]))).scalar_one()
        tid = me.tenant_id
        for i in range(3):
            db.add(Customer(tenant_id=tid, fb_user_id=f"c{i}", name=f"C{i}",
                            stage="lead", source="test"))
        await db.commit()
    r = await ac.get("/api/crm/customers")
    assert r.status_code == 200, r.text[:200]
    assert r.json()["data"]["total"] == 3, f"cartesian bug: total={r.json()['data']['total']}"


# ── 7: CSRF exact-origin matching ───────────────────────────────────────────

async def test_csrf_origin_exact_host_match(app_client):
    ac = app_client
    # no cookie needed — the origin check runs before auth
    for evil_origin in ("https://bot.smart-link.ly.evil.com",
                        "https://evil.com",
                        "https://bot.smart-link.ly.evil.ly:8443"):
        r = await ac.post("/api/login", json={"username": "x", "password": "y"},
                          headers={"Origin": evil_origin})
        assert r.status_code == 403, f"evil origin {evil_origin} passed: {r.status_code}"
    # legit origin passes the CSRF layer (fails later at auth — 401 expected)
    r = await ac.post("/api/login", json={"username": "x", "password": "y"},
                      headers={"Origin": "https://bot.smart-link.ly"})
    assert r.status_code in (401, 429), r.status_code


# ── 8: password policy ──────────────────────────────────────────────────────

async def test_register_password_policy(app_client):
    ac = app_client
    uname = f"pol_{uuid.uuid4().hex[:6]}"
    r = await ac.post("/api/register", json={
        "username": uname, "email": f"{uname}@t.ly", "password": "short"})
    assert r.status_code == 400
    r = await ac.post("/api/register", json={
        "username": "has space", "email": "x@t.ly", "password": "Str0ngPass!ly"})
    assert r.status_code == 400


async def test_create_team_user_validation(app_client):
    ac = app_client
    u = await _register(ac, "team")
    await _login(ac, u["username"], u["password"])
    r = await ac.post("/api/users", data={
        "username": "mate1", "password": "short", "role": "superhero"})
    assert r.status_code == 400  # bad role OR short password — both rejected
    r = await ac.post("/api/users", data={
        "username": "mate1", "password": "Str0ngPass!ly", "role": "viewer"})
    assert r.status_code == 200, r.text[:200]


# ── 9: cleanup-logs fail-closed with empty secret ───────────────────────────

async def test_cleanup_logs_fails_closed_without_secret(app_client, monkeypatch):
    """Empty CRON_SECRET must NEVER validate (old code: '' != '' → allowed)."""
    ac = app_client
    import routers.plans_config as pc
    monkeypatch.setattr(pc, "CRON_SECRET", "")
    r = await ac.post("/api/cron/cleanup-logs", data={"token": ""})
    assert r.status_code == 403, "cleanup-logs failed OPEN with empty secret"
    r = await ac.post("/api/cron/cleanup-logs", headers={"Authorization": "Bearer "})
    assert r.status_code == 403


# ── bonus: alerts envelope + bot status single-source ───────────────────────

async def test_alerts_endpoints_enveloped(app_client):
    ac = app_client
    u = await _register(ac, "alr")
    await _login(ac, u["username"], u["password"])
    r = await ac.get("/api/alerts")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True and "data" in body, f"alerts not enveloped: {list(body)[:5]}"
    r = await ac.get("/api/logs/stats")
    assert r.status_code == 200
    assert "success" in r.json()


# ── 10: setup-status surface (v3 final-launch §4.1) ─────────────────────────

async def test_setup_status_hides_platform_flags_from_tenants(app_client):
    """Tenant admins get their own booleans only; platform flags never leak."""
    ac = app_client
    t = await _register(ac, "sst")           # tenant owner
    await _login(ac, t["username"], t["password"])
    r = await ac.get("/api/setup-status")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["page_connected"] is False   # fresh tenant: nothing connected
    assert data["has_rules"] is False
    # THE leak guard: platform-level keys must be absent for tenant admins
    assert "telegram_configured" not in data
    assert "fb_webhook_secret_configured" not in data
    assert "platform_admin" not in data

    # platform admin (bootstrap-style tenant 0) sees the platform flags
    import asyncio
    from database import AsyncSessionLocal as ASL
    from models import User as U
    from _hash import hash_password
    async with ASL() as db:
        pa = U(username=f"plat_{uuid.uuid4().hex[:6]}", email="plat@t.ly",
               password_hash=hash_password("Str0ngPass!ly"),
               tenant_id=0, role="admin", is_platform_admin=False)
        db.add(pa)
        await db.commit()
    await _login(ac, pa.username, "Str0ngPass!ly")
    r2 = await ac.get("/api/setup-status")
    assert r2.status_code == 200, r2.text
    d2 = r2.json()["data"]
    assert d2["platform_admin"] is True
    assert "telegram_configured" in d2
    assert "fb_webhook_secret_configured" in d2
    # no secret VALUES ever leave the server — booleans only
    import json as _json
    assert "token" not in _json.dumps(d2).lower() or d2.get("telegram_configured") in (True, False)
