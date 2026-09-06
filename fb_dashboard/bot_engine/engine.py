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
from datetime import datetime, timedelta

from _async import spawn  # v9-A11: GC-safe background tasks
from _utils import utcnow
from database import AsyncSessionLocal
from fb_client import FBClient
from models import BotLog, Reply, Rule, Tenant, UsageCounter
from sqlalchemy import Date, cast, desc, func, select

from bot_engine.cooldown import CooldownManager
from bot_engine.deps import _get_cache, _get_ctx, _get_diag, _get_ei, _get_monitor, ws_manager
from bot_engine.matching import IntentAwareMatcher
from bot_engine.pipeline import ReplyPipeline

# -------------------------------------------------------------------
# BotEngine — per-tenant engine (dict[tenant_id] registry in _services)
# -------------------------------------------------------------------

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
        """Full bot cycle: load rules → fetch posts → process comments."""
        self._cycle += 1
        await self._ensure_cache()
        t_start = time.time()

        async with AsyncSessionLocal() as session:
            try:
                # ── Plan enforcement: skip if tenant subscription expired ──
                tenant = await session.get(Tenant, self._tenant_id)
                if tenant and tenant.subscription_status == "UNPAID":
                    self._mon.warn("tenant unpaid — skipping cycle")
                    return
                if tenant and tenant.plan_end and utcnow() > tenant.plan_end:
                    if tenant.subscription_status == "TRIAL":
                        # Plan §2.6: expired trial → EXPIRED_TRIAL. The engine KEEPS
                        # running (basic auto-replies stay) — paid features are
                        # gated elsewhere (has_ai/has_broadcast flags).
                        tenant.subscription_status = "EXPIRED_TRIAL"
                        await session.commit()
                        self._mon.warn("tenant trial expired — EXPIRED_TRIAL (bot continues, paid features off)")
                    else:
                        tenant.subscription_status = "UNPAID"
                        await session.commit()
                        self._mon.warn("tenant plan expired — skipping cycle")
                        return
                # Self-healing usage counter reset
                if tenant and tenant.plan_start:
                    period_start = tenant.plan_start
                    counters = await session.execute(
                        select(UsageCounter).where(
                            UsageCounter.tenant_id == self._tenant_id,
                            UsageCounter.period_start < period_start,
                        )
                    )
                    for c in counters.scalars().all():
                        c.period_start = period_start
                        c.current_value = 0
                    if counters:
                        await session.commit()

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

                    # Increment usage counter (atomic)
                    try:
                        counter = await session.execute(
                            select(UsageCounter).where(
                                UsageCounter.tenant_id == self._tenant_id,
                                UsageCounter.metric == "replies_used",
                            ).order_by(desc(UsageCounter.period_start)).limit(1)
                        )
                        uc = counter.scalar_one_or_none()
                        if uc:
                            uc.current_value = (uc.current_value or 0) + total_replied
                        else:
                            session.add(UsageCounter(
                                tenant_id=self._tenant_id, metric="replies_used",
                                period_start=utcnow(), current_value=total_replied,
                            ))
                        await session.commit()
                    except Exception:
                        pass

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
                        payload = {"total_replies": total, "today_replies": today_val, "cycle": self._cycle}
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

    async def _process_comment(self, session, comment: dict, post_id: str) -> bool:
        """Shared setup + process: loads rules, seeds dedup, creates pipeline, processes one comment."""
        rules = await self._rule_cache.get_rules()
        if not rules:
            return False
        dm_map = await self._load_dm_map()
        matcher = IntentAwareMatcher(rules, dm_map)
        replied_ids = await self._load_replied_ids(session)
        await self._dedup_engine.load(replied_ids)
        pipeline = ReplyPipeline(self.fb, self._dedup_engine, self.cooldown, tenant_id=self._tenant_id)
        return await pipeline.process(session, comment, post_id, matcher)

    async def process_single_comment(self, comment: dict, post_id: str):
        """Process a single webhook comment without running a full cycle."""
        cid = comment.get("id", "")[:12]
        t0 = time.time()
        await self._ensure_cache()
        self._mon.info("webhook comment received", comment_id=cid, module="webhook")
        async with AsyncSessionLocal() as session:
            try:
                ok = await self._process_comment(session, comment, post_id)
                elapsed = (time.time() - t0) * 1000
                self._mon.info(
                    f"webhook {'replied' if ok else 'skipped'}",
                    comment_id=cid, module="webhook",
                    extra={"duration_ms": f"{elapsed:.0f}", "replied": ok},
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
        """
        if not self._tenant_id:
            return True  # legacy singleton — no tenant to gate
        try:
            async with AsyncSessionLocal() as session:
                tenant = await session.get(Tenant, self._tenant_id)
                if not tenant:
                    return True
                if tenant.subscription_status == "REJECTED":
                    return False
                if tenant.subscription_status == "UNPAID" and tenant.plan_end and utcnow() > tenant.plan_end:
                    return False
                if tenant.plan_end and utcnow() > tenant.plan_end:
                    if tenant.subscription_status == "TRIAL":
                        tenant.subscription_status = "EXPIRED_TRIAL"
                        await session.commit()
                        return True  # basic auto-replies stay on
                    if tenant.subscription_status not in ("FREE", "PAID"):
                        return False
                return True
        except Exception:
            return True  # fail-open: never lose replies over a DB hiccup

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

        # v4 §5.16 — 3 attempts with exponential backoff (same as comments);
        # a single transient failure no longer silently loses the reply.
        result = None
        last_err = None
        for attempt in range(3):
            result = await self.fb.send_dm(sender_id, reply_text)
            if result is not None and not result.get("_error"):
                break
            last_err = (result or {}) if isinstance(result, dict) else None
            result = None
            await asyncio.sleep(1.2 ** attempt)
        if result is None or result.get("_error"):
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
                counter = await session.execute(
                    select(UsageCounter).where(
                        UsageCounter.tenant_id == self._tenant_id,
                        UsageCounter.metric == "replies_used",
                    ).order_by(desc(UsageCounter.period_start)).limit(1)
                )
                uc = counter.scalar_one_or_none()
                if uc:
                    uc.current_value = (uc.current_value or 0) + 1
                else:
                    session.add(UsageCounter(
                        tenant_id=self._tenant_id, metric="replies_used",
                        period_start=utcnow(), current_value=1,
                    ))
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

    async def _load_replied_ids(self, session) -> set[str]:
        cutoff = datetime.utcnow() - timedelta(hours=48)
        stmt = select(Reply.fb_comment_id).where(Reply.created_at >= cutoff)
        if self._tenant_id:
            stmt = stmt.where(Reply.tenant_id == self._tenant_id)
        result = await session.execute(stmt)
        return {row[0] for row in result}

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
