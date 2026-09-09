from __future__ import annotations

"""v14-E1 (BACKEND-SEC) — اختبارات أمنية سالبة لمسار الأموال والجلسات.

خطة v14 §E1 (main @ 56d1a3e4): كل اختبار هنا كُتب قبل إصلاحه وفشل على
الكود المرجعي (نمط regression-first — «كل إصلاح أمني يقترن باختبار سالب
يفشل قبله»). التغطية:

  C-SEC1  تأكيد الدفعة الذاتي (approvals.py POST /api/admin/subscriptions)
          → مستأجر مسجل ذاتياً (admin مساحته) يحاول تفعيل دفعته → 403
  E1-2    سقف /api/payments/history (wallet.py) — limit/offset مقيدة
  E1-3    إشعارات الأموال inline بدل spawn() (wallet.py + plans.py) —
          Vercel يقتل المهام الخلفية بعد الرد
  E1-4    الإيصالات: لا base64 في JSON الإداري (approvals.py) + مسار
          GET /api/payments/receipt/{id} محمي بالنطاق + تحقق receipt_url
          في plans.py
  E1-5    token_ver يُرفع عند تغيير كلمة المرور في PUT /api/users/{id}
          (users.py) — التوكن القديم يموت فوراً
  E1-6    تحقق days في POST /api/logs/clear (bot.py) — 0..365
  E1-7    حارس analyze_image (ai_service.py) — لا open() لملفات محلية أبداً
"""
import asyncio
import base64
import os
import secrets as _secrets
import sys
import time
from datetime import timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

from _utils import utcnow  # noqa: E402

# ── مساعدات الزرع ─────────────────────────────────────────────────────────────


async def _seed_plan_payment(sf, *, tenant_id, user_id, status="pending", extra=None, price=50.0):
    """زرع خطة + دفعة اشتراك مباشرة في قاعدة الاختبار. يعيد payment_id."""
    from models import SubscriptionPayment, SubscriptionPlan

    async with sf() as db:
        plan = SubscriptionPlan(name=f"V14Sec{_secrets.token_hex(4)}", name_ar="أمان v14",
                                price=price, period_days=30, is_active=True)
        db.add(plan)
        await db.flush()
        sp = SubscriptionPayment(
            user_id=user_id, tenant_id=tenant_id, phone="0912345678",
            amount=price, provider="liyana", plan_id=plan.id,
            plan_name="أمان v14", status=status, extra_data=extra or {"username": "payer"},
        )
        db.add(sp)
        await db.commit()
        return sp.id


async def _delegated_platform_admin(sf, tenant_id, username):
    """أدمن منصة مفوَّض ينتمي لمستأجر (نموذج 2026-09-05) — للقائمة + الحسم معاً."""
    from _hash import hash_password
    from models import User

    async with sf() as db:
        u = User(username=username, email=f"{username}@test.ly",
                 password_hash=hash_password("pass123456"),
                 tenant_id=tenant_id, role="admin", is_platform_admin=True)
        db.add(u)
        await db.commit()
        return u.username


# ── C-SEC1: تأكيد الدفعة الذاتي (حرجة) ───────────────────────────────────────


async def test_c_sec1_self_verification_blocked(v10_seed):
    """C-SEC1: مستأجر مسجل ذاتياً (admin مساحته) يحاول تأكيد دفعته → 403.

    سلسلة D8-C1 كاملة قبل الإصلاح: POST /api/subscriptions (pending) ثم
    POST /api/admin/subscriptions {status:"verified"} → باقة PAID بلا مال.
    """
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="CSEC1")
    # v19 Step 1: the duplicate-subscription guard rejects creation for a
    # PAID tenant — this test's chain (create → self-verify blocked) needs a
    # payable victim, so seed the tenant as UNPAID first.
    from models import Tenant as _Tenant19
    async with v10_seed.world.sf() as db:
        t = await db.get(_Tenant19, tid)
        t.subscription_status = "UNPAID"
        await db.commit()
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    from models import SubscriptionPlan

    async with v10_seed.world.sf() as db:
        plan = SubscriptionPlan(name="CSEC1Plan", name_ar="خطة أمان", price=50.0,
                                period_days=30, is_active=True)
        db.add(plan)
        await db.commit()
        plan_id = plan.id

    # الضحية تنشئ دفعة pending (بلا حوالة فعلية — مجرد ادعاء)
    r = await c.post("/api/subscriptions", json={
        "plan_id": plan_id, "provider": "liyana", "amount": 50.0, "phone": "0912345678",
    })
    assert r.status_code == 200, r.text
    sp_id = r.json()["data"]["payment_id"]

    # محاولة التأكيد الذاتي — يجب أن تُرفض بـ 403
    r = await c.post("/api/admin/subscriptions", json={"id": sp_id, "status": "verified"})
    assert r.status_code == 403, f"C-SEC1 ما زالت مفتوحة: {r.status_code} {r.text[:200]}"

    from models import SubscriptionPayment, Tenant

    async with v10_seed.world.sf() as db:
        sp = await db.get(SubscriptionPayment, sp_id)
        assert sp.status == "pending", "الدفعة يجب أن تبقى معلقة"
        t = await db.get(Tenant, tid)
        # حزام v10_seed يزرع المستأجر PAID أصلاً — الدليل الحقيقي على التفعيل هو
        # خطة/نهاية الاشتراك: يبقىان بلا تفعيل (الباقة لم تُمنح)
        assert t.plan_id is None, "plan_id تعيّن — منح باقة بلا مال"
        assert t.plan_end is None, "plan_end تعيّن — تفعيل غير مدفوع"


def _client(v10_seed):
    """العميل المشترك للحزام (سكر قصير للقراءة)."""
    return v10_seed.world.client


async def test_c_sec1_platform_admin_verification_still_works(v10_seed):
    """المسار الصحيح يبقى: مسؤول المنصة يفعّل الدفعة → PAID (التعادل مع تلغرام)."""
    puname, _ptid, _puid = await v10_seed.platform_admin()
    payer, tid, uid = await v10_seed.tenant_user(tenant_name="CSEC1Payer")
    sp_id = await _seed_plan_payment(v10_seed.world.sf, tenant_id=tid, user_id=uid)

    v10_seed.auth(puname, 0)
    r = await _client(v10_seed).post("/api/admin/subscriptions",
                                     json={"id": sp_id, "status": "verified"})
    assert r.status_code == 200, r.text

    from models import SubscriptionPayment, Tenant

    async with v10_seed.world.sf() as db:
        sp = await db.get(SubscriptionPayment, sp_id)
        assert sp.status == "verified"
        t = await db.get(Tenant, tid)
        assert t.subscription_status == "PAID"
        assert t.plan_end is not None


async def test_c_sec1_delegated_platform_admin_can_resolve(v10_seed):
    """الأدمن المفوَّض (is_platform_admin=True داخل مستأجر) يحسم مدفوعات غيره."""
    payer, tid, uid = await v10_seed.tenant_user(tenant_name="CSEC1Del")
    admin = await _delegated_platform_admin(v10_seed.world.sf, tid, "csec1_deladm")
    sp_id = await _seed_plan_payment(v10_seed.world.sf, tenant_id=tid, user_id=uid)
    v10_seed.auth(admin, tid)
    r = await _client(v10_seed).post("/api/admin/subscriptions",
                                     json={"id": sp_id, "status": "verified"})
    assert r.status_code == 200, r.text


# ── E1-2: سقف /api/payments/history ──────────────────────────────────────────


async def test_payments_history_default_cap_50(v10_seed):
    """120 دفعة → الافتراضي يعيد 50 فقط (كان يسحب الجدول كاملاً)."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="HistCap")
    from models import PaymentRequest

    async with v10_seed.world.sf() as db:
        for i in range(120):
            db.add(PaymentRequest(tenant_id=tid, username=uname, amount=i, provider="liyana",
                                  phone="0910000000", status="pending",
                                  created_at=utcnow() - timedelta(minutes=120 - i)))
        await db.commit()

    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.get("/api/payments/history")
    assert r.status_code == 200, r.text
    rows = r.json()["data"]
    assert len(rows) == 50, f"الاستجابة غير مسقوفة: {len(rows)} صفاً"
    # الأحدث أولاً (i=119 هو الأحدث) — الترتيب محفوظ بعد التسقيف
    assert rows[0]["amount"] == 119.0
    assert rows[49]["amount"] == 70.0


async def test_payments_history_limit_bounds(v10_seed):
    """limit=101 → 422 · limit=0 → 422 · offset سالب → 422."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="HistBounds")
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client
    for q in ("limit=101", "limit=0", "limit=-5", "offset=-1"):
        r = await c.get(f"/api/payments/history?{q}")
        assert r.status_code == 422, f"{q} → {r.status_code} (المتوقع 422)"


async def test_payments_history_offset_pagination(v10_seed):
    """offset يتصفح الصفحات: أقدم دفعة عند offset=2&limit=1."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="HistPage")
    from models import PaymentRequest

    async with v10_seed.world.sf() as db:
        for i in range(3):
            db.add(PaymentRequest(tenant_id=tid, username=uname, amount=i + 1, provider="liyana",
                                  phone="091", status="pending",
                                  created_at=utcnow() - timedelta(minutes=3 - i)))
        await db.commit()

    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.get("/api/payments/history?limit=1&offset=2")
    assert r.status_code == 200, r.text
    rows = r.json()["data"]
    assert len(rows) == 1
    assert rows[0]["amount"] == 1.0  # الأقدم


# ── E1-3: إشعارات الأموال inline (لا spawn بعد الرد) ─────────────────────────


async def test_notify_inline_helper_timeout_and_error_semantics():
    """المساعد: مهلة قصيرة تحمي زمن الرد + ابتلاع فشل الإرسال الخارجي."""
    from routers.payments.wallet import _notify_admins_inline

    async def slow():
        await asyncio.sleep(30)

    t0 = time.monotonic()
    await _notify_admins_inline(slow(), timeout=0.05)
    assert time.monotonic() - t0 < 5, "المهلة القصيرة لم تحمِ زمن الرد"

    async def boom():
        raise RuntimeError("telegram-down")

    await _notify_admins_inline(boom(), timeout=1.0)  # لا استثناء يتسرب للطالب

    done: list[bool] = []

    async def fast():
        done.append(True)

    await _notify_admins_inline(fast(), timeout=5.0)
    assert done == [True]


async def test_topup_notifies_admins_inline(v10_seed, monkeypatch):
    """الشحن: إشعار مدراء المنصة يُرسل قبل الرد (spawn يموت على Vercel)."""
    import routers.payments.wallet as wallet_mod

    seen: list[tuple] = []

    async def fake_notify(payment_id, username, amount, provider, phone):
        seen.append((payment_id, username, amount, provider, phone))

    monkeypatch.setattr(wallet_mod, "notify_admins_new_payment", fake_notify)
    assert hasattr(wallet_mod, "_notify_admins_inline"), \
        "يلزم مساعد إرسال inline في wallet.py (v14-E1 #3)"

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="NotifyTopup")
    v10_seed.auth(uname, tid)
    r = await _client(v10_seed).post("/api/payments/topup", json={
        "amount": 50, "provider": "liyana", "phone": "0912345678",
    })
    assert r.status_code == 200, r.text
    assert len(seen) == 1, "الإشعار لم يُرسل قبل الرد"
    assert seen[0][1] == uname
    assert seen[0][3] == "liyana"


async def test_subscription_create_notifies_admins_inline(v10_seed, monkeypatch):
    """إنشاء اشتراك: نفس الإرسال inline قبل الرد (كان spawn)."""
    import routers.payments.plans as plans_mod

    seen: list[tuple] = []

    async def fake_notify(*args, **kwargs):
        seen.append(args)

    monkeypatch.setattr(plans_mod, "notify_admins_new_subscription", fake_notify)

    from models import SubscriptionPlan

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="NotifySub")
    async with v10_seed.world.sf() as db:
        plan = SubscriptionPlan(name="NotifyPlan", name_ar="إشعار", price=50.0,
                                period_days=30, is_active=True)
        db.add(plan)
        await db.commit()
        plan_id = plan.id

    # (v19) Tenant arrives UNPAID so the guard admits the creation
    from models import Tenant as _TenantNotify19
    async with v10_seed.world.sf() as db:
        t = await db.get(_TenantNotify19, tid)
        t.subscription_status = "UNPAID"
        await db.commit()

    v10_seed.auth(uname, tid)
    r = await _client(v10_seed).post("/api/subscriptions", json={
        "plan_id": plan_id, "provider": "liyana", "amount": 50.0, "phone": "0912345678",
    })
    assert r.status_code == 200, r.text
    assert len(seen) == 1, "إشعار الاشتراك لم يُرسل قبل الرد"


# ── E1-4: الإيصالات — لا base64 في JSON الإداري + مسار GET محمي ───────────────

_BIG_DATA_URI = "data:image/jpeg;base64," + base64.b64encode(b"JPEGBYTES" * 20000).decode()


async def test_admin_list_replaces_receipt_with_flag_and_link(v10_seed):
    """D10 (عالية): قائمة المشرفات كانت تشحن الإيصال base64 كاملاً في JSON."""
    payer, tid, uid = await v10_seed.tenant_user(tenant_name="ReceiptList")
    sp_id = await _seed_plan_payment(
        v10_seed.world.sf, tenant_id=tid, user_id=uid,
        extra={"username": payer, "sender_name": "مرسل", "sender_account": "12345",
               "receipt_url": _BIG_DATA_URI},
    )
    admin = await _delegated_platform_admin(v10_seed.world.sf, tid, "receipt_list_adm")
    v10_seed.auth(admin, tid)

    r = await _client(v10_seed).get("/api/admin/subscriptions?status=pending")
    assert r.status_code == 200, r.text
    assert "base64," not in r.text, "حمولة الإيصال ما زالت تُشحن في JSON الإداري"
    row = next(x for x in r.json()["data"] if x["id"] == sp_id)
    meta = row["metadata"]
    assert meta["receipt_present"] is True
    assert "receipt_url" not in meta, "المفتاح الخام أزيل — استخدم receipt_api"
    assert meta["receipt_api"] == f"/api/payments/receipt/{sp_id}"
    # بقية البيانات الإدارية تبقى (اسم المرسل/الحساب)
    assert meta["sender_name"] == "مرسل"


async def test_receipt_route_serves_data_uri_to_owner(v10_seed):
    """المالك يفتح /api/payments/receipt/{id} → بايتات الصورة نفسها."""
    payer, tid, uid = await v10_seed.tenant_user(tenant_name="ReceiptOwner")
    raw = b"RECEIPT-IMAGE-BYTES-v14"
    uri = "data:image/png;base64," + base64.b64encode(raw).decode()
    sp_id = await _seed_plan_payment(v10_seed.world.sf, tenant_id=tid, user_id=uid,
                                     extra={"username": payer, "receipt_url": uri})
    v10_seed.auth(payer, tid)
    r = await _client(v10_seed).get(f"/api/payments/receipt/{sp_id}")
    assert r.status_code == 200, r.text
    assert r.content == raw
    assert r.headers["content-type"].startswith("image/png")


async def test_receipt_route_allows_platform_admin(v10_seed):
    puname, _ptid, _puid = await v10_seed.platform_admin()
    payer, tid, uid = await v10_seed.tenant_user(tenant_name="ReceiptPlat")
    raw = b"PLATFORM-ADMIN-VIEW"
    uri = "data:image/jpeg;base64," + base64.b64encode(raw).decode()
    sp_id = await _seed_plan_payment(v10_seed.world.sf, tenant_id=tid, user_id=uid,
                                     extra={"username": payer, "receipt_url": uri})
    v10_seed.auth(puname, 0)
    r = await _client(v10_seed).get(f"/api/payments/receipt/{sp_id}")
    assert r.status_code == 200, r.text
    assert r.content == raw


async def test_receipt_route_blocks_other_tenant(v10_seed):
    """مستخدم مستأجر آخر → 404 (لا كشف وجود — مطابق لعقد status)."""
    payer, tid, uid = await v10_seed.tenant_user(tenant_name="ReceiptA")
    other, otid, _ouid = await v10_seed.tenant_user(tenant_name="ReceiptB")
    uri = "data:image/jpeg;base64," + base64.b64encode(b"X").decode()
    sp_id = await _seed_plan_payment(v10_seed.world.sf, tenant_id=tid, user_id=uid,
                                     extra={"username": payer, "receipt_url": uri})
    v10_seed.auth(other, otid)
    r = await _client(v10_seed).get(f"/api/payments/receipt/{sp_id}")
    assert r.status_code == 404, r.text


async def test_receipt_route_missing_receipt_404(v10_seed):
    payer, tid, uid = await v10_seed.tenant_user(tenant_name="ReceiptNone")
    sp_id = await _seed_plan_payment(v10_seed.world.sf, tenant_id=tid, user_id=uid,
                                     extra={"username": payer})
    v10_seed.auth(payer, tid)
    r = await _client(v10_seed).get(f"/api/payments/receipt/{sp_id}")
    assert r.status_code == 404, r.text


async def test_receipt_route_requires_auth(v10_seed):
    payer, tid, uid = await v10_seed.tenant_user(tenant_name="ReceiptAnon")
    sp_id = await _seed_plan_payment(v10_seed.world.sf, tenant_id=tid, user_id=uid)
    v10_seed.logout()
    r = await _client(v10_seed).get(f"/api/payments/receipt/{sp_id}")
    assert r.status_code == 401, r.text


async def test_receipt_route_serves_static_file_with_containment(v10_seed):
    """إيصال قرص محلي يُقدَّم عبر المسار المحمي + كبح تجاوز المسار."""
    from routers.payments.bank import _UPLOAD_DIR

    name = f"test-v14-{_secrets.token_hex(6)}.jpg"
    path = _UPLOAD_DIR / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"STATIC-RECEIPT-BYTES")
    try:
        payer, tid, uid = await v10_seed.tenant_user(tenant_name="ReceiptStatic")
        sp_id = await _seed_plan_payment(
            v10_seed.world.sf, tenant_id=tid, user_id=uid,
            extra={"username": payer, "receipt_url": f"/static/uploads/receipts/{name}"})
        v10_seed.auth(payer, tid)
        r = await _client(v10_seed).get(f"/api/payments/receipt/{sp_id}")
        assert r.status_code == 200, r.text
        assert r.content == b"STATIC-RECEIPT-BYTES"

        # تجاوز مسار مخزَّن → basename فقط → لا ملف → 404 نظيف
        # (user_id=None يسمح بصف ثانٍ رغم فهرس pending-unique لكل مستخدم)
        sp2 = await _seed_plan_payment(
            v10_seed.world.sf, tenant_id=tid, user_id=None,
            extra={"username": payer,
                   "receipt_url": "/static/uploads/receipts/../../database.py"})
        r = await _client(v10_seed).get(f"/api/payments/receipt/{sp2}")
        assert r.status_code == 404, r.text
    finally:
        path.unlink(missing_ok=True)


async def test_subscription_rejects_oversized_receipt_url(v10_seed):
    """plans.py: data-URI عملاق (تجاوز /api/upload) → 400 قبل التخزين."""
    from models import SubscriptionPlan

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="BigReceipt")
    async with v10_seed.world.sf() as db:
        plan = SubscriptionPlan(name="BigReceiptPlan", name_ar="إيصال ضخم",
                                price=50.0, period_days=30, is_active=True)
        db.add(plan)
        await db.commit()
        plan_id = plan.id
    v10_seed.auth(uname, tid)
    r = await _client(v10_seed).post("/api/subscriptions", json={
        "plan_id": plan_id, "provider": "bank", "amount": 50.0,
        "senderAccountName": "مرسل", "senderAccountNumber": "1234567",
        "receiptImageUrl": "data:image/jpeg;base64," + "A" * 3_000_000,
    })
    assert r.status_code == 400, f"الإيصال الضخم قُبل: {r.status_code}"


async def test_subscription_rejects_non_image_receipt_url(v10_seed):
    """plans.py: receipt_url بمخطط غير مسموح → 400 (لا javascript:/file:...)."""
    from models import SubscriptionPlan

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="BadReceipt")
    async with v10_seed.world.sf() as db:
        plan = SubscriptionPlan(name="BadReceiptPlan", name_ar="إيصال سيئ",
                                price=50.0, period_days=30, is_active=True)
        db.add(plan)
        await db.commit()
        plan_id = plan.id
    v10_seed.auth(uname, tid)
    r = await _client(v10_seed).post("/api/subscriptions", json={
        "plan_id": plan_id, "provider": "bank", "amount": 50.0,
        "senderAccountName": "مرسل", "senderAccountNumber": "1234567",
        "receiptImageUrl": "javascript:alert(1)",
    })
    assert r.status_code == 400, f"مخطط غير مسموح قُبل: {r.status_code}"


# ── E1-5: token_ver عند تغيير كلمة المرور في PUT /api/users/{id} ─────────────


async def test_put_user_password_revokes_old_tokens(v10_seed):
    """توكن صدر قبل تغيير كلمة المرور → 401 فوراً (كان يعيش 24 ساعة)."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="TokVer")
    v10_seed.auth(uname, tid)
    c = _client(v10_seed)

    r = await c.post("/api/users", data={
        "username": "victim1", "password": "Passw0rd!123", "role": "viewer"})
    assert r.status_code == 200, r.text
    new_uid = r.json()["data"]["id"]

    from routers.auth import make_token

    old_token = make_token("victim1", tid)
    c.cookies.set("token", old_token)
    r = await c.get("/api/me")
    assert r.status_code == 200, "التوكن القديم يعمل قبل التغيير (تمهيد)"

    v10_seed.auth(uname, tid)
    r = await c.put(f"/api/users/{new_uid}", data={
        "role": "viewer", "password": "NewPass!45678"})
    assert r.status_code == 200, r.text

    c.cookies.set("token", old_token)
    r = await c.get("/api/me")
    assert r.status_code == 401, "التوكن القديم يجب أن يموت بعد تغيير كلمة المرور"

    r = await c.post("/api/login", json={"username": "victim1", "password": "NewPass!45678"})
    assert r.status_code == 200, r.text


# ── E1-6: تحقق days في POST /api/logs/clear ──────────────────────────────────


async def test_logs_clear_rejects_invalid_days(v10_seed):
    """days سالب/فوق 365/غير رقمي → 422 (كان سالب = مسح كل السجلات)."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="LogsClear")
    v10_seed.auth(uname, tid)
    c = _client(v10_seed)
    for bad in ({"days": -1}, {"days": 366}, {"days": "abc"}):
        r = await c.post("/api/logs/clear", json=bad)
        assert r.status_code == 422, f"{bad} → {r.status_code} (المتوقع 422)"


async def test_logs_clear_deletes_only_older_logs(v10_seed):
    """days صالح (30): القديم يُحذف والجديد يبقى — الدلالة لم تنكسر."""
    from models import BotLog

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="LogsSem")
    async with v10_seed.world.sf() as db:
        db.add_all([
            BotLog(tenant_id=tid, level="INFO", message="قديم",
                   created_at=utcnow() - timedelta(days=40)),
            BotLog(tenant_id=tid, level="INFO", message="جديد",
                   created_at=utcnow() - timedelta(days=1)),
        ])
        await db.commit()

    v10_seed.auth(uname, tid)
    r = await _client(v10_seed).post("/api/logs/clear", json={"days": 30})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["deleted"] == 1

    from sqlalchemy import select

    async with v10_seed.world.sf() as db:
        msgs = [row.message for row in (
            await db.execute(select(BotLog).where(BotLog.tenant_id == tid))).scalars().all()]
    assert msgs == ["جديد"]


# ── E1-7: حارس analyze_image — لا قراءة ملفات محلية ──────────────────────────


def _fake_vision_ai(monkeypatch):
    """AIService بمزود متشكَّل: يسجّل كل ما وصله المزود ولا يلمس الشبكة."""
    from ai_service import PROVIDER_OPENAI, AIService

    ai = AIService()
    monkeypatch.setattr(ai, "_provider", PROVIDER_OPENAI)
    monkeypatch.setattr(ai, "_openai_client", object())
    received: list[str] = []

    async def fake_vision(url: str, prompt: str) -> str:
        received.append(url)
        return "FAKE-ANALYSIS"

    monkeypatch.setattr(ai, "_openai_vision", fake_vision)
    return ai, received


async def test_analyze_image_refuses_local_files(monkeypatch, tmp_path):
    """D8-H1: مسار ملف محلي (موجود!) → رفض نظيف "" — المزود لا يستلم شيئاً.

    قبل الإصلاح كان الملف يُفتح ويُرمَّز base64 ويُشحن لمزود AI.
    """
    ai, received = _fake_vision_ai(monkeypatch)
    secret = tmp_path / "internal.jpg"
    secret.write_bytes(b"TOP-SECRET-FILE-CONTENT")

    out = await ai.analyze_image(str(secret))
    assert out == "", "الملف المحلي يجب أن يُرفض (لا تحليل)"
    assert received == [], "المزود استلم بايتات ملف محلي — ثغرة LFI مفتوحة"

    # مسار غير موجود → نفس الرفض النظيف (لا استثناء خام)
    out2 = await ai.analyze_image(".env")
    assert out2 == ""
    assert received == []


async def test_analyze_image_url_guards_preserved(monkeypatch):
    """عقد v10-A8 محفوظ: http:// أو مضيف داخلي → UnsafeImageUrlError عربية."""
    from ai_service import UnsafeImageUrlError

    ai, received = _fake_vision_ai(monkeypatch)
    with pytest.raises(UnsafeImageUrlError):
        await ai.analyze_image("http://example.com/pic.jpg")
    with pytest.raises(UnsafeImageUrlError):
        await ai.analyze_image("https://169.254.169.254/meta")
    with pytest.raises(UnsafeImageUrlError):
        await ai.analyze_image("https://localhost/x.png")
    assert received == []


async def test_analyze_image_accepts_data_uri(monkeypatch):
    """data:image (المولَّد داخلياً) يمر كما هو إلى المزود."""
    ai, received = _fake_vision_ai(monkeypatch)
    uri = "data:image/jpeg;base64," + base64.b64encode(b"IMG").decode()
    out = await ai.analyze_image(uri)
    assert out == "FAKE-ANALYSIS"
    assert received == [uri]
