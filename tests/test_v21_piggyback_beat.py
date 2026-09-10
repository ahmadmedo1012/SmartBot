"""v21 (T4-a) — piggyback beat regression tests (app/piggyback.py).

The production gap these pin (worklog Task 0 / T3-a): automation runs only
via the authenticated cron heartbeat; Vercel's native cron is daily-only
and the external 5-minute channel is dead with a rotated secret — so an
inbound customer comment could wait up to 24h. The piggyback beat restores
sub-daily automation on warm traffic, and these tests pin its safety:

  ( i ) fires the automation advance AT MOST ONCE per window per instance
         (module-level monotonic stamp — the _sync_allowed pattern);
  (ii) NEVER blocks the response: the beat is spawned, the stamp is set,
         and the response returns while the beat is still in flight;
  (iii) is OFF when the VERCEL env marker is absent (local dev / tests);
  ( iv) never runs for unauthenticated or machine endpoints (/webhook,
         /api/webhook*, /api/telegram*, /api/cron/* — their own flows),
         nor for public/pre-session surfaces.

Plus an end-to-end beat: the spawned task advances the REAL sweep machinery
(claim-guarded publish — exactly once across two beats) and records the
ledger with the ``trigger: "piggyback"`` marker.

No Graph/network call leaves the process: the FB client is faked, the
ledger recorder is faked (same seams as test_v15_concurrency.py).
"""
from __future__ import annotations

import asyncio
import time
from datetime import timedelta

import pytest
from _utils import utcnow


@pytest.fixture(autouse=True)
def _clean_piggyback_state():
    """Reset the module-level throttle/single-flight state around each case
    (the _reset_token_type_cache seam contract)."""
    import app.piggyback as pb

    pb._reset_piggyback_state()
    yield
    pb._reset_piggyback_state()


async def _auth_and_hit(v10_seed, path: str = "/api/bot/status"):
    """Seed a tenant user, set its session cookie, hit an authed API route."""
    uname, tid, _uid = await v10_seed.tenant_user()
    v10_seed.auth(uname, tid)
    return await v10_seed.world.client.get(path)


async def _noop_record(report):
    return None


def _patch_sweep_spy(monkeypatch, inner=None):
    """Replace routers.bot._automation_sweep with a recording spy.

    The piggyback resolves the sweep with a deferred
    ``from routers.bot import _automation_sweep`` at BEAT time, so patching
    the module attribute is the seam (same as _run_single_cycle in
    test_v15_concurrency.py).
    """
    import routers.bot as bot_mod

    fired: list[dict] = []

    async def spy(report):
        fired.append(dict(report))
        if inner is not None:
            return await inner(report)
        return 0

    monkeypatch.setattr(bot_mod, "_automation_sweep", spy)
    return fired


# ══════════════════════════════════════════════════════════════════════════
# (i) at most once per window per instance
# ══════════════════════════════════════════════════════════════════════════


async def test_piggyback_fires_at_most_once_per_window(v10_seed, monkeypatch):
    import _observability as obs
    import app.piggyback as pb

    monkeypatch.setattr(pb, "_IS_VERCEL", True)  # simulate the Vercel runtime
    monkeypatch.setattr(obs, "record_heartbeat", _noop_record)
    fired = _patch_sweep_spy(monkeypatch)

    r = await _auth_and_hit(v10_seed)
    assert r.status_code == 200, r.text
    assert len(fired) == 1, "first authenticated warm request must fire ONE beat"
    task = pb._piggyback_task
    assert task is not None, "the beat task must be spawned (and kept findable)"
    await task
    assert pb._piggyback_last is not None, "the throttle stamp must be set at fire time"

    # still inside the window → a second authenticated request fires NOTHING
    r2 = await _auth_and_hit(v10_seed)
    assert r2.status_code == 200
    assert len(fired) == 1, "throttle window must suppress the second beat"

    # window elapsed → the next warm request fires again
    pb._piggyback_last = time.monotonic() - pb._PIGGYBACK_INTERVAL_S - 1.0
    r3 = await _auth_and_hit(v10_seed)
    assert r3.status_code == 200
    assert len(fired) == 2
    await pb._piggyback_task


async def test_piggyback_single_flight_blocks_second_spawn(v10_seed, monkeypatch):
    """A still-running beat (lambda freeze/thaw shape) must not be duplicated."""
    import _observability as obs
    import app.piggyback as pb

    monkeypatch.setattr(pb, "_IS_VERCEL", True)
    monkeypatch.setattr(obs, "record_heartbeat", _noop_record)
    started, release = asyncio.Event(), asyncio.Event()

    async def gated(report):
        started.set()
        await release.wait()
        return 0

    fired = _patch_sweep_spy(monkeypatch, inner=gated)

    r = await _auth_and_hit(v10_seed)
    assert r.status_code == 200
    await asyncio.wait_for(started.wait(), timeout=2.0)
    assert not pb._piggyback_task.done()

    # the stamp is artificially stale → the window alone would allow a new
    # beat, but the in-flight task must block it (single-flight).
    pb._piggyback_last = time.monotonic() - pb._PIGGYBACK_INTERVAL_S - 1.0
    r2 = await _auth_and_hit(v10_seed)
    assert r2.status_code == 200
    assert len(fired) == 1, "in-flight beat must block a second spawn"

    release.set()
    await asyncio.wait_for(pb._piggyback_task, timeout=2.0)


# ══════════════════════════════════════════════════════════════════════════
# (ii) never blocks the response
# ══════════════════════════════════════════════════════════════════════════


async def test_piggyback_never_blocks_the_response(v10_seed, monkeypatch):
    import _observability as obs
    import app.piggyback as pb

    monkeypatch.setattr(pb, "_IS_VERCEL", True)
    monkeypatch.setattr(obs, "record_heartbeat", _noop_record)
    started, release = asyncio.Event(), asyncio.Event()

    async def gated(report):
        started.set()
        await release.wait()  # the "automation" is stuck — the response must not care
        return 0

    fired = _patch_sweep_spy(monkeypatch, inner=gated)

    r = await _auth_and_hit(v10_seed)
    # the response is ALREADY in hand while the beat is gated mid-sweep:
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True
    assert pb._piggyback_last is not None, "stamp set when the beat fired"
    assert pb._piggyback_task is not None, "task spawned"
    await asyncio.wait_for(started.wait(), timeout=2.0)
    assert not pb._piggyback_task.done(), (
        "the response returned BEFORE the beat finished — non-blocking proof"
    )
    release.set()
    await asyncio.wait_for(pb._piggyback_task, timeout=2.0)
    assert len(fired) == 1


# ══════════════════════════════════════════════════════════════════════════
# (iii) OFF when the VERCEL env marker is absent
# ══════════════════════════════════════════════════════════════════════════


async def test_piggyback_off_when_vercel_absent(v10_seed, monkeypatch):
    import app.piggyback as pb

    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(pb, "_IS_VERCEL", False)  # mirror the import-time flag
    fired = _patch_sweep_spy(monkeypatch)

    r = await _auth_and_hit(v10_seed)
    assert r.status_code == 200
    assert fired == [], "no beat without the VERCEL runtime marker"
    assert pb._piggyback_last is None
    assert pb._piggyback_task is None


# ══════════════════════════════════════════════════════════════════════════
# (iv) never for unauthenticated / machine / public endpoints
# ══════════════════════════════════════════════════════════════════════════


async def test_piggyback_never_for_machine_or_unauthenticated(v10_seed, monkeypatch):
    import app.piggyback as pb

    monkeypatch.setattr(pb, "_IS_VERCEL", True)
    fired = _patch_sweep_spy(monkeypatch)

    uname, tid, _uid = await v10_seed.tenant_user()
    v10_seed.auth(uname, tid)  # an authenticated session rides all probes below
    c = v10_seed.world.client

    # machine endpoints (each has its own flow) — even WITH a session cookie
    r = await c.get("/api/cron/heartbeat")  # no Bearer → 403 (route untouched)
    assert r.status_code == 403
    await c.post("/api/telegram/webhook")   # Telegram webhook (unverified → 4xx)
    r = await c.get("/webhook")             # Facebook webhook verify → 403
    assert r.status_code == 403
    # public / edge-cached surfaces
    await c.get("/api/plans")
    await c.get("/api/config")
    assert fired == [], "machine + public endpoints must never piggyback"

    # unauthenticated request to a NORMAL route → 401, still no beat
    v10_seed.logout()
    r = await c.get("/api/bot/status")
    assert r.status_code == 401
    assert fired == [], "unauthenticated traffic must never piggyback"
    assert pb._piggyback_last is None

    # control: the very next authenticated non-exempt request fires exactly one
    v10_seed.auth(uname, tid)
    r = await c.get("/api/bot/status")
    assert r.status_code == 200
    assert len(fired) == 1
    await pb._piggyback_task


# ══════════════════════════════════════════════════════════════════════════
# end-to-end: the spawned beat advances REAL automation + records the ledger
# ══════════════════════════════════════════════════════════════════════════


class _FakeFB:
    """Records publish calls; one Graph-less stand-in (test_v15's _SlowFB shape)."""

    def __init__(self):
        self.calls: list[str] = []

    async def post_to_page(self, message: str):
        self.calls.append(message)
        return {"id": "piggy_pub_1"}


async def test_piggyback_beat_advances_automation_and_records_ledger(
        v10_seed, monkeypatch):
    import _observability as obs
    import _services
    import app.piggyback as pb
    import routers.bot as bot_mod
    from models import ScheduledPost

    monkeypatch.setattr(pb, "_IS_VERCEL", True)
    sf = v10_seed.world.sf
    monkeypatch.setattr(bot_mod, "AsyncSessionLocal", sf)  # sweeps hit the isolated DB

    recorded: list[dict] = []

    async def rec(report):
        recorded.append(dict(report))

    monkeypatch.setattr(obs, "record_heartbeat", rec)

    fake = _FakeFB()

    async def _fake_client(_tenant_id):
        return fake

    monkeypatch.setattr(_services, "get_tenant_fb_client", _fake_client)

    # a DUE scheduled post (tenant has no BotState fb_page_id rows → the
    # fan/cycle loops no-op; the publish sweep is the star of this test)
    tid = 420042
    async with sf() as db:
        post = ScheduledPost(tenant_id=tid, message="منشور piggyback",
                             platform="facebook", status="scheduled",
                             scheduled_at=utcnow() - timedelta(minutes=5))
        db.add(post)
        await db.commit()
        post_id = post.id

    r = await _auth_and_hit(v10_seed)
    assert r.status_code == 200
    await asyncio.wait_for(pb._piggyback_task, timeout=5.0)

    assert fake.calls == ["منشور piggyback"], "the beat published the due post"
    async with sf() as db:
        row = await db.get(ScheduledPost, post_id)
        assert row.status == "published"
        assert row.fb_post_id == "piggy_pub_1"
    assert recorded, "the beat recorded itself in the heartbeat ledger"
    assert recorded[0]["trigger"] == "piggyback"
    assert recorded[0]["published_posts"] == 1

    # idempotency across beats: a second beat (window forced elapsed) must
    # NOT re-publish (the atomic claim + published status protect it).
    pb._piggyback_last = time.monotonic() - pb._PIGGYBACK_INTERVAL_S - 1.0
    r2 = await _auth_and_hit(v10_seed)
    assert r2.status_code == 200
    await asyncio.wait_for(pb._piggyback_task, timeout=5.0)
    assert fake.calls == ["منشور piggyback"], "second beat must not re-publish"
    async with sf() as db:
        row2 = await db.get(ScheduledPost, post_id)
        assert row2.status == "published"
