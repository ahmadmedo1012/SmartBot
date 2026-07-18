"""Verify BotEngine per-tenant isolation: dedup cache, cooldown, rate-limit."""
import asyncio
import sys
import os
import time

# Bootstrapped env — no SECRET_KEY needed for bot module init
os.environ.setdefault("SECRET_KEY", "test-key")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("FACEBOOK_ACCESS_TOKEN", "test")
os.environ.setdefault("FACEBOOK_PAGE_ID", "test")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "fb_dashboard"))

from bot import BotEngine
from _services import get_bot_engine, reset_bot_engines


class FakeFB:
    """No-op FB client — engine methods that call FB just return empty."""
    async def get_page_posts(self, *a, **kw): return [], None
    async def get_post_comments(self, *a, **kw): return []
    async def reply_to_comment(self, *a, **kw): return {"id": "fake"}
    async def get_user_name(self, *a, **kw): return "Fake User"


reset_bot_engines()  # fresh slate

async def test_isolation():
    fb = FakeFB()
    t1, t2 = 1, 2

    # Each tenant gets its own instance
    e1 = get_bot_engine(fb, tenant_id=t1)
    e2 = get_bot_engine(fb, tenant_id=t2)
    assert e1 is not e2, "FAIL: same instance returned for different tenants"
    assert e1._tenant_id == t1, f"FAIL: e1 tenant_id={e1._tenant_id}"
    assert e2._tenant_id == t2, f"FAIL: e2 tenant_id={e2._tenant_id}"
    print(f"PASS: distinct instances — id(e1)={id(e1)}, id(e2)={id(e2)}")

    # Same tenant gets same cached instance
    e1b = get_bot_engine(tenant_id=t1)
    assert e1b is e1, "FAIL: same tenant got different instance"
    print("PASS: same tenant returns cached instance")

    # Dedup cache: each tenant has independent ReplyDedupCache
    await e1._ensure_cache()
    await e2._ensure_cache()
    assert e1._dedup_engine is not e2._dedup_engine, "FAIL: dedup cache shared"
    dedup1_id = id(e1._dedup_engine)
    dedup2_id = id(e2._dedup_engine)
    print(f"PASS: independent dedup caches — id(e1.dedup)={dedup1_id}, id(e2.dedup)={dedup2_id}")

    # Rule cache: independent per tenant
    assert e1._rule_cache is not e2._rule_cache, "FAIL: rule cache shared"
    print(f"PASS: independent rule caches")

    # Cooldown: per-instance — block one doesn't affect the other
    # is_blocked() sets timestamp on first call (returns False), blocks on second
    assert not e1.cooldown.is_blocked("user_1"), "FAIL: e1 first call should pass"
    assert e1.cooldown.is_blocked("user_1"), "FAIL: e1 second call should be blocked"
    assert not e2.cooldown.is_blocked("user_1"), "FAIL: e2 should NOT block user_1 (cross-tenant leak)"
    print("PASS: cooldown isolation — tenant A blocks user_1, tenant B unaffected")

    # Rate-limit: per-instance counters
    for _ in range(10):
        e1._mark_replied("post_a")
    assert e1._post_reply_count.get("post_a", 0) == 10, "FAIL: e1 count wrong"
    assert e2._post_reply_count.get("post_a", 0) == 0, "FAIL: e2 leaked from e1"
    print("PASS: rate-limit isolation — e1 count=10, e2 unaffected")


    # Concurrent access: gather works with 3 tenants racing
    reset_bot_engines()

    async def tenant_tick(tid):
        fb_ = FakeFB()
        eng = get_bot_engine(fb_, tenant_id=tid)
        await eng._ensure_cache()
        eng._mark_replied(f"post_{tid}")
        eng.cooldown._store.clear()  # fresh
        eng.cooldown.is_blocked(f"user_{tid}")  # first call sets stamp
        return (tid, id(eng), eng._post_reply_count[f"post_{tid}"])

    results = await asyncio.gather(
        tenant_tick(10), tenant_tick(20), tenant_tick(30),
    )
    tids = set(r[0] for r in results)
    eng_ids = set(r[1] for r in results)
    assert len(eng_ids) == 3, f"FAIL: concurrent created only {len(eng_ids)} instances"
    assert len(tids) == 3
    for tid, _, count in results:
        assert count == 1, f"FAIL: tenant {tid} count={count}"
    print(f"PASS: asyncio.gather(3 tenants) — {len(eng_ids)} distinct instances, counts all 1")

    print("\n=== ALL CHECKS PASSED ===")


if __name__ == "__main__":
    asyncio.run(test_isolation())
