"""v22-D10/D6 — FIX-G: two-way support loop + ticket hygiene + /admin shell truth.

Closes the W1-D10 findings (see wave1-findings/W1-D10-support.md):
  BUG-1 (P1)  admin reply path unreachable → POST /api/admin/support/tickets/{id}/reply
  BUG-3 (P2)  no rate limit on ticket creation → 10/hour per user, Arabic 429
  BUG-4 (P3)  closed-ticket reply silently reopens → explicit 400
  BUG-5 (P3)  length caps unenforced → subject ≤ 200 / body ≤ 2000 → 422
  BUG-6 (P2)  admin queue hides body/thread → replies[] ride on queue rows
and the W1-D6 #7-م1 UX finding:
  /api/me exposes is_platform_admin (non-sensitive boolean) for the /admin
  shell guard (frontend UX only — the API 403s stay the security layer).

All flows run through the real app (runner.app) + real guards
(require_platform_admin / CSRF middleware) — no row injection to fake
authority (the W1-D10 critique of the old test_phase_d_pages.py L249-260
pattern). The ONLY direct-DB seed below is data setup (tenants/tickets),
plus one delegated-admin flag flip used to pin the /api/me derivation —
it never grants route access by itself.
"""
from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
os.environ.setdefault("DEBUG", "True")

import pytest
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


# ── helpers ──────────────────────────────────────────────────────────────────


async def _seed_ticket(sf, *, tenant_id, user_id, subject="موضوع", body="نص التذكرة",
                       status="open", email="owner@test.ly"):
    from models import SupportTicket

    async with sf() as db:
        t = SupportTicket(tenant_id=tenant_id, user_id=user_id, email=email,
                          subject=subject, body=body, priority="high", status=status)
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t.id


async def _ticket_status(sf, ticket_id: int) -> str:
    from models import SupportTicket

    async with sf() as db:
        t = await db.get(SupportTicket, ticket_id)
        return t.status


async def _replies(sf, ticket_id: int) -> list:
    from models import SupportTicketReply

    async with sf() as db:
        rows = await db.execute(
            select(SupportTicketReply).where(SupportTicketReply.ticket_id == ticket_id)
            .order_by(SupportTicketReply.id))
        return rows.scalars().all()


async def _notifications(sf, tenant_id: int, title_contains: str = "") -> list:
    from models import Notification

    async with sf() as db:
        rows = await db.execute(
            select(Notification).where(Notification.tenant_id == tenant_id)
            .order_by(Notification.id))
        items = rows.scalars().all()
        return [n for n in items if title_contains in (n.title or "")]


# ── (a) BUG-1: the platform-admin reply route ────────────────────────────────


async def test_admin_reply_requires_platform_admin(v10_seed):
    """[BUG-1] أدمن مستأجر عادي (role=admin!) = 403 عربي؛ بلا جلسة = 401 —
    الحارس الحقيقي منصة-only حتى مع مسار الرد الجديد."""
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-G-403")
    ticket_id = await _seed_ticket(v10_seed.world.sf, tenant_id=tid, user_id=uid)
    c = v10_seed.world.client

    v10_seed.auth(uname, tid)
    r = await c.post(f"/api/admin/support/tickets/{ticket_id}/reply", json={"message": "محاولة رد"})
    assert r.status_code == 403, r.text
    assert "مسؤول المنصة" in r.json()["detail"]
    assert await _ticket_status(v10_seed.world.sf, ticket_id) == "open"
    assert await _replies(v10_seed.world.sf, ticket_id) == []

    v10_seed.logout()
    r = await c.post(f"/api/admin/support/tickets/{ticket_id}/reply", json={"message": "محاولة رد"})
    assert r.status_code == 401, r.text


async def test_admin_reply_two_way_loop_with_notification_and_status(v10_seed):
    """[BUG-1] الحلقة كاملة: أدمن المنصة يرد (is_admin=true) → الحالة
    pending «بانتظار العميل» + إشعار داخل التطبيق لصاحب التذكرة + الرد
    ظاهر في طابور المنصة (BUG-6) وفي خيط العميل. ثم رد العميل يعيدها
    open (عقد مسار المستأجر كما هو)."""
    world = v10_seed.world
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-G-Loop")
    ticket_id = await _seed_ticket(world.sf, tenant_id=tid, user_id=uid,
                                   subject="البوت لا يرد", body="منذ الصباح بلا ردود")

    # العميل يرد أولاً (سياق المحادثة الذي يجب أن يراه الأدمن)
    v10_seed.auth(uname, tid)
    r = await world.client.post(f"/api/support/tickets/{ticket_id}/reply",
                                json={"message": "أرفقت لقطة شاشة"})
    assert r.status_code == 200, r.text

    # أدمن المنصة يرد عبر المسار الجديد
    pname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(pname, 0)
    admin_msg = "جاري فحص الحساب الآن — سنعاود التواصل خلال ساعات"
    r = await world.client.post(f"/api/admin/support/tickets/{ticket_id}/reply",
                                json={"message": admin_msg})
    assert r.status_code == 200, r.text
    body = r.json()["data"]
    assert body["is_admin"] is True
    assert body["status"] == "pending"

    # الصف: is_admin=true + رسالة الأدمن
    replies = await _replies(world.sf, ticket_id)
    assert len(replies) == 2
    admin_rows = [x for x in replies if x.is_admin]
    assert len(admin_rows) == 1 and admin_rows[0].message == admin_msg
    assert admin_rows[0].user_id == _puid

    # انتقال الحالة: open → pending (رد الدعم)
    assert await _ticket_status(world.sf, ticket_id) == "pending"

    # إشعار داخل التطبيق لصاحب التذكرة (عنوان مسار المستأجر نفسه)
    notifs = await _notifications(world.sf, tid, f"رد الدعم على تذكرتك #{ticket_id}")
    assert len(notifs) == 1
    assert notifs[0].user_id == uid
    assert notifs[0].type == "support"
    assert notifs[0].link == "/dashboard/support"

    # الطابور يعكس الخيط كاملاً (BUG-6) — رد العميل ورد الأدمن معاً
    r = await world.client.get("/api/admin/support/tickets")
    assert r.status_code == 200
    item = next(i for i in r.json()["data"]["items"] if i["id"] == ticket_id)
    assert item["body"] == "منذ الصباح بلا ردود"
    assert [x["is_admin"] for x in item["replies"]] == [False, True]
    assert item["status"] == "pending"

    # العميل يرى رد الدعم في خيطه (الوعد «خلال 24 ساعة» أصبح له مسار)
    v10_seed.auth(uname, tid)
    r = await world.client.get(f"/api/support/tickets/{ticket_id}")
    assert r.status_code == 200
    assert any(x["message"] == admin_msg and x["is_admin"] for x in r.json()["data"]["replies"])

    # ورد العميل التالي يعيد التذكرة open (بانتظار الدعم) — عقد الحالات كما هو
    r = await world.client.post(f"/api/support/tickets/{ticket_id}/reply",
                                json={"message": "شكراً — بانتظاركم"})
    assert r.status_code == 200
    assert await _ticket_status(world.sf, ticket_id) == "open"


async def test_admin_reply_validation_and_closed_contract(v10_seed):
    """[BUG-1/BUG-4] رسالة قصيرة 400 · رسالة ضخمة 422 · تذكرة مجهولة 404 ·
    تذكرة مغلقة 400 (العقد: المغلقة غير قابلة للرد — التذكرة الجديدة هي
    مسار العودة، لا إعادة فتح صامتة)."""
    world = v10_seed.world
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-G-Val")
    open_id = await _seed_ticket(world.sf, tenant_id=tid, user_id=uid, subject="مفتوحة")
    closed_id = await _seed_ticket(world.sf, tenant_id=tid, user_id=uid,
                                   subject="مغلقة", status="closed")

    pname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(pname, 0)
    c = world.client

    r = await c.post(f"/api/admin/support/tickets/{open_id}/reply", json={"message": "م"})
    assert r.status_code == 400, r.text
    assert "الرسالة مطلوبة" in r.json()["detail"]

    r = await c.post(f"/api/admin/support/tickets/{open_id}/reply",
                     json={"message": "x" * 2001})
    assert r.status_code == 422, r.text

    r = await c.post("/api/admin/support/tickets/999999/reply", json={"message": "رد"})
    assert r.status_code == 404, r.text
    assert "غير موجودة" in r.json()["detail"]

    r = await c.post(f"/api/admin/support/tickets/{closed_id}/reply", json={"message": "رد متأخر"})
    assert r.status_code == 400, r.text
    assert "مغلقة" in r.json()["detail"]
    # لا صف رد ولا تغيير حالة — المغلقة محصّنة من كلا الطرفين
    assert await _replies(world.sf, closed_id) == []
    assert await _ticket_status(world.sf, closed_id) == "closed"


async def test_admin_reply_requires_csrf_token(v10_seed):
    """[BUG-1] مسار تحوّل عادي (ليس معفى): مع كوكي CSRF حاضر، رأس فارئ/خاطئ
    = 403 — والرأس المطابق يمر (double-submit v12-E3.3)."""
    world = v10_seed.world
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-G-Csrf")
    ticket_id = await _seed_ticket(world.sf, tenant_id=tid, user_id=uid)

    pname, _ptid, _puid = await v10_seed.platform_admin()
    await v10_seed.login(pname)          # جلسة حقيقية
    c = world.client
    await c.get("/api/plans")            # يزرع كوكي csrf_token
    token = c.cookies.get("csrf_token")
    assert token

    r = await c.post(f"/api/admin/support/tickets/{ticket_id}/reply",
                     json={"message": "رد بدون حماية"}, headers={"X-CSRF-Token": ""})
    assert r.status_code == 403, r.text
    assert (await _replies(world.sf, ticket_id)) == []

    r = await c.post(f"/api/admin/support/tickets/{ticket_id}/reply",
                     json={"message": "رد محمي بالحماية الثنائية"},
                     headers={"X-CSRF-Token": token})
    assert r.status_code == 200, r.text


# ── (b) BUG-3: rate limit on ticket creation ─────────────────────────────────


async def test_ticket_creation_rate_limit(v10_seed):
    """[BUG-3] 10 إنشاءات في الساعة لكل مستخدم: العاشرة 200 والحادية عشرة
    429 عربي — والمستخدم الآخر غير متأثر (حد فردي لا IP/مستأجر)."""
    world = v10_seed.world
    ua, ta, _ua_id = await v10_seed.tenant_user(tenant_name="T-G-RL")
    ub, tb, _ub_id = await v10_seed.tenant_user(tenant_name="T-G-RL2")

    v10_seed.auth(ua, ta)
    c = world.client
    payload = {"subject": "م", "message": "رسالة كافية للاختبار", "email": ""}
    for i in range(10):
        r = await c.post("/api/support/tickets", json={**payload, "subject": f"تذكرة {i}"})
        assert r.status_code == 200, f"#{i}: {r.status_code} {r.text[:120]}"
    r = await c.post("/api/support/tickets", json={**payload, "subject": "الحادية عشرة"})
    assert r.status_code == 429, r.text
    assert "كبيرًا" in r.json()["detail"] or "كبيراً" in r.json()["detail"]

    # مستخدم آخر (نفس قاعدة الاختبار) غير متأثر — الحد لكل مستخدم
    v10_seed.auth(ub, tb)
    r = await c.post("/api/support/tickets", json=payload)
    assert r.status_code == 200, r.text


# ── (c) BUG-4: customer reply on a closed ticket ─────────────────────────────


async def test_customer_reply_on_closed_ticket_rejected(v10_seed):
    """[BUG-4] كان الرد يعيد فتح التذكرة بصمت (closed → open). الآن: 400
    «التذكرة مغلقة — افتح تذكرة جديدة»، الحالة تبقى closed ولا صف رد —
    الـ API يقول نفس حقيقة الواجهة (التي تخفي مربع الرد وتقول «أرسل
    طلباً جديداً»)."""
    world = v10_seed.world
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-G-Closed")
    ticket_id = await _seed_ticket(world.sf, tenant_id=tid, user_id=uid)

    v10_seed.auth(uname, tid)
    c = world.client
    r = await c.post(f"/api/support/tickets/{ticket_id}/close")
    assert r.status_code == 200, r.text

    r = await c.post(f"/api/support/tickets/{ticket_id}/reply",
                     json={"message": "محاولة إعادة فتح بالرد"})
    assert r.status_code == 400, r.text
    assert "مغلقة" in r.json()["detail"]
    assert await _ticket_status(world.sf, ticket_id) == "closed"
    assert await _replies(world.sf, ticket_id) == []

    # طابور المنصة يرى نفس الحقيقة (لا انقسام عقد بين الطرفين)
    pname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(pname, 0)
    r = await c.get("/api/admin/support/tickets?status=closed")
    assert any(i["id"] == ticket_id for i in r.json()["data"]["items"])


# ── (d) BUG-5: length caps with honest 422s ──────────────────────────────────


async def test_ticket_length_caps(v10_seed):
    """[BUG-5] موضوع 201 حرفاً = 422 (كان قصاً صامتاً إلى 200)، رسالة 2001
    حرف = 422 (كانت تُخزَّن بلا سقف) — والحدود نفسها (200/2000) تمر 200."""
    world = v10_seed.world
    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="T-G-Caps")
    v10_seed.auth(uname, tid)
    c = world.client

    r = await c.post("/api/support/tickets", json={
        "subject": "ع" * 201, "message": "رسالة كافية للاختبار الحقيقي", "email": ""})
    assert r.status_code == 422, r.text
    assert "200" in r.json()["detail"]

    r = await c.post("/api/support/tickets", json={
        "subject": "موضوع", "message": "ر" * 2001, "email": ""})
    assert r.status_code == 422, r.text
    assert "2000" in r.json()["detail"]

    # حدود القبول نفسها
    r = await c.post("/api/support/tickets", json={
        "subject": "ع" * 200, "message": "ر" * 2000, "email": "caps@test.ly"})
    assert r.status_code == 200, r.text

    from models import SupportTicket
    async with world.sf() as db:
        t = (await db.execute(select(SupportTicket).where(
            SupportTicket.tenant_id == tid))).scalars().one()
        assert len(t.subject) == 200 and len(t.body) == 2000


async def test_customer_reply_length_cap(v10_seed):
    """[BUG-5 امتداد] رد العميل الطويل = 422 (نفس حد رد الدعم — النص Text
    بلا سقف DB-side فالحد في المسار)."""
    world = v10_seed.world
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-G-RCap")
    ticket_id = await _seed_ticket(world.sf, tenant_id=tid, user_id=uid)

    v10_seed.auth(uname, tid)
    r = await world.client.post(f"/api/support/tickets/{ticket_id}/reply",
                                json={"message": "د" * 2001})
    assert r.status_code == 422, r.text


# ── (e) D6: /api/me exposes is_platform_admin ────────────────────────────────


async def test_api_me_exposes_is_platform_admin(v10_seed):
    """[W1-D6 #7-م1] البولياني غير الحساس لحراسة /admin الواجهية: أدمن
    مستأجر false · أدمن المنصة (tenant 0) true · المفوَّض (العلم مع مستأجر)
    true — نفس دالة الحرس الخلفي حرفياً (is_platform_admin()) فلا يمكن أن
    يختلف الحراس الواجهي والخلفي."""
    world = v10_seed.world
    c = world.client

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="T-G-Me")
    v10_seed.auth(uname, tid)
    r = await c.get("/api/me")
    assert r.status_code == 200
    assert r.json()["data"]["user"]["is_platform_admin"] is False

    pname, _ptid, _puid = await v10_seed.platform_admin()
    v10_seed.auth(pname, 0)
    r = await c.get("/api/me")
    assert r.status_code == 200
    assert r.json()["data"]["user"]["is_platform_admin"] is True

    # المفوَّض: علم is_platform_admin مع tenant_id ≠ 0 — تعديل البيانات هنا
    # زرع حالة اختبار للاشتقاق فقط (PATCH /api/admin/platform/users هو
    # المسار الحقيقي للتفويض)؛ لا يمنح هذا الاختبار أي وصول مسار.
    from models import User
    async with world.sf() as db:
        u = (await db.execute(select(User).where(User.username == uname))).scalar_one()
        u.is_platform_admin = True
        await db.commit()
    v10_seed.auth(uname, tid)
    r = await c.get("/api/me")
    assert r.json()["data"]["user"]["is_platform_admin"] is True


# ── regression guard: the tenant reply route keeps its own contract ──────────


async def test_tenant_reply_route_keeps_contract_for_owner(v10_seed):
    """الانحدار: رد المالك على تذكرته المفتوحة كما كان — is_admin=false،
    الحالة open، ولا إشعار لأحد (سلوك ما قبل الإصلاح، محفوظ)."""
    world = v10_seed.world
    uname, tid, uid = await v10_seed.tenant_user(tenant_name="T-G-Regr")
    ticket_id = await _seed_ticket(world.sf, tenant_id=tid, user_id=uid)

    v10_seed.auth(uname, tid)
    r = await world.client.post(f"/api/support/tickets/{ticket_id}/reply",
                                json={"message": "رد المالك"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["is_admin"] is False
    assert await _ticket_status(world.sf, ticket_id) == "open"
    assert await _notifications(world.sf, tid) == []
