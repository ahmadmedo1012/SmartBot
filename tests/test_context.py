from __future__ import annotations
"""
Unit tests for ContextEngine and UserContext.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from context_engine import ContextEngine, UserContext


def test_user_context():
    ctx = UserContext(user_id="fb_123", name="أحمد")
    assert ctx.is_new()
    ctx.add_comment("السلام عليكم", intent="greeting", rule_id=1)
    assert ctx.comment_count == 1
    assert ctx.last_intent == "greeting"
    # is_new() returns True for comment_count <= 1
    # add another to become returning
    ctx.add_comment("مرحبا", intent="greeting")
    assert not ctx.is_new()
    ctx.add_reply("وعليكم السلام")
    assert ctx.reply_count == 1
    print("✓ test_user_context")


def test_context_engine():
    engine = ContextEngine(ttl_seconds=10)
    ctx = engine.get("fb_123")
    assert ctx.user_id == "fb_123"
    assert engine.get("fb_123") is ctx, "Should return same context"

    engine.tag_user("fb_123", "vip")
    assert "vip" in engine.get_user_tags("fb_123")
    assert engine.active_users >= 1
    print("✓ test_context_engine")


def test_user_segmentation():
    ctx = UserContext(user_id="fb_456")
    assert ctx.is_new()
    for i in range(3):
        ctx.add_comment(f"c{i}")
    assert ctx.is_returning()
    assert not ctx.is_new()
    for i in range(5):
        ctx.add_comment(f"c{i}")
    assert ctx.is_frequent()
    assert not ctx.is_returning()
    print("✓ test_user_segmentation")


if __name__ == "__main__":
    test_user_context()
    test_context_engine()
    test_user_segmentation()
    print("\n✅ All 3 context engine tests passed!")
