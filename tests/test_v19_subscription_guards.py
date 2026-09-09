"""v19 Step 1 — the ONE central subscription-status source + duplicate guards.

The live round's first two complaints (sidebar «اشتراك» always visible +
duplicate subscription accepted silently) share one root: the honest-login
plan name /api/me already returned was consumed by NOTHING. This suite pins
the v19 closure:

  1. /api/me + /api/login return the snapshot block
     (subscriptionState / hasActiveSubscription / hasPendingSubscription /
     subscriptionPlanEnd) derived from the SAME helper the guards use.
  2. POST /api/payments/topup REJECTS an actively-subscribed tenant with the
     Arabic «لديك اشتراك نشط بالفعل» (the plan's explicit guard) — but only
     AFTER input validation (a malformed body still answers 422).
  3. POST /api/subscriptions (the REAL duplicate-subscription entry) rejects
     an active tenant, while expired/UNPAID/FREE tenants pass (renewal path).
  4. ``is_subscription_active`` semantics mirror the bot engine: PAID/TRIAL +
     future-or-absent plan_end → active; passed plan_end → NOT active (the
     engine converts at first use; the guard must let renewal through).

Mechanics follow test_phase_b_payments (own app fixture + overridden DB) so
tenant rows can be flipped per-test without touching the shared hermetic DB.
"""
from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("DEBUG", "True")

import pytest
from _utils import utcnow
from models import SubscriptionPlan, Tenant

# ── fixture (test_phase_b_payments pattern) ─────────────────────────────────


@pytest.fixture
async def fixture():
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

    # wallets' rate-limiter + the subscriptions limiter read AsyncSessionLocal
    # directly — point them at the isolated DB, restore originals on teardown
    orig_w = payments_mod.wallet.AsyncSessionLocal
    orig_p = payments_mod.plans.AsyncSessionLocal
    payments_mod.wallet.AsyncSessionLocal = session_factory
    payments_mod.plans.AsyncSessionLocal = session_factory

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield app, session_factory
    finally:
        app.dependency_overrides.pop(get_db, None)
        payments_mod.wallet.AsyncSessionLocal = orig_w
        payments_mod.plans.AsyncSessionLocal = orig_p
        await test_engine.dispose()


async def _seed(app, session_factory, *, tenant_kwargs=None):
    """Register a tenant admin + one active plan; returns (client, tenant_id, plan_id, user_id)."""
    from _hash import hash_password
    from models import User
    from routers.auth import make_token

    async with session_factory() as db:
        plan = SubscriptionPlan(name="pro", name_ar="احترافي", price=50.0,
                                period_days=30, trial_days=0, is_active=True)
        db.add(plan)
        tkwargs = {"subscription_status": "UNPAID", "is_active": True, "plan": "free"}
        tkwargs.update(tenant_kwargs or {})
        t = Tenant(name="T19", **tkwargs)
        db.add(t)
        await db.flush()
        u = User(username="v19buyer", email="v19buyer@test.ly",
                 password_hash=hash_password("pass123456"), tenant_id=t.id, role="admin")
        db.add(u)
        await db.flush()
        pid, tid, uid = plan.id, t.id, u.id
        await db.commit()

    import httpx
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    client.cookies.set("token", make_token("v19buyer", tid))
    return client, tid, pid, uid


async def _set_tenant(session_factory, tenant_id: int, **kwargs) -> None:
    async with session_factory() as db:
        t = await db.get(Tenant, tenant_id)
        for k, v in kwargs.items():
            setattr(t, k, v)
        await db.commit()


# ── 1) /api/me + /api/login snapshot block ──────────────────────────────────


async def test_me_returns_inactive_snapshot_for_unpaid_tenant(fixture):
    app, sf = fixture
    client, tid, _pid, _uid = await _seed(app, sf)
    r = await client.get("/api/me")
    assert r.status_code == 200, r.text
    user = r.json()["data"]["user"]
    assert user["subscriptionState"] == "inactive"
    assert user["hasActiveSubscription"] is False
    assert user["hasPendingSubscription"] is False
    assert user["subscriptionPlanEnd"] is None


async def test_me_returns_active_snapshot_for_paid_tenant(fixture):
    app, sf = fixture
    from datetime import timedelta
    future = utcnow() + timedelta(days=10)
    client, tid, _pid, _uid = await _seed(app, sf, tenant_kwargs={
        "subscription_status": "PAID", "plan": "pro", "plan_end": future,
    })
    r = await client.get("/api/me")
    assert r.status_code == 200, r.text
    user = r.json()["data"]["user"]
    assert user["subscriptionState"] == "active"
    assert user["hasActiveSubscription"] is True
    assert user["subscriptionStatus"] == "pro"  # plan name unchanged (v16-E2 contract)
    assert user["subscriptionPlanEnd"] == future.isoformat()


async def test_me_flags_pending_subscription_payment(fixture):
    """The snapshot also reports the user's own pending payment (v18 dialog probe)."""
    app, sf = fixture
    from models import SubscriptionPayment

    client, tid, pid, uid = await _seed(app, sf)
    async with sf() as db:
        db.add(SubscriptionPayment(user_id=uid, tenant_id=tid, phone="0912345678",
                                   amount=50.0, provider="liyana", plan_id=pid,
                                   plan_name="احترافي", status="pending"))
        await db.commit()
    r = await client.get("/api/me")
    assert r.status_code == 200, r.text
    user = r.json()["data"]["user"]
    assert user["hasPendingSubscription"] is True
    assert user["subscriptionState"] == "inactive"  # pending ≠ active


async def test_login_carries_the_same_snapshot_block(fixture):
    app, sf = fixture
    from datetime import timedelta
    await _seed(app, sf, tenant_kwargs={
        "subscription_status": "PAID", "plan": "pro",
        "plan_end": utcnow() + timedelta(days=5),
    })
    r = await client_login(app)
    assert r.status_code == 200, r.text
    user = r.json()["data"]["user"]
    assert user["subscriptionState"] == "active"
    assert user["hasActiveSubscription"] is True


async def client_login(app):
    import httpx
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        return await c.post("/api/login", json={"username": "v19buyer", "password": "pass123456"})


# ── 2) POST /api/payments/topup — deviation pin ──────────────────────────────


async def test_topup_stays_open_for_subscribed_tenant(fixture):
    """v19 deviation pin: the plan prescribed an active-subscription guard on
    topup, but approving a PaymentRequest CREDITS THE WALLET (never activates
    a subscription — app/telegram.py → credit_wallet). Blocking PAID tenants
    would break the pinned wallet-cap contract (test_v10_security D1) and the
    wallet-credit flow for paying customers. The duplicate-SUBSCRIPTION fix
    lives at POST /api/subscriptions; this pins topup staying wallet-only."""
    app, sf = fixture
    from datetime import timedelta

    from models import PaymentRequest
    from sqlalchemy import func as _func
    from sqlalchemy import select as _select

    client, tid, _pid, _uid = await _seed(app, sf, tenant_kwargs={
        "subscription_status": "PAID", "plan": "pro",
        "plan_end": utcnow() + timedelta(days=10),
    })
    r = await client.post("/api/payments/topup", json={
        "amount": 50.0, "provider": "liyana", "phone": "0912345678",
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"]["payment_id"] > 0
    async with sf() as db:
        count = (await db.execute(
            _select(_func.count(PaymentRequest.id)).where(PaymentRequest.tenant_id == tid)
        )).scalar()
    assert count == 1


# ── 3) POST /api/subscriptions guard (the REAL duplicate entry) ─────────────


async def test_subscriptions_rejected_for_active_subscription(fixture):
    app, sf = fixture
    from datetime import timedelta
    client, tid, pid, _uid = await _seed(app, sf, tenant_kwargs={
        "subscription_status": "PAID", "plan": "pro",
        "plan_end": utcnow() + timedelta(days=10),
    })
    r = await client.post("/api/subscriptions", json={
        "plan_id": pid, "provider": "liyana", "amount": 50.0, "phone": "0912345678",
    })
    assert r.status_code == 400, r.text
    assert "اشتراك نشط" in r.json()["detail"], r.text


async def test_subscriptions_allowed_for_unpaid_tenant(fixture):
    app, sf = fixture
    client, tid, pid, _uid = await _seed(app, sf)  # UNPAID default
    r = await client.post("/api/subscriptions", json={
        "plan_id": pid, "provider": "liyana", "amount": 50.0, "phone": "0912345678",
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "pending"


async def test_subscriptions_allowed_for_trial_expired_tenant(fixture):
    """EXPIRED_TRIAL is the free floor (v16-E2) — upgrading must stay open."""
    app, sf = fixture
    client, tid, pid, _uid = await _seed(app, sf, tenant_kwargs={
        "subscription_status": "EXPIRED_TRIAL", "plan": "free",
    })
    r = await client.post("/api/subscriptions", json={
        "plan_id": pid, "provider": "liyana", "amount": 50.0, "phone": "0912345678",
    })
    assert r.status_code == 200, r.text


# ── 4) is_subscription_active engine-mirroring semantics (unit) ─────────────


def test_is_subscription_active_matrix():
    from datetime import timedelta

    from _subscription import is_subscription_active

    def tenant(status, plan_end=None):
        return Tenant(name="x", subscription_status=status, plan_end=plan_end)

    assert is_subscription_active(tenant("PAID")) is True                     # no plan_end = unlimited
    assert is_subscription_active(tenant("PAID", utcnow() + timedelta(days=1))) is True
    assert is_subscription_active(tenant("PAID", utcnow() - timedelta(days=1))) is False  # lapsed → renewal allowed
    assert is_subscription_active(tenant("TRIAL", utcnow() + timedelta(days=1))) is True
    assert is_subscription_active(tenant("TRIAL", utcnow() - timedelta(days=1))) is False
    assert is_subscription_active(tenant("UNPAID")) is False
    assert is_subscription_active(tenant("REJECTED")) is False
    assert is_subscription_active(tenant("FREE")) is False
    assert is_subscription_active(tenant("EXPIRED_TRIAL")) is False
    assert is_subscription_active(None) is False
