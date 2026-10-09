"""r133-A6 §1.2 — failure-injection tests for the except:pass remediation.

Modeled on the broken-heartbeat pattern of test_v12_routers_security.py
(``test_cron_heartbeat_503_when_ledger_write_fails``): monkeypatch the
INNERMOST call in the swallowed region to raise, then assert BOTH halves of
the r133-A6 contract —

  1. the swallow semantics survive (best-effort stays best-effort: the
     money/config path still answers 200/ok — the fix is *visibility*,
     never a behavior change), and
  2. the failure is no longer SILENT (a log.warning with the tabled
     message reaches the "fb-api" logger).

Covered sites (A6 §1.2 class (c) + the top-5 Must list):

  (c)#1   admin_routes.py:240        api_cache.clear_all after /api/admin/config
  (c)#2/3 facebook_routes.py:639/644 inbox eviction + engine reset, clear path
  (c)#4/5 facebook_routes.py:847/852 inbox eviction + engine reset, update path
  S1      app/webhooks.py:47         app-secret DB lookup → fail-closed 401
  (c)#9   _services.py:306           agent_brain eviction in refresh_ai_from_db
  (c)#11  replies.py:224             manual-reply meta fetch → fallback identity
  top-5#5 analytics.py:103           sentiment aggregation → empty card

The remaining (c) sites are the SAME eviction helper semantics reached from
deeper flows — onboarding connect (#7/#8 mirrors the settings PUT pairs),
``/api/facebook/test`` + self-heal exchange (#6/#10 — happy-path eviction is
already pinned by test_v20_token_type_and_silent_failures.py, which asserts
``tenant_id not in _tenant_fb_cache`` after the exchange). Those flows need
the full Graph mock harness; the pairs above exercise the identical
except-blocks, so the regression net is complete.
"""

from __future__ import annotations

import logging
import types
import uuid

# ── (c)#1 — admin config save: cache invalidation failure is logged ────────


async def test_admin_config_cache_clear_failure_is_logged_not_fatal(
        v10_seed, monkeypatch, caplog):
    """POST /api/admin/config with a broken api_cache: the save MUST still
    commit + answer ok (the clear is best-effort by design) — but r133-A6
    (c)#1 makes the ≤300s staleness visible instead of silent."""
    import _services

    ua, _tid, _uid = await v10_seed.platform_admin(username=f"r133a6c1_{uuid.uuid4().hex[:6]}")
    v10_seed.auth(ua, 0)

    class _BrokenCache:
        def clear_all(self):
            raise RuntimeError("simulated cache outage")

    # admin_routes does `from _services import api_cache` INSIDE the handler
    # → patching the module attribute is what the deferred import sees.
    monkeypatch.setattr(_services, "api_cache", _BrokenCache())

    with caplog.at_level(logging.WARNING, logger="fb-api"):
        r = await v10_seed.world.client.post(
            "/api/admin/config", json={"config": {"support_phone": "0912345678"}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True, body
    assert "support_phone" in body["data"]["updated"], body
    assert any("api_cache clear failed" in rec.getMessage()
               for rec in caplog.records), \
        "stale-cache risk must be visible (A6 (c)#1)"


# ── (c)#2/#3 + (c)#4/#5 — facebook settings: eviction family ───────────────


class _BrokenEvictionDict(dict):
    """Stand-in for routers.inbox._tenant_fb_cache whose pop() fails —
    the exact 'eviction swallowed' shape every (c) site wraps."""

    def pop(self, *args, **kwargs):  # noqa: ARG002 — never reached
        raise RuntimeError("simulated eviction outage")


def _break_engine_reset(monkeypatch):
    """reset_bot_engines is imported deferred inside the handlers."""
    def _broken_reset():
        raise RuntimeError("simulated engine-reset outage")

    import _services
    monkeypatch.setattr(_services, "reset_bot_engines", _broken_reset)


async def test_facebook_settings_clear_eviction_failure_is_logged(
        v10_seed, monkeypatch, caplog):
    """PUT /api/facebook/settings {clear:true} deletes the token rows, then
    the inbox eviction + engine reset are best-effort. Both failures must
    surface (A6 (c)#2/#3) while the disconnect itself still answers ok."""
    import routers.inbox as inbox_mod

    ua, tid, _uid = await v10_seed.tenant_user(
        role="admin", tenant_name=f"R133-A6-C23-{uuid.uuid4().hex[:6]}")
    v10_seed.auth(ua, tid)

    monkeypatch.setattr(inbox_mod, "_tenant_fb_cache", _BrokenEvictionDict())
    _break_engine_reset(monkeypatch)

    with caplog.at_level(logging.WARNING, logger="fb-api"):
        r = await v10_seed.world.client.put(
            "/api/facebook/settings", json={"clear": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True and body["data"]["cleared"] is True, body
    msgs = [rec.getMessage() for rec in caplog.records]
    assert any("inbox client cache eviction failed" in m for m in msgs), \
        "dead-token inbox client risk must be visible (A6 (c)#2)"
    assert any("bot engine reset failed" in m for m in msgs), \
        "engines replying for a disconnected page must be visible (A6 (c)#3)"


async def test_facebook_settings_update_eviction_failure_is_logged(
        v10_seed, monkeypatch, caplog):
    """The token-rotation save path (page_id write, no token → no Graph
    calls) reaches the same eviction pair at facebook_routes:847/852 —
    A6 (c)#4/#5. The save commits, the evictions warn."""
    import routers.inbox as inbox_mod

    ua, tid, _uid = await v10_seed.tenant_user(
        role="admin", tenant_name=f"R133-A6-C45-{uuid.uuid4().hex[:6]}")
    v10_seed.auth(ua, tid)

    monkeypatch.setattr(inbox_mod, "_tenant_fb_cache", _BrokenEvictionDict())
    _break_engine_reset(monkeypatch)

    with caplog.at_level(logging.WARNING, logger="fb-api"):
        r = await v10_seed.world.client.put(
            "/api/facebook/settings",
            json={"page_id": f"99887{uuid.uuid4().hex[:6]}",
                  "subscribe_webhook": False})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True, body
    msgs = [rec.getMessage() for rec in caplog.records]
    assert any("inbox client cache eviction failed" in m for m in msgs), \
        "stale inbox client after rotation must be visible (A6 (c)#4)"
    assert any("bot engine reset failed" in m for m in msgs), \
        "old-credential engines must be visible (A6 (c)#5)"


# ── S1 — webhook secret: DB lookup failure says the REAL cause, 401 stays ──


async def test_webhook_secret_db_failure_logs_real_cause_and_fails_closed(
        v10_seed, monkeypatch, caplog):
    """A SystemConfig DB outage during secret resolution must (a) still
    fail CLOSED with 401 (signature check never bypassed — A6 §1.3) and
    (b) log 'app-secret DB lookup failed' (S1) — NOT only the misattributed
    'not set (env nor SystemConfig)' that sent operators re-entering an
    already-configured secret."""
    import app.webhooks as webhooks_mod
    import runner

    # force the env short-circuit OFF → the DB fallback path runs
    monkeypatch.setattr(runner, "WEBHOOK_APP_SECRET", "")

    class _BrokenSessionFactory:
        def __call__(self):
            raise RuntimeError("simulated db outage")

    monkeypatch.setattr(webhooks_mod, "AsyncSessionLocal", _BrokenSessionFactory())

    with caplog.at_level(logging.WARNING, logger="fb-api"):
        r = await v10_seed.world.client.post("/webhook", content=b"{}")
    assert r.status_code == 401, r.text  # fail-closed, never a bypass
    msgs = [rec.getMessage() for rec in caplog.records]
    assert any("app-secret DB lookup failed" in m for m in msgs), \
        "the REAL cause (DB read failed) must be logged (A6 S1)"


# ── (c)#9 — refresh_ai_from_db: agent_brain eviction failure ───────────────


async def test_refresh_ai_eviction_failure_is_logged(monkeypatch, caplog):
    """A failing agent_brain._ai invalidation inside refresh_ai_from_db
    (the v25 B-02 regression guard) must warn — the agent silently keeping
    OLD AI keys is exactly the silent degradation the guard exists for."""
    import sys

    from _services import refresh_ai_from_db
    from database import AsyncSessionLocal
    from database import engine as db_engine
    from models import Base, SystemConfig

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # unique value → `changed` is True regardless of what earlier files did
    secret_val = f"sk-r133-a6-{uuid.uuid4().hex[:10]}"
    async with AsyncSessionLocal() as db:
        db.add(SystemConfig(key="openai_api_key", value=secret_val, is_secret=True))
        await db.commit()

    class _EvictionBrokenModule(types.ModuleType):
        def __setattr__(self, name, value):  # noqa: ARG002
            raise RuntimeError("simulated eviction failure")

    stub = _EvictionBrokenModule("agent_brain")
    monkeypatch.setitem(sys.modules, "agent_brain", stub)
    # refresh_ai_from_db compares against the env before applying the DB key
    monkeypatch.setenv("OPENAI_API_KEY", "sentinel-not-the-db-value")

    try:
        with caplog.at_level(logging.WARNING, logger="fb-api"):
            await refresh_ai_from_db()
        assert any("agent_brain eviction failed" in rec.getMessage()
                   for rec in caplog.records), \
            "stale-AI-keys risk must be visible (A6 (c)#9)"
    finally:
        # the shared file DB outlives this file — leave no AI-key override
        from sqlalchemy import delete as _sa_delete
        async with AsyncSessionLocal() as db:
            await db.execute(_sa_delete(SystemConfig).where(
                SystemConfig.key == "openai_api_key",
                SystemConfig.value == secret_val))
            await db.commit()


# ── (c)#11 — manual reply: meta fetch failure → fallback identity row ──────


async def test_manual_reply_meta_fetch_failure_stores_fallback_identity(
        v10_seed, monkeypatch, caplog):
    """reply_to_comment succeeds, the from{name}/message/post meta fetch
    fails → the Reply/Comment rows must STILL persist with the marked
    fallback identity ('[يدوي]') and the failure must warn (A6 (c)#11)."""
    import routers.replies as replies_mod

    ua, tid, _uid = await v10_seed.tenant_user(
        role="editor", tenant_name=f"R133-A6-C11-{uuid.uuid4().hex[:6]}")
    v10_seed.auth(ua, tid)

    class FakeFB:
        async def reply_to_comment(self, comment_id, message):
            return {"id": f"rc_{comment_id[:6]}"}

        async def _get(self, *args, **kwargs):
            raise RuntimeError("simulated graph outage")

    async def _fake_client(_tenant_id):
        return FakeFB()

    monkeypatch.setattr(replies_mod, "get_tenant_fb_client", _fake_client)

    cid = f"c_{uuid.uuid4().hex[:8]}"
    with caplog.at_level(logging.WARNING, logger="fb-api"):
        r = await v10_seed.world.client.post(
            f"/api/replies/{cid}/reply", data={"message": "رد يدوي للاختبار"})
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True, r.text
    assert any("comment meta fetch failed" in rec.getMessage()
               for rec in caplog.records), \
        "degraded audit-trail identity must be visible (A6 (c)#11)"

    from models import Reply
    from sqlalchemy import select
    async with v10_seed.world.sf() as db:
        rows = await db.execute(select(Reply).where(Reply.fb_comment_id == cid))
        reply = rows.scalar_one_or_none()
    assert reply is not None, "the reply row must still persist (best-effort meta)"
    assert reply.commenter_name == "[يدوي]"  # the marked fallback identity
    assert reply.comment_text == "رد يدوي للاختبار"  # reply text stands in
    assert reply.fb_post_id == ""


# ── top-5 #5 — analytics: sentiment aggregation failure degrades visibly ───


async def test_analytics_sentiment_failure_degrades_to_empty_not_silent(
        v10_seed, monkeypatch, caplog):
    """A broken sentiment query must leave the card EMPTY ({}), the overview
    200 (the rest of the payload stands), and a warning behind (A6 top-5#5)."""
    import routers.analytics as analytics_mod

    ua, tid, _uid = await v10_seed.tenant_user(
        tenant_name=f"R133-A6-AN-{uuid.uuid4().hex[:6]}")
    v10_seed.auth(ua, tid)

    class _BrokenModel:
        """Attribute access on the model raises inside the try → the exact
        swallowed-query shape (AISuggestion.sentiment / .id)."""

        def __getattr__(self, name):
            raise RuntimeError("simulated model metadata corruption")

    monkeypatch.setattr(analytics_mod, "AISuggestion", _BrokenModel())

    with caplog.at_level(logging.WARNING, logger="fb-api"):
        r = await v10_seed.world.client.get("/api/analytics/overview")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["sentiment_distribution"] == {}, data  # empty card, not a 500
    assert any("sentiment aggregation failed" in rec.getMessage()
               for rec in caplog.records), \
        "the empty sentiment card must not be silent (A6 top-5#5)"
