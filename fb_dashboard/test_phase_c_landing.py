from __future__ import annotations
"""
Phase C (= الخطة 3) — بوابة الخروج: أرقام حقيقية في صفحة الهبوط

Exit-gate evidence per PLAN-REBUILD-V2.md §3:
  3.1/3.3 /api/public/stats تُرجع مجاميع حقيقية من DB (وليست ثابتة):
       تغيّر البيانات → تغيّر الأرقام. لا تكشف بيانات مستأجرين (مجاميع فقط).
  3.2 /api/public/testimonials تُرجع [] حتى جمع آراء حقيقية — لا تقييمات وهمية.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import select

from _utils import utcnow


async def _make_fixture():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import StaticPool
    from models import Base
    from database import get_db
    from runner import app

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    import httpx
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    return app, session_factory, test_engine, client


async def test_public_stats_reflect_real_db_changes():
    """البوابة: الأرقام تتبع قاعدة البيانات — بيانات مختلفة → أرقام مختلفة."""
    app, sf, te, client = await _make_fixture()
    try:
        from models import Tenant, Reply

        # الحالة 1: قاعدة فارغة
        r = await client.get("/api/public/stats")
        assert r.status_code == 200, r.text
        d1 = r.json()["data"]
        assert d1["activeTenants"] == 0
        assert d1["totalReplies"] == 0

        # الحالة 2: مستأجران مشتركان + ردود
        async with sf() as db:
            db.add_all([
                Tenant(name="T1", subscription_status="PAID", is_active=True),
                Tenant(name="T2", subscription_status="TRIAL", is_active=True),
                Tenant(name="T3", subscription_status="UNPAID", is_active=True),  # غير نشط تجارياً
            ])
            await db.flush()
            db.add_all([Reply(tenant_id=1, fb_post_id="p", fb_comment_id=f"c{i}",
                              comment_text="c", reply_text="r") for i in range(7)])
            await db.commit()

        r = await client.get("/api/public/stats")
        d2 = r.json()["data"]
        assert d2["activeTenants"] == 2, f"المتوقع 2 (PAID+TRIAL)، وجد {d2['activeTenants']} — UNPAID لا يُعد نشطاً"
        assert d2["totalReplies"] == 7, f"المتوقع 7، وجد {d2['totalReplies']}"
        assert d1 != d2, "الأرقام لم تتغير بعد إدخال بيانات — ثابتة/وهمية!"

        # لا تسريب: المخرجات مجاميع فقط — أسماء/معرفات المستأجرين غائبة
        body_text = r.text
        assert "T1" not in body_text and "tenant_id" not in body_text
        assert set(d2.keys()) >= {"activeTenants", "totalReplies", "activeUsers30d", "uptimePercent"}
    finally:
        from database import get_db
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await te.dispose()


async def test_public_stats_no_auth_required():
    """نقطة نهاية عامة — لا مصادقة مطلوبة (تُستخدم من صفحة الهبوط)."""
    app, sf, te, client = await _make_fixture()
    try:
        r = await client.get("/api/public/stats")
        assert r.status_code == 200
        assert r.json()["success"] is True
    finally:
        from database import get_db
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await te.dispose()


async def test_testimonials_empty_until_real():
    """البوابة §3.2: لا تقييمات وهمية — قائمة فارغة حتى جمع آراء حقيقية."""
    app, sf, te, client = await _make_fixture()
    try:
        r = await client.get("/api/public/testimonials")
        assert r.status_code == 200
        assert r.json() == {"success": True, "data": []}, r.text
    finally:
        from database import get_db
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await te.dispose()


def test_stats_source_uses_real_queries():
    """حارس مصدري: المسار يستعلم Tenant/Reply من قاعدة البيانات (لا أرقاماً ثابتة)."""
    src = open(os.path.join(os.path.dirname(__file__), "routers", "plans_config.py"),
               encoding="utf-8").read()
    assert "select(func.count(Tenant.id))" in src, "يجب عدّ المستأجرين من DB"
    assert "select(func.count(Reply.id))" in src, "يجب عدّ الردود من DB"


def test_no_fake_numbers_in_landing_components():
    """حارس مصدري: لا أرقام تسويقية وهمية (٥٠٠/98% رضا) في مكونات الهبوط."""
    base = os.path.join(os.path.dirname(__file__), "frontend", "src")
    checks = [
        (os.path.join(base, "components", "landing", "sections", "StatsSection.tsx"),
         ["98", "معدل رضا", "fallback"]),
        (os.path.join(base, "app", "page.tsx"), ["٥٠٠"]),
        (os.path.join(base, "components", "landing", "sections", "FinalCTASection.tsx"),
         ["٥٠٠", "أكثر من ٥٠٠"]),
    ]
    for path, banned in checks:
        if not os.path.exists(path):
            pytest_skip = True
            continue
        content = open(path, encoding="utf-8").read()
        for b in banned:
            assert b not in content, f"رقم وهمي '{b}' موجود في {os.path.basename(path)}"
