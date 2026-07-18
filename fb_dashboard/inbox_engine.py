from __future__ import annotations
"""Omnichannel Inbox Engine — Unified conversation management across platforms.
Handles Messenger, Instagram, WhatsApp, Telegram conversations in one inbox.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from models import ConversationTag, ConversationLabel, Reply, ConversationNote, ConversationAssignee
from fb_client import FBClient
from database import AsyncSessionLocal

log = logging.getLogger("fb-inbox")


# ── Platform status markers ──────────────────────────────────────────────
# Returned as conversation items / message placeholders when a platform
# hasn't been fully configured via the Graph API / Business settings.
_PLATFORM_STATUS = {
    "ig_": {
        "id": "ig_needs_config",
        "platform": "instagram",
        "status": "needs_config",
        "sender_platform": "instagram",
        "subject": "إنستغرام — يحتاج إلى ربط",
        "message": "ربط حساب إنستغرام من الإعدادات",
        "config_guide": "أنشئ تطبيق فيسبوك واربط حساب إنستغرام عبر Graph API",
        "senders": [],
        "message_count": 0,
        "unread_count": 0,
        "updated_time": "",
        "tags": [],
        "platform_metadata": {},
    },
    "wa_": {
        "id": "wa_needs_config",
        "platform": "whatsapp",
        "status": "needs_config",
        "sender_platform": "whatsapp",
        "subject": "واتساب — يحتاج إلى ربط",
        "message": "ربط واتساب من الإعدادات",
        "config_guide": "افتح واتساب → الأدوات → ربط الحساب",
        "senders": [],
        "message_count": 0,
        "unread_count": 0,
        "updated_time": "",
        "tags": [],
        "platform_metadata": {},
    },
    "tg_": {
        "id": "tg_needs_config",
        "platform": "telegram",
        "status": "needs_config",
        "sender_platform": "telegram",
        "subject": "تيليجرام — الاتصال متاح",
        "message": "الاتصال متاح عبر Telegram Bot API — ربط من الإعدادات",
        "config_guide": "أنشئ بوت عبر @BotFather وأضف التوكن في الإعدادات",
        "senders": [],
        "message_count": 0,
        "unread_count": 0,
        "updated_time": "",
        "tags": [],
        "platform_metadata": {},
    },
}

_NEEDS_CONFIG_PLATFORMS = {  # prefixes whose real API integration needs user config
    "ig_": "instagram",
    "wa_": "whatsapp",
    "tg_": "telegram",
}


def _needs_config_item(prefix: str) -> dict:
    """Build a conversation-like item indicating a platform needs config."""
    base = dict(_PLATFORM_STATUS[prefix])
    base["id"] = f"{prefix}needs_config"
    return base


def _needs_config_msg(prefix: str) -> dict:
    """Build a message-like item indicating a platform needs config."""
    info = _PLATFORM_STATUS[prefix]
    return {
        "id": f"{prefix}needs_config",
        "message": info["message"],
        "config_guide": info.get("config_guide", ""),
        "platform": info["sender_platform"],
        "status": "needs_config",
        "from": {"id": "", "name": "النظام"},
        "created_time": "",
    }


class InboxEngine:
    """Unified inbox that normalizes conversations across platforms."""

    # Map platform prefix → display name
    _PLATFORM_PREFIX = {"msg_": "messenger", "ig_": "instagram", "wa_": "whatsapp", "tg_": "telegram"}

    def __init__(self, fb: FBClient):
        self.fb = fb

    # ── Fetch conversations ────────────────────────────────────────────

    async def fetch_all_conversations(self, session) -> list[dict]:
        """Aggregate conversations from ALL platforms into unified format."""
        result = []
        messenger = await self._fetch_messenger(session)
        result.extend(messenger)
        # Append platform status markers for unconfigured platforms
        for prefix in ("ig_", "wa_", "tg_"):
            result.append(_needs_config_item(prefix))
        return result

    async def _fetch_messenger(self, session) -> list[dict]:
        """Fetch Messenger conversations and normalize."""
        raw = await self.fb.get_conversations(50)
        if not raw:
            return []
        items = []
        ids = [c["id"] for c in raw]
        # Batch-load tags for all conversations
        tag_map = {}
        if ids:
            lbls = await session.execute(
                select(ConversationLabel, ConversationTag)
                .join(ConversationTag, ConversationLabel.tag_id == ConversationTag.id)
                .where(ConversationLabel.conversation_id.in_(ids))
            )
            for lbl, tag in lbls:
                tag_map.setdefault(lbl.conversation_id, []).append(
                    {"id": tag.id, "name": tag.name, "color": tag.color}
                )

        for c in raw:
            cid = c["id"]
            senders = c.get("senders", {}).get("data", []) if isinstance(c.get("senders"), dict) else []
            items.append({
                "id": f"msg_{cid}",
                "platform": "messenger",
                "subject": c.get("subject", ""),
                "senders": [{"id": s.get("id", ""), "name": s.get("name", "")} for s in senders],
                "message_count": c.get("message_count", 0),
                "unread_count": c.get("unread_count", 0),
                "last_message": "",
                "updated_time": c.get("updated_time", ""),
                "tags": tag_map.get(cid, []),
                "platform_metadata": c,
            })
        return items

    # ── Get messages for a conversation ─────────────────────────────────

    async def get_messages(self, conversation_id: str, session) -> list[dict]:
        """Get messages for ANY platform conversation."""
        prefix, real_id = self._parse_id(conversation_id)
        platform = self._PLATFORM_PREFIX.get(prefix, "messenger")

        if prefix == "msg_":
            raw = await self.fb.get_conversation_messages(real_id)
            return [{
                "id": m["id"],
                "message": m.get("message", ""),
                "from": {"id": m.get("from", {}).get("id", ""), "name": m.get("from", {}).get("name", "")},
                "created_time": m.get("created_time", ""),
                "platform": "messenger",
            } for m in (raw or [])]

        if prefix in _NEEDS_CONFIG_PLATFORMS:
            log.info(f"get_messages: {platform} needs config (id={conversation_id})")
            return [_needs_config_msg(prefix)]

        log.info(f"get_messages: unknown platform {platform} (id={conversation_id})")
        return []

    # ── Send reply ─────────────────────────────────────────────────────

    async def send_reply(self, conversation_id: str, message: str, session) -> dict | bool:
        """Route reply to correct platform. Returns result dict or False."""
        prefix, real_id = self._parse_id(conversation_id)
        platform = self._PLATFORM_PREFIX.get(prefix, "messenger")

        if prefix in _NEEDS_CONFIG_PLATFORMS:
            info = _PLATFORM_STATUS[prefix]
            log.info(f"send_reply: {platform} needs config (id={conversation_id})")
            return {
                "status": "needs_config",
                "platform": info["sender_platform"],
                "message": info["message"],
                "config_guide": info.get("config_guide", ""),
            }

        if prefix != "msg_":
            log.info(f"send_reply: unknown platform {platform} (id={conversation_id})")
            return False

        result = await self.fb.send_conversation_message(real_id, message)
        if result:
            try:
                s = Reply(
                    fb_comment_id=f"inbox_{conversation_id}_{datetime.now(timezone.utc).timestamp()}",
                    fb_post_id=real_id,
                    commenter_name="",
                    comment_text="",
                    reply_text=message[:500],
                )
                session.add(s)
                await session.commit()
            except Exception:
                await session.rollback()
                log.exception("Failed to log reply in inbox_engine")
        return bool(result)

    # ── Search ──────────────────────────────────────────────────────────

    async def search_conversations(self, query: str, conversations: list[dict]) -> list[dict]:
        """Client-side search across already-fetched conversations."""
        if not query:
            return conversations
        q = query.lower().strip()
        res = []
        for c in conversations:
            subj = c.get("subject", "").lower()
            if q in subj:
                res.append(c)
                continue
            for s in c.get("senders", []):
                if q in (s.get("name", "") or "").lower():
                    res.append(c)
                    break
        return res

    # ── Stats ───────────────────────────────────────────────────────────

    async def get_conversation_stats(self, session) -> dict:
        """Return aggregate conversation statistics."""
        try:
            raw = await self.fb.get_conversations(50)
            total = len(raw or [])
            unread = sum(1 for c in (raw or []) if c.get("unread_count", 0) > 0)
            messages_today = await session.scalar(
                select(func.count(Reply.id))
            ) or 0
            return {
                "total_conversations": total,
                "unread_count": unread,
                "platform_breakdown": {"messenger": total, "instagram": 0, "whatsapp": 0, "telegram": 0},
                "messages_today": messages_today,
            }
        except Exception as e:
            log.error(f"get_conversation_stats error: {e}")
            return {"total_conversations": 0, "unread_count": 0, "platform_breakdown": {}, "messages_today": 0}

    async def get_notes(self, conversation_id: str, session) -> list[dict]:
        """Get all notes for a conversation."""
        rows = await session.execute(
            select(ConversationNote)
            .where(ConversationNote.conversation_id == conversation_id)
            .order_by(ConversationNote.created_at.desc())
        )
        return [{
            "id": r.id,
            "content": r.content,
            "created_by": r.created_by,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        } for r in rows.scalars()]

    async def add_note(self, conversation_id: str, content: str, created_by: str, session) -> dict | None:
        """Add a note to a conversation."""
        note = ConversationNote(
            conversation_id=conversation_id,
            content=content,
            created_by=created_by,
        )
        session.add(note)
        await session.commit()
        return {
            "id": note.id,
            "content": note.content,
            "created_by": note.created_by,
            "created_at": note.created_at.isoformat() if note.created_at else "",
        }

    async def delete_note(self, note_id: int, session) -> bool:
        """Delete a note by ID."""
        row = await session.get(ConversationNote, note_id)
        if not row:
            return False
        await session.delete(row)
        await session.commit()
        return True

    async def assign_user(self, conversation_id: str, user_id: int, session) -> bool:
        """Assign a user to a conversation."""
        existing = await session.execute(
            select(ConversationAssignee).where(
                and_(ConversationAssignee.conversation_id == conversation_id, ConversationAssignee.user_id == user_id))
        )
        if existing.scalar_one_or_none():
            return True
        asgn = ConversationAssignee(conversation_id=conversation_id, user_id=user_id)
        session.add(asgn)
        await session.commit()
        return True

    async def unassign_user(self, conversation_id: str, user_id: int, session) -> bool:
        """Remove a user assignment from a conversation."""
        row = await session.execute(
            select(ConversationAssignee).where(
                and_(ConversationAssignee.conversation_id == conversation_id, ConversationAssignee.user_id == user_id))
        )
        r = row.scalar_one_or_none()
        if not r:
            return False
        await session.delete(r)
        await session.commit()
        return True

    async def get_assignee(self, conversation_id: str, session) -> dict | None:
        """Get the assigned user for a conversation."""
        row = await session.execute(
            select(ConversationAssignee).where(ConversationAssignee.conversation_id == conversation_id)
        )
        r = row.scalar_one_or_none()
        if not r:
            return None
        from models import User
        user = await session.get(User, r.user_id)
        return {"user_id": r.user_id, "username": user.username if user else "", "assigned_at": r.assigned_at.isoformat() if r.assigned_at else ""}

    # ── Auto-assign tags ───────────────────────────────────────────────

    async def auto_assign_tag(self, conversation: dict, session) -> int | None:
        """Check conversation subject/sender against keyword rules → assign tag."""
        subject = (conversation.get("subject", "") or "").lower()
        sender_text = " ".join(
            s.get("name", "") for s in (conversation.get("senders") or [])
        ).lower()
        text = f"{subject} {sender_text}"

        rules = [
            ({"order", "طلب"}, "طلبات"),
            ({"support", "دعم", "مساعدة"}, "دعم"),
            ({"complaint", "شكوى"}, "شكاوى"),
        ]

        tag_name = None
        for keywords, name in rules:
            if keywords & set(text.split()):
                tag_name = name
                break

        if not tag_name:
            return None

        # Find or create the tag
        tag = await session.scalar(
            select(ConversationTag).where(ConversationTag.name == tag_name)
        )
        if not tag:
            tag = ConversationTag(name=tag_name)
            session.add(tag)
            await session.flush()

        # Build conversation_id with prefix
        conv_cid = f"msg_{conversation.get('id', '').replace('msg_', '')}"

        # Check if already labeled
        exists = await session.scalar(
            select(ConversationLabel).where(
                ConversationLabel.conversation_id == conv_cid,
                ConversationLabel.tag_id == tag.id,
            )
        )
        if not exists:
            session.add(ConversationLabel(conversation_id=conv_cid, tag_id=tag.id))
            await session.commit()

        return tag.id

    # ── Helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _parse_id(conversation_id: str) -> tuple[str, str]:
        """Split prefixed ID into (prefix, real_id)."""
        for prefix in ("msg_", "ig_", "wa_", "tg_"):
            if conversation_id.startswith(prefix):
                return prefix, conversation_id[len(prefix):]
        return "msg_", conversation_id  # bare ID → assume Messenger
