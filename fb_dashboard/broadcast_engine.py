"""Broadcast Engine — Segmented mass messaging engine.
Sends bulk messages to filtered subscriber segments with rate limiting.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from _utils import utcnow
from typing import Any
from sqlalchemy import select, and_, or_, func, desc, not_, exists
from sqlalchemy.orm import joinedload

from models import Broadcast, BroadcastRecipient, Subscriber, SubscriberTag, Tag
from fb_client import FBClient

log = logging.getLogger("fb-broadcast")


class BroadcastEngine:
    """Mass segmented messaging engine (like ManyChat Broadcast)."""

    def __init__(self, fb: FBClient):
        self.fb = fb

    async def create_broadcast(
        self, name: str, message_template: str,
        platform_filter: dict, segment_filters: dict,
        created_by: str, session,
        tenant_id: int = 0,
    ) -> int:
        bc = Broadcast(
            name=name,
            message_template=message_template,
            platform_filter=json.dumps(platform_filter),
            segment_filters=json.dumps(segment_filters),
            status="draft",
            created_by=created_by,
            tenant_id=tenant_id,
        )
        session.add(bc)
        await session.commit()
        await session.refresh(bc)
        log.info(f"Created broadcast #{bc.id}: {name}")
        return bc.id

    async def list_broadcasts(self, session, tenant_id: int = 0) -> list[dict]:
        q = await session.execute(
            select(Broadcast).where(Broadcast.tenant_id == tenant_id).order_by(desc(Broadcast.created_at))
        )
        rows = q.scalars().all()
        return [
            {
                "id": b.id,
                "name": b.name,
                "status": b.status,
                "total_recipients": b.total_recipients,
                "sent_count": b.sent_count,
                "failed_count": b.failed_count,
                "opened_count": b.opened_count,
                "created_by": b.created_by,
                "created_at": b.created_at.isoformat() if b.created_at else None,
                "sent_at": b.sent_at.isoformat() if b.sent_at else None,
            }
            for b in rows
        ]

    async def get_broadcast(self, broadcast_id: int, session, tenant_id: int = 0) -> dict | None:
        stmt = select(Broadcast).where(Broadcast.id == broadcast_id)
        if tenant_id:
            stmt = stmt.where(Broadcast.tenant_id == tenant_id)
        q = await session.execute(stmt)
        b = q.scalar_one_or_none()
        if not b:
            return None

        # Count recipient statuses
        rcpt_counts = await self._recipient_status_counts(broadcast_id, session)

        return {
            "id": b.id,
            "name": b.name,
            "message_template": b.message_template,
            "platform_filter": json.loads(b.platform_filter) if isinstance(b.platform_filter, str) else b.platform_filter,
            "segment_filters": json.loads(b.segment_filters) if isinstance(b.segment_filters, str) else b.segment_filters,
            "status": b.status,
            "total_recipients": b.total_recipients,
            "sent_count": b.sent_count,
            "failed_count": b.failed_count,
            "opened_count": b.opened_count,
            "created_by": b.created_by,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "sent_at": b.sent_at.isoformat() if b.sent_at else None,
            **rcpt_counts,
        }

    async def _recipient_status_counts(self, broadcast_id: int, session) -> dict:
        q = await session.execute(
            select(
                BroadcastRecipient.status,
                func.count(BroadcastRecipient.id),
            ).where(BroadcastRecipient.broadcast_id == broadcast_id)
             .group_by(BroadcastRecipient.status)
        )
        counts = {"pending": 0, "sent": 0, "failed": 0, "opened": 0}
        for status, cnt in q.all():
            counts[status] = cnt
        return counts

    async def update_broadcast(self, broadcast_id: int, data: dict, session, tenant_id: int = 0) -> bool:
        stmt = select(Broadcast).where(Broadcast.id == broadcast_id)
        if tenant_id:
            stmt = stmt.where(Broadcast.tenant_id == tenant_id)
        q = await session.execute(stmt)
        b = q.scalar_one_or_none()
        if not b:
            return False
        allowed = {"name", "message_template", "platform_filter", "segment_filters"}
        for k, v in data.items():
            if k in allowed:
                setattr(b, k, v)
        await session.commit()
        log.info(f"Updated broadcast #{broadcast_id}")
        return True

    async def estimate_audience(self, segment_filters: dict, platform_filter: dict, session) -> dict:
        q = select(func.count(Subscriber.id)).where(Subscriber.status == "active")

        # Platform filter
        platform = platform_filter.get("platform", "all")
        if platform and platform != "all":
            q = q.where(Subscriber.platform == platform)

        # Tag filters
        tag_contains = segment_filters.get("tag_contains", [])
        tag_not_contains = segment_filters.get("tag_not_contains", [])

        if tag_contains:
            subq = (
                select(SubscriberTag.subscriber_id)
                .join(Tag, SubscriberTag.tag_id == Tag.id)
                .where(Tag.name.in_(tag_contains))
                .where(SubscriberTag.subscriber_id == Subscriber.id)
            )
            q = q.where(exists(subq))

        if tag_not_contains:
            subq = (
                select(SubscriberTag.subscriber_id)
                .join(Tag, SubscriberTag.tag_id == Tag.id)
                .where(Tag.name.in_(tag_not_contains))
                .where(SubscriberTag.subscriber_id == Subscriber.id)
            )
            q = q.where(~exists(subq))

        # Date filters
        subscribed_after = segment_filters.get("subscribed_after")
        if subscribed_after:
            try:
                dt = datetime.fromisoformat(subscribed_after)
                q = q.where(Subscriber.first_seen_at >= dt)
            except ValueError:
                log.warning(f"Invalid subscribed_after date: {subscribed_after}")

        last_interaction_before_days = segment_filters.get("last_interaction_before_days")
        if last_interaction_before_days:
            cutoff = utcnow() - timedelta(days=int(last_interaction_before_days))
            q = q.where(Subscriber.last_interaction_at >= cutoff)

        # Min replies
        min_replies = segment_filters.get("min_replies")
        if min_replies:
            q = q.where(Subscriber.reply_count >= int(min_replies))

        result = await session.execute(q)
        count = result.scalar() or 0
        return {
            "count": count,
            "filters_applied": {
                "platform": platform,
                "tag_contains": tag_contains,
                "tag_not_contains": tag_not_contains,
                "subscribed_after": subscribed_after,
                "last_interaction_before_days": last_interaction_before_days,
                "min_replies": min_replies,
            },
        }

    async def send_broadcast(self, broadcast_id: int, session) -> bool:
        # Load broadcast
        q = await session.execute(
            select(Broadcast).where(Broadcast.id == broadcast_id)
        )
        b = q.scalar_one_or_none()
        if not b or b.status != "draft":
            log.warning(f"Broadcast #{broadcast_id} not found or not draft (status={getattr(b,'status','?')})")
            return False

        # Mark sending
        b.status = "sending"
        await session.commit()

        try:
            # Build subscriber query from stored filters
            platform_filter = json.loads(b.platform_filter) if isinstance(b.platform_filter, str) else b.platform_filter
            segment_filters = json.loads(b.segment_filters) if isinstance(b.segment_filters, str) else b.segment_filters

            subq = select(Subscriber.id).where(Subscriber.status == "active")

            platform = (platform_filter or {}).get("platform", "all")
            if platform and platform != "all":
                subq = subq.where(Subscriber.platform == platform)

            sf = segment_filters or {}
            tag_contains = sf.get("tag_contains", [])
            tag_not_contains = sf.get("tag_not_contains", [])

            if tag_contains:
                sq = (
                    select(SubscriberTag.subscriber_id)
                    .join(Tag, SubscriberTag.tag_id == Tag.id)
                    .where(Tag.name.in_(tag_contains))
                    .where(SubscriberTag.subscriber_id == Subscriber.id)
                )
                subq = subq.where(exists(sq))

            if tag_not_contains:
                sq = (
                    select(SubscriberTag.subscriber_id)
                    .join(Tag, SubscriberTag.tag_id == Tag.id)
                    .where(Tag.name.in_(tag_not_contains))
                    .where(SubscriberTag.subscriber_id == Subscriber.id)
                )
                subq = subq.where(~exists(sq))

            subscribed_after = sf.get("subscribed_after")
            if subscribed_after:
                try:
                    dt = datetime.fromisoformat(subscribed_after)
                    subq = subq.where(Subscriber.first_seen_at >= dt)
                except ValueError:
                    pass

            last_interaction_before_days = sf.get("last_interaction_before_days")
            if last_interaction_before_days:
                cutoff = utcnow() - timedelta(days=int(last_interaction_before_days))
                subq = subq.where(Subscriber.last_interaction_at >= cutoff)

            min_replies = sf.get("min_replies")
            if min_replies:
                subq = subq.where(Subscriber.reply_count >= int(min_replies))

            # Get matching subscriber IDs
            result = await session.execute(subq)
            subscriber_ids = [r[0] for r in result.all()]

            if not subscriber_ids:
                b.status = "sent"
                b.total_recipients = 0
                b.sent_at = utcnow()
                await session.commit()
                log.info(f"Broadcast #{broadcast_id}: no matching subscribers")
                return True

            # Create recipient records
            now = utcnow()
            for sid in subscriber_ids:
                session.add(BroadcastRecipient(
                    broadcast_id=broadcast_id,
                    subscriber_id=sid,
                    status="pending",
                ))
            b.total_recipients = len(subscriber_ids)
            await session.commit()
            log.info(f"Broadcast #{broadcast_id}: {len(subscriber_ids)} recipients created")

            # Send with concurrency limit
            sem = asyncio.Semaphore(10)
            sent = 0
            failed = 0

            async def send_one(subscriber_id: int, recipient_id: int):
                nonlocal sent, failed
                async with sem:
                    qs = await session.execute(
                        select(Subscriber).where(Subscriber.id == subscriber_id)
                    )
                    sub = qs.scalar_one_or_none()
                    if not sub:
                        return

                    # Render template
                    msg = b.message_template
                    msg = msg.replace("{name}", sub.first_name or sub.name or "")
                    msg = msg.replace("{full_name}", sub.name or "")
                    msg = msg.replace("{mention}", f"@{sub.username}" if sub.username else sub.name or "")

                    # Send based on platform
                    # ponytail: fb_client only supports Messenger; other platforms logged+skipped
                    ok = False
                    if sub.platform in ("messenger", "facebook"):
                        result_data = await self.fb.send_dm(sub.fb_user_id, msg)
                        ok = result_data is not None
                    else:
                        log.info(f"Skip {sub.platform} subscriber {sub.fb_user_id}: only Messenger supported")
                        ok = False

                    rcpt_q = await session.execute(
                        select(BroadcastRecipient).where(BroadcastRecipient.id == recipient_id)
                    )
                    rcpt = rcpt_q.scalar_one_or_none()
                    if rcpt:
                        rcpt.status = "sent" if ok else "failed"
                        if not ok:
                            rcpt.error_message = f"Unsupported platform or send failed: {sub.platform}"
                        rcpt.sent_at = utcnow()

                    if ok:
                        sent += 1
                    else:
                        failed += 1

            # Build task list
            tasks = []
            rcpt_q = await session.execute(
                select(BroadcastRecipient)
                .where(BroadcastRecipient.broadcast_id == broadcast_id)
                .where(BroadcastRecipient.status == "pending")
            )
            recipients = rcpt_q.scalars().all()
            for rcpt in recipients:
                tasks.append(send_one(rcpt.subscriber_id, rcpt.id))

            # Process in batches for periodic commits
            batch_size = 10
            for i in range(0, len(tasks), batch_size):
                batch = tasks[i:i + batch_size]
                await asyncio.gather(*batch)
                b.sent_count = sent
                b.failed_count = failed
                await session.commit()
                if (i + batch_size) % 50 <= batch_size:
                    log.info(
                        f"Broadcast #{broadcast_id}: {sent} sent, {failed} failed "
                        f"({i + batch_size}/{len(tasks)})"
                    )

            # Mark complete
            b.status = "failed" if sent == 0 else "sent" if failed == 0 else "partial"
            b.sent_count = sent
            b.failed_count = failed
            b.sent_at = utcnow()
            await session.commit()
            log.info(f"Broadcast #{broadcast_id} done: {sent} sent, {failed} failed")
            return True

        except Exception as e:
            log.exception(f"Broadcast #{broadcast_id} failed: {e}")
            b.status = "failed"
            b.sent_at = utcnow()
            await session.commit()
            return False

    async def cancel_broadcast(self, broadcast_id: int, session, tenant_id: int = 0) -> bool:
        stmt = select(Broadcast).where(Broadcast.id == broadcast_id)
        if tenant_id:
            stmt = stmt.where(Broadcast.tenant_id == tenant_id)
        q = await session.execute(stmt)
        b = q.scalar_one_or_none()
        if not b or b.status not in ("draft", "sending"):
            return False
        b.status = "cancelled"
        await session.commit()
        log.info(f"Broadcast #{broadcast_id} cancelled")
        return True

    async def get_broadcast_stats(self, broadcast_id: int, session) -> dict | None:
        q = await session.execute(
            select(Broadcast).where(Broadcast.id == broadcast_id)
        )
        b = q.scalar_one_or_none()
        if not b:
            return None

        total = b.total_recipients or 0
        progress_pct = round((b.sent_count / total) * 100, 1) if total > 0 else 0.0
        return {
            "id": b.id,
            "name": b.name,
            "status": b.status,
            "total": total,
            "sent": b.sent_count,
            "failed": b.failed_count,
            "opened": b.opened_count,
            "pending": total - b.sent_count - b.failed_count,
            "progress_pct": progress_pct,
        }
