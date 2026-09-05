from __future__ import annotations
"""Telegram admin notifications for payment approvals (world-class plan v3 §5).

Smart-Menu pattern applied: the bot token + admin recipients resolve from
SystemConfig (DB — owner-editable from /admin/settings) with env fallback,
and admin recipients = env TELEGRAM_ADMIN_IDS ∪ DB TelegramApprover rows.

BEFORE: BOT_TOKEN/ADMIN_IDS were env-only. With no Vercel env vars set (the
production reality) every notify_* silently iterated an empty recipient list
— the owner received ZERO telegram notifications. The TelegramApprover table
existed and had an admin UI, but this module never consulted it.
"""
import asyncio
import logging
import os
from typing import Any

import httpx

log = logging.getLogger("fb-tg")

_ENV_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
_ENV_ADMIN_IDS = [int(x) for x in os.environ.get("TELEGRAM_ADMIN_IDS", "").split(",") if x.strip().isdigit()]

_API_BASE = "https://api.telegram.org/bot"

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
    if not token:
        return None
    try:
        r = httpx.post(f"{_API_BASE}{token}/{method}", json=payload, timeout=10)
        return r.json() if r.is_success else None
    except Exception as e:
        log.warning("Telegram %s failed: %s", method, e)
        return None


async def send_message(chat_id: int | str, text: str,
                       buttons: list[list[dict]] | None = None) -> dict | None:
    token = await get_bot_token()
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    if buttons:
        payload["reply_markup"] = {"inline_keyboard": buttons}
    return await asyncio.to_thread(_call, "sendMessage", payload, token)


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
        "text": text, "parse_mode": "Markdown",
    }, token)


async def answer_callback(callback_id: str, text: str, alert: bool = True):
    token = await get_bot_token()
    await asyncio.to_thread(_call, "answerCallbackQuery", {
        "callback_query_id": callback_id, "text": text, "show_alert": alert,
    }, token)


async def notify_admins_new_payment(payment_id: int, username: str, amount: int, provider: str, phone: str):
    msg = (
        f"💳 *طلب دفع جديد* #{payment_id}\n"
        f"• المستخدم: {username}\n"
        f"• المبلغ: {amount} د.ل\n"
        f"• المزود: {provider}\n"
        f"• الهاتف: {phone}"
    )
    buttons = [
        [{"text": "🟢 موافقة", "callback_data": f"pay_app:{payment_id}"}],
        [{"text": "🔴 رفض", "callback_data": f"pay_rej:{payment_id}"}],
    ]
    for aid in await get_admin_ids():
        await send_message(aid, msg, buttons)


async def notify_admins_new_subscription(payment_id: int, username: str, amount: float, provider: str, phone: str, plan_name: str = ""):
    """Notify admins about a new subscription payment."""
    msg = (
        f"📋 *طلب اشتراك جديد* #{payment_id}\n"
        f"• المستخدم: {username}\n"
        f"• الباقة: {plan_name}\n"
        f"• المبلغ: {amount} د.ل\n"
        f"• المزود: {provider}\n"
        f"• الهاتف: {phone}"
    )
    buttons = [
        [{"text": "🟢 موافقة على التفعيل", "callback_data": f"sub_app:{payment_id}"}],
        [{"text": "🔴 رفض الطلب", "callback_data": f"sub_rej:{payment_id}"}],
    ]
    for aid in await get_admin_ids():
        await send_message(aid, msg, buttons)


async def notify_admins_support_ticket(subject: str, message: str, email: str = ""):
    """Notify admins about a new support ticket from the platform."""
    msg = (
        f"🎫 *طلب دعم جديد*\n"
        f"• الموضوع: {subject or '(بدون موضوع)'}\n"
        f"• البريد: {email or '—'}\n"
        f"\n{message[:800]}"
    )
    for aid in await get_admin_ids():
        await send_message(aid, msg)
