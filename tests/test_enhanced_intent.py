from __future__ import annotations
"""
Unit tests for EnhancedIntentClassifier.
Covers Arabic, Libyan dialect, English, compound intents, urgency.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from enhanced_intent import EnhancedIntentClassifier


def test_basic_intents():
    r = EnhancedIntentClassifier.classify("هذا غش ونصب")
    assert r["primary_intent"] in ("negative", "complaint")

    r = EnhancedIntentClassifier.classify("منتج رائع جدا")
    assert r["primary_intent"] == "praise"

    r = EnhancedIntentClassifier.classify("كم سعر هذا المنتج")
    assert r["primary_intent"] in ("price_inquiry", "question")

    r = EnhancedIntentClassifier.classify("ارسل لي رقم الواتساب")
    assert r["primary_intent"] == "contact"

    r = EnhancedIntentClassifier.classify("السلام عليكم")
    assert r["primary_intent"] == "greeting"

    print("✓ test_basic_intents")


def test_urgency():
    r = EnhancedIntentClassifier.classify("عاجل ضروري جدا")
    assert r["urgency"] > 0.3

    r = EnhancedIntentClassifier.classify("صباح الخير")
    assert r["urgency"] == 0.0

    print("✓ test_urgency")


def test_compound_intent():
    r = EnhancedIntentClassifier.classify("بسرعة كم سعر التلفون")
    p = r["primary_intent"]
    assert p in ("price_inquiry", "urgent"), f"Got {p}"
    assert r["secondary_intent"] is not None

    r = EnhancedIntentClassifier.classify("السعر غالي جدا ونصب")
    assert r["sentiment"] in ("negative", "positive")

    print("✓ test_compound_intent")


def test_legacy_conversion():
    r = EnhancedIntentClassifier.classify("غش ونصب")
    assert EnhancedIntentClassifier.to_legacy(r) == "negative"

    r = EnhancedIntentClassifier.classify("رائعين")
    assert EnhancedIntentClassifier.to_legacy(r) == "positive"

    print("✓ test_legacy_conversion")


def test_sales_opportunity():
    assert EnhancedIntentClassifier.is_sales_opportunity(
        EnhancedIntentClassifier.classify("كم سعر"))
    assert EnhancedIntentClassifier.is_sales_opportunity(
        EnhancedIntentClassifier.classify("ارسل واتساب"))
    assert not EnhancedIntentClassifier.is_sales_opportunity(
        EnhancedIntentClassifier.classify("صباح الخير"))
    print("✓ test_sales_opportunity")


def test_requires_immediate():
    assert EnhancedIntentClassifier.requires_immediate_action(
        EnhancedIntentClassifier.classify("غش نصابين حرامية"))
    assert not EnhancedIntentClassifier.requires_immediate_action(
        EnhancedIntentClassifier.classify("شكرا لكم"))
    print("✓ test_requires_immediate")


def test_empty_input():
    assert EnhancedIntentClassifier.classify("")["primary_intent"] == "neutral"
    assert EnhancedIntentClassifier.classify(None)["primary_intent"] == "neutral"
    print("✓ test_empty_input")


def test_libyan_dialect():
    r = EnhancedIntentClassifier.classify("شنو سعر هاذ")
    assert r["primary_intent"] in ("price_inquiry", "question")

    r = EnhancedIntentClassifier.classify("قداش هاذا")
    assert r["primary_intent"] in ("price_inquiry", "question")

    r = EnhancedIntentClassifier.classify("واش هذا المنتج")
    assert r["primary_intent"] in ("question", "price_inquiry")

    print("✓ test_libyan_dialect")


def test_sentiment_detection():
    assert EnhancedIntentClassifier.classify("منتج رائع وممتاز شكرا لكم")["sentiment"] == "positive"
    assert EnhancedIntentClassifier.classify("سيء جدا خسارة في الفلوس")["sentiment"] == "negative"
    assert EnhancedIntentClassifier.classify("كم سعر المنتج")["sentiment"] == "neutral"
    print("✓ test_sentiment_detection")


if __name__ == "__main__":
    test_basic_intents()
    test_urgency()
    test_compound_intent()
    test_legacy_conversion()
    test_sales_opportunity()
    test_requires_immediate()
    test_empty_input()
    test_libyan_dialect()
    test_sentiment_detection()
    print("\n✅ All 10 enhanced intent tests passed!")
