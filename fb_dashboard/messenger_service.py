"""Messenger ingestion & auto-reply service (world-class launch plan v3 §4.3–4.4).

Before this module: POST /webhook handled ONLY feed comments. Messenger
messages (entry[].messaging[]) were silently dropped — the root cause of
"after connecting the page nothing shows / all zeros".

Responsibilities:
  - resolve the real FB conversation id for a (page, user) pair
  - upsert Conversation + persist inbound/outbound Message rows (dedup-safe)
  - drive the auto-reply engine for inbound messages
  - broadcast new-message alerts over WS (urgent intents) + record BotLog

Entry point (from runner webhook): handle_messaging_event(tenant_id, page_id, messaging)
"""
from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import select

from _utils import utcnow
from database import AsyncSessionLocal
from models import BotLog, Conversation, Message, UsageCounter

log = logging.getLogger("fb-messenger")

# Synthetic conversation-id namespace used when live resolution is impossible
_SYNTH_PREFIX = "w_"


async def resolve_conversation_id(fb_client, page_id: str, sender_id: str) -> str:
    """Return the real Graph API conversation id for (page, sender), or a
    stable synthetic id. Resolution is one cheap call; failures (expired
    token, no permission) fall back to synthetic so storage still works."""
    try:
        r = await fb_client._get(f"{page_id}/conversations", {
            "user_id": sender_id,
            "fields": "id",
            "limit": 1,
        })
        data = (r or {}).get("data") or []
        if data and data[0].get("id"):
            return str(data[0]["id"])
    except Exception as e:
        log.debug("conversation resolve failed: %s", e)
    return f"{_SYNTH_PREFIX}{page_id}_{sender_id}"


async def _get_or_create_conversation(db, tenant_id: int, page_id: str,
                                      fb_conversation_id: str, sender_id: str,
                                      sender_name: str) -> Conversation:
    row = await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.fb_conversation_id == fb_conversation_id,
        )
    )
    conv = row.scalar_one_or_none()
    if conv is None:
        conv = Conversation(
            tenant_id=tenant_id,
            fb_conversation_id=fb_conversation_id,
            fb_user_id=sender_id,
            user_name=sender_name,
        )
        db.add(conv)
        await db.flush()
    else:
        # Upgrade a synthetic conversation to the real id once known
        if conv.fb_conversation_id.startswith(_SYNTH_PREFIX) and not fb_conversation_id.startswith(_SYNTH_PREFIX):
            conv.fb_conversation_id = fb_conversation_id
        if sender_name and conv.user_name != sender_name:
            conv.user_name = sender_name
        if sender_id and conv.fb_user_id != sender_id:
            conv.fb_user_id = sender_id
    return conv


async def persist_message(db, tenant_id: int, page_id: str, messaging: dict,
                          fb_conversation_id: str, *, is_from_page: bool) -> Message | None:
    """Persist one message row. Returns None on dedup/replay or missing mid."""
    msg = messaging.get("message") or {}
    mid = msg.get("mid") or ""
    text = msg.get("text") or ""
    if not mid:
        return None
    sender = messaging.get("sender") or {}
    recipient = messaging.get("recipient") or {}
    sender_id = str(sender.get("id") or "")
    sender_name = str(sender.get("name") or "")
    if is_from_page:
        # echo: sender is the page; the human is the recipient
        sender_id = str(recipient.get("id") or sender_id)
        sender_name = ""

    existing = await db.execute(
        select(Message.id).where(
            Message.tenant_id == tenant_id,
            Message.fb_message_id == mid,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return None  # replay — webhook redelivery

    conv = await _get_or_create_conversation(
        db, tenant_id, page_id, fb_conversation_id, sender_id, sender_name,
    )
    m = Message(
        tenant_id=tenant_id,
        conversation_id=conv.id,
        fb_message_id=mid,
        fb_conversation_id=fb_conversation_id,
        sender_id=sender_id,
        sender_name=sender_name,
        text=text,
        is_from_page=is_from_page,
    )
    db.add(m)

    ts = _ts_from_epoch(msg.get("timestamp"))
    conv.message_count = (conv.message_count or 0) + 1
    conv.last_message_text = text[:500]
    conv.last_message_at = ts or utcnow()
    if not is_from_page:
        conv.unread_count = (conv.unread_count or 0) + 1
    await db.flush()
    return m


def _ts_from_epoch(value) -> object | None:
    """FB sends epoch-ms in message.timestamp."""
    import datetime as _dt
    try:
        if value:
            return _dt.datetime.fromtimestamp(int(value) / 1000, tz=_dt.timezone.utc).replace(tzinfo=None)
    except Exception:
        return None
    return None


async def handle_messaging_event(tenant_id: int, page_id: str, messaging: dict,
                                 fb_client=None) -> dict:
    """Webhook entry: persist + auto-reply. Returns a small status dict.

    Vercel note: this runs inline (no background tasks — platform kills them).
    """
    status = {"stored": False, "replied": False, "is_echo": False}
    sender_id = str((messaging.get("sender") or {}).get("id") or "")
    is_echo = bool(messaging.get("message", {}).get("is_echo"))
    status["is_echo"] = is_echo

    async with AsyncSessionLocal() as db:
        try:
            # Resolve conversation id (best effort; needs fb_client)
            conv_id = f"{_SYNTH_PREFIX}{page_id}_{sender_id}"
            if fb_client is not None and not is_echo and sender_id:
                conv_id = await resolve_conversation_id(fb_client, page_id, sender_id)

            m = await persist_message(db, tenant_id, page_id, messaging, conv_id,
                                      is_from_page=is_echo)
            status["stored"] = m is not None

            await db.commit()
        except Exception as e:
            log.error("persist message failed: %s", e, exc_info=True)
            await db.rollback()

    # Auto-reply only for genuine inbound human messages
    if not is_echo and sender_id and sender_id != str(page_id):
        if not _is_recent(messaging):
            return status  # old redelivery — skip replying
        try:
            from _services import get_bot_engine
            engine = get_bot_engine(fb_client, tenant_id=tenant_id)
            reply_info = await engine.process_single_message(messaging)
            if reply_info:
                status["replied"] = True
                # Persist the bot's reply as an outbound message row
                mid_out = (reply_info.get("mid") or "")
                async with AsyncSessionLocal() as db:
                    if mid_out:
                        await _persist_bot_reply(db, tenant_id, page_id, sender_id, reply_info)
                        await db.commit()
        except Exception as e:
            log.error("auto-reply failed: %s", e, exc_info=True)

    # Urgent-intent alert over WS (mirror of comment alert stage)
    if not is_echo and status["stored"]:
        try:
            from bot import ws_manager
            if ws_manager:
                import asyncio
                asyncio.create_task(ws_manager.broadcast_to_tenant(tenant_id, "alert", {
                    "type": "new_message", "severity": "info",
                    "message": f"رسالة جديدة من {sender_id}",
                    "link": "/messages",
                }))
        except Exception:
            pass

    return status


async def _persist_bot_reply(db, tenant_id: int, page_id: str, user_id: str,
                             reply_info: dict) -> None:
    """Store the bot's outbound reply (conversation was created inbound)."""
    row = await db.execute(
        select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.fb_user_id == user_id,
        ).order_by(Conversation.last_message_at.desc()).limit(1)
    )
    conv = row.scalar_one_or_none()
    if conv is None:
        return
    mid = reply_info.get("mid") or ""
    existing = None
    if mid:
        ex = await db.execute(select(Message.id).where(
            Message.tenant_id == tenant_id, Message.fb_message_id == mid))
        existing = ex.scalar_one_or_none()
    if existing:
        return
    db.add(Message(
        tenant_id=tenant_id,
        conversation_id=conv.id,
        fb_message_id=mid or f"bot_{utcnow().timestamp()}",
        fb_conversation_id=conv.fb_conversation_id,
        sender_id=str(page_id),
        sender_name="SmartBot",
        text=reply_info.get("text", ""),
        is_from_page=True,
        replied_by_bot=True,
    ))
    conv.message_count = (conv.message_count or 0) + 1
    conv.last_message_text = reply_info.get("text", "")[:500]
    conv.last_message_at = utcnow()


def _is_recent(messaging: dict) -> bool:
    """Only auto-reply to messages younger than 10 minutes (replay guard)."""
    ts = (messaging.get("message") or {}).get("timestamp")
    try:
        if ts:
            import time as _t
            return (int(_t.time() * 1000) - int(ts)) < 10 * 60 * 1000
    except Exception:
        pass
    return True


async def mark_conversation_read(tenant_id: int, fb_conversation_id: str) -> None:
    """Reset unread counter when the inbox UI opens a conversation."""
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(Conversation).where(
                Conversation.tenant_id == tenant_id,
                Conversation.fb_conversation_id == fb_conversation_id,
            )
        )
        conv = row.scalar_one_or_none()
        if conv:
            conv.unread_count = 0
            await db.commit()
