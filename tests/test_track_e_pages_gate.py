"""Track E exit-gate — every dashboard page's real API answers (latest_plan.md).

Gate: for each of the 22 pages, curl-equivalent (authenticated AsyncClient)
against EVERY endpoint the page depends on → HTTP 200 + unified envelope +
a plausible payload type (list/dict — never a bare error).
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

# P18-W5 (the lost-wakeup deadlock fix — ROOT CAUSE, reproduced 4/6 locally
# as a 90s hang + BaseHTTPMiddleware CancelledError, = CI's intermittent
# [activity] red): the fixture was MODULE-scoped — under pytest-asyncio's
# defaults a module-scoped async fixture runs on a dedicated module event
# loop while every TEST runs on its own function-scoped loop. The shared
# httpx AsyncClient + the aiosqlite futures bind to the FIXTURE's loop;
# the first request issued from a test's loop = a lost wakeup: the DB
# worker thread idles on tx.get(), the test loop idles on
# selector.poll(), nothing ever resolves until the 120s wall kills it.
# (The loop_scope="module" marks were tried and pytest-asyncio 0.25.3
# raises MultipleEventLoopsRequestedError in auto mode — the scope
# machinery cannot pair these here.) The robust fix: FUNCTION scope —
# every test gets its own loop-bound client+register; the cross-loop
# sharing that caused the deadlock simply ceases to exist. The 22x
# register cost is ~7s with off-loop argon2 (see _hash.py); the tested
# CONTRACTS are untouched — same endpoints, same envelopes, same asserts.
from database import engine as db_engine
from httpx import ASGITransport, AsyncClient
from models import Base, RateLimitEntry
from sqlalchemy import delete

# page → list of endpoints it consumes (grep-verified 2026-09-05)
PAGE_API_MAP: dict[str, list[str]] = {
    "dashboard": ["/api/dashboard/bundle"],
    "activity": ["/api/logs?limit=100"],
    "ads": ["/api/ads/accounts"],
    "analytics": ["/api/analytics/overview?days=30"],
    "audience": ["/api/analytics/overview?days=30", "/api/analytics/top-commenters?limit=5"],
    "autoreply": ["/api/rules"],
    "billing": ["/api/payments/balance", "/api/payments/history"],
    "broadcast": ["/api/broadcasts"],
    "calendar": ["/api/calendar"],
    "comments": ["/api/comments?limit=30"],
    "leads": ["/api/crm/customers"],
    "marketing": ["/api/marketing/campaigns", "/api/marketing/audience-size"],
    "messages": ["/api/inbox/conversations"],
    "notifications": ["/api/notifications/", "/api/notifications/settings"],
    "pages": ["/api/facebook/settings"],
    "posts": ["/api/scheduled-posts"],
    "reports": ["/api/analytics/dashboard", "/api/analytics/top-commenters?limit=5"],
    "scheduled": ["/api/scheduled-posts"],
    "settings": ["/api/me"],
    "support": ["/api/support/info", "/api/support/tickets"],
    "team": ["/api/team/members"],
    "tools": ["/api/offers", "/api/templates"],
}


@pytest.fixture()
async def auth_client():
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # P18-W5: function-scoped = 22 registers per run from the test IP;
        # the REAL register rate limit (5/300s per IP) would 429 the 6th.
        # Test-env state hygiene (same class as create_all itself): wipe
        # the limiter rows so every test starts with clean buckets. The
        # limiter's OWN contract is tested in its own dedicated suite.
        await conn.execute(delete(RateLimitEntry))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        uname = f"gate_{uuid.uuid4().hex[:8]}"
        r = await ac.post("/api/register", json={
            "username": uname, "email": f"{uname}@t.ly",
            "password": "Test12345!", "name": "Gate User",
        })
        assert r.status_code == 200, r.text
        # Real journey step: connect a (test) FB page so inbox/ads endpoints
        # return real data flows instead of the honest 400 "setup required"
        # P18-W5: function-scoped fixtures need a UNIQUE page per run —
        # the fixed "1000000001" now collides with the previous test's
        # tenant (the page-uniqueness rule fires 409). Unique per fixture
        # invocation, same contract.
        page_id = str(1_000_000_000 + int(uuid.uuid4().int % 900_000_000))
        r = await ac.put("/api/facebook/settings", json={
            "page_id": page_id, "access_token": "test-token-gate",
            "subscribe_webhook": False,
        })
        assert r.status_code == 200, f"facebook settings: {r.status_code} {r.text[:120]}"
        yield ac


@pytest.mark.parametrize("page", sorted(PAGE_API_MAP))
async def test_page_backend_alive(auth_client, page: str):
    """All endpoints the page depends on answer 200 + envelope."""
    failures = []
    for ep in PAGE_API_MAP[page]:
        r = await auth_client.get(ep)
        try:
            body = r.json()
        except Exception:
            failures.append(f"{ep} → {r.status_code} non-JSON")
            continue
        if r.status_code != 200:
            failures.append(f"{ep} → {r.status_code}: {str(body)[:80]}")
        elif not (isinstance(body, dict) and "success" in body and "data" in body):
            failures.append(f"{ep} → 200 but no envelope: {str(body)[:80]}")
    assert not failures, f"[{page}] " + " | ".join(failures)
