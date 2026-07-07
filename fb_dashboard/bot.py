"""SmartBot — Facebook auto-reply engine.
Modular architecture: Engine → Pipeline → Matcher → State.

Flow:
  run_auto_reply       (entry, called by main.py loop + webhook)
    → fetch comments   (FBClient.get_page_posts + get_post_comments)
    → dedup filter     (DedupEngine — memory + DB)
    → classify intent  (IntentClassifier — keyword sets)
    → match rule       (RuleMatcher — priority + catch-all)
    → cooldown check   (CooldownManager — in-memory dict)
    → render reply     (TemplateRenderer — {name}, {mention}, etc.)
    → send reply       (FBClient.reply_to_comment with retry)
    → log to DB        (Reply model + BotLog)
"""
import asyncio
import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from database import AsyncSessionLocal
from models import Rule, Reply, BotLog
from fb_client import FBClient
from config import settings

log = logging.getLogger("fb-bot")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class CommentContext:
    """Structured data extracted from a raw Facebook comment."""
    cid: str
    post_id: str
    text: str
    from_id: str
    from_name: str          # full name if available, else fallback
    from_first: str         # first name
    from_username: str      # empty if not available (deprecated in v2.0+)
    raw: dict               # original comment dict for debugging


@dataclass
class MatchResult:
    """Result of rule matching."""
    template: str
    rule_id: int | None
    rule_name: str
    intent: str       # intent_classify(text)
    matched_keyword: str | None = None
    is_catch_all: bool = False


# ---------------------------------------------------------------------------
# Intent Classifier
# ---------------------------------------------------------------------------

class IntentClassifier:
    """Lightweight set-based intent classification."""

    # ponytail: set-based intersection. Upgrade to ML when rules >50.
    _NEGATIVE = {"غش", "نصب", "خايس", "فظيع", "سيء", "رديء", "weak",
        "terrible", "scam", "زبالة", "مقرف", "disgusting", "worst",
        "horrible", "broken", "احتيال", "محتال", "fake", "fraud",
        "خسارة", "فاشل", "فشل", "failure", "cheat", "cheated",
        "مظلوم", "حرامية", "نهب", "سرقة", "ضحك", "على عينك", "كذابين",
        "كذاب", "نصابين", "نصابة", "مزيف", "مخيس", "مو زين", "مو حلو",
        "زفت", "خرا", "خربان", "مكسر", "متعب", "تعبان"}
    _POSITIVE = {"جميل", "رائع", "حلو", "nice", "great", "awesome",
        "ممتاز", "excellent", "amazing", "fantastic", "مبدع", "ابداع",
        "love", "loved", "best", "wonderful",
        "زين", "باهي", "فخم", "جيد", "قدها", "تمام", "مزيان",
        "زينة", "باهية", "فخمة", "قدها وقدود", "هايل", "ممتازة"}
    _QUESTION = {"كم", "سعر", "price", "how", "what", "أين", "وين",
        "متى", "كيف", "question", "query", "سؤال", "استفسار", "help",
        "مساعدة", "when", "where", "why",
        "شحال", "شنو", "شكون", "علاش", "على شاش", "قداش", "قداه"}
    _CONTACT = {"رقم", "واتساب", "whatsapp", "تواصل", "message",
        "contact", "dm", "رسالة", "ارسل", "call", "phone", "telegram",
        "خابر", "كلم", "خاص", "راسل", "ابعث", "ماسنجر", "برنامج",
        "تيليغرام", "تيليجرام", "الوتساب", "ع الخاص", "خبرني"}

    @classmethod
    def classify(cls, text: str) -> str:
        """Returns one of: negative | positive | question | contact | neutral."""
        words = set(text.lower().strip().split())
        if words & cls._NEGATIVE:
            return "negative"
        if words & cls._CONTACT:
            return "contact"
        if words & cls._QUESTION:
            return "question"
        if words & cls._POSITIVE:
            return "positive"
        return "neutral"


# ---------------------------------------------------------------------------
# Text normalizer
# ---------------------------------------------------------------------------

class TextNormalizer:
    """Arabic text normalization for robust matching."""

    # Mapping of common character variants to their normalized form
    ALEF_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا"})
    TAH_MAP = str.maketrans({"ة": "ه"})
    YEH_MAP = str.maketrans({"ى": "ي", "ئ": "ي"})
    WAW_MAP = str.maketrans({"ؤ": "و"})
    DIACRITICS = "ًٌٍَُِّْ"

    @classmethod
    def normalize(cls, text: str) -> str:
        """Normalize Arabic text for consistent keyword matching."""
        t = text.lower().strip()
        t = t.translate(cls.ALEF_MAP).translate(cls.TAH_MAP)
        t = t.translate(cls.YEH_MAP).translate(cls.WAW_MAP)
        for ch in cls.DIACRITICS:
            t = t.replace(ch, "")
        return t


# ---------------------------------------------------------------------------
# Template Renderer
# ---------------------------------------------------------------------------

class TemplateRenderer:
    """Safely replaces all template placeholders."""

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
        """Returns True if template is usable (has required vars)."""
        return bool(template and template.strip())


# ---------------------------------------------------------------------------
# Stop word filter
# ---------------------------------------------------------------------------

# Common Arabic stop words that should never trigger a rule
_STOP_WORDS = frozenset({
    "في", "من", "إلى", "على", "عن", "مع", "كان", "هذا", "هذه", "ذلك",
    "تلك", "هو", "هي", "هم", "الذي", "التي", "الذين", "ما", "لم", "لن",
    "سوف", "قد", "لقد", "إن", "أن", "لا", "ما", "كل", "بعض", "نعم",
    "بلى", "ثم", "أو", "أم", "بل", "لأن", "حتى", "عند", "بين", "خلال",
    "دون", "غير", "مثل", "حول", "بسبب", "رغم", "قبل", "بعد", "فوق",
    "تحت", "داخل", "خارج", "أمام", "وراء", "يمين", "شمال", "فقط",
})


# ---------------------------------------------------------------------------
# Rule Matcher
# ---------------------------------------------------------------------------

class RuleMatcher:
    """Priority-order rule matching with catch-all, normalization, stop words."""

    def __init__(self, rules: list[dict], dm_map: dict[str, str] | None = None):
        self._dm_map = dm_map or {}
        self._reply_rules = sorted(
            [r for r in rules if r.get("bot_type") == "reply" and r.get("enabled", True)],
            key=lambda r: r.get("priority", 999),
        )
        self._catch_all = None
        self._precompute()

    def _precompute(self):
        """Extract catch-all and pre-normalize keywords."""
        remaining = []
        for r in self._reply_rules:
            kw = r.get("keywords", [])
            if not kw or kw == ["__catch_all__"]:
                self._catch_all = r  # store WHOLE rule dict
                continue
            normalized = []
            for k in kw:
                if not k:
                    continue
                k_lower = k.lower().strip()
                if k_lower in _STOP_WORDS:
                    continue
                normalized.append((k_lower, TextNormalizer.normalize(k_lower)))
            r["_normalized_kw"] = normalized
            remaining.append(r)
        self._reply_rules = remaining

    def match(self, text: str) -> tuple[str | None, str | None, int | None]:
        """Returns (reply_template, dm_template, rule_id) or (None, None, None)."""
        if not text:
            return None, None, None
        text_lower = text.lower().strip()
        text_norm = TextNormalizer.normalize(text_lower)

        for rule in self._reply_rules:
            nkw = rule.get("_normalized_kw", [])
            if not nkw:
                continue
            for raw, norm in nkw:
                if raw in text_lower or norm in text_norm:
                    rid = rule.get("id")
                    dm = self._dm_map.get(str(rid)) or self._dm_map.get(rule.get("name", ""), "") or rule.get("dm_template", "")
                    return rule.get("reply_template", ""), dm, rid
        if self._catch_all:
            r = self._catch_all
            rid = r.get("id")
            dm = self._dm_map.get(str(rid)) or self._dm_map.get(r.get("name", ""), "") or r.get("dm_template", "")
            return r.get("reply_template", ""), dm, rid
        return None, None, None


# ---------------------------------------------------------------------------
# Dedup Engine
# ---------------------------------------------------------------------------

class DedupEngine:
    """Dual-layer dedup: in-memory (fast) + DB-backed (persistent)."""

    def __init__(self):
        self._memory: set[str] = set()

    def load_from_db(self, replied_ids: set[str]):
        """Sync from database on startup."""
        self._memory = set(replied_ids)

    def is_duplicate(self, cid: str) -> bool:
        return cid in self._memory

    def mark_as_replied(self, cid: str):
        self._memory.add(cid)


# ---------------------------------------------------------------------------
# Cooldown Manager
# ---------------------------------------------------------------------------

class CooldownManager:
    """Per-user cooldown to prevent reply spam."""

    def __init__(self, cooldown_sec: int = 60):
        self._cooldown_sec = cooldown_sec
        self._store: dict[str, float] = {}

    def is_blocked(self, user_id: str) -> bool:
        if not user_id or user_id in ("None", "0", "undefined"):
            return False  # unknown user — allow reply
        last = self._store.get(user_id)
        if last and time.time() - last < self._cooldown_sec:
            return True
        self._store[user_id] = time.time()
        return False


# ---------------------------------------------------------------------------
# Reply Pipeline
# ---------------------------------------------------------------------------

class ReplyPipeline:
    """Full pipeline: extract → classify → match → render → send → log."""

    def __init__(self, fb: FBClient, dedup: DedupEngine, cooldown: CooldownManager):
        self.fb = fb
        self.dedup = dedup
        self.cooldown = cooldown

    async def process(self, session, raw_comment: dict, post_id: str,
                      matcher: RuleMatcher) -> bool:
        """Returns True if a reply was sent."""
        ctx = self._extract(raw_comment, post_id)
        if not ctx or not ctx.text:
            return False

        # 1. Skip own page comments
        page_id_str = str(self.fb.page_id)
        if ctx.from_id and ctx.from_id not in ('None', '0') and ctx.from_id == page_id_str:
            return False

        # 2. Dedup check (memory + DB)
        if self.dedup.is_duplicate(ctx.cid):
            return False

        # 3. Match rule — returns (reply_template, dm_template)
        template, dm_template, rule_id = matcher.match(ctx.text)
        if not template or not TemplateRenderer.validate(template):
            return False

        # 4. Cooldown
        if self.cooldown.is_blocked(ctx.from_id):
            log.debug(f"Cooldown {ctx.from_first} ({ctx.from_id})")
            return False

        self.dedup.mark_as_replied(ctx.cid)

        # 5. Classify intent (logging only)
        intent = IntentClassifier.classify(ctx.text)
        log.debug(f"Intent[{ctx.cid[:12]}]: {intent}")

        # 6. Render reply
        reply = TemplateRenderer.render(template, ctx)
        log.info(f"→ Replying to {ctx.from_first}: \"{ctx.text[:50]}\" matched \"{intent}\"")

        # 7. Send reply with retries
        result = None
        for attempt in range(3):
            result = await self.fb.reply_to_comment(ctx.cid, reply)
            if result:
                break
            log.warning(f"Retry {attempt+1}/{3} for comment {ctx.cid[:12]}")
            await asyncio.sleep(1)

        if result is None:
            log.error(f"✗ Reply to {ctx.cid[:12]} failed after 3 attempts")
            return False

        # 7b. Send DM via private reply (works for ANY commenter — no prior Messenger needed)
        dm_sent = False
        if dm_template and ctx.from_id and ctx.from_id != str(self.fb.page_id):
            dm_text = TemplateRenderer.render(dm_template, ctx)
            # Try private_reply first (most permissive — requires read_page_mailboxes)
            dm_result = await self.fb.send_private_reply(ctx.cid, dm_text)
            if dm_result:
                dm_sent = True
                log.info(f"✉️ Private reply sent to {ctx.from_first}")
            else:
                # Fallback: Messenger DM (requires pages_messaging)
                dm_result = await self.fb.send_dm(ctx.from_id, dm_text)
                if dm_result:
                    dm_sent = True
                    log.info(f"✉️ DM sent to {ctx.from_first} via Messenger")
                else:
                    log.warning(f"✉️ Both private_reply and DM failed for {ctx.from_first}")

        # 8. Log to DB
        session.add(Reply(
            fb_comment_id=ctx.cid,
            fb_post_id=ctx.post_id,
            commenter_name=ctx.from_name,
            comment_text=ctx.text,
            reply_text=reply,
            rule_id=rule_id,
        ))
        try:
            await session.commit()
            log.info(f"✓ Replied to {ctx.from_first}: \"{ctx.text[:40]}\"")
            # Notify WebSocket clients
            try:
                from ws_manager import ws_manager
                await ws_manager.broadcast("new_reply", {
                    "commenter": ctx.from_name,
                    "comment": ctx.text[:50],
                    "reply": reply[:50],
                    "rule_id": rule_id,
                })
            except Exception:
                pass
            return True
        except IntegrityError:
            await session.rollback()
            log.info(f"Duplicate prevented (DB) {ctx.cid[:12]}")
            return False

    def _extract(self, c: dict, post_id: str) -> CommentContext | None:
        """Build CommentContext from raw Facebook comment dict."""
        cid = c.get("id", "")
        msg = (c.get("message", "") or "").strip()
        if not cid:
            return None
        from_data = c.get("from", {})
        from_id = str(from_data.get("id", "")) if from_data.get("id") else ""
        from_name = from_data.get("name", "") or ""
        # fallback chain: name → username → "صديقنا"
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


# ---------------------------------------------------------------------------
# Bot Engine
# ---------------------------------------------------------------------------

class BotEngine:
    """Orchestrates the full auto-reply cycle."""

    def __init__(self, fb: FBClient):
        self.fb = fb
        self.dedup = DedupEngine()
        self.cooldown = CooldownManager(cooldown_sec=60)
        self.pipeline = ReplyPipeline(fb, self.dedup, self.cooldown)
        self._cycle = 0
        self._post_reply_count: dict[str, int] = {}
        self._last_rate_reset: float = time.time()

    async def _check_rate_limit(self, post_id: str) -> bool:
        """Returns True if under rate limit for this post (max 5 replies/post/min)."""
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
        """Run one full auto-reply cycle: fetch posts → comments → process."""
        self._cycle += 1
        async with AsyncSessionLocal() as session:
            try:
                rules = await self._load_rules(session)
                if not rules:
                    log.warning("No rules loaded — skipping cycle")
                    return

                dm_map = await self._load_dm_map()
                matcher = RuleMatcher(rules, dm_map)
                replied_ids = await self._load_replied_ids(session)
                self.dedup.load_from_db(replied_ids)

                # Load welcomed_senders from BotState (persisted across restarts)
                welcomed_state = await self._get_bot_state(session, "welcomed_senders")
                welcomed_senders = set(json.loads(welcomed_state)) if welcomed_state else set()

                posts, _ = await self.fb.get_page_posts(10)
                log.info(f"⚡ Cycle #{self._cycle}: {len(posts)} posts, {len(rules)} rules")

                total_replied = 0
                welcomed_modified = False
                for post in posts:
                    pid = post["id"]
                    if not await self._check_rate_limit(pid):
                        continue  # skip post if rate limited
                    comments = await self.fb.get_post_comments(pid)
                    for c in comments:
                        if await self.pipeline.process(session, c, pid, matcher):
                            total_replied += 1
                            self._mark_replied(pid)
                        # Check if this was a welcome comment (needs tracking)
                        ctx = self.pipeline._extract(c, pid)
                        if ctx and ctx.from_id and ctx.from_id not in welcomed_senders:
                            # Check if this sender should be tracked via welcome rule
                            for rule in rules:
                                bt = rule.get("bot_type") or rule.get("description", "")
                                if bt in ("reply", ""):
                                    continue
                                if bt == "welcome":
                                    welcomed_senders.add(ctx.from_id)
                                    welcomed_modified = True
                                    break

                # Save welcomed_senders if modified
                if welcomed_modified:
                    await self._save_bot_state(session, "welcomed_senders", json.dumps(list(welcomed_senders)))

                if total_replied:
                    log.info(f"↳ Cycle #{self._cycle}: {total_replied} reply(ies) sent")

                # Heartbeat every 10 cycles
                if self._cycle % 10 == 0:
                    await self._add_log(session, "INFO",
                        f"💓 Heartbeat #{self._cycle}: {len(posts)} posts / {len(rules)} rules / {total_replied} replied")

            except Exception as e:
                log.error(f"Cycle #{self._cycle} error: {e}", exc_info=True)
                await self._add_log(session, "ERROR", str(e)[:500])

    async def _load_rules(self, session) -> list[dict]:
        stmt = select(Rule)
        result = await session.execute(stmt)
        return [
            {
                "id": r.id,
                "keywords": r.keywords or [],
                "reply_template": r.reply_template or "",
                "enabled": r.enabled,
                "priority": getattr(r, "priority", 999),
                "bot_type": r.description if r.description in ("reply", "welcome") else "reply",
            }
            for r in result.scalars().all()
        ]

    async def _load_replied_ids(self, session) -> set[str]:
        stmt = select(Reply.fb_comment_id)
        result = await session.execute(stmt)
        return {row[0] for row in result}

    async def _add_log(self, session, level: str, message: str):
        session.add(BotLog(level=level, message=message))
        await session.commit()

    async def _get_bot_state(self, session, key: str) -> str | None:
        from models import BotState
        stmt = select(BotState.value).where(BotState.key == key)
        result = await session.execute(stmt)
        row = result.scalar_one_or_none()
        return row

    async def _save_bot_state(self, session, key: str, value: str):
        from models import BotState
        stmt = select(BotState).where(BotState.key == key)
        result = await session.execute(stmt)
        state = result.scalar_one_or_none()
        if state:
            state.value = value
        else:
            session.add(BotState(key=key, value=value))
        await session.commit()

    async def _load_dm_map(self) -> dict[str, str]:
        """Load dm_template map from JSON. Keys: str(id), name, and name+id."""
        from pathlib import Path
        json_path = Path(__file__).resolve().parent.parent / "facebook_automation.json"
        try:
            with open(json_path, encoding='utf-8') as f:
                data = json.load(f)
            dm = {}
            for r in data.get("rules", []):
                tmpl = r.get("dm_template", "")
                if tmpl:
                    dm[str(r["id"])] = tmpl
                    dm[r["id"]] = tmpl  # also key by the string id value
            return dm
        except Exception:
            return {}


