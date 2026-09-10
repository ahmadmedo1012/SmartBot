"""v17-E-B3 — صدق الخلفية: رسائل عربية ثابتة + مستهلك تفضيلات الإشعارات.

Gates (plan v17 §E-B3):
  (أ) POST /api/facebook/test و PUT /api/facebook/settings — استثناء داخلي
      (monkeypatch) لا يمرر str(e) الإنجليزية للمستخدم: detail عربي ثابت
      والتفاصيل التقنية إلى log.warning (D9 #3).
  (ب) POST /api/onboarding/test-connection — نفس العقد.
  (ج) push_notification يستشعر NotificationPreference (D5-F3): مستخدم أوقف
      النوع لا يُنشأ له صف إشعار (skip + سجل)، ومن فعّله يستلم.
"""

from __future__ import annotations

# ── أدوات الزرع ──────────────────────────────────────────────────────────────


async def _seed_fb_state(world, tenant_id: int) -> None:
    """صفحة + توكن مشفّر في BotState — نفس مخزن /connect الحقيقي."""
    from _services import encrypt_token
    from models import BotState

    async with world.sf() as db:
        db.add(BotState(tenant_id=tenant_id, key="fb_page_id", value="123456789"))
        db.add(BotState(tenant_id=tenant_id, key="fb_access_token",
                        value=encrypt_token("EAAx-test-token")))
        await db.commit()


def _english_boom(message: str):
    async def _raise(*_a, **_k):
        raise RuntimeError(message)
    return _raise


# ── (أ) فيسبوك: الاستثناء الداخلي يعيد عربية ثابتة ──────────────────────────


async def test_facebook_test_connection_fixed_arabic_error(v10_seed, monkeypatch):
    """D9 #3 (facebook_routes:274): Graph/الشبكة ترمي إنجليزية → detail عربي
    ثابت، والنص التقني لا يظهر في أي جزء من الاستجابة."""
    import fb_client

    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="E-B3-FB-TEST")
    await _seed_fb_state(v10_seed.world, tid)
    v10_seed.auth(ua, tid)

    monkeypatch.setattr(
        fb_client.FBClient, "get_page_fan_count",
        _english_boom("(#190) Access token does not have permission — English raw error"),
    )

    r = await v10_seed.world.client.post("/api/facebook/test")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["connected"] is False
    assert data["error"] == "فشل الاتصال بفيسبوك — تحقق من رمز الوصول ومعرف الصفحة"
    # لا أثر للنص الإنجليزي في أي مكان من الحمولة (وليس detail فقط)
    assert "English raw error" not in r.text
    assert "Access token does not have permission" not in r.text


async def test_facebook_settings_webhook_fixed_arabic_error(v10_seed, monkeypatch):
    """D9 #3 (facebook_routes:202): فشل اشتراك الويبهوك → حقل webhook.error
    عربي ثابت بدل str(e) الإنجليزية."""
    import fb_client

    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="E-B3-FB-SAVE")
    v10_seed.auth(ua, tid)

    monkeypatch.setattr(
        fb_client.FBClient, "subscribe_page_webhooks",
        _english_boom("Graph returned HTTP 500 (#2) Service temporarily unavailable"),
    )

    r = await v10_seed.world.client.put("/api/facebook/settings", json={
        "page_id": "123456789", "access_token": "EAAx-test-token",
        "subscribe_webhook": True,
    })
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["ok"] is True
    assert data["webhook"] == {
        "error": "تعذر تفعيل الويبهوك — راجع صلاحيات التطبيق في developers.facebook.com ثم أعد الربط"}
    assert "Service temporarily unavailable" not in r.text
    assert "Graph returned" not in r.text


# ── (ب) المعالج: نفس العقد ──────────────────────────────────────────────────


async def test_onboarding_test_connection_fixed_arabic_error(v10_seed, monkeypatch):
    """D9 #3 (onboarding.py:225): استثناء الشبكة داخل التحقق → رسالة عربية
    ثابتة (كانت `تعذر الاتصال بفيسبوك: {str(e)}`)."""
    import httpx

    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="E-B3-OB")
    v10_seed.auth(ua, tid)

    monkeypatch.setattr(
        httpx.AsyncClient, "get",
        _english_boom("All connection attempts failed — English network error"),
    )

    r = await v10_seed.world.client.post("/api/onboarding/test-connection", json={
        "page_id": "123456789", "access_token": "EAAx-test-token",
    })
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["connected"] is False
    assert data["error"] == "تعذر الاتصال بفيسبوك — تحقق من اتصالك بالإنترنت ثم أعد المحاولة"
    assert "All connection attempts failed" not in r.text
    assert "English network error" not in r.text


# ── (ج) push_notification يستشعر NotificationPreference (D5-F3) ─────────────


async def test_push_notification_off_skips_and_on_delivers(v10_seed):
    """المسار الجوهري: التفضيل يُحفظ من نقطة الحفظ الحقيقية (PUT
    /api/notifications/settings — نفس الصف الذي تكتبه الصفحة) ثم:
    off → push_notification يعيد None ولا يُنشأ صف · on → الصف يُنشأ."""
    from models import Notification
    from routers.notifications import push_notification
    from sqlalchemy import select

    world = v10_seed.world
    ua, tid, uid = await v10_seed.tenant_user(role="admin", tenant_name="E-B3-NP")
    v10_seed.auth(ua, tid)
    c = world.client

    # 1) حفظ التفضيل عبر المسار الحقيقي (عقد الصفحة نفسها)
    r = await c.put("/api/notifications/settings",
                    json={"preferences": {"payment_alerts": False}})
    assert r.status_code == 200, r.text

    # 2) off → لا تسليم: يعيد None، ولا صف إشعار
    async with world.sf() as db:
        n = await push_notification(db, tid, title="تم تأكيد الدفع وتفعيل الاشتراك",
                                    body="...", type_="payment", user_id=uid)
        assert n is None, "payment_alerts=off يجب أن يعني عدم إنشاء صف الإشعار"
        await db.commit()
        rows = (await db.execute(
            select(Notification).where(Notification.tenant_id == tid)
        )).scalars().all()
    assert rows == [], rows

    # 3) on → التسليم يعود
    r = await c.put("/api/notifications/settings",
                    json={"preferences": {"payment_alerts": True}})
    assert r.status_code == 200, r.text
    async with world.sf() as db:
        n = await push_notification(db, tid, title="تم تأكيد الدفع وتفعيل الاشتراك",
                                    body="...", type_="payment", user_id=uid)
        assert n is not None
        await db.commit()
        rows = (await db.execute(
            select(Notification).where(Notification.tenant_id == tid)
        )).scalars().all()
    assert len(rows) == 1, rows
    assert rows[0].type == "payment"


async def test_push_notification_gate_boundaries(v10_seed):
    """حدود البوابة كما هي موثقة (v17-E-B3-report §3):
    بلا صف تفضيل → الافتراضي (payment_alerts=on) يُسلّم · نوع بلا مفتاح
    تحكم (support) يُسلّم دائماً · بث المستأجر (user_id=None) يُسلّم ·
    تفضيل مستخدم آخر لا يحجب مستخدمًا آخر."""
    from models import Notification, NotificationPreference
    from routers.notifications import push_notification
    from sqlalchemy import select

    world = v10_seed.world
    ua, tid, uid = await v10_seed.tenant_user(role="admin", tenant_name="E-B3-GB")
    # مستخدم ثانٍ في مستأجر آخر — تفضيله لا يعبر المستأجرين
    ub, tid_b, uid_b = await v10_seed.tenant_user(role="admin", tenant_name="E-B3-GB2")

    async with world.sf() as db:
        db.add(NotificationPreference(user_id=uid_b, tenant_id=tid_b,
                                       preferences={"payment_alerts": False}))
        await db.commit()

    async with world.sf() as db:
        # لا صف تفضيل → الافتراضي on → تسليم
        n = await push_notification(db, tid, title="t", type_="payment", user_id=uid)
        assert n is not None
        # نوع بلا مفتاح تحكم في صفحة الإعدادات → تسليم غير مقيد
        n2 = await push_notification(db, tid, title="رد الدعم", type_="support",
                                     user_id=uid)
        assert n2 is not None
        # بث المستأجر (الحد الموثق) → تسليم
        n3 = await push_notification(db, tid, title="تم إرسال حملة",
                                     type_="marketing", user_id=None)
        assert n3 is not None
        await db.commit()
        mine = (await db.execute(
            select(Notification).where(Notification.tenant_id == tid)
        )).scalars().all()
    assert len(mine) == 3, mine

    # تفضيل مستخدم B (off) لا يحجب إشعارًا موجّهًا لمستخدم A
    async with world.sf() as db:
        n4 = await push_notification(db, tid, title="t", type_="payment", user_id=uid)
        assert n4 is not None
        # والعكس: إشعار موجّه لـ B (off) لا يُنشأ
        n5 = await push_notification(db, tid_b, title="t", type_="payment", user_id=uid_b)
        assert n5 is None
        await db.commit()
