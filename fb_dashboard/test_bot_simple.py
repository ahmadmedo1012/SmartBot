from __future__ import annotations
"""
Simple BotEngine isolation test - no external dependencies needed.
"""
import asyncio
import sys
import os
import time

# Change to fb_dashboard directory for imports
os.chdir('/home/ahmed/Downloads/SmartBot/fb_dashboard')
sys.path.insert(0, '.')

async def test_simple():
    from bot import BotEngine, CooldownManager
    from cache_layer import ReplyDedupCache
    
    print('=== Simple Isolation Test ===')
    
    # Create two engines
    engine_a = BotEngine(None, tenant_id=100)
    engine_b = BotEngine(None, tenant_id=200)
    
    # Ensure caches are initialized
    await engine_a._ensure_cache()
    await engine_b._ensure_cache()
    
    assert engine_a is not engine_b, 'Engines must be different instances'
    print('✓ Different instances')
    
    # Test dedup isolation
    await engine_a._dedup_engine.mark('comment_A_1')
    is_dup_a = await engine_a._dedup_engine.is_dup('comment_A_1')
    is_dup_b = await engine_b._dedup_engine.is_dup('comment_A_1')
    
    assert is_dup_a, 'A should see comment as dup'
    assert not is_dup_b, 'B should NOT see A comment as dup'
    print('✓ Dedup cache isolated')
    
    # Test cooldown isolation
    # Set last to current time - 30 seconds (within 60s default window = blocked)
    engine_a.cooldown._store['user1'] = time.time() - 30
    assert engine_a.cooldown.is_blocked('user1'), 'A should block user1 (within window)'
    # B has different _store, so user1 should not be blocked for B
    assert not engine_b.cooldown.is_blocked('user1'), 'B should NOT block A user'
    print('✓ Cooldown manager isolated')
    
    # Test rate limit isolation
    # Rate limit allows < 5 replies per post per minute (max 4 allowed)
    # Mark 4 times (allowed), then check (5th should be blocked)
    for _ in range(4):
        engine_a._mark_replied('post_A_1')
    rate_ok_5th = await engine_a._check_rate_limit('post_A_1')
    
    # 5th mark makes count=5, so rate_ok should be False (5 < 5 = False)
    engine_a._mark_replied('post_A_1')
    rate_ok_blocked = await engine_a._check_rate_limit('post_A_1')
    
    assert rate_ok_5th, 'After 4 marks, 5th should be allowed'
    assert not rate_ok_blocked, 'After 5 marks, rate should be blocked for A'
    
    # B should NOT be affected (different instance, different state)
    rate_ok_b = await engine_b._check_rate_limit('post_A_1')
    assert rate_ok_b, 'B should NOT be rate limited'
    print('✓ Rate limit isolated')
    
    print('\n✅ All isolation tests passed!')

asyncio.run(test_simple())
