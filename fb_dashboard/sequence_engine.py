from __future__ import annotations

"""Sequence Engine -- Time-based drip campaign scheduler.
Manages multi-step message sequences sent over days/weeks.

[DEPRECATED — plan §6.1: decoupled from the production flow (CRUD endpoints
remain under /api/sequences but no scheduler dispatches sends). Kept for
future use.]

v15-E2 (D3-L5) — تصحيح الحقيقة أعلاه: العلامة التاريخية أُبقيت حرفيًا
لأن بوابة phase-F القديمة (tests/test_phase_f_cleanup.py) تفحصها، لكنها
تناقض الواقع منذ v14-E2: SequenceScheduler يُشغَّل فعليًا في وضع الخادم
الواحد (app/startup.py)، و_services يرسل الخطوات عبر وكيل per-tenant،
وCRUD endpoints تحت /api/sequences حية (خطة Pro تتضمن «حملات تسلسلية»).
الميزة تعمل فقط عندما تحمل الاشتراكات tenant_id الصحيح (انظر subscribe
+ ترحيلة 014 التي تعيد أبوة الصفوف القديمة 0). عند تحديث بوابة phase-F
للواقع، تُحذف الفقرة DEPRECATED أعلاه مع هذا التنويه.

v16-E2 (D4 §Sequence drip): المجدول أعلاه محصور بالإقلاع المحلي فقط
(app/startup.py خلف !IS_VERCEL) — على Vercel الميزة المدفوعة لم تكن
تعمل إطلاقاً. المستهلك ``process_due_sequence_steps`` أدناه هو السطح
الإنتاجي: يُستنزف من ذيل دورة المحرك (bot_engine/engine.py) على كل نبض
جدولة، بمطالبة ذرّية قبل الإرسال (نمط marketing.py:308-341).
"""
import asyncio
import logging
from datetime import timedelta

from _utils import iso_z, utcnow
from database import AsyncSessionLocal
from fb_client import FBClient
from models import BotState, Sequence, SequenceStep, SequenceSubscription, Subscriber
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError

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
            "created_at": iso_z(seq.created_at),
            "updated_at": iso_z(seq.updated_at),
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
                    "created_at": iso_z(s.created_at),
                }
                for s in steps
            ],
        }

    async def list_sequences(self, session, tenant_id: int = 0) -> list[dict]:
        """List all sequences with subscriber stats.

        v5 §4 (N+1 fix): one grouped count query for ALL sequences instead of
        a COUNT per sequence — list endpoints must not multiply queries.
        """
        rows = await session.execute(
            select(Sequence).where(Sequence.tenant_id == tenant_id).order_by(Sequence.created_at.desc())
        )
        sequences = rows.scalars().all()
        if not sequences:
            return []

        active_map: dict[int, int] = {}
        count_rows = await session.execute(
            select(SequenceSubscription.sequence_id, func.count(SequenceSubscription.id))
            .where(
                SequenceSubscription.status == "active",
                SequenceSubscription.sequence_id.in_([s.id for s in sequences]),
            )
            .group_by(SequenceSubscription.sequence_id)
        )
        active_map = {int(seq_id): int(cnt) for seq_id, cnt in count_rows.all()}

        results: list[dict] = []
        for seq in sequences:
            count_active = active_map.get(seq.id, 0)
            results.append({
                "id": seq.id,
                "name": seq.name,
                "description": seq.description,
                "status": seq.status,
                "total_subscribers": seq.total_subscribers,
                "total_sent": seq.total_sent,
                "subscriber_count": count_active,
                "created_at": iso_z(seq.created_at),
                "updated_at": iso_z(seq.updated_at),
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
            # v11 fix (BUG found by test_v11_broadcast_sequence): the step must
            # carry the tenant scope — it was left at 0, so the tenant-scoped
            # update_step/delete_step lookups could never find it.
            tenant_id=tenant_id,
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
        Return False if already subscribed (duplicate).

        v15-E2 (D3-H2): الإدراج يحمل tenant_id المُمرَّر — subscribe القديم
        كان يتجاهله فتسقط الصفوف في المستأجر 0، ووكيل الإرسال per-tenant
        (_services) يتخطاها فلا تُرسل خطوة واحدة لميزة drip (رغم أن المجدول
        يعمل). كما أن الالتزام يجري داخل SAVEPOINT (نمط _wallet.credit_wallet
        المجرب في v14) — تكرار uq_seq_sub يُرجع نقطة الحفظ فقط، بينما كان
        rollback() الكامل يسمم معاملة المستدعي ويُلغي كل تغييراته المعلقة.
        """
        try:
            async with session.begin_nested():
                sub = SequenceSubscription(
                    subscriber_id=subscriber_id,
                    sequence_id=sequence_id,
                    tenant_id=tenant_id,
                    current_step=0,
                    status="active",
                )
                session.add(sub)
                await session.flush()
        except IntegrityError:
            return False
        stmt = select(Sequence).where(Sequence.id == sequence_id)
        if tenant_id:
            stmt = stmt.where(Sequence.tenant_id == tenant_id)
        seq = (await session.execute(stmt)).scalar_one_or_none()
        if seq:
            seq.total_subscribers = (seq.total_subscribers or 0) + 1
        return True

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
        sub.completed_at = utcnow()
        stmt = select(Sequence).where(Sequence.id == sequence_id)
        if tenant_id:
            stmt = stmt.where(Sequence.tenant_id == tenant_id)
        seq = (await session.execute(stmt)).scalar_one_or_none()
        if seq and seq.total_subscribers > 0:
            seq.total_subscribers -= 1
        return True
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
            sub.entered_at = utcnow()
            return sub.current_step

        # No more steps -- mark as completed
        sub.status = "completed"
        sub.completed_at = utcnow()
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
        now = utcnow()
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
                log.error(f"Error checking due sub {sub.id}: {exc}", exc_info=True)
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
            log.error(f"Error processing due step for sub {due.get('sub_id', '?')}: {exc}", exc_info=True)
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
        today = utcnow().strftime("%Y-%m-%d")
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

        v16-E2: the loop now drives the SAME claim-guarded consumer the
        heartbeat cycle drains (:func:`process_due_sequence_steps`) — ONE
        send path everywhere. Before, the local scheduler sent WITHOUT a
        claim while the cycle drained WITH one, so on a single-server box
        the two could double-send the same due step; and a send that crashed
        mid-flight left the row retrying every 60s forever.
        """
        while True:
            try:
                async with AsyncSessionLocal() as session:
                    processed = await process_due_sequence_steps(session)
                    if processed:
                        log.info(
                            f"Sequence scheduler: {processed} steps processed"
                        )
            except Exception as exc:
                log.error(f"Sequence scheduler loop error: {exc}", exc_info=True)
            await asyncio.sleep(60)


# ── v16-E2 (D4 §Sequence drip): the heartbeat outbox consumer ────────────────

_CLAIM_STATUS = "sending"       # mid-send claim — stale claims are recoverable
_STALE_CLAIM_SECONDS = 600      # Graph retries are bounded far below this


def _claim_key(sub_id: int) -> str:
    return f"seqstep_claim_{sub_id}"


async def recover_stale_sequence_claims(
    session, stale_after_seconds: int = _STALE_CLAIM_SECONDS,
) -> int:
    """v16-E2 — recover sequence subscriptions stuck in ``sending``.

    A consumer that claimed a due step and then died (Vercel freezing the
    function mid-Graph, a crashed runner) leaves the row in ``sending``
    forever — invisible to every due scan (``get_due_subscriptions`` reads
    ``status='active'`` only). Same contract as content_calendar's
    ``recover_stale_publishing``: the ``seqstep_claim_{id}`` bot_state marker
    written with the claim carries the timestamp; when it is older than
    ``stale_after_seconds`` the row goes back to ``active`` so the next beat
    retries. A claim with NO marker is left alone (conservative — foreign
    writer without our marker).
    """
    from datetime import datetime as _dt

    rows = await session.execute(
        select(SequenceSubscription).where(SequenceSubscription.status == _CLAIM_STATUS)
    )
    stuck = list(rows.scalars().all())
    if not stuck:
        return 0
    cutoff = utcnow() - timedelta(seconds=stale_after_seconds)
    recovered = 0
    for sub in stuck:
        marker = (await session.execute(
            select(BotState).where(
                BotState.tenant_id == (sub.tenant_id or 0),
                BotState.key == _claim_key(sub.id),
            )
        )).scalar_one_or_none()
        if marker is None:
            continue
        try:
            claimed_at = _dt.fromisoformat(marker.value or "")
        except ValueError:
            claimed_at = None
        if claimed_at is not None and claimed_at >= cutoff:
            continue  # a live consumer holds this claim
        res = await session.execute(
            update(SequenceSubscription)
            .where(SequenceSubscription.id == sub.id,
                   SequenceSubscription.status == _CLAIM_STATUS)
            .values(status="active")
            .returning(SequenceSubscription.id)
            .execution_options(synchronize_session="fetch")
        )
        if res.scalar_one_or_none() is not None:
            recovered += 1
    if recovered:
        await session.commit()
        log.warning("recovered %d stale sequence step claim(s)", recovered)
    return recovered


async def _drop_claim_marker(session, sub_id: int, tid: int) -> None:
    """Drop the claim marker row — composed into the caller's transaction."""
    try:
        await session.execute(
            delete(BotState).where(
                BotState.tenant_id == tid, BotState.key == _claim_key(sub_id))
        )
    except Exception:
        log.debug("could not drop claim marker for sequence step %s", sub_id)


async def _release_sequence_claim(session, sub_id: int) -> None:
    """Release a held claim back to ``active`` (no connected page for the
    tenant — the v14-E2 "publish once the page gets connected" policy) and
    drop the marker in the same transaction: a released claim owns nothing."""
    res = await session.execute(
        update(SequenceSubscription)
        .where(SequenceSubscription.id == sub_id,
               SequenceSubscription.status == _CLAIM_STATUS)
        .values(status="active")
        .returning(SequenceSubscription.id)
        .execution_options(synchronize_session="fetch")
    )
    if res.scalar_one_or_none() is not None:
        sub = await session.get(SequenceSubscription, sub_id)
        await _drop_claim_marker(session, sub_id, (sub.tenant_id if sub else 0))
    await session.commit()


async def process_due_sequence_steps(session) -> int:
    """v16-E2 (D4 §Sequence drip) — outbox consumer for due sequence steps.

    CONTRACT (mirrors marketing.process_pending_campaigns, called from
    BotEngine.cycle()'s drain tail inside try/except so a failure here never
    breaks the cycle)::

        async def process_due_sequence_steps(session) -> int

    The paid drip feature had ZERO production surface: the scheduler above
    is gated to the single-server startup, so on Vercel no step was EVER
    sent. Due steps are now claimed ATOMICALLY before the slow Messenger
    send —

        UPDATE sequence_subscriptions SET status='sending'
        WHERE id=:id AND status='active' RETURNING id

    — (marketing.py:308-341 / bot.py claim-marker pattern) so two overlapping
    beats (or the local scheduler racing a heartbeat cycle) can never both
    send the same step. The claim is COMMITTED before the send and a
    ``seqstep_claim_{id}`` bot_state timestamp marker is written in the same
    transaction (crashed consumers are recovered by
    :func:`recover_stale_sequence_claims`).

    Per-step failure policy: ONE attempt per beat — a failed send marks the
    subscription ``failed`` (the module's terminal semantics) and the batch
    CONTINUES (a broken step never poisons the sweep). Tenants without a
    connected page keep the subscription ``active`` (claim released — it
    sends once the page is bound).

    Returns the number of steps sent by THIS pass.
    """
    try:
        await recover_stale_sequence_claims(session)
    except Exception:
        log.warning("sequence stale-claim recovery failed (non-fatal)", exc_info=True)

    # The due scan never touches self.fb — a bare engine is the scanner.
    try:
        due = await SequenceEngine(None).get_due_subscriptions(session)
    except Exception:
        log.warning("sequence due scan failed (non-fatal)", exc_info=True)
        return 0
    if not due:
        return 0

    # tenant annotation (same as _services._TenantSequenceEngineProxy) — the
    # claim marker and the per-tenant FB client both need it.
    rows = await session.execute(
        select(SequenceSubscription.id, SequenceSubscription.tenant_id).where(
            SequenceSubscription.id.in_([d["sub_id"] for d in due])
        )
    )
    tenant_map = dict(rows.all())
    for d in due:
        d["tenant_id"] = tenant_map.get(d["sub_id"]) or 0

    sent = 0
    for item in due:
        sub_id = item["sub_id"]
        tid = int(item.get("tenant_id") or 0)
        try:
            # ── claim BEFORE the send (the WHERE guard IS the serialization) ──
            claim = await session.execute(
                update(SequenceSubscription)
                .where(SequenceSubscription.id == sub_id,
                       SequenceSubscription.status == "active")
                .values(status=_CLAIM_STATUS)
                .returning(SequenceSubscription.id)
                .execution_options(synchronize_session="fetch")
            )
            if claim.scalar_one_or_none() is None:
                continue  # another consumer owns this step — skip cleanly
            claimed_at = utcnow().isoformat()
            marker = (await session.execute(
                select(BotState).where(
                    BotState.tenant_id == tid, BotState.key == _claim_key(sub_id))
            )).scalar_one_or_none()
            if marker is None:
                session.add(BotState(tenant_id=tid, key=_claim_key(sub_id), value=claimed_at))
            else:
                marker.value = claimed_at
            await session.commit()  # publish the claim before the slow send

            from _services import get_tenant_fb_client
            client = await get_tenant_fb_client(tid)
            if client is None:
                # No connected page: release — sends once the page is bound.
                await _release_sequence_claim(session, sub_id)
                continue

            engine = SequenceEngine(client)  # fresh — no shared mutable state
            step_ok = await engine.process_due_step(item, session)

            # Finalize: advance() already moved current_step (or marked the
            # row completed); a surviving claim goes back to the runnable
            # state, a failed send lands on the module's terminal status.
            sub = await session.get(SequenceSubscription, sub_id)
            if sub is not None:
                if step_ok:
                    sent += 1
                    if sub.status == _CLAIM_STATUS:
                        sub.status = "active"
                else:
                    sub.status = "failed"
                    sub.completed_at = utcnow()
                await _drop_claim_marker(session, sub_id, tid)
                await session.commit()
        except Exception as exc:
            # one broken step must never poison the batch (marketing pattern)
            log.exception("process_due_sequence_steps: step %s failed: %s", sub_id, exc)
            try:
                await session.rollback()
                sub = await session.get(SequenceSubscription, sub_id)
                if sub is not None:
                    sub.status = "failed"
                    sub.completed_at = utcnow()
                    await _drop_claim_marker(session, sub_id, tid)
                    await session.commit()
            except Exception:
                log.exception("marking sequence step %s failed did not work", sub_id)
                await session.rollback()
    return sent
