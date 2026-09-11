from __future__ import annotations

"""HTTP middlewares extracted from runner.py (v11-A1 decomposition).

Bodies are verbatim moves; registration ORDER lives in runner.py and is
behavior (Starlette's ``add_middleware`` inserts at the FRONT of the stack —
the last-registered middleware is the outermost layer, so every response
passes back through it).
"""

import hmac
import logging
import os
import re
import secrets
from urllib.parse import urlparse

from config import settings
from fastapi import Request
from fastapi.responses import JSONResponse

log = logging.getLogger("fb-api")

# v11: per-IP mutating-request limit — env-tunable ops knob (defaults are the
# old hardcodes: 30 requests / 60s). The hermetic test suite shares ONE
# client IP across the whole session, so the root conftest raises the cap:
# the suite must never 429 itself (this exact nondeterminism fired live in
# v11 when test files' combined POST volume crossed 30 mid-module).
_MUTATE_MAX = int(os.getenv("SMARTBOT_MUTATE_RATE_LIMIT", "30"))
_MUTATE_WINDOW = int(os.getenv("SMARTBOT_MUTATE_RATE_LIMIT_WINDOW", "60"))

# ── Request "deduplication" middleware — v15-E7 (D8-B7): HONEST REMOVAL ──
# D8-B7 live finding: this middleware SERIALIZED identical concurrent GETs
# (lock held across call_next) while caching NOTHING — the second caller
# re-executed the endpoint after waiting (the old comment admitted exactly
# that). Net effect: 10 concurrent first visitors on /api/plans = 10 serial
# cold executions — the OPPOSITE of the "dedup" the name promises. The
# singleflight + cache the name implies already exists where it matters:
# APICache.cached() wraps the three public endpoints (/api/plans,
# /api/config, /api/public/stats) with a per-key lock AND a real TTL cache,
# including for concurrent misses (second waiter re-reads the fresh entry).
#
# A middleware-level response cache was considered and REJECTED on purpose:
# its key (method + path + query) carries NO user identity, so caching
# authenticated responses there would serve tenant A's dashboard to tenant B
# — an isolation regression far worse than the latency it would fix.
# Restricting the middleware to the cache-decorated paths was also rejected:
# APICache already singleflights those, so the extra lock layer is dead
# weight. The function below stays as a documented pass-through so
# runner.py's registration (app.middleware("http")(dedup_middleware)) keeps
# working without touching that file; the lock bookkeeping that lived here
# (MAX_LOCKS/LOCK_TTL/_dedup_locks/_dedup_ops/_maybe_evict) is retired with
# the behavior it existed to serve.
async def dedup_middleware(request: Request, call_next):
    return await call_next(request)


async def rate_limit_middleware(request: Request, call_next):
    """Rate-limit mutating POST/PUT/DELETE endpoints (excludes login/register which have per-IP limits, webhooks).

    Graceful degradation: if the DB is unavailable (e.g. Neon cold-start), the request
    is allowed through so that health probes and critical auth flows are never blocked
    by a failing rate-limiter.
    """
    if request.method in ("POST", "PUT", "DELETE"):
        path = request.url.path
        # v8-A6: exact path-prefix match — the old substring `p in path`
        # also exempted paths like /api/x/telegram-leak or /api/register-page.
        if not any(path.startswith(p) for p in ("/api/login", "/api/register", "/api/auth/token", "/webhook", "/api/telegram")):
            # v24-C4: honest client IP — request.client.host behind the Vercel
            # proxy is the PROXY address (all users in ONE bucket → cross-user
            # 429 lockouts). client_ip() honors X-Forwarded-For only when a
            # proxy is known to be in front (VERCEL / SMARTBOT_TRUST_XFF),
            # validating entries and taking the left-most public IP.
            from _rate_limit import client_ip
            ip = client_ip(request)
            try:
                from _rate_limit import check_rate_limit
                from database import AsyncSessionLocal
                async with AsyncSessionLocal() as db:
                    if not await check_rate_limit(
                        db, f"mutate:{ip}",
                        max_attempts=_MUTATE_MAX, window_seconds=_MUTATE_WINDOW,
                    ):
                        return JSONResponse(status_code=429, content={"detail": "محاولات كثيرة جداً — حاول بعد 60 ثانية"})
            except Exception:
                # Graceful degradation: allow request if rate-limit DB check fails
                # (e.g. Neon cold-start, connection refused, SSL error)
                import logging
                logging.getLogger("fb-rate-limit").warning("Rate-limit check failed — allowing request through", exc_info=True)
    return await call_next(request)


# ── v15-E5 (D4-middleware): env-configurable Origin allowlist ────────────
# D4 §6 live finding: the two production hosts were frozen IN CODE while the
# frontend domain is env-driven (NEXT_PUBLIC_DOMAIN) — deploying the SPA on
# any new domain 403'd every POST («المصدر غير مصرح به») with no config path.
# ORIGIN_ALLOWLIST (comma-separated hosts, full origins also accepted) now
# tunes the list; the DEFAULT keeps exactly the two current production
# domains, so unset == today's behavior. Security is NOT weakened:
#  - matching stays EXACT-host (parsed, no substrings — the v12 exact-match
#    fix is untouched: bot.smart-link.ly.evil.com still 403s);
#  - an empty/unparsable value falls back to the safe default (never
#    allow-all);
#  - DEBUG still adds localhost/127.0.0.1.
_ORIGIN_ALLOWLIST_ENV = "ORIGIN_ALLOWLIST"
_DEFAULT_ORIGIN_HOSTS = ("bot.smart-link.ly", "api.smart-link.ly")
_origin_allowlist_cache: frozenset[str] | None = None


def _parse_origin_allowlist() -> frozenset[str]:
    """Resolve the CSRF Origin allowlist (cached; env is read once)."""
    global _origin_allowlist_cache
    if _origin_allowlist_cache is not None:
        return _origin_allowlist_cache
    raw = os.getenv(_ORIGIN_ALLOWLIST_ENV, "").strip()
    hosts: set[str] = set()
    if raw:
        for entry in raw.split(","):
            e = entry.strip()
            if not e:
                continue
            if "://" in e:  # tolerate full origins (https://x.ly/)
                e = urlparse(e).hostname or ""
            e = e.lower().rstrip(".")
            if e:
                hosts.add(e)
    allow = frozenset(hosts) if hosts else frozenset(_DEFAULT_ORIGIN_HOSTS)
    if getattr(settings, "DEBUG", False):
        allow = allow | {"localhost", "127.0.0.1"}
    _origin_allowlist_cache = allow
    return allow


# ── v12-E3.3: CSRF double-submit constants ──────────────────────────────
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"
# Machine-to-machine / pre-session surfaces: no cookie issuance, no token
# validation (the Origin allowlist above still guards the mutating ones).
CSRF_EXEMPT_PREFIXES = (
    "/api/login",     # pre-session — no csrf cookie could exist yet
    "/api/register",  # pre-session
    "/api/auth/token",  # pre-session (mobile Bearer login — same class as /api/login)
    "/api/telegram/",  # Telegram payment webhook (server-to-server)
    "/api/webhook/",   # Facebook webhooks (signature-verified server-to-server)
    "/api/cron/",      # CRON_SECRET Bearer-authed machine calls
    "/healthz",        # infra probe
    "/api/health",     # infra probe (liveness + readiness)
)


def _csrf_exempt(path: str) -> bool:
    """True when a path is outside the CSRF double-submit layer."""
    return path.startswith(CSRF_EXEMPT_PREFIXES)


async def csrf_origin_check(request: Request, call_next):
    """Validate Origin/Referer on state-changing requests to /api/*.

    SECURITY (2026-09-05): the old substring match (`"bot.smart-link.ly" in origin`)
    was bypassable with e.g. https://bot.smart-link.ly.evil.com. Now the origin
    host is parsed and compared EXACTLY against the allowlist.

    v12-E3.3 — CSRF double-submit layer (same middleware, same stack position,
    so ordering is untouched):
      * safe methods (GET/HEAD/OPTIONS) on non-exempt /api/* responses
        idempotently issue a ``csrf_token`` cookie (SameSite=Strict, NOT
        HttpOnly — the frontend's apiFetch must read it);
      * mutating methods on non-exempt /api/* must send X-CSRF-Token == the
        csrf cookie (constant-time compare) → 403 Arabic JSON otherwise.
    Additive-safe rollout: validation is only active once the request CARRIES
    a csrf cookie (a browser that never got one cannot be expected to send
    the header). Login/register are exempt (pre-session); machine-to-machine
    prefixes (/api/telegram/, /api/webhook/, /api/cron/, /healthz,
    /api/health) and any request bearing an Authorization header (Bearer
    cron secret) skip the layer entirely. Origin allowlisting above still
    applies to every mutating call regardless of exemptions.
    """
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.url.path.startswith("/api/"):
        # v15-E5 (D4-middleware): env-tunable exact-host allowlist (safe
        # default = the two production domains; see _parse_origin_allowlist).
        allowed_hosts = _parse_origin_allowlist()
        origin = request.headers.get("origin", "")
        referer = request.headers.get("referer", "")
        if origin:
            host = urlparse(origin).hostname or ""
            if host not in allowed_hosts:
                return JSONResponse(status_code=403, content={"detail": "المصدر غير مصرح به"})
        elif referer:
            host = urlparse(referer).hostname or ""
            if host and host not in allowed_hosts:
                return JSONResponse(status_code=403, content={"detail": "Invalid referer"})
        # v12-E3.3(b) — double-submit token check (see module docstring above)
        if not _csrf_exempt(request.url.path) and not request.headers.get("authorization", ""):
            cookie_token = request.cookies.get(CSRF_COOKIE)
            if cookie_token:
                header_token = request.headers.get(CSRF_HEADER, "")
                if not hmac.compare_digest(header_token, cookie_token):
                    return JSONResponse(status_code=403, content={"detail": "طلب غير موثوق (CSRF)"})
    response = await call_next(request)
    # v12-E3.3(a) — idempotent cookie issuance on safe-method /api/* responses
    if (
        request.method in ("GET", "HEAD", "OPTIONS")
        and request.url.path.startswith("/api/")
        and not _csrf_exempt(request.url.path)
        and CSRF_COOKIE not in request.cookies
    ):
        response.set_cookie(
            CSRF_COOKIE,
            secrets.token_urlsafe(32),
            samesite="strict",
            secure=not getattr(settings, "DEBUG", False),
            httponly=False,  # MUST stay JS-readable: apiFetch echoes it in X-CSRF-Token
            path="/",
        )
    return response


async def request_logging_middleware(request: Request, call_next):
    """App-level request telemetry: method, path, status, duration.

    Previously only uvicorn's access log + the 500 handler existed — no app-level
    visibility of which endpoints get hit and how slow they are. Noisy paths
    (static chunks, health probes) are skipped.
    """
    path = request.url.path
    if path.startswith(("/_next/", "/static/", "/fonts/")) or path in ("/healthz", "/api/health"):
        return await call_next(request)
    import time as _time
    import uuid as _uuid
    request_id = _uuid.uuid4().hex[:8]
    # v12-E3.2 — bind the rid to request.state so DOWNSTREAM consumers see it:
    # the 500 traceback (app/errors.py), Sentry tags (_observability.capture_exception
    # reads request.state.request_id) and the critical Telegram alert
    # (_observability.report_critical). Previously the id existed only in this
    # middleware's log line + response header — dead correlation everywhere else.
    request.state.request_id = request_id
    start = _time.perf_counter()
    response = await call_next(request)
    duration_ms = (_time.perf_counter() - start) * 1000
    # v5 §7: request-id correlation — echoed in the response header so a
    # user-reported issue maps to one grep in the logs; 5xx at ERROR with id.
    response.headers["X-Request-Id"] = request_id
    if response.status_code >= 500:
        log.error("%s %s → %s (%.0fms) rid=%s", request.method, path, response.status_code, duration_ms, request_id)
    else:
        log.info("%s %s → %s (%.0fms) rid=%s", request.method, path, response.status_code, duration_ms, request_id)
    return response


# ── Static file & API caching headers ─────────────────────────────────────
# v9-A9: "/api/debug" REMOVED from the public cacheable prefixes — it is an
# authenticated diagnostics surface; a shared/CDN-cached 200 could serve one
# user's response to another. Only genuinely public config endpoints stay.
# v13-E8 (S2): "/api/env" dropped — route removed in v12-E2.8 (dead route,
# 404 test-confirmed); a prefix with no matching route never matched anyway.
_CACHEABLE_API_PREFIXES = ("/api/plans", "/api/config")
# v12-E5.4: committed root statics served headerless on the api domain.
_ROOT_STATIC_RE = re.compile(
    r"^/(?:opengraph-image\.png|favicon\.(?:png|ico)|apple-touch-icon\.png|"
    r"brand-icon\.png|icon-[^/]+\.(?:png|ico)|manifest\.webmanifest)$"
)


async def static_cache_middleware(request: Request, call_next):
    response = await call_next(request)
    # v11-A1 — fonts: api-domain production served /fonts/* with
    # cache-control: public, max-age=0, must-revalidate while bot-domain
    # correctly got 604800. Anything under /fonts/ is a static, rarely
    # changing asset — cache it hard on BOTH domains (any extension).
    if request.url.path.startswith("/fonts/"):
        response.headers["Cache-Control"] = "public, max-age=604800, stale-while-revalidate=86400"
    # v12-E5.4 (D8 live finding): api-domain /_next/static/chunks/* shipped
    # max-age=0, must-revalidate — every hashed chunk revalidated on every
    # load of the api-domain SPA (bot-domain chunks are edge-immutable).
    # /_next/ content is build-hash-named → safe to treat as immutable.
    elif request.url.path.startswith("/_next/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    # ponytail: vite hashed assets under /static/assets/, immutable
    elif request.url.path.startswith("/static/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    # v12-E5.4: committed root statics (og-image, icons, manifest) were
    # headerless on the api domain — same immutable policy as the chunks.
    elif _ROOT_STATIC_RE.match(request.url.path):
        response.headers["Cache-Control"] = (
            "public, max-age=3600" if request.url.path == "/manifest.webmanifest"
            else "public, max-age=31536000, immutable"
        )
    elif request.url.path in ("/", "/index.html"):
        response.headers["Cache-Control"] = "no-cache"
    # API GET responses that don't need real-time freshness
    elif request.method == "GET" and any(request.url.path.startswith(p) for p in _CACHEABLE_API_PREFIXES):
        # v18-1-c (edge-cache): the browser max-age stays 0 (the wallet cap /
        # payment phones must revalidate per session) but s-maxage lets the
        # VERCEL EDGE serve these public payloads for 2–5 minutes — the
        # first visitor after a cold function pays the ~12s boot, everyone
        # else in the window gets a sub-50ms HIT (X-Vercel-Cache: HIT).
        # vercel.json route headers CANNOT override a function-set
        # Cache-Control, so the directive must come from here. stale-while-
        # revalidate keeps the window seamless. Plans change with a deploy
        # anyway (DEFAULT_PLANS ships in the same bundle) — 5min staleness
        # is invisible; /api/config is admin-editable so its window is 2min.
        if request.url.path.startswith("/api/plans"):
            response.headers["Cache-Control"] = (
                "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
            )
        else:
            response.headers["Cache-Control"] = (
                "public, max-age=0, s-maxage=120, stale-while-revalidate=300"
            )
    # v11-A1 — MIME repair: StaticFiles guesses content types from the
    # platform mimetypes db; on api-domain production .woff2 fell back to
    # application/octet-stream (browsers with strict MIME checking refuse to
    # load it as a font). Repair ONLY the misdetection — never override a
    # real content type. Checked locally: .css always maps to text/css, so
    # no repair branch is needed for it.
    if (
        response.headers.get("content-type", "").startswith("application/octet-stream")
        and request.url.path.endswith(".woff2")
    ):
        response.headers["content-type"] = "font/woff2"
    return response


# v8-A7: security_headers is registered LAST among the HTTP middlewares.
# Starlette's `@app.middleware("http")` inserts at the FRONT of the user
# middleware stack, so the LAST registered decorator is the OUTERMOST layer —
# every response, including early 403s from csrf_origin_check and 429s from
# rate_limit_middleware, passes back through here and receives the full
# security header set (previously those early returns bypassed it).
async def security_headers(request: Request, call_next):
    """Add security headers to every response (outermost layer)."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # Strict-Transport-Security (HSTS) — enforce HTTPS (safe since both domains use HTTPS)
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    # Content-Security-Policy — restrict sources for XSS protection
    # 'unsafe-inline' for script-src/style-src is required by Next.js inline
    # styles and its inline bootstrap script; 'unsafe-eval' REMOVED
    # 2026-09-05 (dev-only need — production Next.js does not eval).
    # v12-E3.4 — NARROWED (D8 #4/D3): script-src dropped the Facebook SDK
    # hosts (https://connect.facebook.net + https://*.facebook.com) — the SPA
    # loads NO Facebook scripts (grep-verified: all FB traffic is server-side;
    # <img> avatars from the FB CDN stay allowed via img-src https:).
    # connect-src narrowed from "https: wss:" to the hosts actually used:
    # same-origin API + api.smart-link.ly (bot-domain SPA calls) + the Sentry
    # ingest (*.ingest.de.sentry.io) + wss: for the same-origin /ws endpoint.
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "img-src 'self' data: blob: https:; "
        "font-src 'self' data: https://fonts.gstatic.com; "
        "connect-src 'self' https://api.smart-link.ly https://*.ingest.de.sentry.io wss:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    )
    return response
