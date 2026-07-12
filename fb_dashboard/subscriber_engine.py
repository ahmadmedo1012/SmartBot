"""Subscriber Engine — Manage subscribers, tags, segments across platforms."""
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, or_, func, desc, and_, exists, delete
from sqlalchemy.exc import IntegrityError

from models import Subscriber, Tag, SubscriberTag, Reply, FlowExecution, SequenceSubscription
from database import AsyncSessionLocal

log = logging.getLogger("fb-subscriber")


class SubscriberEngine:
    """CRUD + search + tagging for subscribers."""

    async def get_or_create(
        self,
        fb_user_id: str,
        name: str = "",
        platform: str = "messenger",
        page_id: str = "",
        session=None,
    ) -> Subscriber:
        """Find subscriber by fb_user_id or create one."""
        close = False
        if session is None:
            session = AsyncSessionLocal()
            close = True
        try:
            r = await session.execute(select(Subscriber).where(Subscriber.fb_user_id == fb_user_id))
            sub = r.scalar_one_or_none()
            if sub:
                sub.last_interaction_at = datetime.now(timezone.utc)
                if name and not sub.name:
                    sub.name = name
                    sub.first_name = name.split()[0]
            else:
                first = name.split()[0] if name else fb_user_id[-4:]
                sub = Subscriber(
                    fb_user_id=fb_user_id,
                    name=name,
                    first_name=first,
                    platform=platform,
                    page_id=page_id,
                    first_seen_at=datetime.now(timezone.utc),
                    last_interaction_at=datetime.now(timezone.utc),
                )
                session.add(sub)
            await session.commit()
            await session.refresh(sub)
            return sub
        finally:
            if close:
                await session.close()

    async def search(
        self,
        query: str = "",
        platform: str = "",
        tag: str = "",
        page: int = 1,
        per_page: int = 20,
        session=None,
        tenant_id: int = 0,
    ) -> dict:
        """Search subscribers with pagination, platform/tag filters."""
        close = False
        if session is None:
            session = AsyncSessionLocal()
            close = True
        try:
            base = select(Subscriber).where(Subscriber.tenant_id == tenant_id)
            count_base = select(func.count(Subscriber.id)).where(Subscriber.tenant_id == tenant_id)

            # query filter — name, first_name, fb_user_id
            if query:
                like = f"%{query}%"
                filt = or_(
                    Subscriber.name.ilike(like),
                    Subscriber.first_name.ilike(like),
                    Subscriber.fb_user_id.ilike(like),
                )
                base = base.where(filt)
                count_base = count_base.where(filt)

            if platform:
                base = base.where(Subscriber.platform == platform)
                count_base = count_base.where(Subscriber.platform == platform)

            # tag filter via SubscriberTag + Tag join
            if tag:
                tag_exists = (
                    select(SubscriberTag.subscriber_id)
                    .join(Tag, SubscriberTag.tag_id == Tag.id)
                    .where(Tag.name == tag)
                )
                base = base.where(Subscriber.id.in_(tag_exists))
                count_base = count_base.where(Subscriber.id.in_(tag_exists))

            # total count
            cr = await session.execute(count_base)
            total = cr.scalar() or 0

            if total == 0:
                return {"items": [], "total": 0, "page": page, "per_page": per_page}

            # paginated query
            offset = (page - 1) * per_page
            base = (
                base.order_by(desc(Subscriber.last_interaction_at))
                .offset(offset)
                .limit(per_page)
            )
            r = await session.execute(base)
            subs = r.scalars().all()

            items = []
            for sub in subs:
                # load tags
                tag_r = await session.execute(
                    select(Tag.id, Tag.name, Tag.color)
                    .join(SubscriberTag, Tag.id == SubscriberTag.tag_id)
                    .where(SubscriberTag.subscriber_id == sub.id)
                )
                tags = [{"id": t.id, "name": t.name, "color": t.color} for t in tag_r]

                items.append(
                    {
                        "id": sub.id,
                        "fb_user_id": sub.fb_user_id,
                        "name": sub.name,
                        "first_name": sub.first_name,
                        "platform": sub.platform,
                        "tags": tags,
                        "reply_count": sub.reply_count,
                        "first_seen_at": _fmt_dt(sub.first_seen_at),
                        "last_interaction_at": _fmt_dt(sub.last_interaction_at),
                    }
                )

            return {"items": items, "total": total, "page": page, "per_page": per_page}
        finally:
            if close:
                await session.close()

    async def get_detail(self, subscriber_id: int, session) -> dict | None:
        """Full subscriber detail with tags, recent replies, active sequences."""
        r = await session.execute(
            select(Subscriber).where(Subscriber.id == subscriber_id)
        )
        sub = r.scalar_one_or_none()
        if not sub:
            return None

        # tags
        tag_r = await session.execute(
            select(Tag.id, Tag.name, Tag.color)
            .join(SubscriberTag, Tag.id == SubscriberTag.tag_id)
            .where(SubscriberTag.subscriber_id == sub.id)
        )
        tags = [{"id": t.id, "name": t.name, "color": t.color} for t in tag_r]

        # recent replies (last 10)
        reply_r = await session.execute(
            select(Reply)
            .where(Reply.commenter_name == sub.name)
            .order_by(desc(Reply.created_at))
            .limit(10)
        )
        replies = [
            {
                "id": r.id,
                "fb_comment_id": r.fb_comment_id,
                "fb_post_id": r.fb_post_id,
                "comment_text": r.comment_text,
                "reply_text": r.reply_text,
                "created_at": _fmt_dt(r.created_at),
            }
            for r in reply_r.scalars()
        ]

        # active sequences
        seq_r = await session.execute(
            select(SequenceSubscription)
            .where(
                SequenceSubscription.subscriber_id == sub.id,
                SequenceSubscription.status == "active",
            )
        )
        sequences = [
            {
                "id": s.id,
                "sequence_id": s.sequence_id,
                "current_step": s.current_step,
                "status": s.status,
                "entered_at": _fmt_dt(s.entered_at),
            }
            for s in seq_r.scalars()
        ]

        return {
            "id": sub.id,
            "fb_user_id": sub.fb_user_id,
            "name": sub.name,
            "first_name": sub.first_name,
            "username": sub.username,
            "platform": sub.platform,
            "page_id": sub.page_id,
            "tags": tags,
            "reply_count": sub.reply_count,
            "first_seen_at": _fmt_dt(sub.first_seen_at),
            "last_interaction_at": _fmt_dt(sub.last_interaction_at),
            "recent_replies": replies,
            "active_sequences": sequences,
        }

    async def add_tag(self, subscriber_id: int, tag_id: int, session) -> bool:
        """Assign tag to subscriber. Returns True on success or if already exists."""
        try:
            st = SubscriberTag(subscriber_id=subscriber_id, tag_id=tag_id)
            session.add(st)
            await session.commit()
            return True
        except IntegrityError:
            await session.rollback()
            return True  # already tagged
        except Exception:
            await session.rollback()
            log.exception("add_tag failed")
            return False

    async def remove_tag(self, subscriber_id: int, tag_id: int, session) -> bool:
        """Remove tag from subscriber. Returns False if not found."""
        r = await session.execute(
            select(SubscriberTag).where(
                SubscriberTag.subscriber_id == subscriber_id,
                SubscriberTag.tag_id == tag_id,
            )
        )
        st = r.scalar_one_or_none()
        if not st:
            return False
        await session.delete(st)
        await session.commit()
        return True

    async def increment_reply(self, subscriber_id: int, session) -> None:
        """Increment reply_count and update last_interaction_at."""
        r = await session.execute(
            select(Subscriber).where(Subscriber.id == subscriber_id)
        )
        sub = r.scalar_one_or_none()
        if sub:
            sub.reply_count = (sub.reply_count or 0) + 1
            sub.last_interaction_at = datetime.now(timezone.utc)
            await session.commit()

    async def get_subscriber_ids_by_tags(
        self, tag_names: list[str], session
    ) -> list[int]:
        """Distinct subscriber IDs that have ANY of the given tag names."""
        r = await session.execute(
            select(SubscriberTag.subscriber_id)
            .join(Tag, SubscriberTag.tag_id == Tag.id)
            .where(Tag.name.in_(tag_names))
            .distinct()
        )
        return [row[0] for row in r]

    async def get_or_create_by_platform_id(
        self, platform_id: str, platform: str, name: str = ""
    ) -> Subscriber:
        """Utility: open own session, delegate to get_or_create."""
        async with AsyncSessionLocal() as session:
            return await self.get_or_create(
                fb_user_id=platform_id,
                name=name,
                platform=platform,
                session=session,
            )

    async def bulk_tag(
        self, subscriber_ids: list[int], tag_id: int, session
    ) -> int:
        """Apply tag to multiple subscribers. Returns count of new tags created."""
        tagged = 0
        for sid in subscriber_ids:
            try:
                async with session.begin_nested():
                    st = SubscriberTag(subscriber_id=sid, tag_id=tag_id)
                    session.add(st)
                    await session.flush()
                    tagged += 1
            except IntegrityError:
                continue  # duplicate; savepoint rolled back, outer txn intact
        await session.commit()
        return tagged

    async def get_subscriber_count(
        self, tag: str = "", platform: str = "", session=None
    ) -> int:
        """Count subscribers with optional filters."""
        close = False
        if session is None:
            session = AsyncSessionLocal()
            close = True
        try:
            q = select(func.count(Subscriber.id))
            if platform:
                q = q.where(Subscriber.platform == platform)
            if tag:
                q = q.where(
                    Subscriber.id.in_(
                        select(SubscriberTag.subscriber_id)
                        .join(Tag, SubscriberTag.tag_id == Tag.id)
                        .where(Tag.name == tag)
                    )
                )
            r = await session.execute(q)
            return r.scalar() or 0
        finally:
            if close:
                await session.close()


class TagEngine:
    """CRUD for subscriber tags."""

    async def list_tags(self, session, tenant_id: int = 0) -> list[dict]:
        """All tags with subscriber count."""
        r = await session.execute(select(Tag).where(Tag.tenant_id == tenant_id).order_by(Tag.name))
        tags = r.scalars().all()
        result = []
        for t in tags:
            cnt_r = await session.execute(
                select(func.count(SubscriberTag.id)).where(
                    SubscriberTag.tag_id == t.id
                )
            )
            result.append(
                {
                    "id": t.id,
                    "name": t.name,
                    "color": t.color,
                    "subscriber_count": cnt_r.scalar() or 0,
                }
            )
        return result

    async def create_tag(self, name: str, color: str, session, tenant_id: int = 0) -> dict:
        """Create a new tag. Returns dict or raises on duplicate."""
        existing = await session.execute(select(Tag).where(Tag.name == name))
        if existing.scalar_one_or_none():
            raise ValueError(f"Tag '{name}' already exists")
        tag = Tag(name=name, color=color, tenant_id=tenant_id)
        session.add(tag)
        await session.commit()
        await session.refresh(tag)
        return {
            "id": tag.id,
            "name": tag.name,
            "color": tag.color,
            "subscriber_count": 0,
        }

    async def delete_tag(self, tag_id: int, session) -> bool:
        """Delete tag and all its SubscriberTag entries."""
        await session.execute(
            delete(SubscriberTag).where(SubscriberTag.tag_id == tag_id)
        )
        r = await session.execute(select(Tag).where(Tag.id == tag_id))
        tag = r.scalar_one_or_none()
        if not tag:
            return False
        await session.delete(tag)
        await session.commit()
        return True


# ── helpers ──────────────────────────────────────────────────────────────────


def _fmt_dt(dt: datetime | None) -> str | None:
    """Return ISO string or None."""
    return dt.isoformat() if dt else None
