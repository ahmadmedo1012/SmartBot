from __future__ import annotations
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
from _utils import utcnow

from sqlalchemy import select, func, cast, Date, desc
from sqlalchemy.exc import IntegrityError

from database import AsyncSessionLocal
from models import Rule, Reply, BotLog, Offer, BotState, Customer
from models import Tenant, SubscriptionPlan, UsageCounter
from fb_client import FBClient
from config import settings

# ── Per-tenant engine registries (instead of module-level singletons) ──
try:
    from ws_manager import ws_manager
except ImportError:
    ws_manager = None  # ponytail: WS disabled when module absent (e.g. some tests)
_enhanced_intent = None
_cache_layer = None
_monitor = None

# ponytail: per-tenant state dicts. Replace with Redis-backed registry when multi-worker.
_tenant_context_engines: dict[int, object] = {}
_tenant_offer_engines: dict[int, object] = {}
_tenant_diag_engines: dict[int, object] = {}
_lock = __import__('threading').RLock()

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

def _get_ctx(tenant_id: int = 0):
    global _tenant_context_engines
    with _lock:
        if tenant_id not in _tenant_context_engines:
            from context_engine import ContextEngine
            _tenant_context_engines[tenant_id] = ContextEngine(ttl_seconds=3600)
        return _tenant_context_engines[tenant_id]

def _get_offer(tenant_id: int = 0):
    global _tenant_offer_engines
    with _lock:
        if tenant_id not in _tenant_offer_engines:
            from offer_engine import OfferEngine
            _tenant_offer_engines[tenant_id] = OfferEngine()
        return _tenant_offer_engines[tenant_id]

def _get_diag(tenant_id: int = 0):
    global _tenant_diag_engines
    with _lock:
        if tenant_id not in _tenant_diag_engines:
            from diagnostics import DiagnosticsEngine
            _tenant_diag_engines[tenant_id] = DiagnosticsEngine()
        return _tenant_diag_engines[tenant_id]

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

    TATWEEL = "ـ"  # U+0640 — السـعر should equal السعر (v4 §5.19)

    @classmethod
    def normalize(cls, text: str) -> str:
        import unicodedata
        t = unicodedata.normalize("NFKC", text.lower().strip())
        t = t.translate(cls.ALEF_MAP).translate(cls.TAH_MAP)
        t = t.translate(cls.YEH_MAP).translate(cls.WAW_MAP)
        for ch in cls.DIACRITICS:
            t = t.replace(ch, "")
        t = t.replace(cls.TATWEEL, "")
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
                # v4 §5.19 (F3) — FIRST (lowest-priority) catch-all wins; the
                # old loop overwrote on every match so the LAST one won.
                if self._catch_all is None:
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
                        nkw = rule.get("_normalized_kw", [])
                        if nkw and any(raw in text_lower or norm in text_norm for raw, norm in nkw):
                            rid = rule.get("id")
                            dm = self._dm_map.get(rule.get("name")) or rule.get("dm_template", "")
                            return rule.get("reply_template", ""), dm, rid
                        break  # rule found but no keyword match → fall to Phase 2

        # Phase 2: Keyword scan over all rules
        matched = self._keyword_scan(self._all_rules, text_lower, text_norm)
        if matched:
            return matched

        # Phase 3: Catch-all
        if self._catch_all:
            r = self._catch_all
            rid = r.get("id")
            dm = self._dm_map.get(r.get("name")) or r.get("dm_template", "")
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
                    dm = self._dm_map.get(rule.get("name")) or rule.get("dm_template", "")
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
            return True
        self._store[user_id] = now
        return False

    def adjust_window(self, user_id: str, seconds: int):
        seconds = max(10, min(3600, seconds))
        if user_id == "global":
            self._default_sec = seconds
        else:
            self._user_windows[user_id] = seconds

# -------------------------------------------------------------------
# Reply Pipeline (v2 — structured stages with error boundaries)
# -------------------------------------------------------------------

class ReplyPipeline:
    """Pipeline with error boundaries per stage and diagnostics."""

    def __init__(self, fb: FBClient, dedup_engine, cooldown: CooldownManager, tenant_id: int = 0):
        self.fb = fb
        self.dedup = dedup_engine
        self.cooldown = cooldown
        self._tenant_id = tenant_id
        self._mon = _get_monitor()
        self._diag = _get_diag(self._tenant_id)

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
                asyncio.create_task(ws_manager.broadcast_to_tenant(self._tenant_id, "alert", {
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

        # Mark dedup only after successful send
        await self.dedup.mark(ctx.cid)

        # Stage 8b: Send DM (private reply or messenger)
        dm_sent = False
        if dm_template and ctx.from_id and ctx.from_id != str(self.fb.page_id):
            try:
                log.info(f"DM attempt to {ctx.from_first}: template={dm_template[:50]}")
                dm_text = TemplateRenderer.render(dm_template, ctx)
                # Strategy 1: Private reply — works when page has pages_manage_metadata
                dm_result = await self.fb.send_private_reply(ctx.cid, dm_text)
                if dm_result and not dm_result.get("_error"):
                    dm_sent = True
                else:
                    fb_err = "(unknown)"
                    if dm_result and dm_result.get("_error"):
                        fb_err = dm_result.get("body", dm_result.get("error", fb_err))
                    self._mon.warn(f"private_reply failed: {fb_err}", comment_id=ctx.cid[:12], module="pipeline")
                    # Strategy 2: MESSAGE_TAG — works for opted-in users without prior conversation
                    dm_result = await self.fb.send_dm(ctx.from_id, dm_text, messaging_type="MESSAGE_TAG", tag="POST_PURCHASE_UPDATE")
                    if dm_result:
                        dm_sent = True
                    else:
                        # Strategy 3: RESPONSE — requires user messaged page in last 24h
                        dm_result = await self.fb.send_dm(ctx.from_id, dm_text, messaging_type="RESPONSE")
                        if dm_result:
                            dm_sent = True
                if dm_sent:
                    self._mon.info(f"✓ DM sent to {ctx.from_first}", comment_id=ctx.cid[:12])
                else:
                    self._mon.warn(f"× DM failed after all strategies", comment_id=ctx.cid[:12], module="pipeline")
            except Exception as e:
                self._mon.warn(f"dm failed: {e}", comment_id=ctx.cid[:12], module="pipeline")

        # Stage 9: Log to DB
        try:
            session.add(Reply(
                tenant_id=self._tenant_id,
                fb_comment_id=ctx.cid,
                fb_post_id=ctx.post_id,
                commenter_name=ctx.from_name,
                comment_text=ctx.text,
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
                    existing = await session.execute(
                        select(Customer).where(Customer.fb_user_id == ctx.from_id)
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
                asyncio.create_task(ws_manager.broadcast_to_tenant(self._tenant_id, "new_reply", {
                    "commenter": ctx.from_name, "comment": ctx.text[:50],
                    "reply": reply[:50], "rule_id": rule_id,
                }))
                asyncio.create_task(ws_manager.broadcast_to_tenant(self._tenant_id, "notification", {
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
                plan_ok = True
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

                dm_map = await self._load_dm_map()

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
                try:
                    from event_bus import event_bus
                    async with AsyncSessionLocal() as s:
                        total = await s.scalar(select(func.count(Reply.id))) or 0
                        today_val = await s.scalar(
                            select(func.count(Reply.id))
                            .where(cast(Reply.created_at, Date) == utcnow().date())
                        ) or 0
                        payload = {"total_replies": total, "today_replies": today_val, "cycle": self._cycle}
                        if ws_manager:
                            asyncio.create_task(ws_manager.broadcast_to_tenant(self._tenant_id, "stats_update", payload))
                        asyncio.create_task(event_bus.emit("stats_update", payload, tenant_id=self._tenant_id))
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

        from bot import CommentContext, IntentAwareMatcher, TemplateRenderer
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
                asyncio.create_task(ws_manager.broadcast_to_tenant(self._tenant_id, "stats_update", payload))
            asyncio.create_task(event_bus.emit("stats_update", payload, tenant_id=self._tenant_id))
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
            self._dm_map_cache = dm
            self._dm_map_loaded_at = now
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
