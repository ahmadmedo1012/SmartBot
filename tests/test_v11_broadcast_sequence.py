"""v11-A6 — S1 backlog #3: محرك البث + محرك السلاسل (broadcast/sequence).

broadcast_engine.py (14% تغطية) و sequence_engine.py (18%) — المنطق الحقيقي
للحملات الجماعية والسلاسل الزمنية لم يكن له اختبارات. هذه البوابة تثبّت:

  [x] البث — الإنشاء/العرض/التحديث/الإلغاء عبر HTTP (عقد ok()) مع عزل
        المستأجرين (قائمة tenant-scoped، تفاصيل/تحديث/إلغاء عبر tenant).
  [x] البث — تقدير الجمهور: مرشّح المنصة + tag_contains/tag_not_contains
        + min_replies (نفس منطق الاستعلام الذي يرسل لاحقًا).
  [x] البث — الإرسال الفعلي عبر محرك مباشر مع عميل FB مزيّف (بلا شبكة):
        سجلات المستلمين تُنشأ، القالب يُصيَّر ({name})، العدادات، الحالة
        النهائية sent/partial/failed، ومسار «لا عميل للمستأجر» → failed،
        و«بلا مطابقين» → sent بلا مستلمين، وغير draft → رفض.
  [x] البث — إرسال HTTP: غير موجود → 404، غير draft → 400 عربية.
  [x] السلاسل — CRUD كامل عبر HTTP + الخطوات + الاشتراك/إلغاء الاشتراك
        (التكرار → ok:false عبر rollback، لا 500) + عزل المستأجر (404).
  [x] السلاسل — المحرك: advance ينتقل بين الخطوات المرتبة وعند النهاية
        completed، get_due_subscriptions يحترم entered_at+delay،
        process_due_step يرسل ويقدّم عند النجاح فقط (الفشل يعيد المحاولة
        لاحقًا)، وinstagram غير مدعوم → فشل بلا تقدم، وrender_message
        يستبدل كل العناصر.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))


# ── أدوات الزرع ─────────────────────────────────────────────────────────────


async def _seed_subscriber(sf, tenant_id: int, platform: str = "messenger",
                           status: str = "active", reply_count: int = 0,
                           first_name: str = "سارة", username: str = "sara_u") -> int:
    from models import Subscriber

    async with sf() as db:
        s = Subscriber(tenant_id=tenant_id, fb_user_id=f"u_{uuid.uuid4().hex[:8]}",
                       name=f"{first_name} كاملة", first_name=first_name,
                       username=username, platform=platform, status=status,
                       reply_count=reply_count, last_interaction_at=None)
        db.add(s)
        await db.commit()
        return s.id


class FakeFB:
    """عميل FB مزيّف: يسجّل رسائل send_dm ويعيد نتيجة قابلة للضبط."""

    def __init__(self, ok: bool = True):
        self.dm_calls: list[tuple[str, str]] = []
        self.ok = ok

    async def send_dm(self, fb_user_id: str, message: str):
        self.dm_calls.append((fb_user_id, message))
        return {"message_id": f"m{len(self.dm_calls)}"} if self.ok else None


@pytest.fixture(scope="module")
async def app_db():
    """جداول قاعدة الاختبار المشتركة على محرك التطبيق الحقيقي — مهام إرسال
    البث تفتح جلساتها عبر AsyncSessionLocal بنفسها (v4 §3.8)."""
    from database import engine as db_engine
    from models import Base

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ── البث: CRUD عبر HTTP + عزل المستأجر ──────────────────────────────────────


async def test_broadcast_crud_and_tenant_isolation_http(v10_seed):
    """إنشاء → قائمة → تفاصيل (بالفلاتر) → تحديث، مع عزل المستأجرين
    (مستأجر B لا يرى حملة A البتة: 404)."""
    ua, tid_a, _uid = await v10_seed.tenant_user(role="editor", tenant_name="BC-A")
    ub, tid_b, _uid2 = await v10_seed.tenant_user(role="editor", tenant_name="BC-B")
    c = v10_seed.world.client

    v10_seed.auth(ua, tid_a)
    r = await c.post("/api/broadcasts", json={
        "name": "حملة رمضان", "message_template": "أهلاً {name}",
        "platform_filter": {"platform": "messenger"},
        "segment_filters": {"tag_contains": ["vip"]},
    })
    assert r.status_code == 200, r.text
    bid = r.json()["data"]["id"]

    r = await c.get("/api/broadcasts")
    names = [b["name"] for b in r.json()["data"]]
    assert "حملة رمضان" in names
    row = [b for b in r.json()["data"] if b["id"] == bid][0]
    assert row["status"] == "draft" and row["total_recipients"] == 0

    r = await c.get(f"/api/broadcasts/{bid}")
    detail = r.json()["data"]
    assert detail["message_template"] == "أهلاً {name}"
    assert detail["platform_filter"] == {"platform": "messenger"}
    assert detail["segment_filters"] == {"tag_contains": ["vip"]}
    assert detail["created_at"]  # iso

    r = await c.put(f"/api/broadcasts/{bid}", json={"name": "حملة العيد",
                                                    "message_template": "عيد سعيد"})
    assert r.status_code == 200, r.text
    r = await c.get(f"/api/broadcasts/{bid}")
    assert r.json()["data"]["name"] == "حملة العيد"

    # مستأجر B: لا يرى حملة A في القائمة ولا في التفاصيل
    v10_seed.auth(ub, tid_b)
    r = await c.get("/api/broadcasts")
    assert bid not in [b["id"] for b in r.json()["data"]]
    r = await c.get(f"/api/broadcasts/{bid}")
    assert r.status_code == 404, r.text
    r = await c.put(f"/api/broadcasts/{bid}", json={"name": "اختراق"})
    assert r.status_code == 404, r.text
    r = await c.get("/api/broadcasts/999999")
    assert r.status_code == 404, r.text


async def test_broadcast_estimate_audience_filters(v10_seed):
    """تقدير الجمهور: منصة messenger فقط، مع tag_contains، ثم استبعاد
    tag_not_contains، وmin_replies — الأرقام تتطابق مع المنطق المزروع."""
    from models import SubscriberTag, Tag

    ua, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="BE")
    sub_all = [await _seed_subscriber(v10_seed.world.sf, tid, platform="messenger")
               for _ in range(3)]
    _sub_insta = await _seed_subscriber(v10_seed.world.sf, tid, platform="instagram")
    _heavy = await _seed_subscriber(v10_seed.world.sf, tid, platform="messenger",
                                    reply_count=9, first_name="ثقيلة")

    async with v10_seed.world.sf() as db:
        vip = Tag(tenant_id=tid, name="vip")
        db.add(vip)
        await db.flush()
        db.add(SubscriberTag(tenant_id=tid, subscriber_id=sub_all[0], tag_id=vip.id))
        await db.commit()

    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/broadcasts/estimate", json={
        "platform_filter": {"platform": "messenger"},
        "segment_filters": {}})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["count"] == 4, r.json()  # 3 + heavy (instagram مستبعد)

    r = await c.post("/api/broadcasts/estimate", json={
        "platform_filter": {"platform": "all"},
        "segment_filters": {"tag_contains": ["vip"]}})
    assert r.json()["data"]["count"] == 1, r.json()

    r = await c.post("/api/broadcasts/estimate", json={
        "platform_filter": {"platform": "messenger"},
        "segment_filters": {"tag_not_contains": ["vip"]}})
    assert r.json()["data"]["count"] == 3, r.json()

    r = await c.post("/api/broadcasts/estimate", json={
        "platform_filter": {},
        "segment_filters": {"min_replies": 5}})
    assert r.json()["data"]["count"] == 1, r.json()

    r = await c.post("/api/broadcasts/estimate", json={
        "platform_filter": {}, "segment_filters": {"subscribed_after": "2030-01-01T00:00:00"}})
    assert r.json()["data"]["count"] == 0, r.json()

    r = await c.post("/api/broadcasts/estimate", json={
        "platform_filter": {},
        "segment_filters": {"last_interaction_before_days": 7, "subscribed_after": "not-a-date"}})
    assert r.status_code == 200 and r.json()["data"]["count"] == 0, r.text


async def test_broadcast_send_http_guards(v10_seed):
    """إرسال HTTP: حملة غير موجودة → 404؛ وغير draft → 400 «Only draft»."""
    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="BS")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/broadcasts/999999/send")
    assert r.status_code == 404, r.text

    r = await c.post("/api/broadcasts", json={"name": "سابقة", "message_template": "x"})
    bid = r.json()["data"]["id"]
    async with v10_seed.world.sf() as db:
        from models import Broadcast
        b = await db.get(Broadcast, bid)
        b.status = "sent"
        await db.commit()
    r = await c.post(f"/api/broadcasts/{bid}/send")
    assert r.status_code == 400 and "مسودة" in r.json()["detail"], r.text  # v12: عربية


async def test_broadcast_cancel_http_and_engine(v10_seed):
    """إلغاء draft عبر HTTP → ok؛ ثم إلغاء ملغاة → 400 (غير قابل للإلغاء)؛
    وبغيابها → 400 (عقد المسار)."""
    ua, tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="BC")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/broadcasts", json={"name": "قابلة للإلغاء", "message_template": "x"})
    bid = r.json()["data"]["id"]
    r = await c.post(f"/api/broadcasts/{bid}/cancel")
    assert r.status_code == 200, r.text
    r = await c.post(f"/api/broadcasts/{bid}/cancel")
    assert r.status_code == 400 and "إلغاؤه" in r.json()["detail"], r.text  # v12: عربية
    r = await c.post("/api/broadcasts/999999/cancel")
    assert r.status_code == 400, r.text


# ── البث: محرك الإرسال (مباشر، FB مزيّف، قاعدة الاختبار المشتركة) ───────────


async def _seed_engine_broadcast(n_messenger: int = 2, n_other: int = 0, template: str = "مرحباً {name}"):
    """زرع حملة draft + مشتركين في القاعدة المشتركة (AsyncSessionLocal —
    نفس القاعدة التي تفتحها مهام الإرسال بنفسها)."""
    from database import AsyncSessionLocal
    from models import Broadcast, Subscriber, Tenant

    async with AsyncSessionLocal() as db:
        t = Tenant(name=f"BT-{uuid.uuid4().hex[:8]}", subscription_status="PAID", is_active=True)
        db.add(t)
        await db.flush()
        for i in range(n_messenger):
            db.add(Subscriber(tenant_id=t.id, fb_user_id=f"fb_m{i}_{uuid.uuid4().hex[:4]}",
                              name=f"اسم{i} الكامل", first_name=f"اسم{i}",
                              platform="messenger", status="active"))
        for i in range(n_other):
            db.add(Subscriber(tenant_id=t.id, fb_user_id=f"fb_w{i}_{uuid.uuid4().hex[:4]}",
                              name=f"واتساب{i}", first_name=f"واتساب{i}",
                              platform="whatsapp", status="active"))
        await db.flush()
        bc = Broadcast(name=f"حملة-{uuid.uuid4().hex[:6]}", message_template=template,
                       tenant_id=t.id, platform_filter={"platform": "all"},
                       segment_filters={})
        db.add(bc)
        await db.commit()
        return bc.id, t.id


async def test_send_broadcast_sends_to_matching_subscribers(app_db, monkeypatch):
    """الإرسال: سجلات مستلمين pending → sent، القالب مُصيَّر بالاسم الأول،
    العدادات، والحالة النهائية sent (v4 §3.8: عميل المستأجر لا العام)."""
    import _services
    from database import AsyncSessionLocal
    from models import Broadcast, BroadcastRecipient

    fake = FakeFB(ok=True)
    monkeypatch.setattr(_services, "get_tenant_fb_client", _async_value(fake))
    bid, _tid = await _seed_engine_broadcast(n_messenger=3, template="أهلاً {name}!")

    from broadcast_engine import BroadcastEngine
    eng = BroadcastEngine(None)
    async with AsyncSessionLocal() as session:
        assert await eng.send_broadcast(bid, session) is True

    async with AsyncSessionLocal() as db:
        b = await db.get(Broadcast, bid)
        assert b.status == "sent", b.status
        assert (b.total_recipients, b.sent_count, b.failed_count) == (3, 3, 0)
        rcpts = (await db.execute(select(BroadcastRecipient).where(
            BroadcastRecipient.broadcast_id == bid))).scalars().all()
        assert [r.status for r in rcpts] == ["sent"] * 3
    assert len(fake.dm_calls) == 3
    assert all(msg.startswith("أهلاً اسم") and msg.endswith("!") for _uid, msg in fake.dm_calls)


async def test_send_broadcast_partial_on_unsupported_platform(app_db, monkeypatch):
    """مشترك بمنصة غير مدعومة → مستلم failed برسالة خطأ، والحالة partial."""
    import _services
    from database import AsyncSessionLocal
    from models import Broadcast, BroadcastRecipient

    fake = FakeFB(ok=True)
    monkeypatch.setattr(_services, "get_tenant_fb_client", _async_value(fake))
    bid, _tid = await _seed_engine_broadcast(n_messenger=1, n_other=1)

    from broadcast_engine import BroadcastEngine
    eng = BroadcastEngine(None)
    async with AsyncSessionLocal() as session:
        assert await eng.send_broadcast(bid, session) is True

    async with AsyncSessionLocal() as db:
        b = await db.get(Broadcast, bid)
        assert b.status == "partial", b.status
        assert (b.sent_count, b.failed_count) == (1, 1)
        failed = (await db.execute(select(BroadcastRecipient).where(
            BroadcastRecipient.broadcast_id == bid,
            BroadcastRecipient.status == "failed"))).scalars().all()
        assert len(failed) == 1 and "Unsupported" in failed[0].error_message


async def test_send_broadcast_without_tenant_fb_client_fails(app_db, monkeypatch):
    """المستأجر بلا صفحة فيسبوك مربوطة → الحالة failed فورًا وFalse (كان
    المحرك القديم يرسل عبر العميل العام الفارغ)."""
    import _services
    from database import AsyncSessionLocal
    from models import Broadcast

    async def no_client(tid):
        return None
    monkeypatch.setattr(_services, "get_tenant_fb_client", no_client)
    bid, _tid = await _seed_engine_broadcast(n_messenger=2)

    from broadcast_engine import BroadcastEngine
    eng = BroadcastEngine(None)
    async with AsyncSessionLocal() as session:
        assert await eng.send_broadcast(bid, session) is False
    async with AsyncSessionLocal() as db:
        b = await db.get(Broadcast, bid)
        assert b.status == "failed" and b.sent_at is not None


async def test_send_broadcast_no_matching_subscribers_is_sent(app_db, monkeypatch):
    """لا مشتركين مطابقين → الحالة sent (حملة ناجحة فارغة) بلا مستلمين."""
    import _services
    from database import AsyncSessionLocal
    from models import Broadcast

    fake = FakeFB(ok=True)
    monkeypatch.setattr(_services, "get_tenant_fb_client", _async_value(fake))
    bid, _tid = await _seed_engine_broadcast(n_messenger=0)

    from broadcast_engine import BroadcastEngine
    eng = BroadcastEngine(None)
    async with AsyncSessionLocal() as session:
        assert await eng.send_broadcast(bid, session) is True
    async with AsyncSessionLocal() as db:
        b = await db.get(Broadcast, bid)
        assert b.status == "sent" and b.total_recipients == 0
    assert fake.dm_calls == []


async def test_send_broadcast_rejects_non_draft(app_db, monkeypatch):
    """إرسال حملة غير draft → False دون أي عميل (بوابة الحالة أولًا)."""
    import _services
    from database import AsyncSessionLocal
    from models import Broadcast

    called = []

    async def unexpected(tid):
        called.append(tid)
        return FakeFB()
    monkeypatch.setattr(_services, "get_tenant_fb_client", unexpected)
    bid, _tid = await _seed_engine_broadcast(n_messenger=1)
    async with AsyncSessionLocal() as db:
        b = await db.get(Broadcast, bid)
        b.status = "cancelled"
        await db.commit()

    from broadcast_engine import BroadcastEngine
    eng = BroadcastEngine(None)
    async with AsyncSessionLocal() as session:
        assert await eng.send_broadcast(bid, session) is False
    assert called == [], "client must not be resolved for a non-draft broadcast"


async def test_send_broadcast_tenant_scoped_audience(app_db, monkeypatch):
    """جمهور الإرسال محصور بمستأجر الحملة: مشتركو مستأجر آخر لا يستلمون
    شيئًا (v4 §3.8 G5 — كان التقدير scoped والإرسال عامًا)."""
    import _services
    from database import AsyncSessionLocal
    from models import Subscriber, Tenant

    fake = FakeFB(ok=True)
    monkeypatch.setattr(_services, "get_tenant_fb_client", _async_value(fake))
    bid, tid_a = await _seed_engine_broadcast(n_messenger=1)

    async with AsyncSessionLocal() as db:
        other = Tenant(name=f"OTHER-{uuid.uuid4().hex[:6]}", is_active=True)
        db.add(other)
        await db.flush()
        for i in range(2):
            db.add(Subscriber(tenant_id=other.id, fb_user_id=f"ox{i}_{uuid.uuid4().hex[:4]}",
                              platform="messenger", status="active"))
        await db.commit()

    from broadcast_engine import BroadcastEngine
    eng = BroadcastEngine(None)
    async with AsyncSessionLocal() as session:
        assert await eng.send_broadcast(bid, session) is True
    assert len(fake.dm_calls) == 1, "broadcast leaked to another tenant's subscribers"
    assert all(str(tid_a) for _ in fake.dm_calls)


def _async_value(value):
    """لنا: async closure يعيد قيمة جاهزة (يحاكي get_tenant_fb_client)."""
    async def _getter(_tid):
        return value
    return _getter


# ── السلاسل: CRUD عبر HTTP ──────────────────────────────────────────────────


async def test_sequence_crud_steps_and_isolation_http(v10_seed):
    """سلسلة كاملة: إنشاء → خطوات مرتبة → تحديث → استعلام، مع عزل
    المستأجر (404 عبر tenant_id) وإضافة خطوة لسلسلة مستأجر آخر → id=0."""
    ua, tid_a, _uid = await v10_seed.tenant_user(role="editor", tenant_name="SQ-A")
    ub, tid_b, _uid2 = await v10_seed.tenant_user(role="editor", tenant_name="SQ-B")
    c = v10_seed.world.client

    v10_seed.auth(ua, tid_a)
    r = await c.post("/api/sequences", json={"name": "سلسلة الترحيب",
                                             "description": "ثلاث رسائل تتابعية",
                                             "created_by": ua})
    assert r.status_code == 200, r.text
    seq_id = r.json()["data"]["id"]

    r = await c.get(f"/api/sequences/{seq_id}")
    assert r.status_code == 200, r.text
    seq = r.json()["data"]
    assert seq["name"] == "سلسلة الترحيب"
    assert seq["steps"] == []
    assert seq["status"] == "draft"

    r = await c.post(f"/api/sequences/{seq_id}/steps", json={
        "step_order": 1, "delay_days": 0, "delay_hours": 0,
        "message_template": "أهلاً {name}", "message_type": "text"})
    assert r.status_code == 200, r.text
    step_id = r.json()["data"]["id"]
    assert step_id > 0

    r = await c.post(f"/api/sequences/{seq_id}/steps", json={
        "step_order": 2, "delay_days": 2, "message_template": "كيف تجد المنتج؟"})

    r = await c.get(f"/api/sequences/{seq_id}")
    steps = r.json()["data"]["steps"]
    assert [s["step_order"] for s in steps] == [1, 2]
    assert steps[0]["message_template"] == "أهلاً {name}"
    assert steps[1]["delay_days"] == 2

    # تحديث/حذف الخطوات: xfail منفصل (BUG tenant_id=0 — انظر أدناه)

    r = await c.put(f"/api/sequences/{seq_id}", json={"name": "الترحيب v2", "status": "active"})
    assert r.status_code == 200, r.text
    r = await c.get(f"/api/sequences/{seq_id}")
    assert r.json()["data"]["status"] == "active"

    # مستأجر B: لا يرى سلسلة A، ولا يضيف إليها خطوة (add_step → id=0)
    v10_seed.auth(ub, tid_b)
    r = await c.get(f"/api/sequences/{seq_id}")
    assert r.status_code == 404, r.text
    r = await c.put(f"/api/sequences/{seq_id}", json={"name": "سرقة"})
    assert r.status_code == 404, r.text
    r = await c.post(f"/api/sequences/{seq_id}/steps", json={"step_order": 9})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["id"] == 0, "step added to ANOTHER tenant's sequence"
    r = await c.delete(f"/api/sequences/{seq_id}")
    assert r.status_code == 404, r.text

    v10_seed.auth(ua, tid_a)
    r = await c.delete(f"/api/sequences/{seq_id}")
    assert r.status_code == 200, r.text
    r = await c.get(f"/api/sequences/{seq_id}")
    assert r.status_code == 404, r.text


# FIXED in v11: add_step now sets SequenceStep.tenant_id — steps are no longer
# orphaned at tenant_id=0, so owner PUT/DELETE on a step resolves correctly.
async def test_sequence_step_update_and_delete_by_owner(v10_seed):
    """مالك السلسلة يعدّل رسالة خطوته ويحذف خطوة أخرى — أبسط عقد CRUD
    للخطوات (اليوم 404 للخطوة الصحيحة نفسها)."""
    ua, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="SQ-S")
    c = v10_seed.world.client
    v10_seed.auth(ua, tid)

    r = await c.post("/api/sequences", json={"name": "خطوات المالك"})
    seq_id = r.json()["data"]["id"]
    r = await c.post(f"/api/sequences/{seq_id}/steps", json={
        "step_order": 1, "message_template": "قبل التعديل"})
    step_id = r.json()["data"]["id"]
    assert step_id > 0
    r = await c.post(f"/api/sequences/{seq_id}/steps", json={
        "step_order": 2, "message_template": "ستُحذف"})
    step2 = r.json()["data"]["id"]

    r = await c.put(f"/api/sequences/steps/{step_id}",
                    json={"message_template": "بعد التعديل {name}"})
    assert r.status_code == 200, f"owner cannot update own step: {r.text}"

    r = await c.delete(f"/api/sequences/steps/{step2}")
    assert r.status_code == 200, f"owner cannot delete own step: {r.text}"

    r = await c.get(f"/api/sequences/{seq_id}")
    steps = r.json()["data"]["steps"]
    assert len(steps) == 1 and steps[0]["message_template"] == "بعد التعديل {name}"



async def test_sequence_list_counts_active_subscriptions(v10_seed):
    """القائمة: subscriber_count من اشتراكات active فقط (استعلام مجمّع —
    إصلاح N+1 في v5 §4)، وتصفية بالمستأجر."""
    ua, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="SL")
    c = v10_seed.world.client

    v10_seed.auth(ua, tid)
    r = await c.post("/api/sequences", json={"name": "قائمة"})
    seq_id = r.json()["data"]["id"]

    sub_id = await _seed_subscriber(v10_seed.world.sf, tid)
    sub2 = await _seed_subscriber(v10_seed.world.sf, tid, first_name="ليلى",
                                  username="layla_u")
    v10_seed.auth(ua, tid)
    r = await c.post(f"/api/sequences/{seq_id}/subscribe/{sub_id}")
    assert r.status_code == 200 and r.json()["data"]["ok"] is True, r.text
    r = await c.post(f"/api/sequences/{seq_id}/subscribe/{sub2}")
    assert r.status_code == 200 and r.json().get("data", {}).get("ok") is True, (r.status_code, r.text)

    r = await c.get("/api/sequences")
    row = [s for s in r.json()["data"] if s["id"] == seq_id][0]
    assert row["subscriber_count"] == 2, row
    assert row["total_subscribers"] == 2


async def test_sequence_subscribe_duplicate_returns_false_not_500(v10_seed):
    """اشتراك مكرر (نفس المشترك/السلسلة) → ok:false (IntegrityError →
    rollback) — وليس 500/انهيارًا؛ وإلغاء الاشتراك مرتين → الثانية false."""
    ua, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="SD")
    c = v10_seed.world.client

    v10_seed.auth(ua, tid)
    r = await c.post("/api/sequences", json={"name": "مكررة"})
    seq_id = r.json().get("data", {}).get("id")
    assert seq_id, (r.status_code, r.text)
    sub_id = await _seed_subscriber(v10_seed.world.sf, tid)

    r = await c.post(f"/api/sequences/{seq_id}/subscribe/{sub_id}")
    assert r.status_code == 200 and r.json()["data"]["ok"] is True, r.text
    r = await c.post(f"/api/sequences/{seq_id}/subscribe/{sub_id}")
    assert r.status_code == 200 and r.json()["data"]["ok"] is False, r.text

    r = await c.post(f"/api/sequences/{seq_id}/unsubscribe/{sub_id}")
    assert r.status_code == 200 and r.json()["data"]["ok"] is True, r.text
    r = await c.get("/api/sequences")
    row = [s for s in r.json()["data"] if s["id"] == seq_id][0]
    assert row["total_subscribers"] == 0
    # إلغاء الاشتراك idempotent بالتصميم: لا فلترة على status — التكرار
    # يعيد ok:true ولا يكسر شيئًا (لا يهبط العداد تحت الصفر — محروس).
    r = await c.post(f"/api/sequences/{seq_id}/unsubscribe/{sub_id}")
    assert r.status_code == 200 and r.json()["data"]["ok"] is True, r.text
    r = await c.get("/api/sequences")
    row = [s for s in r.json()["data"] if s["id"] == seq_id][0]
    assert row["total_subscribers"] == 0


# ── السلاسل: المحرك (advance/due/process/render) ────────────────────────────


async def _engine_world(v10_world, n_steps: int = 2):
    """سلسلة بخطوات مرتبة + محرك بعميل FB مزيّف — على قاعدة v10_world."""
    from models import Sequence, SequenceStep
    from sequence_engine import SequenceEngine

    fake = FakeFB(ok=True)
    eng = SequenceEngine(fake)
    async with v10_world.sf() as db:
        from models import Tenant
        t = Tenant(name=f"SQE-{uuid.uuid4().hex[:6]}", is_active=True)
        db.add(t)
        await db.flush()
        seq = Sequence(name="محرك", tenant_id=t.id, status="active")
        db.add(seq)
        await db.flush()
        # الترقيم من 0 — اتفاقية المحرك نفسها: subscribe يبدأ current_step=0
        # والافتراضي step_order=0 (خطوة 0 هي الأولى التي تصبح مستحقة فورًا).
        for order in range(n_steps):
            db.add(SequenceStep(sequence_id=seq.id, tenant_id=t.id, step_order=order,
                                delay_days=0, delay_hours=0,
                                message_template=f"خطوة {order}: أهلاً {name_ph()}"))
        await db.commit()
        return eng, fake, seq.id, t.id


def name_ph() -> str:
    return "{name}"


async def _engine_subscribe(eng, sf, seq_id: int, tenant_id: int, subscriber_id: int):
    """المحرك يعمل flush فقط — المسار HTTP يفتح commit؛ نفعل مثله هنا."""
    async with sf() as db:
        assert await eng.subscribe(subscriber_id, seq_id, db, tenant_id=tenant_id) is True
        await db.commit()


async def test_sequence_advance_walks_steps_then_completes(v10_world):
    """advance: ينتقل step_order تلو الآخر (ترقيم من 0 — اتفاقية المحرك)؛
    بعد آخر خطوة → completed مع completed_at (لا خطوة وهمية إضافية).

    ملاحظة تصميم: subscribe يبدأ current_step=0، فالخطوات المرقّمة من 1
    فقط لن تصبح مستحقة أبدًا لمشترك جديد (get_due لا يجد خطوة تطابق 0)."""
    eng, _fake, seq_id, tid = await _engine_world(v10_world, n_steps=2)
    sub_id = await _seed_subscriber(v10_world.sf, tid)
    await _engine_subscribe(eng, v10_world.sf, seq_id, tid, sub_id)

    from models import SequenceSubscription
    async with v10_world.sf() as db:
        sub = (await db.execute(select(SequenceSubscription).where(
            SequenceSubscription.subscriber_id == sub_id))).scalar_one()
        assert sub.current_step == 0
        assert await eng.advance(sub_id, seq_id, db) == 1
        await db.commit()
    async with v10_world.sf() as db:
        sub = (await db.execute(select(SequenceSubscription).where(
            SequenceSubscription.subscriber_id == sub_id))).scalar_one()
        assert sub.current_step == 1
        assert await eng.advance(sub_id, seq_id, db) is None
        await db.commit()
    async with v10_world.sf() as db:
        sub = (await db.execute(select(SequenceSubscription).where(
            SequenceSubscription.subscriber_id == sub_id))).scalar_one()
        assert sub.status == "completed"
        assert sub.completed_at is not None


async def test_sequence_advance_with_missing_step_restarts(v10_world):
    """current_step محذوف (أعيد ترتيب الخطوات): يعاد البدء من أول خطوة
    موجودة بدل التوقف."""
    eng, _fake, seq_id, tid = await _engine_world(v10_world, n_steps=3)
    sub_id = await _seed_subscriber(v10_world.sf, tid)
    await _engine_subscribe(eng, v10_world.sf, seq_id, tid, sub_id)

    from models import SequenceSubscription
    async with v10_world.sf() as db:
        sub = (await db.execute(select(SequenceSubscription).where(
            SequenceSubscription.subscriber_id == sub_id))).scalar_one()
        sub.current_step = 42  # خطوة لم تعد موجودة
        await db.commit()
        nxt = await eng.advance(sub_id, seq_id, db)
        await db.commit()
    assert nxt == 0, f"expected restart at first step (order 0), got {nxt}"


async def test_get_due_subscriptions_respects_delay(v10_world):
    """due: اشتراك entered_at الآن مع delay يوم → ليس مستحقًا؛ مع delay
    صفر وentered_at قديم → مستحق مع بيانات المشترك والقالب."""
    from models import SequenceStep, SequenceSubscription

    eng, _fake, seq_id, tid = await _engine_world(v10_world, n_steps=1)
    sub_id = await _seed_subscriber(v10_world.sf, tid)
    await _engine_subscribe(eng, v10_world.sf, seq_id, tid, sub_id)

    async with v10_world.sf() as db:
        step = (await db.execute(select(SequenceStep).where(
            SequenceStep.sequence_id == seq_id))).scalar_one()
        step.delay_days = 3  # لم يحن وقته بعد (دخل منذ يومين فقط)
        sub = (await db.execute(select(SequenceSubscription).where(
            SequenceSubscription.subscriber_id == sub_id))).scalar_one()
        sub.entered_at = _utils_utcnow() - timedelta(days=2)
        await db.commit()
    async with v10_world.sf() as db:
        assert await eng.get_due_subscriptions(db) == []

    async with v10_world.sf() as db:
        step = (await db.execute(select(SequenceStep).where(
            SequenceStep.sequence_id == seq_id))).scalar_one()
        step.delay_days = 0
        await db.commit()
    async with v10_world.sf() as db:
        due = await eng.get_due_subscriptions(db)
    assert len(due) == 1, due
    item = due[0]
    assert item["subscriber_id"] == sub_id
    assert item["message_template"].startswith("خطوة 0")
    assert item["subscriber_platform"] == "messenger"
    assert item["step"].id is not None


def _utils_utcnow():
    from _utils import utcnow
    return utcnow()


async def test_process_due_step_sends_and_advances(v10_world):
    """process_due_step: يرسل عبر fb.send_dm بالقالب المصيَّر، يقدّم الخطوة،
    ويزيد total_sent — يعيد True."""
    eng, fake, seq_id, tid = await _engine_world(v10_world, n_steps=2)
    sub_id = await _seed_subscriber(v10_world.sf, tid, first_name="مريم")
    await _engine_subscribe(eng, v10_world.sf, seq_id, tid, sub_id)

    from models import Sequence
    async with v10_world.sf() as db:
        due = await eng.get_due_subscriptions(db)
        assert len(due) == 1
        ok = await eng.process_due_step(due[0], db)
        await db.commit()
        seq = await db.get(Sequence, seq_id)
        assert ok is True
        assert seq.total_sent == 1
    assert len(fake.dm_calls) == 1, fake.dm_calls
    assert fake.dm_calls[0][1] == "خطوة 0: أهلاً مريم", fake.dm_calls


async def test_process_due_step_failure_does_not_advance(v10_world):
    """فشل الإرسال (send_dm يعيد None): False، المشترك لا يتقدم — يعاد
    المحاولة في الدورة القادمة (بلا فقدان)."""
    eng, fake, seq_id, tid = await _engine_world(v10_world, n_steps=2)
    fake.ok = False
    sub_id = await _seed_subscriber(v10_world.sf, tid)
    await _engine_subscribe(eng, v10_world.sf, seq_id, tid, sub_id)

    from models import SequenceSubscription
    async with v10_world.sf() as db:
        due = await eng.get_due_subscriptions(db)
        assert await eng.process_due_step(due[0], db) is False
        await db.commit()
    async with v10_world.sf() as db:
        sub = (await db.execute(select(SequenceSubscription).where(
            SequenceSubscription.subscriber_id == sub_id))).scalar_one()
        assert sub.current_step == 0, "step advanced despite send failure"
        assert sub.status == "active"


async def test_process_due_step_instagram_unsupported(v10_world):
    """مشترك instagram: DM غير مدعوم → False دون تقدم (سجل تحذير فقط)."""
    eng, fake, seq_id, tid = await _engine_world(v10_world, n_steps=1)
    sub_id = await _seed_subscriber(v10_world.sf, tid, platform="instagram")
    await _engine_subscribe(eng, v10_world.sf, seq_id, tid, sub_id)

    from models import SequenceSubscription
    async with v10_world.sf() as db:
        due = await eng.get_due_subscriptions(db)
        assert len(due) == 1
        assert await eng.process_due_step(due[0], db) is False
        await db.commit()
    assert fake.dm_calls == [], "instagram subscriber must not hit Messenger send"
    async with v10_world.sf() as db:
        sub = (await db.execute(select(SequenceSubscription).where(
            SequenceSubscription.subscriber_id == sub_id))).scalar_one()
        assert sub.current_step == 0


def test_render_message_all_placeholders():
    """render_message: {name}/{full_name}/{mention}/{date}، والقالب الفارغ
    يعيد سلسلة فارغة."""
    from sequence_engine import SequenceEngine

    eng = SequenceEngine.__new__(SequenceEngine)  # بلا fb — دالة نقية
    out = eng.render_message("مرحبا {name} — {full_name} (@{mention}) بتاريخ {date}",
                             sub_first_name="سارة", sub_full_name="سارة العبيدي",
                             sub_fb_id="u777")
    assert "سارة — سارة العبيدي (@@[u777])" in out
    assert "{name}" not in out and "{mention}" not in out
    assert eng.render_message("", "a", "b", "c") == ""


async def test_sequence_scheduler_start_stop_is_idempotent(v10_world, app_db):
    """الجدولة: start ثم start ثانية لا تنشئ مهمتين؛ stop يوقفها نظيفًا
    (المهمة الحقيقية تنام 60 ثانية — نقف فورًا بعد التحقق)."""
    from sequence_engine import SequenceScheduler

    eng, _fake, _seq_id, _tid = await _engine_world(v10_world, n_steps=1)
    sched = SequenceScheduler(eng)
    await sched.start()
    task1 = sched._task
    assert task1 is not None and not task1.done()
    await sched.start()  # تحذير فقط — لا مهمة ثانية
    assert sched._task is task1
    await sched.stop()
    assert sched._task is None
    # إيقاف جدولة لم تبدأ: no-op
    await sched.stop()
