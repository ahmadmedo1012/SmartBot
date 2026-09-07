from __future__ import annotations

"""Content Calendar — Visual multi-platform scheduling engine.
Schedule, approve, and publish content across Facebook, Instagram, WhatsApp.
"""
import asyncio
import json
import logging
from datetime import date, datetime, timedelta

from _async import spawn  # v9-A11: GC-safe background tasks
from _utils import iso_z, utcnow
from database import AsyncSessionLocal
from fb_client import FBClient
from models import AnalyticsEvent, BotState, ScheduledPost
from sqlalchemy import delete, select, update

log = logging.getLogger("fb-calendar")

# v15-E4 (D12-H1): statuses a publisher may claim a post FROM. Once claimed,
# the post sits in ``publishing`` — a second publisher's claim UPDATE simply
# matches zero rows and skips (approvals.py v9-A8 semantics).
_CLAIMABLE_STATUSES = ("scheduled", "draft", "failed")


def _claim_key(post_id: int) -> str:
    return f"schedpost_claim_{post_id}"


async def claim_scheduled_post(session, post_id: int, tenant_id: int,
                                claimable: tuple[str, ...] = _CLAIMABLE_STATUSES) -> bool:
    """v15-E4 (D12-H1) — atomic claim BEFORE any Graph call (v9-A8 pattern).

    ``UPDATE scheduled_posts SET status='publishing' WHERE id=:id AND
    status IN (…) RETURNING id`` — the WHERE guard IS the serialization: two
    publishers racing on the same due post both SELECT it, but only the first
    UPDATE matches; the loser gets zero rows → returns False → skips cleanly
    (the Vercel daily beat + cron-job.org 5-min beat + the 60s local scheduler
    can never double-publish the same post again). The claim is COMMITTED
    before the caller touches Graph, and a ``schedpost_claim_{id}`` timestamp
    row (bot_state, scoped to the post's tenant) is written in the same
    transaction so a crashed/frozen publisher's claim can be recovered by
    :func:`recover_stale_publishing`.
    """
    claimed_at = utcnow().isoformat()
    claim = await session.execute(
        update(ScheduledPost)
        .where(ScheduledPost.id == post_id,
               ScheduledPost.status.in_(claimable))
        .values(status="publishing")
        .returning(ScheduledPost.id)
        .execution_options(synchronize_session="fetch")
    )
    if claim.scalar_one_or_none() is None:
        return False
    marker = (await session.execute(
        select(BotState).where(
            BotState.tenant_id == tenant_id, BotState.key == _claim_key(post_id))
    )).scalar_one_or_none()
    if marker is None:
        session.add(BotState(tenant_id=tenant_id, key=_claim_key(post_id), value=claimed_at))
    else:
        marker.value = claimed_at
    await session.commit()
    return True


async def release_scheduled_post(session, post_id: int, new_status: str) -> bool:
    """v15-E4 (D12-H1) — release a held claim back to a retryable status.

    Used when the Graph call failed (attempt < cap → back to ``scheduled`` so
    the next beat retries) or the tenant has no connected page (back to the
    original status — the v14-E2 "publish once the page gets connected"
    policy). Conditional on ``status='publishing'`` so it can never clobber a
    concurrent terminal state. The claim marker row is dropped in the same
    transaction — a released claim owns nothing.
    """
    res = await session.execute(
        update(ScheduledPost)
        .where(ScheduledPost.id == post_id, ScheduledPost.status == "publishing")
        .values(status=new_status)
        .returning(ScheduledPost.id)
        .execution_options(synchronize_session="fetch")
    )
    released = res.scalar_one_or_none() is not None
    if released:
        try:
            await session.execute(
                delete(BotState).where(BotState.key == _claim_key(post_id))
            )
        except Exception:
            log.debug("could not drop claim marker for post %s", post_id)
    await session.commit()
    return released


async def clear_claim_marker(session, post_id: int, tenant_id: int) -> None:
    """Drop the claim marker row when the post reaches a terminal state.

    No own commit — composed into the caller's terminal transaction
    (published/failed) so state and marker flip atomically.
    """
    try:
        await session.execute(
            delete(BotState).where(
                BotState.tenant_id == tenant_id, BotState.key == _claim_key(post_id))
        )
    except Exception:
        log.debug("could not clear claim marker for post %s", post_id)


async def recover_stale_publishing(session,
                                   stale_after_seconds: int = 600) -> int:
    """v15-E4 (D12-H1) — recover posts stuck in ``publishing``.

    A publisher that claimed a post and then died (Vercel freezing the
    function mid-Graph, a crashed runner) leaves the row in ``publishing``
    forever — invisible to every sweep. The claim marker written with the
    claim carries the timestamp: when it is older than ``stale_after_seconds``
    (Graph retries inside fb_client are bounded well below it) the post goes
    back to ``scheduled`` so the next beat republishes it. A claim with NO
    marker is left alone (conservative — foreign writer without our marker).
    """
    from datetime import timedelta
    rows = await session.execute(
        select(ScheduledPost).where(ScheduledPost.status == "publishing"))
    stuck = list(rows.scalars().all())
    if not stuck:
        return 0
    cutoff = utcnow() - timedelta(seconds=stale_after_seconds)
    recovered = 0
    for post in stuck:
        marker = (await session.execute(
            select(BotState).where(
                BotState.tenant_id == (post.tenant_id or 0),
                BotState.key == _claim_key(post.id))
        )).scalar_one_or_none()
        if marker is None:
            continue
        try:
            from datetime import datetime as _dt
            claimed_at = _dt.fromisoformat(marker.value or "")
        except ValueError:
            claimed_at = None
        if claimed_at is not None and claimed_at >= cutoff:
            continue  # a live publisher holds this claim
        await session.execute(
            update(ScheduledPost)
            .where(ScheduledPost.id == post.id, ScheduledPost.status == "publishing")
            .values(status="scheduled")
            .execution_options(synchronize_session="fetch")
        )
        await session.execute(delete(BotState).where(BotState.id == marker.id))
        recovered += 1
        log.warning("recovered stale publishing claim for post %s (tenant %s)",
                    post.id, post.tenant_id or 0)
    if recovered:
        await session.commit()
    return recovered


class ContentCalendarEngine:
    """Schedule/publish engine. Publishing resolves each post's OWN tenant
    credentials (v14-E2 C-ENG2) — never the platform-wide env client."""

    MAX_PUBLISH_ATTEMPTS = 3

    def __init__(self, fb: FBClient):
        self.fb = fb
        # v14-E2 (C-ENG2): post_id → consecutive failed publish attempts.
        # Process-level (models.py is outside E2 ownership — no attempts
        # column): bounded churn, reset on success/re-schedule/delete.
        self._publish_attempts: dict[int, int] = {}

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
                raise ValueError("Invalid ISO 8601 date format") from None
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
        # v14-E2 (C-ENG2): re-scheduling a failed post restarts its attempt
        # counter (manual retry is an explicit user action).
        if "status" in data:
            self._publish_attempts.pop(post_id, None)
        return True

    async def delete_post(self, post_id: int, session, tenant_id: int = 0) -> bool:
        stmt = select(ScheduledPost).where(ScheduledPost.id == post_id)
        if tenant_id:
            stmt = stmt.where(ScheduledPost.tenant_id == tenant_id)
        post = (await session.execute(stmt)).scalar_one_or_none()
        if not post:
            return False
        await session.delete(post)
        self._publish_attempts.pop(post_id, None)
        # v14-E2 (C-ENG2): drop the durable failure-reason row with the post.
        try:
            await session.execute(
                delete(BotState).where(BotState.key == f"schedpost_fail_{post_id}")
            )
        except Exception:
            log.debug("Could not clean failure reason for post %s", post_id)
        # v15-E4 (D12-H1): drop any claim marker with the post too.
        try:
            await session.execute(
                delete(BotState).where(BotState.key == _claim_key(post_id))
            )
        except Exception:
            log.debug("Could not clean claim marker for post %s", post_id)
        await session.commit()
        return True

    async def publish_post(self, post_id: int, session, tenant_id: int = 0) -> bool:
        stmt = select(ScheduledPost).where(ScheduledPost.id == post_id)
        if tenant_id:
            stmt = stmt.where(ScheduledPost.tenant_id == tenant_id)
        post = (await session.execute(stmt)).scalar_one_or_none()
        if not post:
            return False
        # v14-E2 (C-ENG2): the POST's own tenant client — the scheduler passes
        # tenant_id=0 (platform-wide sweep), so the row's tenant is the
        # authoritative scope; the manual route already filtered on it.
        fb = await self._resolve_tenant_fb_client(post.tenant_id or 0)
        return await self._publish_with(post, session, fb)

    async def _resolve_tenant_fb_client(self, tenant_id: int):
        """v14-E2 (C-ENG2, D06 #2): publishing client for a tenant.

        Per-tenant BotState credentials (same source the bot and the
        immediate-publish route use). Legacy single-tenant deployments
        (tenant 0 + env credentials) keep the platform env client — a real
        tenant's post NEVER goes out through the platform token.
        """
        if tenant_id == 0:
            from _services import has_global_fb_credentials
            if has_global_fb_credentials():
                return self.fb
        from _services import get_tenant_fb_client  # deferred — lazy import cycle guard
        return await get_tenant_fb_client(tenant_id)

    async def _publish_with(self, post: ScheduledPost, session, fb) -> bool:
        """Publish ``post`` via ``fb`` with the C-ENG2 failure policy.

        - v15-E4 (D12-H1): the post is ATOMICALLY CLAIMED
          (``scheduled/draft/failed → publishing``, committed) BEFORE the Graph
          call — a second publisher (manual route + 60s scheduler + heartbeat
          sweep) matching the same post gets zero claim rows and skips, so the
          same public post is never published twice;
        - fb is None (tenant has no connected page) → claim released to the
          original status: no Graph call, no state change — the post publishes
          once the page gets connected (v14-E2 policy);
        - Graph failure → claim released back to ``scheduled`` (retry next
          sweep); MAX_PUBLISH_ATTEMPTS strikes → status=failed + durable reason
          (bot_state ``schedpost_fail_{id}``);
        - success → published, counter cleared, claim marker dropped.
        """
        post_id = post.id
        tid = post.tenant_id or 0
        orig_status = post.status
        # v15-E4 (D12-H1): claim BEFORE Graph — the WHERE guard serializes us
        # against every other publisher of this post.
        if not await claim_scheduled_post(session, post_id, tid):
            log.info(
                "Scheduled post %s skipped: already claimed/published by another publisher",
                post_id,
            )
            return False
        if fb is None:
            log.warning(
                "Scheduled post %s skipped: tenant %s has no connected FB page",
                post_id, tid,
            )
            await release_scheduled_post(session, post_id, orig_status)
            return False
        # ponytail: image not sent — fb_client.post_to_page only accepts message.
        # Pass image_url param when FB API supports it.
        result = await fb.post_to_page(post.message)
        if not result:
            attempts = self._publish_attempts.get(post_id, 0) + 1
            self._publish_attempts[post_id] = attempts
            if attempts >= self.MAX_PUBLISH_ATTEMPTS:
                await self._mark_failed(
                    post, session,
                    reason=f"فشل النشر على فيسبوك بعد {self.MAX_PUBLISH_ATTEMPTS} محاولات",
                )
            else:
                # v15-E4 (D12-H1): release the claim so the next sweep retries.
                await release_scheduled_post(session, post_id, "scheduled")
            return False
        self._publish_attempts.pop(post_id, None)
        post.status = "published"
        post.fb_post_id = result.get("id", "")
        post.published_at = utcnow()
        await clear_claim_marker(session, post_id, tid)
        await session.commit()
        spawn(self._track("post_published", {"scheduled_post_id": post_id}))
        return True

    async def _mark_failed(self, post: ScheduledPost, session, reason: str) -> None:
        """v14-E2 (C-ENG2): terminal failure — status=failed + reason.

        ScheduledPost has no reason column (models.py is outside E2
        ownership) — the reason is persisted in bot_state under
        ``schedpost_fail_{id}`` scoped to the post's tenant (platform-admin
        inspectable) and logged. The status commits FIRST so a reason-row
        hiccup can never lose the terminal state. v15-E4 (D12-H1): the claim
        marker is dropped in the same transaction as the terminal state.
        """
        post.status = "failed"
        tid = post.tenant_id or 0
        try:
            await clear_claim_marker(session, post.id, tid)
            await session.commit()
        except Exception:
            await session.rollback()
            log.exception("Failed to persist failed status for post %s", post.id)
            return
        try:
            key = f"schedpost_fail_{post.id}"
            existing = (await session.execute(
                select(BotState).where(BotState.tenant_id == tid, BotState.key == key)
            )).scalar_one_or_none()
            value = str(reason)[:200]
            if existing:
                existing.value = value
            else:
                session.add(BotState(tenant_id=tid, key=key, value=value))
            await session.commit()
        except Exception:
            await session.rollback()
            log.warning("Could not persist failure reason for post %s", post.id, exc_info=True)
        self._publish_attempts.pop(post.id, None)
        log.error("Scheduled post %s (tenant %s) marked failed: %s", post.id, tid, reason)

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
        """v14-E2 (C-ENG2): publish all due posts with THEIR OWN tenant's
        client (one client resolution per tenant per cycle) + the failure
        policy of ``_publish_with``.

        v15-E4 (D12-H1): stale ``publishing`` claims (a crashed/frozen
        publisher) are recovered first, and every publish is guarded by the
        atomic claim — a slow tick N overlapping tick N+1 re-claims nothing.
        """
        try:
            await recover_stale_publishing(session)
        except Exception:
            log.exception("stale publishing recovery failed")
        due = await self.check_due_posts(session)
        ok = 0
        clients: dict[int, object | None] = {}
        for post in due:
            tid = int(post.tenant_id or 0)
            if tid not in clients:
                clients[tid] = await self._resolve_tenant_fb_client(tid)
            if await self._publish_with(post, session, clients[tid]):
                ok += 1
        if ok:
            log.info(f"Published {ok} due post(s)")
        return ok

    def _post_to_dict(self, p: ScheduledPost) -> dict:
        return {
            "id": p.id,
            "message": p.message[:100] if p.message else "",
            "image_url": p.image_url or "",
            "scheduled_at": iso_z(p.scheduled_at),
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
                log.error(f"CalendarScheduler error: {e}", exc_info=True)
            await asyncio.sleep(60)
