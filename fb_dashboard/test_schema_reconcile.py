"""Regression tests — schema reconcile + api_cache keys + cron imports.

Root cause these guard (2026-09-05, live incident):
  Production Neon DB predates the September rebuild → legacy tables kept
  old column sets → SELECT with current model columns 500s (/api/plans).
  Fixed by fb_dashboard/_schema_reconcile.py (lifespan + alembic 007).

Evidence/repro: scripts/repro_plans_500.py — identical symptom trio on a
stale-schema DB (/api/plans 500, /healthz 200, /api/config 200).
"""
from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DEBUG", "True")

import asyncio
import uuid

import pytest
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient

from database import engine as db_engine, AsyncSessionLocal
from models import Base, SubscriptionPlan
from _schema_reconcile import reconcile_schema

# The pre-rebuild (commit 6237331d) subscription_plans schema — the shape the
# production Neon table still had when /api/plans returned 500.
STALE_DDL = """
DROP TABLE IF EXISTS subscription_plans;
CREATE TABLE subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    price_monthly INTEGER DEFAULT 0,
    price_yearly INTEGER DEFAULT 0,
    stripe_price_id_monthly VARCHAR(100) DEFAULT '',
    stripe_price_id_yearly VARCHAR(100) DEFAULT '',
    max_replies INTEGER DEFAULT 0,
    max_rules INTEGER DEFAULT 10,
    max_users INTEGER DEFAULT 1,
    max_sequences INTEGER DEFAULT 0,
    features JSON DEFAULT '[]',
    is_public BOOLEAN DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO subscription_plans (name, price_monthly, max_replies, max_rules, sort_order, is_public, features) VALUES
 ('Free', 0, 100, 5, 1, 1, '[]'),
 ('Basic', 1900, 2000, 20, 2, 1, '[]'),
 ('Premium', 4900, 10000, 50, 3, 1, '[]'),
 ('Pro', 9900, 50000, 100, 4, 1, '[]'),
 ('Enterprise', 19900, 100000, 250, 5, 1, '[]');
"""


async def _install_stale_table() -> None:
    """Create the legacy-shape table (5 rows) like the production DB has it."""
    # aiosqlite executes one statement at a time — split the script
    stmts = [s.strip() for s in STALE_DDL.split(";") if s.strip()]
    async with db_engine.begin() as conn:
        for s in stmts:
            await conn.execute(sa.text(s))


async def _install_other_tables() -> None:
    """create_all for every table EXCEPT the stale one (create_all skips it)."""
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@pytest.mark.asyncio
async def test_reconcile_adds_missing_model_columns():
    """The core incident: stale table + current model -> reconcile heals."""
    await _install_stale_table()
    async with db_engine.begin() as conn:
        added = await conn.run_sync(reconcile_schema)
    assert any(a == "subscription_plans.name_ar" for a in added), added
    assert any(a == "subscription_plans.price" for a in added), added
    assert any(a.startswith("subscription_plans.has_") for a in added), added
    # users/tenants drift columns from the audit are covered too
    joined = " ".join(added)
    assert "users.phone" in joined or "users." not in joined  # fresh users table -> no-op
    # columns really exist now
    async with db_engine.connect() as conn:
        cols = {c["name"] for c in await conn.run_sync(
            lambda sync: sa.inspect(sync).get_columns("subscription_plans"))}
    assert {"name_ar", "price", "period_days", "is_active", "updated_at"} <= cols


@pytest.mark.asyncio
async def test_reconcile_is_idempotent():
    await _install_stale_table()
    async with db_engine.begin() as conn:
        await conn.run_sync(reconcile_schema)
    async with db_engine.begin() as conn:
        second = await conn.run_sync(reconcile_schema)
    assert second == [], second


@pytest.mark.asyncio
async def test_plans_endpoint_200_on_reconciled_legacy_db():
    """End-to-end guard: the exact live incident must stay fixed.

    GET /api/plans against a legacy-shape DB AFTER reconcile -> 200 envelope.
    (Before the fix this was the production 500.)
    """
    await _install_stale_table()
    await _install_other_tables()
    async with db_engine.begin() as conn:
        await conn.run_sync(reconcile_schema)
    # production lifespan order: reconcile -> canonical seed upsert (repairs
    # legacy rows: is_active NULL -> True, canonical prices/flags/features)
    from runner import _seed_subscription_plans
    async with AsyncSessionLocal() as db:
        await _seed_subscription_plans(db)
    from runner import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        r = await ac.get("/api/plans")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert len(body["data"]) == 5


@pytest.mark.asyncio
async def test_canonical_seed_upsert_repairs_legacy_rows():
    """_seed_subscription_plans upserts canonical values onto legacy rows."""
    await _install_stale_table()
    async with db_engine.begin() as conn:
        await conn.run_sync(reconcile_schema)
    from runner import _seed_subscription_plans
    async with AsyncSessionLocal() as db:
        await _seed_subscription_plans(db)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(sa.select(SubscriptionPlan).order_by(SubscriptionPlan.sort_order))).scalars().all()
    assert len(rows) == 5
    by_name = {r.name: r for r in rows}
    assert by_name["Free"].name_ar == "مجاني"
    assert float(by_name["Basic"].price) == 19.0
    assert by_name["Premium"].has_broadcast is True
    assert by_name["Enterprise"].features and "دعم 24/7" in by_name["Enterprise"].features
    # second run = pure update, no duplicates
    async with AsyncSessionLocal() as db:
        await _seed_subscription_plans(db)
    async with AsyncSessionLocal() as db:
        n = len((await db.execute(sa.select(SubscriptionPlan))).scalars().all())
    assert n == 5


@pytest.mark.asyncio
async def test_api_cache_keys_do_not_collide_across_endpoints():
    """Two cached endpoints without a Request arg must use distinct keys.

    Regression: the old fallback produced the literal key "None" for every
    such endpoint — /api/plans and /api/config would have shared one cache
    entry once both decorators engage.
    """
    from api_cache import APICache, _cache_store

    cache = APICache()

    @cache.cached(ttl=60)
    async def endpoint_a(db=None):
        return {"success": True, "data": "A"}

    @cache.cached(ttl=60)
    async def endpoint_b(db=None):
        return {"success": True, "data": "B"}

    _cache_store.clear()
    ra = await endpoint_a()
    rb = await endpoint_b()
    assert ra["data"] == "A" and rb["data"] == "B"
    keys = set(_cache_store.keys())
    assert len(keys) == 2, f"expected 2 distinct cache keys, got {keys}"
    assert all(k != "None" for k in keys), keys
    # cached round-trip stays per-endpoint
    ra2 = await endpoint_a()
    rb2 = await endpoint_b()
    assert ra2["data"] == "A" and rb2["data"] == "B"
    _cache_store.clear()


@pytest.mark.asyncio
async def test_cron_cleanup_endpoint_executes_cleanly():
    """plans_config.cleanup_old_logs previously NameError'd (missing imports)."""
    await _install_stale_table()
    await _install_other_tables()
    async with db_engine.begin() as conn:
        await conn.run_sync(reconcile_schema)
    from runner import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        # wrong token -> 403 (auth check works)
        r403 = await ac.post("/api/cron/cleanup-logs", data={"token": "wrong"})
        assert r403.status_code == 403
        # correct token -> executes the datetime/delete body -> 200 (no NameError)
        r = await ac.post("/api/cron/cleanup-logs", data={"token": "test-cron-secret"})
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True
