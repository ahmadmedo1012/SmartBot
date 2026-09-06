"""v12-E2 contract gate — the D4 envelope unification, pinned end-to-end.

D4's v12 plan step 9 (exact):
  - ENVELOPED_ENDPOINTS gains /api/marketing/campaigns;
  - /api/me gets the STRICT sibling-key assertion ``set(body.keys())
    <= {"success", "data"}`` (the legacy `authenticated` sibling is gone);
  - the v11 "extended envelopes" all answer the unified ok() contract now:
    /api/me (+ alias), onboarding test-connection ×3, marketing campaigns
    ({items, total} inside data), /api/system/stats, /api/admin/config,
    /api/setup-status, /api/notifications/settings;
  - pagination key split fixed: per_page everywhere (auth.py audit/users,
    admin platform users) — types.ts Paginated speaks per_page only;
  - /api/cron/status last_heartbeat is now iso_z (Z-suffixed UTC).

Fixtures: tests/conftest.py (v10_world + v10_seed).
"""
from __future__ import annotations

import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))


@pytest.fixture(scope="module")
async def contract_client():
    """عميل موثّق واحد على التطبيق الحقيقي (نفس وصفة test_track_a_response_shape:
    قاعدة الاختبار المشتركة + تسجيل مستخدم حقيقي يربط كوكي الجلسة)."""
    from database import engine as db_engine
    from httpx import ASGITransport, AsyncClient
    from models import Base
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    uname = f"contract_{uuid.uuid4().hex[:8]}"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.post("/api/register", json={
            "username": uname, "email": f"{uname}@t.ly",
            "password": "Test12345!", "name": "Contract User",
        })
        assert r.status_code == 200, r.text
        yield ac


# D4 step 9 — the enveloped list with the v12 additions. Every endpoint that
# used to answer an "extended envelope" (v11 audit) is now on the unified
# ok() contract; 404 would mean the route vanished, 403 means the gate moved
# (covered explicitly below for platform-admin routes).
ENVELOPED_ENDPOINTS = [
    "/api/me",
    "/api/auth/me",
    "/api/marketing/campaigns",
    "/api/system/stats",
    "/api/setup-status",
    "/api/notifications/settings",
    "/api/alerts",
    "/api/plans",
    "/api/config",
    "/api/bot/status",
    "/api/scheduled-posts",
    "/api/tags",
]


@pytest.mark.parametrize("path", ENVELOPED_ENDPOINTS)
async def test_endpoint_response_shape(contract_client, path: str):
    """Every listed endpoint answers {"success": bool, "data": ...}."""
    r = await contract_client.get(path)
    assert r.status_code != 404, f"{path} not mounted — fix the list or mount the route"
    if r.status_code == 403:
        pytest.skip(f"{path} requires platform-admin (covered explicitly below)")
    assert r.status_code == 200, f"{path} → {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert isinstance(body, dict), f"{path} returned non-dict: {type(body)}"
    assert "success" in body and "data" in body, f"{path}: {list(body.keys())}"
    assert isinstance(body["success"], bool)


async def test_api_me_strict_key_set(v10_seed):
    """D4: set(body.keys()) <= {"success", "data"} — الأخ `authenticated`
    القديم حُذف (لا قارئ حقيقي له في الواجهة)."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Contract-Me")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.get("/api/me")
    assert r.status_code == 200, r.text
    assert set(r.json().keys()) <= {"success", "data"}, r.json().keys()
    assert "authenticated" not in r.json()


async def test_marketing_campaigns_items_total_envelope(v10_seed):
    """/api/marketing/campaigns: data={items, total} (كانت مصفوفة + total
    على المستوى الأعلى)."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Contract-C")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.get("/api/marketing/campaigns")
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) == {"success", "data"}, body.keys()
    data = body["data"]
    assert isinstance(data, dict), f"data must be an object, got {type(data)}"
    assert set(data.keys()) == {"items", "total"}, data.keys()
    assert isinstance(data["items"], list)
    assert data["total"] == 0


async def test_platform_admin_config_enveloped(v10_seed):
    """/api/admin/config (كان dict خاماً) يعيد ok() — مقنع للمفاتيح السرية."""
    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/admin/config")
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body.keys()) == {"success", "data"}, body.keys()
    assert isinstance(body["data"], dict)


async def test_onboarding_test_connection_failure_is_ok_envelope(v10_seed):
    """onboarding test-connection (الفروع الثلاثة): ok({connected, error})."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Contract-O")
    v10_seed.auth(uname, tid)
    # branch 1: no credentials at all
    r = await v10_seed.world.client.post("/api/onboarding/test-connection", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True, body
    assert body["data"]["connected"] is False
    assert body["data"]["error"], body["data"]
    # branch 3: transport failure (unreachable host → exception path)
    r = await v10_seed.world.client.post("/api/onboarding/test-connection", json={
        "page_id": "1", "access_token": "x",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True, body
    assert body["data"]["connected"] is False
    assert body["data"]["error"], body["data"]


async def test_per_page_contract(v10_seed):
    """E2.15: page_size → per_page (معامل الاستعلام + مفتاح الاستجابة)
    في /api/audit/logs و/api/users و/api/admin/platform/users."""
    uname, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="Per-T")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.get("/api/audit/logs?per_page=5")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["per_page"] == 5, data
    assert "page_size" not in data, data

    r = await v10_seed.world.client.get("/api/users?per_page=5")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["per_page"] == 5, data
    assert "page_size" not in data, data

    puname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(puname, 0)
    r = await v10_seed.world.client.get("/api/admin/platform/users?per_page=10")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["per_page"] == 10, data
    assert "page_size" not in data, data


async def test_cron_status_last_heartbeat_iso_z(v10_seed):
    """E2.14: last_heartbeat بلاحقة Z (iso_z) — كان isoformat() أعمى عن
    المنطقة الزمنية فيزيح نص «آخر نبض» ساعتين حسب متصفح المشاهد."""
    from _observability import record_heartbeat

    await record_heartbeat({"published_posts": 0, "test": "v12-contract"})
    puname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(puname, 0)
    r = await v10_seed.world.client.get("/api/cron/status")
    assert r.status_code == 200, r.text
    last = r.json()["data"]["last_heartbeat"]
    assert last is not None, r.text
    assert last.endswith("Z"), last
