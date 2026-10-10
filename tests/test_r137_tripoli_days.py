from __future__ import annotations

"""r137 — حدود اليوم بتوقيت طرابلس (UTC+2 ثابت بلا توقيت صيفي).

الخادم يعمل بتوقيت UTC (Vercel/CI)؛ قبل r137 كان «اليوم» يتبدل 02:00
طرابلس: رد الساعة 01:30 يُحسب على الأمس، و«ردود اليوم» تُصفّر متأخرة
ساعتين. هذه الاختبارات تثبّت عقد المساعدات الصرفة (_utils.tripoli_*)
وسلوك التجميع الحقيقي (SQL عبر قاعدة الاختبار) بساعة مثبّتة — نفس
درس Smart-Order src/lib/arabic.ts (tripoliDayStart/tripoliDateParts).
"""
from datetime import UTC, date, datetime, timedelta

import analytics_engine
from _utils import tripoli_date, tripoli_day_start, tripoli_now, utcnow

# ── المساعدات الصرفة ─────────────────────────────────────────────────

class TestTripoliHelpers:
    def test_utc_2330_belongs_to_next_tripoli_day(self):
        """UTC 2026-10-09 23:30 = طرابلس 2026-10-10 01:30 → يوم 10 أكتوبر."""
        assert tripoli_date(datetime(2026, 10, 9, 23, 30)) == date(2026, 10, 10)

    def test_day_start_is_22utc_of_same_utc_evening(self):
        """بداية يوم طرابلس = 22:00 UTC من الليلة السابقة بتوقيت UTC."""
        assert tripoli_day_start(datetime(2026, 10, 9, 23, 30)) == datetime(2026, 10, 9, 22, 0)
        assert tripoli_day_start(datetime(2026, 10, 10, 1, 30)) == datetime(2026, 10, 9, 22, 0)

    def test_before_22utc_is_still_the_same_tripoli_day(self):
        """21:59 UTC = 23:59 طرابلس → ما زلنا في نفس اليوم الطرابلسي."""
        assert tripoli_date(datetime(2026, 10, 9, 21, 59)) == date(2026, 10, 9)
        assert tripoli_day_start(datetime(2026, 10, 9, 21, 59)) == datetime(2026, 10, 8, 22, 0)

    def test_exact_22utc_boundary_flips_the_day(self):
        """22:00 UTC بالضبط = منتصف ليل طرابلس → يوم جديد يبدأ من هذه اللحظة."""
        assert tripoli_day_start(datetime(2026, 10, 9, 22, 0)) == datetime(2026, 10, 9, 22, 0)
        assert tripoli_date(datetime(2026, 10, 9, 22, 0)) == date(2026, 10, 10)

    def test_month_rollover_at_tripoli_midnight(self):
        """UTC 2026-10-31 23:30 = طرابلس 2026-11-01 01:30 → الأول من نوفمبر."""
        assert tripoli_date(datetime(2026, 10, 31, 23, 30)) == date(2026, 11, 1)

    def test_year_rollover(self):
        """UTC 2026-12-31 23:30 = طرابلس 2027-01-01 01:30."""
        assert tripoli_date(datetime(2026, 12, 31, 23, 30)) == date(2027, 1, 1)

    def test_tripoli_now_offset_is_plus_2(self):
        """ليبيا UTC+2 طول السنة (بلا صيفي منذ 2013) — مهما كانت منطقة الخادم."""
        assert tripoli_now().utcoffset() == timedelta(hours=2)

    def test_no_arg_forms_use_the_same_now(self):
        assert tripoli_day_start() == tripoli_day_start(utcnow())

    def test_aware_datetime_normalized_to_utc_first(self):
        aware = datetime(2026, 10, 9, 23, 30, tzinfo=UTC)
        assert tripoli_date(aware) == date(2026, 10, 10)
        assert tripoli_day_start(aware) == datetime(2026, 10, 9, 22, 0)


# ── التجميع الحقيقي (SQL على قاعدة الاختبار) بساعة مثبّتة ─────────────

# الساعة المثبّتة: 01:00 UTC = 03:00 طرابلس من يوم 2026-10-10
_FIXED_NOW = datetime(2026, 10, 10, 1, 0)


async def _seed_tenant_with_replies(world) -> int:
    from models import Reply, Tenant

    async with world.sf() as db:
        t = Tenant(name="r137-tripoli", is_active=True)
        db.add(t)
        await db.flush()
        # ردّان: 23:30 UTC (طرابلس 01:30 من يوم 10 أكتوبر = «اليوم»)
        # و20:00 UTC (طرابلس 22:00 من يوم 9 أكتوبر = «أمس»)
        db.add(Reply(tenant_id=t.id, fb_comment_id="r137a", fb_post_id="p1",
                     commenter_name="سالم", comment_text="سؤال الليل",
                     reply_text="رد", created_at=datetime(2026, 10, 9, 23, 30)))
        db.add(Reply(tenant_id=t.id, fb_comment_id="r137b", fb_post_id="p1",
                     commenter_name="منى", comment_text="سؤال المساء",
                     reply_text="رد", created_at=datetime(2026, 10, 9, 20, 0)))
        await db.commit()
        return t.id


async def test_overview_today_replies_follow_tripoli_day(v10_world, monkeypatch):
    """«ردود اليوم» في نظرة عامة التحليلات تُحسب من منتصف ليل طرابلس.

    قبل r137 كانت ``cast(created_at, Date) == utcnow().date()`` تلتقط
    رد 20:00 UTC (يوم 9 بتوقيت UTC) وتفوّت رد 23:30 UTC — أي أن الرد
    المُرسل 01:30 طرابلس يُحسب على الأمس.
    """
    monkeypatch.setattr(analytics_engine, "utcnow", lambda: _FIXED_NOW)
    tid = await _seed_tenant_with_replies(v10_world)

    eng = analytics_engine.AnalyticsEngine()
    async with v10_world.sf() as db:
        overview = await eng.get_dashboard_overview(7, db, tenant_id=tid)
    assert overview["today_replies"] == 1, (
        "رد 23:30 UTC (= 01:30 طرابلس اليوم) وحده ضمن «اليوم» الطرابلسي؛ "
        f"رد 20:00 UTC (= 22:00 طرابلس أمس) خارجه — حصلنا {overview['today_replies']}"
    )


async def test_dashboard_bundle_today_and_trend_follow_tripoli_day(v10_world, monkeypatch):
    """حزمة لوحة البيانات: عدّاد اليوم واتجاه اليوم/أمس بحدّ طرابلس."""
    import routers.dashboard_stats as dashboard_stats

    monkeypatch.setattr(dashboard_stats, "utcnow", lambda: _FIXED_NOW)
    tid = await _seed_tenant_with_replies(v10_world)

    async with v10_world.sf() as db:
        bundle = await dashboard_stats._build_dashboard_bundle(db, tid)
    stats = bundle["stats"]
    assert stats["today_replies"] == 1
    # اتجاه اليوم: نافذة اليوم الطرابلسية تحوي ردًا واحدًا (23:30 UTC) ونافذة
    # أمس تحوي ردًا واحدًا (20:00 UTC = 22:00 طرابلس أمس) → اتجاه مستوٍ 0%.
    # قبل r137 كانت نافذة «أمس» UTC تجمع الردّين معًا (كلاهما يوم 9 بتوقيت UTC).
    assert stats["trend"]["today"] == 0.0


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-v"])
