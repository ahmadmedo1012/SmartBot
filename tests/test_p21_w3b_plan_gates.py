from __future__ import annotations

"""P21-W3-B — عقود البوابات الأربع المفتوحة (the four open plan-feature gates).

The v17-D6 surface audit inventoried the plan flags that were DECORATIVE —
sold in the tier feature lists and served by /api/plans, enforced nowhere.
This wave gives four of them their guard (CLAUDE.md v15 Convention #5:
«a paid feature with no gate is a bug, not a TODO»):

  has_scheduling          → POST /api/scheduled-posts · POST /api/calendar
                            · POST /api/publisher/publish (scheduled_at
                              branch — the third creation surface)
  has_reports             → POST /api/reports/generate · POST /api/reports/schedule
  has_offers              → POST /api/offers
  has_analytics_advanced  → the 5 advanced analytics reads (v17-D6 §3 set:
                            daily-trend · hourly-heatmap · peak-hour ·
                            top-rules · period-comparison)

Contract pins (both paths per gate, plus the shared doctrine):
  * DISABLED path — a Free (or planless→Free, or lapsed→Free) tenant gets
    403 with the SAME Arabic upgrade message shape as the v22-D4 sequences
    gate («…متاحة في خطة X أو أعلى — رقِّ خطتك»).
  * ENABLED path — a plan that sells the feature gets the normal 200.
  * CREATION-TIME ONLY — existing rows keep running after a downgrade
    (publishing an already-scheduled post is NOT gated; listing is open).
  * BASIC SURFACES STAY OPEN — overview/dashboard/sentiment/top-commenters
    (mobile's basic analytics), reports status probe, offers listing.
  * FAIL-OPEN — no plan rows at all → no gate (money-core doctrine; same
    pin shape as test_v22_sequences_gate).
  * LOUD TYPO — an unknown flag name raises ValueError at call time, never
    a silent fail-open.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
os.environ.setdefault("CRON_SECRET", "test-cron-secret")

pytestmark = pytest.mark.asyncio


async def _seed_plans(sf):
    """Free (all four gates closed) + Basic (reports only) + Premium (all four
    open) — mirrors the canonical boot seed (app/startup.py) for the flags
    under test."""
    from models import SubscriptionPlan
    from sqlalchemy import select

    async with sf() as db:
        ids = {}
        for name, name_ar, flags in (
            ("Free", "مجاني", {"has_scheduling": False, "has_reports": False,
                               "has_offers": False, "has_analytics_advanced": False,
                               "has_flows": False}),
            ("Basic", "أساسي", {"has_scheduling": False, "has_reports": True,
                                "has_offers": False, "has_analytics_advanced": False,
                                "has_flows": False}),
            ("Premium", "مميز", {"has_scheduling": True, "has_reports": True,
                                 "has_offers": True, "has_analytics_advanced": True,
                                 "has_flows": True}),
        ):
            row = (await db.execute(
                select(SubscriptionPlan).where(SubscriptionPlan.name == name)
            )).scalar_one_or_none()
            if row is None:
                row = SubscriptionPlan(name=name, name_ar=name_ar, is_active=True)
                db.add(row)
            for k, v in flags.items():
                setattr(row, k, v)
            await db.flush()
            ids[name] = row.id
        await db.commit()
        return ids


async def _tenant_on_plan(seed, tenant_name: str, plan_id: int | None):
    """A tenant bound to a plan (None = planless → resolves to Free row)."""
    from models import Tenant

    ua, tid, _uid = await seed.tenant_user(role="admin", tenant_name=tenant_name)
    if plan_id is not None:
        async with seed.world.sf() as db:
            t = await db.get(Tenant, tid)
            t.plan_id = plan_id
            await db.commit()
    return ua, tid


def _assert_upgrade_msg(resp, fragment: str):
    assert resp.status_code == 403, f"expected 403, got {resp.status_code}: {resp.text[:300]}"
    detail = resp.json()["detail"]
    assert fragment in detail, detail
    assert "رقِّ خطتك" in detail, detail  # same upgrade wording as v22-D4


# ════════════════════════════════════════════════════════════════════════════
# Gate 1 — has_scheduling (جدولة المنشورات: Premium+)
# ════════════════════════════════════════════════════════════════════════════


async def test_scheduling_gate_free_403_both_surfaces(v10_seed):
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-SCHED-FREE", ids["Free"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/scheduled-posts", data={"message": "منشور مجدول"})
    _assert_upgrade_msg(r, "جدولة المنشورات")

    r = await c.post("/api/calendar", json={"message": "منشور تقويم"})
    _assert_upgrade_msg(r, "جدولة المنشورات")

    # listing stays open (creation-time gating only)
    r = await c.get("/api/scheduled-posts")
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True


async def test_scheduling_gate_publisher_third_surface(v10_seed):
    """السطح الثالث لنفس الميزة المباعة: POST /api/publisher/publish مع
    scheduled_at يكتب منشورًا مجدولًا — نفس بوابة has_scheduling (403
    لـ Free). النشر الفوري (بلا scheduled_at) ليس جدولة ولا يُغلق. التحقق
    يسبق الاستحقاق كالأشقاء: صيغة تاريخ غير صالحة = 400 نظيفة قبل الـ403."""
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-SCHED-PUB", ids["Free"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    # a malformed date still answers the clean 400 — validation precedes 403
    r = await c.post("/api/publisher/publish", json={
        "message": "منشور", "scheduled_at": "غدًا"})
    assert r.status_code == 400 and "صيغة التاريخ" in r.json()["detail"], r.text

    r = await c.post("/api/publisher/publish", json={
        "message": "منشور مؤجل ممنوع", "platform": "telegram",
        "scheduled_at": "2031-01-01T00:00:00"})
    _assert_upgrade_msg(r, "جدولة المنشورات")


async def test_scheduling_gate_publisher_premium_200_scheduled(v10_seed):
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-SCHED-PUB-PRO", ids["Premium"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/publisher/publish", json={
        "message": "منشور مؤجل مميز", "platform": "telegram",
        "scheduled_at": "2031-01-01T00:00:00"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "scheduled"


async def test_scheduling_gate_premium_200_both_surfaces(v10_seed):
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-SCHED-PRO", ids["Premium"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/scheduled-posts", data={"message": "منشور مميز مجدول"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "draft"

    r = await c.post("/api/calendar", json={"message": "منشور تقويم مميز"})
    assert r.status_code == 200, r.text
    assert "id" in r.json()["data"]


async def test_scheduling_gate_existing_rows_keep_running(v10_seed):
    """الإدلال الافتتاحي للعقيدة: الخطة تُغلق الإنشاء، لا المحتوى القائم —
    publish لمنشور موجود (زرع مباشر) لمستأجر Free يصل منطق النشر (400
    «اربط صفحتك» بلا صفحة) — وليس 403 خطة."""
    from models import ScheduledPost

    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-SCHED-RUN", ids["Free"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    async with v10_seed.world.sf() as db:
        db.add(ScheduledPost(message="منشور قائم قبل الترقية/التخفيض",
                             status="scheduled", tenant_id=tid))
        await db.commit()
        post_id = (await db.execute(
            __import__("sqlalchemy").select(ScheduledPost.id).where(
                ScheduledPost.tenant_id == tid)
        )).scalar_one()

    r = await c.post(f"/api/scheduled-posts/{post_id}/publish")
    assert r.status_code == 400, r.text
    assert "اربط صفحتك أولاً" in r.json()["detail"]


# ════════════════════════════════════════════════════════════════════════════
# Gate 2 — has_reports (تقارير PDF: Basic+)
# ════════════════════════════════════════════════════════════════════════════


async def test_reports_gate_free_403_generate_and_schedule(v10_seed):
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-REP-FREE", ids["Free"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    # generate: the 403 lands BEFORE any engine work (entitlement precedes
    # infrastructure — a Free user must not see a misleading 503 engine-down)
    r = await c.post("/api/reports/generate", json={"type": "monthly", "days": 7})
    _assert_upgrade_msg(r, "تقارير PDF")

    r = await c.post("/api/reports/schedule",
                     data={"report_type": "monthly", "schedule": "monthly"})
    _assert_upgrade_msg(r, "تقارير PDF")

    # the engine-availability probe stays open (a basic, read-only surface)
    r = await c.get("/api/reports/status")
    assert r.status_code == 200, r.text


async def test_reports_gate_basic_200_schedule(v10_seed):
    """Basic يبيع «تقارير أسبوعية» (has_reports=True) — الجدولة تنشأ: 200."""
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-REP-BASIC", ids["Basic"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/reports/schedule",
                     data={"report_type": "monthly", "email": "b@test.ly"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["report_type"] == "monthly"


# ════════════════════════════════════════════════════════════════════════════
# Gate 3 — has_offers (محرك العروض الترويجية: Premium+)
# ════════════════════════════════════════════════════════════════════════════


async def test_offers_gate_free_403_create(v10_seed):
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-OFF-FREE", ids["Free"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/offers", data={"title": "عرض ممنوع", "code": "FREE1"})
    _assert_upgrade_msg(r, "العروض الترويجية")

    # listing stays open
    r = await c.get("/api/offers")
    assert r.status_code == 200, r.text


async def test_offers_gate_premium_200_create(v10_seed):
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-OFF-PRO", ids["Premium"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/offers", data={"title": "عرض مميز", "code": "PREM1",
                                          "discount_type": "percentage",
                                          "discount_value": 20})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["id"] > 0


# ════════════════════════════════════════════════════════════════════════════
# Gate 4 — has_analytics_advanced (التحليلات المتقدمة: Premium+ — v17-D6 §3 set)
# ════════════════════════════════════════════════════════════════════════════

_ADVANCED = (
    "/api/analytics/daily-trend?days=7",
    "/api/analytics/hourly-heatmap?days=7",
    "/api/analytics/peak-hour?days=7",
    "/api/analytics/top-rules?days=7",
    "/api/analytics/period-comparison?days=7",
)


async def test_analytics_gate_free_403_all_five(v10_seed):
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-AN-FREE", ids["Free"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    for path in _ADVANCED:
        r = await c.get(path)
        _assert_upgrade_msg(r, "التحليلات المتقدمة")


async def test_analytics_gate_premium_200_all_five(v10_seed):
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-AN-PRO", ids["Premium"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    for path in _ADVANCED:
        r = await c.get(path)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:300]}"


async def test_analytics_basic_surfaces_stay_open_for_free(v10_seed):
    """«إحصاءات أساسية» هو خط Free (features list) — المسارات الأساسية
    (overview/dashboard/sentiment/top-commenters — مستهلكات تطبيق الموبايل)
    لا تُغلق أبدًا."""
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-AN-BASIC", ids["Free"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    for path in (
        "/api/analytics/overview?days=30",
        "/api/analytics/dashboard?days=30",
        "/api/analytics/sentiment-trend?days=30",
        "/api/analytics/top-commenters?limit=5",
    ):
        r = await c.get(path)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:300]}"


# ════════════════════════════════════════════════════════════════════════════
# The shared doctrine pins
# ════════════════════════════════════════════════════════════════════════════


async def test_gate_failopen_without_plan_rows(v10_seed):
    """غياب صفوف الخطط كلياً → fail-open — عقيدة money-core (نفس دبوس
    test_v22_sequences_gate::...failopen)."""
    from models import SubscriptionPlan
    from sqlalchemy import delete

    async with v10_seed.world.sf() as db:
        await db.execute(delete(SubscriptionPlan))
        await db.commit()
    try:
        ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="W3B-OPEN")
        v10_seed.auth(ua, tid)
        c = v10_seed.world.client
        r = await c.post("/api/scheduled-posts", data={"message": "منشور fail-open"})
        assert r.status_code == 200, r.text
    finally:
        await _seed_plans(v10_seed.world.sf)  # restore rows for later tests


async def test_gate_lapsed_tenant_degrades_to_free(v10_seed):
    """المنتهية (EXPIRED_TRIAL على خطة Premium) → تدهور إلى صف Free
    (get_plan_limits) → البوابة مغلقة — عقيدة «الأساسي يبقى، المدفوع يُقطع»."""
    from models import Tenant

    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W3B-LAPSED", ids["Premium"])
    async with v10_seed.world.sf() as db:
        t = await db.get(Tenant, tid)
        t.subscription_status = "EXPIRED_TRIAL"
        await db.commit()
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.get("/api/analytics/daily-trend?days=7")
    _assert_upgrade_msg(r, "التحليلات المتقدمة")


async def test_gate_unknown_flag_fails_loudly(v10_seed):
    """اسم علم مجهول = خطأ مبرمج يُرمى فوراً (ValueError) — لا fail-open
    صامت يعيد فتح بوابة كان يجب أن تُغلق."""
    from _plan_gates import enforce_plan_feature

    _, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="W3B-HELPER")
    async with v10_seed.world.sf() as db:
        with pytest.raises(ValueError, match="has_typo"):
            await enforce_plan_feature(db, tid, "has_typo")

# ══════════════════════════════════════════════════════════════════════════
# Gate 5 — has_flows (التدفقات: Premium+ — the W4-B ruling)
# The canonical seed (app/startup.py) carries real entitlement values
# (Free/Basic False, Premium+ True): a seeded entitlement with no
# enforcement point is the decorative-flag pattern. Creation-time only.
# ══════════════════════════════════════════════════════════════════════════

async def test_flows_gate_free_403_create(v10_seed):
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W4B-FLW-FREE", ids["Free"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/flows", json={"name": "تدفق ممنوع", "nodes": [], "edges": []})
    _assert_upgrade_msg(r, "التدفقات")

    # listing stays open
    r = await c.get("/api/flows")
    assert r.status_code == 200, r.text


async def test_flows_gate_premium_200_create(v10_seed):
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W4B-FLW-PRO", ids["Premium"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/flows", json={"name": "تدفق مميز",
                                         "nodes": [{"id": "n1", "type": "TRIGGER",
                                                    "data": {"triggerType": "manual"}}],
                                         "edges": []})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["id"] > 0


async def test_flows_gate_existing_rows_keep_running(v10_seed):
    """Creation-time only: a flow created on Premium keeps running after the
    tenant drops to Free (toggle + get stay open; only NEW creation is
    gated)."""
    ids = await _seed_plans(v10_seed.world.sf)
    ua, tid = await _tenant_on_plan(v10_seed, "W4B-FLW-DOWNGRADE", ids["Premium"])
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/flows", json={"name": "تدفق قبل الترقية",
                                         "nodes": [{"id": "n1", "type": "TRIGGER",
                                                    "data": {"triggerType": "manual"}}],
                                         "edges": []})
    assert r.status_code == 200, r.text
    flow_id = r.json()["data"]["id"]

    # downgrade to Free
    from models import Tenant
    async with v10_seed.world.sf() as db:
        t = await db.get(Tenant, tid)
        t.plan_id = ids["Free"]
        await db.commit()

    # the existing flow keeps running
    r = await c.post(f"/api/flows/{flow_id}/toggle")
    assert r.status_code == 200, r.text
    r = await c.get(f"/api/flows/{flow_id}")
    assert r.status_code == 200, r.text
    # but a NEW creation is now gated
    r = await c.post("/api/flows", json={"name": "تدفق بعد الترقية", "nodes": [], "edges": []})
    _assert_upgrade_msg(r, "التدفقات")
