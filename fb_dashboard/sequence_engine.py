from __future__ import annotations
"""Sequence Engine -- Time-based drip campaign scheduler.
Manages multi-step message sequences sent over days/weeks.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from models import Sequence, SequenceStep, SequenceSubscription, Subscriber
from fb_client import FBClient
from database import AsyncSessionLocal

log = logging.getLogger("fb-sequence")


class SequenceEngine:
    """Core engine for managing drip campaign sequences."""

    def __init__(self, fb: FBClient):
        self.fb = fb

    async def get_sequence(self, seq_id: int, session, tenant_id: int = 0) -> dict | None:
        """Load sequence by ID with all steps. Return None if not found."""
        stmt = select(Sequence).where(Sequence.id == seq_id)
        if tenant_id:
            stmt = stmt.where(Sequence.tenant_id == tenant_id)
        seq = (await session.execute(stmt)).scalar_one_or_none()
        if not seq:
            return None
        result = await session.execute(
            select(SequenceStep)
            .where(SequenceStep.sequence_id == seq_id)
            .order_by(SequenceStep.step_order)
        )
        steps = result.scalars().all()
        return {
            "id": seq.id,
            "name": seq.name,
            "description": seq.description,
            "status": seq.status,
            "created_by": seq.created_by,
            "total_subscribers": seq.total_subscribers,
            "total_sent": seq.total_sent,
            "created_at": seq.created_at.isoformat() if seq.created_at else None,
            "updated_at": seq.updated_at.isoformat() if seq.updated_at else None,
            "steps": [
                {
                    "id": s.id,
                    "sequence_id": s.sequence_id,
                    "step_order": s.step_order,
                    "delay_days": s.delay_days,
                    "delay_hours": s.delay_hours,
                    "message_template": s.message_template,
                    "message_type": s.message_type,
                    "action_on_complete": s.action_on_complete,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                }
                for s in steps
            ],
        }

    async def list_sequences(self, session, tenant_id: int = 0) -> list[dict]:
        """List all sequences with subscriber stats."""
        rows = await session.execute(
            select(Sequence).where(Sequence.tenant_id == tenant_id).order_by(Sequence.created_at.desc())
        )
        sequences = rows.scalars().all()
        results: list[dict] = []
        for seq in sequences:
            count_active = await session.scalar(
                select(func.count(SequenceSubscription.id)).where(
                    SequenceSubscription.sequence_id == seq.id,
                    SequenceSubscription.status == "active",
                )
            ) or 0
            count_total = await session.scalar(
                select(func.count(SequenceSubscription.id)).where(
                    SequenceSubscription.sequence_id == seq.id
                )
            ) or 0
            results.append({
                "id": seq.id,
                "name": seq.name,
                "description": seq.description,
                "status": seq.status,
                "total_subscribers": seq.total_subscribers,
                "total_sent": seq.total_sent,
                "subscriber_count": count_active,
                "created_at": seq.created_at.isoformat() if seq.created_at else None,
                "updated_at": seq.updated_at.isoformat() if seq.updated_at else None,
            })
        return results

    async def create_sequence(
        self, name: str, description: str, created_by: str, session,
        tenant_id: int = 0,
    ) -> int:
        """Create a new sequence. Returns the new sequence ID."""
        seq = Sequence(
            name=name,
            description=description or "",
            created_by=created_by,
            tenant_id=tenant_id,
        )
        session.add(seq)
        await session.flush()
        return seq.id  # type: ignore[return-value]

    async def update_sequence(
        self, seq_id: int, data: dict, session, tenant_id: int = 0
    ) -> bool:
        """Update sequence fields (name, description, status).
        Return True if found/updated."""
        stmt = select(Sequence).where(Sequence.id == seq_id)
        if tenant_id:
            stmt = stmt.where(Sequence.tenant_id == tenant_id)
        seq = (await session.execute(stmt)).scalar_one_or_none()
        if not seq:
            return False
        for key in ("name", "description", "status"):
            if key in data:
                setattr(seq, key, data[key])
        return True

    async def delete_sequence(self, seq_id: int, session, tenant_id: int = 0) -> bool:
        """Delete sequence and all related steps + subscriptions.
        Steps cascade via FK ondelete=CASCADE. Return True if deleted."""
        stmt = select(Sequence).where(Sequence.id == seq_id)
        if tenant_id:
            stmt = stmt.where(Sequence.tenant_id == tenant_id)
        seq = (await session.execute(stmt)).scalar_one_or_none()
        if not seq:
            return False
        await session.delete(seq)
        return True

    async def add_step(self, seq_id: int, step_data: dict, session, tenant_id: int = 0) -> int:
        """Create a SequenceStep from step_data. Return new step ID."""
        # Verify sequence belongs to tenant
        if tenant_id:
            stmt = select(Sequence).where(Sequence.id == seq_id, Sequence.tenant_id == tenant_id)
            seq = (await session.execute(stmt)).scalar_one_or_none()
            if not seq:
                return 0
        step = SequenceStep(
            sequence_id=seq_id,
            step_order=step_data.get("step_order", 0),
            delay_days=step_data.get("delay_days", 0),
            delay_hours=step_data.get("delay_hours", 0),
            message_template=step_data.get("message_template", ""),
            message_type=step_data.get("message_type", "text"),
            action_on_complete=step_data.get("action_on_complete", {}),
        )
        session.add(step)
        await session.flush()
        return step.id  # type: ignore[return-value]

    async def update_step(self, step_id: int, data: dict, session, tenant_id: int = 0) -> bool:
        """Update step fields. Return True if found."""
        stmt = select(SequenceStep).where(SequenceStep.id == step_id)
        if tenant_id:
            stmt = stmt.where(SequenceStep.tenant_id == tenant_id)
        step = (await session.execute(stmt)).scalar_one_or_none()
        if not step:
            return False
        for key in (
            "step_order",
            "delay_days",
            "delay_hours",
            "message_template",
            "message_type",
            "action_on_complete",
        ):
            if key in data:
                setattr(step, key, data[key])
        return True

    async def delete_step(self, step_id: int, session, tenant_id: int = 0) -> bool:
        """Delete a step. Return True if deleted."""
        stmt = select(SequenceStep).where(SequenceStep.id == step_id)
        if tenant_id:
            stmt = stmt.where(SequenceStep.tenant_id == tenant_id)
        step = (await session.execute(stmt)).scalar_one_or_none()
        if not step:
            return False
        await session.delete(step)
        return True

    async def subscribe(
        self, subscriber_id: int, sequence_id: int, session, tenant_id: int = 0
    ) -> bool:
        """Subscribe a user to a sequence at step 0.
        Return False if already subscribed (duplicate)."""
        try:
            sub = SequenceSubscription(
                subscriber_id=subscriber_id,
                sequence_id=sequence_id,
                current_step=0,
                status="active",
            )
            session.add(sub)
            await session.flush()
            stmt = select(Sequence).where(Sequence.id == sequence_id)
            if tenant_id:
                stmt = stmt.where(Sequence.tenant_id == tenant_id)
            seq = (await session.execute(stmt)).scalar_one_or_none()
            if seq:
                seq.total_subscribers += 1
            return True
        except IntegrityError:
            await session.rollback()
            return False

    async def unsubscribe(
        self, subscriber_id: int, sequence_id: int, session, tenant_id: int = 0
    ) -> bool:
        """Unsubscribe a user from a sequence."""
        result = await session.execute(
            select(SequenceSubscription).where(
                SequenceSubscription.subscriber_id == subscriber_id,
                SequenceSubscription.sequence_id == sequence_id,
            )
        )
        sub = result.scalar_one_or_none()
        if not sub:
            return False
        sub.status = "unsubscribed"
        sub.completed_at = datetime.now(timezone.utc)
        stmt = select(Sequence).where(Sequence.id == sequence_id)
        if tenant_id:
            stmt = stmt.where(Sequence.tenant_id == tenant_id)
        seq = (await session.execute(stmt)).scalar_one_or_none()
        if seq and seq.total_subscribers > 0:
            seq.total_subscribers -= 1
        return True

    async def get_subscription(
        self, subscriber_id: int, sequence_id: int, session
    ) -> dict | None:
        """Get subscription details: current_step, status, entered_at."""
        result = await session.execute(
            select(SequenceSubscription).where(
                SequenceSubscription.subscriber_id == subscriber_id,
                SequenceSubscription.sequence_id == sequence_id,
            )
        )
        sub = result.scalar_one_or_none()
        if not sub:
            return None
        return {
            "id": sub.id,
            "subscriber_id": sub.subscriber_id,
            "sequence_id": sub.sequence_id,
            "current_step": sub.current_step,
            "status": sub.status,
            "entered_at": sub.entered_at.isoformat() if sub.entered_at else None,
            "completed_at": sub.completed_at.isoformat() if sub.completed_at else None,
        }

    async def advance(
        self, subscriber_id: int, sequence_id: int, session
    ) -> int | None:
        """Move subscriber to the next step.
        Returns new step_order value, or None if sequence is complete.
        Updates entered_at to now on advancement."""
        result = await session.execute(
            select(SequenceSubscription).where(
                SequenceSubscription.subscriber_id == subscriber_id,
                SequenceSubscription.sequence_id == sequence_id,
            )
        )
        sub = result.scalar_one_or_none()
        if not sub:
            return None

        # Get all steps ordered
        steps_result = await session.execute(
            select(SequenceStep)
            .where(SequenceStep.sequence_id == sequence_id)
            .order_by(SequenceStep.step_order)
        )
        steps = steps_result.scalars().all()
        if not steps:
            return None

        # Find current index in the ordered steps list
        current_idx: int | None = None
        for i, s in enumerate(steps):
            if s.step_order == sub.current_step:
                current_idx = i
                break

        if current_idx is None:
            # Step not found -- steps may have been reordered/deleted
            # Start from the beginning of what exists
            current_idx = -1

        if current_idx + 1 < len(steps):
            # There is a next step
            next_step = steps[current_idx + 1]
            sub.current_step = next_step.step_order
            sub.entered_at = datetime.now(timezone.utc)
            return sub.current_step

        # No more steps -- mark as completed
        sub.status = "completed"
        sub.completed_at = datetime.now(timezone.utc)
        return None

    async def get_due_subscriptions(self, session) -> list[dict]:
        """Find all active subscriptions whose current step is due now.

        Calculates scheduled time from entered_at + delay of the current step.
        Only returns subscriptions where current_time >= scheduled_time.
        Includes subscriber info for message sending.
        """
        result = await session.execute(
            select(SequenceSubscription).where(
                SequenceSubscription.status == "active"
            )
        )
        subs = result.scalars().all()
        now = datetime.now(timezone.utc)
        due: list[dict] = []

        for sub in subs:
            try:
                # Load sequence steps
                steps_result = await session.execute(
                    select(SequenceStep)
                    .where(SequenceStep.sequence_id == sub.sequence_id)
                    .order_by(SequenceStep.step_order)
                )
                steps = steps_result.scalars().all()
                if not steps:
                    continue

                # Match current step by step_order
                step: SequenceStep | None = None
                for s in steps:
                    if s.step_order == sub.current_step:
                        step = s
                        break
                if step is None:
                    continue

                # Check if it's time for this step
                scheduled = sub.entered_at + timedelta(
                    days=step.delay_days,
                    hours=step.delay_hours,
                )
                if now < scheduled:
                    continue

                # Load subscriber
                sub_row = await session.get(Subscriber, sub.subscriber_id)
                if not sub_row:
                    continue

                due.append({
                    "sub_id": sub.id,
                    "seq_id": sub.sequence_id,
                    "step_index": sub.current_step,
                    "step": step,
                    "subscriber_id": sub_row.id,
                    "subscriber_platform": sub_row.platform,
                    "subscriber_fb_id": sub_row.fb_user_id,
                    "subscriber_name": sub_row.name,
                    "subscriber_first_name": sub_row.first_name,
                    "message_template": step.message_template,
                })
            except Exception as exc:
                log.error(f"Error checking due sub {sub.id}: {exc}")
                continue

        return due

    async def process_due_step(self, due: dict, session) -> bool:
        """Render, send, and advance a single due step.

        1. Render message template with subscriber context
        2. Send via FBClient (messenger or instagram)
        3. Advance to next step on success
        4. Increment total_sent counter
        Returns True on full success, False otherwise.
        On failure the step is NOT advanced so it retries next poll.
        """
        try:
            message = self.render_message(
                template=due["message_template"],
                sub_first_name=due["subscriber_first_name"],
                sub_full_name=due["subscriber_name"],
                sub_fb_id=due["subscriber_fb_id"],
            )
            if not message:
                log.warning(f"Empty template for sub {due['sub_id']}, skipping")
                return False

            platform = due["subscriber_platform"]
            fb_id = due["subscriber_fb_id"]
            sent = False

            if platform == "instagram":
                # ponytail: Instagram DM not yet supported via FBClient
                log.warning(f"Instagram DM unsupported: skipping sub {due['sub_id']}")
                sent = False
            else:
                # Default to Messenger
                resp = await self.fb.send_dm(fb_id, message)
                sent = resp is not None

            if not sent:
                log.error(
                    f"Send failed for sub={due['sub_id']} seq={due['seq_id']} "
                    f"step={due['step_index']} platform={platform}"
                )
                return False

            log.info(
                f"Sequence step sent: sub={due['sub_id']} seq={due['seq_id']} "
                f"step={due['step_index']} platform={platform}"
            )

            # Advance and update counters
            await self.advance(due["subscriber_id"], due["seq_id"], session)
            seq = await session.get(Sequence, due["seq_id"])
            if seq:
                seq.total_sent += 1

            return True

        except Exception as exc:
            log.error(f"Error processing due step for sub {due.get('sub_id', '?')}: {exc}")
            return False

    def render_message(
        self,
        template: str,
        sub_first_name: str,
        sub_full_name: str,
        sub_fb_id: str,
    ) -> str:
        """Render a message template with subscriber context.

        Supported placeholders:
        {name}      -> sub_first_name
        {full_name} -> sub_full_name
        {mention}   -> @[sub_fb_id] (Facebook mention format)
        {date}      -> today's date (YYYY-MM-DD)
        """
        if not template:
            return ""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        result = template.replace("{name}", sub_first_name or "")
        result = result.replace("{full_name}", sub_full_name or "")
        result = result.replace("{mention}", f"@[{sub_fb_id}]")
        result = result.replace("{date}", today)
        return result


class SequenceScheduler:
    """Background scheduler that polls for due sequence steps
    and processes them every 60 seconds."""

    def __init__(self, engine: SequenceEngine):
        self.engine = engine
        self._task: asyncio.Task | None = None

    async def start(self):
        """Start the background polling loop."""
        if self._task is not None and not self._task.done():
            log.warning("Sequence scheduler already running")
            return
        self._task = asyncio.create_task(self._loop())
        log.info("Sequence scheduler started")

    async def stop(self):
        """Stop the background polling loop."""
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
            log.info("Sequence scheduler stopped")

    async def _loop(self):
        """Background loop: poll for due steps every 60 seconds.

        Iterates through all active subscriptions, checks if their
        current step is due, processes it, and commits changes.
        Errors in individual steps are caught and logged without
        affecting other steps in the same batch.
        """
        while True:
            try:
                async with AsyncSessionLocal() as session:
                    due = await self.engine.get_due_subscriptions(session)
                    processed = 0
                    for item in due:
                        try:
                            ok = await self.engine.process_due_step(item, session)
                            if ok:
                                processed += 1
                        except Exception as exc:
                            log.error(
                                f"Step processing error for sub "
                                f"{item.get('sub_id', '?')}: {exc}"
                            )
                            continue
                    await session.commit()
                    if due:
                        log.info(
                            f"Sequence scheduler: {processed}/{len(due)} "
                            f"steps processed"
                        )
            except Exception as exc:
                log.error(f"Sequence scheduler loop error: {exc}")
            await asyncio.sleep(60)
