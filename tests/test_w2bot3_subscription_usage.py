from __future__ import annotations

"""W2-BOT-3 (P42-2، تدقيق 3a) — عقد GET /api/subscriptions/usage.

لماذا: سقف الردود الشهري (Free=100 افتراضيًا في models.py) كان يُطبَّق
صامتًا في محرك البوت؛ هذا المسار هو سطح القراءة الذي يعرضه العدّاد في
لوحة التحكم. العقد:
  1. مستأجر على خطة مسقوفة مع استخدام مسجّل → replies_used/max_replies
     نفس قراءة المحرك (get_plan_limits)، وunlimited=false.
  2. خطة غير مسقوفة (max_replies NULL) → unlimited=true الصادقة.
  3. مصادقة: بلا كوكي توكن → 401 (بوابة get_current_user).

نفس هارنس test_phase_b_payments (قاعدة ذاكرة + ASGI حقيقي).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
FB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

import pytest


@pytest.mark.asyncio
async def test_usage_endpoint_reads_engine_limits(tmp_path):
    from models import SubscriptionPlan, UsageCounter
    from test_phase_b_payments import _make_app_fixture, _seed, _teardown

    fixture = await _make_app_fixture()
    try:
        client, plan_ids, (tid, uid) = await _seed(
            fixture,
            plans=[{"name": "Free", "name_ar": "مجانية", "price": 0.0,
                    "period_days": 30, "trial_days": 0}],
        )
        app, session_factory, *_ = fixture

        # ① قبل أي استخدام: سقف البذرة الافتراضي (100) وصفر مستهلك
        r = await client.get("/api/subscriptions/usage")
        assert r.status_code == 200, r.text
        data = r.json()["data"]  # ok() envelope: {success: true, data: …}
        assert data["unlimited"] is False
        assert data["max_replies"] == 100
        assert data["replies_used"] == 0

        # ② كتابة استخدام عبر نفس قناة محاسبة المحرك
        from _utils import utcnow
        async with session_factory() as db:
            db.add(UsageCounter(tenant_id=tid, metric="replies_used",
                                period_start=utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0),
                                current_value=37))
            await db.commit()

        r = await client.get("/api/subscriptions/usage")
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["replies_used"] == 37, "المسار يجب أن يعكس قراءة المحرك نفسها (get_plan_limits)"
        assert data["unlimited"] is False

        # ③ خطة غير مسقوفة (max_replies NULL) → unlimited=true الصادقة
        from sqlalchemy import select as sa_select
        async with session_factory() as db:
            plan = (await db.execute(
                sa_select(SubscriptionPlan).where(SubscriptionPlan.name == "Free")
            )).scalar_one()
            plan.max_replies = None
            await db.commit()
        r = await client.get("/api/subscriptions/usage")
        data = r.json()["data"]
        assert data["unlimited"] is True
        assert data["max_replies"] is None
    finally:
        await _teardown(fixture)


@pytest.mark.asyncio
async def test_usage_endpoint_requires_auth(tmp_path):
    import httpx
    from test_phase_b_payments import _make_app_fixture, _teardown

    fixture = await _make_app_fixture()
    try:
        app, *_ = fixture
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as anon:
            r = await anon.get("/api/subscriptions/usage")
            assert r.status_code == 401, "سطح تاجر — المجهول لا يقرأ العدّاد"
    finally:
        await _teardown(fixture)
