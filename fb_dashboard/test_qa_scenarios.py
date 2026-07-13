"""
Bot Logic QA — scenario-based regression and edge case suite.
Tests the rebuilt bot.py components independently of FB API.
"""
import sys, os, time, hashlib
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Test the new bot modules directly
from enhanced_intent import EnhancedIntentClassifier
from cache_layer import TTLCache, ReplyDedupCache
from context_engine import ContextEngine
from offer_engine import OfferEngine

PASS = 0
FAIL = 0

def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        msg = f"  ✗ {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)

# ===== 1. INTENT CLASSIFICATION =====
print("\n=== Enhanced Intent Classifier ===")

# Basic intents
check("negative intent",
      EnhancedIntentClassifier.classify("غش ونصب")["primary_intent"] in ("negative", "complaint"))
check("positive intent",
      EnhancedIntentClassifier.classify("رائع جدا")["primary_intent"] == "praise")
check("price inquiry",
      EnhancedIntentClassifier.classify("كم سعر")["primary_intent"] in ("price_inquiry", "question"))
check("contact request",
      EnhancedIntentClassifier.classify("ابغى رقم الواتساب")["primary_intent"] == "contact")
check("greeting",
      EnhancedIntentClassifier.classify("السلام عليكم")["primary_intent"] == "greeting")

# Libyan dialect
check("libyan price",
      EnhancedIntentClassifier.classify("قداش هاذا")["primary_intent"] in ("price_inquiry", "question"))
check("libyan shnu",
      EnhancedIntentClassifier.classify("شنو هذا")["primary_intent"] == "question")

# Urgency
check("urgency detected",
      EnhancedIntentClassifier.classify("عاجل ضروري")["urgency"] > 0.3)
check("no urgency on greeting",
      EnhancedIntentClassifier.classify("صباح الخير")["urgency"] == 0.0)

# Sentiment
check("positive sentiment",
      EnhancedIntentClassifier.classify("منتج رائع شكرا")["sentiment"] == "positive")
check("negative sentiment",
      EnhancedIntentClassifier.classify("سيء جدا")["sentiment"] == "negative")
check("neutral sentiment",
      EnhancedIntentClassifier.classify("ايش هذا")["sentiment"] == "neutral")

# Compound intent
r = EnhancedIntentClassifier.classify("السعر غالي ونصب")
check("compound match", r["primary_intent"] in ("price_inquiry", "negative", "subscription"), f"got {r['primary_intent']}")
check("compound secondary", r["secondary_intent"] is not None)
check("compound sentiment detected", r["sentiment"] in ("negative", "positive"), f"got {r['sentiment']}")

# Affix stemmed matching
check("stemmed arabic",
      EnhancedIntentClassifier.classify("نصابين")["primary_intent"] in ("negative", "complaint"))

# Sales opportunity
check("sales: price inquiry",
      EnhancedIntentClassifier.is_sales_opportunity(EnhancedIntentClassifier.classify("كم سعر")))
check("sales: contact",
      EnhancedIntentClassifier.is_sales_opportunity(EnhancedIntentClassifier.classify("ارسل واتساب")))
check("no sales: greeting",
      not EnhancedIntentClassifier.is_sales_opportunity(EnhancedIntentClassifier.classify("السلام عليكم")))

# Immediate action
check("immediate: complaint",
      EnhancedIntentClassifier.requires_immediate_action(EnhancedIntentClassifier.classify("نصب واحتيال")))
check("no immediate: thanks",
      not EnhancedIntentClassifier.requires_immediate_action(EnhancedIntentClassifier.classify("شكرا")))

# Empty
check("empty text", EnhancedIntentClassifier.classify("")["primary_intent"] == "neutral")
check("none text", EnhancedIntentClassifier.classify(None)["primary_intent"] == "neutral")

# Legacy conversion
check("legacy: negative", EnhancedIntentClassifier.to_legacy(
    EnhancedIntentClassifier.classify("غش")) == "negative")
check("legacy: positive", EnhancedIntentClassifier.to_legacy(
    EnhancedIntentClassifier.classify("رائع")) == "positive")
check("legacy: neutral", EnhancedIntentClassifier.to_legacy(
    {"primary_intent": "price_inquiry"}) == "price_inquiry")

# ===== 2. CACHE LAYER (async tests) =====
print("\n=== Cache Layer (async tests) ===")
import asyncio
async def _test_cache():
    dedup = ReplyDedupCache(initial={"a", "b"}, ttl=30)
    check("dedup detects existing", await dedup.is_dup("a"))
    check("dedup allows new", not await dedup.is_dup("c"))
    await dedup.mark("c")
    check("dedup sees marked", await dedup.is_dup("c"))
    await dedup.load(set())
    check("dedup cleared after load", not await dedup.is_dup("a"))
asyncio.run(_test_cache())

# ===== 3. CONTEXT ENGINE =====
print("\n=== Context Engine ===")
ctx = ContextEngine(ttl_seconds=10)
c1 = ctx.get("user1")
check("new context", c1 is not None)
check("same context returned", ctx.get("user1") is c1)
c1.add_comment("مرحبا", intent="greeting")
check("comment counted", c1.comment_count == 1)
check("intent recorded", c1.last_intent == "greeting")
c1.add_reply("اهلا بك")
check("reply counted", c1.reply_count == 1)
ctx.tag_user("user1", "vip")
check("tag stored", "vip" in ctx.get_user_tags("user1"))
check("active users > 0", ctx.active_users >= 1)

# segmentation
c2 = ctx.get("user2")
check("new user is_new", c2.is_new())
c2.add_comment("c1"); c2.add_comment("c2"); c2.add_comment("c3")
check("returning user", c2.is_returning())
c2.add_comment("c4"); c2.add_comment("c5"); c2.add_comment("c6")
check("frequent user", c2.is_frequent())

# ===== 4. OFFER ENGINE =====
print("\n=== Offer Engine ===")
oe = OfferEngine()
check("no offer = empty", oe.format_offer_text(None) == "")
check("offer has text", "خصم" in oe.format_offer_text({"title": "خصم", "code": "S20", "description": ""}))
check("no delivery initially", not oe.has_received("u1", 1))
oe.mark_delivered("u1", 1)
check("delivery tracked", oe.has_received("u1", 1))
check("diff user not tracked", not oe.has_received("u2", 1))

# ===== 5. TEXT NORMALIZER (from bot.py) =====
print("\n=== Text Normalizer ===")
from bot import TextNormalizer
check("alef normalization", TextNormalizer.normalize("أحمد") == "احمد")
check("teh marbuta", TextNormalizer.normalize("مدرسة") == "مدرسه")
check("yeh ali", TextNormalizer.normalize("على") == "علي")
check("waw hamza", TextNormalizer.normalize("مؤمن") == "مومن")
check("diacritics removed", "َ" not in TextNormalizer.normalize("كَيْفَ"))
check("libyan prefix stripped", TextNormalizer.normalize_for_matching("شنو هذا") == "هذا")
check("case insensitivity", TextNormalizer.normalize("HELLO") == "hello")

# ===== 6. SUMMARY =====
print(f"\n{'='*40}")
print(f"RESULTS:  {PASS} passed / {FAIL} failed / {PASS+FAIL} total")
print(f"{'='*40}")
if FAIL > 0:
    print("❌ Some tests FAILED — review above")
    sys.exit(1)
else:
    print("✅ ALL TESTS PASSED")
