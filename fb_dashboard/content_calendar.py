from __future__ import annotations
"""Content Calendar — Visual multi-platform scheduling engine.
Schedule, approve, and publish content across Facebook, Instagram, WhatsApp.
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta, date
from _utils import utcnow
from typing import Any
from sqlalchemy import select, func, and_, or_, desc

from models import ScheduledPost, AnalyticsEvent
from fb_client import FBClient
from database import AsyncSessionLocal

log = logging.getLogger("fb-calendar")


class ContentCalendarEngine:
    def __init__(self, fb: FBClient):
        self.fb = fb

    async def get_calendar_posts(self, year: int, month: int, session, tenant_id: int = 0) -> list[dict]:
        start_date = date(year, month, 1)
        end_date = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        rows = await session.execute(
            select(ScheduledPost)
            .where(ScheduledPost.tenant_id == tenant_id,
                   ScheduledPost.scheduled_at >= start_date,
                   ScheduledPost.scheduled_at < end_date)
            .order_by(ScheduledPost.scheduled_at)
        )
        return [self._post_to_dict(p) for p in rows.scalars().all()]

    async def get_calendar_posts_by_date(self, year: int, month: int, day: int, session, tenant_id: int = 0) -> list[dict]:
        target = date(year, month, day)
        rows = await session.execute(
            select(ScheduledPost)
            .where(ScheduledPost.tenant_id == tenant_id,
                   ScheduledPost.scheduled_at >= target,
                   ScheduledPost.scheduled_at < target + timedelta(days=1))
            .order_by(ScheduledPost.scheduled_at)
        )
        return [self._post_to_dict(p) for p in rows.scalars().all()]

    async def create_post(self, message: str, image_url: str, scheduled_at: str,
                          platform: str, created_by: str, session,
                          tenant_id: int = 0) -> int:
        sched = None
        if scheduled_at:
            try:
                sched = datetime.fromisoformat(scheduled_at)
            except ValueError:
                raise ValueError("Invalid ISO 8601 date format")
        post = ScheduledPost(
            message=message,
            image_url=image_url,
            scheduled_at=sched,
            status="draft" if not sched else "scheduled",
            created_by=created_by,
            tenant_id=tenant_id,
        )
        session.add(post)
        await session.commit()
        await session.refresh(post)
        # ponytail: platform stored as "facebook" always — fb_client only supports page posting.
        # Extend ScheduledPost model with platform column when multi-channel posting is added.
        return post.id

    async def update_post(self, post_id: int, data: dict, session, tenant_id: int = 0) -> bool:
        stmt = select(ScheduledPost).where(ScheduledPost.id == post_id)
        if tenant_id:
            stmt = stmt.where(ScheduledPost.tenant_id == tenant_id)
        post = (await session.execute(stmt)).scalar_one_or_none()
        if not post:
            return False
        for key in ("message", "image_url", "scheduled_at", "status"):
            if key in data:
                setattr(post, key, data[key])
        await session.commit()
        return True

    async def delete_post(self, post_id: int, session, tenant_id: int = 0) -> bool:
        stmt = select(ScheduledPost).where(ScheduledPost.id == post_id)
        if tenant_id:
            stmt = stmt.where(ScheduledPost.tenant_id == tenant_id)
        post = (await session.execute(stmt)).scalar_one_or_none()
        if not post:
            return False
        await session.delete(post)
        await session.commit()
        return True

    async def publish_post(self, post_id: int, session, tenant_id: int = 0) -> bool:
        stmt = select(ScheduledPost).where(ScheduledPost.id == post_id)
        if tenant_id:
            stmt = stmt.where(ScheduledPost.tenant_id == tenant_id)
        post = (await session.execute(stmt)).scalar_one_or_none()
        if not post:
            return False
        # ponytail: image not sent — fb_client.post_to_page only accepts message.
        # Pass image_url param when FB API supports it.
        result = await self.fb.post_to_page(post.message)
        if not result:
            return False
        post.status = "published"
        post.fb_post_id = result.get("id", "")
        post.published_at = utcnow()
        await session.commit()
        asyncio.create_task(self._track("post_published", {"scheduled_post_id": post_id}))
        return True

    async def get_scheduled_count(self, d: date, session) -> int:
        rows = await session.execute(
            select(func.count(ScheduledPost.id))
            .where(ScheduledPost.scheduled_at >= d,
                   ScheduledPost.scheduled_at < d + timedelta(days=1))
        )
        return rows.scalar() or 0

    async def get_month_summary(self, year: int, month: int, session, tenant_id: int = 0) -> dict:
        start_date = date(year, month, 1)
        end_date = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        all_rows = await session.execute(
            select(ScheduledPost).where(
                ScheduledPost.tenant_id == tenant_id,
                ScheduledPost.scheduled_at >= start_date,
                ScheduledPost.scheduled_at < end_date,
            )
        )
        posts = all_rows.scalars().all()
        published = sum(1 for p in posts if p.status == "published")
        scheduled = sum(1 for p in posts if p.status == "scheduled")
        drafts = sum(1 for p in posts if p.status == "draft")
        failed = sum(1 for p in posts if p.status == "failed")
        daily = {}
        for p in posts:
            if p.scheduled_at:
                k = p.scheduled_at.strftime("%Y-%m-%d")
                daily[k] = daily.get(k, 0) + 1
        return {
            "total_posts": len(posts),
            "published_count": published,
            "scheduled_count": scheduled,
            "draft_count": drafts,
            "failed_count": failed,
            "daily_counts": daily,
        }

    async def check_due_posts(self, session) -> list[ScheduledPost]:
        now = utcnow()
        rows = await session.execute(
            select(ScheduledPost).where(
                ScheduledPost.status == "scheduled",
                ScheduledPost.scheduled_at <= now,
            )
        )
        return list(rows.scalars().all())

    async def process_due_posts(self, session) -> int:
        due = await self.check_due_posts(session)
        ok = 0
        for post in due:
            if await self.publish_post(post.id, session):
                ok += 1
        if ok:
            log.info(f"Published {ok} due post(s)")
        return ok

    def _post_to_dict(self, p: ScheduledPost) -> dict:
        return {
            "id": p.id,
            "message": p.message[:100] if p.message else "",
            "image_url": p.image_url or "",
            "scheduled_at": p.scheduled_at.isoformat() if p.scheduled_at else None,
            "status": p.status,
            "platform": "facebook",  # ponytail: single platform; multi when model extended
            "created_by": p.created_by or "",
            "fb_post_id": p.fb_post_id or "",
        }

    async def _track(self, event_type: str, metadata: dict | None = None):
        try:
            async with AsyncSessionLocal() as s:
                s.add(AnalyticsEvent(
                    event_type=event_type,
                    metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
                ))
                await s.commit()
        except Exception:
            pass


class CalendarScheduler:
    """Background task — publishes due posts every 60s."""

    def __init__(self, engine: ContentCalendarEngine):
        self.engine = engine
        self._task: asyncio.Task | None = None

    async def start(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())
            log.info("CalendarScheduler started")

    async def stop(self):
        if self._task and not self._task.done():
            self._task.cancel()
            self._task = None
            log.info("CalendarScheduler stopped")

    async def _loop(self):
        while True:
            try:
                async with AsyncSessionLocal() as session:
                    await self.engine.process_due_posts(session)
            except Exception as e:
                log.error(f"CalendarScheduler error: {e}")
            await asyncio.sleep(60)
