"""v22 FIX-D — tenant attribution (BotLog + analytics_events).

Red→green contract for the W1-D2 / W1-D9 findings:

* W1-D2 §5.1 + W1-D9 F4 — ``monitor.py``'s BotLog batch writer and
  ``bot_engine``'s ``_add_log`` wrote every row with the model default
  ``tenant_id=0`` → 302/304 production rows were t0 while their CONTENT was
  tenant-specific («⚡ Cycle #4: 3 posts, 1 rules»), so the dashboard activity
  feed (``BotLog.tenant_id == _tid`` — dashboard_stats.py:210) was empty for
  EVERY tenant despite hundreds of logged events per day.
* W1-D9 F3 — publisher_routes.py (3 call sites) + app/webhooks.py:225 called
  ``_track_event`` without the ``tenant_id`` kwarg (the webhook site stashed
  it in metadata_json instead of the column) → analytics_events rows landed
  tenant_id=0.

Pinned behavior:
  (a) a bot-engine log write for tenant 7 → BotLog row tenant_id=7 (not 0):
      both the direct ``_add_log`` path and the monitor ring→batch→flush path;
  (b) the fixed ``_track_event`` call sites attribute their AnalyticsEvent
      rows to the acting tenant (driven through the real routes).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import uuid

import pytest
from sqlalchemy import select

V22 = "v22-fixd-probe"


async def _drain_bg(timeout_s: float = 2.0, rounds: int = 4) -> None:
    """Wait for the fire-and-forget spawn()ed analytics writers.

    ``_track_event`` schedules the INSERT as a background task; awaiting the
    registry (``_async._bg_tasks``) makes the row visible deterministically
    instead of a sleep.
    """
    import asyncio

    import _async

    for _ in range(rounds):
        pending = [t for t in list(_async._bg_tasks) if not t.done()]
        if not pending:
            return
        await asyncio.wait(pending, timeout=timeout_s)


# ══════════════════════════════════════════════════════════════════════════
# 1. BotLog attribution — engine + monitor paths
# ══════════════════════════════════════════════════════════════════════════


async def test_engine_add_log_carries_tenant(v10_world):
    """(a) engine._add_log for tenant 7 → BotLog.tenant_id=7 (was 0)."""
    from bot import BotEngine
    from models import BotLog

    engine = BotEngine(None, tenant_id=7)
    async with v10_world.sf() as db:
        await engine._add_log(db, "INFO", f"{V22} engine direct write")

    async with v10_world.sf() as db:
        rows = (await db.execute(
            select(BotLog).where(BotLog.message == f"{V22} engine direct write")
        )).scalars().all()
    assert len(rows) == 1, f"expected exactly one row, got {len(rows)}"
    assert rows[0].tenant_id == 7, (
        f"tenant_id={rows[0].tenant_id} — engine lost tenant attribution"
    )


async def test_engine_monitor_is_tenant_bound(v10_world):
    """The engine's logger view injects the tenant into every emitted event."""
    import monitor
    from bot import BotEngine
    from monitor import get_logger

    engine = BotEngine(None, tenant_id=23)
    assert engine._mon is not get_logger(), (
        "engine got the raw global singleton — no tenant binding"
    )

    monitor._botlog_batch.clear()  # module-global: drop other files' leftovers
    engine._mon.info(f"{V22} bound logger probe", module="engine")
    payloads = [p for p in monitor._botlog_batch
                if p.get("message") == f"{V22} bound logger probe"]
    assert payloads, "emit did not reach the BotLog batch"
    assert payloads[0].get("tenant_id") == 23, payloads[0]


async def test_monitor_batch_writes_tenant_rows(v10_world, monkeypatch):
    """(a) monitor ring→batch→_flush_botlog keeps tenant end-to-end."""
    import monitor
    from models import BotLog

    # Steer the batch writer's own sessions at the isolated test DB
    # (same pattern as test_v16_prod_truth.py §G / bot.AsyncSessionLocal seam).
    monkeypatch.setattr("database.AsyncSessionLocal", v10_world.sf)
    monitor._botlog_batch.clear()

    bound = monitor.get_logger().bind_tenant(7)
    for i in range(10):
        bound.info(f"{V22} batch {i}")
    await monitor._flush_botlog()

    async with v10_world.sf() as db:
        rows = (await db.execute(
            select(BotLog).where(BotLog.message.like(f"{V22} batch %"))
        )).scalars().all()
    assert len(rows) == 10, f"expected 10 flushed rows, got {len(rows)}"
    assert {r.tenant_id for r in rows} == {7}, (
        f"batch rows lost tenant attribution: {[r.tenant_id for r in rows]}"
    )


async def test_activity_feed_query_sees_tenant_rows(v10_world, monkeypatch):
    """The dashboard feed filter (BotLog.tenant_id == tid) now matches.

    W1-D2: ``recent_activity`` was empty for every tenant because the rows
    sat in tenant 0 — prove the exact filter shape returns the attributed
    rows (feed reader is dashboard_stats.py:210; unchanged by this fix).
    """
    import monitor
    from models import BotLog

    monkeypatch.setattr("database.AsyncSessionLocal", v10_world.sf)
    monitor._botlog_batch.clear()
    bound = monitor.get_logger().bind_tenant(7)
    for i in range(4):
        bound.warn(f"{V22} feed {i}")
    await monitor._flush_botlog()

    _tid = 7  # the feed's filter value (dashboard_stats.py:210 shape)
    async with v10_world.sf() as db:
        feed = (await db.execute(
            select(BotLog).where(BotLog.tenant_id == _tid)
            .order_by(BotLog.created_at.desc()).limit(8)
        )).scalars().all()
    assert feed, "activity feed query still empty after attribution fix"


def test_log_event_tenant_field_json_parity():
    """tenant_id=0 stays hidden in to_dict (JSON parity); non-zero is kept."""
    from monitor import LogEvent

    assert LogEvent("INFO", "m", tenant_id=9).to_dict()["tenant_id"] == 9
    assert "tenant_id" not in LogEvent("INFO", "m").to_dict()


# ══════════════════════════════════════════════════════════════════════════
# 2. analytics_events attribution — publisher + webhook call sites
# ══════════════════════════════════════════════════════════════════════════

@pytest.fixture
async def analytics_db(monkeypatch):
    """Isolated FILE-backed DB for the spawned analytics writer.

    ``_track_event`` inserts via a fire-and-forget session on its OWN
    connection. In production (Postgres/NullPool) that connection is
    separate from the request's — but v10_world's in-memory StaticPool pins
    EVERYTHING to one raw connection, so the writer's INSERT races the
    request teardown's ROLLBACK and loses. A file DB with a second engine
    gives the writer its own connection, mirroring production, and keeps
    the assertions deterministic (drain the task registry, then read).
    """
    import os
    import tempfile

    import _services
    from models import Base
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    fd, path = tempfile.mkstemp(prefix="v22_fixd_", suffix=".db")
    os.close(fd)
    os.unlink(path)
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf_an = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(_services, "AsyncSessionLocal", sf_an)  # _track_event sessions
    try:
        yield sf_an
    finally:
        await engine.dispose()
        try:
            os.unlink(path)
        except OSError:
            pass



async def test_publisher_schedule_event_attributed(v10_seed, analytics_db):
    """(b) POST /api/publisher/publish (scheduled) → row carries the tenant.

    W1-D9 live proof: tenant 42 scheduled a post → analytics_events id=44
    landed tenant_id=0. This is the publisher_routes.py:76 call site.
    """
    from models import AnalyticsEvent, ScheduledPost

    sf = v10_seed.world.sf

    uname, tid, _uid = await v10_seed.tenant_user(role="editor")
    await v10_seed.login(uname)
    c = v10_seed.world.client
    await c.get("/api/publisher/status")  # issue the csrf cookie (real FE flow)

    r = await c.post("/api/publisher/publish", json={
        "platform": "telegram",
        "message": f"{V22} scheduled",
        "scheduled_at": "2031-01-01T00:00:00",
    })
    assert r.status_code == 200, r.text
    await _drain_bg()

    async with analytics_db() as db:
        rows = (await db.execute(
            select(AnalyticsEvent).where(AnalyticsEvent.event_type == "post_scheduled")
        )).scalars().all()
    assert rows, "no post_scheduled analytics row was written"
    assert all(r.tenant_id == tid for r in rows), (
        f"analytics rows not attributed: {[r.tenant_id for r in rows]}"
    )

    async with sf() as db:
        sp = (await db.execute(select(ScheduledPost))).scalars().all()
    assert sp and all(s.tenant_id == tid for s in sp)


async def test_publisher_immediate_fb_event_attributed(v10_seed, analytics_db, monkeypatch):
    """(b) immediate facebook publish → publisher_routes.py:91 site."""
    import routers.publisher_routes as pr
    from models import AnalyticsEvent

    class _FakeFB:
        async def post_to_page(self, message):
            return {"id": f"{V22}_fbpost"}

    async def _fake_client(_tid):
        return _FakeFB()

    monkeypatch.setattr(pr, "get_tenant_fb_client", _fake_client)

    uname, tid, _uid = await v10_seed.tenant_user(role="editor")
    await v10_seed.login(uname)
    c = v10_seed.world.client
    await c.get("/api/publisher/status")

    r = await c.post("/api/publisher/publish", json={
        "platform": "facebook", "message": f"{V22} immediate",
    })
    assert r.status_code == 200, r.text
    await _drain_bg()

    async with analytics_db() as db:
        rows = (await db.execute(
            select(AnalyticsEvent).where(AnalyticsEvent.event_type == "post_published")
        )).scalars().all()
    assert rows, "no post_published analytics row was written"
    assert all(r.tenant_id == tid for r in rows), (
        f"analytics rows not attributed: {[r.tenant_id for r in rows]}"
    )


async def test_publisher_engine_event_attributed(v10_seed, analytics_db, monkeypatch):
    """(b) non-facebook platform publish → publisher_routes.py:101 site."""
    import routers.publisher_routes as pr
    from models import AnalyticsEvent

    class _FakeEngine:
        async def load_credentials(self, db, tenant_id=None):
            return True

        async def publish_to_platform(self, platform, message, image_url=""):
            return {"id": f"{V22}_tgpost", "platform": platform}

        def get_platform_display_name(self, platform):
            return "تيليجرام"

        def get_status(self):
            return {"configured": True}

    monkeypatch.setattr(pr, "get_publisher_engine", lambda: _FakeEngine())

    uname, tid, _uid = await v10_seed.tenant_user(role="editor")
    await v10_seed.login(uname)
    c = v10_seed.world.client
    await c.get("/api/publisher/status")

    r = await c.post("/api/publisher/publish", json={
        "platform": "telegram", "message": f"{V22} engine",
    })
    assert r.status_code == 200, r.text
    await _drain_bg()

    async with analytics_db() as db:
        rows = (await db.execute(
            select(AnalyticsEvent).where(AnalyticsEvent.event_type == "post_published")
        )).scalars().all()
    assert rows, "no post_published analytics row was written"
    assert all(r.tenant_id == tid for r in rows), (
        f"analytics rows not attributed: {[r.tenant_id for r in rows]}"
    )


class _SentinelFB:
    """No-network FB client stand-in for the webhook routing test."""

    page_id = f"{V22}_page"


async def test_webhook_comment_event_attributed(v10_seed, analytics_db, monkeypatch):
    """(b) signed webhook comment → webhooks.py:225 site (was metadata-only).

    W1-D9: the site put the tenant in metadata_json and left the COLUMN at 0
    (2 pre-existing prod t0 rows prove it fires in the wild). Drive the REAL
    signed endpoint (test_radical_v4 pattern) with the engine + FB client
    stubbed so no network is touched.
    """
    import app.webhooks as webhooks_mod
    from models import AnalyticsEvent, BotState

    sf = v10_seed.world.sf
    monkeypatch.setattr(webhooks_mod, "AsyncSessionLocal", sf)
    # comment persist inside _process_webhook_comment re-imports from database
    monkeypatch.setattr("database.AsyncSessionLocal", sf)

    uname, tid, _uid = await v10_seed.tenant_user()
    page_id = f"pg{uuid.uuid4().hex[:10]}"
    async with sf() as db:
        db.add(BotState(tenant_id=tid, key="fb_page_id", value=page_id))
        await db.commit()

    class _StubEngine:
        async def process_single_comment(self, comment, post_id):
            return True

    async def _fake_tenant_fb_client(_tid):
        return _SentinelFB()

    monkeypatch.setattr(webhooks_mod, "get_tenant_fb_client", _fake_tenant_fb_client)
    monkeypatch.setattr(webhooks_mod, "get_bot_engine",
                        lambda fb, tenant_id=0: _StubEngine())

    comment_id = f"c_{V22}_{uuid.uuid4().hex[:6]}"
    payload = {
        "object": "page",
        "entry": [{
            "id": page_id, "time": 1757000000000,
            "changes": [{
                "field": "feed",
                "value": {
                    "item": "comment", "verb": "add",
                    "comment_id": comment_id,
                    "post_id": f"p_{V22}",
                    "message": "شحال السعر؟",
                    "from": {"id": "100001", "name": "زبون تجريبي"},
                    "created_time": "2026-09-10T10:00:00+0000",
                },
            }],
        }],
    }
    body = json.dumps(payload).encode()
    import runner  # the handler reads the canonical secret off runner
    sig = "sha256=" + hmac.new(
        (runner.WEBHOOK_APP_SECRET or "").encode(), body, hashlib.sha256
    ).hexdigest()

    r = await v10_seed.world.client.post(
        "/webhook", content=body, headers={"X-Hub-Signature-256": sig})
    assert r.status_code == 200, r.text
    await _drain_bg()

    async with analytics_db() as db:
        rows = (await db.execute(
            select(AnalyticsEvent).where(
                AnalyticsEvent.event_type == "webhook_comment_processed")
        )).scalars().all()
    assert rows, "no webhook_comment_processed analytics row was written"
    assert all(r.tenant_id == tid for r in rows), (
        f"analytics rows not attributed: {[r.tenant_id for r in rows]}"
    )
