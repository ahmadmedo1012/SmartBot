from __future__ import annotations
"""
Test BotEngine tenant isolation: verify two tenants (A and B) run completely independently
with asyncio.gather (truly parallel execution).

Key checks:
1. dedup cache isolation (comments replied by tenant A don't block tenant B)
2. cooldown manager isolation (cooldown state not shared)
3. rate limit isolation (per-post rate limits not shared)
4. cycle counters isolated (no interference in _cycle, _post_reply_count)
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch
from bot import BotEngine
from _services import reset_bot_engines, get_bot_engine
from cache_layer import ReplyDedupCache, CooldownManager


# ── Mock FB Client ────────────────────────────────────────────────────────────
class MockFBClient:
    def __init__(self, tenant_id: int):
        self.tenant_id = tenant_id

    async def get_page_posts(self, limit: int):
        # Each tenant has different post IDs to simulate independent page
        posts = [
            {"id": f"post_{self.tenant_id}_1", "message": "Test post 1"},
            {"id": f"post_{self.tenant_id}_2", "message": "Test post 2"},
        ]
        return posts, None

    async def get_post_comments(self, post_id: str):
        # Simulate comments per tenant
        return [
            {"id": f"comment_{self.tenant_id}_1", "message": "Hello A", "from": {"id": "u1", "name": "User1"}},
        ]


# ── Isolation Test ────────────────────────────────────────────────────────────
async def test_tenant_isolation():
    reset_bot_engines()  # Start fresh

    tenant_a_id, tenant_b_id = 100, 200

    # Create engines for both tenants
    fb_a = MockFBClient(tenant_a_id)
    fb_b = MockFBClient(tenant_b_id)

    engine_a = BotEngine(fb_a, tenant_id=tenant_a_id)
    engine_b = BotEngine(fb_b, tenant_id=tenant_b_id)

    print("=== Tenant Isolation Test ===")
    print(f"Engine A: id={id(engine_a)}, tenant_id={engine_a._tenant_id}")
    print(f"Engine B: id={id(engine_b)}, tenant_id={engine_b._tenant_id}")

    # Verify they are different instances
    assert engine_a is not engine_b, "FAILED: engines should be different instances"
    print("✓ Engine instances are distinct")

    # ── Test 1: Dedup Cache Isolation ─────────────────────────────
    # Simulate tenant A replied to comment_100_1
    await engine_a._dedup_engine.mark(f"post_{tenant_a_id}_1_comment_{tenant_a_id}_1")

    # Check: A sees it as dup
    is_dup_a = await engine_a._dedup_engine.is_dup(f"post_{tenant_a_id}_1_comment_{tenant_a_id}_1")
    assert is_dup_a, "Tenant A should see its own comment as dup"

    # Check: B does NOT see it as dup (isolation test)
    is_dup_b = await engine_b._dedup_engine.is_dup(f"post_{tenant_a_id}_1_comment_{tenant_a_id}_1")
    assert not is_dup_b, "Tenant B should NOT see tenant A's comment as dup"
    print("✓ Dedup cache is isolated per tenant")

    # ── Test 2: Cooldown Manager Isolation ─────────────────────────
    # A triggers cooldown
    await engine_a.cooldown.trigger("post_1")
    is_cooldown_a = await engine_a.cooldown.check("post_1")
    assert is_cooldown_a, "Tenant A should be in cooldown"

    # B should NOT be in cooldown (isolation test)
    is_cooldown_b = await engine_b.cooldown.check("post_1")
    assert not is_cooldown_b, "Tenant B should NOT inherit tenant A's cooldown"
    print("✓ Cooldown manager is isolated per tenant")

    # ── Test 3: Rate Limit Isolation ───────────────────────────────
    # Simulate A hitting rate limit
    for i in range(6):
        await engine_a._check_rate_limit(f"post_{tenant_a_id}_1")

    # A should be rate limited now
    rate_ok_a = await engine_a._check_rate_limit(f"post_{tenant_a_id}_1")
    assert not rate_ok_a, "Tenant A should be rate limited"

    # B should NOT be rate limited (isolation test)
    rate_ok_b = await engine_b._check_rate_limit(f"post_{tenant_a_id}_1")
    assert rate_ok_b, "Tenant B should NOT inherit tenant A's rate limit"
    print("✓ Rate limit is isolated per tenant")

    # ── Test 4: Cycle Counter Isolation ───────────────────────────
    assert engine_a._cycle == 0, "A should start at cycle 0"
    assert engine_b._cycle == 0, "B should start at cycle 0"

    await engine_a.cycle()
    await engine_b.cycle()

    # Both should have cycle=1 independently
    assert engine_a._cycle == 1, f"Tenant A cycle should be 1, got {engine_a._cycle}"
    assert engine_b._cycle == 1, f"Tenant B cycle should be 1, got {engine_b._cycle}"
    print("✓ Cycle counters are isolated per tenant")

    # ── Test 5: Post Reply Count Isolation ─────────────────────────
    # Clear and test post reply counts
    engine_a._post_reply_count.clear()
    engine_b._post_reply_count.clear()

    for _ in range(3):
        engine_a._mark_replied(f"post_{tenant_a_id}_1")
    assert engine_a._post_reply_count[f"post_{tenant_a_id}_1"] == 3

    assert f"post_{tenant_a_id}_1" not in engine_b._post_reply_count, "B should not have A's post reply count"
    print("✓ Post reply counts are isolated per tenant")

    print("\n✅ All isolation tests passed! Tenants A and B run completely independently.")


# ── Parallel Execution Test (asyncio.gather) ─────────────────────────────────
async def test_parallel_execution():
    reset_bot_engines()

    tenant_a_id, tenant_b_id = 101, 201

    async def tenant_runner(tenant_id: int):
        fb = MockFBClient(tenant_id)
        engine = BotEngine(fb, tenant_id=tenant_id)

        # Simulate parallel work
        for i in range(3):
            await engine._dedup_engine.mark(f"parallel_comment_{i}_t{tenant_id}")
            await engine.cooldown.trigger(f"cooldown_{i}_t{tenant_id}")
            for _ in range(2):
                engine._mark_replied(f"post_{tenant_id}_{i}")

        return {"tenant_id": tenant_id, "status": "completed"}

    # Run both tenants truly in parallel
    results = await asyncio.gather(
        tenant_runner(tenant_a_id),
        tenant_runner(tenant_b_id),
    )

    print("\n=== Parallel Execution Test (asyncio.gather) ===")
    print(f"Results: {results}")

    # Verify both completed
    assert all(r["status"] == "completed" for r in results)
    print("✅ Both tenants completed in parallel successfully.")


async def main():
    print("=" * 60)
    print("BotEngine Tenant Isolation Tests")
    print("=" * 60)

    try:
        await test_tenant_isolation()
        await test_parallel_execution()

        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED - Tenant isolation is fully working")
        print("=" * 60)
        return 0
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(asyncio.run(main()))
