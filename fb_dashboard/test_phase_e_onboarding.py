from __future__ import annotations
"""
Phase E (= الخطة 5) — بوابة الخروج: مسار Onboarding

Exit-gate evidence per PLAN-REBUILD-V2.md §5:
  5.1 الخطوة 2: ربط الصفحة مع رمز وصول مشفّر (Fernet — قابل لفكه بواسطة
       get_tenant_fb_client) + "اختبار الاتصال قبل التأكيد" (نقطة نهاية فعلية)
  5.1 الخطوة 3: الباقات من /api/plans (لا أسعار ثابتة — حارس مصدري)
  5.1 الخطوة 4: أول قاعدة تُنشأ فعلاً + اقتراح AI/قالب متاح
  5.2 جولة react-joyride: مركّبة فعلاً في AuthGuard + أهدافها موجودة في الشريط الجانبي
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import select


async def _make_fixture():
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
    import httpx
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    return app, session_factory, test_engine, client


async def _seed_user(fixture):
    from models import Tenant, User
    from routers.auth import make_token
    from _hash import hash_password
    app, sf, te, client = fixture
    async with sf() as db:
        t = Tenant(name="T-Onboard", subscription_status="UNPAID", is_active=True,
                   onboarding_completed=False)
        db.add(t)
        await db.flush()
        u = User(username="onboarder", email="ob@test.ly",
                 password_hash=hash_password("pass123456"), tenant_id=t.id, role="admin")
        db.add(u)
        await db.commit()
        tid = t.id
    client.cookies.set("token", make_token("onboarder", tid))
    return tid


# ── Step 2: connect-page with Fernet token + test-connection ────────────────

async def test_connect_page_saves_fernet_encrypted_token():
    """الرمز يُحفظ مشفراً بـ Fernet — ويمكن فكه بـ decrypt_token (ما كان كذلك مع XOR)."""
    fixture = await _make_fixture()
    try:
        app, sf, te, client = fixture
        tid = await _seed_user(fixture)

        r = await client.post("/api/onboarding/connect-page", json={
            "page_id": "1234567890", "page_name": "متجر تجريبي",
            "access_token": "EAAFakeToken123",
        })
        assert r.status_code == 200, r.text

        from models import BotState
        from _crypto import decrypt_token
        async with sf() as db:
            rows = await db.execute(
                select(BotState).where(BotState.tenant_id == tid))
            state = {b.key: b.value for b in rows.scalars().all()}
        assert state.get("fb_page_id") == "1234567890"
        assert state.get("fb_page_name") == "متجر تجريبي"
        enc = state.get("fb_access_token", "")
        assert enc and enc != "EAAFakeToken123", "الرمز لم يُشفَّر!"
        assert decrypt_token(enc) == "EAAFakeToken123", "فك التشفير فشل — تخزين غير متوافق"

        # upsert-safe: إعادة الإرسال لا تكرر الصفوف
        r = await client.post("/api/onboarding/connect-page", json={
            "page_id": "1234567890", "access_token": "EAAFakeToken456",
        })
        assert r.status_code == 200
        async with sf() as db:
            rows = await db.execute(
                select(BotState).where(BotState.tenant_id == tid, BotState.key == "fb_page_id"))
            assert len(rows.scalars().all()) == 1, "تكرار صفوف BotState!"
    finally:
        from database import get_db
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await te.dispose()


async def test_connection_endpoint_exists_and_validates():
    """نقطة اختبار الاتصال موجودة — ترفض البيانات الناقصة بودقة واضحة (بلا اتصال خارجي)."""
    fixture = await _make_fixture()
    try:
        app, sf, te, client = fixture
        await _seed_user(fixture)

        # لا بيانات → رسة واضحة (ليست استثناء 500)
        r = await client.post("/api/onboarding/test-connection", json={})
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        assert d["connected"] is False
        assert "رمز الوصول" in d["error"], d
    finally:
        from database import get_db
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await te.dispose()


async def test_connection_success_via_mock(monkeypatch=None):
    """نجاح الاختبار عبر محاكاة Graph API (httpx المُحاكى) — عقد الواجهة {connected, page_name}."""
    import asyncio
    fixture = await _make_fixture()
    try:
        app, sf, te, client = fixture
        await _seed_user(fixture)

        # محاكاة httpx.AsyncClient داخل وحدة onboarding
        import routers.onboarding as ob
        import httpx as real_httpx

        class FakeResp:
            status_code = 200
            def json(self):
                return {"name": "متجر المرجان", "fan_count": 15200}

        class FakeClient:
            def __init__(self, *a, **k): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def get(self, url, params=None):
                assert "1234567890" in url
                return FakeResp()

        orig = real_httpx.AsyncClient
        real_httpx.AsyncClient = FakeClient
        try:
            r = await client.post("/api/onboarding/test-connection", json={
                "page_id": "1234567890", "access_token": "EAAOk",
            })
            d = r.json()["data"]
            assert d["connected"] is True
            assert d["page_name"] == "متجر المرجان"
            assert d["fan_count"] == 15200
        finally:
            real_httpx.AsyncClient = orig
    finally:
        from database import get_db
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await te.dispose()


# ── Step 4: first rule + AI/template suggestion ─────────────────────────────

async def test_suggest_reply_template_fallback():
    """اقتراح الرد يعمل بلا مزود AI — قالب حتمي (لا يعطل المعالج أبداً)."""
    fixture = await _make_fixture()
    try:
        app, sf, te, client = fixture
        await _seed_user(fixture)

        r = await client.post("/api/onboarding/suggest-reply", json={"keyword": "سعر"})
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        assert len(d["suggestion"]) > 10
        assert d["source"] == "template"

        # كلمة فارغة → 400
        r = await client.post("/api/onboarding/suggest-reply", json={"keyword": ""})
        assert r.status_code == 400
    finally:
        from database import get_db
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await te.dispose()


async def test_first_rule_created_tenant_scoped():
    fixture = await _make_fixture()
    try:
        app, sf, te, client = fixture
        tid = await _seed_user(fixture)

        r = await client.post("/api/onboarding/first-rule", json={
            "keyword": "توصيل", "reply": "التوصيل متاح — راسلنا على الخاص",
        })
        assert r.status_code == 200, r.text
        rule_id = r.json()["data"]["rule_id"]
        assert rule_id

        from models import Rule
        async with sf() as db:
            rule = await db.get(Rule, rule_id)
            assert rule.tenant_id == tid
            assert rule.keywords == ["توصيل"]
            assert rule.enabled is True
    finally:
        from database import get_db
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await te.dispose()


async def test_onboarding_complete_marks_tenant():
    fixture = await _make_fixture()
    try:
        app, sf, te, client = fixture
        tid = await _seed_user(fixture)

        r = await client.post("/api/onboarding/complete")
        assert r.status_code == 200, r.text

        from models import Tenant
        async with sf() as db:
            t = await db.get(Tenant, tid)
            assert t.onboarding_completed is True
    finally:
        from database import get_db
        app.dependency_overrides.pop(get_db, None)
        await client.aclose()
        await te.dispose()


# ── §5.2: tour mounted + targets exist (source guards) ─────────────────────

def _read(p):
    base = os.path.join(os.path.dirname(__file__), "frontend", "src")
    return open(os.path.join(base, p), encoding="utf-8").read()


def test_tour_is_mounted_in_authguard():
    """الجولة (react-joyride) مركّبة فعلاً — كانت معرّفة وغير مستخدمة."""
    guard = _read("app/dashboard/AuthGuard.tsx")
    assert "OnboardingTour" in guard, "OnboardingTour غير مركّب في AuthGuard"
    assert "autoStart" in guard
    assert "TOUR_SEEN_KEY" in guard, "يجب حفظ حالة الجولة حتى لا تتكرر"


def test_tour_targets_exist_in_sidebar():
    """كل أهداف الجولة (tourId) موجودة كـ id في الشريط الجانبي."""
    tour = _read("components/onboarding/OnboardingTour.tsx")
    sidebar = _read("components/layout/AdminSidebar.tsx")
    import re
    targets = re.findall(r'target:\s*"([^"]+)"', tour)
    assert len(targets) >= 5, f"متوقع 5+ أهداف، وجد {len(targets)}"
    for t in targets:
        selector = t.lstrip("#.")
        assert f'id="{selector}"' in sidebar or f'"{selector}"' in sidebar, \
            f"هدف الجولة '{t}' غير موجود في الشريط الجانبي"
    # tourId mechanics present
    assert "tourId" in sidebar and 'id={item.tourId}' in sidebar


def test_wizard_uses_real_plans_and_test_connection():
    """حارس مصدري: المعالج يجلب الباقات من API ويختبر الاتصال — لا أسعار ثابتة."""
    wizard = _read("app/onboarding/OnboardingWizard.tsx")
    assert '"/api/plans"' in wizard, "يجب جلب الباقات من API"
    assert "/api/onboarding/test-connection" in wizard, "زر اختبار الاتصال مفقود"
    assert 'price: "50"' not in wizard and 'price: "150"' not in wizard, "أسعار ثابتة قديمة!"
    assert "/api/onboarding/suggest-reply" in wizard, "زر اقتراح AI مفقود"
    assert "/api/onboarding/connect-page" in wizard
    assert "access_token" in wizard, "حقل رمز الوصول مفقود من خطوة الربط"


def test_onboarding_router_uses_fernet():
    """حارس مصدري: لا XOR منزلي — تشفير Fernet فقط للرموز."""
    src = open(os.path.join(os.path.dirname(__file__), "routers", "onboarding.py"),
               encoding="utf-8").read()
    assert "encrypt_token" in src, "يجب استخدام encrypt_token (Fernet)"
    assert "_encrypt_value" not in src, "الإصدار XOR القديم يجب ألا يعود"
    assert "chr(ord(c) ^" not in src
