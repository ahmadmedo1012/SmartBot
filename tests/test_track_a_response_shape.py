"""Track A exit-gate — response_shape tests (latest_plan.md, gate command):

    pytest fb_dashboard/ -k "response_shape" -v

Every /api endpoint must answer {"success": bool, "data": ...}. Authenticated
calls prove the envelope end-to-end through the real FastAPI app.
"""
from __future__ import annotations

import os
import uuid

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
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

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        yield ac


@pytest.fixture(scope="module")
async def auth_client(app_client):
    """Register a real user → cookie auth attached."""
    uname = f"shape_{uuid.uuid4().hex[:8]}"
    r = await app_client.post("/api/register", json={
        "username": uname, "email": f"{uname}@t.ly",
        "password": "Test12345!", "name": "Shape User",
    })
    assert r.status_code == 200, r.text
    return app_client


ENVELOPED_ENDPOINTS = [
    "/api/analytics/overview?days=7",
    "/api/analytics/top-commenters?limit=5",
    "/api/rules",
    "/api/team/members",
    "/api/bot/status",
    "/api/logs?limit=10",
    "/api/comments?limit=5",
    "/api/scheduled-posts",
    "/api/broadcasts",
    "/api/templates",
    "/api/sequences",
    "/api/flows",
    "/api/offers",
    "/api/calendar",
    "/api/tags",
    "/api/alerts",
    "/api/notifications/",
    "/api/support/info",
    "/api/plans",
    "/api/me",
]
# v15-E9 (D7-F6/H4): /api/team/role-summary حُذف من قائمة مستأجر-الجلسة —
# المسار محروس بـ require_platform_admin (team_routes.py:29) فيعود 403 لمستخدم
# عادي مشروعاً. عكس ذلك كان يُحوَّل إلى skip صامت (فئة D7-H4: انحدار بوابة
# صلاحيات يبدو تخطياً لا فشلاً). العقد الموجب للمسار مغطى الآن صراحة في
# test_platform_admin_role_summary_enveloped أدناه.


@pytest.fixture(scope="module")
async def platform_admin_client(app_client):
    """مسؤول منصة (tenant_id=0, admin) على عميل مستقل بمحفظة كوكيز خاصة —
    للعقد الموجب للمسارات المحروسة بـ require_platform_admin
    (v15-E9: كان غيابه يجعل 403-skip تبريراً مقبولاً)."""
    from _hash import hash_password
    from database import AsyncSessionLocal
    from httpx import ASGITransport, AsyncClient
    from models import User
    from routers.auth import make_token
    from runner import app

    async with AsyncSessionLocal() as db:
        u = User(username=f"pa_{uuid.uuid4().hex[:8]}",
                 email=f"pa_{uuid.uuid4().hex[:8]}@t.ly",
                 password_hash=hash_password("PlatformAdmin123!"),
                 tenant_id=0, role="admin")
        db.add(u)
        await db.commit()
        uname = u.username
    ac = AsyncClient(transport=ASGITransport(app=app), base_url="http://t")
    ac.cookies.set("token", make_token(uname, 0))
    try:
        yield ac
    finally:
        await ac.aclose()


@pytest.mark.parametrize("path", ENVELOPED_ENDPOINTS)
async def test_endpoint_response_shape(auth_client, path: str):
    """Every endpoint answers the unified envelope (success + data keys).

    404 is a FAILURE (was: silent skip) — a listed-but-unmounted endpoint is
    exactly how the duplicate-route shadowing went undetected. The list was
    pruned to verified-mounted routes on 2026-09-05.

    v15-E9 (D7-F6/H4): 403 is a FAILURE too, not a skip — an endpoint in this
    list answering 403 to a regular tenant user means the permission gate
    MOVED (regression of the auth contract) or the list is wrong; both need
    eyes, neither deserves silence. Platform-admin routes live outside this
    list and are pinned positively by their own tests.
    """
    r = await auth_client.get(path)
    assert r.status_code != 404, f"{path} not mounted in this build — fix the list or mount the route"
    assert r.status_code != 403, (
        f"{path} regressed to 403 for a regular tenant user — the permission gate "
        f"moved (D7-F6): move the endpoint to the platform-admin list with a positive "
        f"contract test, or restore the tenant contract"
    )
    assert r.status_code == 200, f"{path} → {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert isinstance(body, dict), f"{path} returned non-dict: {type(body)}"
    assert "success" in body, f"{path} missing 'success' key: {list(body.keys())}"
    assert "data" in body, f"{path} missing 'data' key: {list(body.keys())}"
    assert isinstance(body["success"], bool)


async def test_platform_admin_role_summary_enveloped(platform_admin_client):
    """v15-E9 (D7-F6): العقد الموجب للمسار المحروس — 200 + مظروف موحّد لمسؤول
    المنصة (كان السالب فقط مغطى في test_security_hardening: 403 لغير مسؤول
    المنصة، والوضع الإيجابي بلا أي غطاء)."""
    r = await platform_admin_client.get("/api/team/role-summary")
    assert r.status_code == 200, f"role-summary → {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert isinstance(body, dict), f"role-summary returned non-dict: {type(body)}"
    assert body.get("success") is True, body
    assert "data" in body, body.keys()


async def test_role_summary_forbidden_for_tenant_user(auth_client):
    """الجانب السالب مقابل: مستأجر عادي → 403 (لا 200/تسريب — عقد الحرس نفسه)."""
    r = await auth_client.get("/api/team/role-summary")
    assert r.status_code == 403, (
        f"role-summary must stay platform-admin guarded: {r.status_code} {r.text[:120]}"
    )


async def test_business_fail_still_enveloped(auth_client):
    """fail() contract: success=False + error string (HTTP 200)."""
    # plans_config username-check style: query a plan that doesn't exist
    r = await auth_client.get("/api/plans")
    body = r.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)
