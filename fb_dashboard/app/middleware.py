from __future__ import annotations

"""HTTP middlewares extracted from runner.py (v11-A1 decomposition).

Bodies are verbatim moves; registration ORDER lives in runner.py and is
behavior (Starlette's ``add_middleware`` inserts at the FRONT of the stack —
the last-registered middleware is the outermost layer, so every response
passes back through it).
"""

import asyncio
import json
import logging
import os
import time

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

# ── Request deduplication: serializes concurrent identical GETs → cache serves second ──
MAX_LOCKS = 1000
LOCK_TTL = 300  # seconds (5 min)
_dedup_locks: dict[str, tuple[asyncio.Lock, float]] = {}
_dedup_lock = asyncio.Lock()
_dedup_ops = 0


async def dedup_middleware(request: Request, call_next):
    if request.method != "GET":
        return await call_next(request)

    qp = dict(sorted(request.query_params.items())) if request.query_params else {}
    key = f"{request.method}:{request.url.path}?{json.dumps(qp, sort_keys=True)}"

    async with _dedup_lock:
        if key not in _dedup_locks:
            _dedup_locks[key] = (asyncio.Lock(), time.time())
        lock = _dedup_locks[key][0]

    async with lock:
        # ponytail: second concurrent caller will re-execute but hit the APICache if decorated
        response = await call_next(request)

    async with _dedup_lock:
        if key in _dedup_locks:
            del _dedup_locks[key]
        _maybe_evict()

    return response


def _maybe_evict():
    """Every 50 calls, purge expired entries; if still over limit, evict oldest."""
    global _dedup_ops
    _dedup_ops += 1
    if _dedup_ops < 50:
        return
    _dedup_ops = 0
    now = time.time()
    stale = [k for k, (_, ts) in _dedup_locks.items() if now - ts > LOCK_TTL]
    for k in stale:
        del _dedup_locks[k]
    # ponytail: LRU via sorted insertion order; if throughput matters replace with OrderedDict
    while len(_dedup_locks) > MAX_LOCKS:
        oldest = min(_dedup_locks, key=lambda k: _dedup_locks[k][1])
        del _dedup_locks[oldest]


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
        if not any(path.startswith(p) for p in ("/api/login", "/api/register", "/webhook", "/api/telegram")):
            ip = request.client.host if request.client else "unknown"
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


async def csrf_origin_check(request: Request, call_next):
    """Validate Origin/Referer on state-changing requests to /api/*.

    SECURITY (2026-09-05): the old substring match (`"bot.smart-link.ly" in origin`)
    was bypassable with e.g. https://bot.smart-link.ly.evil.com. Now the origin
    host is parsed and compared EXACTLY against the allowlist.
    """
    from urllib.parse import urlparse
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.url.path.startswith("/api/"):
        allowed_hosts = {"bot.smart-link.ly", "api.smart-link.ly"}
        if getattr(settings, "DEBUG", False):
            allowed_hosts |= {"localhost", "127.0.0.1"}
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
    return await call_next(request)


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
_CACHEABLE_API_PREFIXES = ("/api/plans", "/api/config", "/api/env")


async def static_cache_middleware(request: Request, call_next):
    response = await call_next(request)
    # v11-A1 — fonts: api-domain production served /fonts/* with
    # cache-control: public, max-age=0, must-revalidate while bot-domain
    # correctly got 604800. Anything under /fonts/ is a static, rarely
    # changing asset — cache it hard on BOTH domains (any extension).
    if request.url.path.startswith("/fonts/"):
        response.headers["Cache-Control"] = "public, max-age=604800, stale-while-revalidate=86400"
    # ponytail: vite hashed assets under /static/assets/, immutable
    elif request.url.path.startswith("/static/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif request.url.path in ("/", "/index.html"):
        response.headers["Cache-Control"] = "no-cache"
    # API GET responses that don't need real-time freshness
    elif request.method == "GET" and any(request.url.path.startswith(p) for p in _CACHEABLE_API_PREFIXES):
        response.headers["Cache-Control"] = "public, max-age=60"
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
    # 'unsafe-inline' for script-src/style-src is required by Next.js inline styles and Sonner;
    # 'unsafe-eval' REMOVED 2026-09-05 (dev-only need — production Next.js does not eval).
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://connect.facebook.net https://*.facebook.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "img-src 'self' data: blob: https:; "
        "font-src 'self' data: https://fonts.gstatic.com; "
        "connect-src 'self' https: wss:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    )
    return response
