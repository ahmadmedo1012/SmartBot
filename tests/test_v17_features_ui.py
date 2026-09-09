"""v17-E-F8 — اختبارات الواجهات/الخلفية الصغيرة للميزات المفقودة (FEATURES-UI).

يقترن كل اختبار ببند من خطة v17 §E-F8 (بنود 1/5/6) وتقرير D6 §7:

  [D6-1]  إنشاء عرض عبر **Form-encoded** (نفس ما يرسله نموذج «عرض جديد»
          في tools/page.tsx: URLSearchParams → application/x-www-form-urlencoded)
          — عقد routers/offers_routes.py يعلن Form(...) حصرًا؛ JSON كان
          سيرد 422 دائمًا (درس D5-F1 نفسه في القوالب).
  [D6-5]  إغلاق تذكرة من طابور المنصة — POST /api/admin/support/tickets/{id}/close
          (جديد في هذه الجولة): مسار /api/support/tickets/{id}/close محصور
          بالمستأجر (فحص t.tenant_id == current_user._tenant_id) فيرد 404
          لمدير المنصة (tenant 0) على تذاكر كل المستأجرين — زر الإغلاق في
          /admin/support كان بلا أي endpoint يخدمه. المسار الجديد عابر
          للمستأجرين: إغلاق + إشعار داخل التطبيق لصاحب التذكرة (نفس عقد
          مسار المستأجر) + idempotent (لا إشعار مكرر) + حارس مدير المنصة.
  [D6-6]  إلغاء البث المعلق — POST /api/broadcasts/{id}/cancel موجود خلفيًا
          ومُختبَر في tests/test_v11_broadcast_sequence.py:201 (cancel HTTP
          + engine) — لا ازدواج هنا؛ هذا الملف يثبت فقط أن الحالات التي
          يظهر لها زر الإغلاق في الواجهة (draft/pending/sending) هي نفسها
          القابلة للإلغاء في المحرك (عقد الزر الصادق).

Hermetic: v10_seed (قاعدة in-memory خاصة بكل اختبار + get_db مُعاد التوجيه) —
لا نداء Graph ولا شبكة ولا تليجرام (التذاكر تُزرع مباشرة في القاعدة).
"""
from __future__ import annotations

import os
import sys

from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))


# ══════════════════════════════════════════════════════════════════════════
# مساعدات الزرع
# ══════════════════════════════════════════════════════════════════════════


async def _seed_ticket(v10_seed, tenant_id: int, user_id: int | None,
                       status: str = "open") -> int:
    from models import SupportTicket

    async with v10_seed.world.sf() as db:
        t = SupportTicket(
            tenant_id=tenant_id, user_id=user_id, email="u@test.ly",
            subject="مشكلة في الردود", body="البوت لا يرد على التعليقات منذ الصباح",
            priority="high", status=status,
        )
        db.add(t)
        await db.commit()
        return t.id


async def _ticket_status(v10_seed, ticket_id: int) -> str:
    from models import SupportTicket

    async with v10_seed.world.sf() as db:
        row = await db.get(SupportTicket, ticket_id)
        return row.status


async def _notif_count(v10_seed, tenant_id: int, needle: str) -> int:
    from models import Notification

    async with v10_seed.world.sf() as db:
        rows = (await db.execute(
            select(Notification).where(Notification.tenant_id == tenant_id)
        )).scalars().all()
        return sum(1 for n in rows if needle in (n.title or ""))


# ══════════════════════════════════════════════════════════════════════════
# §A — D6-1: إنشاء عرض (عقد النموذج Form-encoded + ختم المستأجر)
# ══════════════════════════════════════════════════════════════════════════


async def test_offer_create_form_contract_and_tenant_stamp(v10_seed):
    """[D6-1] نموذج «عرض جديد» يرسل URLSearchParams (Form) — العقد الحرفي
    لـrouters/offers_routes.py:34-47 (Form حصرًا). يُنشأ الصف مختومًا
    بالمستأجر وبقيم الخصم كما أُرسلت، ويعود في قائمة /api/offers."""
    from models import Offer

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="OfferForm")
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    r = await c.post("/api/offers", data={
        "title": "خصم نهاية الموسم",
        "code": "END20",
        "description": "خصم 20% على كل المنتجات",
        "discount_type": "percentage",
        "discount_value": "20",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True, body
    offer_id = body["data"]["id"]
    assert isinstance(offer_id, int)

    async with v10_seed.world.sf() as db:
        row = (await db.execute(select(Offer).where(Offer.id == offer_id))).scalar_one()
        assert row.tenant_id == tid, "العرض يجب أن يُختم بمستأجر منشئه"
        assert row.title == "خصم نهاية الموسم"
        assert row.code == "END20"
        assert row.discount_type == "percentage"
        assert row.discount_value == 20

    # القائمة تعيده للواجهة (قوائم tools الثلاثية)
    r = await c.get("/api/offers")
    assert r.status_code == 200
    offers = r.json()["data"]
    assert any(o["id"] == offer_id and o["title"] == "خصم نهاية الموسم" for o in offers)


async def test_offer_create_requires_title(v10_seed):
    """[D6-1] غياب title (Form مطلوب) = 422 فوري — لا صف جزئي ولا 500."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="OfferNoTitle")
    v10_seed.auth(uname, tid)

    r = await v10_seed.world.client.post("/api/offers", data={"description": "بلا عنوان"})
    assert r.status_code == 422, r.text

    from models import Offer
    async with v10_seed.world.sf() as db:
        rows = (await db.execute(select(Offer))).scalars().all()
        assert rows == [], "لا صفوف جزئية بعد 422"


# ══════════════════════════════════════════════════════════════════════════
# §B — D6-5: إغلاق التذكرة من طابور المنصة (endpoint جديد)
# ══════════════════════════════════════════════════════════════════════════


async def test_platform_admin_closes_cross_tenant_ticket_with_notification(v10_seed):
    """[D6-5] مدير المنصة يغلق تذكرة مستأجر آخر (عابر للمستأجرين): الحالة
    مغلقة في القاعدة + إشعار «تم إغلاق تذكرتك #N» لصاحبها + غلاف ok."""
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-Close")
    ticket_id = await _seed_ticket(v10_seed, tid, uid)

    pname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(pname, 0)
    c = v10_seed.world.client

    r = await c.post(f"/api/admin/support/tickets/{ticket_id}/close")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["data"] == {"id": ticket_id, "status": "closed"}

    assert await _ticket_status(v10_seed, ticket_id) == "closed"
    assert await _notif_count(v10_seed, tid, f"تم إغلاق تذكرتك #{ticket_id}") == 1

    # الطابور يعكس الإغلاق فورًا (invalidateQueries في الواجهة)
    r = await c.get("/api/admin/support/tickets?status=closed")
    assert r.status_code == 200
    assert any(item["id"] == ticket_id for item in r.json()["data"]["items"])


async def test_platform_close_is_idempotent_no_duplicate_notification(v10_seed):
    """[D6-5] إغلاق تذكرة مغلقة = ok بنفس الحالة دون إشعار مكرر (double-click
    آمن — الزر معطّل أثناء pending لكن الطابور قد يكون بطيئًا)."""
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-Idem")
    ticket_id = await _seed_ticket(v10_seed, tid, uid)

    pname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(pname, 0)
    c = v10_seed.world.client

    r = await c.post(f"/api/admin/support/tickets/{ticket_id}/close")
    assert r.status_code == 200
    r = await c.post(f"/api/admin/support/tickets/{ticket_id}/close")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "closed"

    assert await _notif_count(v10_seed, tid, f"تم إغلاق تذكرتك #{ticket_id}") == 1


async def test_platform_close_requires_platform_admin(v10_seed):
    """[D6-5] أدمن مستأجر عادي (رغم require_role admin داخليًا) = 403 عربي —
    الإغلاق العابر للمستأجرين حكر مدير المنصة (نفس عائلة مسار الطابور)."""
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-403")
    ticket_id = await _seed_ticket(v10_seed, tid, uid)

    other_name, _otid, _ouid = await v10_seed.tenant_user(tenant_name="T-Other")
    v10_seed.auth(other_name, _otid)
    c = v10_seed.world.client

    r = await c.post(f"/api/admin/support/tickets/{ticket_id}/close")
    assert r.status_code == 403, r.text
    assert "مسؤول المنصة" in r.json()["detail"]
    assert await _ticket_status(v10_seed, ticket_id) == "open"


async def test_platform_close_404_unknown_ticket(v10_seed):
    """[D6-5] تذكرة غير موجودة = 404 عربي (لا تخمين أرقام)."""
    pname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(pname, 0)

    r = await v10_seed.world.client.post("/api/admin/support/tickets/999999/close")
    assert r.status_code == 404, r.text
    assert "غير موجودة" in r.json()["detail"]


async def test_tenant_close_route_404_for_platform_admin(v10_seed):
    """[D6-5 — توثيق السبب] مسار المستأجر /api/support/tickets/{id}/close
    يرد 404 لمدير المنصة (فحص t.tenant_id != current_user._tenant_id؛
    tenant المنصة 0) — هذا هو الدليل على أن مسار المنصة أعلاه ضروري
    وليس ازدواجًا: نفس الرقم، نفس النية، route مختلف."""
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-Why")
    ticket_id = await _seed_ticket(v10_seed, tid, uid)

    pname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(pname, 0)

    r = await v10_seed.world.client.post(f"/api/support/tickets/{ticket_id}/close")
    assert r.status_code == 404, r.text
    assert await _ticket_status(v10_seed, ticket_id) == "open"


# ══════════════════════════════════════════════════════════════════════════
# §C — D6-6: حالات زر الإلغاء الصادقة (عقد المحرك)
# ══════════════════════════════════════════════════════════════════════════


async def test_cancel_button_statuses_match_engine_contract(v10_seed):
    """[D6-6] الواجهة تُظهر زر «إلغاء» لحالات draft/pending/sending حصرًا —
    هذا الاختبار يثبت أن هذه المجموعة هي فعلاً القابلة للإلغاء عبر
    POST /api/broadcasts/{id}/cancel (draft|pending|sending → cancelled؛
    غير ذلك 400 «لا يمكن إلغاؤه») — النتيجة المرصودة للزر الصادق."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="B-Cancel")
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    statuses = ["draft", "pending", "sending", "sent", "cancelled", "failed"]
    for st in statuses:
        # نزرع عبر API الإنشاء ثم نعدّل الحالة مباشرة (الإنشاء يبدأ draft)
        r = await c.post("/api/broadcasts", json={
            "name": f"بث {st}", "message_template": "نص الرسالة الجماعية"})
        assert r.status_code == 200, r.text
        bid = r.json()["data"]["id"]

        from models import Broadcast
        async with v10_seed.world.sf() as db:
            row = await db.get(Broadcast, bid)
            row.status = st
            await db.commit()

        r = await c.post(f"/api/broadcasts/{bid}/cancel")
        if st in ("draft", "pending", "sending"):
            assert r.status_code == 200, f"{st}: {r.text}"
            assert await _broadcast_status(v10_seed, bid) == "cancelled"
        else:
            assert r.status_code == 400, f"{st} يجب أن يُرفض: {r.text}"


async def _broadcast_status(v10_seed, bid: int) -> str:
    from models import Broadcast

    async with v10_seed.world.sf() as db:
        return (await db.get(Broadcast, bid)).status
