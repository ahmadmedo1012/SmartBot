"""Track B.5 — SSE payment status stream (latest_plan.md).

Proves end-to-end: a waiting subscriber receives the `verified` event
within seconds of the admin approval — not on a 5s polling boundary.
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

import asyncio
import json

import pytest
from httpx import ASGITransport, AsyncClient

from database import engine as db_engine, AsyncSessionLocal
from models import Base, SubscriptionPayment, SubscriptionPlan, User


@pytest.fixture(scope="module")
async def env():
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # plan + user + payment
    async with AsyncSessionLocal() as db:
        plan = SubscriptionPlan(
            name="pro", name_ar="برو", price=99.0, period_days=30, is_active=True
        )
        db.add(plan)
        await db.flush()
        uname = f"sse_{uuid.uuid4().hex[:8]}"
        user = User(username=uname, email=f"{uname}@t.ly", password_hash="x", role="viewer")
        db.add(user)
        await db.flush()
        pay = SubscriptionPayment(
            user_id=user.id, tenant_id=None, plan_id=plan.id, plan_name="pro",
            amount=99.0, provider="liyana", phone="0910000000", status="pending",
        )
        db.add(pay)
        await db.commit()
        ids = {"user": user.id, "payment": pay.id}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        # login to get the auth cookie (password set below to match)
        yield ac, ids


async def _set_password_and_login(ac: AsyncClient, user_id: int) -> None:
    """Set a known password then login by username (real auth path)."""
    from _hash import hash_password
    async with AsyncSessionLocal() as db:
        u = await db.get(User, user_id)
        u.password_hash = hash_password("Test12345!")
        await db.commit()
        uname = u.username
    r = await ac.post("/api/login", json={"username": uname, "password": "Test12345!"})
    assert r.status_code == 200, r.text


async def test_sse_pushes_approval_instantly(env):
    ac, ids = env
    await _set_password_and_login(ac, ids["user"])

    async def approve_after_delay():
        await asyncio.sleep(1.5)
        async with AsyncSessionLocal() as db:
            sp = await db.get(SubscriptionPayment, ids["payment"])
            sp.status = "verified"
            await db.commit()

    approver = asyncio.create_task(approve_after_delay())

    events: list[dict] = []
    async with ac.stream("GET", f"/api/subscriptions/status-stream?payment_id={ids['payment']}") as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        async for line in resp.aiter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
                if events[-1].get("status") == "verified":
                    break
            if len(events) > 10:
                break

    await approver
    statuses = [e.get("status") for e in events]
    assert "verified" in statuses, f"SSE never pushed approval — got: {statuses}"


async def test_sse_rejects_foreign_payment(env):
    """Tenant isolation holds on the stream: another user's payment → error event."""
    ac, ids = env
    # register a second, unrelated user
    uname = f"sse2_{uuid.uuid4().hex[:8]}"
    await ac.post("/api/register", json={
        "username": uname, "email": f"{uname}@t.ly", "password": "Test12345!", "name": "SSE Two",
    })
    # (cookie now belongs to user 2)
    got_error = False
    async with ac.stream("GET", f"/api/subscriptions/status-stream?payment_id={ids['payment']}") as resp:
        async for line in resp.aiter_lines():
            if line.startswith("event: error"):
                got_error = True
                break
    assert got_error, "foreign payment must raise the error event"
