"""Telegram admin notifications for payment approvals."""
import os, logging, asyncio
from typing import Any
import httpx

log = logging.getLogger("fb-tg")

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
ADMIN_IDS = [int(x) for x in os.environ.get("TELEGRAM_ADMIN_IDS", "").split(",") if x.strip().isdigit()]

_API_BASE = "https://api.telegram.org/bot"


def _call(method: str, payload: dict) -> dict | None:
    if not BOT_TOKEN:
        return None
    try:
        r = httpx.post(f"{_API_BASE}{BOT_TOKEN}/{method}", json=payload, timeout=10)
        return r.json() if r.is_success else None
    except Exception as e:
        log.warning("Telegram %s failed: %s", method, e)
        return None


async def send_message(chat_id: int, text: str, buttons: list[list[dict]] | None = None) -> dict | None:
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    if buttons:
        payload["reply_markup"] = {"inline_keyboard": buttons}
    return await asyncio.to_thread(_call, "sendMessage", payload)


async def edit_keyboard(chat_id: int, message_id: int):
    await asyncio.to_thread(_call, "editMessageReplyMarkup", {
        "chat_id": chat_id, "message_id": message_id,
        "reply_markup": {"inline_keyboard": []},
    })


async def edit_message(chat_id: int, message_id: int, text: str):
    await asyncio.to_thread(_call, "editMessageText", {
        "chat_id": chat_id, "message_id": message_id,
        "text": text, "parse_mode": "Markdown",
    })


async def answer_callback(callback_id: str, text: str, alert: bool = True):
    await asyncio.to_thread(_call, "answerCallbackQuery", {
        "callback_query_id": callback_id, "text": text, "show_alert": alert,
    })


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
    for aid in ADMIN_IDS:
        await send_message(aid, msg, buttons)
