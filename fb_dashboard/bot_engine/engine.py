from __future__ import annotations

"""SmartBot — auto-reply engine (v2), per-tenant engine core.

Architecture: SharedEngine → Pipeline → IntentMatcher → ResponseComposer.
Flow:
  cycle()
    → dedup filter (DedupCache)
    → classify intent (EnhancedIntentClassifier)
    → match rule (IntentAwareMatcher — intent first, keyword second)
    → cooldown check (CooldownManager)
    → attach offer (OfferEngine — for sales intents)
    → render reply (TemplateRenderer)
    → send reply (FBClient.reply_to_comment with exponential-backoff retry)
    → update context (ContextEngine)
    → log (StructuredLogger)
    → record diagnostics (DiagnosticsEngine)

Extracted verbatim from the old monolithic ``bot.py`` (v11-A2); ``bot.py``
remains the public facade.
"""
import asyncio
import json
import time
from datetime import timedelta

from _async import spawn  # v9-A11: GC-safe background tasks
from _utils import utcnow
from database import AsyncSessionLocal
from fb_client import FBClient
from models import BotLog, Reply, Rule, Tenant
from sqlalchemy import Date, cast, func, select

from bot_engine.cooldown import CooldownManager
from bot_engine.deps import _get_cache, _get_ctx, _get_diag, _get_ei, _get_monitor, ws_manager
from bot_engine.matching import IntentAwareMatcher
from bot_engine.pipeline import (
    ReplyPipeline,
    get_plan_limits,
    increment_replies_used,
    money_gate_log,
)

# -------------------------------------------------------------------
# BotEngine — per-tenant engine (dict[tenant_id] registry in _services)
# -------------------------------------------------------------------

#: v15-D8-B1 — the 48h dedup window reloads at most once per TTL window and
#: at most _DEDUP_LOAD_LIMIT rows (indexed tenant+created_at scan, bounded).
_DEDUP_LOAD_TTL = 60.0
_DEDUP_LOAD_LIMIT = 5000

#: v15-D2-H1 — plan-limits snapshot freshness (soft-limit gate; the counter
#: increment itself is always exact/atomic).
_LIMITS_TTL = 60.0

class BotEngine:
    """Per-tenant auto-reply engine. Each tenant gets its own instance."""

    def __init__(self, fb: FBClient | None = None, tenant_id: int = 0):
        self.fb = fb
        self._tenant_id = tenant_id
        self.cooldown = CooldownManager(default_cooldown_sec=60)
        self._cycle = 0
        self._post_reply_count: dict[str, int] = {}
        self._last_rate_reset: float = time.time()
        self._mon = _get_monitor()
        self._diag = _get_diag(tenant_id)
        self._dedup_engine = None
        self._rule_cache = None
        self._dm_map_cache = None
        self._dm_map_loaded_at: float = 0
        # v15-E1 money/dedup caches (per-tenant engine instance — shared by
        # the webhook path and the cycle through the _services registry)
        self._limits_cache: dict | None = None
        self._limits_cached_at: float = 0.0
        self._replied_ids_cache: set[str] | None = None
        self._replied_ids_loaded_at: float = 0.0

    async def _ensure_cache(self):
        if self._rule_cache is None:
            C = _get_cache()
            self._rule_cache = C.RuleCache(refresh_fn=self._load_rules_from_db, ttl=120)
        if self._dedup_engine is None:
            C = _get_cache()
            self._dedup_engine = C.ReplyDedupCache(ttl=300)

    async def _check_rate_limit(self, post_id: str) -> bool:
        now = time.time()
        if now - self._last_rate_reset > 60:
            self._post_reply_count.clear()
            self._last_rate_reset = now
        self._post_reply_count.setdefault(post_id, 0)
        return self._post_reply_count[post_id] < 5

    def _mark_replied(self, post_id: str):
        self._post_reply_count.setdefault(post_id, 0)
        self._post_reply_count[post_id] += 1

    async def cycle(self):
        """Full bot cycle: load rules → fetch posts → process comments.

        v15-E1: the §2 interface contracts (broadcast + campaign drains) run
        in the ``finally`` — every exit path (expiry skip, quota skip, no
        rules, exceptions) still drains; each drain failure is isolated and
        never breaks the cycle.
        """
        self._cycle += 1
        await self._ensure_cache()
        t_start = time.time()

        async with AsyncSessionLocal() as session:
            try:
                try:
                    # ── Plan enforcement: ONE symmetric expiry point (D10-H1) ──
                    tenant = await session.get(Tenant, self._tenant_id)
                    if not await self._expire_tenant_if_due(session, tenant):
                        return
                    if tenant and tenant.subscription_status == "UNPAID":
                        self._mon.warn("tenant unpaid — skipping cycle")
                        return
                    # (removed: the old usage-counter "self-heal" reset — the
                    # v15 normalized DATE-based period anchor replaces it: reads
                    # SUM(period_start >= anchor), so a renewal starts a fresh
                    # quota without row surgery and without needing a cycle)
                    # ── v15-D2-H1 — quota early-out (saves Graph calls) ──
                    if await self._quota_exceeded(session):
                        return

                    # Load rules from cache
                    rules = await self._rule_cache.get_rules()
                    if not rules:
                        self._mon.warn("no rules — skipping cycle")
                        return

                    # Fetch posts from FB
                    posts, _ = await self.fb.get_page_posts(10)
                    elapsed = (time.time() - t_start) * 1000
                    self._mon.info(f"⚡ Cycle #{self._cycle}: {len(posts)} posts, {len(rules)} rules",
                                   extra={"fetch_ms": f"{elapsed:.0f}"})
                    self._diag.record_cycle(elapsed)

                    total_replied = 0
                    for post in posts:
                        pid = post["id"]
                        if not await self._check_rate_limit(pid):
                            continue
                        comments = await self.fb.get_post_comments(pid)
                        post["_comment_count"] = len(comments)
                        for c in comments:
                            if await self._process_comment(session, c, pid):
                                total_replied += 1
                                self._mark_replied(pid)

                    if total_replied:
                        self._mon.info(f"↳ Cycle #{self._cycle}: {total_replied} reply(ies) sent")
                        # (v15: usage counting moved INTO the pipeline — one atomic
                        # increment per sent reply serving BOTH the cycle and the
                        # webhook path; the old read-modify-write batch bump that
                        # lost concurrent updates is gone)

                        # Auto-invalidate rule cache after reply (new data may affect matching)
                        # ponytail: aggressive invalidation — optimize when cycle >1000
                        await self._rule_cache.invalidate()

                    # Broadcast stats after every cycle (WS + SSE — tenant-scoped)
                    # v8-A3: counts are scoped to THIS tenant — the previous global
                    # count(Reply.id) showed platform-wide totals to every tenant.
                    try:
                        from event_bus import event_bus
                        async with AsyncSessionLocal() as s:
                            total = await s.scalar(
                                select(func.count(Reply.id)).where(Reply.tenant_id == self._tenant_id)) or 0
                            today_val = await s.scalar(
                                select(func.count(Reply.id))
                                .where(Reply.tenant_id == self._tenant_id,
                                       cast(Reply.created_at, Date) == utcnow().date())
                            ) or 0
                            payload = {"total_replies": total, "today_replies": today_val,
                                       "cycle": self._cycle}
                            if ws_manager:
                                spawn(ws_manager.broadcast_to_tenant(self._tenant_id, "stats_update", payload))
                            spawn(event_bus.emit("stats_update", payload, tenant_id=self._tenant_id))
                    except Exception:
                        pass

                    # Cycle end telemetry
                    total_comments = sum(p_.get("_comment_count", 0) for p_ in posts)
                    cycle_ms = (time.time() - t_start) * 1000
                    self._mon.info(
                        f"Cycle #{self._cycle} done",
                        module="engine",
                        extra={
                            "duration_ms": f"{cycle_ms:.0f}",
                            "posts": len(posts),
                            "comments": total_comments,
                            "replied": total_replied,
                            "rules": len(rules),
                        },
                    )

                    # Heartbeat every 10 cycles
                    if self._cycle % 10 == 0:
                        ctx = _get_ctx(self._tenant_id)
                        self._mon.info(
                            f"💓 Heartbeat #{self._cycle}: {len(posts)} posts / {len(rules)} rules / "
                            f"{total_replied} replied / {ctx.active_users} active users / "
                            f"diag rate: {self._diag.get_error_rate()}%"
                        )
                except Exception as e:
                    self._mon.error(f"Cycle #{self._cycle} failed", module="engine",
                                    extra={"error": str(e)[:300]})
                    try:
                        await self._add_log(session, "ERROR", f"Cycle #{self._cycle}: {e}")
                    except Exception:
                        pass
            finally:
                # v15 plan §2 — interface contracts with E3:
                #   broadcast_engine.process_pending(session) -> int
                #   routers.marketing.process_pending_campaigns(session) -> int
                # E3 owns the implementations; until they land the attrs are
                # absent and the drain is a no-op. Each drain is isolated —
                # its failure NEVER breaks the cycle, and it runs on EVERY
                # exit path (expiry/quota/no-rules/exception) because the
                # drain itself is tenant-independent.
                # v16-E2 (D4 §Sequence drip): a THIRD drain — the sequence
                # drip outbox consumer (the paid feature that never ran on
                # Vercel: its scheduler is startup-gated to single-server).
                await self._drain_broadcast_and_campaigns(session)

    async def _drain_broadcast_and_campaigns(self, session) -> None:
        """v15 §2 — call the pending drains (v16-E2: + sequence steps), each
        fully isolated: one consumer's failure never kills the cycle."""
        try:
            import broadcast_engine as _broadcast_engine
            _drain = getattr(_broadcast_engine, "process_pending", None)
            if callable(_drain):
                await _drain(session)
        except ImportError:
            pass  # E3's module not landed — contract §2 tolerates absence
        except Exception as e:
            self._mon.warn(f"broadcast process_pending failed (non-fatal): {e}", module="engine")
        try:
            from routers import marketing as _marketing
            _drain = getattr(_marketing, "process_pending_campaigns", None)
            if callable(_drain):
                await _drain(session)
        except ImportError:
            pass  # E3's module not landed — contract §2 tolerates absence
        except Exception as e:
            self._mon.warn(f"campaign process_pending failed (non-fatal): {e}", module="engine")
        # v16-E2 (D4 §Sequence drip): claim-guarded consumer — due sequence
        # steps fire on every heartbeat beat instead of never (the scheduler
        # behind this is local-startup-only). Same isolation contract.
        try:
            from sequence_engine import process_due_sequence_steps as _seq_drain
            await _seq_drain(session)
        except ImportError:
            pass  # sequence module absent — tolerate (contract §2 shape)
        except Exception as e:
            self._mon.warn(f"sequence process_due failed (non-fatal): {e}", module="engine")

    async def _process_comment(self, session, comment: dict, post_id: str,
                               *, fast_ack: bool = False) -> bool:
        """Shared setup + process: loads rules, gates quota/DM, creates pipeline, processes one comment.

        v15-D8-B1 — the 48h replied-ids window is ONE bounded, TTL-cached
        indexed query (was: a full-window reload PER COMMENT plus
        ``dedup.load()`` which REPLACED the in-memory set — the mark/load
        race that could wipe uncommitted marks and double-send). In-memory
        ``is_dup`` still guards in-flight duplicates within this process.
        ``fast_ack=True`` (webhook path) buys a single send attempt so the
        HTTP 200 ACK is not held behind Graph retries (D8-B4).
        """
        rules = await self._rule_cache.get_rules()
        if not rules:
            return False
        cid = str(comment.get("id") or "")
        if cid and cid in await self._replied_ids_cached(session):
            return False  # already replied within the 48h DB window
        dm_map = await self._load_dm_map()
        matcher = IntentAwareMatcher(rules, dm_map)
        limits = await self._get_limits(session)
        pipeline = ReplyPipeline(self.fb, self._dedup_engine, self.cooldown,
                                 tenant_id=self._tenant_id, plan_limits=limits)
        return await pipeline.process(session, comment, post_id, matcher,
                                      send_attempts=1 if fast_ack else 3)

    async def process_single_comment(self, comment: dict, post_id: str):
        """Process a single webhook comment without running a full cycle.

        v15-D2-H3 — the webhook comment path now goes through the SAME §5.18
        subscription gate as the messaging path (was: NO gate — expired/UNPAID
        tenants kept replying on comments forever), and every sent reply is
        counted by the pipeline's unified usage point (was: never counted).
        v15-D8-B4 — one send attempt (fast ACK to Facebook).
        """
        cid = comment.get("id", "")[:12]
        t0 = time.time()
        await self._ensure_cache()
        self._mon.info("webhook comment received", comment_id=cid, module="webhook")
        async with AsyncSessionLocal() as session:
            try:
                if not await self._subscription_active():
                    return
                replied = await self._process_comment(session, comment, post_id, fast_ack=True)
                elapsed = (time.time() - t0) * 1000
                self._mon.info(
                    f"webhook {'replied' if replied else 'skipped'}",
                    comment_id=cid, module="webhook",
                    extra={"duration_ms": f"{elapsed:.0f}", "replied": replied},
                )
            except Exception as e:
                self._mon.error(f"Single comment processing error: {e}",
                                comment_id=cid, module="engine")

    async def _subscription_active(self) -> bool:
        """v4 §5.18 — one gate, both paths (webhook + cycle).

        Semantics (aligned with register/lifespan reality):
          - fresh tenant (plan_end unset, any status) → ACTIVE: registration
            leaves subscription_status="UNPAID" by default until a cold start
            migrates it to FREE — blocking those would silence the bot for
            every new customer (the exact "everything is zero" complaint).
          - TRIAL with past plan_end → EXPIRED_TRIAL: basic replies continue
            (same as the cycle's documented §2.6 behavior).
          - UNPAID *with* a past plan_end (a paid plan that lapsed) or
            REJECTED → blocked.
        v15-D10-H1 — the expiry is now SYMMETRIC at the FIRST use:
          - PAID with a past plan_end self-heals to UNPAID right here (the
            old code let expired-PAID reply forever on the webhook path —
            the conversion only ever happened inside a cycle, which never
            runs on Vercel), and the owner gets the one-time renewal notice.
          - EXPIRED_TRIAL keeps replying BASIC replies (the documented
            promise — the old code allowed exactly ONE reply after expiry
            then went silent; paid features are cut by the plan-limits gate).
        """
        if not self._tenant_id:
            return True  # legacy singleton — no tenant to gate
        try:
            async with AsyncSessionLocal() as session:
                tenant = await session.get(Tenant, self._tenant_id)
                if not tenant:
                    return True
                return await self._expire_tenant_if_due(session, tenant)
        except Exception:
            return True  # fail-open: never lose replies over a DB hiccup

    async def _expire_tenant_if_due(self, session, tenant) -> bool:
        """v15-D10-H1 — the ONE symmetric expiry point (cycle + webhook).

        Returns True when the tenant may keep replying. Converts on FIRST
        use (not "when a cycle happens to run"):
          TRIAL + expired   → EXPIRED_TRIAL + one-time notice → True (basics)
          PAID + expired    → UNPAID + one-time renewal notice → False
          UNPAID + expired  → False (already lapsed)
          REJECTED          → False
          FREE/EXPIRED_TRIAL/active → True
        The conversion is a state transition, so the notification fires
        exactly ONCE (the next event sees the converted status and takes a
        non-converting branch).
        """
        if tenant is None:
            return True
        status = tenant.subscription_status or ""
        if status == "REJECTED":
            return False
        if tenant.plan_end and utcnow() > tenant.plan_end:
            if status == "TRIAL":
                tenant.subscription_status = "EXPIRED_TRIAL"
                await session.commit()
                self._mon.warn("tenant trial expired — EXPIRED_TRIAL "
                               "(basic auto-replies stay on)")
                await self._notify_subscription_ended(session, tenant, trial=True)
                return True
            if status == "PAID":
                tenant.subscription_status = "UNPAID"
                await session.commit()
                self._mon.warn("tenant plan expired — converted to UNPAID at first use "
                               "(replies blocked, renewal notified)")
                await self._notify_subscription_ended(session, tenant, trial=False)
                return False
            if status == "UNPAID":
                return False  # a paid plan that already lapsed
            # FREE / EXPIRED_TRIAL → the basic floor stays on (documented)
            return True
        return True

    async def _notify_subscription_ended(self, session, tenant, *, trial: bool) -> None:
        """v15-D10-H5 — the silent-churn fix: ONE Arabic renewal notice.

        push_notification (in-app feed, tenant-scoped) + a tenant-scoped
        BotLog — the owner finally SEES that replies stopped and why, at the
        exact moment it happens (previously the conversion was 100% silent:
        no notification, no log, no visible plan_end anywhere).
        """
        if tenant is None:
            return
        plan_label = ""
        try:
            if tenant.plan_id:
                from models import SubscriptionPlan
                plan = await session.get(SubscriptionPlan, tenant.plan_id)
                if plan is not None:
                    plan_label = plan.name_ar or plan.name or ""
        except Exception:
            plan_label = ""
        if trial:
            title = "انتهت فترة التجربة المجانية"
            body = ("انتهت فترة التجربة — بقيت الردود الأساسية تعمل. "
                    "قم بالترقية من صفحة الفواتير لتفعيل كل الميزات المدفوعة.")
        else:
            title = "انتهى اشتراكك — جدّده الآن"
            body = (f"انتهى اشتراك باقة {plan_label or 'خطتك الحالية'} — توقف البوت عن "
                    "الرد على عملائك. جدّد الاشتراك من صفحة الفواتير لاستئناف الردود.")
        try:
            session.add(BotLog(tenant_id=tenant.id, level="WARN", message=f"{title} — {body}"))
            from routers.notifications import push_notification
            await push_notification(session, tenant.id, title=title, body=body,
                                    type_="payment", link="/dashboard/billing")
            await session.commit()
        except Exception as e:
            try:
                await session.rollback()
            except Exception:
                pass
            self._mon.warn(f"expiry notification failed: {e}", module="engine")

    async def _get_limits(self, session=None) -> dict | None:
        """v15-D2-H1 — cached plan-limits snapshot (60s TTL, fail-open).

        The cache makes the GATE soft (bounded staleness under concurrency);
        the usage-counter INCREMENT is always exact. None = unlimited
        (planless without a seeded Free row, or a DB error — documented
        fail-open doctrine shared with the subscription gate).
        """
        now = time.time()
        if (now - self._limits_cached_at) < _LIMITS_TTL:
            return self._limits_cache
        try:
            if session is not None:
                limits = await get_plan_limits(session, self._tenant_id)
            else:
                async with AsyncSessionLocal() as s:
                    limits = await get_plan_limits(s, self._tenant_id)
        except Exception:
            limits = None
        self._limits_cache = limits
        self._limits_cached_at = now
        return limits

    async def _quota_exceeded(self, session) -> bool:
        """v15-D2-H1 — max_replies gate (throttled Arabic BotLog on rejection)."""
        limits = await self._get_limits(session)
        if not limits or limits.get("max_replies") is None:
            return False
        used, cap = limits.get("replies_used", 0), limits["max_replies"]
        if used < cap:
            return False
        await money_gate_log(
            session, self._tenant_id,
            f"تم الوصول إلى الحد الشهري للردود ({used}/{cap}) — توقّف الرد الآلي "
            "حتى ترقية الخطة أو تجديدها من صفحة الفواتير",
            key="max_replies",
        )
        self._mon.warn(f"plan quota exhausted ({used}/{cap}) — replies skipped", module="engine")
        return True

    async def _replied_ids_cached(self, session) -> set[str]:
        """v15-D8-B1 — the 48h dedup window, cached for the TTL window.

        ONE indexed, tenant-scoped, LIMIT-bounded query per TTL instead of a
        full-window scan per comment. The set answers "already replied within
        48h" from the DB (cross-restart); the in-memory dedup engine still
        covers in-flight marks (and is never REPLACED by a load anymore).
        """
        now = time.time()
        if self._replied_ids_cache is not None and (now - self._replied_ids_loaded_at) < _DEDUP_LOAD_TTL:
            return self._replied_ids_cache
        try:
            ids = await self._load_replied_ids(session)
        except Exception:
            ids = set()
        self._replied_ids_cache = ids
        self._replied_ids_loaded_at = now
        return ids

    async def _load_replied_ids(self, session) -> set[str]:
        """v15-D8-B1 — the 48h dedup window: tenant-scoped (indexed
        ix_reply_tenant_created), newest-first, LIMIT-bounded."""
        cutoff = utcnow() - timedelta(hours=48)
        stmt = (
            select(Reply.fb_comment_id)
            .where(Reply.created_at >= cutoff)
            .order_by(Reply.created_at.desc())
            .limit(_DEDUP_LOAD_LIMIT)
        )
        if self._tenant_id:
            stmt = stmt.where(Reply.tenant_id == self._tenant_id)
        result = await session.execute(stmt)
        return {row[0] for row in result if row[0]}

    async def _is_first_contact(self, sender_id: str) -> bool:
        """v4 §5.15 — TRUE first-contact detection: is this the sender's FIRST
        inbound message? (Runs AFTER persist_message stored it, so count==1
        means the current message is the first one.)"""
        if not sender_id:
            return False
        try:
            from models import Message as _Msg
            async with AsyncSessionLocal() as session:
                n = await session.scalar(
                    select(func.count(_Msg.id)).where(
                        _Msg.tenant_id == self._tenant_id,
                        _Msg.sender_id == sender_id,
                        _Msg.is_from_page == False,
                    )
                )
                return (n or 0) == 1
        except Exception:
            return False

    @staticmethod
    def _find_greeting_rule(rules: list[dict]):
        """v4 §5.15 — locate the greeting rule (by name/description/intent)."""
        best = (None, None, None)
        for r in rules or []:
            name = str(r.get("name") or "").lower()
            desc = str(r.get("description") or "").lower()
            if "greeting" in name or "ترحيب" in name or "greeting" in desc or "ترحيب" in desc:
                tpl = (r.get("reply_template") or r.get("template") or "").strip()
                dm = (r.get("dm_template") or "").strip()
                if tpl or dm:
                    best = (tpl, dm, r.get("id"))
                    break
        return best

    async def process_single_message(self, messaging: dict) -> dict | None:
        """Auto-reply to ONE inbound Messenger message (world-class plan v3 §4.4).

        Mirrors the comment pipeline stages (rules → intent → match → gating
        → render → send with retry) but replies via Messenger DM (fb.send_dm)
        instead of a public comment. Returns {"mid", "text", "rule_id"} on
        success, else None.
        """
        msg = messaging.get("message") or {}
        sender = messaging.get("sender") or {}
        sender_id = str(sender.get("id") or "")
        sender_name = str(sender.get("name") or "")

        # v4 §4.11 — text may come from postback/quick-reply payloads when the
        # user tapped a button (no message.text). Use the payload as the
        # matchable text so button taps get answers too.
        text = (msg.get("text") or "").strip()
        pb_payload = ""
        pb = messaging.get("postback")
        if isinstance(pb, dict) and pb.get("payload"):
            pb_payload = str(pb["payload"]).strip()
            text = text or pb_payload or str(pb.get("title") or "").strip()
        elif isinstance(msg.get("quick_reply"), dict) and msg["quick_reply"].get("payload"):
            pb_payload = str(msg["quick_reply"]["payload"]).strip()
            text = text or pb_payload

        if not text or not sender_id or sender_id in ("None", "0"):
            return None
        # Skip echoes / page-owned events
        if msg.get("is_echo") or (self.fb and sender_id == str(self.fb.page_id)):
            return None

        # v4 §5.18 — subscription/plan gate for webhook replies (the background
        # cycle already gated on plan limits; the webhook path bypassed it, so
        # expired/UNPAID tenants still got unlimited auto-replies).
        if not await self._subscription_active():
            return None

        # v15-D2-H1 — max_replies quota gate for the Messenger reply path
        # (the limits snapshot is cached 60s — the gate is soft, the counting
        # is exact; see _get_limits).
        async with AsyncSessionLocal() as quota_session:
            if await self._quota_exceeded(quota_session):
                return None

        t0 = time.time()
        await self._ensure_cache()
        rules = await self._rule_cache.get_rules()
        if not rules:
            return None

        # v11-A2: was ``from bot import ...`` (self-import of the old
        # monolith) — same deferred import, now pointing at the package.
        from bot_engine.matching import CommentContext, IntentAwareMatcher
        from bot_engine.text import TemplateRenderer
        ctx = CommentContext(
            cid=msg.get("mid", ""),
            post_id="dm",
            text=text,
            from_id=sender_id,
            from_name=sender_name,
            from_first=(sender_name or sender_id).split(" ")[0],
            from_username=sender_name or sender_id,
            raw=messaging,
        )

        # Intent (best-effort — same classifier as comments)
        intent = None
        try:
            EI = _get_ei()
            classification = EI.classify(text) or {}
            intent = classification.get("primary_intent")
        except Exception:
            intent = None

        matcher = IntentAwareMatcher(rules, await self._load_dm_map())

        # v4 §5.15 — TRUE first-message greeting: fires once per NEW
        # conversation (new PSID), not on every "السلام عليكم". A rule named/
        # described as greeting (or with the greeting intent) wins on the
        # customer's first contact.
        is_first_contact = await self._is_first_contact(sender_id)
        template, dm_template, rule_id = matcher.match(text, intent)
        if is_first_contact:
            g_tpl, g_dm, g_rule = self._find_greeting_rule(rules)
            if g_tpl or g_dm:
                template, dm_template, rule_id = g_tpl, g_dm, g_rule

        # For Messenger the DM template wins — the reply IS the DM.
        chosen = (dm_template or template or "").strip()
        if not chosen or not TemplateRenderer.validate(chosen):
            self._mon.debug("message: no matching rule", module="webhook",
                            comment_id=ctx.cid[:12], intent=intent or "")
            return None

        # v4 §5.12 — NO 60-second cooldown on 1:1 Messenger conversations.
        # The old per-user block swallowed consecutive questions: a customer
        # typing "سلام" then "شحال السعر؟" got NO answer to the second one.
        # Rate safety comes from dedup + the plan gate; comments keep theirs.

        reply_text = TemplateRenderer.render(chosen, ctx)

        # v15-D8-B4 — ONE inline attempt: the webhook ACK (HTTP 200) must not
        # wait behind Graph retries + backoff (Facebook redelivers on slow
        # ACKs → duplicate processing). The v4 §5.16 retry loop is retired on
        # THIS path; the failure is still logged with the honest v4 §5.17
        # reason so the owner sees why the reply stopped. (Deferring retries
        # to the next heartbeat needs a message flag — E4's messenger path.)
        result = await self.fb.send_dm(sender_id, reply_text)
        last_err = (result or {}) if isinstance(result, dict) else None
        if result is None or result.get("_error"):
            result = None
            # v4 §5.17 — distinguish the Facebook 24h window (error code 10)
            # from generic failures so the log tells the owner the truth.
            err = last_err.get("_error") if isinstance(last_err, dict) else None
            err_str = str(err or "")
            code_10 = "code 10" in err_str.lower() or "(10)" in err_str or '"code":10' in err_str.replace(" ", "")
            why = (
                "العميل خارج نافذة 24 ساعة — فيسبوك يمنع الرد التلقائي الآن"
                if code_10 else
                f"فشل إرسال الرد الآلي (رسالة إلى {ctx.from_first})"
                + (f" — {err_str[:120]}" if err_str else "")
                + " — تحقق من صلاحية توكن الصفحة"
            )
            self._mon.error("message send failed", module="webhook",
                            comment_id=ctx.cid[:12])
            # Honest telemetry (v3 final-launch §4.3): the owner must SEE why
            # replies stopped — an expired/invalid page token shows up here,
            # not as silence. Persisted with tenant_id so /api/logs surfaces it.
            try:
                async with AsyncSessionLocal() as session:
                    session.add(BotLog(
                        tenant_id=self._tenant_id, level="WARN",
                        message=why))
                    await session.commit()
            except Exception:
                pass
            return None

        self._mon.info(f"→ DM reply to {ctx.from_first}", comment_id=ctx.cid[:12],
                       intent=intent or "", rule_id=rule_id, module="webhook",
                       extra={"duration_ms": f"{(time.time() - t0) * 1000:.0f}"})

        # Persist audit trail + usage counter (same accounting as comments)
        try:
            async with AsyncSessionLocal() as session:
                session.add(BotLog(
                    tenant_id=self._tenant_id, level="INFO",
                    message=f"رد آلي (رسالة) على {ctx.from_first}: {reply_text[:80]}"))
                # v15-D12-H3 — atomic increment (credit_wallet pattern). The
                # old read-modify-write bump lost concurrent updates and its
                # utcnow() microsecond period_start split rows apart.
                limits = await self._get_limits(session)
                await increment_replies_used(
                    session, self._tenant_id, 1,
                    period_start=(limits or {}).get("period_start"),
                )
                await session.commit()
        except Exception:
            pass

        # Live stats broadcast (WS + SSE — same event as comments)
        try:
            from event_bus import event_bus
            payload = {"source": "message", "sender": ctx.from_first}
            if ws_manager:
                spawn(ws_manager.broadcast_to_tenant(self._tenant_id, "stats_update", payload))
            spawn(event_bus.emit("stats_update", payload, tenant_id=self._tenant_id))
        except Exception:
            pass

        return {"mid": (result.get("message_id") or result.get("mid") or ""), "text": reply_text,
                "rule_id": rule_id}

    async def _load_rules_from_db(self) -> list[dict]:
        async with AsyncSessionLocal() as session:
            stmt = select(Rule)
            if self._tenant_id:
                stmt = stmt.where(Rule.tenant_id == self._tenant_id)
            # v4 §5.14 (F1) — deterministic priority order: equal priorities
            # break ties by id, so first-match is stable across restarts.
            stmt = stmt.order_by(Rule.priority, Rule.id)
            result = await session.execute(stmt)
            return [
                {
                    "id": r.id,
                    "keywords": r.keywords or [],
                    "reply_template": r.reply_template or "",
                    "enabled": r.enabled,
                    "priority": getattr(r, "priority", 999),
                    "bot_type": getattr(r, "bot_type", "reply"),
                    "dm_template": getattr(r, "dm_template", ""),
                    "name": r.name,
                }
                for r in result.scalars().all()
            ]

    async def _load_dm_map(self) -> dict[str, str]:
        now = time.time()
        if self._dm_map_cache is not None and (now - self._dm_map_loaded_at) < 300:
            return self._dm_map_cache

        def _read_dm_map() -> dict[str, str]:
            # v10-F1 (ASYNC230/240) — the blocking exists()/open()/json.load()
            # run off the event loop via asyncio.to_thread; failures raise so
            # the (uncached) empty-dict fallback below keeps the old semantics.
            from pathlib import Path
            # v11-A2: this file lives in the fb_dashboard root — ONE level
            # above this module's bot_engine/ package (was: parent).
            json_path = Path(__file__).resolve().parent.parent / "facebook_automation.json"
            with open(json_path, encoding='utf-8') as f:
                data = json.load(f)
            dm = {}
            for r in data.get("rules", []):
                tmpl = r.get("dm_template", "")
                if tmpl:
                    key = str(r["id"])
                    dm[key] = tmpl
            return dm

        try:
            dm = await asyncio.to_thread(_read_dm_map)
            self._dm_map_cache = dm
            self._dm_map_loaded_at = now
            return dm
        except Exception:
            return {}

    async def _add_log(self, session, level: str, message: str):
        session.add(BotLog(level=level, message=message))
        await session.commit()
