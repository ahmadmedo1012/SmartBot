"""v15-E4 — التزامن وSSRF وعائلة 409 (claim/flush/409/SSRF/per-tenant).

هرمية الاختبارات (كل إصلاح يقترن بإثبات سالب يفشل قبله):

  [D12-H1]   النشر المجدول: claim ذرّي ``scheduled→publishing`` قبل Graph
             (نمط approvals.py v9-A8) — مسحّان متزامنان حقيقيان
             (asyncio.gather على قاعدة ملفات باتصالات مستقلة) لا ينشران
             مرتين + استعادة publishing المتقادمة + إطلاق الادعاء عند
             غياب الصفحة/فشل Graph
  [D12-H5]   messenger_service: رسالة العميل تُلتزم قبل الرد،
             ``stored`` صادقة بعد الالتزام فقط، upsert المشترك بمعاملة
             مستقلة + retry عند IntegrityError (re-read) — «العميل يرى
             الرد والداشبورد يرى» حتى تحت سباق حقيقي متزامن
  [D13-F1]   عائلة 409: ربط الصفحة المزدوج (facebook_routes) + عميل CRM
             المكرر + وسم inbox — الفحص المسبق يرد 409 عربية، وسباق
             الالتزام (IntegrityError عند autoflush/commit) يرد 409 نظيفة
             لا 500 خام
  [D6-H2]    حارس SSRF بحل DNS: اسم يحلّ إلى loopback/RFC1918/
             169.254.169.254/IPv6-ULA يُرفض، فشل الحل = رفض (fail-closed)
  [D2-H2]    فعل webhook في flow_engine يستعمل الحارس نفسه (label
             عربية) + مهلة 10s + بلا اتباع توجيه
  [D2-H4]    الوكيل ينشر بعميل المستأجر (get_tenant_fb_client) — بلا
             اعتماد: تعطيل آمن برسالة عربية
  [D12-M4]   /api/bot/trigger صادق: الدورة داخل الطلب بموازنة محدودة
             والاستجابة تروي ما حدث فعلًا (اكتمل/ما يزال جاريًا/فشل)
  [D6-M3→v16-E2] مسارا الكرون في bot.py يقبلان Bearer فقط (?token= أُزيلت
             نهائياً — حتى السر الصحيح في الاستعلام يرد 403: القناة
             المستعملة الوحيدة (cron-job.org) موثقة ميتة، والاستعلام يسرّب
             السر إلى سجلات الوصول)
  [D12-M2]   _cron_lock الميت أُزيل

لا نداء Graph ولا DNS حقيقي يخرج من العملية: كل مسار خارجي مزيّف.
"""
from __future__ import annotations

import asyncio
import os
import tempfile
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from _utils import utcnow
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

# ══════════════════════════════════════════════════════════════════════════
# أدوات مشتركة
# ══════════════════════════════════════════════════════════════════════════


@pytest.fixture
async def race_db():
    """قاعدة ملفات SQLite باتصالات مستقلة حقيقية (ليس StaticPool) — لسباقات
    gather فعلية مع file-locking + busy timeout (نمط counter_db لدى E1)."""
    from models import Base
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    fd, path = tempfile.mkstemp(prefix="v15_e4_race_", suffix=".db")
    os.close(fd)
    os.unlink(path)
    eng = create_async_engine(f"sqlite+aiosqlite:///{path}", connect_args={"timeout": 30})
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(eng, expire_on_commit=False)
    try:
        yield sf
    finally:
        await eng.dispose()
        try:
            os.unlink(path)
        except OSError:
            pass


async def _seed_due_post(sf, tenant_id: int, message: str) -> int:
    from models import ScheduledPost

    async with sf() as db:
        post = ScheduledPost(tenant_id=tenant_id, message=message, platform="facebook",
                             status="scheduled", scheduled_at=utcnow() - timedelta(minutes=5))
        db.add(post)
        await db.commit()
        await db.refresh(post)
        return post.id


async def _async_result(value):
    return value


class _SlowFB:
    """عميل FB بطيء يسجّل النداءات — يفتح نافذة السباق الحقيقية أثناءها."""

    def __init__(self, delay: float = 0.12):
        self.calls: list[str] = []
        self.delay = delay
        self.fail = False

    async def post_to_page(self, message: str):
        self.calls.append(message)
        await asyncio.sleep(self.delay)
        return None if self.fail else {"id": "pub_race_1"}


def _patch_tenant_fb(monkeypatch, factory):
    import _services

    monkeypatch.setattr(_services, "get_tenant_fb_client", factory)


# ══════════════════════════════════════════════════════════════════════════
# §A — D12-H1: claim ذرّي للنشر المجدول (نبض الكرون + المجدول المحلي)
# ══════════════════════════════════════════════════════════════════════════


async def test_claim_is_atomic_second_claimer_gets_nothing(race_db):
    """نمط approvals.py حرفيًا: UPDATE ... WHERE status='scheduled' RETURNING —
    الفائز يأخذ الصف، الخاسر صفوفًا صفرية (False) مهما تزامنا."""
    from content_calendar import _claim_key, claim_scheduled_post
    from models import BotState, ScheduledPost

    tid = 7101
    post_id = await _seed_due_post(race_db, tid, "عرض الخميس")

    async with race_db() as db_a, race_db() as db_b:
        first = await claim_scheduled_post(db_a, post_id, tid)
        second = await claim_scheduled_post(db_b, post_id, tid)
        assert first is True, "the first claimer must win"
        assert second is False, "the second claimer must get zero rows — not an error"
        post = await db_b.get(ScheduledPost, post_id)
        assert post.status == "publishing"
        marker = (await db_b.execute(
            select(BotState).where(BotState.tenant_id == tid,
                                   BotState.key == _claim_key(post_id))
        )).scalar_one_or_none()
        assert marker is not None, "claim writes the recovery marker in the same tx"


async def test_two_concurrent_heartbeat_sweeps_publish_exactly_once(race_db, monkeypatch):
    """D12-H1 — السيناريو الحي: نبض cron-job.org (كل 5 د) يتقاطع مع نبض
    Vercel اليومي وكلاهما يرى المنشور مستحقًا؛ الاستدعاء البطيء لGraph
    (0.12s) يفتح النافذة. المسحّان متزامنان بـgather على اتصالات مستقلة —
    منشور عام واحد بالضبط، لا أخطاء، وواحد فقط يحرز published."""
    import routers.bot as bot_mod

    tid = 7202
    msg = "منشور السباق — يجب أن يظهر مرة واحدة"
    post_id = await _seed_due_post(race_db, tid, msg)

    slow = _SlowFB(delay=0.12)
    _patch_tenant_fb(monkeypatch, lambda tenant_id: _async_result(slow))

    async def sweep() -> tuple[dict, int]:
        report = {"published_posts": 0, "fan_refreshed": 0, "cycles": 0, "errors": []}
        n = await bot_mod._publish_due_scheduled_posts(report, sf=race_db)
        return report, n

    (rep_a, n_a), (rep_b, n_b) = await asyncio.gather(sweep(), sweep())

    assert slow.calls == [msg], f"double publish! Graph was called {len(slow.calls)} times"
    assert n_a + n_b == 1, f"exactly one sweep must score the publish (got {n_a}+{n_b})"
    assert rep_a["errors"] == [] and rep_b["errors"] == [], (rep_a, rep_b)

    from models import ScheduledPost

    async with race_db() as db:
        post = await db.get(ScheduledPost, post_id)
        assert post.status == "published"
        assert post.fb_post_id == "pub_race_1"
        assert post.published_at is not None


async def test_sweep_without_connected_page_releases_claim_and_retries(race_db, monkeypatch):
    """لا صفحة للمستأجر → الادعاء يُطلق والمنشور يعود scheduled (سياسة v14-E2:
    يُنشر عند الربط) — ثم المسح التالي بعميل متاح ينشره مرة واحدة."""
    import routers.bot as bot_mod
    from models import ScheduledPost

    tid = 7303
    post_id = await _seed_due_post(race_db, tid, "بانتظار ربط الصفحة")

    _patch_tenant_fb(monkeypatch, lambda tenant_id: _async_result(None))
    report = {"published_posts": 0, "fan_refreshed": 0, "cycles": 0, "errors": []}
    assert await bot_mod._publish_due_scheduled_posts(report, sf=race_db) == 0
    async with race_db() as db:
        post = await db.get(ScheduledPost, post_id)
        assert post.status == "scheduled", "claim must be released — not stuck in publishing"

    slow = _SlowFB(delay=0.01)
    _patch_tenant_fb(monkeypatch, lambda tenant_id: _async_result(slow))
    report2 = {"published_posts": 0, "fan_refreshed": 0, "cycles": 0, "errors": []}
    assert await bot_mod._publish_due_scheduled_posts(report2, sf=race_db) == 1
    assert slow.calls == ["بانتظار ربط الصفحة"]


async def test_sweep_graph_crash_releases_claim_for_next_beat(race_db, monkeypatch):
    """انهيار Graph (استثناء) → تحرير الادعاء والعودة scheduled — النبض
    التالي يعيد المحاولة (قبل الإصلاح كان الصف يعلق publishing إلى الأبد)."""
    import routers.bot as bot_mod
    from models import ScheduledPost

    tid = 7404
    post_id = await _seed_due_post(race_db, tid, "منشور سينهار Graph")

    class _CrashFB:
        async def post_to_page(self, message):
            raise RuntimeError("graph exploded mid-publish")

    _patch_tenant_fb(monkeypatch, lambda tenant_id: _async_result(_CrashFB()))
    report = {"published_posts": 0, "fan_refreshed": 0, "cycles": 0, "errors": []}
    assert await bot_mod._publish_due_scheduled_posts(report, sf=race_db) == 0
    assert report["errors"], "the crash must be reported honestly"

    slow = _SlowFB(delay=0.01)
    _patch_tenant_fb(monkeypatch, lambda tenant_id: _async_result(slow))
    report2 = {"published_posts": 0, "fan_refreshed": 0, "cycles": 0, "errors": []}
    assert await bot_mod._publish_due_scheduled_posts(report2, sf=race_db) == 1
    async with race_db() as db:
        post = await db.get(ScheduledPost, post_id)
        assert post.status == "published"


async def test_recover_stale_publishing_returns_frozen_claims(race_db):
    """ناشر متجمد (Vercel جمّد الدالة بعد الادعاء) → العلامة المتقادمة
    تعيد المنشور scheduled؛ الادعاء الحي لا يُستعاد؛ بلا علامة → لا تدخل
    (محافظة: كاتب خارجي)."""
    from content_calendar import _claim_key, claim_scheduled_post, recover_stale_publishing
    from models import BotState, ScheduledPost

    tid = 7505
    stale_id = await _seed_due_post(race_db, tid, "ادعاء متجمد")
    fresh_id = await _seed_due_post(race_db, tid, "ادعاء حي")
    foreign_id = await _seed_due_post(race_db, tid, "ناشر خارجي")

    async with race_db() as db:
        assert await claim_scheduled_post(db, stale_id, tid)
        assert await claim_scheduled_post(db, fresh_id, tid)
    async with race_db() as db:  # ناشر بلا علامتنا
        await db.execute(
            ScheduledPost.__table__.update()
            .where(ScheduledPost.id == foreign_id)
            .values(status="publishing")
        )
        await db.commit()
    async with race_db() as db:  # تقاديم علامة الادعاء الأولى
        marker = (await db.execute(
            select(BotState).where(BotState.tenant_id == tid,
                                   BotState.key == _claim_key(stale_id))
        )).scalar_one()
        marker.value = (utcnow() - timedelta(seconds=3600)).isoformat()
        await db.commit()

    async with race_db() as db:
        recovered = await recover_stale_publishing(db, stale_after_seconds=600)
    assert recovered == 1, "only the stale (frozen-publisher) claim is recovered"

    async with race_db() as db:
        stale = await db.get(ScheduledPost, stale_id)
        fresh = await db.get(ScheduledPost, fresh_id)
        foreign = await db.get(ScheduledPost, foreign_id)
        assert stale.status == "scheduled", "frozen claim must retry on the next beat"
        assert fresh.status == "publishing", "a LIVE claim must never be stolen"
        assert foreign.status == "publishing", "no marker → foreign writer → left alone"
        left = (await db.execute(
            select(func.count(BotState.id)).where(
                BotState.tenant_id == tid,
                BotState.key.in_([_claim_key(stale_id), _claim_key(fresh_id)]))
        )).scalar()
        assert left == 1, "recovered claim drops its marker; live claim keeps it"


async def test_calendar_engine_stale_read_loses_claim_cleanly(race_db, monkeypatch):
    """TOCTOU حتمي على مستوى المحرك: قرأنا المنشور مستحقًا (scheduled)، ثم
    فاز ناشر متزامن بالادعاء قبل ندائنا — ادعاؤنا يرجع صفوفًا صفرية → لا
    نداء Graph ولا عبث بحالة الفائز (كان: نشر مزدوج عام)."""
    from content_calendar import ContentCalendarEngine, claim_scheduled_post
    from models import ScheduledPost

    tid = 7606
    post_id = await _seed_due_post(race_db, tid, "تكة بطيئة")

    slow = _SlowFB(delay=0.05)
    _patch_tenant_fb(monkeypatch, lambda tenant_id: _async_result(slow))
    engine = ContentCalendarEngine(fb=None)

    async with race_db() as db:
        post = await db.get(ScheduledPost, post_id)  # قراءتنا: scheduled
        # ناشر متزامن (نبض آخر) يفوز بالادعاء بين قراءتنا وادعائنا
        async with race_db() as db2:
            assert await claim_scheduled_post(db2, post_id, tid)
        published = await engine._publish_with(post, db, slow)

    assert published is False, "the claim loser must skip cleanly"
    assert slow.calls == [], f"loser must NOT touch Graph, got {slow.calls}"
    async with race_db() as db:
        fresh = await db.get(ScheduledPost, post_id)
        assert fresh.status == "publishing", "the winner's claim must be untouched"


# ══════════════════════════════════════════════════════════════════════════
# §B — D12-H5: messenger — flush قبل الإرسال + retry + stored صادقة
# ══════════════════════════════════════════════════════════════════════════


def _messaging(mid: str, sender: str, text: str, sender_name: str = "علي الليبي") -> dict:
    return {
        "sender": {"id": sender, "name": sender_name},
        "recipient": {"id": "page-301"},
        "timestamp": int(utcnow().timestamp() * 1000),
        "message": {"mid": mid, "text": text},
    }


async def test_customer_sees_reply_and_dashboard_sees_it(race_db, monkeypatch):
    """H5 المسار الموجب كامل الطرف-لطرف: رسالة عميل → تخزين ملتزم قبل
    الرد → مشترك → رد البوت محفوظ. المحرك المزيّف يتحقق لحظة استدعائه أن
    الرسالة والمشترك **ملزمان فعلاً** في القاعدة (اختبار الترتيب — نمط
    T3): قبل الإصلاح كان الرد يعمل على معاملة قابلة للإلغاء."""
    import messenger_service as ms
    from models import Conversation, Message, Subscriber

    tid = 8101
    monkeypatch.setattr(ms, "AsyncSessionLocal", race_db)

    seen: dict[str, int] = {}

    class _OrderCheckingEngine:
        async def process_single_message(self, messaging):
            async with race_db() as db:
                seen["messages"] = (await db.execute(
                    select(func.count(Message.id)).where(Message.tenant_id == tid))).scalar()
                seen["subscribers"] = (await db.execute(
                    select(func.count(Subscriber.id)).where(Subscriber.tenant_id == tid))).scalar()
            assert seen["messages"] == 1, "engine ran BEFORE the message was committed"
            assert seen["subscribers"] == 1, "engine ran BEFORE the subscriber upsert"
            return {"mid": "mid.bot.r1", "text": "أهلاً بك 👋 كيف نقدر نخدمك؟"}

    import _services

    monkeypatch.setattr(_services, "get_bot_engine",
                        lambda fb, tenant_id: _OrderCheckingEngine())

    status = await ms.handle_messaging_event(
        tid, "page-301", _messaging("m.in.1", "sender-301", "مرحبا"), fb_client=None)

    assert status["stored"] is True and status["replied"] is True
    async with race_db() as db:
        msgs = (await db.execute(
            select(Message).where(Message.tenant_id == tid).order_by(Message.id))).scalars().all()
        assert len(msgs) == 2, "inbound + the bot's reply must BOTH be visible to the dashboard"
        inbound = [m for m in msgs if not m.is_from_page]
        outbound = [m for m in msgs if m.is_from_page]
        assert len(inbound) == 1 and inbound[0].text == "مرحبا"
        assert len(outbound) == 1 and outbound[0].text == "أهلاً بك 👋 كيف نقدر نخدمك؟"
        convs = (await db.execute(
            select(Conversation).where(Conversation.tenant_id == tid))).scalars().all()
        assert len(convs) == 1
        subs = (await db.execute(
            select(Subscriber).where(Subscriber.tenant_id == tid))).scalars().all()
        assert len(subs) == 1 and subs[0].fb_user_id == "sender-301"


async def test_subscriber_upsert_failure_never_kills_customer_message(race_db, monkeypatch):
    """H5 السالب (السم القديم): فشل upsert المشترك بIntegrityError كان يهدم
    معاملة الرسالة كلها عند الالتزام — الآن معاملة منفصلة: رسالة العميل
    باقية، stored صادقة، والرد أُرسل وحُفظ."""
    import messenger_service as ms
    from models import Message

    tid = 8202
    monkeypatch.setattr(ms, "AsyncSessionLocal", race_db)

    async def poisoned_upsert(db, tenant_id, page_id, sender_id, sender_name):
        raise IntegrityError("INSERT INTO subscribers ...", {},
                             RuntimeError("UNIQUE constraint failed: subscribers.fb_user_id"))

    monkeypatch.setattr(ms, "_upsert_subscriber", poisoned_upsert)

    class _Engine:
        async def process_single_message(self, messaging):
            return {"mid": "mid.bot.r2", "text": "رد رغم فشل التتبع"}

    import _services

    monkeypatch.setattr(_services, "get_bot_engine", lambda fb, tenant_id: _Engine())

    status = await ms.handle_messaging_event(
        tid, "page-301", _messaging("m.in.2", "sender-302", "سلام"), fb_client=None)

    assert status["stored"] is True, "the customer's message is DURABLE — upsert failure must not roll it back"
    assert status["replied"] is True
    async with race_db() as db:
        msgs = (await db.execute(
            select(Message).where(Message.tenant_id == tid))).scalars().all()
        assert len(msgs) == 2, "inbound + bot reply both persisted"


async def test_message_persist_failure_reports_not_stored_and_skips_reply(race_db, monkeypatch):
    """فشل حفظ الرسالة نفسها → stored=False صادقة والرد لا ينطلق
    (قبل الإصلاح كانت stored=True تُضبط قبل الالتزام فكان الرد يُرسل
    والداشبورد لا يرى شيئًا)."""
    import messenger_service as ms
    from models import Message

    tid = 8303
    monkeypatch.setattr(ms, "AsyncSessionLocal", race_db)

    async def failing_persist(db, *args, **kwargs):
        raise IntegrityError("INSERT INTO messages ...", {},
                             RuntimeError("UNIQUE constraint failed: messages.fb_message_id"))

    monkeypatch.setattr(ms, "persist_message", failing_persist)

    engine_called = {"n": 0}

    class _Engine:
        async def process_single_message(self, messaging):
            engine_called["n"] += 1
            return {"mid": "mid.bot.r3", "text": "لن يرسل"}

    import _services

    monkeypatch.setattr(_services, "get_bot_engine", lambda fb, tenant_id: _Engine())

    status = await ms.handle_messaging_event(
        tid, "page-301", _messaging("m.in.3", "sender-303", "مرحبا"), fb_client=None)

    assert status["stored"] is False
    assert status["replied"] is False
    assert engine_called["n"] == 0, "the reply engine must NOT run for a message that is not stored"
    async with race_db() as db:
        cnt = (await db.execute(
            select(func.count(Message.id)).where(Message.tenant_id == tid))).scalar()
        assert cnt == 0


async def test_concurrent_messages_same_new_sender_full_race(race_db, monkeypatch):
    """H5 السباق الحي (رسالتان متزامنتان من مرسل جديد باتصالات مستقلة):
    الرسالتان محفوظتان، محادثة واحدة، مشترك واحد بالضبط (الخاسر يلتقط
    IntegrityError داخل savepoint ويعيد القراءة) — قبل الإصلاح كان الخاسر
    يفقد رسالته بrollback كامل."""
    import messenger_service as ms
    from models import Conversation, Message, Subscriber

    tid = 8404
    monkeypatch.setattr(ms, "AsyncSessionLocal", race_db)

    class _Engine:
        def __init__(self):
            self.n = 0

        async def process_single_message(self, messaging):
            self.n += 1
            return {"mid": f"mid.bot.race.{self.n}", "text": f"رد {self.n}"}

    engine = _Engine()
    import _services

    monkeypatch.setattr(_services, "get_bot_engine", lambda fb, tenant_id: engine)

    s1, s2 = await asyncio.gather(
        ms.handle_messaging_event(tid, "page-301",
                                  _messaging("m.race.1", "sender-race", "أول رسالة"),
                                  fb_client=None),
        ms.handle_messaging_event(tid, "page-301",
                                  _messaging("m.race.2", "sender-race", "ثانية رسالة"),
                                  fb_client=None),
    )
    assert s1["stored"] and s2["stored"], "no message may be lost to the subscriber race"
    assert s1["replied"] and s2["replied"]

    async with race_db() as db:
        inbounds = (await db.execute(
            select(func.count(Message.id)).where(
                Message.tenant_id == tid, Message.is_from_page == False))).scalar()  # noqa: E712
        replies = (await db.execute(
            select(func.count(Message.id)).where(
                Message.tenant_id == tid, Message.is_from_page == True))).scalar()  # noqa: E712
        convs = (await db.execute(
            select(func.count(Conversation.id)).where(Conversation.tenant_id == tid))).scalar()
        subs = (await db.execute(
            select(func.count(Subscriber.id)).where(
                Subscriber.tenant_id == tid, Subscriber.fb_user_id == "sender-race"))).scalar()
    assert inbounds == 2, "both customer messages must survive the race"
    assert replies == 2
    assert convs == 1, "the conversation-create loser must re-read the winner's row"
    assert subs == 1, f"exactly ONE subscriber for the new sender, got {subs}"


async def test_subscriber_upsert_race_retry_deterministic(race_db, monkeypatch):
    """الإثبات الحتمي لمنطق retry (خيطوط القاعدة تمنع التزامن في StaticPool):
    قراءة أولى «قديمة» (قبل التزام الفائز) → INSERT يصطدم بالقيد داخل
    savepoint → إعادة قراءة → تحديث التفاعل — صف واحد بلا استثناء."""
    import messenger_service as ms
    from models import Subscriber

    tid = 8505
    async with race_db() as db:
        db.add(Subscriber(tenant_id=tid, fb_user_id="sender-77", name="",
                          platform="messenger", page_id="page-301", status="active",
                          first_seen_at=utcnow()))
        await db.commit()

    real_find = ms._find_subscriber
    calls = {"n": 0}

    async def stale_then_real(db, tenant_id, sender_id):
        calls["n"] += 1
        if calls["n"] == 1:
            return None  # قراءتنا سبقت التزام الفائز
        return await real_find(db, tenant_id, sender_id)

    monkeypatch.setattr(ms, "_find_subscriber", stale_then_real)

    async with race_db() as db:
        await ms._upsert_subscriber(db, tid, "page-301", "sender-77", "علي الفائز")
        await db.commit()

    assert calls["n"] == 2, "the IntegrityError path must RE-READ (retry), not crash"
    async with race_db() as db:
        subs = (await db.execute(
            select(Subscriber).where(Subscriber.tenant_id == tid))).scalars().all()
        assert len(subs) == 1
        assert subs[0].name == "علي الفائز", "the retry fills the winner's missing name"
        assert subs[0].last_interaction_at is not None


async def test_conversation_upsert_race_retry_deterministic(race_db, monkeypatch):
    """نفس الإثبات الحتمي لمحادثة رسالة أولى متزامنة: الخاسر يعيد القراءة
    ويحمل صف الفائز (ترقية الاسم) — محادثة واحدة."""
    import messenger_service as ms
    from models import Conversation

    tid = 8606
    synth = f"{ms._SYNTH_PREFIX}page-301_sender-88"
    async with race_db() as db:
        db.add(Conversation(tenant_id=tid, fb_conversation_id=synth,
                            fb_user_id="sender-88", user_name=""))
        await db.commit()

    real_find = ms._find_conversation
    calls = {"n": 0}

    async def stale_then_real(db, tenant_id, fb_conversation_id):
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return await real_find(db, tenant_id, fb_conversation_id)

    monkeypatch.setattr(ms, "_find_conversation", stale_then_real)

    async with race_db() as db:
        conv = await ms._get_or_create_conversation(
            db, tid, "page-301", synth, "sender-88", "سالم الخاسر")
        await db.commit()
    assert conv is not None
    assert calls["n"] == 2
    async with race_db() as db:
        convs = (await db.execute(
            select(Conversation).where(Conversation.tenant_id == tid))).scalars().all()
        assert len(convs) == 1
        assert convs[0].user_name == "سالم الخاسر"


# ══════════════════════════════════════════════════════════════════════════
# §C — D13-F1: عائلة 409 (الربط المزدوج + CRM + وسم inbox)
# ══════════════════════════════════════════════════════════════════════════


async def test_facebook_settings_double_bind_returns_409_arabic(v10_seed):
    """المسار الحتمي: مستأجر ثانٍ يربط صفحة مربوطة → 409 عربية محددة،
    ولا يُحفظ له شيء (rollback كامل). كان 500 خام (D13-F1)."""
    c = v10_seed.world.client
    shared_page = f"pg-{uuid.uuid4().hex[:8]}"

    ua, _ta, _ua_id = await v10_seed.tenant_user(role="admin", tenant_name="FB-A")
    v10_seed.auth(ua, _ta)
    r = await c.put("/api/facebook/settings", json={
        "page_id": shared_page, "subscribe_webhook": False})
    assert r.status_code == 200, r.text

    ub, tb, _ub_id = await v10_seed.tenant_user(role="admin", tenant_name="FB-B")
    v10_seed.auth(ub, tb)
    r = await c.put("/api/facebook/settings", json={
        "page_id": shared_page, "subscribe_webhook": False})
    assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:300]}"
    assert "مربوطة" in r.text and "أخرى" in r.text

    from models import BotState

    async with v10_seed.world.sf() as db:
        rows = (await db.execute(
            select(BotState).where(BotState.tenant_id == tb))).scalars().all()
        assert rows == [], "the losing tenant must keep NO state"


async def test_facebook_settings_rebind_own_page_is_allowed(v10_seed):
    """إعادة ربط صفحتك أنت ليست تعارضًا — 200 (فحص مسبق يستثني صفّك)."""
    c = v10_seed.world.client
    own_page = f"pg-{uuid.uuid4().hex[:8]}"
    ua, ta, _ = await v10_seed.tenant_user(role="admin", tenant_name="FB-own")
    v10_seed.auth(ua, ta)
    r = await c.put("/api/facebook/settings", json={
        "page_id": own_page, "subscribe_webhook": False})
    assert r.status_code == 200, r.text
    r = await c.put("/api/facebook/settings", json={
        "page_id": own_page, "subscribe_webhook": False})
    assert r.status_code == 200, r.text


def _poisoned_get_db(world, monkeypatch, evidence: str):
    """get_db override: جلسة حقيقية commitها يفجّر IntegrityError (يحاكي
    التزام الفائز المتزامن الذي عبر الفحص المسبق) — يثبت تعيين
    IntegrityError→409 عند الالتزام/autoflush، لا 500 خام."""
    from database import get_db

    async def override():
        async with world.sf() as session:
            async def boom():
                raise IntegrityError("INSERT ...", {}, RuntimeError(evidence))
            session.commit = boom
            yield session

    world.app.dependency_overrides[get_db] = override
    return lambda: world.app.dependency_overrides.pop(get_db, None)


async def test_facebook_settings_commit_race_maps_409_specific(v10_seed, monkeypatch):
    """فرع الدليل (key,value): رسالة الربط المزدوج المحددة."""
    undo = _poisoned_get_db(v10_seed.world, monkeypatch,
                            "UNIQUE constraint failed: bot_state.key, bot_state.value")
    c = v10_seed.world.client
    ua, ta, _ = await v10_seed.tenant_user(role="admin", tenant_name="FB-race")
    v10_seed.auth(ua, ta)
    try:
        r = await c.put("/api/facebook/settings", json={
            "page_id": f"pg-{uuid.uuid4().hex[:8]}", "subscribe_webhook": False})
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:300]}"
        assert "مربوطة" in r.text
    finally:
        undo()


async def test_facebook_settings_commit_race_maps_409_generic(v10_seed, monkeypatch):
    """فرع الدليل الغامض (قيد آخر): 409 تعارض إعدادات عام — ليس 500 أبدًا."""
    undo = _poisoned_get_db(v10_seed.world, monkeypatch,
                            "UNIQUE constraint failed: bot_state.tenant_id, bot_state.key")
    c = v10_seed.world.client
    ua, ta, _ = await v10_seed.tenant_user(role="admin", tenant_name="FB-gen")
    v10_seed.auth(ua, ta)
    try:
        r = await c.put("/api/facebook/settings", json={
            "page_id": f"pg-{uuid.uuid4().hex[:8]}", "subscribe_webhook": False})
        assert r.status_code == 409, r.text
        assert "تعارض" in r.text
    finally:
        undo()


async def test_crm_duplicate_customer_returns_409(v10_seed):
    """CRM: العميل المكرر → 409 عربية (كان 400 ثم 500 في السباق)."""
    c = v10_seed.world.client
    ua, ta, _ = await v10_seed.tenant_user(role="editor", tenant_name="CRM-A")
    v10_seed.auth(ua, ta)
    fb_user = f"cust-{uuid.uuid4().hex[:8]}"
    r = await c.post("/api/crm/customers", data={"fb_user_id": fb_user, "name": "زبون"})
    assert r.status_code == 200, r.text
    r = await c.post("/api/crm/customers", data={"fb_user_id": fb_user, "name": "مكرر"})
    assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:300]}"
    assert "موجود مسبقاً" in r.text


async def test_crm_create_commit_race_maps_409(v10_seed, monkeypatch):
    """CRM سباق الالتزام: IntegrityError (uq_customer_tenant_fbuser) عند
    الالتزام → 409 نظيفة (كان 500 خام)."""
    undo = _poisoned_get_db(
        v10_seed.world, monkeypatch,
        "UNIQUE constraint failed: customers.tenant_id, customers.fb_user_id")
    c = v10_seed.world.client
    ua, ta, _ = await v10_seed.tenant_user(role="editor", tenant_name="CRM-race")
    v10_seed.auth(ua, ta)
    try:
        r = await c.post("/api/crm/customers", data={
            "fb_user_id": f"cust-{uuid.uuid4().hex[:8]}", "name": "سباق"})
        assert r.status_code == 409, r.text
        assert "موجود مسبقاً" in r.text
    finally:
        undo()


async def test_inbox_duplicate_tag_returns_409(v10_seed):
    """وسم inbox المكرر → 409 عربية (كان 400 ثم 500 في السباق)."""
    c = v10_seed.world.client
    ua, ta, _ = await v10_seed.tenant_user(role="editor", tenant_name="TAG-A")
    v10_seed.auth(ua, ta)
    tag = f"وسم-{uuid.uuid4().hex[:6]}"
    r = await c.post("/api/inbox/tags", data={"name": tag})
    assert r.status_code == 200, r.text
    r = await c.post("/api/inbox/tags", data={"name": tag})
    assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:300]}"
    assert "موجود مسبقاً" in r.text


async def test_inbox_tag_commit_race_maps_409(v10_seed, monkeypatch):
    """وسم inbox سباق الالتزام: IntegrityError (uq_ctag_tenant_name) → 409."""
    undo = _poisoned_get_db(
        v10_seed.world, monkeypatch,
        "UNIQUE constraint failed: conversation_tags.tenant_id, conversation_tags.name")
    c = v10_seed.world.client
    ua, ta, _ = await v10_seed.tenant_user(role="editor", tenant_name="TAG-race")
    v10_seed.auth(ua, ta)
    try:
        r = await c.post("/api/inbox/tags", data={"name": f"وسم-{uuid.uuid4().hex[:6]}"})
        assert r.status_code == 409, r.text
        assert "موجود مسبقاً" in r.text
    finally:
        undo()


# ══════════════════════════════════════════════════════════════════════════
# §D — D6-H2/D2-H2: حارس SSRF بحل DNS + فعل webhook
# ══════════════════════════════════════════════════════════════════════════


def _fake_dns(monkeypatch, ips):
    import ai_service

    async def resolve(host: str):
        return list(ips)

    monkeypatch.setattr(ai_service, "_resolve_host_ips", resolve)


@pytest.mark.parametrize("bad_ip", [
    "127.0.0.1",        # loopback (DNS يحل لـ127.0.0.1 — سيناريو الخطة)
    "10.0.0.5",         # RFC1918
    "172.16.0.1",       # RFC1918
    "192.168.1.10",     # RFC1918
    "169.254.169.254",  # cloud metadata
    "fd00::1",          # IPv6 ULA
    "::1",              # IPv6 loopback
    "100.64.0.1",       # CGNAT reserved
])
async def test_dns_resolution_to_internal_ip_is_rejected(monkeypatch, bad_ip):
    """جوهر D6-H2: الاسم يجتاز فحص IP الحرفي ثم يحلّ داخليًا → رفض عربي."""
    from ai_service import UnsafeImageUrlError, assert_safe_outbound_url

    _fake_dns(monkeypatch, [bad_ip])
    with pytest.raises(UnsafeImageUrlError) as ei:
        await assert_safe_outbound_url("https://receipt.evil.ly/x.jpg")
    assert "داخلية" in str(ei.value) or "خاصة" in str(ei.value)


async def test_dns_resolution_mixed_records_any_internal_rejects(monkeypatch):
    """سجل عام + سجل داخلي (multi-A) → الرفض (أي عنوان داخلي واحد يكفي)."""
    from ai_service import UnsafeImageUrlError, assert_safe_outbound_url

    _fake_dns(monkeypatch, ["93.184.216.34", "10.0.0.9"])
    with pytest.raises(UnsafeImageUrlError):
        await assert_safe_outbound_url("https://hooks.example.ly/hook", label="رابط الويبهوك")


async def test_dns_resolution_failure_fails_closed(monkeypatch):
    """تعذر الحل = رفض صريح (لا نعبر نطاقًا لا نستطيع التحقق منه)."""
    import ai_service
    from ai_service import UnsafeImageUrlError, assert_safe_outbound_url

    async def broken(host: str):
        raise OSError("NXDOMAIN")

    monkeypatch.setattr(ai_service, "_resolve_host_ips", broken)
    with pytest.raises(UnsafeImageUrlError) as ei:
        await assert_safe_outbound_url("https://unresolvable.example.ly/x.png")
    assert "تعذر التحقق" in str(ei.value)


async def test_public_dns_resolution_passes_and_label_used(monkeypatch):
    """المسار الموجب: IP عام يمر، والرسائل العربية تحمل label السياق
    (ويبهوك ≠ صورة) — طبقة IP الحرفي تستعمل label الممرر الآن."""
    from ai_service import UnsafeImageUrlError, assert_safe_outbound_url

    _fake_dns(monkeypatch, ["93.184.216.34"])
    await assert_safe_outbound_url("https://hooks.good.ly/hook", label="رابط الويبهوك")

    # الطبقة السريعة تستعمل label: http ويبهوك → رسالة «رابط الويبهوك»
    with pytest.raises(UnsafeImageUrlError) as ei:
        await assert_safe_outbound_url("http://hooks.good.ly/hook", label="رابط الويبهوك")
    assert "رابط الويبهوك" in str(ei.value)


async def test_flow_webhook_action_refuses_internal_url_no_request(monkeypatch, v10_world):
    """D2-H2: عقدة webhook لعنوان داخلي (169.254.169.254) → فشل نظيف عربي
    ولا يخرج أي طلب من العملية (كان يُرسل PII المشتركين إلى الشبكة الداخلية)."""
    import flow_engine
    from flow_engine import FlowContext, FlowEngine

    posted: list[tuple] = []

    class _NoClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None):
            posted.append((url, json))
            return SimpleNamespace(status_code=200, raise_for_status=lambda: None)

    fake_httpx = SimpleNamespace(Timeout=lambda t: ("timeout", t), AsyncClient=_NoClient)
    monkeypatch.setattr(flow_engine, "httpx", fake_httpx)

    engine = FlowEngine(fb=None, tenant_id=501)
    ctx = FlowContext(from_id="sub-1", from_name="علي", text="مرحبا")
    async with v10_world.sf() as db:
        result = await engine._execute_action(
            "webhook", "https://169.254.169.254/latest/meta-data", ctx, db)
    assert result["success"] is False
    assert "داخلية" in result["detail"] or "مضيفات" in result["detail"]
    assert posted == [], "an internal URL must never produce an outbound request"


async def test_flow_webhook_action_dns_to_loopback_refused(monkeypatch, v10_world):
    """D2-H2 مع فجوة DNS: اسم يمر الفحص الحرفي ثم يحلّ لـ127.0.0.1 → رفض."""
    from flow_engine import FlowContext, FlowEngine

    _fake_dns(monkeypatch, ["127.0.0.1"])
    engine = FlowEngine(fb=None, tenant_id=502)
    ctx = FlowContext(from_id="sub-1", from_name="علي", text="مرحبا")
    async with v10_world.sf() as db:
        result = await engine._execute_action(
            "webhook", "https://hook.evil.ly/subscribe", ctx, db)
    assert result["success"] is False
    assert "داخلية" in result["detail"]


async def test_flow_webhook_action_safe_url_posts_with_ten_second_timeout(monkeypatch, v10_world):
    """الموجب: نطاق عام → يُرسل الحمولة (PII المشترك كما صُمم) بمهلة 10s
    وبلا اتباع توجيه — الحارس لا يخنق الاستخدام المشروع."""
    import flow_engine
    from flow_engine import FlowContext, FlowEngine

    _fake_dns(monkeypatch, ["93.184.216.34"])
    posted: list[dict] = []

    class _CaptureClient:
        def __init__(self, timeout=None, follow_redirects=None):
            posted.append({"timeout": timeout, "follow_redirects": follow_redirects})

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None):
            posted.append({"url": url, "json": json})
            return SimpleNamespace(status_code=200, raise_for_status=lambda: None)

    fake_httpx = SimpleNamespace(Timeout=lambda t: t, AsyncClient=_CaptureClient)
    monkeypatch.setattr(flow_engine, "httpx", fake_httpx)

    engine = FlowEngine(fb=None, tenant_id=503)
    ctx = FlowContext(from_id="sub-9", from_name="سالم", text="السعر كم")
    async with v10_world.sf() as db:
        result = await engine._execute_action(
            "webhook", "https://hooks.partner.ly/new-lead", ctx, db)
    assert result["success"] is True, result

    timeout_cfg = [p for p in posted if "timeout" in p and "json" not in p][0]
    assert float(timeout_cfg["timeout"]) == 10.0, f"webhook must keep the 10s timeout: {timeout_cfg}"
    assert timeout_cfg["follow_redirects"] is False
    payload = [p for p in posted if "json" in p][0]
    assert payload["json"]["from_id"] == "sub-9"
    assert payload["json"]["text"] == "السعر كم"


class _FakeStream:
    def __init__(self, resp):
        self._resp = resp

    async def __aenter__(self):
        return self._resp

    async def __aexit__(self, *exc):
        return False


class _FakeResponse:
    def __init__(self, status_code=200, headers=None, chunks=()):
        self.status_code = status_code
        self.headers = headers or {}
        self._chunks = list(chunks)

    async def aiter_bytes(self):
        for ch in self._chunks:
            yield ch


class _FetchClient:
    """عميل جلب مزيّف لـ_fetch_image_bytes: سكربت قفزات/أحجام مضبوط."""

    def __init__(self, script, timeout=None, follow_redirects=None):
        self.script = list(script)
        self.timeout = timeout
        self.follow_redirects = follow_redirects

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def stream(self, method, url):
        return _FakeStream(self.script.pop(0))


async def test_fetch_image_bytes_revalidates_redirect_target(monkeypatch):
    """إعادة التوجيه إلى مضيف داخلي → رفض عند القفزة (لا يُتبع أعمى)."""
    import ai_service

    script = [
        _FakeResponse(302, headers={"location": "https://evil.internal.ly/pic.jpg"},
                      chunks=[b""]),
    ]
    fake_httpx = SimpleNamespace(
        Timeout=lambda t: t,
        URL=lambda u: SimpleNamespace(join=lambda loc: loc),
        AsyncClient=lambda timeout=None, follow_redirects=None: _FetchClient(
            script, timeout, follow_redirects),
    )
    monkeypatch.setattr(ai_service, "httpx", fake_httpx)
    _fake_dns(monkeypatch, ["127.0.0.1"])  # الهدف يحل داخليًا

    out = await ai_service._fetch_image_bytes("https://cdn.public.ly/pic.jpg")
    assert out is None, "a redirect to an internal host must be refused"


async def test_fetch_image_bytes_size_cap_and_success(monkeypatch):
    """سقف 5MB يُطبق فورًا (content-length) والمسار الصغير يكتمل."""
    import ai_service

    # 1) الرأس يصرّح فوق السقف → رفض قبل التنزيل
    script = [_FakeResponse(200, headers={"content-length": str(6 * 1024 * 1024)},
                            chunks=[b"x" * 1024])]
    fake_httpx = SimpleNamespace(
        Timeout=lambda t: t,
        URL=lambda u: SimpleNamespace(join=lambda loc: loc),
        AsyncClient=lambda timeout=None, follow_redirects=None: _FetchClient(
            script, timeout, follow_redirects),
    )
    monkeypatch.setattr(ai_service, "httpx", fake_httpx)
    assert await ai_service._fetch_image_bytes("https://cdn.public.ly/big.jpg") is None

    # 2) الحدود نفسها مثبتة كعقد (10 ثوان · 5MB · 3 قفزات)
    assert ai_service._IMAGE_FETCH_TIMEOUT_S == 10.0
    assert ai_service._IMAGE_MAX_BYTES == 5 * 1024 * 1024
    assert ai_service._IMAGE_MAX_REDIRECTS == 3

    # 3) مسار ناجح صغير
    script2 = [_FakeResponse(200, headers={"content-length": "5"}, chunks=[b"IMG12"])]
    fake_httpx2 = SimpleNamespace(
        Timeout=lambda t: t,
        URL=lambda u: SimpleNamespace(join=lambda loc: loc),
        AsyncClient=lambda timeout=None, follow_redirects=None: _FetchClient(
            script2, timeout, follow_redirects),
    )
    monkeypatch.setattr(ai_service, "httpx", fake_httpx2)
    assert await ai_service._fetch_image_bytes("https://cdn.public.ly/ok.jpg") == b"IMG12"


# ══════════════════════════════════════════════════════════════════════════
# §E — D2-H4: الوكيل بعميل المستأجر (تعطيل آمن عربيًا)
# ══════════════════════════════════════════════════════════════════════════


async def test_agent_publishes_with_the_callers_tenant_client(v10_world, monkeypatch):
    """«انشر بوست» عبر الوكيل → عميل المستأجر الطالب (get_tenant_fb_client)
    لا عميل المنصة — النجاح برسالة عربية."""
    from agent_engine import AgentEngine

    resolved: list[int] = []

    class _RecFB:
        def __init__(self):
            self.calls = []

        async def post_to_page(self, message):
            self.calls.append(message)
            return {"id": "agent_post_1"}

    rec = _RecFB()

    async def resolver(tenant_id: int):
        resolved.append(tenant_id)
        return rec

    _patch_tenant_fb(monkeypatch, resolver)

    eng = AgentEngine()
    async with v10_world.sf() as db:
        out = await eng._execute("publish_post", {"message": "منشور الوكيل"}, db,
                                 tenant_id=9101, role="admin")
    assert out["success"] is True, out
    assert "تم النشر" in out["message_ar"]
    assert rec.calls == ["منشور الوكيل"]
    assert resolved == [9101], "the TENANT's client resolver must be used"


async def test_agent_without_credentials_fails_safe_arabic(v10_world, monkeypatch):
    """بلا صفحة مربوطة: تعطيل آمن برسالة عربية صريحة — لا مسار صامت ولا
    Graph بعميل المنصة (قبل v15 كان مسارًا ميتًا في الإنتاج المتعدد)."""
    from agent_engine import AgentEngine

    async def no_client(tenant_id: int):
        return None

    _patch_tenant_fb(monkeypatch, no_client)

    eng = AgentEngine()
    async with v10_world.sf() as db:
        out = await eng._execute("publish_post", {"message": "لن يُنشر"}, db,
                                 tenant_id=9202, role="admin")
    assert out["success"] is False
    assert "اربط صفحتك" in out["message_ar"]

    async with v10_world.sf() as db:
        out2 = await eng._execute("reply_to_comment",
                                  {"comment_id": "c1", "message": "رد"}, db,
                                  tenant_id=9202, role="admin")
    assert out2["success"] is False
    assert "اربط صفحتك" in out2["message_ar"]


async def test_agent_never_falls_back_to_platform_client_for_tenants(
        v10_world, monkeypatch):
    """حتى مع وجود اعتمادات المنصة (env): مستأجر ≠ 0 لا يلمسها أبدًا —
    المُحلِّل يُستدعى بمعرّف المستأجر (لا 0)."""
    import _services
    from agent_engine import AgentEngine

    monkeypatch.setattr(_services, "has_global_fb_credentials", lambda: True)
    resolved: list[int] = []

    async def resolver(tenant_id: int):
        resolved.append(tenant_id)
        return None

    _patch_tenant_fb(monkeypatch, resolver)

    eng = AgentEngine()
    async with v10_world.sf() as db:
        await eng._execute("publish_post", {"message": "عزل"}, db,
                           tenant_id=9303, role="admin")
    assert resolved == [9303], "tenant requests must never touch the platform client"


async def test_agent_legacy_platform_space_keeps_env_client(v10_world, monkeypatch):
    """tenant 0 (النشر الأحادي القديم) مع اعتمادات env: عميل المنصة —
    سلوك التوافق محفوظ عمداً."""
    import _services
    from agent_engine import _get_fb
    from fb_client import FBClient

    monkeypatch.setattr(_services, "has_global_fb_credentials", lambda: True)
    client = await _get_fb(0)
    assert isinstance(client, FBClient), "legacy tenant 0 keeps the platform env client"


# ══════════════════════════════════════════════════════════════════════════
# §F — D12-M4/M2 + D6-M3: trigger الصادق + مسارات الكرون
# ══════════════════════════════════════════════════════════════════════════


async def test_bot_trigger_runs_inline_and_reports_completion(v10_seed, monkeypatch):
    """D12-M4: الدورة تكتمل داخل الطلب (لا spawn يموت بعد الرد) والرد
    يروي الحقيقة (completed=True)."""
    import routers.bot as bot_mod

    ran = {"n": 0}

    async def fake_cycle():
        ran["n"] += 1
        return None

    monkeypatch.setattr(bot_mod, "_run_single_cycle", fake_cycle)

    admin, _tid, _uid = await v10_seed.platform_admin()
    v10_seed.auth(admin, 0)
    r = await v10_seed.world.client.post("/api/bot/trigger")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["data"]["completed"] is True
    assert "اكتملت دورة البوت" in body["data"]["message"]
    assert ran["n"] == 1, "the cycle must ACTUALLY run inside the request"


async def test_bot_trigger_budget_exceeded_reports_still_running(v10_seed, monkeypatch):
    """موازنة الطلب تنفد والدورة ما تزال جارية → completed=False ورسالة
    صادقة (النبض التالي يكمل) — لا ادعاء نجاح كاذب."""
    import routers.bot as bot_mod

    monkeypatch.setattr(bot_mod, "_TRIGGER_CYCLE_BUDGET_S", 0.05)

    async def slow_cycle():
        await asyncio.sleep(0.4)
        return None

    monkeypatch.setattr(bot_mod, "_run_single_cycle", slow_cycle)

    admin, _tid, _uid = await v10_seed.platform_admin()
    v10_seed.auth(admin, 0)
    r = await v10_seed.world.client.post("/api/bot/trigger")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["data"]["completed"] is False
    assert "ما تزال جارية" in body["data"]["message"]


async def test_bot_trigger_failure_reports_fail_envelope(v10_seed, monkeypatch):
    """فشل الدورة → fail() عربي صادق (لا ok زائف)."""
    import routers.bot as bot_mod

    async def broken_cycle():
        raise RuntimeError("engine exploded")

    monkeypatch.setattr(bot_mod, "_run_single_cycle", broken_cycle)

    admin, _tid, _uid = await v10_seed.platform_admin()
    v10_seed.auth(admin, 0)
    r = await v10_seed.world.client.post("/api/bot/trigger")
    body = r.json()
    assert body["success"] is False
    assert "فشل تشغيل دورة البوت" in body["error"]


def _patch_observability(monkeypatch):
    import _observability as obs

    async def _noop_staleness():
        return "fresh"

    async def _noop_record(report):
        return None

    async def _last():
        return utcnow()

    monkeypatch.setattr(obs, "check_cron_staleness_and_alert", _noop_staleness)
    monkeypatch.setattr(obs, "record_heartbeat", _noop_record)
    monkeypatch.setattr(obs, "get_last_heartbeat", _last)


async def test_cron_heartbeat_bearer_only_and_token_query_refused(
        v10_seed, monkeypatch):
    """v16-E2 (D2-LEAD B — إزالة ?token=): Bearer وحده يمر (200)؛
    ?token= بالسر الصحيح نفسه → 403 (القناة ميتة والمسار يسرّب السر إلى
    سجلات الوصول)؛ بلا اعتماد → 403 عربية."""
    import routers.bot as bot_mod

    _patch_observability(monkeypatch)
    monkeypatch.setattr(bot_mod, "AsyncSessionLocal", v10_seed.world.sf)

    c = v10_seed.world.client
    r = await c.get("/api/cron/heartbeat",
                    headers={"Authorization": "Bearer test-cron-secret"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["published_posts"] == 0

    # v16-E2: even the CORRECT secret in the query string is refused now.
    r = await c.get("/api/cron/heartbeat?token=test-cron-secret")
    assert r.status_code == 403, (
        f"?token= must be gone (403), got {r.status_code}: {r.text[:200]}"
    )

    r = await c.get("/api/cron/heartbeat")
    assert r.status_code == 403
    r = await c.get("/api/cron/heartbeat?token=wrong-secret")
    assert r.status_code == 403
    r = await c.get("/api/cron/heartbeat",
                    headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 403


async def test_cron_bot_cycle_accepts_bearer_only(v10_seed, monkeypatch):
    """bot-cycle بالنمط نفسه (توقيع _cron_authorized الموحّد): Bearer=200،
    ?token= بالسر الصحيح → 403 (v16-E2)."""
    import routers.bot as bot_mod

    monkeypatch.setattr(bot_mod, "AsyncSessionLocal", v10_seed.world.sf)

    c = v10_seed.world.client
    r = await c.get("/api/cron/bot-cycle",
                    headers={"Authorization": "Bearer test-cron-secret"})
    assert r.status_code == 200, r.text

    r = await c.get("/api/cron/bot-cycle?token=test-cron-secret")
    assert r.status_code == 403, (
        f"?token= must be gone (403), got {r.status_code}: {r.text[:200]}"
    )

    r = await c.get("/api/cron/bot-cycle?token=wrong")
    assert r.status_code == 403


async def test_cron_heartbeat_publishes_claimed_post_end_to_end(
        v10_seed, monkeypatch):
    """التوصيل الكامل: نبض حقيقي عبر HTTP ينشر منشورًا مستحقًا مرة واحدة
        (الخطوة 1 = _publish_due_scheduled_posts على SF المعزولة)."""
    import routers.bot as bot_mod

    _patch_observability(monkeypatch)
    sf = v10_seed.world.sf
    monkeypatch.setattr(bot_mod, "AsyncSessionLocal", sf)

    tid = 9909
    post_id = await _seed_due_post(sf, tid, "منشور النبض")
    slow = _SlowFB(delay=0.05)
    _patch_tenant_fb(monkeypatch, lambda tenant_id: _async_result(slow))

    c = v10_seed.world.client
    r = await c.get("/api/cron/heartbeat",
                    headers={"Authorization": "Bearer test-cron-secret"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["published_posts"] == 1
    assert slow.calls == ["منشور النبض"]

    from models import ScheduledPost

    async with sf() as db:
        post = await db.get(ScheduledPost, post_id)
        assert post.status == "published"

    # النبض الثاني: لا شيء جديد (idempotent)
    r2 = await c.get("/api/cron/heartbeat",
                     headers={"Authorization": "Bearer test-cron-secret"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["published_posts"] == 0
    assert slow.calls == ["منشور النبض"], "second beat must not re-publish"


async def test_dead_cron_lock_is_gone():
    """D12-M2: _cron_lock الميت أُزيل (لا حالة وحدة ميتة)."""
    import routers.bot as bot_mod

    assert not hasattr(bot_mod, "_cron_lock")
