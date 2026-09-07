from __future__ import annotations

"""v6 §C + §E — Observability & operational reliability.

Three cooperating pieces, all no-op safe:

1. Sentry (GlitchTip-compatible):
   sentry-sdk initialises with the DSN resolved as: SENTRY_DSN env override
   → committed DEFAULT_SENTRY_DSN → disabled. The committed DSN is public by
   design (Sentry client keys are send-only — they cannot read data or
   authorise anything), so wiring error tracking "on by default" is safe and
   costs nothing until an error actually fires. Setting SENTRY_DSN=off
   (also: 0/disabled/false/no) fully disables it — the no-op state remains
   zero-cost and zero-network. The SDK speaks the same wire protocol as
   GlitchTip: pointing SENTRY_DSN at a self-hosted GlitchTip is a config
   change, not a code change.

2. Critical Telegram alerts:
   unhandled 500s bridge to the admin Telegram channel (the existing
   telegram_bot module — owner's chosen channel, v3) with a per-fingerprint
   cooldown so an error storm sends ONE alert, not hundreds.

3. Cron heartbeat ledger + staleness detection (v6 §E):
   every authenticated /api/cron/heartbeat run records its timestamp in
   SystemConfig("cron_last_heartbeat"). The heartbeat handler ALSO inspects
   how stale the PREVIOUS beat was before recording the new one — the daily
   Vercel-native cron (vercel.json, 04:00) is the independent second channel:
   if cron-job.org (5-minute beats) goes down, the daily run sees a >15 min
   gap and alerts the admin on Telegram. Owner decision on Vercel Pro is
   documented in docs/v6-final-report.md; this detection is the mandated
   fallback for the Hobby plan.
"""

import logging
import os
import re
import time
from datetime import datetime

log = logging.getLogger("fb-obs")

# ── v12-E3.7 — PII scrubber for outgoing Sentry events ───────────────────
# Conservative, pattern-based redaction applied in before_send: obvious
# emails and phone numbers in the message-bearing parts of an event
# (logentry.message for capture_message, exception values for raised errors).
# v15-E7 (D14-M3) — the "deliberately NOT touched: request.data /
# breadcrumbs" assumption of v12 was DISPROVED by a live production 500 on
# POST /api/login (Sentry event 63cdb997, 2026-09-07): request.data carried
# a real username ({"username": "ahmad", ...}) and breadcrumbs carried the
# DB infrastructure identity (server.address=ep-…-pooler…neon.tech,
# db.user=smartbot_owner, db.name=smartbot_db). The scrubber now also walks
# those two structures (see _scrub_tree). tags remain untouched (we only set
# non-identifying ones ourselves).
# The scrubber must never raise and never drop an event (worst case: a match
# is missed — never the reverse).
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
# Sentry's own documented example pattern for phone-shaped text (optional
# country prefix, 8+ digits with spaces/dashes/dots/parens). Bare short digit
# runs (ids, counters) do not match; only long or separated digit strings do.
_PHONE_RE = re.compile(r"\+?\d[\d\s\-().]{7,}\d")
# v15-E7 (D14-M3): managed-DB host shapes (Neon pooled hosts, RDS, and the
# common managed-postgres suffixes). Applied to free strings AND to
# address/host-keyed values in request.data + breadcrumb data.
_DB_HOST_RE = re.compile(
    r"\b(?:[a-zA-Z0-9-]+\.)+"
    r"(?:neon\.tech|amazonaws\.com|supabase\.[a-z]+|render\.com|"
    r"digitalocean\.com|herokuapp\.com|cr\.yandex\.cloud|exoscale\.com)\b",
    re.IGNORECASE,
)
# Keys whose VALUES are usernames/logins → fully redacted.
_USERNAME_KEYS = frozenset({"username", "user", "login", "db_user"})
# Keys whose VALUES are infrastructure addresses → fully redacted.
_HOST_KEYS = frozenset({"address", "host"})


def scrub_pii_text(text: str) -> str:
    """Redact obvious emails/phone numbers from a free-text string."""
    text = _EMAIL_RE.sub("[REDACTED-EMAIL]", text)
    return _PHONE_RE.sub("[REDACTED-PHONE]", text)


def _scrub_string(text: str) -> str:
    """Emails + phones + managed-DB hostnames from one free string."""
    return _DB_HOST_RE.sub("[REDACTED-DB-HOST]", scrub_pii_text(text))


def _scrub_tree(node) -> None:
    """In-place redaction of a nested JSON-ish structure.

    Handles the Sentry shapes observed live: request.data dicts
    ({"username": "ahmad"}) and breadcrumb data dicts
    ({"server": {"address": "ep-…neon.tech", "port": 5432},
      "db": {"name": "smartbot_db", "user": "smartbot_owner"}}).
    The "db" sub-dict gets full value redaction (db name/user are
    infrastructure identity); unknown shapes fall through untouched —
    over-matching is avoided, never at the cost of raising.
    """
    if isinstance(node, dict):
        for k in list(node.keys()):
            v = node[k]
            lk = str(k).strip().lower()
            if lk == "db" and isinstance(v, dict):
                for dk in list(v.keys()):
                    dv = v[dk]
                    if isinstance(dv, str):
                        v[dk] = "[REDACTED-DB]"
                continue
            if isinstance(v, str):
                if lk in _USERNAME_KEYS:
                    node[k] = "[REDACTED-USERNAME]"
                elif lk in _HOST_KEYS:
                    node[k] = "[REDACTED-HOST]"
                else:
                    node[k] = _scrub_string(v)
            elif isinstance(v, (dict, list)):
                _scrub_tree(v)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            if isinstance(v, str):
                node[i] = _scrub_string(v)
            elif isinstance(v, (dict, list)):
                _scrub_tree(v)


def _scrub_event(event: dict) -> dict:
    """Apply the scrubber to the message-bearing + request/breadcrumb parts.

    Returns the event unchanged on ANY internal error — redaction is
    best-effort and must never lose the error report itself.
    """
    try:
        logentry = event.get("logentry")
        if isinstance(logentry, dict) and isinstance(logentry.get("message"), str):
            logentry["message"] = scrub_pii_text(logentry["message"])
        values = event.get("exception", {}).get("values") or []
        if isinstance(values, list):
            for exc in values:
                if isinstance(exc, dict) and isinstance(exc.get("value"), str):
                    exc["value"] = scrub_pii_text(exc["value"])
        # v15-E7 (D14-M3): request.data — usernames (live: {"username": ...}).
        request = event.get("request")
        if isinstance(request, dict):
            data = request.get("data")
            if isinstance(data, (dict, list)):
                _scrub_tree(data)
            elif isinstance(data, str):
                request["data"] = _scrub_string(data)
        # v15-E7 (D14-M3): breadcrumbs — DB host/user (live: server.address +
        # db.name/db.user from the sqlalchemy integration).
        crumbs = event.get("breadcrumbs")
        if isinstance(crumbs, dict):
            for crumb in crumbs.get("values") or []:
                if not isinstance(crumb, dict):
                    continue
                if isinstance(crumb.get("message"), str):
                    crumb["message"] = _scrub_string(crumb["message"])
                cdata = crumb.get("data")
                if isinstance(cdata, (dict, list)):
                    _scrub_tree(cdata)
    except Exception:
        pass
    return event


def _before_send(event: dict, hint: dict | None) -> dict:
    """sentry_sdk init hook: scrub PII right before the event is enqueued."""
    return _scrub_event(event)


# ─────────────────────────────────────────────────────────────
# 1. Sentry / GlitchTip
# ─────────────────────────────────────────────────────────────

# Committed default (org "subnation" / project "smartbot-api" — created via
# the Sentry API on 2026-09-06). DSNs are send-only client keys: safe to
# commit, same class of secret as a webhook URL. Override with SENTRY_DSN
# (e.g. a self-hosted GlitchTip DSN), or disable with SENTRY_DSN=off.
DEFAULT_SENTRY_DSN = (
    "https://1277e4a0ecdb9f7f63a400611cad93c8"
    "@o4511397349097472.ingest.de.sentry.io/4512037258330192"
)
_OFF_VALUES = {"off", "0", "disabled", "false", "no"}

_sentry_enabled = False


def _resolve_dsn() -> str:
    """SENTRY_DSN env → committed default → '' (disabled).

    An explicit off-value (off/0/disabled/false/no) means DISABLED even
    though it is set; an empty/unset value falls back to DEFAULT_SENTRY_DSN.
    """
    raw = os.getenv("SENTRY_DSN", "").strip()
    if raw.lower() in _OFF_VALUES:
        return ""
    return raw or DEFAULT_SENTRY_DSN


def _send_boot_canary() -> None:
    """One info event per process start — proof-of-wiring signal.

    On Vercel every cold start emits exactly one event tagged canary=boot
    (environment tag distinguishes production/preview/local). This lets the
    owner verify the Sentry wiring from the Sentry UI itself — no Vercel
    dashboard access needed. One event per cold start sits comfortably
    inside the free tier (5k events/month). Disable: SENTRY_BOOT_CANARY=off.
    """
    if os.getenv("SENTRY_BOOT_CANARY", "").strip().lower() in _OFF_VALUES:
        return
    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("canary", "boot")
            sentry_sdk.capture_message("SmartBot API booted", level="info")
    except Exception:  # never break startup
        pass


def init_sentry() -> bool:
    """Init sentry-sdk with the resolved DSN; disabled → clean no-op.

    GlitchTip note: sentry-sdk's DSN format works against GlitchTip
    unchanged (https://glitchtip.com/documentation/sdk — Sentry SDKs are
    the recommended client). Set SENTRY_DSN to point at either backend;
    set it to "off" to disable entirely.
    """
    global _sentry_enabled
    dsn = _resolve_dsn()
    if not dsn:
        log.info("observability: error tracking disabled (SENTRY_DSN off or "
                 "no default DSN configured)")
        return False
    try:
        import sentry_sdk
        from _utils import app_version

        environment = (
            os.getenv("SENTRY_ENVIRONMENT", "").strip()
            or os.getenv("ENV", "").strip()
            or os.getenv("VERCEL_ENV", "").strip()
            or "local"
        )
        release = os.getenv("SENTRY_RELEASE", "").strip() or app_version()
        # v15-E7 (D9-M1): release defaults to app_version() = fb_dashboard/VERSION
        # (now 2.2.0). One version contract: the Sentry API release tag, the
        # /api/health + /healthz version fields and the VERSION file all read
        # the same source. Coordinator note: align the next production deploy's
        # Sentry release with 2.2.0 (SENTRY_RELEASE env still wins as explicit
        # override for SHA-based tagging if that policy is ever adopted).
        kwargs: dict = {
            "dsn": dsn,
            "environment": environment,
            # v15-E7 (D14-H3) — transactions on Vercel: DOCUMENTED REALITY,
            # not a fake fix. Live Sentry API evidence (D14 §1.1,
            # 2026-09-07): ZERO transaction rows for the smartbot-api project
            # across its entire lifetime despite this 0.05 rate. Root cause:
            # the SDK's background transport batches span/transaction
            # envelopes with a ~2s delay while Vercel freezes the instance the
            # moment the response is sent — capture_exception() survives that
            # freeze because it calls client.flush(timeout=1.0) explicitly
            # (see capture_exception below), but transaction envelopes never
            # get such a flush and die in the frozen buffer. Options weighed:
            # (a) response-middleware flush for sampled requests (adds hot-path
            # latency — deferred, only if internal APM becomes a product
            # requirement); (b) accept it and measure latency via
            # /api/health/ready's latency_ms + an external uptime probe
            # (D14 §5.1); (c) SENTRY_TRACES_SAMPLE_RATE=0 to stop paying
            # sampling overhead. DECISION for v15 (ledger:
            # dec-transactions-vercel — "توثيق واقع"): keep the env knob,
            # default stays 0.05, NO code pretending APM works. Latency
            # monitoring comes from (b).
            "traces_sample_rate": float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
            "send_default_pii": False,
            # v12-E3.7 — PII hygiene on the wire: emails/phone numbers that
            # leaked into exception messages or capture_message texts are
            # redacted before the event leaves the process.
            "before_send": _before_send,
        }
        if release:
            kwargs["release"] = release
        sentry_sdk.init(**kwargs)
        _sentry_enabled = True
        log.info("observability: error tracking enabled (env=%s, release=%s)",
                 environment, release)
        _send_boot_canary()
        return True
    except Exception as e:  # observability must never take the app down
        log.warning("observability: sentry init failed, continuing without it: %s", e)
        _sentry_enabled = False
    return False


def capture_exception(exc: BaseException, *, request=None) -> None:
    """Capture to Sentry with request context. Never raises."""
    if not _sentry_enabled:
        return
    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            if request is not None:
                try:
                    scope.set_tag("request_id", getattr(request.state, "request_id", ""))
                    scope.set_tag("path", request.url.path)
                    scope.set_tag("method", request.method)
                except Exception:
                    pass
            sentry_sdk.capture_exception(exc)
        # Serverless freeze guard: the background transport batches events
        # with a ~2s delay and Vercel may freeze the instance the moment the
        # response is sent — a bounded flush (1s, inside the 500 path where
        # latency no longer matters) makes delivery reliable.
        try:
            client = sentry_sdk.get_client()
            if client is not None:
                client.flush(timeout=1.0)
        except Exception:
            pass
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────
# 2. Critical Telegram alerts (cooldown-guarded)
# ─────────────────────────────────────────────────────────────

ALERT_COOLDOWN_S = 300  # one alert per fingerprint per 5 minutes
CRON_ALERT_COOLDOWN_S = 12 * 3600  # cron-stall reminders: at most twice a day
_last_alert: dict[str, float] = {}


def _cooldown_allows(key: str, cooldown_s: float) -> bool:
    """True when this key may alert now.

    CRITICAL correctness note (caught live by test_staleness_30min_beat_alerts_admin):
    time.monotonic() counts seconds since PROCESS START (or boot) and is
    small on fresh/cold starts — a default of 0.0 would make
    ``now - 0.0 < cooldown_s`` true for ANY cooldown longer than uptime
    (e.g. the 12h cron reminder), silently swallowing the FIRST alert after
    every cold start. None-sentinel = "never alerted" is the only safe
    representation.
    """
    now = time.monotonic()
    last = _last_alert.get(key)
    if last is not None and now - last < cooldown_s:
        return False
    _last_alert[key] = now
    return True


def reset_alert_cooldowns() -> None:
    """Test helper — clear the in-memory cooldown ledger."""
    _last_alert.clear()


async def telegram_alert(text: str, *, key: str, cooldown_s: float = ALERT_COOLDOWN_S) -> bool:
    """Send `text` to admin Telegram recipients. Never raises.

    Returns True when a delivery was attempted (cooldown window open).
    Recipients: admin ids (env + TelegramApprover rows) ∪ default chat id.
    """
    if not _cooldown_allows(key, cooldown_s):
        return False
    try:
        from telegram_bot import get_admin_ids, get_chat_id, send_message

        targets: list[str] = [str(i) for i in await get_admin_ids()]
        chat = await get_chat_id()
        if chat and chat not in targets:
            targets.append(str(chat))
        if not targets:
            log.warning("critical alert suppressed — no telegram recipients configured")
            return False
        delivered = 0
        for target in targets:
            res = await send_message(target, text)
            if res is not None:
                delivered += 1
        return delivered > 0
    except Exception as e:  # alerting must never break the request
        log.warning("critical alert failed: %s", e)
        return False


async def report_critical(request, exc: BaseException) -> None:
    """500-handler bridge: Sentry capture + admin Telegram alert.

    Called from runner.global_500_handler — MUST never raise (double fault).
    """
    try:
        capture_exception(exc, request=request)
        try:
            from _utils import utcnow as _now
            stamp = _now().strftime("%Y-%m-%d %H:%M") + " UTC"
        except Exception:
            stamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M") + " UTC"
        rid = "-"
        path = method = "?"
        try:
            rid = str(getattr(request.state, "request_id", "-"))
            path = request.url.path
            method = request.method
        except Exception:
            pass
        fingerprint = f"500:{path}:{type(exc).__name__}"
        text = (
            "🚨 خطأ حرج في SmartBot\n"
            f"المسار: {method} {path}\n"
            f"الخطأ: {type(exc).__name__}: {str(exc)[:180]}\n"
            f"معرف الطلب: {rid}\n"
            f"الوقت: {stamp}"
        )
        await telegram_alert(text, key=fingerprint)
    except Exception as e:
        log.warning("report_critical double-fault guard: %s", e)


# ─────────────────────────────────────────────────────────────
# 3. Cron heartbeat ledger + staleness detection (v6 §E)
# ─────────────────────────────────────────────────────────────

HEARTBEAT_KEY = "cron_last_heartbeat"
HEARTBEAT_REPORT_KEY = "cron_last_heartbeat_report"
STALE_AFTER_S = 15 * 60  # the v6 plan mandate: alert when no beat for 15 min


async def _upsert_config(db, key: str, value: str, description: str) -> None:
    from models import SystemConfig
    from sqlalchemy import select

    row = (
        await db.execute(select(SystemConfig).where(SystemConfig.key == key))
    ).scalar_one_or_none()
    if row is not None:
        row.value = value
    else:
        db.add(SystemConfig(key=key, value=value, category="cron", description=description))
    await db.commit()


async def record_heartbeat(report: dict) -> None:
    """Persist this beat (timestamp + compact report) to SystemConfig."""
    import json as _json

    from _utils import utcnow as _now
    from database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await _upsert_config(db, HEARTBEAT_KEY, _now().isoformat(),
                                 "v6 §E — last successful cron heartbeat (UTC ISO)")
            await _upsert_config(db, HEARTBEAT_REPORT_KEY,
                                 _json.dumps(report, ensure_ascii=False, default=str)[:2000],
                                 "v6 §E — last heartbeat report (posts/fans/cycles)")
    except Exception as e:
        log.warning("record_heartbeat failed: %s", e)


async def get_last_heartbeat() -> datetime | None:
    """Read the last recorded beat; None when never recorded."""
    from database import AsyncSessionLocal
    from models import SystemConfig
    from sqlalchemy import select

    try:
        async with AsyncSessionLocal() as db:
            row = (
                await db.execute(
                    select(SystemConfig).where(SystemConfig.key == HEARTBEAT_KEY)
                )
            ).scalar_one_or_none()
            if row and row.value:
                return datetime.fromisoformat(row.value)
    except Exception as e:
        log.warning("get_last_heartbeat failed: %s", e)
    return None


async def check_cron_staleness_and_alert() -> dict:
    """Alert the admin when the previous beat is older than STALE_AFTER_S.

    Runs at the START of every heartbeat invocation — so the daily
    Vercel-native cron detects a dead cron-job.org within 24h worst case,
    and any manual beat detects it immediately.

    Returns {"last": iso|None, "age_seconds": int|None, "stale": bool,
             "alerted": bool} for tests and the admin status endpoint.
    """
    last = await get_last_heartbeat()
    if last is None:
        return {"last": None, "age_seconds": None, "stale": False, "alerted": False}
    from _utils import utcnow as _now

    age = (_now() - last).total_seconds()
    if age <= STALE_AFTER_S:
        return {"last": last.isoformat(), "age_seconds": int(age), "stale": False, "alerted": False}
    hours = age / 3600.0
    text = (
        "⏰ تنبيه: نبض الجدولة متوقف\n"
        f"آخر نبض قبل {hours:.1f} ساعة (الحد المتوقع: 15 دقيقة)\n"
        "المهام المتأثرة: المنشورات المجدولة + تحديث المتابعين + دورات البوت\n"
        "المصدر الغالب: توقف cron-job.org أو حجب النداء (تحقق من الـ token)"
    )
    alerted = await telegram_alert(
        text, key="cron_stalled", cooldown_s=CRON_ALERT_COOLDOWN_S
    )
    return {"last": last.isoformat(), "age_seconds": int(age), "stale": True, "alerted": alerted}
