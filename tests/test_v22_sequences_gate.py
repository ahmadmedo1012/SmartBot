from __future__ import annotations

"""v22-D4 — بوابة خطة التسلسلات + عقد دورة النشر المجدول.

Domain 4 (النشر المجدول والحملات التسلسلية) gates:

  [x] has_sequences plan gate — التسلسلات تُباع على Pro/Enterprise
        (has_sequences=true) بينما أنشأ مستأجرو Free تسلسلات فعلياً في
        الإنتاج (دليل v22: sequences tenant 48/46 كلاهما Free). الإنشاء
        الآن يمر عبر _enforce_has_sequences (سابقة _enforce_max_rules
        v22-D3): Free → 403 عربية؛ Pro → 200؛ غياب صفوف الخطط →
        fail-open (عقيدة money-core).
  [x] عقد النشر المجدول للعizi غير المرتبطة بصفحة (policy v14-E2):
        POST /api/scheduled-posts/{id}/publish بدون صفحة مرتبطة → 400
        عربية صريحة (لا نشر صامت ولا 500).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
os.environ.setdefault("CRON_SECRET", "test-cron-secret")


async def _seed_plans(sf):
    """Free (has_sequences=False) + Pro (has_sequences=True) rows."""
    from models import SubscriptionPlan

    async with sf() as db:
        free = (await db.execute(
            __import__("sqlalchemy").select(SubscriptionPlan).where(
                SubscriptionPlan.name == "Free")
        )).scalar_one_or_none()
        if free is None:
            free = SubscriptionPlan(name="Free", name_ar="مجاني", price=0,
                                    period_days=30, max_replies=100,
                                    has_sequences=False, is_active=True,
                                    sort_order=1)
            db.add(free)
        else:
            free.has_sequences = False
        pro = (await db.execute(
            __import__("sqlalchemy").select(SubscriptionPlan).where(
                SubscriptionPlan.name == "Pro")
        )).scalar_one_or_none()
        if pro is None:
            pro = SubscriptionPlan(name="Pro", name_ar="احترافي", price=129,
                                   period_days=30, max_replies=50000,
                                   has_sequences=True, is_active=True,
                                   sort_order=4)
            db.add(pro)
        await db.commit()
        await db.refresh(free)
        await db.refresh(pro)
        return free.id, pro.id


async def test_sequence_plan_gate_free_403(v10_seed):
    """مستأجر Free (أو بلا خطة → صف Free) يُمنع من إنشاء تسلسل: 403 عربية."""

    await _seed_plans(v10_seed.world.sf)
    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="D4-GATE")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    # tenant بلا plan_id → get_plan_limits يحلّ إلى صف Free (has_sequences=False)
    r = await c.post("/api/sequences", json={"name": "تسلسل ممنوع"})
    assert r.status_code == 403, r.text
    assert "رقِّ خطتك" in r.json()["detail"], r.text


async def test_sequence_plan_gate_pro_allowed(v10_seed):
    """مستأجر Pro (plan_id → صف has_sequences=True) ينشئ التسلسل: 200."""
    from models import Tenant

    free_id, pro_id = await _seed_plans(v10_seed.world.sf)
    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="D4-PRO")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    async with v10_seed.world.sf() as db:
        t = await db.get(Tenant, tid)
        t.plan_id = pro_id
        await db.commit()
    r = await c.post("/api/sequences", json={"name": "تسلسل احترافي"})
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True


async def test_sequence_plan_gate_failopen_without_plan_rows(v10_seed, monkeypatch):
    """غياب صفوف الخطط كلياً → fail-open (لا يُحرم المستخدم) — عقيدة money-core."""
    from models import SubscriptionPlan
    from sqlalchemy import delete

    async with v10_seed.world.sf() as db:
        await db.execute(delete(SubscriptionPlan))
        await db.commit()
    try:
        ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="D4-OPEN")
        v10_seed.auth(ua, tid)
        c = v10_seed.world.client
        r = await c.post("/api/sequences", json={"name": "تسلسل fail-open"})
        assert r.status_code == 200, r.text
    finally:
        await _seed_plans(v10_seed.world.sf)  # restore rows for later tests


async def test_scheduled_post_publish_without_page_honest_400(v10_seed, monkeypatch):
    """v22-D4 live evidence pin: النشر اليدوي لمستأجر بلا صفحة مرتبطة →
    400 «لا توجد صفحة فيسبوك مرتبطة بحسابك» (لا نشر صامت، لا 500).

    Deterministic contract test: get_tenant_fb_client is patched to return
    None (the unconnected state) in the ROUTE's namespace — the live
    equivalent was verified against production (curl → 400). Patching
    keeps the test independent of the SHARED app-DB BotState rows other
    tests leave behind (CI order made the tenant-id space collide with a
    connected fixture tenant → a real client → 200 — not a route bug).
    """
    import routers.scheduled_posts_routes as spr

    async def _no_client(tenant_id: int):
        return None

    monkeypatch.setattr(spr, "get_tenant_fb_client", _no_client)
    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="D4-NOFB")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/scheduled-posts",
                     data={"message": "منشور مجدول اختبار v22-D4"})
    assert r.status_code == 200, r.text
    post_id = r.json()["data"]["id"]

    r = await c.post(f"/api/scheduled-posts/{post_id}/publish")
    assert r.status_code == 400, r.text
    assert "اربط صفحتك أولاً" in r.json()["detail"], r.text
