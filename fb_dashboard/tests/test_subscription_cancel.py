from __future__ import annotations

"""v18 (Task 1-b) — إغلاق طريق مسدّد «طلب الدفع المعلق».

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
  - same-tenant teammate MAY cancel (the documented isolation rule)
  - GET /pending returns the own latest pending with the full field set,
    ok(null) after cancel, and never leaks another user's row

Harness: same isolated sqlite-in-memory + real ASGI app recipe as
tests/test_phase_b_payments.py (fresh engine per test, get_db override,
AsyncSessionLocal patched into payments.plans/wallet for the rate limiter).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, os.pardir, "fb_dashboard"))

from sqlalchemy import select

# ── Test harness: isolated DB + real ASGI app ───────────────────────────────

async def _make_app_fixture():
    """Returns (app, session_factory, test_engine, patch_state) — fresh DB."""
    import bot as bot_mod
    import routers.payments as payments_mod
    from database import get_db
    from models import Base
    from runner import app
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    test_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    # payments rate-limiter + bot cycle use AsyncSessionLocal directly → patch to test DB
    # (v13-L4: the /api/subscriptions inline limiter lives in payments.plans)
    orig_w_al, orig_p_al, orig_bot_al = (
        payments_mod.wallet.AsyncSessionLocal,
        payments_mod.plans.AsyncSessionLocal,
        bot_mod.AsyncSessionLocal,
    )
    payments_mod.wallet.AsyncSessionLocal = session_factory
    payments_mod.plans.AsyncSessionLocal = session_factory
    bot_mod.AsyncSessionLocal = session_factory

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    return app, session_factory, test_engine, (payments_mod, bot_mod, orig_w_al, orig_p_al, orig_bot_al)


async def _teardown(fixture):
    from database import get_db
    app, _sf, test_engine, (payments_mod, bot_mod, orig_w, orig_p, orig_b) = fixture
    app.dependency_overrides.pop(get_db, None)
    payments_mod.wallet.AsyncSessionLocal = orig_w
    payments_mod.plans.AsyncSessionLocal = orig_p
    bot_mod.AsyncSessionLocal = orig_b
    await test_engine.dispose()
    try:
        from _services import api_cache
        api_cache.clear_all()
    except Exception:
        pass


async def _seed(fixture):
    """Two tenants × (owner [+ teammate]) + one plan.

    Returns (client_for_owner_a, client_for_rival_b, client_for_teammate_c,
    plan_id, session_factory, tenant_a_id).
    """
    import httpx
    from _hash import hash_password
    from models import SubscriptionPlan, Tenant, User
    from routers.auth import make_token
    app, session_factory, *_ = fixture

    async with session_factory() as db:
        plan = SubscriptionPlan(name="Starter", name_ar="الأساسية", price=50.0,
                                period_days=30, trial_days=0, is_active=True)
        db.add(plan)
        t_a = Tenant(name="TenantA", subscription_status="UNPAID", is_active=True)
        t_b = Tenant(name="TenantB", subscription_status="UNPAID", is_active=True)
        db.add_all([t_a, t_b])
        await db.flush()
        u_a = User(username="owner", email="owner@test.ly", tenant_id=t_a.id, role="admin",
                   password_hash=hash_password("pass123456"))
        u_c = User(username="mate", email="mate@test.ly", tenant_id=t_a.id, role="viewer",
                   password_hash=hash_password("pass123456"))
        u_b = User(username="rival", email="rival@test.ly", tenant_id=t_b.id, role="admin",
                   password_hash=hash_password("pass123456"))
        db.add_all([u_a, u_c, u_b])
        await db.flush()
        await db.commit()
        plan_id, tid_a, tid_b = plan.id, t_a.id, t_b.id

    def _client_for(username: str, tid: int) -> httpx.AsyncClient:
        transport = httpx.ASGITransport(app=app)
        c = httpx.AsyncClient(transport=transport, base_url="http://test")
        c.cookies.set("token", make_token(username, tid))
        return c

    return (
        _client_for("owner", tid_a),
        _client_for("rival", tid_b),
        _client_for("mate", tid_a),
        plan_id,
        session_factory,
        tid_a,
    )


async def _add_payment(session_factory, *, user_id, tenant_id, plan_id, status="pending", amount=50.0):
    """Seed a SubscriptionPayment row directly (bypasses the endpoint + Telegram)."""
    from models import SubscriptionPayment
    async with session_factory() as db:
        sp = SubscriptionPayment(
            user_id=user_id, tenant_id=tenant_id, phone="0912345678",
            amount=amount, provider="liyana", plan_id=plan_id,
            plan_name="الأساسية", status=status, extra_data={},
        )
        db.add(sp)
        await db.commit()
        return sp.id


async def _get_user_id(session_factory, username: str) -> int:
    from models import User
    async with session_factory() as db:
        u = (await db.execute(select(User).where(User.username == username))).scalars().one()
        return u.id


# ── POST /api/subscriptions/cancel ──────────────────────────────────────────

async def test_subscription_cancel_own_pending_then_recreate():
    """إلغاء الطلب المعلق الخاص بي → cancelled، ثم طلب جديد ينجح (المسدّد انفتح)."""
    fixture = await _make_app_fixture()
    try:
        client_a, _c_b, _c_c, plan_id, sf, tid_a = await _seed(fixture)
        uid_a = await _get_user_id(sf, "owner")
        pid = await _add_payment(sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

        r = await client_a.post("/api/subscriptions/cancel", json={"payment_id": pid})
        assert r.status_code == 200, r.text
        assert r.json()["data"] == {"id": pid, "status": "cancelled"}, r.text

        # the row really flipped in DB
        from models import SubscriptionPayment
        async with sf() as db:
            sp = await db.get(SubscriptionPayment, pid)
            assert sp.status == "cancelled"

        # THE dead-end closure: a fresh payment request now succeeds
        r = await client_a.post("/api/subscriptions", json={
            "plan_id": plan_id, "provider": "liyana", "amount": 50.0, "phone": "0912345678",
        })
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "pending", r.text
    finally:
        await _teardown(fixture)


async def test_subscription_cancel_without_id_falls_back_to_latest_pending():
    """بلا payment_id في الجسم → يُلغى آخر طلب معلق يملكه المستخدم."""
    fixture = await _make_app_fixture()
    try:
        client_a, _c_b, _c_c, plan_id, sf, tid_a = await _seed(fixture)
        uid_a = await _get_user_id(sf, "owner")
        pid = await _add_payment(sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

        r = await client_a.post("/api/subscriptions/cancel", json={})
        assert r.status_code == 200, r.text
        assert r.json()["data"]["id"] == pid
        assert r.json()["data"]["status"] == "cancelled"
    finally:
        await _teardown(fixture)


async def test_subscription_cancel_other_tenants_payment_404():
    """مستخدم من مستأجر آخر يلغي دفعة غيره → 404 «الدفعة غير موجودة»."""
    fixture = await _make_app_fixture()
    try:
        _c_a, client_b, _c_c, plan_id, sf, tid_a = await _seed(fixture)
        uid_a = await _get_user_id(sf, "owner")
        pid = await _add_payment(sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

        r = await client_b.post("/api/subscriptions/cancel", json={"payment_id": pid})
        assert r.status_code == 404, r.text
        assert r.json()["detail"] == "الدفعة غير موجودة", r.text

        # the row is untouched
        from models import SubscriptionPayment
        async with sf() as db:
            assert (await db.get(SubscriptionPayment, pid)).status == "pending"
    finally:
        await _teardown(fixture)


async def test_subscription_cancel_non_pending_400():
    """إلغاء طلب غير معلق (قرار إدارة نهائي) → 400 «لا يمكن إلغاء طلب غير معلق»."""
    fixture = await _make_app_fixture()
    try:
        client_a, _c_b, _c_c, plan_id, sf, tid_a = await _seed(fixture)
        uid_a = await _get_user_id(sf, "owner")
        pid = await _add_payment(sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id, status="verified")

        r = await client_a.post("/api/subscriptions/cancel", json={"payment_id": pid})
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == "لا يمكن إلغاء طلب غير معلق", r.text
    finally:
        await _teardown(fixture)


async def test_subscription_cancel_same_tenant_teammate_allowed():
    """عضو آخر في نفس مساحة العمل (نفس tenant_id) → الإلغاء مسموح (قاعدة العزل)."""
    fixture = await _make_app_fixture()
    try:
        _c_a, _c_b, client_c, plan_id, sf, tid_a = await _seed(fixture)
        uid_a = await _get_user_id(sf, "owner")
        pid = await _add_payment(sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

        r = await client_c.post("/api/subscriptions/cancel", json={"payment_id": pid})
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "cancelled"
    finally:
        await _teardown(fixture)


async def test_subscription_cancel_unknown_payment_404():
    """معرف دفعة غير موجود → 404 (ولا يميّز بين «غير موجود» و«ليس ملكك»)."""
    fixture = await _make_app_fixture()
    try:
        client_a, _c_b, _c_c, _plan_id, _sf, _tid_a = await _seed(fixture)
        r = await client_a.post("/api/subscriptions/cancel", json={"payment_id": 99999})
        assert r.status_code == 404, r.text
        assert r.json()["detail"] == "الدفعة غير موجودة", r.text
    finally:
        await _teardown(fixture)


async def test_subscription_cancel_requires_auth():
    """بدون جلسة → 401 (لا إلغاء مجهول الهوية)."""
    fixture = await _make_app_fixture()
    try:
        import httpx
        app, _sf, _te, _ = fixture
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as anon:
            r = await anon.post("/api/subscriptions/cancel", json={"payment_id": 1})
            assert r.status_code == 401, r.status_code
    finally:
        await _teardown(fixture)


# ── GET /api/subscriptions/pending (the dialog pre-open probe) ──────────────

async def test_subscription_pending_returns_own_pending_fields():
    """فحص الطلب المعلق: كامل الحقول المعنية + الحالة الجارية."""
    fixture = await _make_app_fixture()
    try:
        client_a, _c_b, _c_c, plan_id, sf, tid_a = await _seed(fixture)
        uid_a = await _get_user_id(sf, "owner")
        pid = await _add_payment(sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

        r = await client_a.get("/api/subscriptions/pending")
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["payment_id"] == pid
        assert data["status"] == "pending"
        assert data["plan_id"] == plan_id
        assert data["plan_name"] == "الأساسية"
        assert data["amount"] == 50.0
        assert data["provider"] == "liyana"
        assert data["created_at"], data  # ISO-Z string (iso_z)
    finally:
        await _teardown(fixture)


async def test_subscription_pending_none_after_cancel():
    """بعد الإلغاء → ok(null) — الحوار يفتح على نموذج الدفع من جديد."""
    fixture = await _make_app_fixture()
    try:
        client_a, _c_b, _c_c, plan_id, sf, tid_a = await _seed(fixture)
        uid_a = await _get_user_id(sf, "owner")
        pid = await _add_payment(sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

        r = await client_a.post("/api/subscriptions/cancel", json={"payment_id": pid})
        assert r.status_code == 200, r.text

        r = await client_a.get("/api/subscriptions/pending")
        assert r.status_code == 200, r.text
        assert r.json()["data"] is None, r.text
    finally:
        await _teardown(fixture)


async def test_subscription_pending_never_leaks_other_users():
    """مستخدم بلا طلب معلق (خصمه هو من يملكه) → ok(null)، لا تسريب."""
    fixture = await _make_app_fixture()
    try:
        _c_a, client_b, _c_c, plan_id, sf, tid_a = await _seed(fixture)
        uid_a = await _get_user_id(sf, "owner")
        await _add_payment(sf, user_id=uid_a, tenant_id=tid_a, plan_id=plan_id)

        r = await client_b.get("/api/subscriptions/pending")
        assert r.status_code == 200, r.text
        assert r.json()["data"] is None, r.text
    finally:
        await _teardown(fixture)


async def test_subscription_pending_requires_auth():
    fixture = await _make_app_fixture()
    try:
        import httpx
        app, _sf, _te, _ = fixture
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as anon:
            r = await anon.get("/api/subscriptions/pending")
            assert r.status_code == 401, r.status_code
    finally:
        await _teardown(fixture)
