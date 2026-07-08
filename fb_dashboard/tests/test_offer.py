"""
Unit tests for OfferEngine.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from offer_engine import OfferEngine


def test_offer_formatting():
    engine = OfferEngine()
    assert engine.format_offer_text(None) == ""
    text = engine.format_offer_text({"title": "خصم 20%", "code": "SAVE20", "description": "أول طلب"})
    assert "خصم 20%" in text
    assert "SAVE20" in text
    print("✓ test_offer_formatting")


def test_delivery_tracking():
    engine = OfferEngine()
    assert not engine.has_received("user1", 1)
    engine.mark_delivered("user1", 1)
    assert engine.has_received("user1", 1)
    assert not engine.has_received("user1", 2)
    assert not engine.has_received("user2", 1)
    print("✓ test_delivery_tracking")


if __name__ == "__main__":
    test_offer_formatting()
    test_delivery_tracking()
    print("\n✅ All 2 offer engine tests passed!")
