from __future__ import annotations
"""
Phase D (= الخطة 4) — بوابة الخروج: صفحات Dashboard المفقودة

Exit-gate evidence per PLAN-REBUILD-V2.md §4:
  4.2 Notifications: نظام خلفي حقيقي (وليس useState) — قائمة + غير مقروء + تعليم + عزل مستأجرين
  4.3 Support: تذاكر حقيقية (إنشاء/قائمة/رد/إغلاق + أولويات low|medium|high|urgent)
  4.4 Marketing: حملات (إنشاء/استهداف/إرسال/إحصاءات)
  4.5 Ads: placeholder "قريباً" (يُتحقق في بناء الواجهة)
كل مسارات الواجهة الثلاثة (settings/info/ticket/campaigns) تعمل فعلياً.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import asyncio
from datetime import timedelta

from sqlalchemy import select

from _utils import utcnow


async def _make_app_fixture():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import StaticPool
    from models import Base
    from database import get_db
    from runner import app

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    return app, session_factory, test_engine


async def _teardown(fixture):
    from database import get_db
    app, _sf, test_engine = fixture
    app.dependency_overrides.pop(get_db, None)
    await test_engine.dispose()


async def _seed_two_tenants(fixture):
    """Two tenants, each with an admin user — for isolation checks."""
    from models import Tenant, User
    from routers.auth import make_token
    from _hash import hash_password
    app, sf, _te = fixture

    async with sf() as db:
        t_a = Tenant(name="Tenant-A", subscription_status="PAID", is_active=True)
        t_b = Tenant(name="Tenant-B", subscription_status="PAID", is_active=True)
        db.add_all([t_a, t_b])
        await db.flush()
        u_a = User(username="user_a", email="a@test.ly", password_hash=hash_password("passA12345"),
                   tenant_id=t_a.id, role="admin")
        u_b = User(username="user_b", email="b@test.ly", password_hash=hash_password("passB12345"),
                   tenant_id=t_b.id, role="admin")
        db.add_all([u_a, u_b])
        await db.commit()
        ids = (t_a.id, t_b.id)

    import httpx
    transport = httpx.ASGITransport(app=app)

    async def client_for(username: str, tid: int) -> httpx.AsyncClient:
        c = httpx.AsyncClient(transport=transport, base_url="http://test")
        c.cookies.set("token", make_token(username, tid))
        return c

    return client_for, ids


# ── 4.2 Notifications ────────────────────────────────────────────────────────

async def test_notifications_feed_and_read_flow():
    fixture = await _make_app_fixture()
    try:
        from models import Notification
        client_for, (tid_a, tid_b) = await _seed_two_tenants(fixture)
        app, sf, _te = fixture

        # إشعارات للمستأجرين A و B (A: 3 — اثنان غير مقروءين، B: 1)
        async with sf() as db:
            db.add_all([
                Notification(tenant_id=tid_a, type="payment", title="تأكيد دفع", body="باقة مميزة", read=True),
                Notification(tenant_id=tid_a, type="system", title="تحديث", body="صيانة مجدولة"),
                Notification(tenant_id=tid_a, type="support", title="رد الدعم", body="تم حل المشكلة", link="/dashboard/support"),
                Notification(tenant_id=tid_b, type="payment", title="دفع B", body=""),
            ])
            await db.commit()

        client = await client_for("user_a", tid_a)
        r = await client.get("/api/notifications")
        assert r.status_code == 200, r.text
        body = r.json()
        titles = [n["title"] for n in body["data"]["items"]]  # v4 §2.2 shape
        assert len(titles) == 3, titles
        assert "دفع B" not in titles, "تسريب: إشعار مستأجر B ظهر لمستأجر A"
        assert body["data"]["unread"] == 2  # v4 §2.2: unread inside data

        # تعليم إشعار واحد كمقروء
        target = next(n for n in body["data"]["items"] if n["title"] == "تحديث")  # v4 §2.2
        r = await client.post(f"/api/notifications/{target['id']}/read")
        assert r.status_code == 200
        r = await client.get("/api/notifications")
        assert r.json()["data"]["unread"] == 1  # v4 §2.2

        # read-all
        r = await client.post("/api/notifications/read-all")
        assert r.status_code == 200
        r = await client.get("/api/notifications")
        assert r.json()["data"]["unread"] == 0  # v4 §2.2
        await client.aclose()
    finally:
        await _teardown(fixture)


async def test_notification_from_payment_approval():
    """موافقة الأدمن على دفعة → إشعار حقيقي للمستأجر (ربط §4.2 بـ§2)."""
    fixture = await _make_app_fixture()
    try:
        from models import SubscriptionPlan, SubscriptionPayment, Notification
        client_for, (tid_a, _tid_b) = await _seed_two_tenants(fixture)
        app, sf, _te = fixture
        async with sf() as db:
            plan = SubscriptionPlan(name="Basic", name_ar="أساسي", price=50.0, period_days=30, is_active=True)
            db.add(plan)
            await db.flush()
            u = (await db.execute(select(__import__("models", fromlist=["User"]).User).where(
                __import__("models", fromlist=["User"]).User.username == "user_a"))).scalar_one()
            sp = SubscriptionPayment(user_id=u.id, tenant_id=tid_a, phone="0912345678",
                                     amount=50, provider="liyana", plan_id=plan.id,
                                     plan_name="أساسي", status="pending")
            db.add(sp)
            await db.commit()
            sp_id, plan_id = sp.id, plan.id

        client = await client_for("user_a", tid_a)
        r = await client.post("/api/admin/subscriptions", json={"id": sp_id, "status": "verified"})
        assert r.status_code == 200, r.text

        r = await client.get("/api/notifications")
        titles = [n["title"] for n in r.json()["data"]["items"]]  # v4 §2.2
        assert any("تأكيد الدفع" in t for t in titles), titles
        assert r.json()["data"]["unread"] >= 1  # v4 §2.2
        await client.aclose()
    finally:
        await _teardown(fixture)


async def test_notification_settings_roundtrip():
    """عقد الواجهة: GET/PUT /api/notifications/settings → {data:{preferences}}."""
    fixture = await _make_app_fixture()
    try:
        client_for, (tid_a, _tid_b) = await _seed_two_tenants(fixture)
        client = await client_for("user_a", tid_a)

        r = await client.get("/api/notifications/settings")
        assert r.status_code == 200
        prefs = r.json()["data"]["preferences"]
        assert prefs["new_comments"] is True  # افتراضي

        r = await client.put("/api/notifications/settings", json={"preferences": {"new_comments": False, "payment_alerts": False}})
        assert r.status_code == 200, r.text

        r = await client.get("/api/notifications/settings")
        prefs = r.json()["data"]["preferences"]
        assert prefs["new_comments"] is False
        assert prefs["payment_alerts"] is False
        assert prefs["new_messages"] is True  # غير الممسوس يبقى
        await client.aclose()
    finally:
        await _teardown(fixture)


# ── 4.3 Support tickets ──────────────────────────────────────────────────────

async def test_support_ticket_lifecycle():
    """إنشاء (عقد الواجهة) → قائمة → رد الأدمن → رد المستخدم → إغلاق."""
    fixture = await _make_app_fixture()
    try:
        client_for, (tid_a, _tid_b) = await _seed_two_tenants(fixture)
        client = await client_for("user_a", tid_a)

        # عقد الواجهة: POST /api/support/ticket {subject, message, email}
        r = await client.post("/api/support/ticket", json={
            "subject": "مشكلة في الردود", "message": "البوت لا يرد على التعليقات منذ الصباح",
            "email": "a@test.ly", "priority": "high",
        })
        assert r.status_code == 200, r.text
        ticket_id = r.json()["data"]["id"]
        assert ticket_id > 0
        assert r.json()["data"]["message"]

        # GET /api/support/info (عقد الواجهة)
        r = await client.get("/api/support/info")
        assert r.status_code == 200
        assert "email" in r.json()["data"]

        # قائمة تذاكر المستأجر
        r = await client.get("/api/support/tickets")
        assert r.status_code == 200
        tickets = r.json()["data"]
        assert len(tickets) == 1
        assert tickets[0]["priority"] == "high"
        assert tickets[0]["status"] == "open"

        # تفاصيل بدون ردود بعد
        r = await client.get(f"/api/support/tickets/{ticket_id}")
        assert r.status_code == 200
        assert r.json()["data"]["replies"] == []

        # رد المستخدم
        r = await client.post(f"/api/support/tickets/{ticket_id}/reply", json={"message": "أرفقت لقطة شاشة للمشكلة"})
        assert r.status_code == 200
        assert r.json()["data"]["is_admin"] is False

        # رد "أدمن" — مستخدم أدمن من نفس المستأجر (زميل) وليس صاحب التذكرة:
        from models import User
        from routers.auth import make_token
        app, sf, _te = fixture
        async with sf() as db:
            u_admin2 = User(username="admin2", email="a2@test.ly", password_hash="x",
                            tenant_id=tid_a, role="admin")
            db.add(u_admin2)
            await db.commit()
        import httpx
        c2 = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        c2.cookies.set("token", make_token("admin2", tid_a))
        r = await c2.post(f"/api/support/tickets/{ticket_id}/reply", json={"message": "جاري فحص الحساب الآن"})
        assert r.status_code == 200
        assert r.json()["data"]["is_admin"] is True

        # التذكرة صارت pending بانتظار رد المستخدم + إشعار لصاحبها
        r = await client.get(f"/api/support/tickets/{ticket_id}")
        assert r.json()["data"]["status"] == "pending"
        replies = r.json()["data"]["replies"]
        assert len(replies) == 2
        assert any(x["is_admin"] for x in replies)

        r = await client.get("/api/notifications")
        assert any("رد الدعم" in n["title"] for n in r.json()["data"]["items"])  # v4 §2.2

        # إغلاق (أدمن)
        r = await c2.post(f"/api/support/tickets/{ticket_id}/close")
        assert r.status_code == 200
        r = await client.get(f"/api/support/tickets/{ticket_id}")
        assert r.json()["data"]["status"] == "closed"
        await c2.aclose()
        await client.aclose()
    finally:
        await _teardown(fixture)


async def test_support_ticket_validation_and_isolation():
    fixture = await _make_app_fixture()
    try:
        client_for, (tid_a, tid_b) = await _seed_two_tenants(fixture)
        client = await client_for("user_a", tid_a)

        # رسالة قصيرة → 400
        r = await client.post("/api/support/ticket", json={"subject": "x", "message": "قصير", "email": ""})
        assert r.status_code == 400
        # أولوية غير صالحة → 400
        r = await client.post("/api/support/ticket", json={"subject": "x", "message": "مشكلة حقيقية هنا", "priority": "extreme"})
        assert r.status_code == 400
        # إنشاء صالح
        r = await client.post("/api/support/ticket", json={"subject": "تذكرة A", "message": "وصف كافٍ للمشكلة"})
        assert r.status_code == 200
        tid = r.json()["data"]["id"]

        # مستأجر B لا يرى تذكرة A
        client_b = await client_for("user_b", tid_b)
        r = await client_b.get(f"/api/support/tickets/{tid}")
        assert r.status_code == 404
        r = await client_b.post(f"/api/support/tickets/{tid}/reply", json={"message": "تجربة تسريب"})
        assert r.status_code == 404
        await client_b.aclose()
        await client.aclose()
    finally:
        await _teardown(fixture)


# ── 4.4 Marketing campaigns ──────────────────────────────────────────────────

async def test_marketing_campaign_flow():
    """إنشاء → استهداف → إرسال → إحصاءات (مع عزل مستأجرين)."""
    fixture = await _make_app_fixture()
    try:
        from models import Subscriber
        client_for, (tid_a, tid_b) = await _seed_two_tenants(fixture)
        app, sf, _te = fixture

        # مشتركو A: 3 (واحد نشط حديثاً) | مشتركو B: 2
        async with sf() as db:
            db.add_all([
                Subscriber(tenant_id=tid_a, fb_user_id="a1"),
                Subscriber(tenant_id=tid_a, fb_user_id="a2", last_interaction_at=utcnow()),
                Subscriber(tenant_id=tid_a, fb_user_id="a3", reply_count=5),
                Subscriber(tenant_id=tid_b, fb_user_id="b1"),
                Subscriber(tenant_id=tid_b, fb_user_id="b2"),
            ])
            await db.commit()

        client = await client_for("user_a", tid_a)

        # حجم الجمهور (all = 3 لمستأجر A فقط)
        r = await client.get("/api/marketing/audience-size?audience=all")
        assert r.status_code == 200
        assert r.json()["data"]["count"] == 3, r.text

        # إنشاء حملة
        r = await client.post("/api/marketing/campaigns", json={
            "name": "خصم العيد", "message": "خصم 30% على جميع الباقات اليوم فقط", "audience": "all",
        })
        assert r.status_code == 200, r.text
        cid = r.json()["data"]["id"]
        assert r.json()["data"]["status"] == "draft"

        # جمهور غير صالح → 400
        r = await client.post("/api/marketing/campaigns", json={"name": "x", "message": "رسالة كافية", "audience": "everyone"})
        assert r.status_code == 400

        # جدولة صالحة → scheduled
        r = await client.post("/api/marketing/campaigns", json={
            "name": "حملة مجدولة", "message": "رسالة الحملة المجدولة", "audience": "active",
            "scheduled_at": "2026-12-01T10:00:00",
        })
        assert r.status_code == 200
        assert r.json()["data"]["status"] == "scheduled"

        # إرسال الحملة الأولى → sent_count=3 (مشتركو A فقط) — بدون صفحة
        # مرتبطة في بيئة الاختبار الحالة الصادقة هي queued (v4 §3.8)
        r = await client.post(f"/api/marketing/campaigns/{cid}/send")
        assert r.status_code == 200, r.text
        assert r.json()["data"]["sent_count"] == 3, r.text
        assert r.json()["data"]["status"] in ("queued", "sent"), r.text

        # إعادة الإرسال → 400
        r = await client.post(f"/api/marketing/campaigns/{cid}/send")
        assert r.status_code == 400

        # الإحصاءات
        r = await client.get(f"/api/marketing/campaigns/{cid}/stats")
        assert r.status_code == 200
        assert r.json()["data"]["sent"] == 3

        # القائمة
        r = await client.get("/api/marketing/campaigns")
        assert len(r.json()["data"]) == 2

        # عزل: مستأجر B لا يرى حملات A
        client_b = await client_for("user_b", tid_b)
        r = await client_b.get("/api/marketing/campaigns")
        assert r.json()["data"] == []
        r = await client_b.get(f"/api/marketing/campaigns/{cid}/stats")
        assert r.status_code == 404
        await client_b.aclose()

        # إشعار إرسال الحملة
        r = await client.get("/api/notifications")
        assert any("خصم العيد" in n["title"] for n in r.json()["data"]["items"])  # v4 §2.2
        await client.aclose()
    finally:
        await _teardown(fixture)


async def test_marketing_audience_segments():
    """تصفية الجمهور: active = تفاعل خلال 30 يوماً فقط."""
    fixture = await _make_app_fixture()
    try:
        from models import Subscriber
        client_for, (tid_a, _tid_b) = await _seed_two_tenants(fixture)
        app, sf, _te = fixture
        async with sf() as db:
            db.add_all([
                Subscriber(tenant_id=tid_a, fb_user_id="active1", last_interaction_at=utcnow()),
                Subscriber(tenant_id=tid_a, fb_user_id="active2", last_interaction_at=utcnow() - timedelta(days=5)),
                Subscriber(tenant_id=tid_a, fb_user_id="old1", last_interaction_at=utcnow() - timedelta(days=90)),
                Subscriber(tenant_id=tid_a, fb_user_id="never"),
            ])
            await db.commit()

        client = await client_for("user_a", tid_a)
        r = await client.get("/api/marketing/audience-size?audience=active")
        assert r.json()["data"]["count"] == 2, r.text  # active1 + active2 فقط
        r = await client.get("/api/marketing/audience-size?audience=all")
        assert r.json()["data"]["count"] == 4
        await client.aclose()
    finally:
        await _teardown(fixture)


# ── 4.3b Support info: SystemConfig wins over env (parity-v2 §3.1) ────────────
async def test_support_info_config_merge(monkeypatch):
    """GET /api/support/info: env fallbacks → SystemConfig rows win.

    (The parity-v2 audit claimed this endpoint didn't exist — a grep pitfall:
    prefix="/api/support" + @router.get("/info") doesn't match a literal
    "/api/support/info" search. This test pins the real contract.)
    """
    fixture = await _make_app_fixture()
    try:
        app, sf, _te = fixture
        from httpx import ASGITransport, AsyncClient
        from models import SystemConfig

        # 1) env fallback applies when no SystemConfig rows
        monkeypatch.setenv("SUPPORT_EMAIL", "owner@smart-link.ly")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
            r = await ac.get("/api/support/info")
            assert r.status_code == 200
            d = r.json()
            assert d["success"] is True
            assert d["data"]["email"] == "owner@smart-link.ly"
            assert d["data"]["working_hours"]  # always present

        # 2) SystemConfig row wins over env
        async with sf() as s:
            s.add(SystemConfig(key="support_email", value="real@smart-link.ly"))
            await s.commit()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
            r = await ac.get("/api/support/info")
            assert r.json()["data"]["email"] == "real@smart-link.ly"
    finally:
        await _teardown(fixture)
