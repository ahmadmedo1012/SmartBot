"""v15-E7 — الأداء والمراقبة: اختبارات ملكية E7 الصارمة.

يثبّت هذه الجولة (الملكية: dashboard_stats.py · replies.py · fb_client.py
_observability.py · config.py · api_cache.py · app/middleware.py [انحراف
موثّق — مهمة D8-B7 تسميه صراحة ولا يملكه وكيل آخر]):

  [x] D8-X1 — recent_replies في /api/dashboard/bundle غير فارغة فعلاً (كان
        الاستهلاك المزدوج .scalars().all() يجعلها [] دائماً — بطاقة
        «آخر الردود» ميتة حية).
  [x] D8-B3 — الحزمة: استعلام تجميعي واحد للعدادات الستة + 2 للرسائل +
        snapshot BotState واحد (بدل نداء Graph الحي) + كاش 60s لكل مستأجر
        (مفتاح يضم tenant_id — لا تسريب بين المستأجرين).
  [x] D8-B2 — /api/comments: تخطي 30s لكل مستأجر لمزامنة Graph الحية (نمط
        inbox v8-A12) + asyncio.gather محدود لجلب تعليقات المنشورات في
        fb_client مع تحمّل فشل منشور واحد.
  [x] D8-B7 — dedup_middleware: إزالة صادقة (pass-through موثّق) — لم يعد
        يُسلسل GETs المتطابقة بلا كاش؛ APICache يفعل singleflight للنقاط
        المزينة فعلاً.
  [x] D14-M3 — scrubber: اسم المستخدم في request.data + مضيف/مستخدم قاعدة
        البيانات في breadcrumbs (أنماط آمنة، لا يسقط حدثاً أبداً).
  [x] D6-M1 — config.py يرفض الإقلاع في production مع
        TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=true (الوضع dev يبقى يعمل).
  [x] D9-M1 — VERSION = 2.2.0 (مصدر واحد يقرأه Sentry release + health).
  [x] api_cache.get_or_compute — كاش بمفتاح صريح + singleflight + انتهاء TTL.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DEBUG", "True")

import pytest  # noqa: E402
from _dayseed import seed_day, utc_day_start  # noqa: E402
from _utils import app_version, utcnow  # noqa: E402
from models import BotState, Reply  # noqa: E402

FB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))


# ── عزل حالة الوحدة بين الاختبارات ──────────────────────────────────────
@pytest.fixture(autouse=True)
def _fresh_perf_state():
    """كل اختبار يبدأ بكاش ومزامنة نظيفين (حالة الوحدة العامة)."""
    import api_cache as _ac
    import routers.replies as _rp

    _ac._cache_store.clear()
    _ac._cache_locks.clear()
    _rp._COMMENTS_LAST_SYNC.clear()
    yield
    _ac._cache_store.clear()
    _ac._cache_locks.clear()
    _rp._COMMENTS_LAST_SYNC.clear()


def _async_value(value):
    """يصنع دالة async ترجع قيمة ثابتة — لاستبدال عملاء/دوال مزيّفة بلا شبكة."""

    async def _fn(*_args, **_kwargs):
        return value

    return _fn


async def _seed_reply(sf, tid: int, *, name: str,
                      hours_ago: float | None = None,
                      text: str = "رد آلي",
                      at: datetime | None = None) -> Reply:
    """v16-E6 (F1/D3): ``at=`` يثبّت البذرة على طابع زمني مطلق
    (``_dayseed.seed_day`` — بذور حدود اليوم المستقلة عن ساعة التشغيل).
    ``hours_ago`` يبقى للمواقع الأخرى (14 موقعاً) التي نوافذها نسبية
    وآمنة زمنياً. يُمرَّر أحدهما فقط."""
    from models import Reply as _R

    if at is None:
        if hours_ago is None:
            raise ValueError("either at= or hours_ago= is required")
        at = utcnow() - timedelta(hours=hours_ago)
    elif hours_ago is not None:
        raise ValueError("pass at= or hours_ago= — not both")

    async with sf() as db:
        r = _R(
            tenant_id=tid, fb_comment_id=f"rc_{uuid.uuid4().hex[:8]}",
            fb_post_id="p_1", commenter_name=name,
            comment_text=f"تعليق {name}", reply_text=text, rule_id=None,
            created_at=at,
        )
        db.add(r)
        await db.commit()
        return r


# ════════════════════════════════════════════════════════════════════
# D8-X1 — بطاقة «آخر الردود» حية
# ════════════════════════════════════════════════════════════════════

async def test_x1_recent_replies_nonempty(v10_seed):
    """قبل الإصلاح: second .scalars().all() == [] → recent_replies فارغة
    دائماً رغم وجود ردود (استهلاك مزدوج للنتيجة نفسها — مؤشر SQLAlchemy
    مستهلك). بعده: نفس القائمة تُجلب مرة واحدة وتُخدم للسلسلتين."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="X1")
    await _seed_reply(v10_seed.world.sf, tid, name="أحمد", hours_ago=2)
    await _seed_reply(v10_seed.world.sf, tid, name="سالم", hours_ago=1)
    await _seed_reply(v10_seed.world.sf, tid, name="مريم", hours_ago=0.5)

    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r.status_code == 200, r.text
    data = r.json()["data"]

    rr = data["recent_replies"]
    assert len(rr) == 3, f"recent_replies must be non-empty now, got {rr}"
    # الأحدث أولاً (ORDER BY created_at DESC)
    assert rr[0]["commenter_name"] == "مريم"
    assert rr[2]["commenter_name"] == "أحمد"
    for item in rr:
        assert item["comment_text"] and item["reply_text"]
        assert item["created_at"].endswith("Z")
    # recent_activity (الاستهلاك الأول) ما زالت تعمل — نفس المصدر الواحد
    reply_activities = [a for a in data["recent_activity"] if a["type"] == "reply"]
    assert len(reply_activities) == 3


async def test_x1_recent_replies_capped_at_five(v10_seed):
    """limit(8) للنشاط، أول 5 للبطاقة — العقد القائم محفوظ."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="X1cap")
    for i in range(7):
        await _seed_reply(v10_seed.world.sf, tid, name=f"معلق{i}", hours_ago=i)
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    data = r.json()["data"]
    assert len(data["recent_replies"]) == 5
    assert len([a for a in data["recent_activity"] if a["type"] == "reply"]) == 7


# ════════════════════════════════════════════════════════════════════
# D8-B3 — تجميع + snapshot + كاش 60s
# ════════════════════════════════════════════════════════════════════

async def test_b3_fan_count_from_snapshot_no_live_graph(v10_seed, monkeypatch):
    """مستأجر مربوط → صفر نداءات Graph في المسار الحرج: fan_count يُقرأ من
    snapshot النبضة/الربط (D8-B3) بدل get_page_fan_count الحي (كان 100-600ms
    متغيرة لكل تحميل لوحة). النداء الحي هنا = فشل اختبار صريح."""
    import routers.dashboard_stats as ds_mod

    live_calls: list[str] = []

    class _MustNotBeCalled:
        async def get_page_fan_count(self):
            live_calls.append("tenant")
            return 999999

    class _RecorderFB:
        async def get_page_fan_count(self):
            live_calls.append("legacy")
            return 888888

    async def fake_tenant_fb(_tid):
        return _MustNotBeCalled()

    monkeypatch.setattr(ds_mod, "get_tenant_fb_client", fake_tenant_fb)
    monkeypatch.setattr(ds_mod, "fb", _RecorderFB())

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="B3snap")
    sf = v10_seed.world.sf
    async with sf() as db:
        db.add_all([
            BotState(tenant_id=tid, key="fb_page_id", value="12345"),
            BotState(tenant_id=tid, key="fb_fan_count", value="777"),
            BotState(tenant_id=tid, key="fb_page_name", value="صفحة الاختبار"),
        ])
        await db.commit()

    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert live_calls == [], f"live Graph must NOT be called for connected tenant: {live_calls}"
    assert data["connection"]["connected"] is True
    assert data["stats"]["fan_count"] == 777  # من snapshot لا من Graph
    assert data["connection"]["page_name"] == "صفحة الاختبار"
    assert data["connection"]["error"] == ""  # snapshot موجود → لا رسالة خطأ


async def test_b3_no_snapshot_honest_arabic_error(v10_seed, monkeypatch):
    """مربوط بلا snapshot بعد → رسالة عربية صادقة بدل صفر مزيف مع شارة سليم."""
    import routers.dashboard_stats as ds_mod

    async def fake_tenant_fb(_tid):
        return object()  # connected, لا نصل لأي نداء

    monkeypatch.setattr(ds_mod, "get_tenant_fb_client", fake_tenant_fb)
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="B3nosnap")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    data = r.json()["data"]
    assert data["connection"]["connected"] is True
    assert data["stats"]["fan_count"] == 0
    assert "معجبين" in data["connection"]["error"]


async def test_b3_bundle_cache_second_call_no_recompute(v10_seed, monkeypatch):
    """كاش 60s لكل مستأجر: الطلب الثاني خلال النافذة لا يعيد الحساب إطلاقاً
    (صفر استعلامات + get_tenant_fb_client لا يُستدعى) — ثم انتهاء TTL يعيد
    الحساب مرة واحدة."""
    import api_cache as ac_mod
    import routers.dashboard_stats as ds_mod

    builds: list[int] = []
    real_build = ds_mod._build_dashboard_bundle

    async def counting_build(db, tid):
        builds.append(tid)
        return await real_build(db, tid)

    monkeypatch.setattr(ds_mod, "_build_dashboard_bundle", counting_build)

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="B3cache")
    await _seed_reply(v10_seed.world.sf, tid, name="كاشي", hours_ago=1)
    await v10_seed.login(uname)

    r1 = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r1.status_code == 200 and builds == [tid]
    r2 = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r2.status_code == 200 and builds == [tid], "second call within TTL must NOT recompute"
    assert r1.json() == r2.json(), "cached response must be identical"

    # انتهاء النافذة قسرياً → إعادة حساب واحدة فقط
    key = f"v15:dashboard-bundle:tenant:{tid}"
    assert key in ac_mod._cache_store
    ts, payload = ac_mod._cache_store[key]
    ac_mod._cache_store[key] = (ts - 61.0, payload)
    r3 = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r3.status_code == 200 and builds == [tid, tid]
    assert r3.json()["data"]["stats"]["total_replies"] == 1


async def test_b3_cache_tenant_isolation(v10_seed, monkeypatch):
    """المفتاح يضم tenant_id (تحذير D10 §8): مستأجران متتاليان خلال نفس
    النافذة يرى كل منهما أرقامه هو — لا تسريب عبر الكاش المشترك."""
    import routers.dashboard_stats as ds_mod

    async def no_fb(_tid):
        return None

    monkeypatch.setattr(ds_mod, "get_tenant_fb_client", no_fb)

    u_a, tid_a, _ = await v10_seed.tenant_user(tenant_name="B3isoA")
    u_b, tid_b, _ = await v10_seed.tenant_user(tenant_name="B3isoB")
    await _seed_reply(v10_seed.world.sf, tid_a, name="أ-رديد", hours_ago=1)
    await _seed_reply(v10_seed.world.sf, tid_b, name="ب-رديد1", hours_ago=1)
    await _seed_reply(v10_seed.world.sf, tid_b, name="ب-رديد2", hours_ago=2)

    await v10_seed.login(u_a)
    ra = await v10_seed.world.client.get("/api/dashboard/bundle")
    await v10_seed.login(u_b)
    rb = await v10_seed.world.client.get("/api/dashboard/bundle")

    assert ra.json()["data"]["stats"]["total_replies"] == 1
    assert rb.json()["data"]["stats"]["total_replies"] == 2, (
        "cache must be tenant-keyed — tenant B got tenant A's payload otherwise")
    assert rb.json()["data"]["recent_replies"][0]["commenter_name"].startswith("ب-")


async def test_b3_query_count_bounded(v10_seed, monkeypatch):
    """إثبات التجميع بعدّاد استعلامات: أول نداء للحزمة (auth + كل شيء) ≤ 12
    استعلاماً — المسار القديم كان ~17 استعلاماً صافياً للحزمة وحدها فوق
    المصادقة، تسلسلية، + نداء Graph."""
    import routers.dashboard_stats as ds_mod
    from sqlalchemy import event

    async def no_fb(_tid):
        return None

    monkeypatch.setattr(ds_mod, "get_tenant_fb_client", no_fb)

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="B3cnt")
    await _seed_reply(v10_seed.world.sf, tid, name="عداد", hours_ago=1)

    counts = {"n": 0}

    def _on_stmt(*_a, **_k):
        counts["n"] += 1

    engine = v10_seed.world.engine
    event.listen(engine.sync_engine, "before_cursor_execute", _on_stmt)
    try:
        await v10_seed.login(uname)
        before = counts["n"]
        r = await v10_seed.world.client.get("/api/dashboard/bundle")
        assert r.status_code == 200, r.text
        bundle_stmts = counts["n"] - before
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", _on_stmt)
    assert 0 < bundle_stmts <= 12, (
        f"bundle must run ≤ 12 statements (aggregation + cache miss), got {bundle_stmts}")


async def test_b3_trend_matches_get_trend_data(v10_seed, monkeypatch):
    """الرياضيات لم تتغير: trend المحسوب محلياً باستعلام واحد == مخرج
    _services._get_trend_data (المرجع القائم) على نفس البيانات.

    v16-E6 (F1 — تصميم D3): البذور الخمس كانت «قبل N ساعة» فتعتمد على
    ساعة التشغيل (_get_trend_data يجزّئ بمنتصف ليل UTC التقويمي —
    _services.py:357) وكان الاختبار يفشل حياً في [00:00,02:00) UTC.
    الآن بذور ``at=seed_day(...)`` مثبتة على حدود اليوم: اليوم /
    أمس×2 / يوم-3 (هذا الأسبوع) / يوم-9 (الأسبوع الماضي) — مضمونة
    داخل أيامها التقويمية لأي ساعة جدار (انظر tests/_dayseed.py)."""
    import routers.dashboard_stats as ds_mod
    from _services import _get_trend_data

    async def no_fb(_tid):
        return None

    monkeypatch.setattr(ds_mod, "get_tenant_fb_client", no_fb)

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="B3trend")
    # نوافذ واضحة مثبتة على حدود اليوم UTC: اليوم / أمس / هذا الأسبوع /
    # الأسبوع الماضي — حدود الجرّات: today_start=00:00 · yesterday=أمس ·
    # week=now-7d · prior_week=now-14d
    seeded_today = seed_day(0).date()
    await _seed_reply(v10_seed.world.sf, tid, name="اليوم", at=seed_day(0))
    await _seed_reply(v10_seed.world.sf, tid, name="أمس1", at=seed_day(-1))
    await _seed_reply(v10_seed.world.sf, tid, name="أمس2", at=seed_day(-1, hour=11))
    await _seed_reply(v10_seed.world.sf, tid, name="أسبوع", at=seed_day(-3))
    await _seed_reply(v10_seed.world.sf, tid, name="أسبوع-ماضي", at=seed_day(-9))

    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    got = r.json()["data"]["stats"]["trend"]
    async with v10_seed.world.sf() as db:
        expected = await _get_trend_data(db, tid)

    # v16-E6: حارس منتصف الليل الصادق (احتمال مُهمل — D3) — إن عبر
    # الاختبار منتصف ليل UTC بين البذر والقياس صارت بذور «اليوم» بالأمس
    # فنتخطى بدل فشل زائف يكسر CI الليلي
    if utcnow().date() != seeded_today:
        pytest.skip("midnight crossed mid-test — day-anchored seed windows invalid")

    assert got == expected, f"trend math drifted: {got} != {expected}"
    assert got["today"] == -50.0  # 1 اليوم مقابل 2 أمس


def test_dayseed_deterministic():
    """v16-E6 (F1) — عصامية _dayseed: الإزاحات تهبط دائماً داخل اليوم
    التقويمي المقصود لأي ساعة جدار. اجتياح 24 ساعة كاملة (خطوة 30
    دقيقة) + حدا منتصف الليل + ساعات غريبة + رفض البذور المستقبلية."""
    from datetime import datetime as _dt

    # اللحظة الحية أولاً: بذرة اليوم داخل اليوم الجاري، والحد مرآة
    # تقسيم التطبيق نفسه
    now = utcnow()
    assert utc_day_start() == utc_day_start(now)
    assert seed_day(0).date() == now.date()
    assert seed_day(0) <= utcnow()  # midpoint of elapsed ≤ أي لحظة لاحقة
    assert seed_day(-1).date() == now.date() - timedelta(days=1)

    minutes = sorted({0, 1, 59, 719, 1439} | set(range(0, 24 * 60, 30)))
    for m in minutes:
        wall = _dt(2026, 9, 9) + timedelta(minutes=m)
        start = utc_day_start(wall)
        # day 0: منتصف الجزء المنقضي — دائماً اليوم ودائماً في الماضي
        d0 = seed_day(0, ref=wall)
        assert start <= d0 <= wall, f"{wall:%H:%M}: day-0 midpoint escaped today/past"
        for off in (-1, -2, -3, -9, -30):
            d = seed_day(off, ref=wall)
            day = start + timedelta(days=off)
            assert utc_day_start(d) == day, (
                f"{wall:%H:%M}: seed_day({off}) landed outside its calendar day")
            assert day <= d < start, (
                f"{wall:%H:%M}: seed_day({off}) must stay inside its PAST day")
            assert d <= wall
        # ساعات غريبة على الإزاحات السالبة تبقى داخل اليوم المقصود
        assert utc_day_start(seed_day(-2, hour=0, ref=wall)) == start - timedelta(days=2)
        assert utc_day_start(seed_day(-2, hour=23.75, ref=wall)) == start - timedelta(days=2)

    # البذور غير الحتمية تُرفض صريحة: المستقبل، hour مع اليوم الجاري،
    # وhour خارج [0,24)
    with pytest.raises(ValueError):
        seed_day(1)
    with pytest.raises(ValueError):
        seed_day(0, hour=9)
    with pytest.raises(ValueError):
        seed_day(-1, hour=24)


async def test_b3_bundle_factory_error_is_500_arabic(v10_seed, monkeypatch):
    """عطل الحساب يبقى 500 عربية عامة (عقد المعالج القائم محفوظ عبر الكاش)."""
    import routers.dashboard_stats as ds_mod

    async def boom(db, tid):
        raise RuntimeError("boom-bundle")

    monkeypatch.setattr(ds_mod, "_build_dashboard_bundle", boom)
    uname, _tid, _uid = await v10_seed.tenant_user(tenant_name="B3err")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r.status_code == 500
    assert "لوحة البيانات" in r.json()["detail"]


# ════════════════════════════════════════════════════════════════════
# D8-B2 — خنق مزامنة /api/comments + gather في fb_client
# ════════════════════════════════════════════════════════════════════

class _FakeSyncFB:
    """عميل مزيّف يعدّ نداءات مزامنة التعليقات (صفر شبكة)."""

    def __init__(self, comments: list | None = None):
        self.calls = 0
        self._comments = comments or []

    async def get_recent_comments(self, limit: int = 50):
        self.calls += 1
        return self._comments


async def test_b2_comments_sync_skipped_within_30s(v10_seed, monkeypatch):
    """النداء المتكرر خلال 30ث يُتخطى: أول طلب يزامن (synced=true)، الثاني
    خلال النافذة لا يلمس Graph إطلاقاً (synced=false) — ثم بعد انقضاء
    النافذة تُستأنف المزامنة. (نمط inbox v8-A12 القائم حرفياً.)"""
    import routers.replies as rp_mod

    fake = _FakeSyncFB()

    async def fake_resolver(tid):
        return fake

    monkeypatch.setattr(rp_mod, "get_tenant_fb_client", fake_resolver)

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="B2throttle")
    await v10_seed.login(uname)

    r1 = await v10_seed.world.client.get("/api/comments?limit=30")
    assert r1.status_code == 200, r1.text
    assert r1.json()["data"]["synced"] is True
    assert fake.calls == 1

    r2 = await v10_seed.world.client.get("/api/comments?limit=30")
    assert r2.status_code == 200
    body2 = r2.json()["data"]
    assert body2["synced"] is False, "repeat call within 30s must skip the Graph sync"
    assert fake.calls == 1, "Graph was hit again within the skip window"
    assert "items" in body2  # DB-first يظل يخدم الصفوف

    # انقضاء النافذة قسرياً → المزامنة تعمل مرة أخرى
    rp_mod._COMMENTS_LAST_SYNC[tid] = time.monotonic() - 31.0
    r3 = await v10_seed.world.client.get("/api/comments?limit=30")
    assert r3.json()["data"]["synced"] is True
    assert fake.calls == 2


async def test_b2_throttle_is_per_tenant(v10_seed, monkeypatch):
    """الخنق لكل مستأجر لا عالمي: مستأجران متتاليان خلال نفس الثانية كلاهما
    يزامن (بلا حجاب متبادل)."""
    import routers.replies as rp_mod

    fake_a = _FakeSyncFB()
    fake_b = _FakeSyncFB()
    clients = {}

    async def fake_resolver(tid):
        return clients.get(tid)

    monkeypatch.setattr(rp_mod, "get_tenant_fb_client", fake_resolver)

    u_a, tid_a, _ = await v10_seed.tenant_user(tenant_name="B2isoA")
    u_b, tid_b, _ = await v10_seed.tenant_user(tenant_name="B2isoB")
    clients[tid_a] = fake_a
    clients[tid_b] = fake_b

    await v10_seed.login(u_a)
    ra = await v10_seed.world.client.get("/api/comments?limit=10")
    assert ra.json()["data"]["synced"] is True and fake_a.calls == 1
    assert fake_b.calls == 0

    await v10_seed.login(u_b)
    rb = await v10_seed.world.client.get("/api/comments?limit=10")
    assert rb.json()["data"]["synced"] is True and fake_b.calls == 1, (
        "tenant B must sync — the 30s skip is per-tenant, not global")


async def test_b2_synced_comments_persist_and_serve(v10_seed, monkeypatch):
    """الطلب الأول يزامن فعلاً: تعليقات Graph الحية تُخزَّن (upsert) وتُخدم من
    القاعدة في نفس الرد — العقد القائم بلا انكسار."""
    import routers.replies as rp_mod

    cid = f"live_{uuid.uuid4().hex[:8]}"
    fake = _FakeSyncFB(comments=[{
        "id": cid, "message": "تعليق حي من Graph",
        "from": {"id": "9001", "name": "زائر"},
        "created_time": utcnow().isoformat() + "Z",
    }])
    monkeypatch.setattr(rp_mod, "get_tenant_fb_client", _async_value(fake))

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="B2live")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/comments?limit=30")
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    match = [i for i in items if i["id"] == cid]
    assert match, "live-synced comment must be stored and served DB-first"
    assert match[0]["from_name"] == "زائر"


async def test_b2_gather_runs_post_fetches_concurrently(monkeypatch):
    """fb_client.get_recent_comments: جلب منشورات متعددة عبر gather — ذروة
    التزامن > 1 (كانت الحلقة تسلسلية 1+10 نداءات)."""
    from fb_client import FBClient

    client = FBClient(token="t", page_id="p")
    posts = [{"id": f"post_{i}", "message": f"منشور {i}"} for i in range(6)]
    monkeypatch.setattr(client, "get_page_posts", _async_value((posts, None)))

    state = {"inflight": 0, "peak": 0}

    async def slow_get_post_comments(post_id, limit=50):
        state["inflight"] += 1
        state["peak"] = max(state["peak"], state["inflight"])
        await asyncio.sleep(0.03)
        state["inflight"] -= 1
        return [{"id": f"c_{post_id}", "message": "x", "from": {}}]

    monkeypatch.setattr(client, "get_post_comments", slow_get_post_comments)

    comments = await client.get_recent_comments(60)
    assert len(comments) == 6
    assert all(c["_post_id"].startswith("post_") for c in comments), "post id must be attached"
    assert state["peak"] > 1, f"comment fetches must run concurrently, peak={state['peak']}"


async def test_b2_gather_tolerates_single_post_failure(monkeypatch):
    """فشل منشور واحد لا يُسقط البقية (return_exceptions) — عقد «أفضل جهد
    غير فادح» للطريق محفوظ مع التوازي."""
    from fb_client import FBClient

    client = FBClient(token="t", page_id="p")
    posts = [{"id": "ok_1", "message": "a"}, {"id": "bad", "message": "b"},
             {"id": "ok_2", "message": "c"}]
    monkeypatch.setattr(client, "get_page_posts", _async_value((posts, None)))

    async def flaky(post_id, limit=50):
        if post_id == "bad":
            raise RuntimeError("graph 500 for one post")
        return [{"id": f"c_{post_id}", "message": "ok", "from": {}}]

    monkeypatch.setattr(client, "get_post_comments", flaky)
    comments = await client.get_recent_comments(30)
    ids = {c["_post_id"] for c in comments}
    assert ids == {"ok_1", "ok_2"}, f"surviving posts must still sync, got {ids}"


# ════════════════════════════════════════════════════════════════════
# D8-B7 — إزالة dedup_middleware الصادقة
# ════════════════════════════════════════════════════════════════════

class _FakeURL:
    def __init__(self, path):
        self.path = path


class _FakeQS(dict):
    pass


class _FakeRequest:
    method = "GET"

    def __init__(self, path="/api/plans"):
        self.url = _FakeURL(path)
        self.query_params = _FakeQS()


async def test_b7_dedup_middleware_does_not_serialize_identical_gets():
    """السلوك القديم: قفل لكل (method+path+query) أثناء call_next → طلبان
    متطابقان يعملان واحداً بعد الآخر (ذروة 1). الآن: pass-through — ذروة 2
    (متوازيان فعلاً)، والاستجابة تمر كما هي. كاش النقاط العامة يعيش في
    APICache.cached المزيّن فعلاً (اختبار آخر يغطي singleflight الخاص به)."""
    from types import SimpleNamespace

    from app.middleware import dedup_middleware

    state = {"inflight": 0, "peak": 0}

    async def call_next(request):
        state["inflight"] += 1
        state["peak"] = max(state["peak"], state["inflight"])
        await asyncio.sleep(0.05)
        state["inflight"] -= 1
        return SimpleNamespace(status_code=200, marker="resp")

    req = _FakeRequest("/api/plans")
    r1, r2 = await asyncio.gather(
        dedup_middleware(req, call_next),
        dedup_middleware(_FakeRequest("/api/plans"), call_next),
    )
    assert state["peak"] == 2, (
        f"identical concurrent GETs must NOT be serialized anymore, peak={state['peak']}")
    assert r1.marker == "resp" and r2.marker == "resp"


async def test_b7_dedup_middleware_passes_post_through_untouched():
    from types import SimpleNamespace

    from app.middleware import dedup_middleware

    async def call_next(request):
        return SimpleNamespace(status_code=201, body=b"x")

    r = await dedup_middleware(_FakeRequest("/api/broadcasts"), call_next)
    assert r.status_code == 201 and r.body == b"x"


# ════════════════════════════════════════════════════════════════════
# api_cache.get_or_compute — البنية التي يقوم عليها كاش B3
# ════════════════════════════════════════════════════════════════════

async def test_get_or_compute_singleflight_for_concurrent_misses():
    """طالبان متزامنان لنفس المفتاح → المصنع يعمل مرة واحدة بالضبط."""
    import api_cache as ac

    calls = []

    async def factory():
        calls.append(1)
        await asyncio.sleep(0.05)
        return {"n": len(calls)}

    a, b = await asyncio.gather(
        ac.get_or_compute("t:sf-key", 60, factory),
        ac.get_or_compute("t:sf-key", 60, factory),
    )
    assert len(calls) == 1, f"singleflight broken: factory ran {len(calls)} times"
    assert a == b == {"n": 1}


async def test_get_or_compute_ttl_expiry_recomputes():
    import api_cache as ac

    calls = {"n": 0}

    async def factory():
        calls["n"] += 1
        return {"v": calls["n"]}

    first = await ac.get_or_compute("t:ttl-key", 0.05, factory)
    assert first == {"v": 1}
    second = await ac.get_or_compute("t:ttl-key", 0.05, factory)
    assert second == {"v": 1}, "within TTL must serve cached"
    await asyncio.sleep(0.08)
    third = await ac.get_or_compute("t:ttl-key", 0.05, factory)
    assert third == {"v": 2}, "expired entry must recompute"


async def test_get_or_compute_distinct_keys_do_not_collide():
    import api_cache as ac

    async def fa():
        return {"who": "a"}

    async def fb():
        return {"who": "b"}

    a = await ac.get_or_compute("t:iso-a", 60, fa)
    b = await ac.get_or_compute("t:iso-b", 60, fb)
    assert a == {"who": "a"} and b == {"who": "b"}


# ════════════════════════════════════════════════════════════════════
# D14-M3 — scrubber: اسم المستخدم + مضيف DB
# ════════════════════════════════════════════════════════════════════

def _login_500_event() -> dict:
    """شكل الحدث الحي من إنتاج Sentry API (63cdb997 — 500 الدخول)."""
    return {
        "logentry": {"message": "Unhandled 500 | /api/login"},
        "request": {
            "url": "https://api.smart-link.ly/api/login",
            "data": {"username": "ahmad", "password": "[Filtered]"},
        },
        "breadcrumbs": {"values": [
            {
                "category": "query",
                "message": "SELECT users.username FROM users",
                "data": {
                    "server": {"address": "ep-small-block-avvdwdb8-pooler.c-11.us-east-1.aws.neon.tech",
                                "port": 5432},
                    "db": {"name": "smartbot_db", "user": "smartbot_owner"},
                },
            },
        ]},
    }


def test_m3_username_redacted_in_request_data():
    from _observability import _scrub_event

    event = _scrub_event(_login_500_event())
    data = event["request"]["data"]
    assert data["username"] == "[REDACTED-USERNAME]", data
    assert data["password"] == "[Filtered]"  # مرشّح SDK يبقى كما هو


def test_m3_db_host_and_credentials_redacted_in_breadcrumbs():
    from _observability import _scrub_event

    event = _scrub_event(_login_500_event())
    crumb = event["breadcrumbs"]["values"][0]
    server = crumb["data"]["server"]
    db = crumb["data"]["db"]
    assert server["address"] == "[REDACTED-HOST]", server
    assert "neon" not in str(server["address"])
    assert server["port"] == 5432  # المنفذ ليس هوية
    assert db["name"] == "[REDACTED-DB]" and db["user"] == "[REDACTED-DB]"


def test_m3_db_host_in_breadcrumb_message_redacted():
    from _observability import _scrub_event

    event = _scrub_event(_login_500_event())
    msg = event["breadcrumbs"]["values"][0]["message"]
    assert "neon.tech" not in msg  # الرسالة النصية نفسها لو حملت المضيف
    # والنص الأصلي في الحدث الحي لم يكن يحمل مضيفاً — نختبر النمط مباشرة:
    from _observability import _scrub_string
    scrubbed = _scrub_string("connect to ep-dark-unit-123.c-3.aws.neon.tech:5432")
    assert "neon.tech" not in scrubbed and "[REDACTED-DB-HOST]" in scrubbed


def test_m3_email_and_phone_still_scrubbed_in_messages():
    """حارس انحدار v12: بريد/هاتف في نصوص الأخطاء يظل ممسوحاً."""
    from _observability import _scrub_event

    event = {
        "logentry": {"message": "login failed for ali@example.com phone 0912345678"},
        "exception": {"values": [{"type": "ValueError", "value": "bad 091-234-5678"}]},
    }
    out = _scrub_event(event)
    assert "ali@example.com" not in out["logentry"]["message"]
    assert "[REDACTED-EMAIL]" in out["logentry"]["message"]
    assert "[REDACTED-PHONE]" in out["exception"]["values"][0]["value"]


def test_m3_scrubber_never_raises_or_drops_event():
    """أشكال معطوبة/غريبة → الحدث يعود كما هو، لا استثناء، لا إسقاط."""
    from _observability import _scrub_event

    weird = {
        "logentry": "not-a-dict",
        "request": {"data": None},
        "breadcrumbs": "just-a-string",
        "exception": {"values": [None, 42, {"value": None}]},
    }
    out = _scrub_event(weird)
    assert out is weird
    out2 = _scrub_event({})
    assert out2 == {}


# ════════════════════════════════════════════════════════════════════
# D6-M1 — حارس إقلاع TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED في production
# ════════════════════════════════════════════════════════════════════

def _run_config_import(extra_env: dict) -> subprocess.CompletedProcess:
    """استيراد config في عملية معزولة (بلا تلويث حالة هذه العملية)."""
    env = dict(os.environ)
    env.pop("DEBUG", None)
    env.pop("TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED", None)
    env.update(extra_env)
    return subprocess.run(
        [sys.executable, "-c", "import config"],
        cwd=FB_DIR, env=env, capture_output=True, text=True, timeout=60,
    )


def test_m1_prod_boot_refused_with_unverified_telegram_webhook():
    """production + TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=true → رفض إقلاع
    برسالة واضحة (المسار يعطّل فحص سر تليجرام — باب انتحال لو انكشف)."""
    proc = _run_config_import({
        "VERCEL_ENV": "production",
        "SECRET_KEY": "prod-key-for-test",
        "CRON_SECRET": "prod-cron",
        "FERNET_KEY": "prod-ferent",
        "TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED": "true",
    })
    assert proc.returncode != 0, "boot must be REFUSED in production with the dev hatch on"
    assert "TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED" in proc.stderr
    assert "CRITICAL" in proc.stderr


def test_m1_prod_boot_ok_without_the_flag():
    proc = _run_config_import({
        "VERCEL_ENV": "production",
        "SECRET_KEY": "prod-key-for-test",
        "CRON_SECRET": "prod-cron",
        "FERNET_KEY": "prod-ferent",
    })
    assert proc.returncode == 0, proc.stderr


def test_m1_dev_still_allows_the_hatch():
    """الاختبارات/التطوير (DEBUG=true) تحتفظ بالهATCH — لا كسر لوضع dev."""
    proc = _run_config_import({
        "DEBUG": "True",
        "VERCEL_ENV": "production",
        "SECRET_KEY": "x", "CRON_SECRET": "y", "FERNET_KEY": "z",
        "TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED": "true",
    })
    assert proc.returncode == 0, proc.stderr


def test_m1_prod_ignores_case_variant_runner_would_ignore():
    """القيمة "True" (بحرف كبير) لا تفعّل الهATCH عند runner (مقارنة ==
    "true" الحرفية) — فلا يُرفض الإقلاع عليها (توافق دقيق مع سلوك العامل
    الحقيقي؛ الرسالة توثّق المقارنة الحرفية)."""
    proc = _run_config_import({
        "VERCEL_ENV": "production",
        "SECRET_KEY": "prod-key-for-test",
        "CRON_SECRET": "prod-cron",
        "FERNET_KEY": "prod-ferent",
        "TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED": "True",
    })
    assert proc.returncode == 0, proc.stderr


# ════════════════════════════════════════════════════════════════════
# D9-M1 — الإصدار 2.2.0 (عقد الإصدار الواحد)
# ════════════════════════════════════════════════════════════════════

def test_version_is_2_2_0():
    """مصدر واحد: VERSION ↔ app_version() ↔ Sentry release الافتراضي
    (init_sentry يقرأ app_version()). المنسّق يحاذي نشر Sentry القادم معه."""
    with open(os.path.join(FB_DIR, "VERSION"), encoding="utf-8") as vf:
        assert vf.read().strip() == "2.2.0"
    assert app_version() == "2.2.0"


def test_sentry_release_defaults_to_app_version(monkeypatch):
    """init_sentry (سلسلة وهمية) يمرر release=app_version=2.2.0 — إسناد
    الإصدار الواحد حي (SENTRY_RELEASE الصريح يظل يتفوق)."""
    import sys as _sys
    import types

    import _observability as obs

    fake = types.ModuleType("sentry_sdk")
    state: dict = {"init_kwargs": None}

    def _init(**kwargs):
        state["init_kwargs"] = kwargs

    fake.init = _init
    fake.capture_message = lambda *a, **k: None
    fake.new_scope = lambda: None
    monkeypatch.setitem(_sys.modules, "sentry_sdk", fake)
    monkeypatch.setenv("SENTRY_DSN", "https://key@sentry.example.com/1")
    monkeypatch.setenv("SENTRY_BOOT_CANARY", "off")
    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    assert obs.init_sentry() is True
    assert state["init_kwargs"]["release"] == "2.2.0"
    assert state["init_kwargs"]["before_send"] is obs._before_send
    obs._sentry_enabled = False  # hygiene


# ════════════════════════════════════════════════════════════════════
# D14-H3 — التوثيق الحي لواقع transactions على Vercel (توثيق، لا إصلاح وهمي)
# ════════════════════════════════════════════════════════════════════

def test_h3_transactions_vercel_reality_is_documented_in_code():
    """القرار (dec-transactions-vercel) موثّق في المكان الذي يضبط معدل
    العينات — لا كود يدّعي أن APM يعمل: التعليق يذكر الدليل الحي (صفر
    صفوف)، السبب الجذري (تجميد Vercel قبل flush)، والقرار المؤجل."""
    import inspect

    import _observability as obs

    src = inspect.getsource(obs.init_sentry)
    assert "D14-H3" in src
    assert "transactions" in src.lower()
    assert "flush" in src.lower()
    assert "dec-transactions-vercel" in src
    # السلوك غير المدّعى: المعدل الافتراضي يبقى قابل الضبط بالمتغير
    assert 'os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05")' in src
