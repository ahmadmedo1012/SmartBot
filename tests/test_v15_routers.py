"""v15-E3 — تحصين الراوترات: بث/حملات claim + 422 عربية + كرون GET + السقوف.

يثبّت هذه الجولة (ملكية E3 الصارمة):

  [x] C-BCAST1 — POST /api/broadcasts/{id}/send يجعل الصف pending (claim ذرّي
        draft→pending) ويردّ «في الطابور» فوراً (لا spawn يموت على Vercel)؛
        المستهلك broadcast_engine.process_pending() يستلم ذرّياً
        (pending→sending) ثم يرسل — طلبا إرسال متتاليان لا يرسلان مرتين.
  [x] D1-H3 — الحملات المجدولة المستحقة تُرسل فعلاً عبر
        marketing.process_pending_campaigns() (claim ذرّي scheduled→sending).
  [x] D1-H1 — كل التحويلات الخام في المسارات المالية (wallet topup/confirm،
        plans create/upgrade، approvals resolve) وعائلة request.json()/body["key"]
        (broadcasts/tags) ترد 422 «قيمة غير صالحة» — لا 500 خام ولا إنذار
        Sentry حرج لخطأ عميل.
  [x] D2-H1 (جزء E3) — بوابة has_broadcast عند إنشاء البث وعند الإرسال.
  [x] D9-H1 — /api/cron/cleanup-logs يقبل GET (كرون Vercel يرسل GET)؛
        D6-M3 — Bearer مقبول و?token= مهملة (تعمل مع تحذير إهمال).
  [x] D8-B6 — سقوف قوائم scheduled-posts وrules (LIMIT 50 افتراضياً، 200 أقصى).
"""
from __future__ import annotations

import os
import sys
import uuid
from datetime import timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
os.environ.setdefault("CRON_SECRET", "test-cron-secret")

from _utils import utcnow  # noqa: E402
from sqlalchemy import select  # noqa: E402

# ── أدوات مشتركة (نفس أنماط test_v11_broadcast_sequence) ─────────────────────


class FakeFB:
    """عميل FB مزيّف: يسجّل رسائل send_dm ويعيد نتيجة قابلة للضبط."""

    def __init__(self, ok: bool = True):
        self.dm_calls: list[tuple[str, str]] = []
        self.ok = ok

    async def send_dm(self, fb_user_id: str, message: str):
        self.dm_calls.append((fb_user_id, message))
        return {"message_id": f"m{len(self.dm_calls)}"} if self.ok else None


def _async_value(value):
    async def _getter(_tid):
        return value
    return _getter


@pytest.fixture(scope="module")
async def app_db():
    """جداول القاعدة الحقيقية المشتركة (database.engine) — مهام الإرسال تفتح
    جلساتها عبر AsyncSessionLocal بنفسها (v4 §3.8)."""
    from database import engine
    from models import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ═══════════════════════════════════════════════════════════════════════════
# C-BCAST1 — البث: الطابور + الاستهلاك الذرّي
# ═══════════════════════════════════════════════════════════════════════════


async def test_broadcast_send_queues_and_double_submit_is_rejected(v10_seed):
    """الإرسال عبر HTTP: طلب أول → 200 «في الطابور» + الصف pending (ولا إرسال
    بعد)؛ الطلب الثاني المتتالي → 400 عربية (المسار فقد السباق على claim
    draft→pending) — لا إرسال مزدوج."""
    from models import Broadcast, BroadcastRecipient

    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="BC-Q")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/broadcasts", json={"name": "رمضان", "message_template": "أهلاً"})
    assert r.status_code == 200, r.text
    bid = r.json()["data"]["id"]

    r = await c.post(f"/api/broadcasts/{bid}/send")
    assert r.status_code == 200, r.text
    body = r.json()["data"]
    assert body.get("queued") is True
    assert "الطابور" in (body.get("message") or "")

    async with v10_seed.world.sf() as db:
        b = await db.get(Broadcast, bid)
        assert b.status == "pending", b.status
        rcpts = (await db.execute(
            select(BroadcastRecipient).where(BroadcastRecipient.broadcast_id == bid)
        )).scalars().all()
    assert rcpts == [], "لم يُرسل شيء بعد الرد — الإرسال ملك المستهلك (cycle)"

    # الطلب المتتالي الثاني: نفس النتيجة المرجوّة من السباق الحقيقي — 400 نظيف
    r = await c.post(f"/api/broadcasts/{bid}/send")
    assert r.status_code == 400, r.text
    assert "مسودة" in r.json()["detail"], r.text


async def test_broadcast_process_pending_claims_and_fails_without_page(v10_seed, monkeypatch):
    """process_pending على مستأجر بلا صفحة مربوطة: يستلم (pending→sending) ثم
    الحالة failed صادقة — لا بث معلّق للأبد ولا كذب «بدأ الإرسال».

    v15-coordinator: حاجز عزل — get_tenant_fb_client يقرأ القاعدة العالمية
    (AsyncSessionLocal) بينما هذا الاختبار يعمل في عالم v10 المعزول؛ عند
    تشغيله بعد وحدات app_client (مثل test_v14_webhook_multi) يلتقي مستأجر
    عالمي بنفس المعرّف ومعه اعتمادات فيُرسل فعلاً بدل الفشل المتوقع.
    العزل: العميل يرد None دائماً هنا — «مستأجر بلا صفحة» مقصودة منطقياً
    لا اعتماداً على ترتيب التشغيل (نفس نمط test_process_pending_sends_exactly_once)."""
    import _services
    from broadcast_engine import process_pending
    from models import Broadcast

    async def _no_client(*_a, **_k):
        return None

    monkeypatch.setattr(_services, "get_tenant_fb_client", _no_client)

    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="BC-NP")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client
    r = await c.post("/api/broadcasts", json={"name": "بلا صفحة", "message_template": "م"})
    bid = r.json()["data"]["id"]
    r = await c.post(f"/api/broadcasts/{bid}/send")
    assert r.status_code == 200, r.text

    async with v10_seed.world.sf() as session:
        claimed = await process_pending(session)
    assert claimed == 1, claimed
    async with v10_seed.world.sf() as db:
        b = await db.get(Broadcast, bid)
        assert b.status == "failed", b.status

    # لا شيء معلّق آخر: الاستهلاك الثاني صفر
    async with v10_seed.world.sf() as session:
        assert await process_pending(session) == 0


async def test_process_pending_sends_exactly_once(app_db, monkeypatch):
    """C-BCAST1 جوهراً: المستهلك يرسل مرة واحدة بالضبط — طابور pending حقيقي
    على قاعدة المحرك، عميل FB مزيّف، استدعاءان متتاليان للمستهلك: الأول
    يستلم ويرسل لكل مشترك مرة، الثاني لا يجد شيئاً (لا إرسال مزدوج ولا
    صفوف مستلمين مضاعفة)."""
    import _services
    from database import AsyncSessionLocal
    from models import Broadcast, BroadcastRecipient, Subscriber, Tenant

    fake = FakeFB(ok=True)
    monkeypatch.setattr(_services, "get_tenant_fb_client", _async_value(fake))

    async with AsyncSessionLocal() as db:
        t = Tenant(name=f"BC15-{uuid.uuid4().hex[:8]}", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        for i in range(3):
            db.add(Subscriber(tenant_id=t.id, fb_user_id=f"fb15_{i}_{uuid.uuid4().hex[:4]}",
                              name=f"مشترك{i}", first_name=f"مشترك{i}",
                              platform="messenger", status="active"))
        bc = Broadcast(name="بث-طابور", message_template="أهلاً {name}!",
                       tenant_id=t.id, platform_filter={"platform": "all"},
                       segment_filters={}, status="pending")
        db.add(bc)
        await db.commit()
        bid = bc.id

    from broadcast_engine import process_pending

    async with AsyncSessionLocal() as session:
        first = await process_pending(session)
    assert first == 1, first
    async with AsyncSessionLocal() as session:
        second = await process_pending(session)
    assert second == 0, "طلب ثانٍ متتالٍ للمستهلك لا يرسل ثانية"

    async with AsyncSessionLocal() as db:
        b = await db.get(Broadcast, bid)
        assert b.status == "sent", b.status
        assert (b.total_recipients, b.sent_count, b.failed_count) == (3, 3, 0), (
            b.total_recipients, b.sent_count, b.failed_count)
        rcpts = (await db.execute(
            select(BroadcastRecipient).where(BroadcastRecipient.broadcast_id == bid)
        )).scalars().all()
        assert len(rcpts) == 3, "صفوف المستلمين لم تتضاعف"
        assert all(r.status == "sent" for r in rcpts)
    assert len(fake.dm_calls) == 3, fake.dm_calls


# ═══════════════════════════════════════════════════════════════════════════
# D2-H1 (جزء E3) — بوابة has_broadcast عند الإنشاء وعند الإرسال
# ═══════════════════════════════════════════════════════════════════════════


async def test_broadcast_plan_feature_gate(v10_seed):
    """باقة بلا has_broadcast: الإنشاء 403 والإرسال 403 برسالة عربية واحدة؛
    باقة بها العلم: الإنشاء والإدراج في الطابور يعملان. (المستأجر بلا صف باقة
    يبقى مسموحاً هنا — بوابة دورة حياة الاشتراك ملك E1 في المحرك.)"""
    from models import SubscriptionPlan, Tenant

    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="BC-PLAN")
    async with v10_seed.world.sf() as db:
        p_no = SubscriptionPlan(name="NoBc", name_ar="بلا بث", price=10.0,
                                period_days=30, is_active=True, has_broadcast=False)
        p_yes = SubscriptionPlan(name="YesBc", name_ar="مع بث", price=20.0,
                                 period_days=30, is_active=True, has_broadcast=True)
        db.add_all([p_no, p_yes])
        t = await db.get(Tenant, tid)
        t.plan_id = p_no.id
        await db.commit()
        plan_no, plan_yes = p_no.id, p_yes.id

    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/broadcasts", json={"name": "ممنوعة", "message_template": "م"})
    assert r.status_code == 403, r.text
    assert "البث" in r.json()["detail"], r.text

    async with v10_seed.world.sf() as db:
        t = await db.get(Tenant, tid)
        t.plan_id = plan_yes
        await db.commit()

    r = await c.post("/api/broadcasts", json={"name": "مسموحة", "message_template": "م"})
    assert r.status_code == 200, r.text
    bid = r.json()["data"]["id"]

    # نُرجع الباقة المانعة ثم نحاول الإرسال: البوابة تُفحص عند الإرسال أيضاً
    async with v10_seed.world.sf() as db:
        t = await db.get(Tenant, tid)
        t.plan_id = plan_no
        await db.commit()
    r = await c.post(f"/api/broadcasts/{bid}/send")
    assert r.status_code == 403, r.text
    assert "الترقية" in r.json()["detail"], r.text


# ═══════════════════════════════════════════════════════════════════════════
# D1-H1 — عائلة 422 العربية في ملفات E3
# ═══════════════════════════════════════════════════════════════════════════


async def test_broadcast_inputs_invalid_json_and_missing_name_422(v10_seed):
    """جسم غير JSON أو بلا name → 422 «قيمة غير صالحة» (كان 500 خام + إنذار
    حرج) — في الإنشاء والتقدير."""
    ua, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="BC-422")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/broadcasts", content=b"{not json", headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text
    assert "قيمة غير صالحة" in r.json()["detail"], r.text

    r = await c.post("/api/broadcasts", json={"message_template": "بلا اسم"})
    assert r.status_code == 422, r.text
    assert "name" in r.json()["detail"], r.text

    r = await c.post("/api/broadcasts/estimate", content=b"[[", headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text


async def test_wallet_topup_amount_invalid_422(v10_seed):
    """مال: amount نص غير رقمي في الشحن → 422 عربية (كان TypeError → 500)."""
    ua, tid, _uid = await v10_seed.tenant_user(tenant_name="W-422")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/payments/topup", json={
        "amount": "abc", "provider": "liyana", "phone": "0912345678",
    })
    assert r.status_code == 422, r.text
    assert "قيمة غير صالحة" in r.json()["detail"], r.text

    r = await c.post("/api/payments/topup", json={
        "amount": True, "provider": "liyana", "phone": "0912345678",
    })
    assert r.status_code == 422, r.text


async def test_wallet_confirm_payment_id_invalid_422(v10_seed):
    """مال: payment_id غير رقمي في تأكيد الحوالة → 422 (كان int() → 500)."""
    ua, tid, _uid = await v10_seed.tenant_user(tenant_name="WC-422")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/payments/confirm", json={"payment_id": "xyz", "reference": "R1"})
    assert r.status_code == 422, r.text
    assert "معرف الدفع" in r.json()["detail"], r.text


async def test_subscriptions_amount_invalid_422(v10_seed):
    """مال: المبلغ غير الرقمي في إنشاء الاشتراك (محفظة وفرع البنك) → 422."""
    from models import SubscriptionPlan

    ua, tid, _uid = await v10_seed.tenant_user(tenant_name="SUB-422")
    async with v10_seed.world.sf() as db:
        plan = SubscriptionPlan(name="P422", name_ar="خطة", price=50.0,
                                period_days=30, is_active=True)
        db.add(plan)
        await db.commit()
        plan_id = plan.id

    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/subscriptions", json={
        "plan_id": plan_id, "provider": "liyana", "amount": "abc", "phone": "0912345678",
    })
    assert r.status_code == 422, r.text
    assert "المبلغ" in r.json()["detail"], r.text

    # فرع البنك: نفس العائلة (كان float() خاماً)
    r = await c.post("/api/subscriptions", json={
        "plan_id": plan_id, "provider": "bank", "amount": "NaN-ish",
        "senderAccountName": "مرسل", "senderAccountNumber": "123",
    })
    assert r.status_code == 422, r.text


async def test_subscriptions_upgrade_amount_invalid_422(v10_seed):
    """مال: الترقية بمبلغ غير رقمي → 422 (كان 500 خاماً على float)."""
    from models import SubscriptionPlan, Tenant

    ua, tid, _uid = await v10_seed.tenant_user(tenant_name="UP-422")
    async with v10_seed.world.sf() as db:
        p1 = SubscriptionPlan(name="UpLow", name_ar="أدنى", price=50.0,
                              period_days=30, is_active=True)
        p2 = SubscriptionPlan(name="UpHigh", name_ar="أعلى", price=100.0,
                              period_days=30, is_active=True)
        db.add_all([p1, p2])
        t = await db.get(Tenant, tid)
        t.plan_id = p1.id
        await db.commit()
        high = p2.id

    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/subscriptions/upgrade", json={
        "plan_id": high, "provider": "liyana", "amount": "abc", "phone": "0912345678",
    })
    assert r.status_code == 422, r.text
    assert "المبلغ" in r.json()["detail"], r.text


async def test_admin_resolve_payment_id_invalid_422(v10_seed):
    """مال: حسم الدفعة بمعرف غير رقمي → 422 (كان int() → 500 لأدمن المنصة)."""
    puname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(puname, 0)
    c = v10_seed.world.client

    r = await c.post("/api/admin/subscriptions", json={"id": "abc", "status": "verified"})
    assert r.status_code == 422, r.text
    assert "معرف الدفعة" in r.json()["detail"], r.text


async def test_tags_inputs_invalid_json_and_missing_keys_422(v10_seed):
    """عائلة request.json()/body["key"] في مسارات الوسوم → 422 عربية."""
    ua, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="TAG-422")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/subscribers/1/tags", content=b"{oops",
                     headers={"content-type": "application/json"})
    assert r.status_code == 422, r.text
    assert "قيمة غير صالحة" in r.json()["detail"], r.text

    r = await c.post("/api/subscribers/1/tags", json={})
    assert r.status_code == 422, r.text
    assert "tag_id" in r.json()["detail"], r.text

    r = await c.post("/api/tags", json={})
    assert r.status_code == 422, r.text
    assert "name" in r.json()["detail"], r.text


# ═══════════════════════════════════════════════════════════════════════════
# D1-H3 — الحملات المجدولة تُرسل فعلاً
# ═══════════════════════════════════════════════════════════════════════════


async def test_campaign_scheduled_create_stays_scheduled(v10_seed):
    """الإنشاء مع scheduled_at يبقى مقبولاً (عقد 200: status=scheduled) —
    والاستحقاق صار له مستهلك فعلي في الاختبار التالي."""
    ua, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="MK-C")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/marketing/campaigns", json={
        "name": "حملة الفجر", "message": "رسالة الصباح", "audience": "all",
        "scheduled_at": "2030-01-01T08:00:00Z",
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "scheduled", r.text


async def test_process_pending_campaigns_sends_due_and_skips_future(app_db, monkeypatch):
    """D1-H3 جوهراً: حملة مستحقة (scheduled_at في الماضي) تُستلم ذرّياً وتُرسل
    عبر محرك البث (رسالة لكل مشترك مرة واحدة) وstatus=sent؛ حملة مستقبلية
    لا تُلمس؛ والاستدعاء الثاني صفر (لا إرسال مزدوج)."""
    import _services
    from database import AsyncSessionLocal
    from models import Broadcast, MarketingCampaign, Subscriber, Tenant

    fake = FakeFB(ok=True)
    monkeypatch.setattr(_services, "get_tenant_fb_client", _async_value(fake))

    async with AsyncSessionLocal() as db:
        t = Tenant(name=f"MK15-{uuid.uuid4().hex[:8]}", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        for i in range(2):
            db.add(Subscriber(tenant_id=t.id, fb_user_id=f"mk_{i}_{uuid.uuid4().hex[:4]}",
                              name=f"عميل{i}", first_name=f"عميل{i}",
                              platform="messenger", status="active"))
        due = MarketingCampaign(tenant_id=t.id, name="مستحقة", message="انطلقي",
                                audience="all", status="scheduled",
                                scheduled_at=utcnow() - timedelta(hours=1))
        future = MarketingCampaign(tenant_id=t.id, name="مستقبلية", message="لاحقاً",
                                   audience="all", status="scheduled",
                                   scheduled_at=utcnow() + timedelta(days=1))
        db.add_all([due, future])
        await db.commit()
        due_id, future_id = due.id, future.id

    from routers.marketing import process_pending_campaigns

    async with AsyncSessionLocal() as session:
        claimed = await process_pending_campaigns(session)
    assert claimed == 1, claimed

    async with AsyncSessionLocal() as db:
        c_due = await db.get(MarketingCampaign, due_id)
        assert c_due.status == "sent", c_due.status
        assert c_due.sent_count == 2, c_due.sent_count
        assert (c_due.delivered_count or 0) == 2, c_due.delivered_count
        c_future = await db.get(MarketingCampaign, future_id)
        assert c_future.status == "scheduled", "الحملة غير المستحقة لم تُلمس"
        bc = (await db.execute(select(Broadcast).where(Broadcast.tenant_id == t.id))).scalars().all()
    assert len(bc) == 1 and bc[0].status == "sent"
    assert len(fake.dm_calls) == 2, fake.dm_calls

    async with AsyncSessionLocal() as session:
        assert await process_pending_campaigns(session) == 0, "استدعاء ثانٍ لا يكرر الإرسال"
    assert len(fake.dm_calls) == 2


# ═══════════════════════════════════════════════════════════════════════════
# D9-H1 + D6-M3 — كرون cleanup-logs: GET + Bearer + ?token مهملة
# ═══════════════════════════════════════════════════════════════════════════


async def test_cleanup_logs_get_bearer_and_deprecated_query_token(app_db):
    """Vercel Cron يرسل GET مع Bearer: كان المسار POST-only → 405 يومياً.
    الآن: GET+Bearer=200؛ بلا توكن=403؛ ?token= الصحيحة تعمل (إهمال موثّق)؛
    الخاطئة 403؛ POST بالنموذج القديم يبقى متوافقاً."""
    import httpx
    from runner import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/api/cron/cleanup-logs")
        assert r.status_code == 403, r.text

        r = await c.get("/api/cron/cleanup-logs", headers={"Authorization": "Bearer test-cron-secret"})
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True

        r = await c.get("/api/cron/cleanup-logs?token=test-cron-secret")
        assert r.status_code == 200, f"?token= الصحيحة تعمل مع تحذير إهمال: {r.text}"

        r = await c.get("/api/cron/cleanup-logs?token=wrong")
        assert r.status_code == 403, r.text

        r = await c.post("/api/cron/cleanup-logs", data={"token": "test-cron-secret"})
        assert r.status_code == 200, f"التوافق الخلفي مع نموذج POST: {r.text}"

        r = await c.post("/api/cron/cleanup-logs", data={"token": "wrong"})
        assert r.status_code == 403, r.text


# ═══════════════════════════════════════════════════════════════════════════
# D8-B6 — سقوف القوائم: scheduled-posts و rules
# ═══════════════════════════════════════════════════════════════════════════


async def test_scheduled_posts_list_limit_caps(v10_seed):
    """/api/scheduled-posts: الافتراضي 50؛ limit=200 مقبول؛ limit>200 أو ≤0
    → 422 (كان بلا سقف — استطلاع 30ث يسحب الأرشيف كاملاً)."""
    ua, tid, _uid = await v10_seed.tenant_user(tenant_name="SP-CAP")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.get("/api/scheduled-posts")
    assert r.status_code == 200, r.text
    r = await c.get("/api/scheduled-posts?limit=200&offset=10")
    assert r.status_code == 200, r.text
    for bad in ("limit=201", "limit=0", "limit=-5", "offset=-1"):
        r = await c.get(f"/api/scheduled-posts?{bad}")
        assert r.status_code == 422, f"{bad} → {r.status_code}"


async def test_rules_list_limit_caps(v10_seed):
    """/api/rules: الافتراضي 50؛ الحدود نفسها (كان بلا سقف)."""
    ua, tid, _uid = await v10_seed.tenant_user(tenant_name="RL-CAP")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.get("/api/rules")
    assert r.status_code == 200, r.text
    r = await c.get("/api/rules?limit=200&offset=5")
    assert r.status_code == 200, r.text
    for bad in ("limit=201", "limit=0"):
        r = await c.get(f"/api/rules?{bad}")
        assert r.status_code == 422, f"{bad} → {r.status_code}"
