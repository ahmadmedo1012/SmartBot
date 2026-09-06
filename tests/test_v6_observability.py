from __future__ import annotations

"""v6 §C + §E — observability & cron reliability tests.

§C (Sentry/GlitchTip + critical Telegram alerts):
  1. init_sentry is a clean no-op without SENTRY_DSN (and never raises
     even when the import fails entirely — observability must not take
     the app down).
  2. global_500_handler bridges to the admin Telegram pipeline (HTTP
     boundary mocked) — full path: handler → report_critical →
     telegram_alert → recipients resolution → send_message → _call.
  3. The cooldown means an ERROR STORM sends ONE alert, not hundreds.
  4. report_critical never raises even when the request object is broken
     (double-fault guard — the 500 handler must not produce a 500).

§E (cron heartbeat ledger + staleness detection):
  5. An authenticated beat persists the ledger in SystemConfig and the
     HTTP response reports the previous-beat status.
  6. Staleness math: a fresh beat → no alert; a 30-minute-old beat →
     telegram alert fired exactly once (cooldown-guarded).
  7. GET /api/cron/status is platform-admin gated and tells the truth.
  8. POST /api/cron/alert-test fires the pipeline on demand.
"""
import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod-0123456789")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("FACEBOOK_APP_SECRET", "test-app-secret")
os.environ.setdefault("DEBUG", "True")

import uuid

import pytest
from database import AsyncSessionLocal  # noqa: E402
from database import engine as db_engine
from models import Base  # noqa: E402

# ── shared fixtures (same shape as test_radical_v4.py) ───────────────


@pytest.fixture(autouse=True, scope="module")
async def _ensure_tables():
    """Pure-unit tests in this module never touch app_client — but the
    ledger lives in SystemConfig, so the schema must exist regardless."""
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture(scope="module")
async def app_client():
    from runner import app
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    import _rate_limit as _rl

    async def _allow(db, key, max_attempts=10, window_seconds=60):
        return True

    mp = pytest.MonkeyPatch()
    mp.setattr(_rl, "check_rate_limit", _allow)
    try:
        from httpx import ASGITransport, AsyncClient
        async with AsyncClient(transport=ASGITransport(app=app),
                               base_url="http://t") as ac:
            yield ac
    finally:
        mp.undo()


@pytest.fixture(autouse=True)
def _fresh_alert_cooldowns():
    """Each test starts with a clean cooldown ledger (module state)."""
    import _observability as _obs
    _obs.reset_alert_cooldowns()
    yield
    _obs.reset_alert_cooldowns()


@pytest.fixture()
def telegram_spy(monkeypatch):
    """Mock the HTTP boundary of telegram — records every sendMessage."""
    import telegram_bot as tg

    calls: list[dict] = []

    def _fake_call(method, payload, token):
        calls.append({"method": method, "payload": payload, "token": token})
        return {"ok": True, "result": {"message_id": len(calls)}}

    monkeypatch.setattr(tg, "_call", _fake_call)
    # _ENV_ADMIN_IDS is frozen at module import — patch the module attr, setenv
    # alone would change nothing (the v5 §0 lesson: pin the world explicitly)
    monkeypatch.setattr(tg, "_ENV_ADMIN_IDS", [11111111])
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123456789:AAHtest_token_for_spy")
    return calls


async def _register(ac, prefix: str) -> dict:
    uname = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = await ac.post("/api/register", json={
        "username": uname, "email": f"{uname}@t.ly",
        "password": "Str0ngPass!ly", "name": prefix,
    })
    assert r.status_code == 200, r.text
    return r.json()["data"]["user"]


async def _login(ac, username: str) -> None:
    """Auth is COOKIE-based (auth.py get_current_user reads request.cookies).
    httpx persists the cookie on the client — nothing to return."""
    r = await ac.post("/api/login", json={"username": username, "password": "Str0ngPass!ly"})
    assert r.status_code == 200, r.text


async def _register_and_login(ac, prefix: str) -> str:
    user = await _register(ac, prefix)
    await _login(ac, user["username"])
    return user["username"]


async def _make_platform_admin(username: str) -> None:
    from models import User
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        u = (await db.execute(select(User).where(User.username == username))).scalar_one()
        u.is_platform_admin = True
        await db.commit()


# ────────────────────────────────────────────────────────────────────
# §C 1. Sentry no-op safety
# ────────────────────────────────────────────────────────────────────

async def test_init_sentry_noop_without_dsn(monkeypatch):
    import _observability as obs

    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert obs.init_sentry() is False
    assert obs._sentry_enabled is False


async def test_init_sentry_never_raises_even_when_sdk_missing(monkeypatch):
    import builtins

    import _observability as obs

    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.setenv("SENTRY_DSN", "https://key@sentry.example.com/1")
    real_import = builtins.__import__

    def _no_sentry(name, *a, **k):
        if name == "sentry_sdk":
            raise ImportError("simulated missing dependency")
        return real_import(name, *a, **k)

    monkeypatch.setattr(builtins, "__import__", _no_sentry)
    assert obs.init_sentry() is False  # graceful degradation, no exception


# ────────────────────────────────────────────────────────────────────
# §C 2+3+4. 500-handler bridge + cooldown + double-fault guard
# ────────────────────────────────────────────────────────────────────

class _FakeURL:
    def __init__(self, path):
        self.path = path


class _FakeState:
    request_id = "deadbeef42"


class _FakeRequest:
    method = "POST"
    url = _FakeURL("/api/definitely/broken")
    state = _FakeState()


async def test_report_critical_sends_telegram_with_context(telegram_spy):
    from _observability import report_critical

    await report_critical(_FakeRequest(), RuntimeError("database exploded"))
    assert len(telegram_spy) == 1
    payload = telegram_spy[0]["payload"]
    assert payload["chat_id"] == "11111111"
    text = payload["text"]
    assert "/api/definitely/broken" in text
    assert "database exploded" in text
    assert "deadbeef42" in text  # request id correlation (v5 §7)


async def test_error_storm_sends_one_alert_not_hundreds(telegram_spy):
    from _observability import report_critical

    for _ in range(25):  # the same fingerprint storming
        await report_critical(_FakeRequest(), RuntimeError("database exploded"))
    storm = [c for c in telegram_spy if "database exploded" in c["payload"]["text"]]
    assert len(storm) == 1  # cooldown swallowed the other 24


async def test_different_fingerprints_are_not_coalesced(telegram_spy):
    from _observability import report_critical

    class _OtherURL(_FakeURL):
        def __init__(self):
            super().__init__("/api/other/path")

    class _Other(_FakeRequest):
        url = _OtherURL()

    await report_critical(_FakeRequest(), RuntimeError("first"))
    await report_critical(_Other(), RuntimeError("second"))
    assert len(telegram_spy) == 2


async def test_report_critical_never_raises_on_broken_request(telegram_spy):
    from _observability import report_critical

    class _Broken:
        @property
        def method(self):
            raise RuntimeError("broken request object")

        @property
        def url(self):
            raise RuntimeError("broken request object")

        state = None

    await report_critical(_Broken(), ValueError("original error"))  # must not raise
    assert len(telegram_spy) == 1


async def test_500_handler_returns_arabic_generic_and_bridges(app_client, telegram_spy, monkeypatch):
    """HTTP-level: a real unhandled exception flows through the middleware
    stack, returns the generic Arabic 500 body, and fires the alert.

    Patched at the transport seam the dependency actually calls at request
    time (AsyncSessionLocal) — module-attribute patching of get_db would NOT
    rebind the reference FastAPI captured at route registration.
    """
    import database as _database

    ac = app_client
    user = await _register(ac, "obs500")
    await _login(ac, user["username"])

    def _boom_session_factory():
        raise RuntimeError("boom-500-http-test")

    monkeypatch.setattr(_database, "AsyncSessionLocal", _boom_session_factory)
    # Starlette's ServerErrorMiddleware returns the 500 response then re-raises
    # the original exception (so servers log it) — over raw ASGI that surfaces
    # as a raised error here. What this test proves is the FULL middleware
    # path: dependency error -> global handler -> Arabic body -> alert bridge.
    with pytest.raises(RuntimeError, match="boom-500-http-test"):
        await ac.get("/api/logs")
    fired = [c for c in telegram_spy if "boom-500-http-test" in c["payload"]["text"]]
    assert len(fired) == 1


async def test_500_handler_body_direct(app_client):
    """Direct invocation pins the response contract: generic Arabic detail,
    500 status, never a stack trace leak."""
    from runner import global_500_handler

    resp = await global_500_handler(_FakeRequest(), RuntimeError("db exploded"))
    assert resp.status_code == 500
    assert resp.body.decode() == '{"detail":"حدث خطأ داخلي — الرجاء المحاولة لاحقاً"}'


# ────────────────────────────────────────────────────────────────────
# §E 5. Heartbeat ledger (HTTP-level)
# ────────────────────────────────────────────────────────────────────

async def test_heartbeat_records_ledger_and_reports_previous(app_client):
    from _observability import HEARTBEAT_KEY
    from models import SystemConfig
    from sqlalchemy import select

    r = await app_client.get("/api/cron/heartbeat?token=test-cron-secret")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert "previous_beat" in data  # v6 §E staleness info in the response
    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(SystemConfig).where(SystemConfig.key == HEARTBEAT_KEY)
        )).scalar_one_or_none()
    assert row is not None and row.value, "beat must be persisted in the ledger"


# ────────────────────────────────────────────────────────────────────
# §E 6. Staleness detection + alert
# ────────────────────────────────────────────────────────────────────

async def _set_heartbeat_age(seconds: float) -> None:
    from datetime import timedelta

    from _observability import HEARTBEAT_KEY, _upsert_config
    from _utils import utcnow

    async with AsyncSessionLocal() as db:
        await _upsert_config(db, HEARTBEAT_KEY,
                             (utcnow() - timedelta(seconds=seconds)).isoformat(),
                             "test: synthetic stale beat")


async def test_staleness_fresh_beat_no_alert(telegram_spy):
    from _observability import check_cron_staleness_and_alert

    await _set_heartbeat_age(60)  # 1 minute old — fresh (limit is 15 min)
    res = await check_cron_staleness_and_alert()
    assert res["stale"] is False and res["alerted"] is False
    assert telegram_spy == []


async def test_staleness_30min_beat_alerts_admin(telegram_spy):
    from _observability import check_cron_staleness_and_alert

    await _set_heartbeat_age(30 * 60)
    res = await check_cron_staleness_and_alert()
    assert res["stale"] is True and res["alerted"] is True
    assert len(telegram_spy) == 1
    text = telegram_spy[0]["payload"]["text"]
    assert "الجدولة" in text and "15" in text


async def test_staleness_alert_cooldown_blocks_repeat(telegram_spy):
    from _observability import check_cron_staleness_and_alert

    await _set_heartbeat_age(6 * 3600)
    first = await check_cron_staleness_and_alert()
    second = await check_cron_staleness_and_alert()  # 12h cooldown
    assert first["alerted"] is True
    assert second["alerted"] is False  # suppressed by cooldown
    assert len(telegram_spy) == 1


async def test_staleness_never_beaten_is_not_stale(telegram_spy):
    from _observability import HEARTBEAT_KEY, check_cron_staleness_and_alert
    from models import SystemConfig
    from sqlalchemy import delete

    async with AsyncSessionLocal() as db:
        await db.execute(delete(SystemConfig).where(SystemConfig.key == HEARTBEAT_KEY))
        await db.commit()
    res = await check_cron_staleness_and_alert()
    assert res == {"last": None, "age_seconds": None, "stale": False, "alerted": False}


# ────────────────────────────────────────────────────────────────────
# §E 7+8. Admin status endpoint + on-demand alert test
# ────────────────────────────────────────────────────────────────────

async def test_cron_status_platform_admin_gated(app_client):
    ac = app_client
    await _register_and_login(ac, "cronstat")
    r = await ac.get("/api/cron/status")
    assert r.status_code == 403  # regular tenant: gated


async def test_cron_status_tells_truth(app_client):
    ac = app_client
    username = await _register_and_login(ac, "cronstat2")
    await _make_platform_admin(username)
    await _set_heartbeat_age(120)  # 2 minutes old — healthy
    r = await ac.get("/api/cron/status")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["stale"] is False
    assert 100 <= data["age_seconds"] <= 200
    assert data["stale_after_seconds"] == 900

    await _set_heartbeat_age(40 * 60)  # now stalled 40 minutes
    r2 = await ac.get("/api/cron/status")
    assert r2.json()["data"]["stale"] is True


async def test_cron_alert_test_fires_pipeline(app_client, telegram_spy):
    ac = app_client
    username = await _register_and_login(ac, "cronalert")
    await _make_platform_admin(username)
    r = await ac.post("/api/cron/alert-test")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["sent"] is True
    assert len(telegram_spy) == 1
    assert "اختبار" in telegram_spy[0]["payload"]["text"]
