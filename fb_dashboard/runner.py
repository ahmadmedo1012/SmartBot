from __future__ import annotations

"""SmartBot FastAPI application — composition root (v11-A1 decomposition).

This file was a 1298-line monolith mixing lifespan+seeding, middleware,
exception handlers, the Telegram webhook, the bot loop, SPA serving,
WebSocket/SSE, Facebook webhook processing and Vercel stubs. It is now the
thin composition root: every concern lives in the ``app`` package —

  app/startup.py    lifespan + DB seeding          app/telegram.py  Telegram webhook + bot loop
  app/middleware.py the 6 HTTP middlewares          app/webhooks.py  Facebook webhook processing
  app/errors.py     422/500 exception handlers      app/spa.py       SPA serving + catch-alls
  app/ws.py         WebSocket + SSE endpoints       app/stubs.py     Vercel Analytics stubs

Bodies were moved VERBATIM; only this registration layer is authored. ORDER
IS BEHAVIOR and is preserved exactly from the monolith:

  * middleware registration order (Starlette inserts each add_middleware at
    the FRONT of the stack — the last-registered one is the outermost layer,
    see the security_headers note below);
  * route registration order — all routers, mounts and concrete routes are
    registered BEFORE the two /{path:path} catch-alls at the bottom.

Compatibility surface kept stable (external importers):
  ``runner.app``                      — api/index.py (Vercel), uvicorn entry, tests
  ``runner._bot_task``                — canonical bot-task handle (routers/bot.py,
                                        dashboard_stats.py, health_alerts_routes.py)
  ``runner._run_bot_loop``            — routers/bot.py start/stop controls
  ``runner.STATIC_DIR``               — routers/ai.py
  ``runner.WEBHOOK_VERIFY_TOKEN`` / ``runner.WEBHOOK_APP_SECRET``
                                      — canonical env snapshots (tests monkeypatch
                                        WEBHOOK_APP_SECRET; app/webhooks.py reads
                                        them dynamically via deferred import)
  ``runner._TG_SECRET`` / ``runner._ALLOW_UNVERIFIED`` / ``runner.answer_callback`` /
  ``runner.edit_message`` / ``runner.edit_keyboard``
                                      — canonical Telegram-webhook state (tests
                                        monkeypatch these; app/telegram.py reads
                                        them dynamically via deferred import)
  ``runner.global_500_handler``, ``runner.sse_endpoint``,
  ``runner._seed_subscription_plans`` — direct-call tests
"""

import asyncio
import logging
import os
from pathlib import Path

from _utils import app_version
from app.errors import global_500_handler, validation_handler
from app.middleware import (
    csrf_origin_check,
    dedup_middleware,
    rate_limit_middleware,
    request_logging_middleware,
    security_headers,
    static_cache_middleware,
)
from app.piggyback import piggyback_beat_middleware  # v21 (T4-a): warm-traffic automation beat
from app.spa import dashboard_page, spa_catch_all, unknown_method_catch_all
from app.startup import (
    _seed_subscription_plans,  # noqa: F401 — re-export (tests import it from runner)
    lifespan,
)
from app.stubs import _vercel_analytics_stub
from app.telegram import (
    _run_bot_loop,  # noqa: F401 — re-export (routers/bot.py imports it from runner)
    telegram_webhook,
)
from app.webhooks import webhook_receive, webhook_verify
from app.ws import sse_endpoint, websocket_endpoint
from config import settings
from database import engine
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from logs_api import logs_router
from routers import admin_routes as admin_router
from routers import ai as ai_router
from routers import alerts_routes as alerts_router
from routers import analytics as analytics_router
from routers import auth as auth_router
from routers import bot as bot_router
from routers import brand_routes as brand_router
from routers import broadcasts as broadcasts_router
from routers import calendar_routes as calendar_router
from routers import commerce_routes as commerce_router
from routers import crm_routes as crm_router
from routers import dashboard_stats as dashboard_router
from routers import diagnostics as diagnostics_router
from routers import facebook_routes as facebook_router
from routers import flows as flows_router
from routers import health_alerts_routes as health_alerts_router
from routers import inbox as inbox_router
from routers import marketing as marketing_router
from routers import notifications as notifications_router
from routers import offers_routes as offers_router
from routers import onboarding as onboarding_router
from routers import payments as payments_router
from routers import plans_config as plans_router
from routers import publisher_routes as publisher_router
from routers import replies as replies_router
from routers import reports_routes as reports_router
from routers import rules as rules_router
from routers import scheduled_posts_routes as scheduled_router
from routers import sequences as sequences_router
from routers import subscribers_tags_routes as subscribers_router
from routers import support as support_router
from routers import team_routes as team_router
from routers import telegram_config as telegram_router
from routers import templates_routes as templates_router
from routers import users as users_router
from routers import webhooks as webhooks_router
from routers import widgets_routes as widgets_router
from telegram_bot import (  # noqa: F401 — canonical bindings; app/telegram.py dispatches through these
    answer_callback,
    edit_keyboard,
    edit_message,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fb-api")

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Canonical background bot-task handle. app/startup.py's lifespan writes it via
# a deferred `import runner` (routers/bot.py, dashboard_stats.py and
# health_alerts_routes.py read/write it here — the single source of truth
# stays the runner module, exactly as in the monolith).
_bot_task: asyncio.Task | None = None

# Canonical webhook env snapshots — app/webhooks.py reads these DYNAMICALLY
# (deferred import) so the tests' monkeypatch contract keeps working.
WEBHOOK_VERIFY_TOKEN = os.getenv("FB_WEBHOOK_VERIFY_TOKEN", "")
WEBHOOK_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")

# Canonical Telegram-webhook env snapshots — app/telegram.py reads these
# DYNAMICALLY (deferred import) for the same monkeypatch-contract reason.
_TG_SECRET = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
_ALLOW_UNVERIFIED = os.getenv("TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED", "") == "true"


app = FastAPI(title="FB Dashboard", lifespan=lifespan)


# ── Liveness/readiness probes (no DB, no auth) — for Vercel cold-start checks ──
@app.get("/api/health", include_in_schema=False)
async def api_health():
    """Liveness probe — returns 200 even if DB is down. Used by uptime monitors
    and Vercel warmup pings. Does NOT touch the database to avoid cascading
    failures when Neon is slow or restarting.
    """
    return {
        "ok": True,
        "service": "smartbot-api",
        "version": app_version(),
        "env": "production" if not settings.DEBUG else "development",
        "ts": __import__('datetime').datetime.utcnow().isoformat() + "Z",
    }


@app.get("/api/health/ready", include_in_schema=False)
async def api_health_ready():
    """Readiness probe — checks DB connectivity + a pivotal table.

    v5 §7: also reports measured latency. Only SAFE fields are exposed
    (no internals, no error text) — external monitors can alert on
    `ok`, `database`, and `latency_ms` thresholds.
    200 if ready, 503 otherwise.
    """
    import time as _t
    start = _t.perf_counter()
    try:
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
            # pivotal table: proves the schema actually exists (not just
            # that the TCP connection opened) — catches reconcile drift
            await conn.execute(__import__("sqlalchemy").text("SELECT 1 FROM tenants LIMIT 1"))
        latency_ms = (_t.perf_counter() - start) * 1000
        return {"ok": True, "database": "ok", "latency_ms": round(latency_ms), "version": app_version()}
    except Exception as e:
        log.error("Readiness probe failed: %s", e, exc_info=True)
        # v12-E3.7 — DB outages must reach Sentry too: the 503 body is
        # deliberately error-free (E2 contract), so the dashboard/GlitchTip
        # would otherwise never see WHY readiness failed. (The /healthz
        # router-local capture in plans_config.py is E2's file — handed off.)
        try:
            from _observability import capture_exception

            capture_exception(e)
        except Exception:
            pass
        return JSONResponse(
            status_code=503,
            content={"ok": False, "database": "unreachable"},
        )


# ponytail: friendly 422 → readable Arabic message (app/errors.py)
app.add_exception_handler(RequestValidationError, validation_handler)
# ponytail: catch-all 500 — log server-side, generic Arabic message (app/errors.py)
app.add_exception_handler(Exception, global_500_handler)

app.add_middleware(GZipMiddleware, minimum_size=1000)
# CORS: exact production origins only. Localhost dev origins ship ONLY in DEBUG
# (previously they were sent to production with allow-credentials).
_cors_origins = ["https://bot.smart-link.ly", "https://api.smart-link.ly"]
if getattr(settings, "DEBUG", False):
    _cors_origins += ["http://localhost:5173", "http://localhost:8000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    # v12-E3.3: X-CSRF-Token allowed for cross-origin SPA deployments (the
    # production bot-domain flow is same-origin via the vercel.json rewrite
    # proxy, but direct cross-origin (e.g. dev without LOCAL_API_PROXY) would
    # preflight-reject the double-submit header and silently break mutations).
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token",
                   "X-Telegram-Bot-Api-Secret-Token", "X-Hub-Signature-256", "X-Vercel-Cron-Shard"],
)
app.middleware("http")(dedup_middleware)
app.middleware("http")(rate_limit_middleware)
app.middleware("http")(csrf_origin_check)
app.middleware("http")(request_logging_middleware)

# v21 (T4-a) — opportunistic automation piggyback on authenticated warm
# traffic: Vercel-only, throttled (one beat per window per instance),
# non-blocking (spawned BEFORE the endpoint work, never awaited by the
# response) — see app/piggyback.py. Registered AFTER request_logging so it
# sits OUTSIDE csrf/rate_limit (an authenticated 403/429 request still
# proves a warm instance) and INSIDE static_cache/security_headers (those
# never short-circuit, so every response keeps the full header/cache
# treatment).
app.middleware("http")(piggyback_beat_middleware)


# ⚠️ Register routers — ALL routes MUST be registered here, BEFORE the SPA catch-all at the bottom.
# Adding routes after that line will be shadowed by the catch-all returning 404.
app.include_router(logs_router)
app.include_router(auth_router.router)
app.include_router(payments_router.router)
app.include_router(users_router.router)
app.include_router(rules_router.router)
app.include_router(replies_router.router)
app.include_router(webhooks_router.router)
app.include_router(analytics_router.router)
app.include_router(inbox_router.router)
app.include_router(bot_router.router)
app.include_router(diagnostics_router.router)
app.include_router(ai_router.router)
app.include_router(flows_router.router)
app.include_router(sequences_router.router)
app.include_router(broadcasts_router.router)
app.include_router(admin_router.router)
app.include_router(alerts_router.router)
app.include_router(brand_router.router)
app.include_router(calendar_router.router)
app.include_router(telegram_router.router)
app.include_router(commerce_router.router)
app.include_router(crm_router.router)
app.include_router(dashboard_router.router)
app.include_router(facebook_router.router)
app.include_router(health_alerts_router.router)
app.include_router(offers_router.router)
app.include_router(plans_router.router)
app.include_router(publisher_router.router)
app.include_router(reports_router.router)
app.include_router(scheduled_router.router)
app.include_router(subscribers_router.router)
app.include_router(team_router.router)
app.include_router(templates_router.router)
app.include_router(widgets_router.router)
app.include_router(onboarding_router.router)
app.include_router(notifications_router.router)
app.include_router(support_router.router)
app.include_router(marketing_router.router)


# ── Vercel Analytics stubs (single-server mode) — app/stubs.py ──────────────
# (decorator bottom-up order preserved: speed-insights registered first)
app.add_api_route("/_vercel/speed-insights/script.js", _vercel_analytics_stub,
                  methods=["GET"], include_in_schema=False)
app.add_api_route("/_vercel/insights/script.js", _vercel_analytics_stub,
                  methods=["GET"], include_in_schema=False)

if STATIC_DIR.exists():
    try:
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    except Exception as e:
        log.error(f"StaticFiles mount failed: {e}", exc_info=True)
# Also serve Next.js static export at /_next/ — the export places files at
# out/_next/static/ which ends up at STATIC_DIR/_next/static/ after the build command.
_NEXT_STATIC = STATIC_DIR / "_next"
if _NEXT_STATIC.exists():
    try:
        app.mount("/_next", StaticFiles(directory=str(_NEXT_STATIC)), name="next_static")
    except Exception as e:
        log.error(f"Next.js static mount failed: {e}", exc_info=True)
# Also serve /fonts/* — Next.js may reference fonts at /fonts/ or /static/fonts/
_FONTS_DIR = STATIC_DIR / "fonts"
if _FONTS_DIR.exists():
    try:
        app.mount("/fonts", StaticFiles(directory=str(_FONTS_DIR)), name="fonts")
    except Exception as e:
        log.error(f"Fonts mount failed: {e}", exc_info=True)
# Root-level public assets (brand icon / favicon / PWA manifest / OG image /
# sitemap) — the frontend references them at the root path (works on Vercel
# via public/ + file-based metadata routes); single-server mode serves the
# same files from STATIC_DIR so both deployments agree.
from fastapi.responses import FileResponse as _FileResponse

for _root_asset in ("brand-icon.png", "favicon.png", "robots.txt", "manifest.json",
                    "manifest.webmanifest", "opengraph-image.png", "og-image.png",
                    "sitemap.xml"):
    _asset_path = STATIC_DIR / _root_asset
    if _asset_path.is_file():
        async def _serve_root_asset(p: str = str(_asset_path)):
            return _FileResponse(p)
        app.add_api_route(f"/{_root_asset}", _serve_root_asset, methods=["GET"], name=f"root-{_root_asset}")
# ponytail: Vercel includeFiles bundles fb_dashboard/static/** but the Python
# function may see files at a different path. Log diagnostic on startup.
log.info(f"STATIC_DIR={STATIC_DIR} exists={STATIC_DIR.exists()}")
_assets = sorted(STATIC_DIR.glob("assets/index-*.js")) if STATIC_DIR.exists() else []
log.info(f"Static index.js files: {[a.name for a in _assets]}")
if not _assets and STATIC_DIR.exists():
    log.warning(f"STATIC_DIR contents: {list(STATIC_DIR.iterdir())[:10]}")
# Mobile app - serve from mobile/dist/
_app_mobile_dir = Path(__file__).resolve().parent.parent / "mobile" / "dist"
if _app_mobile_dir.is_dir():
    try:
        _mobile_app = StaticFiles(directory=str(_app_mobile_dir), html=True)
        app.mount("/app", _mobile_app, name="mobile")
    except Exception:
        pass
    # HEAD handler for StaticFiles 405
    @app.api_route("/app", methods=["HEAD"])
    @app.api_route("/app/{path:path}", methods=["HEAD"])
    async def mobile_head(path: str = ""):
        return HTMLResponse()


# ── Telegram Payment Webhook — app/telegram.py ─────────────────────────────
app.add_api_route("/api/telegram/webhook", telegram_webhook, methods=["POST"])


# ── SPA dashboard entry — app/spa.py ────────────────────────────────────────
app.add_api_route("/", dashboard_page, methods=["GET"], response_class=HTMLResponse)


# ── Static file & API caching headers — app/middleware.py ──────────────────
# (v11-A1: includes the /fonts/ cache + .woff2 MIME repair fix)
app.middleware("http")(static_cache_middleware)

# v8-A7: security_headers is registered LAST among the HTTP middlewares.
# Starlette's `@app.middleware("http")` inserts at the FRONT of the user
# middleware stack, so the LAST registered decorator is the OUTERMOST layer —
# every response, including early 403s from csrf_origin_check and 429s from
# rate_limit_middleware, passes back through here and receives the full
# security header set (previously those early returns bypassed it).
app.middleware("http")(security_headers)


# ── WebSocket Real-Time Updates — app/ws.py ─────────────────────────────────
app.add_api_websocket_route("/ws", websocket_endpoint)


# ── Server-Sent Events — app/ws.py ─────────────────────────────────────────
app.add_api_route("/api/events", sse_endpoint, methods=["GET"])


# ── Facebook webhook — app/webhooks.py ──────────────────────────────────────
app.add_api_route("/webhook", webhook_verify, methods=["GET"])
app.add_api_route("/webhook", webhook_receive, methods=["POST"])


# ── SPA catch-all: serve Next.js index.html for unmatched browser routes ────
# (app/spa.py — registered LAST, together with the non-GET catch-all below)
app.add_api_route("/{path:path}", spa_catch_all, methods=["GET"],
                  response_class=HTMLResponse, include_in_schema=False)

app.add_api_route(
    "/{path:path}",
    unknown_method_catch_all,
    methods=["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
