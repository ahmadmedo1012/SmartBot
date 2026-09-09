"""v16-E2 — اختبارات الحقيقة الإنتاجية (production-truth).

كل اختبار هنا يقترن ببند من تقريري v16-D4 (prod-truth) وv16-D2 (security):

  [D2-A]     إيصال الدفع: الحارس الصادر الكامل مع حل DNS — اسم يحلّ إلى
             عنوان داخلي → 400 «رابط الإيصال مرفوض» (p13-ssrf-receipt-dns)
  [D4-H1]    تذاكر الدعم: الإخطار ملتزم قبل الرد ومحروس (فشل تلغرام لا
             يفشل الطلب) + طابور أدمن المنصة عبر المستأجرين
             (/api/admin/support/tickets) + صلاحيات + فلتر + ترقيم
  [D4-drip]  الحملات التسلسلية: مستهلك نبض بمطالبة ذرّية — الخطوة المستحقة
             تُرسل مرة واحدة بالضبط تحت مسحّين متزامنين، غير المستحقة لا
             تُلمس، فشل الإرسال يعلّم failed بلا رفع استثناء، غياب الصفحة
             يطلق الادعاء، والاستهلاك موصول بذيل cycle()
  [D4-عقود]  الحالات: SSE يغلق عند cancelled · الرفض يكتب
             tenant.subscription_status=REJECTED · الموافقة تكتب
             user.plan_id (مزامنة HTTP مع تلغرام) · «active» ليست مدفوعة
             في /api/public/stats
  [D4-login] الدخول الصادق: subscriptionStatus من خطة المستأجر الفعلية
  [D2-B]     ?token= أُزيلت: النبض بالسر الصحيح في الاستعلام → 403،
             Bearer يبقى 200
  [D6]       cleanup-logs الموسّع: analytics>90d + المقروءة>90d + تجريد
             إيصالات data: من الدفعات النهائية >30d (جراحة JSON فقط)

لا نداء Graph ولا DNS حقيقي يخرج من العملية: كل مسار خارجي مزيّف
(نفس قاعدة الجناح — test_v15_concurrency/test_v15_money_core).
"""
from __future__ import annotations

import asyncio
import json
import os
import tempfile
import uuid
from datetime import timedelta

import pytest
from _utils import utcnow
from sqlalchemy import select

# ══════════════════════════════════════════════════════════════════════════
# أدوات مشتركة
# ══════════════════════════════════════════════════════════════════════════


def _fake_dns(monkeypatch, ips):
    import ai_service

    async def resolve(host: str):
        return list(ips)

    monkeypatch.setattr(ai_service, "_resolve_host_ips", resolve)


def _patch_observability(monkeypatch):
    """نبض بلا تلغرام/دفتر حقيقي (نفس مساعد test_v15_concurrency)."""
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


@pytest.fixture
async def race_db():
    """قاعدة ملفات SQLite باتصالات مستقلة حقيقية (ليس StaticPool) — لسباقات
    gather فعلية مع busy timeout (نمط test_v15_concurrency.race_db)."""
    from models import Base
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    fd, path = tempfile.mkstemp(prefix="v16_e2_race_", suffix=".db")
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


async def _seed_payment(sf, *, user_id, tenant_id, receipt_url="",
                        status="pending", created_days_ago=0,
                        extra=None, plan_id=1) -> int:
    from models import SubscriptionPayment

    data = {"username": "عميل"}
    if receipt_url:
        data["receipt_url"] = receipt_url
    if extra:
        data.update(extra)
    async with sf() as db:
        sp = SubscriptionPayment(
            user_id=user_id, tenant_id=tenant_id, phone="0911",
            amount=50.0, provider="bank", plan_id=plan_id, plan_name="برو",
            status=status, extra_data=data,
            created_at=utcnow() - timedelta(days=created_days_ago),
        )
        db.add(sp)
        await db.commit()
        await db.refresh(sp)
        return sp.id


async def _seed_plan(sf, name: str = "Pro", period_days: int = 30) -> int:
    from models import SubscriptionPlan

    async with sf() as db:
        p = SubscriptionPlan(name=name, name_ar=f"{name} عربي", price=50.0,
                             period_days=period_days, is_active=True)
        db.add(p)
        await db.commit()
        await db.refresh(p)
        return p.id


# ══════════════════════════════════════════════════════════════════════════
# §A — p13-ssrf-receipt-dns: حارس الإيصال يحلّ DNS (D2-LEAD A)
# ══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("bad_ip", [
    "127.0.0.1",        # loopback عبر DNS
    "10.0.0.5",         # RFC1918
    "169.254.169.254",  # ميتاداتا السحابة
    "fd00::1",          # IPv6 ULA
])
async def test_receipt_route_rejects_internal_dns_resolution(
        v10_seed, monkeypatch, bad_ip):
    """الاسم يجتاز فحص IP الحرفي ثم يحلّ داخلياً → 400 عربية (لا جلب شبكي)."""
    from models import SubscriptionPayment

    _fake_dns(monkeypatch, [bad_ip])
    uname, tid, uid = await v10_seed.tenant_user()
    sp_id = await _seed_payment(v10_seed.world.sf, user_id=uid, tenant_id=tid,
                                receipt_url="https://receipt.evil.ly/x.jpg")
    v10_seed.auth(uname, tid)

    r = await v10_seed.world.client.get(f"/api/payments/receipt/{sp_id}")
    assert r.status_code == 400, r.text
    assert "رابط الإيصال مرفوض" in r.text

    # صادق أيضاً: لم يخرج أي طلب جلب خارجي بعد الرفض
    async with v10_seed.world.sf() as db:
        sp = await db.get(SubscriptionPayment, sp_id)
        assert (sp.extra_data or {}).get("receipt_url") == "https://receipt.evil.ly/x.jpg"


async def test_receipt_route_public_dns_passes_to_guarded_fetch(
        v10_seed, monkeypatch):
    """المسار الموجب: IP عام يمر → الجلب المحروس يُستدعى (مزيّف) ويُخدَم."""
    import routers.payments.approvals as approvals_mod

    _fake_dns(monkeypatch, ["93.184.216.34"])
    fetched: list[str] = []

    async def _fake_fetch(url):
        fetched.append(url)
        return b"fake-jpeg-bytes"

    monkeypatch.setattr(approvals_mod, "_fetch_remote_receipt", _fake_fetch)

    uname, tid, uid = await v10_seed.tenant_user()
    sp_id = await _seed_payment(v10_seed.world.sf, user_id=uid, tenant_id=tid,
                                receipt_url="https://receipt.good.ly/r.jpg")
    v10_seed.auth(uname, tid)

    r = await v10_seed.world.client.get(f"/api/payments/receipt/{sp_id}")
    assert r.status_code == 200, r.text
    assert r.content == b"fake-jpeg-bytes"
    assert fetched == ["https://receipt.good.ly/r.jpg"]


# ══════════════════════════════════════════════════════════════════════════
# §B — تذاكر الدعم: التزام قبل الإخطار + طابور أدمن المنصة (D4-H1)
# ══════════════════════════════════════════════════════════════════════════


async def test_support_ticket_created_and_admin_notified_inline(v10_seed, monkeypatch):
    """التذكرة تُلتزم ثم يُرسل إخطار تلغرام المُنتظر قبل الرد (بلا spawn)."""
    import telegram_bot as tg

    sent: list[tuple] = []

    async def fake_notify(subject, message, email=""):
        sent.append((subject, message, email))

    monkeypatch.setattr(tg, "notify_admins_support_ticket", fake_notify)

    uname, tid, _uid = await v10_seed.tenant_user()
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client
    r = await c.post("/api/support/ticket", json={
        "subject": "مشكلة في الردود", "message": "البوت لا يرد على التعليقات منذ الصباح",
        "email": "owner@test.ly", "priority": "high",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert "خلال 24 ساعة" in body["data"]["message"]

    # الإخطار انطلق فعلاً (inline — مات spawn على Vercel)
    assert len(sent) == 1
    assert sent[0][0] == "مشكلة في الردود"

    # الصف ملتزم ومقروء من جلسة جديدة
    from models import SupportTicket
    async with v10_seed.world.sf() as db:
        t = (await db.execute(select(SupportTicket).where(
            SupportTicket.tenant_id == tid))).scalars().first()
        assert t is not None, "ticket must be committed"
        assert t.status == "open"
        assert t.priority == "high"
        assert t.email == "owner@test.ly"


async def test_support_ticket_survives_telegram_notify_failure(v10_seed, monkeypatch):
    """فشل إخطار تلغرام لا يفشل الطلب ولا يفقد التذكرة (كان except: pass)."""
    import telegram_bot as tg

    async def broken_notify(subject, message, email=""):
        raise RuntimeError("telegram exploded")

    monkeypatch.setattr(tg, "notify_admins_support_ticket", broken_notify)

    uname, tid, _uid = await v10_seed.tenant_user()
    v10_seed.auth(uname, tid)
    c = v10_seed.world.client
    r = await c.post("/api/support/ticket", json={
        "subject": "تذكرة بلا تلغرام", "message": "رسالة أطول من عشرة أحرف بوضوح",
    })
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True

    from models import SupportTicket
    async with v10_seed.world.sf() as db:
        rows = (await db.execute(select(SupportTicket).where(
            SupportTicket.tenant_id == tid))).scalars().all()
        assert len(rows) == 1, "the ticket is durable even when Telegram fails"


async def _seed_ticket(sf, *, tenant_id, status="open", subject="موضوع",
                       days_ago=0, user_id=None, email="u@test.ly"):
    from models import SupportTicket

    async with sf() as db:
        t = SupportTicket(
            tenant_id=tenant_id, user_id=user_id, email=email,
            subject=subject, body="نص التذكرة", priority="medium", status=status,
            created_at=utcnow() - timedelta(days=days_ago),
        )
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return t.id


async def test_platform_admin_ticket_queue_cross_tenant(v10_seed):
    """أدمن المنصة يرى تذاكر كل المستأجرين مع اسم المستأجر (كان صفر قنوات)."""
    world = v10_seed.world
    ua, ta, _ = await v10_seed.tenant_user(tenant_name="متجر أ")
    ub, tb, _ = await v10_seed.tenant_user(tenant_name="متجر ب")
    id_a = await _seed_ticket(world.sf, tenant_id=ta, subject="تذكرة أ", days_ago=2)
    id_b = await _seed_ticket(world.sf, tenant_id=tb, subject="تذكرة ب", days_ago=1)
    await _seed_ticket(world.sf, tenant_id=tb, subject="مغلقة", status="closed", days_ago=5)

    admin, _tid, _uid = await v10_seed.platform_admin()
    v10_seed.auth(admin, 0)
    r = await world.client.get("/api/admin/support/tickets")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["total"] == 3
    subjects = [i["subject"] for i in data["items"]]
    assert set(subjects) == {"تذكرة أ", "تذكرة ب", "مغلقة"}
    by_id = {i["id"]: i for i in data["items"]}
    assert by_id[id_a]["tenant_name"] == "متجر أ"
    assert by_id[id_b]["tenant_name"] == "متجر ب"
    # كل الحقول الحية في العقد (E2→E3)
    for item in data["items"]:
        assert set(item) >= {"id", "subject", "status", "priority", "tenant_name",
                             "email", "created_at", "body"}
    # الأحدث أولاً
    assert data["items"][0]["subject"] == "تذكرة ب"


async def test_platform_admin_ticket_queue_filter_and_pagination(v10_seed):
    """فلتر status + ترقيم limit/page + ممنوع قيمة غير معروفة."""
    world = v10_seed.world
    ua, ta, _ = await v10_seed.tenant_user()
    for i in range(5):
        await _seed_ticket(world.sf, tenant_id=ta, subject=f"ت{i}",
                           status="open" if i % 2 else "closed", days_ago=i)
    admin, _tid, _uid = await v10_seed.platform_admin()
    v10_seed.auth(admin, 0)
    c = world.client

    r = await c.get("/api/admin/support/tickets", params={"status": "open"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["total"] == 2  # i=1,3 are open (i=0,2,4 closed)
    assert all(i["status"] == "open" for i in data["items"])

    r = await c.get("/api/admin/support/tickets", params={"status": "junk"})
    assert r.status_code == 400, r.text

    r = await c.get("/api/admin/support/tickets", params={"limit": 2, "page": 1})
    data = r.json()["data"]
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["page"] == 1
    r2 = await c.get("/api/admin/support/tickets", params={"limit": 2, "page": 2})
    page1 = [i["id"] for i in data["items"]]
    page2 = [i["id"] for i in r2.json()["data"]["items"]]
    assert not set(page1) & set(page2), "pages must not overlap"


async def test_platform_admin_ticket_queue_forbidden_for_tenant_scopes(v10_seed):
    """أدمن مستأجر/مستخدم عادي → 403 (الحارس platform-admin حصرياً)."""
    world = v10_seed.world
    ua, ta, _ = await v10_seed.tenant_user()
    v10_seed.auth(ua, ta)
    r = await world.client.get("/api/admin/support/tickets")
    assert r.status_code == 403, r.text

    v10_seed.logout()
    ue, te, _ = await v10_seed.tenant_user(role="viewer")
    v10_seed.auth(ue, te)
    r = await world.client.get("/api/admin/support/tickets")
    assert r.status_code == 403, r.text

    v10_seed.logout()
    r = await world.client.get("/api/admin/support/tickets")
    assert r.status_code == 401, r.text


# ══════════════════════════════════════════════════════════════════════════
# §C — مستهلك الخطوات التسلسلية (D4 §drip): مطالبة ذرّية + إرسال لمرة واحدة
# ══════════════════════════════════════════════════════════════════════════


class SlowFB:
    """عميل FB بطيء يسجّل نداءات send_dm — يفتح نافذة السباق الحقيقية."""

    def __init__(self, delay: float = 0.12, ok: bool = True):
        self.dm_calls: list[tuple[str, str]] = []
        self.delay = delay
        self.ok = ok

    async def send_dm(self, fb_user_id: str, message: str):
        self.dm_calls.append((fb_user_id, message))
        await asyncio.sleep(self.delay)
        return {"message_id": f"m{len(self.dm_calls)}"} if self.ok else None


def _patch_tenant_fb(monkeypatch, factory):
    """Redirect the per-tenant FB client resolution (mirror test_v15_concurrency:
    the factory returns an AWAITABLE — the consumer awaits it)."""
    import _services

    monkeypatch.setattr(_services, "get_tenant_fb_client", factory)


async def _ares(value):
    return value


async def _seed_due_sequence(sf, *, tenant_id: int, due: bool = True,
                             step2_delay_hours: int = 48) -> tuple[int, int, str]:
    """يزرع تسلسلاً بخطوتين + مشتركاً + اشتراكاً نشطاً عند الخطوة 1.

    Returns (subscription_id, sequence_id, subscriber_fb_id).
    """
    from models import Sequence, SequenceStep, SequenceSubscription, Subscriber

    msg = "مرحباً {name} — عرض خاص اليوم"
    async with sf() as db:
        seq = Sequence(name="ترحيب", tenant_id=tenant_id, status="active")
        db.add(seq)
        await db.flush()
        db.add(SequenceStep(sequence_id=seq.id, tenant_id=tenant_id, step_order=1,
                            delay_days=0, delay_hours=0, message_template=msg))
        db.add(SequenceStep(sequence_id=seq.id, tenant_id=tenant_id, step_order=2,
                            delay_days=0, delay_hours=step2_delay_hours,
                            message_template="اليوم الثاني {name}"))
        fb_id = f"seqsub_{uuid.uuid4().hex[:6]}"
        sub = Subscriber(tenant_id=tenant_id, fb_user_id=fb_id, name="علي كامل",
                         first_name="علي", platform="messenger", status="active")
        db.add(sub)
        await db.flush()
        entered = utcnow() - timedelta(hours=2) if due else utcnow() + timedelta(hours=2)
        ssub = SequenceSubscription(sequence_id=seq.id, subscriber_id=sub.id,
                                   tenant_id=tenant_id, current_step=1,
                                   status="active", entered_at=entered)
        db.add(ssub)
        await db.commit()
        await db.refresh(ssub)
        return ssub.id, seq.id, fb_id


async def test_sequence_consumer_two_concurrent_passes_send_exactly_once(
        race_db, monkeypatch):
    """قلب D4-drip: نبضان متزامنان (اتصالات مستقلة + إرسال بطيء 0.12s)
    يريان نفس الخطوة المستحقة — إرسال عام واحد بالضبط، تقدم واحد،
    والادعاء لا يزدوج (نمط السباق في test_v15_concurrency §A)."""
    from models import BotState, Sequence, SequenceSubscription
    from sequence_engine import _claim_key, process_due_sequence_steps

    tid = 8801
    sub_id, seq_id, fb_id = await _seed_due_sequence(race_db, tenant_id=tid)

    slow = SlowFB(delay=0.12)
    _patch_tenant_fb(monkeypatch, lambda tenant_id: _ares(slow))

    async def consume():
        async with race_db() as db:
            return await process_due_sequence_steps(db)

    n_a, n_b = await asyncio.gather(consume(), consume())

    assert len(slow.dm_calls) == 1, f"double send! Messenger called {len(slow.dm_calls)} times"
    assert slow.dm_calls[0][0] == fb_id
    assert "علي" in slow.dm_calls[0][1]
    assert n_a + n_b == 1, f"exactly one pass must score the send (got {n_a}+{n_b})"

    async with race_db() as db:
        sub = await db.get(SequenceSubscription, sub_id)
        assert sub.status == "active", "surviving claim returns to the runnable state"
        assert sub.current_step == 2, "the winner advanced to the next step"
        seq = await db.get(Sequence, seq_id)
        assert (seq.total_sent or 0) == 1
        marker = (await db.execute(select(BotState).where(
            BotState.tenant_id == tid, BotState.key == _claim_key(sub_id))
        )).scalar_one_or_none()
        assert marker is None, "terminal state drops the claim marker"

    # الاستدعاء الثالث: لا شيء جديد (idempotent)
    async with race_db() as db:
        assert await process_due_sequence_steps(db) == 0
    assert len(slow.dm_calls) == 1


async def test_sequence_consumer_nondue_untouched(race_db, monkeypatch):
    """غير المستحقة لا تُلمس: لا إرسال، لا تغيير حالة، لا ادعاء."""
    from models import SequenceSubscription
    from sequence_engine import process_due_sequence_steps

    sub_id, _seq, _fb = await _seed_due_sequence(race_db, tenant_id=8802, due=False)
    slow = SlowFB()
    _patch_tenant_fb(monkeypatch, lambda tenant_id: _ares(slow))

    async with race_db() as db:
        assert await process_due_sequence_steps(db) == 0
    assert slow.dm_calls == []
    async with race_db() as db:
        sub = await db.get(SequenceSubscription, sub_id)
        assert sub.status == "active"
        assert sub.current_step == 1


async def test_sequence_consumer_failed_send_marks_failed_and_continues(
        race_db, monkeypatch):
    """سياسة الفشل: محاولة واحدة → تعليم failed + استمرار الدفعة بلا رفع."""
    from models import BotState, Sequence, SequenceSubscription, Subscriber
    from sequence_engine import _claim_key, process_due_sequence_steps

    tid = 8803
    # خطوتان مستحقتان لمشتركين: الأولى تفشل (send_dm=None) والثانية تنجح —
    # فشل الأولى لا يحجب الثانية.
    sub1, _s1, fb1 = await _seed_due_sequence(race_db, tenant_id=tid)
    # مشترك ثانٍ في نفس التسلسل (المطابقة بـ subscriber_id/sequence_id)
    async with race_db() as db:
        sub2 = Subscriber(tenant_id=tid, fb_user_id=f"seqsub_{uuid.uuid4().hex[:6]}",
                          name="سارة كاملة", first_name="سارة",
                          platform="messenger", status="active")
        db.add(sub2)
        await db.flush()
        seq_row = (await db.execute(select(Sequence))).scalars().first()
        ssub2 = SequenceSubscription(sequence_id=seq_row.id, subscriber_id=sub2.id,
                                     tenant_id=tid, current_step=1, status="active",
                                     entered_at=utcnow() - timedelta(hours=2))
        db.add(ssub2)
        await db.commit()
        await db.refresh(ssub2)
        sub2_id = ssub2.id

    calls: list[str] = []

    class _FlakyFB:
        async def send_dm(self, fb_user_id, message):
            calls.append(fb_user_id)
            return None if fb_user_id == fb1 else {"message_id": "ok"}

    _patch_tenant_fb(monkeypatch, lambda tenant_id: _ares(_FlakyFB()))

    async with race_db() as db:
        sent = await process_due_sequence_steps(db)
    assert sent == 1, "the second (successful) step still sends — the batch continues"
    assert len(calls) == 2, "both due steps were ATTEMPTED (failure did not block)"

    async with race_db() as db:
        failed = await db.get(SequenceSubscription, sub1)
        assert failed.status == "failed", "one failed attempt marks the step failed"
        assert failed.completed_at is not None
        assert failed.current_step == 1, "no advance on failure"
        ok_sub = await db.get(SequenceSubscription, sub2_id)
        assert ok_sub.status == "active"
        assert ok_sub.current_step == 2
        marker = (await db.execute(select(BotState).where(
            BotState.tenant_id == tid, BotState.key == _claim_key(sub1))
        )).scalar_one_or_none()
        assert marker is None, "failed terminal state also drops the marker"


async def test_sequence_consumer_no_page_releases_claim(race_db, monkeypatch):
    """لا صفحة مربوطة → الادعاء يُطلق والاشتراك يبقى نشطاً (سياسة v14-E2:
    يُرسل عند الربط) — لا يعلق في sending ولا يُعلّم failed."""
    from models import SequenceSubscription
    from sequence_engine import process_due_sequence_steps

    sub_id, _seq, _fb = await _seed_due_sequence(race_db, tenant_id=8804)
    _patch_tenant_fb(monkeypatch, lambda tenant_id: _ares(None))

    async with race_db() as db:
        assert await process_due_sequence_steps(db) == 0
    async with race_db() as db:
        sub = await db.get(SequenceSubscription, sub_id)
        assert sub.status == "active", "claim released — not stuck in sending"
        assert sub.current_step == 1

    # بعد الربط (عميل متاح) يُرسل مرة واحدة
    slow = SlowFB(delay=0.01)
    _patch_tenant_fb(monkeypatch, lambda tenant_id: _ares(slow))
    async with race_db() as db:
        assert await process_due_sequence_steps(db) == 1
    assert len(slow.dm_calls) == 1


async def test_sequence_stale_claim_recovery(race_db):
    """ادعاء متقادم (>600s مع علامة قديمة) يعود active؛ الحي لا يُلمس؛
    بلا علامة يُترك (تحفظي — نمط recover_stale_publishing)."""

    from models import BotState, SequenceSubscription
    from sequence_engine import _claim_key, recover_stale_sequence_claims

    tid = 8805
    stale_id, _s, _f = await _seed_due_sequence(race_db, tenant_id=tid)
    live_id, _s2, _f2 = await _seed_due_sequence(race_db, tenant_id=8806)
    no_marker_id, _s3, _f3 = await _seed_due_sequence(race_db, tenant_id=8807)

    async with race_db() as db:
        for sid in (stale_id, live_id, no_marker_id):
            sub = await db.get(SequenceSubscription, sid)
            sub.status = "sending"
        db.add(BotState(tenant_id=tid, key=_claim_key(stale_id),
                        value=(utcnow() - timedelta(seconds=700)).isoformat()))
        db.add(BotState(tenant_id=8806, key=_claim_key(live_id),
                        value=utcnow().isoformat()))
        await db.commit()

    async with race_db() as db:
        assert await recover_stale_sequence_claims(db) == 1

    async with race_db() as db:
        assert (await db.get(SequenceSubscription, stale_id)).status == "active"
        assert (await db.get(SequenceSubscription, live_id)).status == "sending"
        assert (await db.get(SequenceSubscription, no_marker_id)).status == "sending"


@pytest.fixture
async def eng_world(v10_world, monkeypatch):
    """قاعدة معزولة + توجيه AsyncSessionLocal الخاص بالمحرك إليها."""
    import bot_engine.engine as engine_mod
    monkeypatch.setattr(engine_mod, "AsyncSessionLocal", v10_world.sf)
    return v10_world


class _BareFB:
    page_id = "fakepage"


async def test_cycle_drains_sequence_consumer_contract(eng_world, monkeypatch):
    """التوصيل: ذيل cycle() يستدعي process_due_sequence_steps(session)
    (بجوار broadcast/marketing) حتى مع خروج مبكر (لا قواعد)."""
    import sequence_engine as seq_mod
    from bot_engine.engine import BotEngine

    seen: list[tuple[str, object]] = []

    async def fake_consume(session):
        seen.append(("sequence", session))
        return 0

    monkeypatch.setattr(seq_mod, "process_due_sequence_steps", fake_consume)
    engine = BotEngine(_BareFB(), tenant_id=8899)
    await engine.cycle()
    assert [k for k, _ in seen] == ["sequence"]
    assert seen[0][1] is not None, "contract: the cycle's session is passed"
    assert engine._cycle == 1


async def test_cycle_sequence_drain_failure_isolated(eng_world, monkeypatch):
    """فشل مستهلك التسلسلية معزول: الدورة تكتمل بلا استثناء."""
    import sequence_engine as seq_mod
    from bot_engine.engine import BotEngine

    async def boom(session):
        raise RuntimeError("sequence drain boom")

    monkeypatch.setattr(seq_mod, "process_due_sequence_steps", boom)
    engine = BotEngine(_BareFB(), tenant_id=8898)
    await engine.cycle()  # must NOT raise
    assert engine._cycle == 1


# ══════════════════════════════════════════════════════════════════════════
# §D — عقود الحالة: SSE + REJECTED + user.plan_id + «active» الميتة
# ══════════════════════════════════════════════════════════════════════════


async def _read_stream(client, payment_id: int, *, max_events: int = 60):
    """قراءة مجرى SSE إلى [('data', obj) | ('event', name)] حتى النهاية."""
    events: list[tuple[str, object]] = []
    saw_terminal = False
    async with client.stream(
        "GET", f"/api/subscriptions/status-stream?payment_id={payment_id}"
    ) as resp:
        assert resp.status_code == 200
        async for line in resp.aiter_lines():
            if line.startswith("data: "):
                events.append(("data", json.loads(line[6:])))
            elif line.startswith("event: "):
                name = line[7:].strip()
                events.append(("event", name))
                if name in ("close", "error"):
                    saw_terminal = True
            elif line == "" and saw_terminal:
                break
            if len(events) >= max_events:
                break
    return events


@pytest.mark.parametrize("terminal", ["cancelled", "verified"])
async def test_sse_terminal_statuses_close_the_stream(v10_seed, monkeypatch, terminal):
    """«cancelled» أصبحت نهائية (كانت مفقودة — المتصفح يبقى ينتظر 10 دقائق
    بعد الإلغاء)؛ verified كما كانت."""
    import routers.payments.sse as sse_mod

    sf = v10_seed.world.sf
    monkeypatch.setattr(sse_mod, "AsyncSessionLocal", sf)
    monkeypatch.setattr(sse_mod, "_SSE_POLL_SECONDS", 0.05)

    uname, tid, uid = await v10_seed.tenant_user()
    sp_id = await _seed_payment(sf, user_id=uid, tenant_id=tid, status=terminal)
    v10_seed.auth(uname, tid)

    events = await _read_stream(v10_seed.world.client, sp_id)
    data_events = [e for e in events if e[0] == "data" and "status" in e[1]]
    assert data_events, "the initial snapshot must arrive"
    assert data_events[-1][1]["status"] == terminal
    assert ("event", "close") in events, f"terminal {terminal} must close the stream"


async def test_sse_pending_status_does_not_close_early(v10_seed, monkeypatch):
    """العقد المقلوب: pending ليست نهائية — لا close (الدفق يُنهيه المهلة
    القصوى المقلّصة للاختبار)."""
    import routers.payments.sse as sse_mod

    sf = v10_seed.world.sf
    monkeypatch.setattr(sse_mod, "AsyncSessionLocal", sf)
    monkeypatch.setattr(sse_mod, "_SSE_POLL_SECONDS", 0.05)
    monkeypatch.setattr(sse_mod, "_SSE_MAX_LIFETIME", 0.3)

    uname, tid, uid = await v10_seed.tenant_user()
    sp_id = await _seed_payment(sf, user_id=uid, tenant_id=tid, status="pending")
    v10_seed.auth(uname, tid)

    events = await _read_stream(v10_seed.world.client, sp_id)
    assert ("event", "close") in events  # from the LIFETIME cap, not the status
    data_events = [e for e in events if e[0] == "data" and "status" in e[1]]
    assert data_events[-1][1]["status"] == "pending"


async def test_rejection_writes_tenant_rejected_status(v10_seed):
    """الرفض يكتب tenant.subscription_status=REJECTED (يغلق فرع engine.py:352
    الميت: REJECTED كان يُقرأ ولا يُكتب أبداً)."""
    from models import SubscriptionPayment, Tenant

    sf = v10_seed.world.sf
    uname, tid, uid = await v10_seed.tenant_user()
    sp_id = await _seed_payment(sf, user_id=uid, tenant_id=tid)

    admin, _t, _u = await v10_seed.platform_admin()
    v10_seed.auth(admin, 0)
    r = await v10_seed.world.client.post("/api/admin/subscriptions",
                                         json={"id": sp_id, "status": "cancelled"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "cancelled"

    async with sf() as db:
        tenant = await db.get(Tenant, tid)
        assert tenant.subscription_status == "REJECTED"
        sp = await db.get(SubscriptionPayment, sp_id)
        assert sp.status == "cancelled"
    # الصف المقلوب: فرع الحسم لا يُعالج مرتين
    r2 = await v10_seed.world.client.post("/api/admin/subscriptions",
                                          json={"id": sp_id, "status": "cancelled"})
    assert r2.status_code == 400, r2.text


async def test_approval_writes_user_plan_id_like_telegram(v10_seed):
    """الموافقة HTTP تكتب user.plan_id أيضاً (مزامنة مع telegram.py:113 —
    كان الانحراف: تلغرام يكتبها وHTTP لا)."""
    from models import SubscriptionPayment, Tenant, User

    sf = v10_seed.world.sf
    plan_id = await _seed_plan(sf, name="Pro")
    uname, tid, uid = await v10_seed.tenant_user()
    sp_id = await _seed_payment(sf, user_id=uid, tenant_id=tid, plan_id=plan_id)

    admin, _t, _u = await v10_seed.platform_admin()
    v10_seed.auth(admin, 0)
    r = await v10_seed.world.client.post("/api/admin/subscriptions",
                                         json={"id": sp_id, "status": "verified"})
    assert r.status_code == 200, r.text

    async with sf() as db:
        tenant = await db.get(Tenant, tid)
        assert tenant.subscription_status == "PAID"
        assert tenant.plan_id == plan_id
        assert tenant.plan == "pro"
        user = await db.get(User, uid)
        assert user.plan_id == plan_id
        assert user.subscription_status == "PAID"
        sp = await db.get(SubscriptionPayment, sp_id)
        assert sp.status == "verified"
        assert tenant.plan_end is not None


async def test_public_stats_active_literal_not_counted(v10_seed):
    """«active» لم يعد يُحتسب (لا كاتب لها — كانت مرشحاً حرفياً ميتاً)."""
    from models import Tenant

    sf = v10_seed.world.sf
    async with sf() as db:
        db.add(Tenant(name="مدفوع", subscription_status="PAID", is_active=True))
        db.add(Tenant(name="نشطة-حرفياً", subscription_status="active", is_active=True))
        db.add(Tenant(name="غير مدفوع", subscription_status="UNPAID", is_active=True))
        await db.commit()

    r = await v10_seed.world.client.get("/api/public/stats")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["activeTenants"] == 1


# ══════════════════════════════════════════════════════════════════════════
# §E — الدخول الصادق (D4: user.plan لا يُكتب أبداً → «free» دائماً)
# ══════════════════════════════════════════════════════════════════════════


async def test_login_subscription_status_from_tenant(v10_seed):
    """الدخول يعيد خطة المستأجر الفعلية (نفس مصدر /api/me) لا user.plan
    الميت."""
    from models import Tenant

    sf = v10_seed.world.sf
    # مستأجر مدفوع بخطة pro
    uname, tid, _uid = await v10_seed.tenant_user()
    async with sf() as db:
        t = await db.get(Tenant, tid)
        t.plan = "pro"
        t.subscription_status = "PAID"
        await db.commit()

    r = await v10_seed.login(uname)
    assert r.json()["data"]["user"]["subscriptionStatus"] == "pro"

    # مستأجر بلا خطة → free (صادق — لا «free» كاذبة لمدفوع)
    uname2, tid2, _uid2 = await v10_seed.tenant_user()
    r2 = await v10_seed.login(uname2)
    assert r2.json()["data"]["user"]["subscriptionStatus"] == "free"

    # أدمن المنصة (tenant 0) → free
    admin, _t, _u = await v10_seed.platform_admin()
    r3 = await v10_seed.login(admin)
    assert r3.json()["data"]["user"]["subscriptionStatus"] == "free"


async def test_login_and_me_agree_on_subscription_status(v10_seed):
    """الاتساق: /api/login و/api/me يقرآن نفس المصدر (tenant.plan)."""
    from models import Tenant

    sf = v10_seed.world.sf
    uname, tid, _uid = await v10_seed.tenant_user()
    async with sf() as db:
        t = await db.get(Tenant, tid)
        t.plan = "enterprise"
        await db.commit()

    r_login = await v10_seed.login(uname)
    r_me = await v10_seed.world.client.get("/api/me")
    assert r_login.json()["data"]["user"]["subscriptionStatus"] == \
        r_me.json()["data"]["user"]["subscriptionStatus"] == "enterprise"


# ══════════════════════════════════════════════════════════════════════════
# §F — إزالة ?token= (D2-LEAD B): الاستعلام مرفوض حتى بالسر الصحيح
# ══════════════════════════════════════════════════════════════════════════


async def test_cron_heartbeat_token_query_refused_bearer_ok(v10_seed, monkeypatch):
    """?token= بالسر الصحيح → 403 (أُزيل — القناة الوحيدة التي استعملتها
    موثقة ميتة والاستعلام يسرّب السر إلى سجلات الوصول)؛ Bearer → 200."""
    import routers.bot as bot_mod

    _patch_observability(monkeypatch)
    monkeypatch.setattr(bot_mod, "AsyncSessionLocal", v10_seed.world.sf)

    c = v10_seed.world.client
    r = await c.get("/api/cron/heartbeat?token=test-cron-secret")
    assert r.status_code == 403, (
        f"?token= must be gone (403), got {r.status_code}: {r.text[:200]}"
    )
    r = await c.get("/api/cron/heartbeat",
                    headers={"Authorization": "Bearer test-cron-secret"})
    assert r.status_code == 200, r.text


# ══════════════════════════════════════════════════════════════════════════
# §G — cleanup-logs الموسّع (E2-م7 / D6)
# ══════════════════════════════════════════════════════════════════════════


async def test_cleanup_logs_extended_retention(v10_seed, monkeypatch):
    """الخطوات الجديدة: analytics>90d + المقروءة>90d + تجريد إيصالات data:
    من الدفعات النهائية >30d — الجراحة JSON فقط (تبقى الحقول المالية)،
    وكل الصفوف غير المطابقة سليمة، وidempotent."""
    import routers.plans_config as pc_mod

    sf = v10_seed.world.sf
    monkeypatch.setattr(pc_mod, "AsyncSessionLocal", sf)

    from models import (
        AnalyticsEvent,
        Notification,
        SubscriptionPayment,
        SupportTicket,
        Tenant,
        User,
    )

    uname, tid, uid = await v10_seed.tenant_user()
    uname2, tid2, uid2 = await v10_seed.tenant_user()

    async with sf() as db:
        # analytics: قديمة تُحذف + حديثة تبقى
        db.add(AnalyticsEvent(tenant_id=tid, event_type="reply_sent",
                              created_at=utcnow() - timedelta(days=100)))
        db.add(AnalyticsEvent(tenant_id=tid, event_type="reply_sent",
                              created_at=utcnow() - timedelta(days=10)))
        # notifications: مقروءة قديمة تُحذف + مقروءة حديثة تبقى + غير مقروءة
        # قديمة تبقى (عقد الشارة)
        db.add(Notification(tenant_id=tid, read=True,
                            created_at=utcnow() - timedelta(days=100)))
        db.add(Notification(tenant_id=tid, read=True,
                            created_at=utcnow() - timedelta(days=10)))
        db.add(Notification(tenant_id=tid, read=False,
                            created_at=utcnow() - timedelta(days=100)))
        await db.commit()

    data_url = "data:image/jpeg;base64," + "QUJD" * 40
    # نهائية >30d مع إيصال data: → تُجرَّد (وتحتفظ ببقية الحقول)
    old_terminal_id = await _seed_payment(
        sf, user_id=uid, tenant_id=tid, receipt_url=data_url, status="verified",
        created_days_ago=40, extra={"sender_name": "علي", "sender_account": "123"})
    # نهائية حديثة → لا تُلمس
    new_terminal_id = await _seed_payment(
        sf, user_id=uid, tenant_id=tid, receipt_url=data_url, status="verified",
        created_days_ago=5, extra={"sender_name": "علي"})
    # معلقة قديمة → لا تُلمس (مراجعة جارية)
    old_pending_id = await _seed_payment(
        sf, user_id=uid, tenant_id=tid, receipt_url=data_url, status="pending",
        created_days_ago=40)
    # نهائية قديمة لكن إيصال https (ليس data:) → لا يُجرَّد
    https_id = await _seed_payment(
        sf, user_id=uid2, tenant_id=tid2, receipt_url="https://cdn.example.ly/r.jpg",
        status="cancelled", created_days_ago=40)

    r = await v10_seed.world.client.get(
        "/api/cron/cleanup-logs", headers={"Authorization": "Bearer test-cron-secret"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["deleted_analytics_events"] == 1, data
    assert data["deleted_read_notifications"] == 1, data
    assert data["stripped_receipt_urls"] == 1, data

    async with sf() as db:
        # الجراحة: receipt_url سقط، وكل الحقول الأخرى باقية
        stripped = await db.get(SubscriptionPayment, old_terminal_id)
        assert "receipt_url" not in (stripped.extra_data or {})
        assert stripped.extra_data["sender_name"] == "علي"
        assert stripped.extra_data["sender_account"] == "123"
        assert stripped.extra_data["username"] == "عميل"
        # غير المطابقة سليمة حرفياً
        assert (await db.get(SubscriptionPayment, new_terminal_id)).extra_data["receipt_url"] == data_url
        assert (await db.get(SubscriptionPayment, old_pending_id)).extra_data["receipt_url"] == data_url
        assert (await db.get(SubscriptionPayment, https_id)).extra_data["receipt_url"].startswith("https://")
        analytics_left = (await db.execute(select(AnalyticsEvent))).scalars().all()
        assert len(analytics_left) == 1 and analytics_left[0].created_at > utcnow() - timedelta(days=90)
        notifs_left = (await db.execute(select(Notification))).scalars().all()
        assert sorted(n.read for n in notifs_left) == [False, True]
        # لا مستخدمين/مستأجرين/تذاكر مُمسّة (الحذف الجديد لا يتجاوز نطاقه)
        assert await db.scalar(select(Notification).limit(1)) is not None
        assert (await db.execute(select(User).where(User.id == uid))).scalars().first() is not None
        assert (await db.execute(select(Tenant).where(Tenant.id == tid))).scalars().first() is not None
        assert (await db.execute(select(SupportTicket))).scalars().all() == []

    # idempotent: تشغيل ثانٍ لا يجد شيئاً من الخطوات الجديدة
    r2 = await v10_seed.world.client.get(
        "/api/cron/cleanup-logs", headers={"Authorization": "Bearer test-cron-secret"})
    data2 = r2.json()["data"]
    assert data2["deleted_analytics_events"] == 0
    assert data2["deleted_read_notifications"] == 0
    assert data2["stripped_receipt_urls"] == 0


async def test_cleanup_logs_query_token_refused(v10_seed, monkeypatch):
    """مسار ?token= ميت حتى في cleanup-logs (النموذج POST يبقى متوافقاً)."""
    import routers.plans_config as pc_mod

    monkeypatch.setattr(pc_mod, "AsyncSessionLocal", v10_seed.world.sf)
    c = v10_seed.world.client
    r = await c.get("/api/cron/cleanup-logs?token=test-cron-secret")
    assert r.status_code == 403, (
        f"?token= must be gone (403), got {r.status_code}: {r.text[:200]}"
    )
    r = await c.post("/api/cron/cleanup-logs", data={"token": "test-cron-secret"})
    assert r.status_code == 200, r.text
