"""SmartBot — auto-reply engine (v2).
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
"""
import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, cast, Date
from sqlalchemy.exc import IntegrityError

from database import AsyncSessionLocal
from models import Rule, Reply, BotLog, Offer, BotState, Customer
from fb_client import FBClient
from config import settings

# ── Lazy imports for new modules (graceful if not yet installed) ──
try:
    from ws_manager import ws_manager
except ImportError:
    ws_manager = None  # ponytail: WS disabled when module absent (e.g. some tests)
_enhanced_intent = None
_cache_layer = None
_context_engine = None
_offer_engine = None
_diagnostics = None
_monitor = None

def _get_ei():
    global _enhanced_intent
    if _enhanced_intent is None:
        from enhanced_intent import EnhancedIntentClassifier
        _enhanced_intent = EnhancedIntentClassifier
    return _enhanced_intent

def _get_cache():
    global _cache_layer
    if _cache_layer is None:
        import cache_layer as _cache_layer
    return _cache_layer

def _get_ctx():
    global _context_engine
    if _context_engine is None:
        from context_engine import ContextEngine
        _context_engine = ContextEngine(ttl_seconds=3600)
    return _context_engine

def _get_offer():
    global _offer_engine
    if _offer_engine is None:
        from offer_engine import OfferEngine
        _offer_engine = OfferEngine()
    return _offer_engine

def _get_diag():
    global _diagnostics
    if _diagnostics is None:
        from diagnostics import get_diagnostics
        _diagnostics = get_diagnostics()
    return _diagnostics

def _get_monitor():
    global _monitor
    if _monitor is None:
        from monitor import get_logger
        _monitor = get_logger()
    return _monitor

log = logging.getLogger("fb-bot")

# -------------------------------------------------------------------
# Data classes
# -------------------------------------------------------------------

@dataclass
class CommentContext:
    cid: str
    post_id: str
    text: str
    from_id: str
    from_name: str
    from_first: str
    from_username: str
    raw: dict

@dataclass
class MatchResult:
    template: str
    rule_id: int | None
    rule_name: str
    matched_keyword: str | None = None
    is_catch_all: bool = False

# -------------------------------------------------------------------
# Template Renderer
# -------------------------------------------------------------------

class TemplateRenderer:
    PLACEHOLDERS = ("{name}", "{full_name}", "{username}", "{message}", "{mention}")

    @classmethod
    def render(cls, template: str, ctx: CommentContext) -> str:
        mention = f"@[{ctx.from_id}]" if ctx.from_id else ctx.from_first
        return (template
            .replace("{name}", ctx.from_first)
            .replace("{full_name}", ctx.from_name or ctx.from_first)
            .replace("{username}", ctx.from_username or ctx.from_first)
            .replace("{message}", ctx.text[:100])
            .replace("{mention}", mention))

    @classmethod
    def validate(cls, template: str) -> bool:
        return bool(template and template.strip())

    @classmethod
    def render_with_offer(cls, template: str, ctx: CommentContext, offer_text: str = "") -> str:
        reply = cls.render(template, ctx)
        if offer_text:
            reply += offer_text
        return reply

# -------------------------------------------------------------------
# Stop words
# -------------------------------------------------------------------
_STOP_WORDS = frozenset({
    "في", "من", "إلى", "على", "عن", "مع", "كان", "هذا", "هذه", "ذلك",
    "تلك", "هو", "هي", "هم", "الذي", "التي", "الذين", "ما", "لم", "لن",
    "سوف", "قد", "لقد", "إن", "أن", "لا", "كل", "بعض", "نعم",
    "بلى", "ثم", "أو", "أم", "بل", "لأن", "حتى", "عند", "بين", "خلال",
    "دون", "غير", "مثل", "حول", "بسبب", "رغم", "قبل", "بعد", "فوق",
    "تحت", "داخل", "خارج", "أمام", "وراء", "يمين", "شمال", "فقط",
})

# -------------------------------------------------------------------
# Text Normalizer (v2 — Unicode NFKC for better normalization)
# -------------------------------------------------------------------

class TextNormalizer:
    ALEF_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا"})
    TAH_MAP = str.maketrans({"ة": "ه"})
    YEH_MAP = str.maketrans({"ى": "ي", "ئ": "ي"})
    WAW_MAP = str.maketrans({"ؤ": "و"})
    DIACRITICS = "ًٌٍَُِّْ"
    LIBYAN_PREFIXES = ("باش ", "نحنا ", "انتو ", "هما ", "عندك ", "عندكم ",
                       "شنو ", "شحال ", "قداش ", "قداه ", "شكون ", "علاش ",
                       "واش ", "هذاك ", "هذيك ", "هذولا ")

    @classmethod
    def normalize(cls, text: str) -> str:
        import unicodedata
        t = unicodedata.normalize("NFKC", text.lower().strip())
        t = t.translate(cls.ALEF_MAP).translate(cls.TAH_MAP)
        t = t.translate(cls.YEH_MAP).translate(cls.WAW_MAP)
        for ch in cls.DIACRITICS:
            t = t.replace(ch, "")
        return t

    @classmethod
    def normalize_for_matching(cls, text: str) -> str:
        t = cls.normalize(text)
        for prefix in cls.LIBYAN_PREFIXES:
            if t.startswith(prefix):
                t = t[len(prefix):]
        return t

# -------------------------------------------------------------------
# Intent-Aware Rule Matcher (v2)
# -------------------------------------------------------------------

class IntentAwareMatcher:
    """
    Two-phase matching:
    1. Intent phase: classify comment → find rules whose keywords match the intent
    2. Keyword phase: within intent-matched rules, find best keyword match
    3. Fallback: original keyword-only matching
    4. Last resort: catch-all
    """

    def __init__(self, rules: list[dict], dm_map: dict[str, str] | None = None):
        self._dm_map = dm_map or {}
        # Sort by priority ascending (lower = higher priority)
        self._all_rules = sorted(
            [r for r in rules if r.get("enabled", True)],
            key=lambda r: r.get("priority", 999),
        )
        self._catch_all = None
        self._precompute()

    # intent → rule name prefix map for phase-1 matching
    INTENT_RULE_MAP = {
        "complaint": "frustrated_complaint",
        "problem": "problem_issue",
        "price_inquiry": "price_inquiry",
        "interest_want": "interest_want",
        "order": "interest_want",
        "subscription": "interest_want",
        "contact": "contact_request",
        "availability": "availability",
        "location": "location",
        "working_hours": "working_hours",
        "recommendation": "recommendation",
        "collaboration": "collaboration",
        "greeting": "greeting",
        "welcome": "welcome_greeting",
        "praise": "compliment_praise",
        "thanks": "greeting",
        "emoji_only": "emoji_only",
        "one_word": "one_word_generic",
        "generic": "generic_comment",
        "smart_menu": "generic_comment",
        "negative": "frustrated_complaint",
    }

    def _precompute(self):
        remaining = []
        for r in self._all_rules:
            kw = r.get("keywords", [])
            rname = r.get("name", "")
            if not kw or kw == ["__catch_all__"]:
                self._catch_all = r
                continue
            normalized = []
            for k in kw:
                if not k or k.lower().strip() in _STOP_WORDS:
                    continue
                k_lower = k.lower().strip()
                normalized.append((k_lower, TextNormalizer.normalize_for_matching(k_lower)))
            r["_normalized_kw"] = normalized
            remaining.append(r)
        self._all_rules = remaining

    def match(self, text: str, intent: str | None = None) -> tuple[str | None, str | None, int | None]:
        if not text:
            return None, None, None

        text_lower = text.lower().strip()
        text_norm = TextNormalizer.normalize_for_matching(text_lower)

        # Phase 1: Intent-first — find rule whose name matches the intent
        if intent:
            rule_name = self.INTENT_RULE_MAP.get(intent)
            if rule_name:
                for rule in self._all_rules:
                    if rule.get("name") == rule_name:
                        rid = rule.get("id")
                        dm = self._dm_map.get(str(rid)) or rule.get("dm_template", "")
                        return rule.get("reply_template", ""), dm, rid

        # Phase 2: Keyword scan over all rules
        matched = self._keyword_scan(self._all_rules, text_lower, text_norm)
        if matched:
            return matched

        # Phase 3: Catch-all
        if self._catch_all:
            r = self._catch_all
            rid = r.get("id")
            dm = self._dm_map.get(str(rid)) or r.get("dm_template", "")
            return r.get("reply_template", ""), dm, rid

        return None, None, None

    def _keyword_scan(self, rules: list, text_lower: str, text_norm: str) -> tuple | None:
        """Scan rules for keyword matches — returns first match."""
        for rule in rules:
            nkw = rule.get("_normalized_kw", [])
            if not nkw:
                continue
            for raw, norm in nkw:
                if raw in text_lower or norm in text_norm:
                    rid = rule.get("id")
                    dm = self._dm_map.get(str(rid)) or rule.get("dm_template", "")
                    return rule.get("reply_template", ""), dm, rid
        return None

# -------------------------------------------------------------------
# Cooldown Manager (v2 with configurable window)
# -------------------------------------------------------------------

class CooldownManager:
    def __init__(self, default_cooldown_sec: int = 60):
        self._default_sec = default_cooldown_sec
        self._store: dict[str, float] = {}
        self._user_windows: dict[str, int] = {}  # per-user override

    def is_blocked(self, user_id: str) -> bool:
        if not user_id or user_id in ("None", "0", "undefined"):
            return False
        now = time.time()
        last = self._store.get(user_id)
        window = self._user_windows.get(user_id, self._default_sec)
        if last and (now - last) < window:
            self._store[user_id] = now
            return True
        self._store[user_id] = now
        return False

    def adjust_window(self, user_id: str, seconds: int):
        self._user_windows[user_id] = max(10, min(3600, seconds))

# -------------------------------------------------------------------
# Reply Pipeline (v2 — structured stages with error boundaries)
# -------------------------------------------------------------------

class ReplyPipeline:
    """Pipeline with error boundaries per stage and diagnostics."""

    def __init__(self, fb: FBClient, dedup_engine, cooldown: CooldownManager):
        self.fb = fb
        self.dedup = dedup_engine
        self.cooldown = cooldown
        self._mon = _get_monitor()
        self._diag = _get_diag()

    async def process(self, session, raw_comment: dict, post_id: str,
                      matcher: IntentAwareMatcher) -> bool:
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
            ctx_engine = _get_ctx()
            user_ctx = ctx_engine.get(ctx.from_id)
        except Exception:
            pass

        # Stage 3: Classify intent
        intent = "neutral"
        try:
            EI = _get_ei()
            classification = EI.classify(ctx.text)
            intent = classification["primary_intent"]
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
            self._mon.debug("no matching rule", comment_id=ctx.cid[:12], intent=intent)
            return False

        # Stage 5: Cooldown
        try:
            if self.cooldown.is_blocked(ctx.from_id):
                self._mon.debug(f"cooldown {ctx.from_first}", comment_id=ctx.cid[:12])
                return False
        except Exception:
            pass

        await self.dedup.mark(ctx.cid)

        # Stage 5b: Urgent notification
        try:
            classification_local = locals().get("classification", {})
            urgency = classification_local.get("urgency", 0) if isinstance(classification_local, dict) else 0
            if intent in ("complaint", "urgent", "negative") or urgency > 0.5:
                asyncio.create_task(ws_manager.broadcast("alert", {
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
        offer_text = ""
        sales_stage = None
        try:
            # Check if EnhancedIntentClassifier returned sales info
            if intent in ("price_inquiry", "order", "subscription", "contact", "question"):
                o_engine = _get_offer()
                # New users get welcome offers
                if user_ctx and user_ctx.is_new():
                    offer = await o_engine.get_best_offer(session, ctx.from_id, "welcome")
                else:
                    offer = await o_engine.get_best_offer(session, ctx.from_id, intent)
                offer_text = o_engine.format_offer_text(offer)
                if offer and offer.get("id"):
                    o_engine.mark_delivered(ctx.from_id, offer["id"])
                classification_local = locals().get("classification", {})
                if isinstance(classification_local, dict):
                    sales_stage = classification_local.get("sales_stage") or "consideration"
                else:
                    sales_stage = "consideration"
        except Exception as e:
            self._mon.warn(f"offer failed: {e}", module="pipeline")

        # Stage 7: Render reply
        try:
            reply = TemplateRenderer.render_with_offer(template, ctx, offer_text)
        except Exception as e:
            self._mon.error(f"render failed: {e}", module="pipeline")
            return False

        user_type = "new"
        if user_ctx:
            user_type = "frequent" if user_ctx.is_frequent() else "returning" if user_ctx.is_returning() else "new"
        self._mon.info(f"→ Reply to {ctx.from_first}",
                       comment_id=ctx.cid[:12], intent=intent, rule_id=rule_id,
                       extra={"user_type": user_type, "sales_stage": sales_stage or ""})

        # Stage 8: Send with exponential backoff
        result = None
        max_attempts = 3
        send_started = time.time()
        for attempt in range(max_attempts):
            try:
                result = await self.fb.reply_to_comment(ctx.cid, reply)
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

        # Stage 8b: Send DM (private reply or messenger)
        dm_sent = False
        if dm_template and ctx.from_id and ctx.from_id != str(self.fb.page_id):
            try:
                dm_text = TemplateRenderer.render(dm_template, ctx)
                dm_result = await self.fb.send_private_reply(ctx.cid, dm_text)
                if dm_result:
                    dm_sent = True
                else:
                    dm_result = await self.fb.send_dm(ctx.from_id, dm_text)
                    if dm_result:
                        dm_sent = True
            except Exception as e:
                self._mon.warn(f"dm failed: {e}", module="pipeline")

        # Stage 9: Log to DB
        try:
            session.add(Reply(
                fb_comment_id=ctx.cid,
                fb_post_id=ctx.post_id,
                commenter_name=ctx.from_name,
                comment_text=ctx.text,
                reply_text=reply,
                rule_id=rule_id,
            ))
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
            ctx_engine = _get_ctx()
            uc = ctx_engine.get(ctx.from_id)
            uc.add_comment(ctx.text, intent, rule_id)
            uc.add_reply(reply)
            if intent in ("complaint", "negative"):
                ctx_engine.tag_user(ctx.from_id, "complainer")
            elif intent in ("price_inquiry", "subscription", "order", "contact"):
                ctx_engine.tag_user(ctx.from_id, "potential_buyer")
                # Auto-create/update CRM record in DB
                try:
                    existing = await session.execute(
                        select(Customer).where(Customer.fb_user_id == ctx.from_id)
                    )
                    c = existing.scalar_one_or_none()
                    if c:
                        c.total_interactions = (c.total_interactions or 0) + 1
                        c.last_intent = intent
                        c.last_contacted_at = datetime.utcnow()
                        if c.stage == "lead" and intent in ("price_inquiry", "subscription"):
                            c.stage = "prospect"
                    else:
                        c = Customer(
                            fb_user_id=ctx.from_id, name=ctx.from_name,
                            source="facebook", stage="lead",
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
            asyncio.create_task(ws_manager.broadcast("new_reply", {
                "commenter": ctx.from_name, "comment": ctx.text[:50],
                "reply": reply[:50], "rule_id": rule_id,
            }))
            asyncio.create_task(ws_manager.broadcast("notification", {
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

# -------------------------------------------------------------------
# Shared BotEngine (v2 — singleton pattern with cache, context, diag)
# -------------------------------------------------------------------

class BotEngine:
    """
    Singleton-pattern engine shared across webhook and polling.
    Caches: rules, dedup set. Shared: cooldown, context, diagnostics.
    """

    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, fb: FBClient | None = None):
        if hasattr(self, '_initialized'):
            if fb is not None:
                self.fb = fb
            return
        self._initialized = True
        self.fb = fb
        self.cooldown = CooldownManager(cooldown_sec=60)
        self._cycle = 0
        self._post_reply_count: dict[str, int] = {}
        self._last_rate_reset: float = time.time()
        self._mon = _get_monitor()
        self._diag = _get_diag()
        self._dedup_engine = None
        self._rule_cache = None

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
                # Load rules from cache
                rules = await self._rule_cache.get_rules()
                if not rules:
                    self._mon.warn("no rules — skipping cycle")
                    return

                dm_map = await self._load_dm_map()
                matcher = IntentAwareMatcher(rules, dm_map)

                # Seed dedup from DB
                replied_ids = await self._load_replied_ids(session)
                await self._dedup_engine.load(replied_ids)

                # Fetch posts from FB
                posts, _ = await self.fb.get_page_posts(10)
                elapsed = (time.time() - t_start) * 1000
                self._mon.info(f"⚡ Cycle #{self._cycle}: {len(posts)} posts, {len(rules)} rules",
                               extra={"fetch_ms": f"{elapsed:.0f}"})
                self._diag.record_cycle(elapsed)

                # Reload dedup from DB (in case another instance added replies)
                pipeline = ReplyPipeline(self.fb, self._dedup_engine, self.cooldown)

                total_replied = 0
                for post in posts:
                    pid = post["id"]
                    if not await self._check_rate_limit(pid):
                        continue
                    comments = await self.fb.get_post_comments(pid)
                    for c in comments:
                        if await pipeline.process(session, c, pid, matcher):
                            total_replied += 1
                            self._mark_replied(pid)

                if total_replied:
                    self._mon.info(f"↳ Cycle #{self._cycle}: {total_replied} reply(ies) sent")

                    # Auto-invalidate rule cache after reply (new data may affect matching)
                    # ponytail: aggressive invalidation — optimize when cycle >1000
                    await self._rule_cache.invalidate()

                # Broadcast stats after every cycle (WS + SSE)
                try:
                    from event_bus import event_bus
                    async with AsyncSessionLocal() as s:
                        total = await s.scalar(select(func.count(Reply.id))) or 0
                        today_val = await s.scalar(
                            select(func.count(Reply.id))
                            .where(cast(Reply.created_at, Date) == datetime.utcnow().date())
                        ) or 0
                        payload = {"total_replies": total, "today_replies": today_val, "cycle": self._cycle}
                        asyncio.create_task(ws_manager.broadcast("stats_update", payload))
                        asyncio.create_task(event_bus.emit("stats_update", payload))
                except Exception:
                    pass

                # Cycle end telemetry
                total_comments = 0
                for p_ in posts:
                    try:
                        total_comments += len(await self.fb.get_post_comments(p_["id"]))
                    except Exception:
                        pass
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
                    ctx = _get_ctx()
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

    async def process_single_comment(self, comment: dict, post_id: str):
        """Process a single webhook comment without running a full cycle."""
        cid = comment.get("id", "")[:12]
        t0 = time.time()
        await self._ensure_cache()
        self._mon.info("webhook comment received", comment_id=cid, module="webhook")
        async with AsyncSessionLocal() as session:
            try:
                rules = await self._rule_cache.get_rules()
                if not rules:
                    self._mon.debug("webhook: no rules", comment_id=cid, module="webhook")
                    return
                dm_map = await self._load_dm_map()
                matcher = IntentAwareMatcher(rules, dm_map)
                replied_ids = await self._load_replied_ids(session)
                await self._dedup_engine.load(replied_ids)
                pipeline = ReplyPipeline(self.fb, self._dedup_engine, self.cooldown)
                ok = await pipeline.process(session, comment, post_id, matcher)
                elapsed = (time.time() - t0) * 1000
                self._mon.info(
                    f"webhook {'replied' if ok else 'skipped'}",
                    comment_id=cid, module="webhook",
                    extra={"duration_ms": f"{elapsed:.0f}", "replied": ok},
                )
            except Exception as e:
                self._mon.error(f"Single comment processing error: {e}",
                                comment_id=cid, module="engine")

    async def _load_rules_from_db(self) -> list[dict]:
        async with AsyncSessionLocal() as session:
            stmt = select(Rule)
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
        stmt = select(Reply.fb_comment_id)
        result = await session.execute(stmt)
        return {row[0] for row in result}

    async def _load_dm_map(self) -> dict[str, str]:
        from pathlib import Path
        json_path = Path(__file__).resolve().parent / "facebook_automation.json"
        try:
            with open(json_path, encoding='utf-8') as f:
                data = json.load(f)
            dm = {}
            for r in data.get("rules", []):
                tmpl = r.get("dm_template", "")
                if tmpl:
                    key = str(r["id"])
                    dm[key] = tmpl
            return dm
        except Exception:
            return {}

    async def _add_log(self, session, level: str, message: str):
        session.add(BotLog(level=level, message=message))
        await session.commit()


# ── Backward compatibility aliases ──
RuleMatcher = IntentAwareMatcher

class _CompatIntentClassifier:
    """Backward-compat IntentClassifier using EnhancedIntentClassifier."""
    @classmethod
    def classify(cls, text: str) -> str:
        try:
            from enhanced_intent import EnhancedIntentClassifier
            result = EnhancedIntentClassifier.classify(text)
            return EnhancedIntentClassifier.to_legacy(result)
        except Exception:
            return "neutral"

IntentClassifier = _CompatIntentClassifier
