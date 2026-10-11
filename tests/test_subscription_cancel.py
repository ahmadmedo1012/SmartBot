from __future__ import annotations

"""v18 (Task 1-b) — إغلاق طريق مسدّد «طلب الدفع المعلق».

(r140 إنقاذ): عاش هذا العقد يتيمًا في fb_dashboard/tests/ (خارج
``testpaths = tests`` فلم يجمعه تشغيل pytest القياسي أبدًا — مخالفة
v5 §1)، وعند تشغيله صراحةً كان 2 من اختباراته أحمر ضد سلوك API أحدث:
  - «عضو بنفس المستأجر يستطيع الإلغاء» — قلبتها v25 (B-11) إلى
    «المالك فقط» (سباق صلاحية موثق؛ تغطيتها الحية في
    test_v25_hardening.py::test_pending_payment_cancel_owner_only)؛
  - «pending يعيد provider=libyana» — كان يفترض تطبيعًا عند القراءة،
    والمسار يكتب القانوني عند الإنشاء (r137: canonical_provider) ويعيد
    القيمة المخزنة كما هي؛ المسمار هنا يثبّت العقد الفعلي بالمفتاح القانوني.
يُرحَّل الباقي (المصفوفة كاملة) هنا على حزام v10_seed بدل الهارنس اليتيم.

Covered endpoints (routers/payments/plans.py):
  - POST /api/subscriptions/cancel  — self-service cancel of own pending row
  - GET  /api/subscriptions/pending — the dialog's pre-open probe

Money-path pins (the production complaint, evidence-v18):
  - cancel own pending → 200 {id, status: cancelled} + the row flips in DB,
    and a FOLLOW-UP POST /api/subscriptions succeeds (the dead end is gone)
  - cancel another tenant's payment → 404 «الدفعة غير موجودة» (isolation
    identical to subscription_status: 404, never 403 — no id oracle)
  - cancel a non-pending row → 400 «لا يمكن إلغاء طلب غير معلق» (admin
    decisions are final)
  - GET /pending returns the own latest pending with the full field set,
    ok(null) after cancel, and never leaks another user's row
"""


async def _seed_plan(sf) -> int:
    from models import SubscriptionPlan

    async with sf() as db:
        plan = SubscriptionPlan(name="Starter", name_ar="الأساسية", price=50.0,
                                period_days=30, trial_days=0, is_active=True)
        db.add(plan)
        await db.commit()
        return plan.id


async def _add_payment(sf, *, user_id, tenant_id, plan_id, status="pending", amount=50.0) -> int:
    """Seed a SubscriptionPayment row directly (bypasses the endpoint + Telegram).

    (r140) provider يُزرع بالمفتاح القانوني «libyana» — كما يكتبه مسار
    الإنشاء نفسه (r137: canonical_provider يطبّع «liyana» عند الكتابة)،
    وفحص /pending يعيد القيمة المخزنة كما هي.
    """
    from models import SubscriptionPayment

    async with sf() as db:
        sp = SubscriptionPayment(
            user_id=user_id, tenant_id=tenant_id, phone="0912345678",
            amount=amount, provider="libyana", plan_id=plan_id,
            plan_name="الأساسية", status=status, extra_data={},
        )
        db.add(sp)
        await db.commit()
        return sp.id


async def _set_tenant_unpaid(sf, tenant_id: int) -> None:
    """v19: بوابة «اشتراك نشط» ترفض إنشاء الطلب على مستأجر مدفوع —
    طريق إعادة الإنشاء يحتاج UNPAID (نفس ترتيب test_v14_security)."""
    from models import Tenant

    async with sf() as db:
        t = await db.get(Tenant, tenant_id)
        t.subscription_status = "UNPAID"
        await db.commit()


# ── POST /api/subscriptions/cancel ──────────────────────────────────────────


async def test_subscription_cancel_own_pending_then_recreate(v10_seed):
    """إلغاء الطلب المعلق الخاص بي → cancelled، ثم طلب جديد ينجح (المسدّد انفتح)."""
    owner, tid_a, uid_a = await v10_seed.tenant_user("cancel_owner")
    plan_id = await _seed_plan(v10_seed.world.sf)
    pid = await _add_payment(v10_seed.world.sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

    v10_seed.auth(owner, tid_a)
    r = await v10_seed.world.client.post("/api/subscriptions/cancel", json={"payment_id": pid})
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"id": pid, "status": "cancelled"}, r.text

    # the row really flipped in DB
    from models import SubscriptionPayment

    async with v10_seed.world.sf() as db:
        sp = await db.get(SubscriptionPayment, pid)
        assert sp.status == "cancelled"

    # THE dead-end closure: a fresh payment request now succeeds
    await _set_tenant_unpaid(v10_seed.world.sf, tid_a)
    r = await v10_seed.world.client.post("/api/subscriptions", json={
        "plan_id": plan_id, "provider": "liyana", "amount": 50.0, "phone": "0912345678",
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "pending", r.text


async def test_subscription_cancel_without_id_falls_back_to_latest_pending(v10_seed):
    """بلا payment_id في الجسم → يُلغى آخر طلب معلق يملكه المستخدم."""
    owner, tid_a, uid_a = await v10_seed.tenant_user("cancel_latest")
    plan_id = await _seed_plan(v10_seed.world.sf)
    pid = await _add_payment(v10_seed.world.sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

    v10_seed.auth(owner, tid_a)
    r = await v10_seed.world.client.post("/api/subscriptions/cancel", json={})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["id"] == pid
    assert r.json()["data"]["status"] == "cancelled"


async def test_subscription_cancel_other_tenants_payment_404(v10_seed):
    """مستخدم من مستأجر آخر يلغي دفعة غيره → 404 «الدفعة غير موجودة»."""
    owner_a, tid_a, uid_a = await v10_seed.tenant_user("cancel_victim")
    rival_b, tid_b, _uid_b = await v10_seed.tenant_user("cancel_rival")
    plan_id = await _seed_plan(v10_seed.world.sf)
    pid = await _add_payment(v10_seed.world.sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

    v10_seed.auth(rival_b, tid_b)
    r = await v10_seed.world.client.post("/api/subscriptions/cancel", json={"payment_id": pid})
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == "الدفعة غير موجودة", r.text

    # the row is untouched
    from models import SubscriptionPayment

    async with v10_seed.world.sf() as db:
        assert (await db.get(SubscriptionPayment, pid)).status == "pending"


async def test_subscription_cancel_non_pending_400(v10_seed):
    """إلغاء طلب غير معلق (قرار إدارة نهائي) → 400 «لا يمكن إلغاء طلب غير معلق»."""
    owner, tid_a, uid_a = await v10_seed.tenant_user("cancel_final")
    plan_id = await _seed_plan(v10_seed.world.sf)
    pid = await _add_payment(v10_seed.world.sf, user_id=uid_a, tenant_id=tid_a,
                             plan_id=plan_id, status="verified")

    v10_seed.auth(owner, tid_a)
    r = await v10_seed.world.client.post("/api/subscriptions/cancel", json={"payment_id": pid})
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "لا يمكن إلغاء طلب غير معلق", r.text


async def test_subscription_cancel_unknown_payment_404(v10_seed):
    """معرف دفعة غير موجود → 404 (ولا يميّز بين «غير موجود» و«ليس ملكك»)."""
    owner, tid_a, _uid_a = await v10_seed.tenant_user("cancel_ghost")
    v10_seed.auth(owner, tid_a)
    r = await v10_seed.world.client.post("/api/subscriptions/cancel", json={"payment_id": 99999})
    assert r.status_code == 404, r.text
    assert r.json()["detail"] == "الدفعة غير موجودة", r.text


async def test_subscription_cancel_requires_auth(v10_seed):
    """بدون جلسة → 401 (لا إلغاء مجهول الهوية)."""
    r = await v10_seed.world.client.post("/api/subscriptions/cancel", json={"payment_id": 1})
    assert r.status_code == 401, r.status_code


# ── GET /api/subscriptions/pending (the dialog pre-open probe) ──────────────


async def test_subscription_pending_returns_own_pending_fields(v10_seed):
    """فحص الطلب المعلق: كامل الحقول المعنية + الحالة الجارية.

    (r140) المفتاح القانوني: مسار الإنشاء يكتب canonical_provider
    («libyana» — r137) وفحص /pending يعيد القيمة المخزنة كما هي؛ المسمار
    يزرع بالقانوني (كما يكتبه المسار) فيثبّت العقد الفعلي للحقول كاملة."""
    owner, tid_a, uid_a = await v10_seed.tenant_user("pending_owner")
    plan_id = await _seed_plan(v10_seed.world.sf)
    pid = await _add_payment(v10_seed.world.sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

    v10_seed.auth(owner, tid_a)
    r = await v10_seed.world.client.get("/api/subscriptions/pending")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["payment_id"] == pid
    assert data["status"] == "pending"
    assert data["plan_id"] == plan_id
    assert data["plan_name"] == "الأساسية"
    assert data["amount"] == 50.0
    # r137: القيمة المخزنة بالمفتاح القانوني «libyana» كما كتبها المسار
    assert data["provider"] == "libyana"
    assert data["created_at"], data  # ISO-Z string (iso_z)


async def test_subscription_pending_none_after_cancel(v10_seed):
    """بعد الإلغاء → ok(null) — الحوار يفتح على نموذج الدفع من جديد."""
    owner, tid_a, uid_a = await v10_seed.tenant_user("pending_after_cancel")
    plan_id = await _seed_plan(v10_seed.world.sf)
    pid = await _add_payment(v10_seed.world.sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

    v10_seed.auth(owner, tid_a)
    r = await v10_seed.world.client.post("/api/subscriptions/cancel", json={"payment_id": pid})
    assert r.status_code == 200, r.text

    r = await v10_seed.world.client.get("/api/subscriptions/pending")
    assert r.status_code == 200, r.text
    assert r.json()["data"] is None, r.text


async def test_subscription_pending_never_leaks_other_users(v10_seed):
    """مستخدم بلا طلب معلق (خصمه هو من يملكه) → ok(null)، لا تسريب."""
    owner_a, tid_a, uid_a = await v10_seed.tenant_user("pending_secret")
    rival_b, tid_b, _uid_b = await v10_seed.tenant_user("pending_rival")
    plan_id = await _seed_plan(v10_seed.world.sf)
    await _add_payment(v10_seed.world.sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

    v10_seed.auth(rival_b, tid_b)
    r = await v10_seed.world.client.get("/api/subscriptions/pending")
    assert r.status_code == 200, r.text
    assert r.json()["data"] is None, r.text


async def test_subscription_pending_requires_auth(v10_seed):
    r = await v10_seed.world.client.get("/api/subscriptions/pending")
    assert r.status_code == 401, r.status_code
