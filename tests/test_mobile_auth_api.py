"""v-mobile-P0 — اختبارات طبقة المصادقة المحمولة (Bearer) للموبايل.

تغطية التغييرات الـ3 (كلها additive — الويب لا يتأثر):
1. ``POST /api/auth/token``: دخول موبايل يعيد JWT في الجسم (لا كوكيز)
   بنفس عقد بيانات المستخدم في /api/login (snapshot الاشتراك مشمول).
2. ``get_current_user``: يقبل ``Authorization: Bearer`` على كل المسارات
   المحمية (/api/me كممثل)، مع بقاء مسار الكوكي الأصلي يعمل كما هو
   (web regression داخل نفس الاختبار).
3. ``POST /api/logout`` مع Bearer يسحب الجلسة (jti في القائمة السوداء)
   فيرفض التوكن بعدها بـ401.

الميكانيكا: نفس وصفة v15_auth (_make_world) — تطبيق حقيقي + قاعدة
in-memory معزولة + AsyncClient عبر ASGITransport + استبدال get_db.
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from tests.conftest import V10_TEST_PASSWORD


async def _make_world():
    """تطبيق + محرك معزول + عميل HTTP (نفس وصفة v15_auth/_make_world).

    v-mobile إضافي: تحييد check_rate_limit (نمط app_client في
    test_v5_depth.py) — بدون هذا يستدعي وسيط المعدل جدولًا على المحرك
    المشترك static-pool من حلقة هذا الاختبار، فتتراكم حالة حلقة/قفل
    عابرة عبر حدود الملفات (فئة «database is locked» الموثقة في CI).
    اختباراتنا لا تختبر حدود المعدل — التعطيل يجعلها hermetic تمامًا.
    """
    import _rate_limit as _rl

    async def _allow(db, key, max_attempts=10, window_seconds=60):
        return True

    mp = pytest.MonkeyPatch()
    mp.setattr(_rl, "check_rate_limit", _allow)
    from database import get_db
    from models import Base
    from runner import app

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://t")
    return app, session_factory, client, test_engine, mp


@pytest.fixture
async def world():
    from database import get_db

    app, sf, client, engine, mp = await _make_world()
    try:
        yield type("W", (), {"app": app, "sf": sf, "client": client,
                             "engine": engine})()
    finally:
        mp.undo()
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await engine.dispose()


async def _register(client, username: str):
    return await client.post("/api/register", json={
        "username": username, "email": f"{username}@t.ly",
        "password": V10_TEST_PASSWORD,
    })


# ── 1) POST /api/auth/token — دخول الموبايل ──────────────────────────


async def test_auth_token_returns_jwt_in_body_no_cookie(world):
    """الدخول عبر /api/auth/token يعيد token + expiresIn + نفس عقد
    user في /api/login، وبدون Set-Cookie (المتصفح يبقى على /api/login)."""
    await _register(world.client, "mob_owner")
    r = await world.client.post("/api/auth/token", json={
        "username": "mob_owner", "password": V10_TEST_PASSWORD,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    data = body["data"]
    assert isinstance(data["token"], str) and data["token"].count(".") == 2
    assert data["expiresIn"] == 24 * 3600
    assert data["user"]["username"] == "mob_owner"
    assert "subscriptionStatus" in data["user"]
    # لا كوكي — النقل للجسم فقط
    assert "set-cookie" not in {k.lower() for k in r.headers.keys()}


async def test_auth_token_wrong_password_401_arabic(world):
    await _register(world.client, "mob_owner2")
    r = await world.client.post("/api/auth/token", json={
        "username": "mob_owner2", "password": "wrong-password",
    })
    assert r.status_code == 401
    assert r.json()["detail"] == "بيانات تسجيل الدخول غير صحيحة"


# ── 2) get_current_user — Bearer + بقاء الكوكي (web regression) ───────


async def test_bearer_token_authenticates_protected_route(world):
    """توكن من /api/auth/token يفتح /api/me عبر Authorization header —
    نفس الجسم الذي يراه مستخدم الويب."""
    await _register(world.client, "mob_bearer")
    r = await world.client.post("/api/auth/token", json={
        "username": "mob_bearer", "password": V10_TEST_PASSWORD,
    })
    token = r.json()["data"]["token"]

    r_me = await world.client.get("/api/me", headers={
        "Authorization": f"Bearer {token}"})
    assert r_me.status_code == 200, r_me.text
    user = r_me.json()["data"]["user"]
    assert user["username"] == "mob_bearer"
    assert user["onboardingCompleted"] is False


async def test_cookie_path_still_works_after_change(world):
    """web regression: مسار الكوكي الأصلي (/api/login → cookie → /api/me)
    يعمل حرفيًا كما قبل التغيير — Bearer إضافة لا استبدال."""
    await _register(world.client, "web_owner")
    r = await world.client.post("/api/login", json={
        "username": "web_owner", "password": V10_TEST_PASSWORD,
    })
    assert r.status_code == 200
    assert "set-cookie" in {k.lower() for k in r.headers.keys()}
    r_me = await world.client.get("/api/me")  # AsyncClient يحمل الكوكي تلقائيًا
    assert r_me.status_code == 200
    assert r_me.json()["data"]["user"]["username"] == "web_owner"


async def test_garbage_bearer_rejected_401(world):
    r = await world.client.get("/api/me", headers={
        "Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401


async def test_cookie_wins_over_random_bearer_header(world):
    """browser-contract pin: مستخدم بكوكي صالح + Bearer عشوائي (نمط
    CSRF-skip الموثق) → الكوكي هو المصدر؛ البيرر يتجاهَل تمامًا كما
    قبل التغيير (نفس عقد test_csrf_bearer_authorization_skips_validation
    في v12 لكن على get_current_user مباشرة)."""
    await _register(world.client, "web_cookie_priority")
    r = await world.client.post("/api/login", json={
        "username": "web_cookie_priority", "password": V10_TEST_PASSWORD,
    })
    assert r.status_code == 200
    r_me = await world.client.get("/api/me", headers={
        "Authorization": "Bearer test-cron-secret"})
    assert r_me.status_code == 200
    assert r_me.json()["data"]["user"]["username"] == "web_cookie_priority"


# ── 3) logout بالـ Bearer يسحب الجلسة ────────────────────────────────


async def test_bearer_logout_revokes_token(world):
    """logout مع Bearer يسود jti في القائمة السوداء — التوكن نفسه يُرفض
    بعدها (401 «تم إلغاء الجلسة») حتى لو لم تنتهِ صلاحيته الأصلية."""
    await _register(world.client, "mob_logout")
    r = await world.client.post("/api/auth/token", json={
        "username": "mob_logout", "password": V10_TEST_PASSWORD,
    })
    token = r.json()["data"]["token"]

    r_out = await world.client.post("/api/logout", headers={
        "Authorization": f"Bearer {token}"})
    assert r_out.status_code == 200

    r_me = await world.client.get("/api/me", headers={
        "Authorization": f"Bearer {token}"})
    assert r_me.status_code == 401
    assert r_me.json()["detail"] == "تم إلغاء الجلسة"
