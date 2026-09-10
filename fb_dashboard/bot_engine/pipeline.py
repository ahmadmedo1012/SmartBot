from __future__ import annotations

"""Reply pipeline — structured stages with error boundaries (extracted
verbatim from the old monolithic ``bot.py``, v11-A2).

v15-E1 — this module additionally hosts the MONEY CORE shared by every
usage point (engine paths, onboarding, and — per plan §2 — E3's
broadcast/campaign drains):

  ``get_plan_limits(session, tenant_id)``  — the ONE plan-limits read point (D2-H1)
  ``increment_replies_used(...)``          — atomic usage-counter increment (D12-H3)
  ``money_gate_log(...)``                 — throttled tenant-scoped Arabic gate log
"""

import asyncio
import logging
import time
from datetime import datetime

from _async import spawn  # v9-A11: GC-safe background tasks
from _utils import utcnow
from fb_client import FBClient
from models import BotLog, Customer, Reply, SubscriptionPlan, Tenant, UsageCounter
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from bot_engine.cooldown import CooldownManager
from bot_engine.deps import _get_ctx, _get_diag, _get_ei, _get_monitor, _get_offer, ws_manager
from bot_engine.matching import CommentContext, IntentAwareMatcher
from bot_engine.text import TemplateRenderer

log = logging.getLogger("fb-bot")

# v23: bot-behavior switches (BotState) TTL — same freshness class as the
# plan-limits cache; a toggle flip applies within a minute without a
# per-comment query cost.
_BEHAVIOR_TTL_S = 60.0


# -------------------------------------------------------------------
# v15-E1 money core — plan limits / usage counters / gate telemetry
# -------------------------------------------------------------------

#: One gate-rejection BotLog per (tenant, gate) per 5 minutes (D2-H1).
_GATE_LOG_THROTTLE_SEC = 300.0
_gate_log_throttle: dict[tuple[int, str], float] = {}


def period_start_for(tenant) -> datetime:
    """v15-D12-H3 — ONE normalized, DATE-based billing-period anchor.

    Tenants with a plan anchor (``plan_start``) bill from that DATE (time
    dropped); planless tenants anchor to the calendar-month start. Both the
    counter READ (SUM of rows ``period_start >= anchor``) and the atomic
    WRITE (``UPDATE ... WHERE period_start = :anchor``) agree on it, so
    concurrent creators compute the SAME period and
    ``uq_usage_tenant_metric_period`` can no longer be split apart (the old
    ``period_start=utcnow()`` microsecond insert always differed). A plan
    renewal moves the anchor → the new period starts at zero without row
    surgery (this replaces the old cycle-only "self-heal" reset, which never
    ran on Vercel anyway — D10-M6).
    """
    anchor = getattr(tenant, "plan_start", None) if tenant is not None else None
    if anchor is None:
        now = utcnow()
        return datetime(now.year, now.month, 1)
    return anchor.replace(hour=0, minute=0, second=0, microsecond=0)


def _lapsed(tenant) -> bool:
    """Expired-trial / lapsed-paid → BASIC tier only (D10-H1: the documented
    "basic auto-replies stay on" — never the trialed plan's paid features)."""
    status = getattr(tenant, "subscription_status", "") or ""
    plan_end = getattr(tenant, "plan_end", None)
    if status == "EXPIRED_TRIAL":
        return True
    return status == "UNPAID" and plan_end is not None and utcnow() > plan_end


def _degraded_period_start(tenant) -> datetime:
    """Anchor for lapsed states: the degradation MOMENT (plan_end date) —
    the basic tier's quota starts fresh at expiry instead of inheriting the
    trial's usage (which would immediately exhaust Free's max_replies and
    silence the very "basic replies" the docs promise)."""
    end = getattr(tenant, "plan_end", None)
    if end is not None:
        return end.replace(hour=0, minute=0, second=0, microsecond=0)
    return period_start_for(tenant)


async def get_plan_limits(session, tenant_id: int) -> dict | None:
    """v15-D2-H1 — THE central plan-limits read point (fail-open).

    Resolution:
      * ``tenant.plan_id`` → that plan row (set on activation — the money path);
      * planless tenant → the seeded ``Free`` tier row when it exists (the
        entry tier — the "Free gets everything" funnel D2-H1 flags);
      * no rows at all → ``None`` → UNLIMITED (fail-open, same doctrine as the
        documented subscription-gate fail-open L10: never lose replies over a
        missing seed / DB hiccup).
    Lapsed states (EXPIRED_TRIAL, lapsed-UNPAID) degrade to the Free row's
    limits with the anchor moved to the expiry moment.
    """
    if not tenant_id:
        return None
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        return None
    plan = None
    if tenant.plan_id:
        plan = await session.get(SubscriptionPlan, tenant.plan_id)
    lapsed = _lapsed(tenant)
    if plan is None or lapsed:
        free = (await session.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.name == "Free")
        )).scalar_one_or_none()
        if free is not None:
            plan = free
    if plan is None:
        return None
    anchor = _degraded_period_start(tenant) if lapsed else period_start_for(tenant)
    used = await session.scalar(
        select(func.coalesce(func.sum(UsageCounter.current_value), 0)).where(
            UsageCounter.tenant_id == tenant_id,
            UsageCounter.metric == "replies_used",
            UsageCounter.period_start >= anchor,
        )
    ) or 0
    return {
        "plan_id": plan.id,
        "plan_name": plan.name or "",
        "plan_name_ar": plan.name_ar or "",
        "max_replies": plan.max_replies,  # None → unlimited
        "has_dm": bool(plan.has_dm),
        "has_broadcast": bool(plan.has_broadcast),
        "has_ai": bool(plan.has_ai),
        "replies_used": int(used),
        "period_start": anchor,
    }


async def increment_replies_used(session, tenant_id: int, n: int = 1,
                                  period_start: datetime | None = None) -> bool:
    """v15-D12-H3 — atomic usage increment (the ``_wallet.credit_wallet`` pattern).

    ONE ``UPDATE usage_counters SET current_value = coalesce(current_value,0)+n
    WHERE period_start = :anchor`` — no read-then-write, so concurrent
    webhook/cycle increments never lose each other (the ORM
    ``uc.current_value = (uc.current_value or 0) + 1`` pattern lost updates:
    two sessions read 50, both write 51). Missing row → INSERT inside a
    SAVEPOINT; a concurrent creator that won the unique constraint makes the
    flush raise IntegrityError → the atomic UPDATE re-runs on the winner's row.
    Does NOT commit — the caller owns the transaction.
    """
    if not tenant_id or not n:
        return False
    anchor = period_start if period_start is not None else period_start_for(None)

    def _atomic_stmt():
        # synchronize_session="fetch" is explicit: the SET expression cannot
        # be evaluated in Python (same reason as credit_wallet).
        return (
            update(UsageCounter)
            .execution_options(synchronize_session="fetch")
            .where(
                UsageCounter.tenant_id == tenant_id,
                UsageCounter.metric == "replies_used",
                UsageCounter.period_start == anchor,
            )
            .values(
                current_value=func.coalesce(UsageCounter.current_value, 0) + n,
                updated_at=utcnow(),
            )
        )

    try:
        result = await session.execute(_atomic_stmt())
        if not result.rowcount:
            try:
                async with session.begin_nested():
                    session.add(UsageCounter(
                        tenant_id=tenant_id, metric="replies_used",
                        period_start=anchor, current_value=max(n, 0),
                    ))
                    await session.flush()
            except IntegrityError:
                # a concurrent creator won uq_usage_tenant_metric_period —
                # apply the atomic UPDATE on its row now
                try:
                    await session.execute(_atomic_stmt())
                except Exception:
                    return False
        return True
    except Exception as e:
        log.warning("usage increment failed (tenant %s): %s", tenant_id, e)
        return False


async def money_gate_log(session, tenant_id: int, message: str, *, key: str) -> None:
    """v15-D2-H1 — honest telemetry for money gates: a tenant-scoped Arabic
    BotLog row the owner can SEE (/api/logs), throttled to one row per
    (tenant, gate) per 5 minutes so a busy page can't flood the log."""
    now = time.time()
    k = (tenant_id, key)
    if (now - _gate_log_throttle.get(k, 0.0)) < _GATE_LOG_THROTTLE_SEC:
        return
    _gate_log_throttle[k] = now
    try:
        session.add(BotLog(tenant_id=tenant_id, level="WARN", message=message))
        await session.commit()
    except Exception:
        try:
            await session.rollback()
        except Exception:
            pass

# -------------------------------------------------------------------
# Reply Pipeline (v2 — structured stages with error boundaries)
# -------------------------------------------------------------------

class ReplyPipeline:
    """Pipeline with error boundaries per stage and diagnostics."""

    def __init__(self, fb: FBClient, dedup_engine, cooldown: CooldownManager,
                 tenant_id: int = 0, plan_limits: dict | None = None):
        self.fb = fb
        self.dedup = dedup_engine
        self.cooldown = cooldown
        self._tenant_id = tenant_id
        self._mon = _get_monitor(self._tenant_id)  # v22 (FIX-D): tenant-attributed bot_logs
        self._diag = _get_diag(self._tenant_id)
        # v15-D2-H1 — snapshot from get_plan_limits (the engine resolves it,
        # cached 60s). None = unlimited (planless without a seeded Free row /
        # DB error — the documented fail-open doctrine).
        self._plan_limits = plan_limits or None
        # v23: per-tenant bot behavior (BotState) — 60s TTL cache so the
        # per-comment cost is one indexed query per minute, not per comment.
        self._behavior_cache: dict | None = None
        self._behavior_at = 0.0

    async def _behavior(self, session) -> dict:
        """v23 — the tenant's bot-behavior switches from BotState.

        Defaults follow the product decision of this round: mentions ON
        (the owner's explicit ask — the reply notifies the commenter),
        DM-on-comment OFF (a deliberate feature to enable), AI fallback
        OFF. Unknown/missing rows → defaults; a DB error → the last
        cached values (fail-open, never block a reply on settings).
        """
        now = time.time()
        if self._behavior_cache is not None and (now - self._behavior_at) < _BEHAVIOR_TTL_S:
            return self._behavior_cache
        behavior: dict = {
            "mention_in_replies": True,
            "comment_dm_enabled": False,
            "ai_auto_reply": False,
            "ai_tone": "",
        }
        try:
            from models import BotState
            rows = await session.execute(
                select(BotState).where(
                    BotState.tenant_id == self._tenant_id,
                    BotState.key.in_(list(behavior.keys())),
                )
            )
            for row in rows.scalars().all():
                if row.key not in behavior:
                    continue
                raw = (row.value or "").strip()
                if isinstance(behavior[row.key], bool):
                    behavior[row.key] = raw == "1"
                else:
                    behavior[row.key] = raw
        except Exception as e:
            self._mon.warn(f"behavior load failed: {e}", module="pipeline")
        self._behavior_cache = behavior
        self._behavior_at = now
        return behavior

    async def _ai_fallback_reply(self, session, ctx, intent: str) -> str | None:
        """v23 — the AI auto-reply the owner actually asked for.

        The whole complaint behind this feature: keys were configured
        (SystemConfig openai/gemini) yet the reply pipeline consulted AI
        NOWHERE — suggestions existed only as a manual dashboard helper.
        When a comment matches NO rule and the tenant enabled
        ``ai_auto_reply``, the configured provider generates the reply
        (Libyan-dialect prompt, one-shot, ≤600 chars) instead of the bot
        staying silent.

        Guards (each documented):
          * plan gate ``has_ai`` — the money gate doctrine (throttled log);
          * 8s ``asyncio.timeout`` — the webhook ACK must not sit behind a
            hung provider (v15-D8-B4 doctrine extended to the LLM call);
          * length/validate — a degenerate provider answer (empty, giant,
            or brace-broken) never reaches the page;
          * ANY failure → None → the pipeline continues to the honest
            "no matching rule" path. AI is an enhancement, never a hazard.
        """
        behavior = await self._behavior(session)
        if not behavior.get("ai_auto_reply"):
            return None
        if self._plan_limits and self._plan_limits.get("has_ai") is False:
            await money_gate_log(
                session, self._tenant_id,
                "تم إيقاف رد الذكاء الاصطناعي — الميزة غير متاحة في خطتك الحالية، "
                "قم بالترقية من صفحة الفواتير لتفعيلها",
                key="has_ai",
            )
            self._mon.warn("AI fallback skipped — has_ai plan gate",
                           module="pipeline")
            return None
        try:
            from _services import get_ai, refresh_ai_from_db
            await refresh_ai_from_db()  # SystemConfig keys apply without redeploy
            ai = get_ai()
            if not ai.available:
                self._mon.warn("AI fallback: no provider configured",
                               module="pipeline")
                return None
            tone = str(behavior.get("ai_tone") or "")
            async with asyncio.timeout(8.0):
                text = await ai.generate_reply(ctx.text, ctx.from_first, tone=tone)
            text = (text or "").strip()
            if 3 <= len(text) <= 600 and TemplateRenderer.validate(text):
                return text
            self._mon.warn("AI fallback reply rejected (empty/oversized/broken)",
                           module="pipeline")
        except TimeoutError:
            self._mon.warn("AI fallback timed out (8s)", module="pipeline")
        except Exception as e:
            self._mon.warn(f"AI fallback failed: {e}", module="pipeline")
        return None

    async def process(self, session, raw_comment: dict, post_id: str,
                      matcher: IntentAwareMatcher, send_attempts: int = 3) -> bool:
        """Returns True if a reply was sent. Each stage is isolated."""
        ctx = None
        try:
            ctx = self._extract(raw_comment, post_id)
        except Exception as e:
            self._mon.error("extract failed", module="pipeline", extra={"error": str(e)})
            return False

        if not ctx or not ctx.text:
            return False

        # Stage 1: Skip own page
        try:
            page_id_str = str(self.fb.page_id)
            if ctx.from_id and ctx.from_id not in ('None', '0') and ctx.from_id == page_id_str:
                return False
        except Exception:
            pass

        # Stage 2: Dedup
        try:
            if await self.dedup.is_dup(ctx.cid):
                self._mon.debug(f"dedup skip {ctx.cid[:12]}")
                return False
        except Exception:
            pass

        # Stage 2b: Get user context (new vs returning)
        user_ctx = None
        try:
            ctx_engine = _get_ctx(self._tenant_id)
            user_ctx = ctx_engine.get(ctx.from_id)
        except Exception:
            pass

        # Stage 3: Classify intent
        intent = "neutral"
        classification = {}
        try:
            EI = _get_ei()
            classification = EI.classify(ctx.text) or {}
            intent = classification.get("primary_intent", "neutral")
        except Exception as e:
            self._mon.warn("intent classify failed", module="pipeline", extra={"error": str(e)})

        # Stage 4: Match rule
        try:
            t0 = time.time()
            template, dm_template, rule_id = matcher.match(ctx.text, intent)
            latency = (time.time() - t0) * 1000
            if latency > 50:
                self._mon.warn(f"slow match {latency:.0f}ms", module="pipeline")
        except Exception as e:
            self._mon.error(f"match failed: {e}", module="pipeline")
            return False

        if not template or not TemplateRenderer.validate(template):
            # v23: AI fallback — the owner's complaint "الذكاء الاصطناعي غير
            # مستفاد منه رغم تفعيلي" — the pipeline consulted AI nowhere.
            # With ai_auto_reply ON, a no-rule comment gets a generated
            # reply instead of silence. rule_id stays None (AI-generated,
            # Reply.rule_id is nullable — rules keep their own attribution).
            ai_reply = await self._ai_fallback_reply(session, ctx, intent)
            if ai_reply:
                template = ai_reply
                rule_id = None
                self._mon.info(f"✨ AI fallback for {ctx.from_first}",
                               comment_id=ctx.cid[:12], intent=intent or "",
                               module="pipeline")
            else:
                self._mon.debug("no matching rule", comment_id=ctx.cid[:12], intent=intent)
                return False

        # Stage 5: Cooldown
        try:
            if self.cooldown.is_blocked(ctx.from_id):
                self._mon.debug(f"cooldown {ctx.from_first}", comment_id=ctx.cid[:12])
                return False
        except Exception:
            pass

        # Stage 5b: Urgent notification via WebSocket
        try:
            urgency = classification.get("urgency", 0) if isinstance(classification, dict) else 0
            if ws_manager and (intent in ("complaint", "urgent", "negative") or urgency > 0.5):
                spawn(ws_manager.broadcast_to_tenant(self._tenant_id, "alert", {
                    "type": "urgent_comment", "severity": "warning",
                    "message": f"تعليق عاجل من {ctx.from_first}: {ctx.text[:100]}",
                    "link": f"/comments?comment_id={ctx.cid[:20]}"
                }))
        except Exception:
            pass

        # Stage 5c: Adjust cooldown by user category
        try:
            if user_ctx and user_ctx.is_frequent():
                self.cooldown.adjust_window(ctx.from_id, 30)
            else:
                self.cooldown.adjust_window(ctx.from_id, 60)
        except Exception:
            pass

        # Stage 6: Attach offer (context-aware)
        sales_stage = None
        try:
            # Check if EnhancedIntentClassifier returned sales info
            if intent in ("price_inquiry", "order", "subscription", "contact", "question"):
                o_engine = _get_offer(self._tenant_id)
                # New users get welcome offers
                if user_ctx and user_ctx.is_new():
                    offer = await o_engine.get_best_offer(session, ctx.from_id, "welcome", tenant_id=self._tenant_id)
                else:
                    offer = await o_engine.get_best_offer(session, ctx.from_id, intent, tenant_id=self._tenant_id)
                if offer and offer.get("id"):
                    o_engine.mark_delivered(ctx.from_id, offer["id"])
                if isinstance(classification, dict):
                    sales_stage = classification.get("sales_stage") or "consideration"
        except Exception as e:
            self._mon.warn(f"offer failed: {e}", module="pipeline")

        # Stage 7: Render reply (public comment — NO offer text, it garbles)
        try:
            reply = TemplateRenderer.render(template, ctx)
        except Exception as e:
            self._mon.error(f"render failed: {e}", module="pipeline")
            return False

        # v23 (Stage 7.5) — behavior switches are needed from here on:
        behavior = await self._behavior(session)

        # v23 (Stage 7.7) — DM-on-comment + commenter-id resolution.
        #
        # The owner's feature: "رسالة مباشرة بمجرد تعليقه (كميزة يمكن تفعيلها)"
        # — with comment_dm_enabled ON, the commenter gets a Messenger DM
        # the moment they comment (ONE per comment, 7-day window, via
        # recipient={"comment_id": ...} — live-proven 2026-09-10).
        #
        # WHY THIS RUNS BEFORE THE PUBLIC REPLY: the 2024+ privacy change
        # hides comment authors (webhook `from` and Graph reads both), and
        # the DM response's ``recipient_id`` is the ONLY remaining way to
        # resolve the commenter's user id — which the mention (Stage 7.8)
        # then uses so the public reply actually NOTIFIES them.
        # dm_template (if the matched rule has one) wins as the DM text;
        # otherwise the feature sends the public reply text privately.
        dm_sent = False
        if behavior.get("comment_dm_enabled"):
            if self._plan_limits and self._plan_limits.get("has_dm") is False:
                # v15-D2-H1 — has_dm was decorative (no enforcement point);
                # the private reply to commenters now STOPS for plans without it.
                await money_gate_log(
                    session, self._tenant_id,
                    "تم إيقاف الرد الخاص (DM) — ميزة الرد الخاص على التعليقات غير متاحة "
                    "في خطتك الحالية، قم بالترقية من صفحة الفواتير لتفعيلها",
                    key="has_dm",
                )
                self._mon.warn("DM skipped — has_dm plan gate",
                               comment_id=ctx.cid[:12], module="pipeline")
            else:
                dm_text = ""
                try:
                    if dm_template:
                        dm_text = TemplateRenderer.render(dm_template, ctx)
                    elif reply:
                        dm_text = reply
                except Exception:
                    dm_text = reply
                if dm_text:
                    try:
                        dm_result = await self.fb.send_private_reply(ctx.cid, dm_text)
                        if dm_result and not dm_result.get("_error"):
                            dm_sent = True
                            # The one remaining commenter-id resolver: the
                            # recipient Graph echoed back. Backfill ctx so
                            # the mention (7.8), CRM (Stage 10) and the
                            # Comment row (Stage 9) carry the real id.
                            rid = str(dm_result.get("recipient_id") or "")
                            if rid and not ctx.from_id:
                                ctx.from_id = rid
                                ctx.raw = dict(ctx.raw or {}, **{"from": {"id": rid}})
                                self._mon.info("commenter resolved via DM recipient_id",
                                               comment_id=ctx.cid[:12], module="pipeline")
                            self._mon.info(f"✓ DM sent to commenter {ctx.from_first}",
                                           comment_id=ctx.cid[:12])
                        else:
                            fb_err = "(unknown)"
                            if dm_result and dm_result.get("_error"):
                                fb_err = dm_result.get("body", dm_result.get("error", fb_err))
                            self._mon.warn(f"DM-on-comment failed: {fb_err}",
                                           comment_id=ctx.cid[:12], module="pipeline")
                    except Exception as e:
                        self._mon.warn(f"DM-on-comment failed: {e}",
                                       comment_id=ctx.cid[:12], module="pipeline")

        # v23 (Stage 7.8) — @mention the commenter in the public reply.
        # The owner's requirement: the reply must TAG the commenter so the
        # notification reaches them. ``@[{user-id}]`` renders as a real
        # mention tag (live-evidenced: the reply came back with
        # message_tags populated). Sent-only: the stored Reply row keeps
        # the clean text the owner reads; the log carries the mention fact.
        mention_prefix = ""
        try:
            page_id_str = str(self.fb.page_id)
            if (behavior.get("mention_in_replies")
                    and ctx.from_id
                    and ctx.from_id not in ("None", "0", page_id_str)):
                mention_prefix = f"@[{ctx.from_id}] "
        except Exception:
            mention_prefix = ""

        # Stage 7.5: v15-D2-H1 — plan quota gate (max_replies) BEFORE sending.
        # The snapshot's freshness is bounded by the engine's 60s limits cache
        # (soft limit, documented); the counter INCREMENT itself is always exact.
        if self._plan_limits and self._plan_limits.get("max_replies") is not None:
            used = self._plan_limits.get("replies_used", 0)
            cap = self._plan_limits["max_replies"]
            if used >= cap:
                await money_gate_log(
                    session, self._tenant_id,
                    f"تم الوصول إلى الحد الشهري للردود ({used}/{cap}) — توقّف الرد الآلي "
                    "حتى ترقية الخطة أو تجديدها من صفحة الفواتير",
                    key="max_replies",
                )
                self._mon.warn("plan quota exhausted — reply skipped",
                               comment_id=ctx.cid[:12], module="pipeline")
                return False

        user_type = "new"
        if user_ctx:
            user_type = "frequent" if user_ctx.is_frequent() else "returning" if user_ctx.is_returning() else "new"
        self._mon.info(f"→ Reply to {ctx.from_first}",
                       comment_id=ctx.cid[:12], intent=intent, rule_id=rule_id,
                       extra={"user_type": user_type, "sales_stage": sales_stage or "",
                              "mention": bool(mention_prefix), "dm_sent": dm_sent,
                              "ai_generated": rule_id is None and bool(template)})

        # Stage 8: Send with exponential backoff.
        # v15-D8-B4 — the caller picks the attempt budget: the webhook path
        # (fast_ack) gets ONE inline attempt so the HTTP 200 ACK to Facebook
        # is not held behind Graph retries+backoff; the background cycle
        # keeps the full retry budget (no ACK pressure there).
        # v23: the mention prefix travels WITH the sent text — the stored
        # Reply row keeps the clean reply for the owner's dashboard.
        result = None
        max_attempts = max(1, int(send_attempts))
        send_started = time.time()
        send_text = f"{mention_prefix}{reply}"
        for attempt in range(max_attempts):
            try:
                result = await self.fb.reply_to_comment(ctx.cid, send_text)
                if result:
                    self._diag.record_cycle((time.time() - send_started) * 1000)
                    break
                if attempt < max_attempts - 1:
                    delay = 2 ** attempt  # 1, 2, 4s backoff
                    self._mon.warn(f"retry {attempt+1}/{max_attempts}",
                                   comment_id=ctx.cid[:12], module="pipeline",
                                   extra={"delay": delay})
                    await asyncio.sleep(delay)
            except Exception as e:
                self._mon.error(f"send attempt {attempt+1} failed: {e}",
                                comment_id=ctx.cid[:12], module="pipeline")
                if attempt < max_attempts - 1:
                    await asyncio.sleep(2 ** attempt)

        if result is None:
            self._mon.error(f"✗ send failed after {max_attempts} attempts",
                            comment_id=ctx.cid[:12], module="pipeline")
            try:
                self._diag.record_api_error(f"comment/{ctx.cid[:20]}/comments", 0, "Max retries exceeded")
            except Exception:
                pass
            return False

        # Mark dedup only after successful send
        await self.dedup.mark(ctx.cid)

        # Stage 8b: Send DM (private reply or messenger)
        # v23: superseded by Stage 7.7 when comment_dm_enabled is ON — this
        # block now serves the legacy path only (a matched rule WITH a
        # dm_template while the feature switch is OFF). dm_sent from 7.7
        # short-circuits it so a comment never gets TWO private replies.
        dm_sent_local = False
        if (not dm_sent) and dm_template and ctx.from_id and ctx.from_id != str(self.fb.page_id):
            if self._plan_limits and self._plan_limits.get("has_dm") is False:
                # v15-D2-H1 — has_dm was decorative (no enforcement point);
                # the private reply to commenters now STOPS for plans without it.
                await money_gate_log(
                    session, self._tenant_id,
                    "تم إيقاف الرد الخاص (DM) — ميزة الرد الخاص على التعليقات غير متاحة "
                    "في خطتك الحالية، قم بالترقية من صفحة الفواتير لتفعيلها",
                    key="has_dm",
                )
                self._mon.warn("DM skipped — has_dm plan gate",
                               comment_id=ctx.cid[:12], module="pipeline")
            else:
                try:
                    log.info(f"DM attempt to {ctx.from_first}: template={dm_template[:50]}")
                    dm_text = TemplateRenderer.render(dm_template, ctx)
                    # Strategy 1: Private reply — the recipient={comment_id}
                    # form (live-proven v23); Graph echoes the commenter's
                    # user id back, resolving the author when `from` is hidden.
                    dm_result = await self.fb.send_private_reply(ctx.cid, dm_text)
                    if dm_result and not dm_result.get("_error"):
                        dm_sent_local = True
                        rid = str((dm_result or {}).get("recipient_id") or "")
                        if rid and not ctx.from_id:
                            ctx.from_id = rid
                    else:
                        fb_err = "(unknown)"
                        if dm_result and dm_result.get("_error"):
                            fb_err = dm_result.get("body", dm_result.get("error", fb_err))
                        self._mon.warn(f"private_reply failed: {fb_err}",
                                       comment_id=ctx.cid[:12], module="pipeline")
                        # Strategy 2: MESSAGE_TAG — works for opted-in users without prior conversation
                        dm_result = await self.fb.send_dm(
                            ctx.from_id, dm_text,
                            messaging_type="MESSAGE_TAG", tag="POST_PURCHASE_UPDATE")
                        if dm_result:
                            dm_sent_local = True
                        else:
                            # Strategy 3: RESPONSE — requires user messaged page in last 24h
                            dm_result = await self.fb.send_dm(
                                ctx.from_id, dm_text, messaging_type="RESPONSE")
                            if dm_result:
                                dm_sent_local = True
                    if dm_sent_local:
                        self._mon.info(f"✓ DM sent to {ctx.from_first}", comment_id=ctx.cid[:12])
                    else:
                        self._mon.warn("× DM failed after all strategies",
                                       comment_id=ctx.cid[:12], module="pipeline")
                except Exception as e:
                    self._mon.warn(f"dm failed: {e}", comment_id=ctx.cid[:12], module="pipeline")

        # Stage 9: Log to DB (+ unified usage counting — v15-D2-H3/D12-H3)
        try:
            # +1 atomically in the SAME transaction as the Reply row — this is
            # the ONE counting point serving BOTH comment paths (cycle +
            # webhook; the webhook path previously never counted at all).
            # Counted BEFORE adding the Reply row so the increment's
            # SAVEPOINT flush never sees the pending row (a duplicate-reply
            # IntegrityError from that flush would be misread as the counter's
            # create race); this stage's IntegrityError rollback reverts both.
            await increment_replies_used(
                session, self._tenant_id, 1,
                period_start=(self._plan_limits or {}).get("period_start"),
            )
            session.add(Reply(
                tenant_id=self._tenant_id,
                fb_comment_id=ctx.cid,
                fb_post_id=ctx.post_id,
                commenter_name=ctx.from_name,
                comment_text=ctx.text,
                # v23: the clean reply text — the @[id] mention prefix is a
                # delivery mechanism (notification), not content; the log's
                # extra={mention:...} carries the fact for audits.
                reply_text=reply,
                rule_id=rule_id,
            ))
            # v4 §4.10 — upsert the stored Comment row so /api/comments
            # (DB-first) reflects replies even without live Graph reachability
            try:
                from models import Comment as _C
                _crow = (await session.execute(
                    select(_C).where(
                        _C.tenant_id == self._tenant_id,
                        _C.fb_comment_id == ctx.cid,
                    )
                )).scalar_one_or_none()
                if _crow is None:
                    _crow = _C(
                        tenant_id=self._tenant_id,
                        fb_comment_id=ctx.cid,
                        fb_post_id=str(ctx.post_id or ""),
                        commenter_id=str(ctx.from_id or ""),
                        commenter_name=ctx.from_name or "",
                        comment_text=ctx.text or "",
                    )
                    session.add(_crow)
                _crow.reply_text = reply
                _crow.replied_by_bot = True
                # v23: a late-resolved commenter id (DM recipient_id) heals
                # rows stored empty by the polling path — audience/CRM views
                # stop collapsing everyone into "صديقنا".
                if ctx.from_id and not _crow.commenter_id:
                    _crow.commenter_id = str(ctx.from_id)
            except Exception as _ce:
                self._mon.debug(f"comment upsert skipped: {_ce}", comment_id=ctx.cid[:12])
            await session.commit()
        except IntegrityError:
            await session.rollback()
            self._mon.info(f"DB dedup {ctx.cid[:12]}")
            return False
        except Exception as e:
            self._mon.error(f"DB log failed: {e}", module="pipeline")
            await session.rollback()
            return False

        # Stage 10: Update context + auto-create CRM lead
        try:
            ctx_engine = _get_ctx(self._tenant_id)
            uc = ctx_engine.get(ctx.from_id)
            uc.add_comment(ctx.text, intent, rule_id)
            uc.add_reply(reply)
            if intent in ("complaint", "negative"):
                ctx_engine.tag_user(ctx.from_id, "complainer")
            elif intent in ("price_inquiry", "subscription", "order", "contact"):
                ctx_engine.tag_user(ctx.from_id, "potential_buyer")
                # Auto-create/update CRM record in DB
                try:
                    # v12 E1.2 (D9): scope the upsert by the pipeline's tenant —
                    # was a GLOBAL fb_user_id lookup, so the first tenant that
                    # saw a Facebook user "owned" the CRM row forever and every
                    # other tenant's pipeline updated (and read) it.
                    existing = await session.execute(
                        select(Customer).where(
                            Customer.fb_user_id == ctx.from_id,
                            Customer.tenant_id == self._tenant_id,
                        )
                    )
                    c = existing.scalar_one_or_none()
                    if c:
                        c.total_interactions = (c.total_interactions or 0) + 1
                        c.last_intent = intent
                        c.last_contacted_at = utcnow()
                        if c.stage == "lead" and intent in ("price_inquiry", "subscription"):
                            c.stage = "prospect"
                    else:
                        c = Customer(
                            fb_user_id=ctx.from_id, name=ctx.from_name,
                            source="facebook", stage="lead", tenant_id=self._tenant_id,
                            last_intent=intent, total_interactions=1,
                        )
                        session.add(c)
                    await session.commit()
                except Exception as e:
                    self._mon.warn(f"CRM update failed: {e}", module="pipeline")
        except Exception as e:
            self._mon.warn(f"context update failed: {e}", module="pipeline")

        # Notify WebSocket
        try:
            if ws_manager:
                spawn(ws_manager.broadcast_to_tenant(self._tenant_id, "new_reply", {
                    "commenter": ctx.from_name, "comment": ctx.text[:50],
                    "reply": reply[:50], "rule_id": rule_id,
                }))
                spawn(ws_manager.broadcast_to_tenant(self._tenant_id, "notification", {
                    "type": "reply", "title": "رد جديد",
                    "message": f"تم الرد على {ctx.from_first}",
                    "link": "/replies",
                }))
        except Exception:
            pass

        self._mon.info(f"✓ Replied {ctx.from_first}", comment_id=ctx.cid[:12], rule_id=rule_id)
        return True

    def _extract(self, c: dict, post_id: str) -> CommentContext | None:
        cid = c.get("id", "")
        msg = (c.get("message", "") or "").strip()
        if not cid:
            return None
        from_data = c.get("from", {})
        from_id = str(from_data.get("id", "")) if from_data.get("id") else ""
        from_name = from_data.get("name", "") or ""
        if not from_name:
            from_name = from_data.get("username", "") or "صديقنا"
        from_first = from_name.split()[0] if from_name else "صديقنا"
        from_username = from_data.get("username", "") or ""
        return CommentContext(
            cid=cid, post_id=post_id, text=msg,
            from_id=from_id, from_name=from_name,
            from_first=from_first, from_username=from_username,
            raw=c,
        )
