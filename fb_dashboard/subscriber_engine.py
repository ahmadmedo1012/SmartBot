from __future__ import annotations

"""Subscriber Engine — Manage subscribers, tags, segments across platforms."""
import logging
from datetime import datetime

from _utils import iso_z, utcnow
from database import AsyncSessionLocal
from models import Reply, SequenceSubscription, Subscriber, SubscriberTag, Tag
from sqlalchemy import delete, desc, func, or_, select
from sqlalchemy.exc import IntegrityError

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
        tenant_id: int = 0,
    ) -> Subscriber:
        """Find subscriber by fb_user_id or create one.

        v12 E1.2 (D9): was a GLOBAL fb_user_id lookup — tenant B reused (and
        mutated) tenant A's subscriber row for the same Facebook user, and the
        create path left tenant_id unset. Now the lookup is tenant-scoped and
        the created row carries tenant_id; 0 keeps the legacy global shape.
        """
        close = False
        if session is None:
            session = AsyncSessionLocal()
            close = True
        try:
            stmt = select(Subscriber).where(Subscriber.fb_user_id == fb_user_id)
            if tenant_id:
                stmt = stmt.where(Subscriber.tenant_id == tenant_id)
            r = await session.execute(stmt)
            sub = r.scalar_one_or_none()
            if sub:
                sub.last_interaction_at = utcnow()
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
                    tenant_id=tenant_id,
                    first_seen_at=utcnow(),
                    last_interaction_at=utcnow(),
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
                # v12 E1.1: نفس عقدة get_detail — وسم بنفس الاسم عند مستأجر
                # آخر لا ينبغي أن يُدخل مشتركي هذا المستأجر في التصفية
                if tenant_id:
                    tag_exists = tag_exists.where(Tag.tenant_id == tenant_id)
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

            # v5 §4 (N+1 fix): ONE grouped tag query for the whole page instead
            # of a join-query per subscriber — page of 50 was 51 queries.
            tag_map: dict[int, list[dict]] = {}
            if subs:
                tag_rows = await session.execute(
                    select(SubscriberTag.subscriber_id, Tag.id, Tag.name, Tag.color)
                    .join(Tag, Tag.id == SubscriberTag.tag_id)
                    .where(SubscriberTag.subscriber_id.in_([s.id for s in subs]))
                )
                for sid, tid, tname, tcolor in tag_rows.all():
                    tag_map.setdefault(sid, []).append(
                        {"id": tid, "name": tname, "color": tcolor}
                    )

            items = []
            for sub in subs:
                tags = tag_map.get(sub.id, [])

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

    async def get_detail(self, subscriber_id: int, session, tenant_id: int = 0) -> dict | None:
        """Full subscriber detail with tags, recent replies, active sequences."""
        stmt = select(Subscriber).where(Subscriber.id == subscriber_id)
        if tenant_id:
            stmt = stmt.where(Subscriber.tenant_id == tenant_id)
        r = await session.execute(stmt)
        sub = r.scalar_one_or_none()
        if not sub:
            return None

        # tags — v12 E1.1 (D2 P1): the join must also honor Tag.tenant_id;
        # legacy cross-tenant subscriber_tags rows (created before the add_tag
        # ownership check) would otherwise leak another tenant's tag names
        # into this tenant's subscriber detail.
        tag_stmt = (
            select(Tag.id, Tag.name, Tag.color)
            .join(SubscriberTag, Tag.id == SubscriberTag.tag_id)
            .where(SubscriberTag.subscriber_id == sub.id)
        )
        if tenant_id:
            tag_stmt = tag_stmt.where(Tag.tenant_id == tenant_id)
        tag_r = await session.execute(tag_stmt)
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

    async def add_tag(self, subscriber_id: int, tag_id: int, session, tenant_id: int = 0) -> bool:
        """Assign tag to subscriber. Returns True on success or if already exists.

        v12 E1.1 (D2 P1 — cross-tenant BOLA): the old body accepted tenant_id
        and never used it, so a tenant could link ANY subscriber id to ANY tag
        id (both owned by other tenants). Both ids are now verified to belong
        to tenant_id before the insert; foreign ids → False (no row written).
        """
        try:
            if tenant_id:
                sub_ok = await session.scalar(
                    select(Subscriber.id).where(
                        Subscriber.id == subscriber_id,
                        Subscriber.tenant_id == tenant_id,
                    )
                )
                tag_ok = await session.scalar(
                    select(Tag.id).where(
                        Tag.id == tag_id,
                        Tag.tenant_id == tenant_id,
                    )
                )
                if sub_ok is None or tag_ok is None:
                    log.warning(
                        "add_tag rejected cross-tenant link: sub=%s tag=%s tenant=%s",
                        subscriber_id, tag_id, tenant_id,
                    )
                    return False
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

    async def remove_tag(self, subscriber_id: int, tag_id: int, session, tenant_id: int = 0) -> bool:
        """Remove tag from subscriber. Returns False if not found.

        v12 E1.1 (D2 P1): same ownership check as add_tag — a tenant can only
        remove a link between ITS OWN subscriber and ITS OWN tag.
        """
        if tenant_id:
            sub_ok = await session.scalar(
                select(Subscriber.id).where(
                    Subscriber.id == subscriber_id,
                    Subscriber.tenant_id == tenant_id,
                )
            )
            tag_ok = await session.scalar(
                select(Tag.id).where(
                    Tag.id == tag_id,
                    Tag.tenant_id == tenant_id,
                )
            )
            if sub_ok is None or tag_ok is None:
                log.warning(
                    "remove_tag rejected cross-tenant unlink: sub=%s tag=%s tenant=%s",
                    subscriber_id, tag_id, tenant_id,
                )
                return False
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
        """Create a new tag. Returns dict or raises on duplicate.

        v12 E1.2 (D9): the name-uniqueness check was GLOBAL — tenant B got a
        false «already exists» rejection whenever tenant A had the same tag
        name, even though the DB unique constraint is (tenant_id, name).
        """
        existing = await session.execute(
            select(Tag).where(Tag.name == name, Tag.tenant_id == tenant_id)
        )
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

    async def delete_tag(self, tag_id: int, session, tenant_id: int = 0) -> bool:
        """Delete tag and all its SubscriberTag entries."""
        where_tag = [Tag.id == tag_id]
        if tenant_id:
            where_tag.append(Tag.tenant_id == tenant_id)
        await session.execute(
            delete(SubscriberTag).where(SubscriberTag.tag_id == tag_id)
        )
        r = await session.execute(select(Tag).where(*where_tag))
        tag = r.scalar_one_or_none()
        if not tag:
            return False
        await session.delete(tag)
        await session.commit()
        return True


# ── helpers ──────────────────────────────────────────────────────────────────


def _fmt_dt(dt: datetime | None) -> str | None:
    """Return ISO string or None."""
    return iso_z(dt)
