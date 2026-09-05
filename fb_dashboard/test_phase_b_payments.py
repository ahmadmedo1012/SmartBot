from __future__ import annotations
"""
Phase B (= الخطة 2) — بوابة الخروج: نظام الدفع والاشتراكات

Exit-gate evidence per PLAN-REBUILD-V2.md §2:
  2.2 غلاف المحافظ (>99 د.ل بنكي فقط) مفروض على الخادم — لا في الواجهة فقط
  2.2 تحقق السعر على الخادم إجباري
  2.2 حد الطلبات 5/دقيقة على /api/subscriptions
  2.4 إعداد بيانات الحساب البنكي عبر /api/admin/config + قراءتها من /api/config (+ بدائل env)
  2.5 فترة التجربة: trial_days → حالة TRIAL عند التسجيل
  2.6 انتهاء التجربة → EXPIRED_TRIAL مع استمرار البوت (وليس إيقافه)
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import asyncio
from datetime import timedelta
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select

from _utils import utcnow


# ── Test harness: isolated DB + real ASGI app ───────────────────────────────

async def _make_app_fixture():
    """Returns (app, session_factory, test_engine) with fresh in-memory DB."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy.pool import StaticPool
    from models import Base
    from database import get_db
    import routers.payments as payments_mod
    import bot as bot_mod
    from runner import app

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    # payments rate-limiter + bot cycle use AsyncSessionLocal directly → patch to test DB
    orig_payments_al, orig_bot_al = payments_mod.AsyncSessionLocal, bot_mod.AsyncSessionLocal
    payments_mod.AsyncSessionLocal = session_factory
    bot_mod.AsyncSessionLocal = session_factory

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    return app, session_factory, test_engine, (payments_mod, bot_mod, orig_payments_al, orig_bot_al)


async def _teardown(fixture):
    from database import get_db
    app, _sf, test_engine, (payments_mod, bot_mod, orig_p, orig_b) = fixture
    app.dependency_overrides.pop(get_db, None)
    payments_mod.AsyncSessionLocal = orig_p
    bot_mod.AsyncSessionLocal = orig_b
    await test_engine.dispose()
    # clear in-memory API cache so later tests don't see stale /api/config
    try:
        from _services import api_cache
        api_cache.clear_all()
    except Exception:
        pass


async def _seed(fixture, plans=None, users=1, tenant_kwargs=None):
    """Seed plans + an admin user. Returns (client_factory, plan_ids, user)."""
    from models import SubscriptionPlan, Tenant, User
    from routers.auth import make_token
    from _hash import hash_password
    app, session_factory, *_ = fixture

    plans = plans if plans is not None else [
        {"name": "Cheap", "name_ar": "رخيص", "price": 50.0, "period_days": 30, "trial_days": 0},
        {"name": "Expensive", "name_ar": "غالي", "price": 200.0, "period_days": 30, "trial_days": 0},
        {"name": "TrialPlan", "name_ar": "تجريبي", "price": 100.0, "period_days": 30, "trial_days": 14},
    ]
    async with session_factory() as db:
        plan_objs = [SubscriptionPlan(name=p["name"], name_ar=p["name_ar"], price=p["price"],
                                      period_days=p["period_days"], trial_days=p["trial_days"],
                                      is_active=True) for p in plans]
        db.add_all(plan_objs)
        t = Tenant(name="T1", subscription_status="UNPAID", is_active=True, **(tenant_kwargs or {}))
        db.add(t)
        await db.flush()
        u = User(username="buyer", email="buyer@test.ly", password_hash=hash_password("pass123456"),
                 tenant_id=t.id, role="admin")
        db.add(u)
        await db.flush()
        plan_ids = [p.id for p in plan_objs]
        tid = t.id
        uid = u.id
        await db.commit()

    import httpx
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    token = make_token("buyer", tid)
    client.cookies.set("token", token)
    return client, plan_ids, (tid, uid)


# ── 2.2 Server-side wallet cap ──────────────────────────────────────────────

async def test_wallet_above_cap_rejected_on_subscriptions():
    """خطة 200 د.ل عبر محفظة → 400 (فوق 99 د.ل بنكي فقط). حتى لو المبلغ=السعر."""
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/subscriptions", json={
            "plan_id": plan_ids[1], "provider": "liyana", "amount": 200.0, "phone": "0912345678",
        })
        assert r.status_code == 400, r.text
        assert "بنكي" in r.json()["detail"], r.text
        # madar too
        r = await client.post("/api/subscriptions", json={
            "plan_id": plan_ids[1], "provider": "madar", "amount": 200.0, "phone": "0912345678",
        })
        assert r.status_code == 400
    finally:
        await _teardown(fixture)


async def test_wallet_at_or_below_cap_allowed():
    """خطة 50 د.ل عبر محفظة → مقبول (pending) مع تطابق المبلغ."""
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/subscriptions", json={
            "plan_id": plan_ids[0], "provider": "liyana", "amount": 50.0, "phone": "0912345678",
        })
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "pending"
    finally:
        await _teardown(fixture)


async def test_wallet_above_cap_rejected_on_topup():
    """شحن محفظة 150 د.ل → 400 (غلاف 99)."""
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/payments/topup", json={
            "amount": 150, "provider": "liyana", "phone": "0912345678",
        })
        assert r.status_code == 400, r.text
        assert "بنكي" in r.json()["detail"]
    finally:
        await _teardown(fixture)


async def test_wallet_above_cap_rejected_on_upgrade():
    """ترقية لخطة 200 د.ل عبر محفظة → 400."""
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, (tid, uid) = await _seed(fixture)
        from models import Tenant
        app, sf, *_ = fixture
        async with sf() as db:
            t = await db.get(Tenant, tid)
            t.plan_id = plan_ids[0]
            await db.commit()
        r = await client.post("/api/subscriptions/upgrade", json={
            "plan_id": plan_ids[1], "provider": "madar", "amount": 200.0, "phone": "0912345678",
        })
        assert r.status_code == 400, r.text
        assert "بنكي" in r.json()["detail"]
    finally:
        await _teardown(fixture)


async def test_price_mismatch_rejected():
    """تحقق السعر الإجباري: 60 د.ل لخطة سعرها 50 → 400."""
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/subscriptions", json={
            "plan_id": plan_ids[0], "provider": "liyana", "amount": 60.0, "phone": "0912345678",
        })
        assert r.status_code == 400
        assert "المبلغ" in r.json()["detail"]
    finally:
        await _teardown(fixture)


async def test_bank_above_99_accepted_with_sender_info():
    """بنكي فوق 99 د.ل مع بيانات المُرسِل → مقبول."""
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/subscriptions", json={
            "plan_id": plan_ids[1], "provider": "bank", "amount": 200.0,
            "senderAccountName": "محمد المرسل", "senderAccountNumber": "123456789",
            "receiptImageUrl": "https://example.com/r.jpg",
        })
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "pending"
    finally:
        await _teardown(fixture)


async def test_bank_missing_sender_rejected():
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/subscriptions", json={
            "plan_id": plan_ids[1], "provider": "bank", "amount": 200.0,
        })
        assert r.status_code == 400
        assert "صاحب الحساب" in r.json()["detail"]
    finally:
        await _teardown(fixture)


# ── 2.2 Rate limit on /api/subscriptions ────────────────────────────────────

async def test_subscriptions_rate_limited():
    """6 طلبات متتالية خلال دقيقة → السادس 429 (الحد 5/دقيقة لكل IP)."""
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, _ = await _seed(fixture)
        statuses = []
        for _ in range(6):
            r = await client.post("/api/subscriptions", json={
                "plan_id": plan_ids[0], "provider": "liyana", "amount": 50.0,
                "phone": "0912345678",
            })
            statuses.append(r.status_code)
        assert statuses[:5] == [200, 400, 400, 400, 400], statuses  # 1st ok, then duplicate-pending 400s
        assert statuses[5] == 429, f"الحد غير مفعل: {statuses}"
    finally:
        await _teardown(fixture)


# ── 2.4 Admin payment config roundtrip ──────────────────────────────────────

async def test_admin_config_set_get_roundtrip():
    fixture = await _make_app_fixture()
    try:
        client, _plan_ids, _ = await _seed(fixture)
        # set bank details
        r = await client.post("/api/admin/config", json={
            "config": {
                "bank_transfer_bank_name": "مصرف الجمهورية",
                "bank_transfer_account_number": "0021-0045-9988",
                "bank_transfer_iban": "LY83002048000020100120361",
            }
        })
        assert r.status_code == 200, r.text
        # public /api/config exposes them (cache invalidated by the setter)
        r = await client.get("/api/config")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["bank_transfer_bank_name"] == "مصرف الجمهورية"
        assert data["bank_transfer_account_number"] == "0021-0045-9988"
        assert data["bank_transfer_iban"] == "LY83002048000020100120361"
        # admin read-back
        r = await client.get("/api/admin/config")
        assert r.status_code == 200
        assert r.json()["data"]["bank_transfer_bank_name"] == "مصرف الجمهورية"
    finally:
        await _teardown(fixture)


async def test_admin_config_rejects_invalid_keys_and_non_admin():
    fixture = await _make_app_fixture()
    try:
        client, _plan_ids, (tid, uid) = await _seed(fixture)
        # invalid key → 400
        r = await client.post("/api/admin/config", json={"config": {"secret_key": "x"}})
        assert r.status_code == 400
        # viewer role → 403
        from models import User
        from routers.auth import make_token
        app, sf, *_ = fixture
        async with sf() as db:
            db.add(User(username="viewer1", email="v@test.ly",
                        password_hash="x", tenant_id=tid, role="viewer"))
            await db.commit()
        client.cookies.set("token", make_token("viewer1", tid))
        r = await client.post("/api/admin/config", json={
            "config": {"bank_transfer_bank_name": "لا يسمح"}})
        assert r.status_code == 403, r.text
    finally:
        await _teardown(fixture)


async def test_config_env_fallbacks(monkeypatch):
    """بدائل env تظهر عندما لا يوجد سطر SystemConfig (بند 2.4).

    Deterministic: sets env values explicitly (the old assertion depended
    on an ambient .env file — passed locally with wallet test values but
    failed in clean clones/CI where LIBYANA_WALLET_PHONE defaults to '').
    """
    fixture = await _make_app_fixture()
    try:
        client, _plan_ids, _ = await _seed(fixture)
        from config import settings
        from _services import api_cache
        api_cache.clear_all()
        # pin env fallbacks so the test never depends on ambient .env
        monkeypatch.setattr(settings, "LIBYANA_WALLET_PHONE", "0942119637", raising=False)
        monkeypatch.setattr(settings, "MADAR_WALLET_PHONE", "0910089975", raising=False)
        # public config: no SystemConfig rows → env fallbacks apply
        r = await client.get("/api/config")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data.get("balance_transfer_phone_2") == "0942119637"
        assert data.get("balance_transfer_phone_1") == "0910089975"
        assert data.get("mobile_wallet_cap") == str(settings.MOBILE_WALLET_CAP)
        # DB wins over env when set
        await client.post("/api/admin/config", json={"config": {"bank_transfer_bank_name": "بنك من الداتابيس"}})
        r = await client.get("/api/config")
        assert r.json()["data"]["bank_transfer_bank_name"] == "بنك من الداتابيس"
    finally:
        await _teardown(fixture)


# ── 2.1 Receipt upload endpoint ─────────────────────────────────────────────

def _png_bytes() -> bytes:
    """Minimal valid 4x4 PNG."""
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), color=(200, 60, 30)).save(buf, format="PNG")
    return buf.getvalue()


async def test_upload_receipt_ok():
    fixture = await _make_app_fixture()
    try:
        client, _plan_ids, _ = await _seed(fixture)
        r = await client.post(
            "/api/upload",
            files={"file": ("receipt.png", _png_bytes(), "image/png")},
        )
        assert r.status_code == 200, r.text
        url = r.json()["data"]["url"]
        assert url.startswith("/static/uploads/receipts/"), url
        assert url.endswith(".jpg")
        # الملف موجود فعلاً على القرص
        from pathlib import Path
        p = Path(__file__).parent / "static" / "uploads" / "receipts" / url.rsplit("/", 1)[1]
        assert p.exists(), p
    finally:
        await _teardown(fixture)


async def test_upload_receipt_rejects_wrong_type_and_fake_image():
    fixture = await _make_app_fixture()
    try:
        client, _plan_ids, _ = await _seed(fixture)
        # نوع غير مدعوم
        r = await client.post(
            "/api/upload",
            files={"file": ("notes.txt", b"hello", "text/plain")},
        )
        assert r.status_code == 400
        # ملف يدّعي أنه صورة لكنه ليس كذلك
        r = await client.post(
            "/api/upload",
            files={"file": ("fake.png", b"not-an-image-at-all" * 10, "image/png")},
        )
        assert r.status_code == 400
    finally:
        await _teardown(fixture)


async def test_upload_receipt_requires_auth():
    fixture = await _make_app_fixture()
    try:
        import httpx
        app, _sf, _te, _ = fixture
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as anon:
            r = await anon.post(
                "/api/upload",
                files={"file": ("receipt.png", _png_bytes(), "image/png")},
            )
            assert r.status_code == 401, r.status_code
    finally:
        await _teardown(fixture)


# ── 2.5 Trial period on register ────────────────────────────────────────────

async def test_register_with_trial_plan():
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, _ = await _seed(fixture)
        trial_plan_id = plan_ids[2]
        r = await client.post("/api/register", json={
            "username": "trialuser", "email": "trial@test.ly",
            "password": "secret123", "plan_id": trial_plan_id,
        })
        assert r.status_code == 200, r.text
        from models import Tenant
        app, sf, *_ = fixture
        async with sf() as db:
            t = (await db.execute(select(Tenant).where(Tenant.name == "trialuser"))).scalar_one()
            assert t.subscription_status == "TRIAL"
            assert t.plan_id == trial_plan_id
            assert t.plan_end is not None
            expected_days = (t.plan_end - t.plan_start).days
            assert 13 <= expected_days <= 14, f"plan_end خاطئ: {expected_days}"
    finally:
        await _teardown(fixture)


async def test_register_without_plan_stays_unpaid():
    fixture = await _make_app_fixture()
    try:
        client, _plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/register", json={
            "username": "plainuser", "email": "plain@test.ly", "password": "secret123",
        })
        assert r.status_code == 200
        from models import Tenant
        app, sf, *_ = fixture
        async with sf() as db:
            t = (await db.execute(select(Tenant).where(Tenant.name == "plainuser"))).scalar_one()
            assert t.subscription_status == "UNPAID"
            assert t.plan_end is None
    finally:
        await _teardown(fixture)


# ── 2.6 Trial expiry → EXPIRED_TRIAL in BotEngine ───────────────────────────

async def test_trial_expiry_flips_to_expired_trial_and_bot_continues():
    """بوت مستأجر تجربته منتهية: يتحول إلى EXPIRED_TRIAL ويستمر (لا يوقف الدورة)."""
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, (tid, uid) = await _seed(fixture)
        from models import Tenant
        from bot import BotEngine
        app, sf, *_ = fixture
        async with sf() as db:
            t = await db.get(Tenant, tid)
            t.subscription_status = "TRIAL"
            t.plan_start = utcnow() - timedelta(days=20)
            t.plan_end = utcnow() - timedelta(days=6)   # منتهية منذ 6 أيام
            await db.commit()

        engine = BotEngine(MagicMock(), tenant_id=tid)
        await engine.cycle()  # لا قواعد → يعود مبكراً — لكن بعد فحص الاشتراك

        async with sf() as db:
            t = await db.get(Tenant, tid)
            assert t.subscription_status == "EXPIRED_TRIAL", \
                f"المتوقع EXPIRED_TRIAL لكن وجد {t.subscription_status}"
    finally:
        await _teardown(fixture)


async def test_paid_expiry_still_skips_cycle():
    """مستأجر مدفوع منتهي → UNPAID ويُتخطى (سلوك أصلي محفوظ)."""
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, (tid, uid) = await _seed(fixture)
        from models import Tenant
        from bot import BotEngine
        app, sf, *_ = fixture
        async with sf() as db:
            t = await db.get(Tenant, tid)
            t.subscription_status = "PAID"
            t.plan_end = utcnow() - timedelta(days=1)
            await db.commit()

        engine = BotEngine(MagicMock(), tenant_id=tid)
        await engine.cycle()

        async with sf() as db:
            t = await db.get(Tenant, tid)
            assert t.subscription_status == "UNPAID"
    finally:
        await _teardown(fixture)


async def test_admin_config_support_keys_roundtrip():
    """مفاتيح الدعم (parity-v2 §3.1) — الأدمن يحددها عبر /api/admin/config
    وصفحة /api/support/info تقرأها من SystemConfig (SystemConfig يغلب الافتراضي)."""
    fixture = await _make_app_fixture()
    try:
        client, _plan_ids, (tid, uid) = await _seed(fixture)
        # set support contact values
        r = await client.post("/api/admin/config", json={
            "config": {
                "support_email": "help@smart-link.ly",
                "support_phone": "0911234567",
                "support_whatsapp": "0911234567",
                "support_working_hours": "السبت-الخميس 9ص-5م",
            }
        })
        assert r.status_code == 200, r.text
        # /api/support/info must reflect the DB override (no login needed)
        r = await client.get("/api/support/info")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["email"] == "help@smart-link.ly"
        assert data["phone"] == "0911234567"
        assert data["whatsapp"] == "0911234567"
        assert data["working_hours"] == "السبت-الخميس 9ص-5م"
        # admin read-back includes support keys
        r = await client.get("/api/admin/config")
        assert r.status_code == 200
        assert r.json()["data"]["support_email"] == "help@smart-link.ly"
        # clearing a key removes the override → default applies again
        r = await client.post("/api/admin/config", json={"config": {"support_phone": ""}})
        assert r.status_code == 200
        r = await client.get("/api/support/info")
        assert r.json()["data"]["phone"] == "0920000000"  # default fallback
    finally:
        await _teardown(fixture)


async def test_admin_config_support_email_validation():
    """بريد دعم غير صالح → 400 قبل أي كتابة في القاعدة."""
    fixture = await _make_app_fixture()
    try:
        client, _plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/admin/config", json={
            "config": {"support_email": "ليس-بريداً"}
        })
        assert r.status_code == 400
        assert "support_email" in r.text
    finally:
        await _teardown(fixture)
