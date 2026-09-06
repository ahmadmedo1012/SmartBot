from __future__ import annotations

"""v12 §3 (E3) — app-core observability & security tests (agent E3).

Sections (one per E3 workstream item):
  §1 E3.1 — SPA path traversal defense (app/spa.py)
  §2 E3.2 — request_id binding: request.state + X-Request-Id header +
            rid in the 500-handler traceback line (app/middleware.py, app/errors.py)
  §3 E3.3 — CSRF double-submit layer (app/middleware.py csrf_origin_check):
            issuance on safe /api/* GETs, enforcement on mutations,
            exemptions, Bearer skip, idempotency
  §4 E3.4 — CSP narrowing: no Facebook SDK hosts in script-src, connect-src
            narrowed to the hosts actually used
  §5 E3.5 — background error capture: spawn() done-callback logging +
            Sentry capture, lifespan security re-raise with capture,
            app-continues on other startup errors; the WS/event-bus tenant
            scoping primitives the fixed bot_health bridge relies on
  §6 E3.7 — Sentry before_send PII scrubber + init wiring

Environment follows the root conftest (hermetic sqlite + SENTRY_DSN=off +
DEBUG=True → csrf cookie issued without the Secure attribute).
"""

import asyncio
import contextlib
import json
import logging
import os
import re
import sys
import types
from contextlib import contextmanager

import pytest
from fastapi import Request  # module-level: the rid() route's annotation

# resolves via THIS module's globals — the file has `from __future__ import
# annotations`, so a function-local import leaves the annotation an
# unresolvable string → FastAPI treats it as a query param → 422.

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod-0123456789")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("FACEBOOK_APP_SECRET", "test-app-secret")
os.environ.setdefault("DEBUG", "True")

CSRF_403_DETAIL = "طلب غير موثوق (CSRF)"
NOT_FOUND_DETAIL = "المسار غير موجود"
DEFAULT_SECRET_KEY = "smartbot-fallback-dev-key-change-in-production"


# ── fixtures ────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
async def app_client():
    """Read-only module client against the real app (tables ensured first —
    this module may be the first to run in a fresh suite). Only GETs are
    issued through it: the CSRF layer would otherwise leave a csrf cookie on
    the shared jar that no test here wants."""
    from database import engine as db_engine
    from httpx import ASGITransport, AsyncClient
    from models import Base
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        yield ac


def _fake_sentry(monkeypatch) -> dict:
    """Hermetic sentry_sdk stand-in (same shape as test_v6_observability)."""
    fake = types.ModuleType("sentry_sdk")
    state: dict = {"init_kwargs": None, "messages": [], "exceptions": []}

    def _init(**kwargs):
        state["init_kwargs"] = kwargs

    @contextmanager
    def new_scope():
        yield types.SimpleNamespace(set_tag=lambda k, v: None)

    fake.init = _init
    fake.new_scope = new_scope
    fake.capture_message = lambda message, level=None: state["messages"].append((message, level))
    fake.capture_exception = lambda exc: state["exceptions"].append(exc)
    fake.get_client = lambda: types.SimpleNamespace(flush=lambda timeout=None: True)
    monkeypatch.setitem(sys.modules, "sentry_sdk", fake)
    return state


# ── §1 E3.1 — SPA path traversal ────────────────────────────────────────

@pytest.mark.parametrize("bad", [
    "../../config.py",          # classic dot-dot climb
    "..",                       # bare dot-dot
    "a//b",                     # empty segment (double slash)
    "/abs/path",                # leading slash — absolute filesystem path
    ".hidden",                  # dot-prefixed (hidden / traversal family)
    "a/../b",                   # interior dot-dot
    "..%2fconfig.py",           # encoded-slash form surviving client normalization
])
async def test_spa_catch_all_rejects_traversal(bad):
    """Every traversal-shaped path param answers the Arabic {detail} 404 JSON
    — never the filesystem walk toward STATIC_DIR/path/index.html."""
    from app.spa import spa_catch_all

    resp = await spa_catch_all(bad, None)  # request unused on non-api paths
    assert resp.status_code == 404, bad
    assert json.loads(resp.body.decode()) == {"detail": NOT_FOUND_DETAIL}


async def test_spa_legitimate_paths_unchanged():
    """Defense must be invisible for real SPA routes: plain segments (no
    leading/dot forms, no empty segments) still serve HTML 200."""
    from app.spa import spa_catch_all

    for good in ("pricing", "dashboard/settings", "login"):
        resp = await spa_catch_all(good, None)  # request unused on non-api paths
        assert resp.status_code == 200, good
        assert resp.headers["content-type"].startswith("text/html")


async def test_spa_traversal_http(app_client):
    """HTTP-level: %2f-encoded dot-dot climbs (the --path-as-is class that
    survives httpx path normalization) reach the app decoded and are refused
    with 404 JSON, not file content."""
    for bad in ("/..%2f..%2fconfig.py", "/..%2f..%2f..%2fetc%2fpasswd"):
        r = await app_client.get(bad)
        assert r.status_code == 404, bad
        assert r.json()["detail"] == NOT_FOUND_DETAIL


# ── §2 E3.2 — request_id binding ────────────────────────────────────────

async def test_request_id_bound_to_state_and_echoed():
    """The middleware must WRITE request.state.request_id (downstream: 500
    traceback, Sentry tags, Telegram alerts) and echo the same value in the
    X-Request-Id response header."""
    from app.middleware import request_logging_middleware
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse
    from httpx import ASGITransport, AsyncClient

    mini = FastAPI()
    mini.middleware("http")(request_logging_middleware)

    @mini.get("/rid")
    async def rid(request: Request):
        return JSONResponse({"rid": getattr(request.state, "request_id", None)})

    async with AsyncClient(transport=ASGITransport(app=mini), base_url="http://t") as ac:
        r = await ac.get("/rid")
    body = r.json()
    assert body["rid"], "request.state.request_id must be set by the middleware"
    assert r.headers["X-Request-Id"] == body["rid"]
    assert re.fullmatch(r"[0-9a-f]{8}", body["rid"])


async def test_request_id_header_on_real_app(app_client):
    r = await app_client.get("/api/plans")
    assert r.status_code == 200
    assert re.fullmatch(r"[0-9a-f]{8}", r.headers.get("X-Request-Id", ""))


async def test_500_traceback_carries_rid(caplog, monkeypatch):
    """app/errors.py: the 500 traceback line must contain rid=<state value>
    so one grep for a user-reported id hits the traceback too."""
    import _observability as obs
    from app.errors import global_500_handler

    async def _no_alert(request, exc):  # the alert bridge is v6's territory
        return None

    monkeypatch.setattr(obs, "report_critical", _no_alert)

    class _URL:
        path = "/api/x"

    class _State:
        request_id = "rid4242"

    class _Req:
        method = "POST"
        url = _URL()
        state = _State()

    # Raised inside an active except-block so traceback.format_exc() has a
    # real traceback to render (same context the 500 handler runs in).
    try:
        raise RuntimeError("boom-rid-test")
    except RuntimeError as exc:
        with caplog.at_level(logging.ERROR, logger="fb-api"):
            resp = await global_500_handler(_Req(), exc)
    assert resp.status_code == 500
    assert "rid=rid4242" in caplog.text
    assert "Traceback" in caplog.text
    assert "boom-rid-test" in caplog.text  # the exception itself is in the line


# ── §3 E3.3 — CSRF double-submit ────────────────────────────────────────

def _csrf_set_cookies(resp) -> list[str]:
    return [h for h in resp.headers.get_list("set-cookie") if h.startswith("csrf_token=")]


async def test_csrf_double_submit_end_to_end(v10_seed):
    """Full browser-shaped flow on a fresh client + fresh in-memory DB:
    no-cookie mutation passes (additive-safe) → GET issues the cookie →
    mutation without the header 403s → with the matching header passes →
    issuance is idempotent once the cookie exists."""
    ac = v10_seed.world.client
    uname, _tid, _uid = await v10_seed.tenant_user()
    await v10_seed.login(uname)
    ticket = {"subject": "csrf-test", "message": "رسالة كافية للاختبار الحقيقي", "email": ""}

    # 1) No csrf cookie yet → layer inactive, request reaches the route.
    r1 = await ac.post("/api/support/ticket", json=ticket)
    assert r1.status_code == 200, r1.text

    # 2) Safe-method non-exempt /api/* GET issues the double-submit cookie.
    r2 = await ac.get("/api/plans")
    assert r2.status_code == 200
    issued = _csrf_set_cookies(r2)
    assert issued, "safe-method /api/* GET must issue csrf_token"
    attrs = [seg.strip().lower() for seg in issued[0].split(";")]
    assert "samesite=strict" in attrs
    assert "httponly" not in attrs, "cookie must stay JS-readable for apiFetch"
    assert "path=/" in attrs
    assert "secure" not in attrs  # DEBUG=True in the hermetic env
    token = ac.cookies.get("csrf_token")
    assert token

    # 3) Cookie present + no header (or a wrong header) → 403 Arabic JSON.
    # (v12 coordinator: the explicit EMPTY header opts this request out of
    # tests/conftest.py's auto-CSRF compat hook, which otherwise mirrors the
    # real frontend by attaching the jar's token to every mutation.)
    r3 = await ac.post("/api/support/ticket", json=ticket, headers={"X-CSRF-Token": ""})
    assert r3.status_code == 403
    assert r3.json()["detail"] == CSRF_403_DETAIL
    # Ordering proof: the early 403 still passes back through the OUTER
    # middlewares (X-Request-Id from request_logging, CSP from the outermost
    # security_headers layer) — registration order untouched by the change.
    assert r3.headers.get("X-Request-Id")
    assert "content-security-policy" in r3.headers
    r3b = await ac.post("/api/support/ticket", json=ticket,
                        headers={"X-CSRF-Token": "definitely-wrong"})
    assert r3b.status_code == 403
    assert r3b.json()["detail"] == CSRF_403_DETAIL

    # 4) Matching header → passes through to the route.
    r4 = await ac.post("/api/support/ticket", json=ticket,
                       headers={"X-CSRF-Token": token})
    assert r4.status_code == 200, r4.text

    # 5) Idempotent: cookie already in the jar → no second Set-Cookie.
    r5 = await ac.get("/api/plans")
    assert _csrf_set_cookies(r5) == []


async def test_csrf_exempt_prefixes_and_non_api_paths(v10_seed):
    """Exempt /api/* prefixes: no cookie issuance on safe methods, no token
    demand on mutations (pre-session + machine-to-machine surfaces)."""
    ac = v10_seed.world.client

    # Liveness probe (exempt prefix /api/health): never issues the cookie.
    r = await ac.get("/api/health")
    assert r.status_code == 200
    assert _csrf_set_cookies(r) == []

    # /api/login is exempt: a GET (no such route) answers 405-with-Allow
    # since v12-E2.1 (known POST-only path, wrong method → uniform Arabic
    # 405 contract) — WITHOUT issuing the csrf cookie either way.
    r2 = await ac.get("/api/login")
    assert r2.status_code == 405
    assert r2.headers.get("allow") == "POST"
    assert _csrf_set_cookies(r2) == []

    # Login POST itself needs no csrf token (pre-session).
    uname, _tid, _uid = await v10_seed.tenant_user()
    r3 = await ac.post("/api/login", json={"username": uname, "password": "pass123456"})
    assert r3.status_code == 200, r3.text

    # Non-API paths never participate in the layer at all.
    r4 = await ac.get("/")
    assert r4.status_code == 200
    assert _csrf_set_cookies(r4) == []


async def test_csrf_bearer_authorization_skips_validation(v10_seed):
    """Authorization-bearing requests (Bearer cron secret) skip the
    double-submit check EVEN when a csrf cookie is present."""
    ac = v10_seed.world.client
    uname, _tid, _uid = await v10_seed.tenant_user()
    await v10_seed.login(uname)
    await ac.get("/api/plans")  # csrf cookie now in the jar
    assert ac.cookies.get("csrf_token")

    ticket = {"subject": "bearer-skip", "message": "رسالة كافية للاختبار الحقيقي", "email": ""}
    r = await ac.post("/api/support/ticket", json=ticket,
                      headers={"Authorization": "Bearer test-cron-secret"})
    assert r.status_code == 200, r.text  # reached the route — not the CSRF 403


async def test_cors_preflight_accepts_csrf_header(app_client):
    """Cross-origin SPA deployments must be able to preflight X-CSRF-Token.
    The production bot-domain flow is same-origin (vercel.json rewrite proxy),
    but a direct cross-origin deployment (e.g. local dev without
    LOCAL_API_PROXY) would preflight-reject the double-submit header and
    silently break every mutation."""
    r = await app_client.options(
        "/api/support/ticket",
        headers={
            "Origin": "https://bot.smart-link.ly",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type, x-csrf-token",
        },
    )
    assert r.status_code == 200
    allowed = r.headers.get("access-control-allow-headers", "")
    assert "x-csrf-token" in allowed.lower()


# ── §4 E3.4 — CSP narrowing ─────────────────────────────────────────────

async def test_csp_narrowed(app_client):
    r = await app_client.get("/")
    csp = r.headers["content-security-policy"]
    # No Facebook SDK hosts anywhere (SPA loads no FB scripts — D3 verified).
    assert "facebook" not in csp.lower()
    assert "script-src 'self' 'unsafe-inline';" in csp
    # connect-src narrowed to the hosts actually used.
    assert "connect-src 'self' https://api.smart-link.ly https://*.ingest.de.sentry.io wss:;" in csp
    # img-src keeps https: — FB CDN avatars still load via <img>.
    assert "img-src 'self' data: blob: https:;" in csp
    # 'unsafe-inline' retained (documented Next.js inline bootstrap need).
    assert "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" in csp
    assert "frame-ancestors 'none'" in csp
    assert "base-uri 'self'" in csp


# ── §5 E3.5 — background error capture ──────────────────────────────────

async def test_spawn_surfaces_task_exception(caplog, monkeypatch):
    """spawn() done-callback: a raised background task logs its exception
    (with traceback) AND reaches the Sentry capture seam."""
    import _observability as obs
    from _async import spawn

    captured: list[BaseException] = []
    monkeypatch.setattr(obs, "capture_exception", lambda exc, **kw: captured.append(exc))

    async def _boom():
        raise RuntimeError("bg-task-exploded")

    with caplog.at_level(logging.ERROR, logger="fb-api"):
        t = spawn(_boom(), name="boom-task")
        done, _pending = await asyncio.wait({t}, timeout=2)
        assert t in done
    assert "bg-task-exploded" in caplog.text
    assert "boom-task" in caplog.text
    assert captured and "bg-task-exploded" in str(captured[0])


async def test_spawn_silent_on_cancellation_and_success(caplog):
    """Deliberate cancellation and clean completion are NOT failures."""
    from _async import spawn

    async def _ok():
        return 42

    async def _sleep():
        await asyncio.sleep(30)

    with caplog.at_level(logging.ERROR, logger="fb-api"):
        t_ok = spawn(_ok(), name="ok-task")
        assert await t_ok == 42
        t_cancel = spawn(_sleep(), name="cancel-task")
        t_cancel.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await t_cancel
    assert "ok-task" not in caplog.text
    assert "cancel-task" not in caplog.text


async def test_lifespan_reraises_security_config_error(monkeypatch):
    """The default-SECRET_KEY-in-production guard must NOT be swallowed by
    the lifespan's app-continues handler — it is captured AND re-raised."""
    import _observability as obs
    import app.startup as startup
    from fastapi import FastAPI

    monkeypatch.setattr(obs, "init_sentry", lambda: False)
    captured: list[BaseException] = []
    monkeypatch.setattr(obs, "capture_exception", lambda exc, **kw: captured.append(exc))
    monkeypatch.setattr(startup.settings, "SECRET_KEY", DEFAULT_SECRET_KEY)
    monkeypatch.setattr(startup.settings, "DEBUG", False)

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        async with startup.lifespan(FastAPI()):
            pass
    assert captured and "SECRET_KEY" in str(captured[0])


async def test_lifespan_continues_and_captures_other_startup_errors(monkeypatch):
    """Non-security startup failures keep the degraded app-continues
    behavior, but now reach the Sentry capture seam (was: local log only)."""
    import _observability as obs
    import app.startup as startup
    from fastapi import FastAPI

    monkeypatch.setattr(obs, "init_sentry", lambda: False)
    captured: list[BaseException] = []
    monkeypatch.setattr(obs, "capture_exception", lambda exc, **kw: captured.append(exc))

    class _BrokenEngine:
        def connect(self):
            raise RuntimeError("db-down-at-boot")

    monkeypatch.setattr(startup, "engine", _BrokenEngine())
    monkeypatch.setattr(startup, "_IS_VERCEL", True)  # skip bot/schedulers/shutdown
    monkeypatch.setattr(startup.settings, "SECRET_KEY", "real-secret-for-test")

    async with startup.lifespan(FastAPI()):  # must NOT raise
        pass
    assert captured and "db-down-at-boot" in str(captured[0])


async def test_ws_broadcast_to_tenant_isolation():
    """Primitive the E3.5(e) bridge relies on: broadcast_to_tenant touches
    only that tenant's connections (per-tenant bot_health counts)."""
    import ws_manager as wm

    class _FakeWS:
        def __init__(self):
            self.sent: list[str] = []

        async def send_text(self, msg: str):
            self.sent.append(msg)

    c1 = wm.WSConnection(_FakeWS(), tenant_id=1, user_id=1)
    c2 = wm.WSConnection(_FakeWS(), tenant_id=2, user_id=2)
    wm.ws_manager._connections = [c1, c2]
    try:
        await wm.ws_manager.broadcast_to_tenant(1, "bot_health", {"replies_last_hour": 5})
        assert len(c1.websocket.sent) == 1
        assert c2.websocket.sent == []
        payload = json.loads(c1.websocket.sent[0])
        assert payload["event"] == "bot_health"
        assert payload["data"]["replies_last_hour"] == 5
    finally:
        wm.ws_manager._connections = []


async def test_event_bus_tenant_scoped_emit_reaches_only_that_tenant():
    """Primitive the E3.5(e) health push relies on: a tenant-scoped
    bot_health emit is delivered only to that tenant's subscribers (SSE
    isolation) — other tenants never see the count."""
    from event_bus import event_bus

    got: dict[str, list] = {"t1": [], "t2": []}

    async def h1(data, tenant_id=None):
        got["t1"].append(data)

    async def h2(data, tenant_id=None):
        got["t2"].append(data)

    event_bus.subscribe("bot_health", h1, tenant_id=1)
    event_bus.subscribe("bot_health", h2, tenant_id=2)
    try:
        await event_bus.emit("bot_health", {"replies_last_hour": 7}, tenant_id=1)
        assert got["t1"] == [{"replies_last_hour": 7}]
        assert got["t2"] == []
    finally:
        event_bus.unsubscribe("bot_health", h1, tenant_id=1)
        event_bus.unsubscribe("bot_health", h2, tenant_id=2)


# ── §6 E3.7 — Sentry PII scrubber ───────────────────────────────────────

def test_scrub_pii_text_emails_and_phones():
    from _observability import scrub_pii_text

    out = scrub_pii_text("login failed for someone@example.com")
    assert "someone@example.com" not in out
    assert "[REDACTED-EMAIL]" in out

    out = scrub_pii_text("call +218 91 234 5678 now")
    assert "234" not in out
    assert "[REDACTED-PHONE]" in out

    out = scrub_pii_text("الرقم 0912345678 غير متاح")
    assert "0912345678" not in out

    # conservative: short numeric ids / counters survive
    out = scrub_pii_text("payment request #4589 failed after 3 retries")
    assert "4589" in out and "retries" in out


def test_scrub_event_logentry_and_exception_values():
    from _observability import _scrub_event

    event = {
        "logentry": {"message": "user a@b.com hit an error"},
        "exception": {"values": [
            {"type": "RuntimeError", "value": "phone 0912345678 unreachable"},
        ]},
        "extra": {"untouched": "keep x@y.z"},  # extra is deliberately untouched
    }
    out = _scrub_event(event)
    assert "a@b.com" not in out["logentry"]["message"]
    assert "0912345678" not in out["exception"]["values"][0]["value"]
    assert out["extra"] == {"untouched": "keep x@y.z"}


def test_scrub_event_never_raises_on_malformed_events():
    from _observability import _scrub_event

    weird = {"exception": "not-a-dict", "logentry": 42}
    assert _scrub_event(weird) is weird
    assert _scrub_event({}) == {}


async def test_init_sentry_wires_before_send(monkeypatch):
    import _observability as obs

    state = _fake_sentry(monkeypatch)
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.delenv("SENTRY_BOOT_CANARY", raising=False)
    assert obs.init_sentry() is True
    hook = state["init_kwargs"]["before_send"]
    assert hook is obs._before_send
    event = {
        "logentry": {"message": "oops a@b.com"},
        "exception": {"values": [{"value": "tel 0912345678"}]},
    }
    scrubbed = hook(event, None)
    assert "a@b.com" not in scrubbed["logentry"]["message"]
    assert "0912345678" not in scrubbed["exception"]["values"][0]["value"]
    obs._sentry_enabled = False  # hygiene: never leak enabled state
