"""v17-E-B1 — اختبارات القالب (JSON+Form) وmark-read للصندوق.

يقترن كل اختبار ببند من خطة v17 (E-B1) والتقارير D5/D10:

  [D5-F1]  إنشاء القالب عبر **JSON** ينجح (الواجهة الفعلية — tools/page.tsx
           ترسل JSON.stringify بينما الخادم أعلن Form فقط → 422 أبديًا،
           لم يكن ممكنًا إنشاء أي قالب من الواجهة إطلاقًا)
  [D5-F1]  إنشاء القالب عبر **Form** يظل ينجح (توافق خلفي — عملاء
           URLSearchParams القدامى، ونفس المعاملة لـ PUT)
  [D10-M3] POST /api/inbox/conversations/{id}/read يصفّر unread_count
           للمحادثة ويعيد إجمالي غير المقروء للمستأجر بعد التصفير
  [عزل]    محادثة مستأجر آخر = 404 (لا كتابة عابرة للمستأجرين) +
           محادثة غير موجودة = 404
  [عقد]    شكل ok() الموحد: {"success": True, "data": …} حصرًا — لا
           مفاتيح شقيقة (unwrapApi يرميها)

كل شيء عبر fixtures الذاكرة القياسية (conftest.py v10_world/v10_seed) —
لا نداء Graph ولا شبكة.
"""
from __future__ import annotations

from sqlalchemy import select

# ══════════════════════════════════════════════════════════════════════════
# أدوات الزرع
# ══════════════════════════════════════════════════════════════════════════


async def _seed_conversation(v10_seed, tenant_id: int, cid: str, unread: int) -> None:
    from models import Conversation

    async with v10_seed.world.sf() as db:
        db.add(Conversation(
            tenant_id=tenant_id, fb_conversation_id=cid, user_name="عميل",
            message_count=unread, unread_count=unread, last_message_text="مرحبا",
        ))
        await db.commit()


async def _unread_of(v10_seed, cid: str) -> int | None:
    """قراءة unread_count الفعلية من القاعدة (وليس من الاستجابة)."""
    from models import Conversation

    async with v10_seed.world.sf() as db:
        row = (await db.execute(
            select(Conversation).where(Conversation.fb_conversation_id == cid)
        )).scalar_one()
        return row.unread_count


# ══════════════════════════════════════════════════════════════════════════
# §A — D5-F1: القالب يقبل JSON وForm معًا (POST + PUT)
# ══════════════════════════════════════════════════════════════════════════


async def test_template_create_json_body_succeeds(v10_seed):
    """[أ] الإثبات الحاسم: العميل الحقيقي (tools/page.tsx:42-49) يرسل JSON —
    كان 422 دائمًا مع Form(...)-only. الآن يُنشأ الصف ويُختم بالمستأجر."""
    from models import ReplyTemplate

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="Tmpl-JSON")
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    r = await c.post("/api/templates", json={
        "name": "قالب ترحيب", "text": "أهلاً بك! كيف نساعدك؟", "category": "",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True, body
    tmpl_id = body["data"]["id"]
    assert isinstance(tmpl_id, int)

    async with v10_seed.world.sf() as db:
        row = (await db.execute(select(ReplyTemplate).where(ReplyTemplate.id == tmpl_id))
               ).scalar_one()
        assert row.tenant_id == tid, "القالب يجب أن يُختم بمستأجر منشئه"
        assert row.name == "قالب ترحيب"
        assert row.text == "أهلاً بك! كيف نساعدك؟"
        # category حاضر-فارغ في JSON = يُخزن فارغًا (سلوك العقد القديم نفسه)
        assert row.category == ""


async def test_template_create_form_body_succeeds(v10_seed):
    """[ب] توافق خلفي: عميل URLSearchParams (نمط autoreply) يظل يعمل —
    category غائب = الافتراضي «general» كما كان مع Form(\"general\")."""
    from models import ReplyTemplate

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="Tmpl-Form")
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    r = await c.post("/api/templates", data={
        "name": "شكر", "text": "شكراً لتواصلك معنا", "shortcut": "/thanks",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True and isinstance(body["data"]["id"], int), body

    async with v10_seed.world.sf() as db:
        row = (await db.execute(
            select(ReplyTemplate).where(ReplyTemplate.id == body["data"]["id"])
        )).scalar_one()
        assert row.category == "general", "غياب category في Form يحتفظ بالافتراضي"
        assert row.shortcut == "/thanks"
        assert row.tenant_id == tid


async def test_template_update_accepts_json_and_form(v10_seed):
    """PUT نفسه كان Form-only (D5-F8): نفس المعاملة المزدوجة تنطبق عليه —
    JSON يعدّل، وForm يعدّل، ومحادثة (قالب) مستأجر آخر = 404."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="Tmpl-PUT")
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    r = await c.post("/api/templates", json={"name": "قبل", "text": "نص قبل"})
    tmpl_id = r.json()["data"]["id"]

    r = await c.put(f"/api/templates/{tmpl_id}", json={"name": "بعد JSON", "text": "نص بعد"})
    assert r.status_code == 200 and r.json()["success"] is True, r.text

    r = await c.put(f"/api/templates/{tmpl_id}", data={"name": "بعد Form", "text": "نص نهائي"})
    assert r.status_code == 200 and r.json()["success"] is True, r.text

    from models import ReplyTemplate
    async with v10_seed.world.sf() as db:
        row = await db.get(ReplyTemplate, tmpl_id)
        assert row.name == "بعد Form" and row.text == "نص نهائي"
        assert row.category == "general", "PUT غائب category يحتفظ بالافتراضي"

    # قالب مستأجر آخر → 404 (العزل لم يتراجع بالتحويل)
    other, otid, _ouid = await v10_seed.tenant_user(tenant_name="Tmpl-Other")
    v10_seed.auth(other, otid)
    r = await c.put(f"/api/templates/{tmpl_id}", json={"name": "سرقة", "text": "x"})
    assert r.status_code == 404, f"cross-tenant PUT leaked: {r.status_code}"


async def test_template_create_missing_required_field_422_arabic(v10_seed):
    """[إثبات سالب] JSON بلا text → 422 عربي (عائلة broadcasts._json_body)،
    لا 500 خام — والصفر صفوف تُنشأ."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="Tmpl-422")
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client

    r = await c.post("/api/templates", json={"name": "بلا نص"})
    assert r.status_code == 422, r.text
    assert "قيمة غير صالحة" in r.json()["detail"], r.text

    r = await c.post("/api/templates", data={"text": "نص بلا اسم"})
    assert r.status_code == 422, r.text

    from models import ReplyTemplate
    async with v10_seed.world.sf() as db:
        rows = (await db.execute(
            select(ReplyTemplate).where(ReplyTemplate.tenant_id == tid)
        )).scalars().all()
        assert rows == [], "الطلبات الفاشلة لا تترك صفوفًا جزئية"


# ══════════════════════════════════════════════════════════════════════════
# §B — D10-M3: mark-read يصفّر unread ويعيد الإجمالي
# ══════════════════════════════════════════════════════════════════════════


async def test_mark_read_zeroes_unread_and_returns_tenant_total(v10_seed):
    """[ج] قراءة المحادثة تُصفّر عدّادها في القاعدة وتعيد إجمالي غير المقروء
    للمستأجر بعد التصفير (conv-1=3 تُقرأ → الإجمالي 2 من conv-2 حصره) —
    والإجمالي لا يحسب محادثات المستأجر الآخر."""
    ua, tida, _uida = await v10_seed.tenant_user(tenant_name="Inbox-A")
    _ub, tidb, _uidb = await v10_seed.tenant_user(tenant_name="Inbox-B")
    v10_seed.auth(ua, tida)

    await _seed_conversation(v10_seed, tida, "conv-a-1", unread=3)
    await _seed_conversation(v10_seed, tida, "conv-a-2", unread=2)
    await _seed_conversation(v10_seed, tidb, "conv-b-1", unread=5)

    c = v10_seed.world.client
    r = await c.post("/api/inbox/conversations/conv-a-1/read")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True, body
    assert body["data"] == {"unread": 2}, body  # conv-a-2 حصرًا — B مستبعد

    # التصفير فعلي في القاعدة (وليس وهم استجابة) والجيران لم يُمسّوا
    assert await _unread_of(v10_seed, "conv-a-1") == 0
    assert await _unread_of(v10_seed, "conv-a-2") == 2
    assert await _unread_of(v10_seed, "conv-b-1") == 5

    # idempotent: قراءة محادثة مقروءة أصلًا لا تنكسر والإجمالي نفسه
    r = await c.post("/api/inbox/conversations/conv-a-1/read")
    assert r.status_code == 200 and r.json()["data"] == {"unread": 2}, r.text

    # قراءة الأخيرة تُصفّر الإجمالي كله → 0 (الفلتر «غير مقروء» صادق الآن)
    r = await c.post("/api/inbox/conversations/conv-a-2/read")
    assert r.json()["data"] == {"unread": 0}, r.text


async def test_mark_read_cross_tenant_conversation_404(v10_seed):
    """[د] محادثة مستأجر آخر = 404 — ولا تُصفّر خلسة (BOLA حارس دائم)."""
    ua, tida, _uida = await v10_seed.tenant_user(tenant_name="Mark-A")
    _ub, tidb, _uidb = await v10_seed.tenant_user(tenant_name="Mark-B")
    v10_seed.auth(ua, tida)

    await _seed_conversation(v10_seed, tidb, "conv-b-secret", unread=4)

    c = v10_seed.world.client
    r = await c.post("/api/inbox/conversations/conv-b-secret/read")
    assert r.status_code == 404, f"cross-tenant mark-read leaked: {r.status_code}"
    assert await _unread_of(v10_seed, "conv-b-secret") == 4, "404 مس مطلقًا عدّاد الغير"


async def test_mark_read_missing_conversation_404(v10_seed):
    """محادثة غير موجودة أصلًا → 404 (عقد الخطة: «404 لمحادثة غير موجودة»)."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="Mark-Miss")
    v10_seed.auth(uname, tid)

    r = await v10_seed.world.client.post("/api/inbox/conversations/ghost-404/read")
    assert r.status_code == 404, r.text


# ══════════════════════════════════════════════════════════════════════════
# §C — [هـ] عقد الاستجابة الموحد (ok shape)
# ══════════════════════════════════════════════════════════════════════════


async def test_ok_envelope_shape_exact(v10_seed):
    """unwrapApi يفكّ data ويجاهل المفاتيح الشقيقة — لذا الغلاف يجب أن يكون
    {success, data} حصرًا: لا «unread» خارج data (خطأ v4 §2.2 السابق) ولا
    مفاتيح إضافية جديدة في مسارات هذه الجولة."""
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="Shape")
    v10_seed.auth(uname, tid)
    await _seed_conversation(v10_seed, tid, "conv-shape", unread=1)
    c = v10_seed.world.client

    r = await c.post("/api/templates", json={"name": "شكل", "text": "نص"})
    assert r.status_code == 200
    assert set(r.json().keys()) == {"success", "data"}, r.json()
    assert r.json()["success"] is True

    r = await c.post("/api/inbox/conversations/conv-shape/read")
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) == {"success", "data"}, body
    assert body["success"] is True
    assert isinstance(body["data"], dict) and set(body["data"].keys()) == {"unread"}
    assert isinstance(body["data"]["unread"], int)
