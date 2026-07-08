"""
Unit tests for TTLCache and RuleCache.
"""
import sys, os, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from cache_layer import TTLCache, ReplyDedupCache


async def test_ttl_cache():
    call_count = 0
    async def loader():
        nonlocal call_count
        call_count += 1
        return {"data": "test"}
    cache = TTLCache(ttl_seconds=10, refresh_fn=loader)
    result = await cache.get()
    assert result == {"data": "test"}
    assert call_count == 1
    result = await cache.get()
    assert call_count == 1
    await cache.invalidate()
    result = await cache.get()
    assert call_count == 2
    print("✓ test_ttl_cache")


async def test_ttl_expiry():
    call_count = 0
    async def loader():
        nonlocal call_count
        call_count += 1
        return {"count": call_count}
    cache = TTLCache(ttl_seconds=1, refresh_fn=loader)
    await cache.get()
    assert call_count == 1
    await asyncio.sleep(1.1)
    await cache.get()
    assert call_count == 2
    print("✓ test_ttl_expiry")


async def test_concurrent_access():
    call_count = 0
    async def loader():
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.05)
        return {"data": "loaded"}
    cache = TTLCache(ttl_seconds=10, refresh_fn=loader)
    results = await asyncio.gather(cache.get(), cache.get(), cache.get())
    assert all(r == {"data": "loaded"} for r in results)
    assert call_count == 1
    print("✓ test_concurrent_access")


async def test_dedup_cache():
    cache = ReplyDedupCache(initial={"c1", "c2"}, ttl=30)
    assert cache.is_dup("c1")
    assert cache.is_dup("c2")
    assert not cache.is_dup("c3")
    cache.mark("c3")
    assert cache.is_dup("c3")
    print("✓ test_dedup_cache")


async def main():
    await test_ttl_cache()
    await test_ttl_expiry()
    await test_concurrent_access()
    await test_dedup_cache()
    print("\n✅ All 4 cache tests passed!")

if __name__ == "__main__":
    asyncio.run(main())
