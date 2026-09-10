from __future__ import annotations

"""v21 (T4-a) — the piggyback beat: opportunistic automation on warm traffic.

Production reality (T3-a audit, 2026-09-10): every piece of SmartBot
automation (auto-replies, scheduled posts, sequence drips) runs ONLY through
``GET /api/cron/heartbeat`` — the Vercel-native cron fires it once daily
(04:00, vercel.json) and the external 5-minute channel (cron-job.org) is DEAD
with a rotated CRON_SECRET. Consequence: an inbound customer comment could
wait up to 24h for a bot reply.

This module adds a second, IN-CODE driver that needs no secret and no
external scheduler: when an AUTHENTICATED user request hits ``/api/*`` on an
already-warm serverless instance, the middleware below opportunistically
advances the SAME automation sweep the heartbeat runs
(``routers.bot._automation_sweep`` — publish due posts → fan refresh → bot
cycles with the sequence-drip drain).

Safety properties (each pinned by tests/test_v21_piggyback_beat.py):
  * Vercel-only: the gate is off unless the VERCEL env marker is set
    (import-time flag, the same pattern as app/startup.py:42 and
    routers/bot.py:28) — local dev and the test suite never piggyback;
  * rate-limited: at most ONE beat per window per instance — module-level
    monotonic stamp, the ``_sync_allowed`` / ``_INBOX_LAST_SYNC`` pattern
    (routers/facebook_routes.py:92, routers/inbox.py:81). Default window
    300s = the cadence the dead external channel was designed for (tunable
    via ``SMARTBOT_PIGGYBACK_INTERVAL_S``);
  * single-flight: a still-running beat blocks the next one — a beat frozen
    mid-flight by a lambda freeze is RESUMED on the next request, not
    duplicated (a task orphaned on a dead loop is abandoned, never awaited);
  * non-blocking: the beat is spawned BEFORE the endpoint work so it rides
    the SAME warm event loop as the in-flight request (real execution time
    while the lambda is serving traffic — a spawn-after-reply would freeze
    with the response, the v15-E4 D12-M4 lesson from /api/bot/trigger). The
    response NEVER waits for the beat; the beat is pure I/O-interleaved;
  * authenticated sessions only (the same session JWT the routes use —
    DB-free signature+expiry check), and NEVER on machine endpoints
    (/webhook, /api/webhook*, /api/telegram*, /api/cron/* — each has its own
    flow), public surfaces (/api/plans, /api/config) or pre-session auth
    routes (/api/login, /api/register);
  * bounded: ``asyncio.wait_for`` caps each beat at ``_PIGGYBACK_BUDGET_S``
    — a beat can never pin a shared instance forever;
  * idempotent: the sweep itself is claim-guarded / dedup-guarded (see the
    ``_automation_sweep`` docstring and bot_engine/engine.py:279) — a
    piggyback beat racing the external cron cannot double-publish or
    double-reply.

The authenticated cron path (routers/bot.py cron_heartbeat) is untouched by
design: re-arming the external channel with the current production secret
(docs/cron-setup.md) remains the cold-start/night driver — the piggyback
only covers warm-traffic windows.
"""

import asyncio
import logging
import os
import time as _time

from _async import spawn  # v9-A11: GC-safe background tasks
from config import settings
from fastapi import Request

log = logging.getLogger("fb-api")

# ponytail-style Vercel marker — import-time, same pattern as app/startup.py
_IS_VERCEL = bool(os.getenv("VERCEL"))

# At most one piggyback beat per window per instance. Default = 300s: the
# cadence the (dead) external 5-minute channel was designed for — restoring
# it via user traffic instead of cron. Graph-friendlier than 60s: a beat's
# comment cycle costs ~11 Graph calls per connected tenant, so 60s would
# mean ~660 calls/h/tenant.
_PIGGYBACK_INTERVAL_S = float(os.getenv("SMARTBOT_PIGGYBACK_INTERVAL_S", "300"))

# Hard cap per beat. Vercel api/* maxDuration is 30s (vercel.json); the beat
# shares the loop with the user request, so the cap keeps the instance
# reclaimable and never eats the whole function budget.
_PIGGYBACK_BUDGET_S = 20.0

# Machine / unauthenticated surfaces — each has its own flow and must never
# carry the piggyback: Facebook webhooks (signature-verified), the Telegram
# payment webhook, the Bearer-authed cron channel (untouched by design),
# probes, public/edge-cached payloads and pre-session auth routes.
_PIGGYBACK_EXEMPT_PREFIXES = (
    "/webhook",         # Facebook webhook (signature-verified, own flow)
    "/api/webhook",     # webhook helper routes (routers/webhooks.py)
    "/api/telegram",    # Telegram payment webhook (server-to-server)
    "/api/cron/",       # the Bearer-authed cron channel — untouched
    "/api/health",      # liveness/readiness probes
    "/healthz",         # infra probe
    "/api/login",       # pre-session
    "/api/register",    # pre-session
    "/api/plans",       # public, edge-cached
    "/api/config",      # public, edge-cached
)

# Module-level throttle state — the _INBOX_LAST_SYNC / _POSTS_LAST_SYNC
# pattern in routers/inbox.py / routers/facebook_routes.py.
_piggyback_last: float | None = None
_piggyback_task: asyncio.Task | None = None


def _reset_piggyback_state() -> None:
    """Test seam: clear the throttle + single-flight state between cases
    (same contract as _services._reset_token_type_cache)."""
    global _piggyback_last, _piggyback_task
    _piggyback_last = None
    _piggyback_task = None


def _request_authenticated(request: Request) -> bool:
    """DB-free session check: the same session JWT (cookie ``token``) the
    routes consume.

    Signature + expiry verification only — routers.auth.get_current_user's
    heavier DB checks (blacklist, user lookup) are unnecessary here: the
    beat performs no data access, and a blacklisted session triggering one
    throttled automation beat is harmless. Invalid/expired/absent token →
    False → no beat.
    """
    token = request.cookies.get("token")
    if not token:
        return False
    try:
        import jwt

        jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        return True
    except Exception:
        return False


def _piggyback_allowed(request: Request) -> bool:
    """Synchronous, DB-free gate — decided entirely outside the request path."""
    if not _IS_VERCEL:
        return False
    path = request.url.path
    if not path.startswith("/api/"):
        return False
    if path.startswith(_PIGGYBACK_EXEMPT_PREFIXES):
        return False
    if not _request_authenticated(request):
        return False
    # Single-flight: a beat still alive on THIS loop blocks the next one
    # (a lambda-frozen beat is resumed by the next request, not duplicated).
    # A task orphaned on a dead loop — the serverless runtime recreated it —
    # is abandoned, never waited on.
    task = _piggyback_task
    if (
        task is not None
        and not task.done()
        and task.get_loop() is asyncio.get_running_loop()
    ):
        return False
    last = _piggyback_last
    if last is not None and _time.monotonic() - last < _PIGGYBACK_INTERVAL_S:
        return False
    return True


async def piggyback_beat_middleware(request: Request, call_next):
    """The piggyback hook (registered in runner.py outside csrf/rate_limit).

    Fires the beat BEFORE the endpoint work on purpose: the spawned task
    rides the same warm event loop as the in-flight request and gets real
    execution time while the lambda is serving traffic. The response NEVER
    waits for the beat — ``spawn`` schedules it and the request proceeds.
    """
    if _piggyback_allowed(request):
        global _piggyback_last, _piggyback_task
        # stamp BEFORE spawning (atomic check-and-set on the event loop —
        # the _sync_allowed pattern; no interleaving window between the
        # check above and this write).
        _piggyback_last = _time.monotonic()
        _piggyback_task = spawn(_advance_automation_beat(), name="piggyback-beat")
        log.info("piggyback beat scheduled on warm traffic (path=%s)", request.url.path)
    return await call_next(request)


async def _advance_automation_beat() -> None:
    """One bounded automation advance + honest ledger record.

    Runs the SAME sweep as /api/cron/heartbeat steps 1-3 (publish due posts
    → fan refresh → bot cycles; the cycle drain fires sequence drips). The
    report carries ``trigger: "piggyback"`` so the ledger + admin console
    (/api/cron/status) distinguish traffic-driven beats from cron beats —
    the heartbeat ledger stays the single source of automation-liveness
    truth.
    """
    report = {"published_posts": 0, "fan_refreshed": 0, "cycles": 0,
              "errors": [], "trigger": "piggyback"}
    from routers.bot import _automation_sweep  # deferred — no import cycles
    try:
        await asyncio.wait_for(_automation_sweep(report),
                               timeout=_PIGGYBACK_BUDGET_S)
    except TimeoutError:
        # Budget exceeded mid-sweep: every claim already made is atomic and
        # the next beat (cron or piggyback) continues the remainder. Not
        # worth Sentry noise — log it, mark the report, record what ran.
        report["budget_exceeded"] = True
        log.warning(
            "piggyback beat hit its %.0fs budget — partial advance (claims "
            "are atomic; the next beat continues)", _PIGGYBACK_BUDGET_S,
        )
    # Ledger: automation DID advance (honest liveness). record_heartbeat
    # already swallows its own DB errors; this belt-and-suspenders guard
    # keeps the fire-and-forget path exception-clean either way.
    try:
        from _observability import record_heartbeat
        await record_heartbeat(report)
    except Exception:
        log.debug("piggyback ledger record failed", exc_info=True)
