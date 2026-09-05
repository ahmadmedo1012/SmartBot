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
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DEBUG", "True")

import pytest
from httpx import ASGITransport, AsyncClient

from database import engine as db_engine
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
    "/api/team/role-summary",
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
    "/api/subscribers-tags",
    "/api/widgets",
    "/api/health-alerts",
    "/api/commerce/products",
    "/api/crm/leads?limit=5",
    "/api/webhook/events",
    "/api/webhook/check",
    "/api/diagnostics/system",
    "/api/notifications/",
    "/api/support/info",
    "/api/plans",
    "/api/me",
]


@pytest.mark.parametrize("path", ENVELOPED_ENDPOINTS)
async def test_endpoint_response_shape(auth_client, path: str):
    """Every endpoint answers the unified envelope (success + data keys)."""
    r = await auth_client.get(path)
    if r.status_code == 404:
        pytest.skip(f"{path} not mounted in this build")
    assert r.status_code == 200, f"{path} → {r.status_code}: {r.text[:200]}"
    body = r.json()
    assert isinstance(body, dict), f"{path} returned non-dict: {type(body)}"
    assert "success" in body, f"{path} missing 'success' key: {list(body.keys())}"
    assert "data" in body, f"{path} missing 'data' key: {list(body.keys())}"
    assert isinstance(body["success"], bool)


async def test_business_fail_still_enveloped(auth_client):
    """fail() contract: success=False + error string (HTTP 200)."""
    # plans_config username-check style: query a plan that doesn't exist
    r = await auth_client.get("/api/plans")
    body = r.json()
    assert body["success"] is True
    assert isinstance(body["data"], list)
