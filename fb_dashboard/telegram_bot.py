from __future__ import annotations

"""Telegram admin notifications for payment approvals (world-class plan v3 §5).

Smart-Menu pattern applied: the bot token + admin recipients resolve from
SystemConfig (DB — owner-editable from /admin/settings) with env fallback,
and admin recipients = env TELEGRAM_ADMIN_IDS ∪ DB TelegramApprover rows.

BEFORE: BOT_TOKEN/ADMIN_IDS were env-only. With no Vercel env vars set (the
production reality) every notify_* silently iterated an empty recipient list
— the owner received ZERO telegram notifications. The TelegramApprover table
existed and had an admin UI, but this module never consulted it.

v18-1-d (متانة إشعارات تليجرام): the silent empty loop is now OBSERVABLE —
every notify_admins_* returns a summary dict
``{"sent": n, "failed": m, "recipients": k, "skipped_no_config": bool}``
(+ ``payment_id`` where known) and logs ONE greppable warning when the channel
is dead (``telegram notify skipped: no bot token configured`` /
``telegram notify skipped: zero admin recipients``). HTTP sends gained exactly
ONE retry per call on transient failures (timeout / 5xx / 429).

v22-D7 (FIX-B — Markdown injection class): every payload now ships as
``parse_mode: "HTML"`` with user-controlled fields passed through
``escape_user_text`` (``html.escape``) — a username/plan/phone/ticket body
containing ``_``/``*``/```` ``` ``/``[``/``<`` used to make Telegram reject the
sendMessage with 400 "can't parse entities" and the admin silently received
NOTHING (live evidence: W1-D5 payments #26/#28 — username ``v22d5_z9jscc``
put an unclosed Markdown entity at byte 67; W1-D10 tickets 3/4/5/8). HTML
mode makes ``_``/``*`` inert and ``<``/``&`` are escaped. Belt + suspenders:
``_call`` additionally self-heals — a 400 "can't parse entities" is retried
ONCE with the SAME payload minus ``parse_mode`` (plain text) so a formatting
rejection can never drop a notification entirely (covers every caller,
including ``_observability.telegram_alert`` and ``editMessageText``).

Decision (async vs sync httpx): ``_call`` stays SYNCHRONOUS
(``httpx.post`` inside ``asyncio.to_thread``). All senders already run in an
async context and dispatch through to_thread; converting to AsyncClient would
require re-plumbing every call site (send_message / edit_message /
edit_keyboard / answer_callback) and re-verifying the webhook dispatch path
for no functional gain — to_thread isolates the blocking IO just as well and
the payment response stays capped by the wallet.py wait_for timeout.
"""
import asyncio
import html
import logging
import os
import time
from typing import Any

import httpx

log = logging.getLogger("fb-tg")

_ENV_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
_ENV_ADMIN_IDS = [int(x) for x in os.environ.get("TELEGRAM_ADMIN_IDS", "").split(",") if x.strip().isdigit()]

_API_BASE = "https://api.telegram.org/bot"

# v18-1-d: transient-failure retry policy — exactly ONE retry per API call
# after a short delay; retryable = httpx timeout/transport error or 5xx/429.
# 4xx (bad token, blocked bot, wrong chat) is NOT retried — it is a config
# error, not a blip. Module-level constants so tests can zero the delay.
_HTTP_TIMEOUT_S = 10.0
_RETRY_DELAY_S = 0.5
_RETRYABLE_HTTP = frozenset({500, 502, 503, 504, 429})

# v22-D7 (FIX-B): Telegram's exact marker for a formatting rejection —
# "Bad Request: can't parse entities: ..." (Markdown OR HTML mode). This is
# the ONLY 4xx that is self-healable (strip parse_mode, resend plain text);
# every other 4xx stays a config error, not a blip.
_PARSE_ERROR_MARKER = "can't parse entities"


def escape_user_text(value: Any) -> str:
    """v22-D7: escape a DYNAMIC (user-influenced) field for parse_mode=HTML.

    Applied to username / plan name / phone / provider / subject / email /
    ticket body — anything an end user can put characters into. Fixed labels
    and emoji stay literal; ``<``/``&``/``>`` become entities so the Telegram
    HTML parser can never choke (or be injected through) on user data.
    ``quote=False``: quotes are inert inside message TEXT (never inside an
    attribute), so they stay human-readable.
    """
    return html.escape(str(value), quote=False)


# ── Config resolution (DB-first, env fallback — Smart-Menu pattern) ──

async def get_bot_token() -> str:
    """SystemConfig.telegram_bot_token wins; env TELEGRAM_BOT_TOKEN fallback."""
    try:
        from database import AsyncSessionLocal
        from models import SystemConfig
        from sqlalchemy import select
        async with AsyncSessionLocal() as db:
            row = await db.execute(
                select(SystemConfig).where(SystemConfig.key == "telegram_bot_token"))
            r = row.scalar_one_or_none()
            if r and r.value:
                return r.value
    except Exception:
        pass
    return _ENV_BOT_TOKEN


async def get_admin_ids() -> list[int]:
    """Admin recipients = env TELEGRAM_ADMIN_IDS ∪ DB TelegramApprover rows."""
    ids: list[int] = list(_ENV_ADMIN_IDS)
    try:
        from database import AsyncSessionLocal
        from models import TelegramApprover
        from sqlalchemy import select
        async with AsyncSessionLocal() as db:
            rows = await db.execute(select(TelegramApprover.telegram_id))
            for (tid,) in rows.all():
                try:
                    tid_int = int(str(tid))
                    if tid_int not in ids:
                        ids.append(tid_int)
                except (TypeError, ValueError):
                    continue
    except Exception:
        pass
    return ids


async def get_chat_id() -> str:
    """Default broadcast chat id (SystemConfig.telegram_chat_id → env)."""
    try:
        from database import AsyncSessionLocal
        from models import SystemConfig
        from sqlalchemy import select
        async with AsyncSessionLocal() as db:
            row = await db.execute(
                select(SystemConfig).where(SystemConfig.key == "telegram_chat_id"))
            r = row.scalar_one_or_none()
            if r and r.value:
                return r.value
    except Exception:
        pass
    return os.getenv("TELEGRAM_CHAT_ID", "")


def _call(method: str, payload: dict, token: str) -> dict | None:
    """Sync Telegram API call (always dispatched via asyncio.to_thread).

    Contract unchanged: parsed JSON dict on HTTP success, ``None`` otherwise.
    v18-1-d: one retry on TRANSIENT failure — httpx TimeoutException /
    TransportError, or HTTP 500/502/503/504/429 — after ``_RETRY_DELAY_S``.
    Every failure is logged (the old code only logged exceptions, so a 401
    bad-token response was indistinguishable from silence).
    v22-D7 (FIX-B): a 400 "can't parse entities" is SELF-HEALABLE — retried
    exactly ONCE with the same payload minus ``parse_mode`` (plain text). The
    plain retry carries no parse_mode, so this branch cannot re-trigger:
    depth is bounded at 2 and a formatting bug can never silently swallow a
    notification again. Both attempts are logged.
    """
    if not token:
        return None
    for attempt in (1, 2):
        try:
            r = httpx.post(f"{_API_BASE}{token}/{method}", json=payload,
                           timeout=_HTTP_TIMEOUT_S)
        except (httpx.TimeoutException, httpx.TransportError) as e:
            if attempt == 1:
                log.warning("telegram %s transient failure (%s) — retrying once",
                            method, type(e).__name__)
                time.sleep(_RETRY_DELAY_S)
                continue
            log.warning("telegram %s failed after retry: %s: %s",
                        method, type(e).__name__, e)
            return None
        except Exception as e:
            log.warning("telegram %s failed: %s", method, e)
            return None
        if r.is_success:
            return r.json()
        detail = f"HTTP {r.status_code} {r.text[:160]}"
        if attempt == 1 and r.status_code in _RETRYABLE_HTTP:
            log.warning("telegram %s got HTTP %s — retrying once", method, r.status_code)
            time.sleep(_RETRY_DELAY_S)
            continue
        if (payload.get("parse_mode") and r.status_code == 400
                and _PARSE_ERROR_MARKER in r.text):
            # v22-D7 (FIX-B): parse-mode rejection — retry ONCE as plain text.
            # The response body is logged above in ``detail``; the second
            # attempt logs its own outcome (success returns, failure warns).
            log.warning("telegram %s parse rejected (%s) — retrying once as PLAIN TEXT",
                        method, detail)
            plain = {k: v for k, v in payload.items() if k != "parse_mode"}
            return _call(method, plain, token)
        log.warning("telegram %s failed: %s", method, detail)
        return None
    return None


async def _send_to(chat_id: int | str, text: str,
                  buttons: list[list[dict]] | None, token: str,
                  parse_mode: str | None = "HTML") -> dict | None:
    """Build the sendMessage payload and dispatch it through to_thread.

    Split out of send_message (v18-1-d) so the payload-building + dispatch
    stays in ONE place while send_message keeps the public
    (chat_id, text, buttons) → dict | None contract every existing caller
    and test relies on. NOTE: the empty-token check deliberately lives in
    ``_call`` (NOT here) — ``_call`` is the single HTTP chokepoint tests
    monkeypatch wholesale (tests/test_v6_observability.py telegram_spy);
    short-circuiting here would bypass that seam.
    v22-D7 (FIX-B): default parse_mode is now HTML (was Markdown) — HTML is
    the predictable mode for interpolated user data (``_``/``*`` are inert;
    ``<``/``&`` get escaped by ``escape_user_text`` at the builder). The
    400-parse-error plain-text fallback in ``_call`` covers anything that
    still slips through (e.g. legacy callers passing raw text).
    """
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text}
    if parse_mode:
        payload["parse_mode"] = parse_mode
    if buttons:
        payload["reply_markup"] = {"inline_keyboard": buttons}
    return await asyncio.to_thread(_call, "sendMessage", payload, token)


async def send_message(chat_id: int | str, text: str,
                       buttons: list[list[dict]] | None = None,
                       parse_mode: str | None = "HTML") -> dict | None:
    """Public sender. v22-D7: HTML parse mode by default (escaped builders)."""
    token = await get_bot_token()
    return await _send_to(chat_id, text, buttons, token, parse_mode=parse_mode)


async def edit_keyboard(chat_id: int, message_id: int):
    token = await get_bot_token()
    await asyncio.to_thread(_call, "editMessageReplyMarkup", {
        "chat_id": chat_id, "message_id": message_id,
        "reply_markup": {"inline_keyboard": []},
    }, token)


async def edit_message(chat_id: int, message_id: int, text: str):
    token = await get_bot_token()
    await asyncio.to_thread(_call, "editMessageText", {
        "chat_id": chat_id, "message_id": message_id,
        "text": text, "parse_mode": "HTML",
    }, token)


async def answer_callback(callback_id: str, text: str, alert: bool = True):
    token = await get_bot_token()
    await asyncio.to_thread(_call, "answerCallbackQuery", {
        "callback_query_id": callback_id, "text": text, "show_alert": alert,
    }, token)


async def _notify_admins(text: str, buttons: list[list[dict]] | None, *,
                         kind: str, payment_id: int | None = None) -> dict:
    """Shared admin broadcast with a REAL observability contract (v18-1-d).

    Returns ``{"sent": n, "failed": m, "recipients": k,
    "skipped_no_config": bool}`` (+ ``payment_id`` when known):
      - sent    = messages Telegram actually acknowledged ("ok": true);
      - failed  = per-recipient send failures (after the one retry);
      - skipped_no_config = no bot token OR zero recipients — the exact
        production state that used to be a SILENT empty loop.

    One greppable warning per call (never per recipient) when skipped. The
    return value is ADDITIVE: legacy call sites that ignore it keep working.
    """
    result: dict[str, Any] = {"sent": 0, "failed": 0, "recipients": 0,
                              "skipped_no_config": False}
    if payment_id is not None:
        result["payment_id"] = payment_id
    token = await get_bot_token()
    admin_ids = await get_admin_ids()
    if not token:
        log.warning("telegram notify skipped: no bot token configured (kind=%s)", kind)
        result["skipped_no_config"] = True
        result["recipients"] = len(admin_ids)
        return result
    if not admin_ids:
        log.warning("telegram notify skipped: zero admin recipients (kind=%s)", kind)
        result["skipped_no_config"] = True
        return result
    result["recipients"] = len(admin_ids)
    for aid in admin_ids:
        # NOTE: the loop deliberately goes through the module-level send_message
        # (NOT _send_to directly) — the existing monkeypatch contract
        # (tests/test_world_class_v3.py + /api/telegram/test) intercepts
        # notifications there; each send resolves the token itself exactly as
        # the pre-v18 code did.
        try:
            resp = await send_message(aid, text, buttons)
        except Exception as e:  # to_thread dispatch itself — count, never raise
            log.warning("telegram notify send error chat_id=%s (kind=%s): %s",
                        aid, kind, e)
            result["failed"] += 1
            continue
        if isinstance(resp, dict) and resp.get("ok") is True:
            result["sent"] += 1
        else:
            result["failed"] += 1
            log.warning("telegram notify send failed chat_id=%s (kind=%s)", aid, kind)
    return result


async def notify_admins_new_payment(payment_id: int, username: str, amount: int, provider: str, phone: str) -> dict:
    # v22-D7: user fields (username/phone — and provider defensively) go
    # through escape_user_text; ``_``/``*`` in them are now inert (HTML mode).
    msg = (
        f"💳 <b>طلب دفع جديد</b> #{payment_id}\n"
        f"• المستخدم: {escape_user_text(username)}\n"
        f"• المبلغ: {escape_user_text(amount)} د.ل\n"
        f"• المزود: {escape_user_text(provider)}\n"
        f"• الهاتف: {escape_user_text(phone)}"
    )
    buttons = [
        [{"text": "🟢 موافقة", "callback_data": f"pay_app:{payment_id}"}],
        [{"text": "🔴 رفض", "callback_data": f"pay_rej:{payment_id}"}],
    ]
    return await _notify_admins(msg, buttons, kind="payment", payment_id=payment_id)


async def notify_admins_new_subscription(payment_id: int, username: str, amount: float, provider: str, phone: str, plan_name: str = "") -> dict:
    """Notify admins about a new subscription payment."""
    # v22-D7: plan_name is user/tenant data («مميز_السعر» broke Markdown) — escaped.
    msg = (
        f"📋 <b>طلب اشتراك جديد</b> #{payment_id}\n"
        f"• المستخدم: {escape_user_text(username)}\n"
        f"• الباقة: {escape_user_text(plan_name)}\n"
        f"• المبلغ: {escape_user_text(amount)} د.ل\n"
        f"• المزود: {escape_user_text(provider)}\n"
        f"• الهاتف: {escape_user_text(phone)}"
    )
    buttons = [
        [{"text": "🟢 موافقة على التفعيل", "callback_data": f"sub_app:{payment_id}"}],
        [{"text": "🔴 رفض الطلب", "callback_data": f"sub_rej:{payment_id}"}],
    ]
    return await _notify_admins(msg, buttons, kind="subscription", payment_id=payment_id)


async def notify_admins_support_ticket(subject: str, message: str, email: str = "") -> dict:
    """Notify admins about a new support ticket from the platform."""
    # v22-D7: subject/email/body are free user text — the W1-D10 failures
    # (unbalanced ``_`` at byte offsets 128/219/108) were exactly this path.
    msg = (
        f"🎫 <b>طلب دعم جديد</b>\n"
        f"• الموضوع: {escape_user_text(subject or '(بدون موضوع)')}\n"
        f"• البريد: {escape_user_text(email or '—')}\n"
        f"\n{escape_user_text(message[:800])}"
    )
    return await _notify_admins(msg, None, kind="support")
