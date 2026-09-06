from __future__ import annotations

"""Team Collaboration Engine — Approvals, notes, activity tracking.
Enterprise team features matching Hootsuite + Respond.io.
"""
import json
import logging
from datetime import timedelta
from typing import Any

from _utils import iso_z, utcnow
from models import AnalyticsEvent, BotLog, Reply, User
from sqlalchemy import desc, func, or_, select

log = logging.getLogger("fb-team")


class TeamEngine:
    """Team collaboration features — approval workflows, internal notes, activity log."""

    async def get_team_members(self, session, tenant_id: int = 0) -> list[dict]:
        """List all users with stats: replies count (via BotLog mentions), last active.

        v5 §4 (N+1 fix): was 2 queries PER USER (count + latest); now one grouped
        message-count query + one per-tenant latest-log query, attributed to
        usernames in Python — the LIKE proxy stays semantically identical.
        """
        rows = await session.execute(select(User).where(User.tenant_id == tenant_id).order_by(User.id))
        users = rows.scalars().all()
        if not users:
            return []

        usernames = [u.username for u in users]
        # reply-count proxy: group logs by message, then attribute "User <name>" hits
        count_map: dict[str, int] = {name: 0 for name in usernames}
        grouped = await session.execute(
            select(BotLog.message, func.count(BotLog.id))
            .where(
                BotLog.level != "DEBUG",
                BotLog.tenant_id == tenant_id,
                or_(*[BotLog.message.contains(f"User {name}") for name in usernames]),
            )
            .group_by(BotLog.message)
        )
        for msg, cnt in grouped.all():
            for name in usernames:
                if f"User {name}" in (msg or ""):
                    count_map[name] += int(cnt)

        # latest activity per user: single tenant log scan (newest first)
        latest_map: dict[str, Any] = {}
        log_rows = await session.execute(
            select(BotLog.message, BotLog.created_at)
            .where(BotLog.tenant_id == tenant_id,
                   or_(*[BotLog.message.contains(f"User {name}") for name in usernames]))
            .order_by(desc(BotLog.created_at))
            .limit(500)
        )
        for msg, created in log_rows.all():
            for name in usernames:
                if name not in latest_map and f"User {name}" in (msg or ""):
                    latest_map[name] = created

        result = []
        for u in users:
            log_count = count_map.get(u.username, 0)
            last_active = latest_map.get(u.username)
            result.append({
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "created_at": iso_z(u.created_at),
                "replies_count": log_count,
                "last_active": iso_z(last_active),
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
                "time": iso_z(r.created_at),
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
                "time": iso_z(r.created_at),
            })

        evt_stmt = select(AnalyticsEvent).where(
            AnalyticsEvent.tenant_id == tenant_id, AnalyticsEvent.created_at >= cutoff
        ).order_by(desc(AnalyticsEvent.created_at)).limit(50)
        for e in (await session.execute(evt_stmt)).scalars().all():
            # v11 fix (BUG found by test_v11_publisher_team): the JSON column
            # may hand back a dict (its natural type) — the old json.loads(dict)
            # raised TypeError and the except branch itself crashed on
            # dict[:100] → 500 on /api/team/activity. Accept both shapes.
            raw = e.metadata_json or {}
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except Exception:
                    log.warning(f"Failed to parse metadata_json for event {e.id}: {raw[:100]}")
                    raw = {}
            meta = raw if isinstance(raw, dict) else {}
            activities.append({
                "type": "event",
                "user": meta.get("user", "system"),
                "action": e.event_type,
                "detail": json.dumps(meta, ensure_ascii=False)[:100],
                "time": iso_z(e.created_at),
            })

        activities.sort(key=lambda a: a.get("time", ""), reverse=True)
        return activities[:50]

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
        rows = await session.execute(select(User).where(User.tenant_id == tenant_id, User.role.in_(["admin", "editor"])).order_by(User.id))
        users = rows.scalars().all()
        # ponytail: batch all log queries via single grouped query instead of N+1
        handled_map: dict[str, int] = {}
        if users:
            thirty_days_ago = utcnow() - timedelta(days=30)
            counts = await session.execute(
                select(BotLog.message, func.count(BotLog.id))
                .where(
                    BotLog.level != "DEBUG",
                    BotLog.created_at >= thirty_days_ago,
                    # v11 fix (BUG found by test_v11_publisher_team): usernames
                    # are only unique PER TENANT (since v10-A1) — without this
                    # filter, another tenant's log rows with the same username
                    # leak into this tenant's performance numbers.
                    BotLog.tenant_id == tenant_id,
                )
                .group_by(BotLog.message)
            )
            for msg, cnt in counts.all():
                for u in users:
                    if f"User {u.username}" in msg:
                        handled_map[u.username] = handled_map.get(u.username, 0) + cnt
                        break
        result = []
        for u in users:
            result.append({
                "username": u.username,
                "role": u.role,
                "replies_handled": handled_map.get(u.username, 0),
                "online_status": "offline",
            })
        return result

    def _extract_username(self, message: str) -> str:
        """Extract username from BotLog message like 'User admin replied to ...'"""
        if "User " in message:
            parts = message.split("User ", 1)
            if len(parts) > 1:
                username = parts[1].split(" ")[0]
                return username
        return "system"
