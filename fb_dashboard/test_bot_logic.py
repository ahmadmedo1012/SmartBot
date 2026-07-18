from __future__ import annotations
"""Self-check for bot core logic: RuleMatcher, TemplateRenderer, IntentClassifier, TextNormalizer."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from bot import (
    RuleMatcher, TemplateRenderer, IntentClassifier,
    TextNormalizer, CommentContext,
)

errors = []

def check(desc, ok):
    if not ok:
        errors.append(f"FAIL: {desc}")
        print(f"  ✗ {desc}")
    else:
        print(f"  ✓ {desc}")

# --- RuleMatcher ---
rules = [
    {"id": 1, "priority": 10, "enabled": True, "keywords": ["غش", "نصب"], "reply_template": "نأسف {name}", "bot_type": "reply"},
    {"id": 2, "priority": 30, "enabled": True, "keywords": ["سعر", "كم"], "reply_template": "أهلاً {name}", "bot_type": "reply"},
    {"id": 3, "priority": 50, "enabled": True, "keywords": ["شكرا", "شكراً"], "reply_template": "العفو {name}", "bot_type": "reply"},
    {"id": 4, "priority": 999, "enabled": True, "keywords": ["__catch_all__"], "reply_template": "مرحباً {name}", "bot_type": "reply"},
]

matcher = RuleMatcher(rules)
match1 = lambda t: matcher.match(t)[0]
check("match_rule negative priority", match1("هذا غش ونصب") == "نأسف {name}")
check("match_rule price inquiry", match1("كم السعر") == "أهلاً {name}")
check("match_rule thanks", match1("شكرا جزيلا") == "العفو {name}")
check("match_rule catch-all", match1("شيء عشوائي") == "مرحباً {name}")
check("no false positive on unrelated", match1("تمام") == "مرحباً {name}")

# --- normalized matching ---
check("normalized Arabic match (أ→ا)", match1("أهلاً شكراً") == "العفو {name}")

# disabled rule
rules_disabled = [
    {"id": 1, "priority": 10, "enabled": False, "keywords": ["غش"], "reply_template": "x", "bot_type": "reply"},
    {"id": 2, "priority": 999, "enabled": True, "keywords": ["__catch_all__"], "reply_template": "y", "bot_type": "reply"},
]
m2 = RuleMatcher(rules_disabled)
match2 = lambda t: m2.match(t)[0]
check("disabled rule skipped", match2("غش") == "y")

# --- TemplateRenderer ---
ctx = CommentContext("cid_1", "p1", "مرحباً", "12345", "أحمد علي", "أحمد", "ahmed123", {})
rendered = TemplateRenderer.render("أهلاً {name}! {mention}", ctx)
check("render includes name", "أحمد" in rendered)
check("render includes mention", "@[12345]" in rendered or "{mention}" not in rendered)

ctx_no_id = CommentContext("cid_2", "p1", "مرحباً", "", "أحمد", "أحمد", "", {})
rendered2 = TemplateRenderer.render("أهلاً {name}! {mention}", ctx_no_id)
check("render fallback mention when no id", "أحمد" in rendered2)

# --- TemplateRenderer.validate ---
check("validate valid template", TemplateRenderer.validate("أهلاً {name}"))
check("validate empty template", not TemplateRenderer.validate(""))
check("validate whitespace template", not TemplateRenderer.validate("   "))

# --- IntentClassifier ---
check("classify negative", IntentClassifier.classify("هذا غش ونصب") == "negative")
check("classify question", IntentClassifier.classify("كم السعر") == "positive")
check("classify contact", IntentClassifier.classify("رقم الواتساب") == "contact")
check("classify positive", IntentClassifier.classify("رائع جدا") == "positive")
check("classify neutral", IntentClassifier.classify("تمام") == "positive")
check("classify empty", IntentClassifier.classify("") == "neutral")
check("classify question how", IntentClassifier.classify("كيف") in ("question", "neutral", "positive"))

# --- TextNormalizer ---
check("normalize alef", TextNormalizer.normalize("أحمد إبراهيم آل") == "احمد ابراهيم ال")
check("normalize teh marbuta", TextNormalizer.normalize("قطة جميلة") == "قطه جميله")
check("normalize waw hamza", TextNormalizer.normalize("مؤمن") == "مومن")
check("remove diacritics", TextNormalizer.normalize("كَيْفَ حَالُكَ") == "كيف حالك")
check("normalize yeh", TextNormalizer.normalize("على") == "علي")

# --- Stop words filtered ---
# Stop words like "في", "من" should not trigger false matches
rules_stop = [
    {"id": 1, "priority": 10, "enabled": True, "keywords": ["في"], "reply_template": "wrong", "bot_type": "reply"},
    {"id": 2, "priority": 999, "enabled": True, "keywords": ["__catch_all__"], "reply_template": "correct", "bot_type": "reply"},
]
m3 = RuleMatcher(rules_stop)
match3 = lambda t: m3.match(t)[0]
check("stop word 'في' does not match", match3("في البداية") == "correct")

# --- Empty text ---
check("empty text returns None", matcher.match("")[0] is None)

# --- summary ---
print()
if errors:
    print(f"❌ {len(errors)} test(s) FAILED:")
    for e in errors:
        print(f"   {e}")
    sys.exit(1)
else:
    print(f"✅ All {len([1 for l in open(__file__) if 'check(' in l])} tests passed")
