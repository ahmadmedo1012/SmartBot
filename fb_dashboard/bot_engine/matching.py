from __future__ import annotations

"""Rule matching for the auto-reply engine: comment context dataclasses, the
intent-aware two-phase matcher and legacy classifier aliases (extracted
verbatim from the old monolithic ``bot.py``, v11-A2).
"""

from dataclasses import dataclass
from typing import ClassVar

from bot_engine.text import TextNormalizer

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
    # v10-F2 (RUF012): read-only class constant — annotated ClassVar so the
    # mutable dict default is an explicit, never-reassigned mapping.
    INTENT_RULE_MAP: ClassVar[dict[str, str]] = {
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
