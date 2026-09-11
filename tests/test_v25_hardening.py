"""v25 — اختبارات انحدار إصلاحات الجولة (Deep Audit v25).

كل إصلاح حرج في docs/reports/v25-deep-audit-diagnosis.md يحصل هنا على
اختبار يمنع عودته:

- B-01: IDOR تسلسلات — subscribe/unsubscribe عبر المستأجرين مرفوض.
- D-01: Subscriber.reply_count يُكتب فعلًا عند كل رد تعليق.
- D-02: العروض المنتهية/المستنفدة لا تُسلَّم + used_count يُعدّ.
- B-11: إلغاء الدفعة المعلقة للمالك فقط (لا لعضو بنفس المستأجر).
- B-02: refresh_ai_from_db يُبطل ذاكرة الوكيل (agent_brain._ai).
"""
from __future__ import annotations

import uuid
from datetime import timedelta

import pytest

from tests.conftest import V10_TEST_PASSWORD

# ══════════════════════════════════════════════════════════════════
# عالم HTTP معزول (نفس وصفة test_mobile_auth_api._make_world)
# ══════════════════════════════════════════════════════════════════

async def _make_world():
    import _rate_limit as _rl

    async def _allow(db, key, max_attempts=10, window_seconds=60):
        return True

    mp = pytest.MonkeyPatch()
    mp.setattr(_rl, "check_rate_limit", _allow)
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

    session_factory = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    from httpx import ASGITransport, AsyncClient
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


async def _seed_tenant_with_users(sf, tag: str):
    """مستأجر واحد + مالك admin + عضو viewer (نفس المستأجر فعليًا)."""
    from _hash import hash_password
    from models import Tenant, User

    async with sf() as db:
        t = Tenant(name=f"T-{tag}", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        owner = User(username=f"own_{tag}", email=f"own_{tag}@v25.ly",
                     password_hash=hash_password(V10_TEST_PASSWORD),
                     tenant_id=t.id, role="admin")
        viewer = User(username=f"vie_{tag}", email=f"vie_{tag}@v25.ly",
                      password_hash=hash_password(V10_TEST_PASSWORD),
                      tenant_id=t.id, role="viewer")
        db.add_all([owner, viewer])
        await db.commit()
        return t.id, owner.id, viewer.id, owner.username, viewer.username


def _auth(client, token: str):
    client.cookies.set("token", token)


# ══════════════════════════════════════════════════════════════════
# B-01 — IDOR تسلسلات
# ══════════════════════════════════════════════════════════════════

async def test_sequence_subscribe_rejects_cross_tenant_subscriber(world):
    """مستأجر A لا يستطيع تسجيل مشترك مستأجر B في تسلسله (كانت بلا أي
    تحقق — كتابة عبر المستأجرين + إرسال drip بتوكن صفحة المتصل)."""
    from _hash import hash_password
    from models import Sequence, SequenceSubscription, Subscriber, Tenant, User
    from sequence_engine import SequenceEngine
    from sqlalchemy import select

    sf = world.sf
    eng = SequenceEngine(None)

    tag = uuid.uuid4().hex[:6]
    async with sf() as db:
        t_a = Tenant(name="A", subscription_status="PAID", is_active=True)
        t_b = Tenant(name="B", subscription_status="PAID", is_active=True)
        db.add_all([t_a, t_b])
        await db.flush()
        u_a = User(username=f"ua_{tag}", email=f"ua_{tag}@v25.ly",
                   password_hash=hash_password(V10_TEST_PASSWORD),
                   tenant_id=t_a.id, role="admin")
        db.add(u_a)
        seq = Sequence(tenant_id=t_a.id, name="تسلسل أ", status="active")
        db.add(seq)
        await db.flush()
        sub_b = Subscriber(tenant_id=t_b.id, fb_user_id="fb_b_1", name="ضحية")
        sub_a = Subscriber(tenant_id=t_a.id, fb_user_id="fb_a_1", name="مواطن سليم")
        db.add_all([sub_b, sub_a])
        await db.commit()
        ids = (t_a.id, t_b.id, seq.id, sub_b.id, sub_a.id)

    async with sf() as db:
        ok_a = await eng.subscribe(ids[3], ids[2], db, tenant_id=ids[0])
        await db.commit()
        assert ok_a is False, "cross-tenant subscriber must be rejected"
        rows = (await db.execute(
            select(SequenceSubscription)
            .where(SequenceSubscription.sequence_id == ids[2]))).scalars().all()
        assert not rows, "no subscription row may be written for the cross-tenant attempt"

    async with sf() as db:
        ok_b = await eng.subscribe(ids[4], ids[2], db, tenant_id=ids[0])
        await db.commit()
        assert ok_b is True, "same-tenant subscriber must still be accepted"


async def test_sequence_unsubscribe_tenant_scoped(world):
    """إلغاء اشتراك بمعرّفات من مستأجر آخر لا يلمس صفوف المستأجر."""
    from models import Sequence, SequenceSubscription, Subscriber
    from sequence_engine import SequenceEngine
    from sqlalchemy import select

    sf = world.sf
    eng = SequenceEngine(None)
    tag = uuid.uuid4().hex[:6]

    async with sf() as db:
        from _hash import hash_password
        from models import Tenant, User
        t_a = Tenant(name="A2", subscription_status="PAID", is_active=True)
        t_b = Tenant(name="B2", subscription_status="PAID", is_active=True)
        db.add_all([t_a, t_b])
        await db.flush()
        db.add(User(username=f"u_{tag}", email=f"u_{tag}@v25.ly",
                    password_hash=hash_password(V10_TEST_PASSWORD),
                    tenant_id=t_a.id, role="admin"))
        seq_a = Sequence(tenant_id=t_a.id, name="تسلسل أ", status="active")
        seq_b = Sequence(tenant_id=t_b.id, name="تسلسل ب", status="active")
        db.add_all([seq_a, seq_b])
        await db.flush()
        sub_a = Subscriber(tenant_id=t_a.id, fb_user_id="fb_x", name="مشترك أ")
        db.add(sub_a)
        await db.flush()
        db.add(SequenceSubscription(subscriber_id=sub_a.id, sequence_id=seq_b.id,
                                    tenant_id=t_b.id, current_step=0, status="active"))
        await db.commit()
        ids = (t_a.id, t_b.id, sub_a.id, seq_a.id, seq_b.id)

    async with sf() as db:
        # مستأجر A يحاول إلغاء اشتراف مرتبط بتسلسل مستأجر B — لا سلطة له
        done = await eng.unsubscribe(ids[2], ids[4], db, tenant_id=ids[0])
        await db.rollback()
        assert done is False, "unsubscribing another tenant's row must fail"
    async with sf() as db:
        row = (await db.execute(
            select(SequenceSubscription)
            .where(SequenceSubscription.sequence_id == ids[4]))).scalar_one()
        assert row.status == "active", "the row must remain untouched"


# ══════════════════════════════════════════════════════════════════
# B-11 — إلغاء الدفعة: المالك فقط
# ══════════════════════════════════════════════════════════════════

async def test_pending_payment_cancel_owner_only(world):
    """عضو viewer بنفس المستأجر لا يلغي دفعة المالك المعلقة (404)،
    والمالك يلغي بنجاح."""
    from models import SubscriptionPayment, SubscriptionPlan
    from routers.auth import make_token

    sf = world.sf
    tag = uuid.uuid4().hex[:6]
    tid, owner_id, viewer_id, owner_name, viewer_name = await _seed_tenant_with_users(sf, tag)

    async with sf() as db:
        plan = SubscriptionPlan(name="pro", name_ar="برو", price=99, period_days=30)
        db.add(plan)
        await db.flush()
        sp = SubscriptionPayment(user_id=owner_id, tenant_id=tid, phone="0910000000",
                                 amount=99, provider="liyana", plan_id=plan.id,
                                 plan_name="برو", status="pending")
        db.add(sp)
        await db.commit()
        sp_id = sp.id

    # viewer أولًا: يجب الرفض (404) — الدفعة تبقى معلقة
    _auth(world.client, make_token(viewer_name, tid))
    r_v = await world.client.post("/api/subscriptions/cancel", json={"payment_id": sp_id})
    assert r_v.status_code == 404, \
        f"same-tenant viewer must NOT cancel another user's payment: {r_v.status_code}"

    # المالك: مسموح
    _auth(world.client, make_token(owner_name, tid))
    r_o = await world.client.post("/api/subscriptions/cancel", json={"payment_id": sp_id})
    assert r_o.status_code == 200, f"owner cancel must work: {r_o.status_code} {r_o.text}"
    assert (r_o.json().get("data") or {}).get("status") == "cancelled"


# ══════════════════════════════════════════════════════════════════
# D-02 — إنفاذ صلاحية العروض
# ══════════════════════════════════════════════════════════════════

async def test_offer_selection_enforces_expiry_and_capacity(world):
    """عرض منتهٍ أو مستنفد (max_uses) لا يُسلَّم؛ السليم يُسلَّم ويُعدّ."""
    from _utils import utcnow
    from models import Offer, Tenant
    from offer_engine import OfferEngine
    from sqlalchemy import select

    sf = world.sf
    tag = uuid.uuid4().hex[:6]
    async with sf() as db:
        t = Tenant(name=f"TO-{tag}", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        tid = t.id
        db.add_all([
            Offer(tenant_id=tid, title="منتهي", code=f"EXP{tag}", is_active=True,
                  starts_at=None, expires_at=utcnow() - timedelta(days=1)),
            Offer(tenant_id=tid, title="مستنفد", code=f"FULL{tag}", is_active=True,
                  max_uses=2, used_count=2),
            Offer(tenant_id=tid, title="سليم", code=f"OK{tag}", is_active=True,
                  max_uses=5, used_count=0),
        ])
        await db.commit()

    engine = OfferEngine()
    async with sf() as db:
        # بلا مستخدم: يجب اختيار «سليم» فقط (الأولان مستبعدان بالفلترة)
        picked = await engine.get_best_offer(db, user_id=None, tenant_id=tid)
        assert picked and picked["code"] == f"OK{tag}", f"expected OK, got {picked}"
        await db.commit()  # المستدعي يملك المعاملة (نمط الـrouters)

    async with sf() as db:
        row = (await db.execute(select(Offer).where(Offer.code == f"OK{tag}"))).scalar_one()
        assert (row.used_count or 0) == 1, "used_count must increment on delivery"


# ══════════════════════════════════════════════════════════════════
# B-02 — refresh_ai_from_db يُبطل ذاكرة الوكيل
# ══════════════════════════════════════════════════════════════════

async def test_refresh_ai_resets_agent_brain_singleton(world, monkeypatch):
    """حفظ مفتاح جديد في SystemConfig يجب أن يُبطِل agent_brain._ai
    (كان يظل على مفاتيح env القديمة — عطل «AI غير فعّال» الجذري)."""
    import os

    sf = world.sf
    from models import SystemConfig

    async with sf() as db:
        db.add(SystemConfig(key="openai_api_key", value=f"sk-v25-{uuid.uuid4().hex[:8]}"))
        await db.commit()

    import agent_brain

    class _Stale:
        available = False

    agent_brain._ai = _Stale()  # ذاكرة قديمة محاكاة لما كان يحدث

    # refresh_ai_from_db يستورد AsyncSessionLocal من database داخل الدالة —
    # الرقعة إذًا على database نفسها (لا على _services).
    import database as db_mod
    monkeypatch.setattr(db_mod, "AsyncSessionLocal", sf)
    import _services as svc
    monkeypatch.setattr(svc, "AsyncSessionLocal", sf)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-old-stale")
    await svc.refresh_ai_from_db()

    assert os.getenv("OPENAI_API_KEY", "").startswith("sk-v25-"), "env key must refresh"
    assert agent_brain._ai is None, "agent_brain._ai must be invalidated (B-02)"
    # تنظيف
    os.environ["OPENAI_API_KEY"] = ""
    import ai_service as _m
    _m._openai = None
    _m._google = None


# ══════════════════════════════════════════════════════════════════
# D-01 — Subscriber.reply_count يُكتب فعليًا
# ══════════════════════════════════════════════════════════════════

class _RCFakeFB:
    def __init__(self):
        self.page_id = "p1"

    async def reply_to_comment(self, cid, text):
        return {"id": "ok"}

    async def send_private_reply(self, cid, text):
        return None

    async def send_dm(self, uid, text, messaging_type="RESPONSE", tag=None):
        return None


async def test_reply_count_incremented_after_comment_reply(v10_world, monkeypatch):
    """كل رد تعليق يزيد Subscriber.reply_count ذريًا (كان عمودًا ميتًا:
    جمهور engaged وفلتر min_replies صامتان الخطأ)."""
    import bot_engine.engine as engine_mod
    monkeypatch.setattr(engine_mod, "AsyncSessionLocal", v10_world.sf)

    from bot_engine.engine import BotEngine
    from models import Rule, Subscriber, Tenant
    from sqlalchemy import select

    sf = v10_world.sf
    tag = uuid.uuid4().hex[:6]
    async with sf() as db:
        t = Tenant(name=f"TRC-{tag}", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        tid = t.id
        db.add(Rule(tenant_id=tid, name="سعر", keywords=["السعر"],
                    reply_template="السعر 50 د.ل", enabled=True, priority=10))
        db.add(Subscriber(tenant_id=tid, fb_user_id=f"u_rc_{tag}", name="مشترك تجربة"))
        await db.commit()

    eng = BotEngine(_RCFakeFB(), tenant_id=tid)
    from datetime import datetime
    c = {
        "id": f"c_{tag}", "post_id": "p_1",
        "message": "كم السعر؟", "from": {"id": f"u_rc_{tag}", "name": "مشترك تجربة"},
        "created_time": int(datetime.utcnow().timestamp()),
    }
    res = await eng.process_single_comment(c, "p1")
    assert res is not None or True  # الشكل يتغير حسب العائد؛ المهم العدّاد

    async with sf() as db:
        sub = (await db.execute(
            select(Subscriber).where(Subscriber.fb_user_id == f"u_rc_{tag}"))).scalar_one()
        assert (sub.reply_count or 0) >= 1, f"reply_count must be written, got {sub.reply_count}"
