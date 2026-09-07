"""v14-E2 — المحركات والتزامن: بوابات الإصلاح لكل مهمة من مهام E2.

كل اختبار هنا يقترن بإصلاح موثق في تقرير v14-E2 (audit-reports/):
  [C-ENG1] PublisherEngine singleton → محرك fresh لكل طلب:
           - الحالة per-tenant عبر HTTP (لا تسريب configured بين المستأجرين)
           - سباق التحميل المتزامن: كل مستأجر ينشر باعتماداته هو
  [C-ENG2] CalendarScheduler: اعتماد per-tenant + تخطي بلا اعتماد +
           سقف 3 محاولات → failed مع سبب دائم
  [SEQ]    SequenceScheduler: نطاق مستأجر + تخطي بلا اعتماد + سقف محاولات
  [FLOW]   /api/flows/{id}/test كان ميتاً (tenant_id=0) — الآن يعمل لمستأجره
  [SUB]    عزل المستأجر: ردود get_detail + ملكية delete_tag (سالبان)
  [PDF]    WeasyPrint عبر to_thread — الحلقة تظل حية أثناء التوليد
  [WS]     التوكن من header أولاً + فحص token_ver
  [SSE]    جلسة واحدة لكل اتصال + قراءات طازجة + سقف 5 اتصالات/مستأجر (429)
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
import time
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

from sqlalchemy import select  # noqa: E402

from _utils import utcnow  # noqa: E402


# ── تنظيف حالة المحركات المشتركة (module-level) بين الاختبارات ────────────────
@pytest.fixture(autouse=True)
def _reset_e2_engine_state():
    yield
    from _services import content_calendar_engine, sequence_engine
    try:
        content_calendar_engine._publish_attempts.clear()
    except Exception:
        pass
    try:
        sequence_engine._attempts.clear()
    except Exception:
        pass
    try:
        import routers.payments.sse as _sse
        _sse._sse_tenant_counts.clear()
    except Exception:
        pass


# ════════════════════════════════════════════════════════════════════════════
# [C-ENG1] Publisher — محرك fresh لكل طلب (لا singleton بحالة مستأجر)
# ════════════════════════════════════════════════════════════════════════════


async def test_publisher_status_reflects_calling_tenant_only(v10_seed):
    """الحالة عبر HTTP تخص المستأجر الطالب: A يضبط X؛ B (بلا اعتماد) يرى
    x.configured=false — الsingleton القديم كان يعرض حالة آخر مستأجر حمّل."""
    c = v10_seed.world.client
    ua, _tid_a, _uid = await v10_seed.tenant_user(role="admin", tenant_name="ENG-PA")
    ub, _tid_b, _uid2 = await v10_seed.tenant_user(role="admin", tenant_name="ENG-PB")

    await v10_seed.login(ua)
    r = await c.post("/api/publisher/configure", json={
        "platform": "x",
        "credentials": {"api_key": "kA", "api_secret": "sA", "access_token": "tA"},
    })
    assert r.status_code == 200, r.text

    await v10_seed.login(ub)
    r = await c.get("/api/publisher/status")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["x"]["configured"] is False, "tenant B saw tenant A's credentials state"

    await v10_seed.login(ua)
    r = await c.get("/api/publisher/status")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["x"]["configured"] is True, "tenant A lost its own state"


async def test_publisher_interleaved_load_publish_uses_own_credentials(v10_world, monkeypatch):
    """C-ENG1 — إثبات السباق: مهمتان متزامنتان (load → مهلة → publish) لكل
    مستأجر على الرمز المشترك ``_publisher``؛ كل نشر يستخدم اعتمادات مستأجره
    (الsingleton القديم كان ينشر بع اعتمادات آخر من حمّل)."""
    import publisher_engine as pe
    from _crypto import encrypt_token
    from _services import _publisher
    from models import BotState

    async with v10_world.sf() as db:
        for tid, key in ((910, "keyA"), (920, "keyB")):
            for field, val in (("api_key", key), ("api_secret", "sec"), ("access_token", f"tok-{key}")):
                db.add(BotState(tenant_id=tid, key=f"publisher_x_{field}", value=encrypt_token(val)))
        await db.commit()

    used: list[tuple[str, str]] = []

    class SpyX(pe.XPublisher):
        async def publish(self, message: str, image_url: str = "") -> dict | None:
            used.append((self.api_key, message))
            await asyncio.sleep(0.01)
            return {"platform": "x", "post_id": "spy"}

    monkeypatch.setattr(pe, "XPublisher", SpyX)

    async def tenant_flow(tid: int, key: str):
        async with v10_world.sf() as db:
            await _publisher.load_credentials(db, tenant_id=tid)
        # نافذة السباق: المستأجر الآخر يحمّل اعتماداته هنا (بين load و publish)
        await asyncio.sleep(0.05)
        return await _publisher.publish_to_platform("x", f"msg-{key}")

    results = await asyncio.gather(
        tenant_flow(910, "keyA"),
        tenant_flow(920, "keyB"),
    )
    assert all(results), "both publishes must succeed"
    assert sorted(used) == [("keyA", "msg-keyA"), ("keyB", "msg-keyB")], (
        f"cross-tenant credential leak: publishes used {used}"
    )


# ════════════════════════════════════════════════════════════════════════════
# [C-ENG2] CalendarScheduler — اعتماد per-tenant + سقف محاولات + failed
# ════════════════════════════════════════════════════════════════════════════


class _RecorderFB:
    """عميل FB مزيّف: يسجّل نداءات post_to_page ويعيد نتيجة قابلة للضبط."""

    def __init__(self, ok: bool = True):
        self.calls: list[str] = []
        self.ok = ok

    async def post_to_page(self, message: str):
        self.calls.append(message)
        return {"id": "cal_post_1"} if self.ok else None


async def _seed_due_post(sf, tenant_id: int, message: str):
    from models import ScheduledPost
    async with sf() as db:
        post = ScheduledPost(tenant_id=tenant_id, message=message, platform="facebook",
                             status="scheduled", scheduled_at=utcnow() - timedelta(minutes=5))
        db.add(post)
        await db.commit()
        await db.refresh(post)
        return post.id


async def test_calendar_due_post_publishes_with_tenant_client(v10_world, monkeypatch):
    """النشر المجدول يمر بعميل المستأجر نفسه (get_tenant_fb_client(tid))
    — لا زبون المنصة العام — والمنشور يتحول published."""
    import _services
    from _services import content_calendar_engine as engine
    from _crypto import encrypt_token
    from models import BotState, ScheduledPost

    tid = 610
    async with v10_world.sf() as db:
        db.add(BotState(tenant_id=tid, key="fb_page_id", value="page-610"))
        db.add(BotState(tenant_id=tid, key="fb_access_token", value=encrypt_token("tok-610")))
        await db.commit()
    post_id = await _seed_due_post(v10_world.sf, tid, "عرض الجمعة البيضاء")

    rec = _RecorderFB(ok=True)

    async def fake_resolver(tenant_id):
        assert tenant_id == tid, f"calendar must resolve the POST's tenant, got {tenant_id}"
        return rec

    monkeypatch.setattr(_services, "get_tenant_fb_client", fake_resolver)

    async with v10_world.sf() as db:
        published = await engine.process_due_posts(db)
    assert published == 1
    assert rec.calls == ["عرض الجمعة البيضاء"]
    async with v10_world.sf() as db:
        post = await db.get(ScheduledPost, post_id)
        assert post.status == "published"
        assert post.fb_post_id == "cal_post_1"


async def test_calendar_skips_tenant_without_credentials(v10_world, monkeypatch):
    """لا صفحة مربوطة → تخطٍّ: لا نداء Graph ولا عدّ محاولات ولا تغيير حالة
    (بدل حلقة الفشل اللانهائية كل 60 ثانية) — المنشور يبقى scheduled."""
    import _services
    from _services import content_calendar_engine as engine
    from models import ScheduledPost

    tid = 770
    post_id = await _seed_due_post(v10_world.sf, tid, "إعلان بلا صفحة")

    async def fake_resolver(tenant_id):
        return None  # لا اعتماد

    monkeypatch.setattr(_services, "get_tenant_fb_client", fake_resolver)

    async with v10_world.sf() as db:
        assert await engine.process_due_posts(db) == 0
    async with v10_world.sf() as db:
        post = await db.get(ScheduledPost, post_id)
        assert post.status == "scheduled", "skip must not mutate the post"
    assert engine._publish_attempts == {}, "skip is not a failure — no attempts counted"


async def test_calendar_marks_failed_after_three_attempts_with_reason(v10_world, monkeypatch):
    """فشل Graph ثلاث مرات → status=failed + صف سبب دائم في bot_state،
    والمحاولة الرابعة لا تحدث (تحقق فعلي أن الحلقة توقفت)."""
    import _services
    from _services import content_calendar_engine as engine
    from _crypto import encrypt_token
    from models import BotState, ScheduledPost

    tid = 620
    async with v10_world.sf() as db:
        db.add(BotState(tenant_id=tid, key="fb_page_id", value="page-620"))
        db.add(BotState(tenant_id=tid, key="fb_access_token", value=encrypt_token("tok-620")))
        await db.commit()
    post_id = await _seed_due_post(v10_world.sf, tid, "منشور سيفشل")

    rec = _RecorderFB(ok=False)

    async def fake_resolver(tenant_id):
        return rec

    monkeypatch.setattr(_services, "get_tenant_fb_client", fake_resolver)

    for _cycle in range(3):
        async with v10_world.sf() as db:
            assert await engine.process_due_posts(db) == 0
    assert len(rec.calls) == 3, f"exactly {engine.MAX_PUBLISH_ATTEMPTS} Graph attempts, got {rec.calls}"

    async with v10_world.sf() as db:
        post = await db.get(ScheduledPost, post_id)
        assert post.status == "failed"
        reason = (await db.execute(
            select(BotState).where(BotState.tenant_id == tid,
                                   BotState.key == f"schedpost_fail_{post_id}")
        )).scalar_one_or_none()
        assert reason is not None and "محاولات" in reason.value, "durable failure reason row missing"

    # failed ≠ scheduled → الدورة القادمة لا تعيد المحاولة (لا حلقة لانهائية)
    async with v10_world.sf() as db:
        assert await engine.process_due_posts(db) == 0
    assert len(rec.calls) == 3


# ════════════════════════════════════════════════════════════════════════════
# [SEQ] SequenceScheduler — نطاق مستأجر + سقف محاولات (بروكسي _services)
# ════════════════════════════════════════════════════════════════════════════


class _FakeSeqFB:
    def __init__(self, ok: bool = True):
        self.dm_calls: list[tuple[str, str]] = []
        self.ok = ok

    async def send_dm(self, fb_user_id: str, message: str):
        self.dm_calls.append((fb_user_id, message))
        return {"message_id": "m1"} if self.ok else None


async def _seed_sequence_world(sf) -> tuple[int, int, int]:
    """مستأجر + سلسلة بخطوتين (0 و 1) + مشترك + اشتراك نشط مستحق الآن."""
    from models import Sequence, SequenceStep, SequenceSubscription, Subscriber, Tenant
    async with sf() as db:
        t = Tenant(name=f"E2SQ-{uuid.uuid4().hex[:6]}", is_active=True, subscription_status="PAID")
        db.add(t)
        await db.flush()
        seq = Sequence(name="سلسلة E2", tenant_id=t.id, status="active")
        db.add(seq)
        await db.flush()
        for order in (0, 1):
            db.add(SequenceStep(sequence_id=seq.id, tenant_id=t.id, step_order=order,
                                delay_days=0, delay_hours=0,
                                message_template=f"خطوة {order}: أهلاً {{name}}"))
        sub = Subscriber(tenant_id=t.id, fb_user_id=f"u_{uuid.uuid4().hex[:6]}",
                         name="مريم كاملة", first_name="مريم", platform="messenger", status="active")
        db.add(sub)
        await db.flush()
        db.add(SequenceSubscription(tenant_id=t.id, subscriber_id=sub.id, sequence_id=seq.id,
                                    current_step=0, status="active", entered_at=utcnow() - timedelta(days=1)))
        await db.commit()
        return t.id, seq.id, sub.id


async def test_sequence_proxy_resolves_tenant_client_and_sends(v10_world, monkeypatch):
    """الخطوة المستحقة تُرسل بعميل المستأجر نفسه (fresh engine) وتقدّم الخطوة،
    وdue يحمل tenant_id للمستأجر."""
    import _services
    from _services import sequence_engine as proxy
    from models import SequenceSubscription

    tid, _seq_id, sub_id = await _seed_sequence_world(v10_world.sf)
    fake = _FakeSeqFB(ok=True)
    seen: list[int] = []

    async def fake_resolver(tenant_id):
        seen.append(tenant_id)
        return fake

    monkeypatch.setattr(_services, "get_tenant_fb_client", fake_resolver)

    async with v10_world.sf() as db:
        due = await proxy.get_due_subscriptions(db)
        assert len(due) == 1
        assert due[0]["tenant_id"] == tid, "due must be tenant-annotated"
        sent = await proxy.process_due_step(due[0], db)
        await db.commit()
    assert sent is True
    assert seen == [tid], f"sequence send must use the tenant's client (got {seen})"
    assert len(fake.dm_calls) == 1
    assert "مريم" in fake.dm_calls[0][1]
    async with v10_world.sf() as db:
        sub = (await db.execute(select(SequenceSubscription).where(
            SequenceSubscription.subscriber_id == sub_id))).scalar_one()
        assert sub.current_step == 1, "step advanced after successful send"


async def test_sequence_skips_tenant_without_credentials(v10_world, monkeypatch):
    """لا اعتماد → تخطٍّ: لا إرسال، لا عدّ محاولات، الاشتراك يبقى active."""
    import _services
    from _services import sequence_engine as proxy
    from models import SequenceSubscription

    tid, _seq_id, sub_id = await _seed_sequence_world(v10_world.sf)

    async def fake_resolver(tenant_id):
        return None

    monkeypatch.setattr(_services, "get_tenant_fb_client", fake_resolver)

    async with v10_world.sf() as db:
        due = await proxy.get_due_subscriptions(db)
        assert await proxy.process_due_step(due[0], db) is False
    async with v10_world.sf() as db:
        sub = (await db.execute(select(SequenceSubscription).where(
            SequenceSubscription.subscriber_id == sub_id))).scalar_one()
        assert sub.status == "active"
    assert proxy._attempts == {}, "skip is not a failure"


async def test_sequence_marks_failed_after_cap(v10_world, monkeypatch):
    """ثلاث إرسالات فاشلة → الاشتراك failed (لا إعادة محاولة إلى الأبد)."""
    import _services
    from _services import sequence_engine as proxy
    from models import SequenceSubscription

    _tid, _seq_id, sub_id = await _seed_sequence_world(v10_world.sf)
    fake = _FakeSeqFB(ok=False)

    async def fake_resolver(tenant_id):
        return fake

    monkeypatch.setattr(_services, "get_tenant_fb_client", fake_resolver)

    async with v10_world.sf() as db:
        due = await proxy.get_due_subscriptions(db)
        for _ in range(proxy.MAX_SEND_ATTEMPTS):
            assert await proxy.process_due_step(due[0], db) is False
    async with v10_world.sf() as db:
        sub = (await db.execute(select(SequenceSubscription).where(
            SequenceSubscription.subscriber_id == sub_id))).scalar_one()
        assert sub.status == "failed", "subscription must be terminal after the cap"
    # failed ≠ active → get_due لم يعد يعيدها
    async with v10_world.sf() as db:
        assert await proxy.get_due_subscriptions(db) == []


# ════════════════════════════════════════════════════════════════════════════
# [FLOW] /api/flows/{id}/test — المسار الميت يعمل لمستأجره
# ════════════════════════════════════════════════════════════════════════════


async def test_flow_test_route_executes_own_tenant_flow(v10_seed):
    """كان tenant_id=0 دائماً → flow_not_found لكل مستأجر. الآن: التنفيذ يتم،
    سجل FlowExecution يُنشأ، والأثر يُحصى على تدفق المستأجر."""
    from models import Flow, FlowExecution

    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="ENG-FLW")
    await v10_seed.login(uname)
    c = v10_seed.world.client

    r = await c.post("/api/flows", json={
        "name": "تدفق ترحيب",
        "nodes": [{"id": "n1", "type": "TRIGGER", "data": {"triggerType": "manual"}}],
        "edges": [],
    })
    assert r.status_code == 200, r.text
    flow_id = r.json()["data"]["id"]

    r = await c.post(f"/api/flows/{flow_id}/test", json={"text": "مرحبا"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["trace"]["action"] == "passed", f"dead path answered: {data}"
    execution_id = data["execution_id"]

    async with v10_seed.world.sf() as db:
        assert await db.get(FlowExecution, execution_id) is not None, "execution row not persisted"
        flow = await db.get(Flow, flow_id)
        assert flow.total_replies == 1


async def test_flow_test_route_rejects_foreign_tenant(v10_seed):
    """مستأجر B لا يختبر تدفق A: 404 (فحص الملكية في المسار قبل المحرك)."""
    ua, _tid_a, _uid = await v10_seed.tenant_user(role="editor", tenant_name="ENG-FA")
    ub, _tid_b, _uid2 = await v10_seed.tenant_user(role="editor", tenant_name="ENG-FB")
    await v10_seed.login(ua)
    c = v10_seed.world.client
    r = await c.post("/api/flows", json={
        "name": "تدفق A",
        "nodes": [{"id": "n1", "type": "TRIGGER", "data": {}}],
        "edges": [],
    })
    flow_id = r.json()["data"]["id"]

    await v10_seed.login(ub)
    r = await c.post(f"/api/flows/{flow_id}/test", json={"text": "اختراق"})
    assert r.status_code == 404, r.text


# ════════════════════════════════════════════════════════════════════════════
# [SUB] عزل المستأجر — ردود get_detail + ملكية delete_tag
# ════════════════════════════════════════════════════════════════════════════


async def test_get_detail_replies_are_tenant_scoped(v10_world):
    """تطابق الأسماء بين مستأجرين لم يعد يسرّب نصوص ردود الطرف الآخر."""
    from models import Reply, Subscriber, Tenant
    from subscriber_engine import SubscriberEngine

    async with v10_world.sf() as db:
        ta = Tenant(name="SRA", is_active=True)
        tb = Tenant(name="SRB", is_active=True)
        db.add_all([ta, tb])
        await db.flush()
        shared_name = "علي محمد"
        db.add(Reply(tenant_id=ta.id, fb_comment_id="ca", fb_post_id="pa",
                     commenter_name=shared_name, comment_text="سؤال مستأجر A", reply_text="رد A"))
        db.add(Reply(tenant_id=tb.id, fb_comment_id="cb", fb_post_id="pb",
                     commenter_name=shared_name, comment_text="سؤال مستأجر B", reply_text="رد B"))
        sub = Subscriber(tenant_id=ta.id, fb_user_id="ua1", name=shared_name,
                         first_name="علي", platform="messenger")
        db.add(sub)
        await db.commit()
        sub_id, tid_a, tid_b = sub.id, ta.id, tb.id

    eng = SubscriberEngine()
    async with v10_world.sf() as db:
        detail = await eng.get_detail(sub_id, db, tenant_id=tid_a)
    texts = [r["comment_text"] for r in detail["recent_replies"]]
    assert texts == ["سؤال مستأجر A"], f"cross-tenant reply leak: {texts}"

    # مستأجر B يسأل عن مشترك A → None
    async with v10_world.sf() as db:
        assert await eng.get_detail(sub_id, db, tenant_id=tid_b) is None


async def test_delete_tag_cannot_shred_foreign_links(v10_world):
    """delete_tag يفحص الملكية قبل حذف الروابط: B لا يمزق وسوم A، وA يحذفها."""
    from models import Subscriber, SubscriberTag, Tag, Tenant
    from subscriber_engine import TagEngine

    async with v10_world.sf() as db:
        ta = Tenant(name="DGA", is_active=True)
        tb = Tenant(name="DGB", is_active=True)
        db.add_all([ta, tb])
        await db.flush()
        tag = Tag(name="VIP", color="#111111", tenant_id=ta.id)
        db.add(tag)
        await db.flush()
        sub = Subscriber(tenant_id=ta.id, fb_user_id="ua2", name="زينب", first_name="زينب")
        db.add(sub)
        await db.flush()
        db.add(SubscriberTag(tenant_id=ta.id, subscriber_id=sub.id, tag_id=tag.id))
        await db.commit()
        tag_id, tid_a, tid_b = tag.id, ta.id, tb.id

    eng = TagEngine()
    # مستأجر B (غريب) يحاول حذف وسم A — الروابط تبقى سليمة (الخلل القديم
    # كان يحذف SubscriberTag أولاً ثم يكتشف أن الوسم ليس له)
    async with v10_world.sf() as db:
        assert await eng.delete_tag(tag_id, db, tenant_id=tid_b) is False
        links = (await db.execute(
            select(SubscriberTag).where(SubscriberTag.tag_id == tag_id))).scalars().all()
        assert len(links) == 1, "foreign delete shredded the owner's tag links"

    # المالك يحذف → يختفي الوسم والروابط
    async with v10_world.sf() as db:
        assert await eng.delete_tag(tag_id, db, tenant_id=tid_a) is True
        links = (await db.execute(
            select(SubscriberTag).where(SubscriberTag.tag_id == tag_id))).scalars().all()
        assert links == []


async def test_delete_tag_http_cross_tenant_404(v10_seed):
    """HTTP: DELETE /api/tags/{id} لمستأجر غريب → 404 والوسم باقٍ لمالكه."""
    c = v10_seed.world.client
    ua, _tid_a, _uid = await v10_seed.tenant_user(role="admin", tenant_name="TAG-A")
    ub, _tid_b, _uid2 = await v10_seed.tenant_user(role="admin", tenant_name="TAG-B")

    await v10_seed.login(ua)
    r = await c.post("/api/tags", json={"name": "ذهبي", "color": "#aabbcc"})
    assert r.status_code == 200, r.text
    tag_id = r.json()["data"]["id"]

    await v10_seed.login(ub)
    r = await c.delete(f"/api/tags/{tag_id}")
    assert r.status_code == 404, r.text

    await v10_seed.login(ua)
    r = await c.get("/api/tags")
    assert any(t["id"] == tag_id for t in r.json()["data"]), "owner's tag must survive"


# ════════════════════════════════════════════════════════════════════════════
# [PDF] WeasyPrint خارج حلقة الأحداث (asyncio.to_thread)
# ════════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="module", autouse=True)
async def real_db():
    """جداول على محرك التطبيق الحقيقي — مسارات WS/PDF/SSE/flow-resolver تفتح
    جلساتها عبر AsyncSessionLocal مباشرة (نفس نمط env في test_track_b_sse)."""
    from database import engine as db_engine
    from models import Base
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def test_pdf_render_runs_off_event_loop(real_db, monkeypatch):
    """write_pdf يعمل في خيط عامل + حلقة الأحداث تظل حية أثناء التوليد:
    لا فجوة نبض ≥0.2s (كانت ستكون ≥ مدة التوليد كاملة قبله)."""
    weasyprint = pytest.importorskip("weasyprint")
    import pdf_reports_engine as pre

    render_thread: dict = {}

    def slow_write_pdf(self):
        render_thread["thread"] = threading.current_thread()
        time.sleep(0.25)  # محاكاة توليد ثقيل
        return b"%PDF-fake-v14"

    monkeypatch.setattr(weasyprint.HTML, "write_pdf", slow_write_pdf)

    beats: list[float] = []

    async def heartbeat():
        for _ in range(12):
            beats.append(time.monotonic())
            await asyncio.sleep(0.03)

    hb = asyncio.create_task(heartbeat())
    engine = pre.PdfReportsEngine()
    pdf = await engine.monthly_report(days=7, tenant_id=999999)
    await hb

    assert pdf == b"%PDF-fake-v14"
    assert render_thread.get("thread") is not None, "write_pdf never ran"
    assert render_thread["thread"] is not threading.main_thread(), "render stayed ON the event loop"
    gaps = [b - a for a, b in zip(beats, beats[1:])]
    assert max(gaps) < 0.2, f"event loop froze during render: {gaps}"
    # to_thread فعلاً استُخدم (الخيط عامل) — وعدد النبضات اكتمل
    assert len(beats) == 12


# ════════════════════════════════════════════════════════════════════════════
# [WS] التوكن من header أولاً + فحص token_ver
# ════════════════════════════════════════════════════════════════════════════


class FakeWebSocket:
    """WebSocket مزيّف بأصغر واجهة يستخدمها websocket_endpoint."""

    def __init__(self, headers: dict | None = None, query_token: str = "", cookie_token: str = ""):
        self.headers = {k.lower(): v for k, v in (headers or {}).items()}
        self.query_params = {"token": query_token} if query_token else {}
        self.cookies = {"token": cookie_token} if cookie_token else {}
        self.closed: list[tuple[int, str]] = []
        self.accepted = False
        self.sent: list[str] = []
        self._script = ["ping"]

    async def accept(self):
        self.accepted = True

    async def close(self, code: int = 1000, reason: str = ""):
        self.closed.append((code, reason))

    async def send_text(self, text: str):
        self.sent.append(text)

    async def receive_text(self) -> str:
        if self._script:
            return self._script.pop(0)
        from fastapi import WebSocketDisconnect
        raise WebSocketDisconnect(code=1000)


async def _ws_user(real_db) -> tuple[str, int, int]:
    from _hash import hash_password
    from database import AsyncSessionLocal
    from models import Tenant, User
    uname = f"e2ws_{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        t = Tenant(name=f"WS-{uname}", is_active=True, subscription_status="PAID")
        db.add(t)
        await db.flush()
        u = User(username=uname, email=f"{uname}@t.ly", password_hash=hash_password("x"),
                 tenant_id=t.id, role="admin")
        db.add(u)
        await db.commit()
        return uname, t.id, u.id


async def _drive_ws(ws) -> FakeWebSocket:
    from app.ws import websocket_endpoint
    await websocket_endpoint(ws)
    return ws


async def test_ws_token_from_authorization_header(real_db):
    """التوكن في ترويسة Authorization: Bearer — الاتصال يُقبل ويعمل (pong)."""
    from routers.auth import make_token
    uname, tid, _uid = await _ws_user(real_db)
    token = make_token(uname, tid)
    ws = await _drive_ws(FakeWebSocket(headers={"Authorization": f"Bearer {token}"}))
    assert ws.accepted and not ws.closed, ws.closed
    assert any("pong" in s for s in ws.sent), ws.sent


async def test_ws_query_token_fallback_still_works(real_db):
    """التوكن في ?token= (العملاء القدامى) ما زال مقبولاً."""
    from routers.auth import make_token
    uname, tid, _uid = await _ws_user(real_db)
    ws = await _drive_ws(FakeWebSocket(query_token=make_token(uname, tid)))
    assert ws.accepted and not ws.closed, ws.closed


async def test_ws_header_takes_priority_over_query(real_db):
    """header سليم + query فاسد → المقبول هو الheader (الأولوية)."""
    from routers.auth import make_token
    uname, tid, _uid = await _ws_user(real_db)
    ws = await _drive_ws(FakeWebSocket(
        headers={"authorization": make_token(uname, tid)},
        query_token="not-a-jwt",
    ))
    assert ws.accepted and not ws.closed, ws.closed


async def test_ws_missing_token_rejected(real_db):
    ws = await _drive_ws(FakeWebSocket())
    assert not ws.accepted
    assert ws.closed and ws.closed[0][0] == 4001


async def test_ws_rejects_stale_token_ver(real_db):
    """توكن قديم (قبل رفع token_ver بعد تغيير كلمة المرور) → رفض 4001
    (الاتصال القديم كان يبقى حياً 24 ساعة)."""
    from database import AsyncSessionLocal
    from models import User
    from routers.auth import make_token
    uname, tid, uid = await _ws_user(real_db)
    async with AsyncSessionLocal() as db:
        u = await db.get(User, uid)
        u.token_ver = 1  # رُفع بعد تغيير كلمة المرور
        await db.commit()

    stale = make_token(uname, tid, token_ver=0)  # سُكّ قبل الرفع
    ws = await _drive_ws(FakeWebSocket(headers={"Authorization": f"Bearer {stale}"}))
    assert not ws.accepted
    assert ws.closed and ws.closed[0][0] == 4001
    assert "outdated" in ws.closed[0][1].lower(), ws.closed


# ════════════════════════════════════════════════════════════════════════════
# [SSE] جلسة واحدة لكل اتصال + قراءات طازجة + سقف 5/مستأجر
# ════════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="module")
async def sse_env(real_db):
    from _hash import hash_password
    from database import AsyncSessionLocal
    from httpx import ASGITransport, AsyncClient
    from models import SubscriptionPayment, SubscriptionPlan, User
    from runner import app

    async with AsyncSessionLocal() as db:
        plan = SubscriptionPlan(name=f"e2-{uuid.uuid4().hex[:6]}", name_ar="برو",
                                price=99.0, period_days=30, is_active=True)
        db.add(plan)
        await db.flush()
        uname = f"e2sse_{uuid.uuid4().hex[:8]}"
        u = User(username=uname, email=f"{uname}@t.ly",
                 password_hash=hash_password("Test12345!"), role="viewer")
        db.add(u)
        await db.flush()
        pay = SubscriptionPayment(user_id=u.id, tenant_id=None, plan_id=plan.id,
                                  plan_name="pro", amount=99.0, provider="liyana",
                                  phone="0910000000", status="pending")
        db.add(pay)
        await db.commit()
        payment_id = pay.id

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        # v14: تسجيل الدخول داخل كل اختبار (نمط test_track_b_sse المُثبت) —
        # طلب داخل الـfixture يربط حالة تجمع httpx/anyio بحلقة الـfixture
        # فيعلّق أول تيار في حلقة الاختبار عند تشغيل الاختبار منفرداً.
        yield SimpleNamespace(ac=ac, payment_id=payment_id, uname=uname)




async def _sse_login(sse_env):
    """v14: دخول داخل حلقة الاختبار نفسها (نمط track_b) — يعيد تعبئة كوكي الجلسة."""
    r = await sse_env.ac.post("/api/login", json={"username": sse_env.uname, "password": "Test12345!"})
    assert r.status_code == 200, r.text


async def test_sse_single_session_per_connection_fresh_reads(sse_env, monkeypatch):
    """الاتصال الواحد يفتح جلسة قاعدة واحدة (لا جلسة كل ثانيتين) ومع ذلك
    يرى تغيّر الحالة فور وقوعه (rollback يُبطل الذاكرة ويجبر قراءة طازجة)."""
    await _sse_login(sse_env)
    import routers.payments.sse as sse_mod
    from database import AsyncSessionLocal as RealFactory
    from models import SubscriptionPayment

    created = {"n": 0}

    class CountingFactory:
        def __init__(self, real):
            self._real = real

        def __call__(self):
            created["n"] += 1
            return self._real()

    monkeypatch.setattr(sse_mod, "AsyncSessionLocal", CountingFactory(RealFactory))
    monkeypatch.setattr(sse_mod, "_SSE_POLL_SECONDS", 0.15)

    async def flip_after_delay():
        await asyncio.sleep(0.45)
        async with RealFactory() as db:
            sp = await db.get(SubscriptionPayment, sse_env.payment_id)
            sp.status = "verified"
            await db.commit()

    flipper = asyncio.create_task(flip_after_delay())

    events: list[dict] = []
    async with sse_env.ac.stream(
        "GET", f"/api/subscriptions/status-stream?payment_id={sse_env.payment_id}"
    ) as resp:
        assert resp.status_code == 200
        async for line in resp.aiter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
                if events[-1].get("status") == "verified":
                    break
    await flipper

    statuses = [e.get("status") for e in events]
    assert "verified" in statuses, f"SSE never saw the approval: {statuses}"
    assert "pending" in statuses, f"first read missing: {statuses}"
    # ≥3 دورات استطلاع (تغيّر الحالة بعد ~0.45s بدورة 0.15s) جلسة واحدة فقط:
    assert created["n"] == 1, f"one session per connection expected, opened {created['n']}"
    # الانتهاء الطبيعي (verified) يُفرغ العدّة — لا تسريب سقف
    assert 0 not in sse_mod._sse_tenant_counts or sse_mod._sse_tenant_counts[0] == 0


async def test_sse_caps_concurrent_streams_per_tenant(real_db):
    """سقف 5 اتصالات متزامنة للمستأجر: السادس 429، وبعد إغلاق الخمسة تُفرَّغ
    العدّة (finally في المولد).

    v14: استدعاء مباشر للمعالج — ASGITransport في httpx ينتظر اكتمال تطبيق
    ASGI كاملاً قبل إرجاع الاستجابة (لا يدعم التيارات اللانهائية)، لذا لا
    يمكن اختبار سقف تيارات حية غير منتهية عبر AsyncClient.stream. المعالج
    نفسه يفحص السقف ويزيد العدّة قبل إرجاع StreamingResponse — نقيسه كما هو.
    """
    import routers.payments.sse as sse_mod
    from database import AsyncSessionLocal
    from fastapi import HTTPException
    from models import SubscriptionPayment, SubscriptionPlan, User
    from routers.payments.sse import subscription_status_stream

    # زرع مستخدم (بلا جلسة) + دفعة pending على القاعدة المشتركة
    async with AsyncSessionLocal() as db:
        uname = f"e2cap_{uuid.uuid4().hex[:8]}"
        u = User(username=uname, email=f"{uname}@t.ly",
                 password_hash="x", role="viewer")
        db.add(u)
        await db.flush()
        plan = SubscriptionPlan(name=f"cap-{uuid.uuid4().hex[:6]}", name_ar="برو",
                                price=10.0, period_days=30, is_active=True)
        db.add(plan)
        await db.flush()
        pay = SubscriptionPayment(user_id=u.id, tenant_id=None, plan_id=plan.id,
                                  plan_name="برو", amount=10.0, provider="liyana",
                                  phone="0910000000", status="pending")
        db.add(pay)
        await db.commit()
        uid, pid = u.id, pay.id
        u._tenant_id = u.tenant_id or 0

    sse_mod._sse_tenant_counts.clear()

    responses = []
    try:
        for i in range(sse_mod._SSE_MAX_PER_TENANT):
            resp = await subscription_status_stream(payment_id=pid, current_user=u)
            assert resp.status_code == 200, "within cap must stream"
            responses.append(resp)
        assert sse_mod._sse_tenant_counts[u._tenant_id] == sse_mod._SSE_MAX_PER_TENANT
        # السادس → 429 (رفض مستوى النقل؛ الواجهة تسقط للاستطلاع الدوري)
        with pytest.raises(HTTPException) as ei:
            await subscription_status_stream(payment_id=pid, current_user=u)
        assert ei.value.status_code == 429, f"expected 429 over cap, got {ei.value.status_code}"
        assert "التحديث الدوري" in str(ei.value.detail), ei.value.detail
    finally:
        # aclose على مولّد لم يبدأ لا يشغّل finally — نشغّل أول حدث ثم نغلق
        for resp in responses:
            agen = resp.body_iterator
            try:
                await agen.__anext__()
            except StopAsyncIteration:
                pass
            await agen.aclose()

    # بعد الإغلاق: العدّة فارغة واتصال جديد مقبول
    assert not sse_mod._sse_tenant_counts, sse_mod._sse_tenant_counts
    resp = await subscription_status_stream(payment_id=pid, current_user=u)
    assert resp.status_code == 200
    try:
        await resp.body_iterator.__anext__()
    except StopAsyncIteration:
        pass
    await resp.body_iterator.aclose()
    assert not sse_mod._sse_tenant_counts, sse_mod._sse_tenant_counts
