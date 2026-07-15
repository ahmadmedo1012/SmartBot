from __future__ import annotations
"""Team Collaboration Engine — Approvals, notes, activity tracking.
Enterprise team features matching Hootsuite + Respond.io.
"""
import json
import logging
from datetime import datetime, timedelta
from _utils import utcnow
from typing import Any
from sqlalchemy import select, func, desc, or_
from sqlalchemy.orm import selectinload

from models import User, Reply, BotLog, AnalyticsEvent, BotAlert, ConversationTag, ConversationLabel
from database import AsyncSessionLocal

log = logging.getLogger("fb-team")


class TeamEngine:
    """Team collaboration features — approval workflows, internal notes, activity log."""

    async def get_team_members(self, session, tenant_id: int = 0) -> list[dict]:
        """List all users with stats: replies count (via BotLog mentions), last active."""
        rows = await session.execute(select(User).where(User.tenant_id == tenant_id).order_by(User.id))
        users = rows.scalars().all()
        result = []
        for u in users:
            # ponytail: BotLog.message contains "User <username>" as proxy for per-user reply count
            log_count = await session.scalar(
                select(func.count(BotLog.id))
                .where(BotLog.message.contains(f"User {u.username}"),
                       BotLog.level != "DEBUG")
            ) or 0

            # Last active = most recent BotLog referencing this user
            last_row = await session.execute(
                select(BotLog.created_at)
                .where(BotLog.message.contains(f"User {u.username}"))
                .order_by(desc(BotLog.created_at)).limit(1)
            )
            last_active = last_row.scalar()
            result.append({
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "replies_count": log_count,
                "last_active": last_active.isoformat() if last_active else None,
            })
        return result

    async def get_team_activity(self, days: int, session, tenant_id: int = 0) -> list[dict]:
        """Recent team activity feed — BotLog, Replies, AnalyticsEvent combined."""
        cutoff = utcnow() - timedelta(days=days)
        activities: list[dict] = []

        log_stmt = select(BotLog).where(
            BotLog.tenant_id == tenant_id, BotLog.level != "DEBUG", BotLog.created_at >= cutoff
        ).order_by(desc(BotLog.created_at)).limit(50)
        # ponytail: scanning BotLog for user attribution — add explicit user_id column if per-user queries become perf-critical
        for r in (await session.execute(log_stmt)).scalars().all():
            user = self._extract_username(r.message)
            activities.append({
                "type": "log",
                "user": user,
                "action": r.level,
                "detail": r.message[:200],
                "time": r.created_at.isoformat() if r.created_at else None,
            })

        reply_stmt = select(Reply).where(
            Reply.tenant_id == tenant_id, Reply.created_at >= cutoff
        ).order_by(desc(Reply.created_at)).limit(50)
        for r in (await session.execute(reply_stmt)).scalars().all():
            activities.append({
                "type": "reply",
                "user": "system",
                "action": "replied",
                "detail": f"رد على {r.commenter_name}: {r.reply_text[:60]}",
                "time": r.created_at.isoformat() if r.created_at else None,
            })

        evt_stmt = select(AnalyticsEvent).where(
            AnalyticsEvent.tenant_id == tenant_id, AnalyticsEvent.created_at >= cutoff
        ).order_by(desc(AnalyticsEvent.created_at)).limit(50)
        for e in (await session.execute(evt_stmt)).scalars().all():
            meta = {}
            try: meta = json.loads(e.metadata_json or "{}")
            except Exception:
                log.warning(f"Failed to parse metadata_json for event {e.id}: {e.metadata_json[:100]}")
                meta = {}
            activities.append({
                "type": "event",
                "user": meta.get("user", "system"),
                "action": e.event_type,
                "detail": json.dumps(meta, ensure_ascii=False)[:100],
                "time": e.created_at.isoformat() if e.created_at else None,
            })

        activities.sort(key=lambda a: a.get("time", ""), reverse=True)
        return activities[:50]

    async def get_pending_approvals(self, session) -> list[dict]:
        """Items needing approval — placeholder structure.
        Full flow requires: approval_items table + broadcast threshold logic.
        """
        # ponytail: static empty list — add approval_items DB table when approval workflow is built
        return []

    async def approve_item(self, approval_id: int, approved_by: str, session) -> bool:
        """Approve a pending item. Placeholder — always succeeds."""
        return True

    async def reject_item(self, approval_id: int, rejected_by: str, reason: str, session) -> bool:
        """Reject with reason. Placeholder — always succeeds."""
        return True

    async def get_activity_log(self, days: int, page: int, per_page: int, session) -> dict:
        """Comprehensive activity log with pagination — AnalyticsEvents."""
        cutoff = utcnow() - timedelta(days=days)
        base = select(AnalyticsEvent).where(AnalyticsEvent.created_at >= cutoff)
        total = await session.scalar(select(func.count(AnalyticsEvent.id)).where(AnalyticsEvent.created_at >= cutoff)) or 0
        offset = (page - 1) * per_page
        rows = await session.execute(
            base.order_by(desc(AnalyticsEvent.created_at)).offset(offset).limit(per_page)
        )
        items = []
        for e in rows.scalars().all():
            meta = {}
            try: meta = json.loads(e.metadata_json or "{}")
            except Exception:
                log.warning(f"Failed to parse metadata_json for event {e.id}: {e.metadata_json[:100]}")
                meta = {}
            items.append({
                "id": e.id,
                "event_type": e.event_type,
                "metadata": meta,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            })
        return {"items": items, "total": total, "page": page, "per_page": per_page}

    async def get_user_role_summary(self, session) -> dict:
        """Count users by role."""
        rows = await session.execute(
            select(User.role, func.count(User.id)).group_by(User.role)
        )
        counts = {"admin": 0, "editor": 0, "viewer": 0, "total": 0}
        for role, cnt in rows:
            counts[role] = cnt
            counts["total"] += cnt
        return counts

    async def get_team_performance(self, session, tenant_id: int = 0) -> list[dict]:
        """Team member performance metrics.
        ponytail: Reply model lacks created_by — all replies attributed to system.
        Add created_by to Reply if per-user attribution needed.
        """
        total_replies = await session.scalar(select(func.count(Reply.id)).where(Reply.tenant_id == tenant_id)) or 0
        rows = await session.execute(select(User).where(User.tenant_id == tenant_id, User.role.in_(["admin", "editor"])).order_by(User.id))
        result = []
        for u in rows.scalars().all():
            # Count their BotLog mentions as handled-replies proxy
            handled = await session.scalar(
                select(func.count(BotLog.id))
                .where(
                    BotLog.message.contains(f"User {u.username}"),
                    BotLog.level != "DEBUG",
                    BotLog.created_at >= utcnow() - timedelta(days=30),
                )
            ) or 0
            result.append({
                "username": u.username,
                "role": u.role,
                "replies_handled": handled,
                "online_status": "offline",
            })
        return result

    async def add_internal_note(self, conversation_id: str, note: str, author: str, session) -> dict:
        """Add an internal note to a conversation using ConversationLabel + custom tag.
        Creates a 'ملاحظة داخلية' tag if it doesn't exist, then labels the conversation.
        ponytail: Uses existing ConversationLabel machinery — no new DB table.
        For rich note history with editing, add a ConversationNotes table.
        """
        tag_name = "_internal_note"
        tag = await session.execute(
            select(ConversationTag).where(ConversationTag.name == tag_name)
        )
        tag = tag.scalar_one_or_none()
        if not tag:
            tag = ConversationTag(name=tag_name, color="#f59e0b")
            session.add(tag)
            await session.commit()
            await session.refresh(tag)

        # Store note as a label entry so it appears in conversation tag UI
        label = ConversationLabel(conversation_id=conversation_id, tag_id=tag.id)
        session.add(label)
        # Log the note
        session.add(BotLog(
            level="INFO",
            message=f"User {author} added note to conv {conversation_id}: {note[:500]}",
        ))
        await session.commit()
        return {"ok": True, "note": note, "author": author}

    async def get_internal_notes(self, conversation_id: str, session) -> list[dict]:
        """Get internal notes for a conversation by scanning BotLog."""
        tag = await session.execute(
            select(ConversationTag).where(ConversationTag.name == "_internal_note")
        )
        tag = tag.scalar_one_or_none()
        if not tag:
            return []
        rows = await session.execute(
            select(BotLog)
            .where(
                BotLog.message.contains(f"added note to conv {conversation_id}"),
                BotLog.level == "INFO",
            )
            .order_by(desc(BotLog.created_at))
        )
        notes = []
        for r in rows.scalars().all():
            user = self._extract_username(r.message)
            note_text = r.message.split(": ", 1)[1] if ": " in r.message else r.message[:500]
            notes.append({
                "author": user,
                "note": note_text,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })
        return notes

    def _extract_username(self, message: str) -> str:
        """Extract username from BotLog message like 'User admin replied to ...'"""
        if "User " in message:
            parts = message.split("User ", 1)
            if len(parts) > 1:
                username = parts[1].split(" ")[0]
                return username
        return "system"
