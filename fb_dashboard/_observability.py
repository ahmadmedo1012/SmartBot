from __future__ import annotations

"""v6 §C + §E — Observability & operational reliability.

Three cooperating pieces, all no-op safe:

1. Sentry (GlitchTip-compatible):
   sentry-sdk is initialised ONLY when SENTRY_DSN is set. The SDK speaks the
   same wire protocol as GlitchTip — moving to a self-hosted GlitchTip later
   is a DSN change with zero code changes. An unset DSN = fully disabled,
   zero runtime cost, zero test flakiness.

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
import time
from datetime import datetime

log = logging.getLogger("fb-obs")

# ─────────────────────────────────────────────────────────────
# 1. Sentry / GlitchTip
# ─────────────────────────────────────────────────────────────

_sentry_enabled = False


def init_sentry() -> bool:
    """Init sentry-sdk when SENTRY_DSN is set; otherwise a clean no-op.

    GlitchTip note: sentry-sdk's DSN format works against GlitchTip
    unchanged (https://glitchtip.com/documentation/sdk — Sentry SDKs are
    the recommended client). Set SENTRY_DSN to point at either backend.
    """
    global _sentry_enabled
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        log.info("observability: SENTRY_DSN not set — error tracking disabled "
                 "(set it to a Sentry or GlitchTip DSN to enable)")
        return False
    try:
        import sentry_sdk

        release = os.getenv("SENTRY_RELEASE", "").strip()
        kwargs: dict = {
            "dsn": dsn,
            "environment": os.getenv("SENTRY_ENVIRONMENT", os.getenv("ENV", "production")),
            "traces_sample_rate": float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
            "send_default_pii": False,
        }
        if release:
            kwargs["release"] = release
        sentry_sdk.init(**kwargs)
        _sentry_enabled = True
        log.info("observability: error tracking enabled")
        return True
    except Exception as e:  # noqa: BLE001 — observability must never take the app down
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
                except Exception:  # noqa: BLE001
                    pass
            sentry_sdk.capture_exception(exc)
    except Exception:  # noqa: BLE001
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
    except Exception as e:  # noqa: BLE001 — alerting must never break the request
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
        except Exception:  # noqa: BLE001
            stamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M") + " UTC"
        rid = "-"
        path = method = "?"
        try:
            rid = str(getattr(request.state, "request_id", "-"))
            path = request.url.path
            method = request.method
        except Exception:  # noqa: BLE001
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
    except Exception as e:  # noqa: BLE001
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
    except Exception as e:  # noqa: BLE001
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
    except Exception as e:  # noqa: BLE001
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
