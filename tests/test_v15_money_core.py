"""v15-E1 — نواة البوت وبوابات المال (money core): اختبارات البوابة.

كل اختبار هنا يقترن بإصلاح موثق في تقرير v15-E1 (audit-reports/v15-E1-core.md):

  [C-CORE1]  connect-page يشترك في webhooks الصفحة عبر عميل المستأجر بعد الحفظ —
             نجاح/فشل الاشتراك لا يمنع الحفظ ويظهر في الاستجابة (onboarding.py)
  [D1-H2]    بوابة دور admin على connect-page و editor على first-rule (onboarding.py)
  [D1-H4]    الربط المزدوج للصفحة → IntegrityError → 409 عربية (onboarding.py)
  [D2-H1]    فرض max_replies و has_dm و has_ai في نقاط الاستخدام الفعلية:
             دورة التعليقات/مسار webhook للتعليقات/مسار رسائل webhook/DM-after-comment/
             suggest-reply — مع BotLog عربي عند الرفض
  [D2-H3]    مسار تعليقات webhook يمر ببوابة الاشتراك §5.18 ويُحسب في replies_used
             (مثل مسار الرسائل) — من طرف إلى طرف عبر POST /webhook
  [D12-H3]   العداد ذرّي: UPDATE ... SET value = value + 1 (نمط credit_wallet) +
             موحّد الفترة (date-based) + اختبار تزامن asyncio.gather + إثبات أن
             نمط القراءة-التعديل-الكتابة القديم يفقد التحديثات
  [D10-H1]   انتهاء متناظر: PAID منتهٍ → UNPAID عند أول استخدام + إشعار تجديد
  [D10-H5]   إشعار انتهاء عربي واحد (push_notification + BotLog) — لا تكرار
  [D8-B1]    نافذة dedup: استعلام واحد محدود لكل TTL (لا مسح كامل لكل تعليق)
             + علامة dedup لا تُمحى أثناء المعالجة (إصلاح سباق mark/load)
  [D8-B4]    ACK: محاولة إرسال واحدة قبل الـ200 (تعليقات + رسائل)
  [§2]       نداءات العقد في نهاية cycle(): process_pending/process_pending_campaigns
             (مع ImportError-tolerance حتى يهبط E3) + عزل فشل كل نداء

هرميّة بالتصميم: عميل FB مزيّف في كل مسار إرسال — لا نداء Graph يخرج من
العملية (نمط test_v14_webhook_multi).
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import tempfile
import uuid
from datetime import datetime, timedelta

import pytest

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod-0123456789")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "0")
os.environ.setdefault("FACEBOOK_APP_SECRET", "test-app-secret")
os.environ.setdefault("DEBUG", "True")

from bot_engine.pipeline import (  # noqa: E402
    get_plan_limits,
    increment_replies_used,
    period_start_for,
)
from database import AsyncSessionLocal  # noqa: E402
from models import (  # noqa: E402
    BotLog,
    BotState,
    Notification,
    Reply,
    Rule,
    SubscriptionPlan,
    Tenant,
    UsageCounter,
    User,
)
from sqlalchemy import select  # noqa: E402

_APP_SECRET = os.environ["FACEBOOK_APP_SECRET"]


@pytest.fixture(autouse=True)
def _clear_gate_log_throttle():
    """كل اختبار في قاعدة معزولة جديدة: معرّفات المستأجرين تتكرر (id=1..)
    عبر القواعد — لذا يجب تصفير خنق سجلات البوابات (5 دقائق إنتاجياً)
    وإلا ابتلع اختبارٌ لاحق سجل بوابة لأن سابقه خنق (tenant_id, key) نفسه."""
    from bot_engine import pipeline as _pl
    _pl._gate_log_throttle.clear()
    yield
    _pl._gate_log_throttle.clear()


# ════════════════════════════════════════════════════════════════════════════
# Helpers — fakes + seeding
# ════════════════════════════════════════════════════════════════════════════


class FakeFB:
    """عميل FB مزيّف: يسجّل نداءات الإرسال الثلاثة ولا يلمس الشبكة."""

    def __init__(self, fail_comment: bool = False, fail_dm: bool = False):
        self.page_id = "fakepage"
        self.replies: list[tuple[str, str]] = []       # reply_to_comment
        self.dms: list[tuple[str, str]] = []           # send_dm
        self.private: list[tuple[str, str]] = []       # send_private_reply
        self.fail_comment = fail_comment
        self.fail_dm = fail_dm

    async def reply_to_comment(self, cid, text):
        self.replies.append((str(cid), str(text)))
        if self.fail_comment:
            return None
        return {"id": f"reply_{len(self.replies)}"}

    async def send_dm(self, uid, text, messaging_type="RESPONSE", tag=None):
        self.dms.append((str(uid), str(text)))
        if self.fail_dm:
            return {"_error": True, "status": 400, "body": "OAuthException code 190"}
        return {"message_id": f"mid_{len(self.dms)}"}

    async def send_private_reply(self, cid, text):
        self.private.append((str(cid), str(text)))
        return {"success": True}


def _comment(cid: str, text: str, user: str = "u1", name: str = "زبون") -> dict:
    return {"id": cid, "message": text, "from": {"id": user, "name": name}}


def _messaging(mid: str, text: str, user: str = "u1", name: str = "زبون") -> dict:
    return {
        "sender": {"id": user, "name": name},
        "recipient": {"id": "fakepage"},
        "timestamp": int(datetime.utcnow().timestamp() * 1000) - 1000,
        "message": {"mid": mid, "text": text},
    }


async def _seed_plan(sf, **kw) -> int:
    """خطة مخصصة (لا تُسمّى Free أبدًا — لا نلوث القاعدة المشتركة)."""
    defaults = dict(
        name=f"V15_{uuid.uuid4().hex[:6]}", name_ar="فييرا", price=19.0,
        period_days=30, max_replies=100, has_dm=True, has_ai=True,
        has_broadcast=True, is_active=True,
    )
    defaults.update(kw)
    async with sf() as db:
        plan = SubscriptionPlan(**defaults)
        db.add(plan)
        await db.commit()
        return plan.id


async def _seed_free_plan(sf) -> int:
    async with sf() as db:
        plan = SubscriptionPlan(name="Free", name_ar="مجاني", price=0, period_days=30,
                                max_replies=100, has_dm=False, has_ai=False,
                                has_broadcast=False, is_active=True)
        db.add(plan)
        await db.commit()
        return plan.id


async def _mk_rule(sf, tenant_id: int, *, dm: str = "", keywords: list | None = None) -> int:
    async with sf() as db:
        rule = Rule(
            tenant_id=tenant_id, name=f"قاعدة {uuid.uuid4().hex[:6]}",
            keywords=keywords or ["سعر", "شحال"],
            reply_template="السعر 50 د.ل يا {name}",
            dm_template=dm, enabled=True, priority=10, bot_type="reply",
        )
        db.add(rule)
        await db.commit()
        return rule.id


async def _seed_counter(sf, tenant_id: int, period_start, value: int) -> None:
    async with sf() as db:
        db.add(UsageCounter(tenant_id=tenant_id, metric="replies_used",
                            period_start=period_start, current_value=value))
        await db.commit()


async def _rows(sf, model, **filters):
    stmt = select(model)
    for k, v in filters.items():
        stmt = stmt.where(getattr(model, k) == v)
    async with sf() as db:
        return (await db.execute(stmt)).scalars().all()


async def _refresh_tenant(sf, tid: int) -> Tenant:
    async with sf() as db:
        t = await db.get(Tenant, tid)
        return t


def _sign(body: bytes) -> str:
    return "sha256=" + hmac.new(_APP_SECRET.encode(), body, hashlib.sha256).hexdigest()


# ════════════════════════════════════════════════════════════════════════════
# الجزء A — onboarding عبر HTTP (القاعدة المشتركة: لا خطة «Free» هنا أبدًا)
# ════════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="module")
async def app_client():
    from database import engine as db_engine
    from httpx import ASGITransport, AsyncClient
    from models import Base
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        yield ac


async def _seed_http_user(role: str = "admin", status: str = "PAID",
                          plan_id: int | None = None) -> tuple[str, int]:
    from _hash import hash_password

    uname = f"e1_{uuid.uuid4().hex[:8]}"
    async with AsyncSessionLocal() as db:
        t = Tenant(name=f"T-{uname}", subscription_status=status, is_active=True,
                   plan_id=plan_id)
        db.add(t)
        await db.flush()
        u = User(username=uname, email=f"{uname}@t.ly",
                 password_hash=hash_password("pass123456"),
                 tenant_id=t.id, role=role)
        db.add(u)
        await db.commit()
        tid = t.id
    return uname, tid


def _auth(ac, uname: str, tid: int):
    from routers.auth import make_token
    ac.cookies.set("token", make_token(uname, tid))


class _FakeSubscribeFB:
    def __init__(self, result):
        self.page_id = "fake"
        self.result = result
        self.calls = 0

    async def subscribe_page_webhooks(self):
        self.calls += 1
        return self.result


async def test_connect_page_subscribes_webhooks_via_tenant_client(app_client, monkeypatch):
    """C-CORE1 — بعد نجاح الحفظ يُستدعى subscribe_page_webhooks عبر عميل المستأجر،
    وتعود حالة الاشتراك في استجابة ok()."""
    import _services

    uname, tid = await _seed_http_user(role="admin")
    fake = _FakeSubscribeFB({"success": True})
    monkeypatch.setattr(_services, "get_tenant_fb_client", _factory_returning(fake))
    ac = app_client
    _auth(ac, uname, tid)

    page_id = f"9100{uuid.uuid4().hex[:8]}"
    r = await ac.post("/api/onboarding/connect-page", json={
        "page_id": page_id, "page_name": "متجر فييرا",
        "access_token": "EAAFakeV15",
    })
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["webhook_subscribed"] is True, data
    assert fake.calls == 1, "subscribe_page_webhooks must be called exactly once"
    # البيانات محفوظة فعلًا (توكن مشفّر Fernet)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(BotState).where(BotState.tenant_id == tid)
        )).scalars().all()
    state = {b.key: b.value for b in rows}
    assert state.get("fb_page_id") == page_id
    assert state.get("fb_access_token", "") not in ("", "EAAFakeV15")


def _factory_returning(fake):
    async def _factory(tenant_id: int):
        return fake
    return _factory


async def test_connect_page_subscription_failure_does_not_block_save(app_client, monkeypatch):
    """C-CORE1 — فشل الاشتراك لا يمنع حفظ البيانات ويظهر في الاستجابة (قابل للمحاولة لاحقًا)."""
    import _services

    uname, tid = await _seed_http_user(role="admin")
    fake = _FakeSubscribeFB({"_error": True, "status": 400, "body": "OAuthException"})
    monkeypatch.setattr(_services, "get_tenant_fb_client", _factory_returning(fake))
    ac = app_client
    _auth(ac, uname, tid)

    page_id = f"9200{uuid.uuid4().hex[:8]}"
    r = await ac.post("/api/onboarding/connect-page", json={
        "page_id": page_id, "access_token": "EAAFakeV15B",
    })
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["webhook_subscribed"] is False
    assert "webhook_hint" in data, "the owner must see the retry hint"
    # الحفظ لم يُمنع
    async with AsyncSessionLocal() as db:
        row = (await db.execute(
            select(BotState).where(BotState.tenant_id == tid, BotState.key == "fb_page_id")
        )).scalar_one()
    assert row.value == page_id


async def test_connect_page_requires_admin_role(app_client):
    """D1-H2 — viewer/editor ممنوعان من ربط صفحة/توكن المستأجر (403)."""
    ac = app_client
    viewer, vid = await _seed_http_user(role="viewer")
    _auth(ac, viewer, vid)
    r = await ac.post("/api/onboarding/connect-page", json={"page_id": "1", "access_token": "t"})
    assert r.status_code == 403
    assert "صلاحيات" in r.text

    editor, eid = await _seed_http_user(role="editor")
    _auth(ac, editor, eid)
    r = await ac.post("/api/onboarding/connect-page", json={"page_id": "1"})
    assert r.status_code == 403
    # لم يُكتب أي صف للحسابين
    for tid in (vid, eid):
        rows = await _rows(AsyncSessionLocal, BotState, tenant_id=tid)
        assert rows == []


async def test_first_rule_requires_editor_role(app_client):
    """D1-H2 — viewer ممنوع من حقن قاعدة رد حيّة عبر المعالج (403)؛ editor يُنشئها."""
    ac = app_client
    viewer, vid = await _seed_http_user(role="viewer")
    _auth(ac, viewer, vid)
    r = await ac.post("/api/onboarding/first-rule", json={"keyword": "سعر", "reply": "نص"})
    assert r.status_code == 403
    assert (await _rows(AsyncSessionLocal, Rule, tenant_id=vid)) == []

    editor, eid = await _seed_http_user(role="editor")
    _auth(ac, editor, eid)
    r = await ac.post("/api/onboarding/first-rule", json={"keyword": "سعر", "reply": "السعر 50"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["rule_id"] is not None
    rules = await _rows(AsyncSessionLocal, Rule, tenant_id=eid)
    assert len(rules) == 1 and rules[0].enabled is True


async def test_connect_page_duplicate_page_bound_to_other_tenant_409(app_client, monkeypatch):
    """D1-H4 — الصفحة مربوطة بمستأجر آخر: uq_botstate_key_value → 409 عربية
    (كانت IntegrityError خام → 500)، ولا يُحفظ شيء للمستأجر الثاني."""
    import _services

    ok_fake = _FakeSubscribeFB({"success": True})
    monkeypatch.setattr(_services, "get_tenant_fb_client", _factory_returning(ok_fake))
    ac = app_client
    shared_page = f"9300{uuid.uuid4().hex[:8]}"

    u1, t1 = await _seed_http_user(role="admin")
    _auth(ac, u1, t1)
    r = await ac.post("/api/onboarding/connect-page", json={
        "page_id": shared_page, "access_token": "EAAFirst",
    })
    assert r.status_code == 200, r.text

    u2, t2 = await _seed_http_user(role="admin")
    _auth(ac, u2, t2)
    r = await ac.post("/api/onboarding/connect-page", json={
        "page_id": shared_page, "access_token": "EAASecond",
    })
    assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:200]}"
    assert "مربوطة" in r.text and "أخرى" in r.text
    # لا شيء للمستأجر الثاني (rollback كامل)
    assert (await _rows(AsyncSessionLocal, BotState, tenant_id=t2)) == []


async def test_suggest_reply_ai_gated_for_plan_without_has_ai(app_client, monkeypatch):
    """D2-H1 (has_ai) — خطة بلا AI: المزوّد لا يُستدعى أصلًا، والاقتراح قالب
    مع ملاحظة عربية صريحة (المعالج لا يُسدّ أبدًا)."""
    import _services

    plan_id = await _seed_plan(AsyncSessionLocal, has_ai=False)
    uname, tid = await _seed_http_user(role="admin", plan_id=plan_id)
    ac = app_client
    _auth(ac, uname, tid)

    called = {"n": 0}

    def _spy_get_ai():
        called["n"] += 1
        raise AssertionError("AI provider must not be reached without has_ai")

    monkeypatch.setattr(_services, "get_ai", _spy_get_ai)
    r = await ac.post("/api/onboarding/suggest-reply", json={"keyword": "سعر"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["source"] == "template"
    assert data["ai_blocked"] is True
    assert "الذكاء الاصطناعي" in data["ai_note"]
    assert data["suggestion"]
    assert called["n"] == 0, "get_ai must not be called when the plan lacks has_ai"


async def test_suggest_reply_ai_used_when_plan_has_ai(app_client, monkeypatch):
    """D2-H1 (has_ai) — المسار الموجب: خطة بـAI → الاقتراح من المزوّد."""
    import _services

    plan_id = await _seed_plan(AsyncSessionLocal, has_ai=True)
    uname, tid = await _seed_http_user(role="admin", plan_id=plan_id)
    ac = app_client
    _auth(ac, uname, tid)

    class _FakeAI:
        available = True

        async def suggest_replies(self, prompt, page_context=""):
            return {"suggestions": ["اقتراح ذكي جاهز للنشر فورًا"]}

    monkeypatch.setattr(_services, "get_ai", lambda: _FakeAI())
    r = await ac.post("/api/onboarding/suggest-reply", json={"keyword": "سعر"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["source"] == "ai"
    assert data["ai_blocked"] is False
    assert "ذكي" in data["suggestion"]


# ── D2-H3 من طرف إلى طرف: POST /webhook → بوابة الاشتراك + العدّ ────────────


@pytest.fixture
def webhook_fake_fb(app_client, monkeypatch):
    import app.webhooks as webhooks_mod

    fake = FakeFB()
    monkeypatch.setattr(webhooks_mod, "get_tenant_fb_client", _factory_returning(fake))
    return fake


async def _connect_shared_page(tenant_id: int, page_id: str) -> None:
    async with AsyncSessionLocal() as db:
        db.add(BotState(tenant_id=tenant_id, key="fb_page_id", value=page_id))
        await db.commit()


async def _post_comment_webhook(ac, page_id: str, comment_id: str, text: str,
                                user_id: str = "u1") -> None:
    payload = {"object": "page", "entry": [{
        "id": page_id, "time": 1, "changes": [{
            "field": "feed", "value": {
                "item": "comment", "verb": "add", "comment_id": comment_id,
                "post_id": f"post_{page_id}_1", "message": text,
                "from": {"id": user_id, "name": "علي"},
            },
        }],
    }]}
    body = json.dumps(payload).encode()
    r = await ac.post("/webhook", content=body,
                      headers={"x-hub-signature-256": _sign(body)})
    assert r.status_code == 200, r.text


async def test_webhook_comment_counts_replies_used_end_to_end(app_client, webhook_fake_fb):
    """D2-H3 — تعليق webhook لمستأجر نشط: يُرسل الرد ويُحسب في replies_used
    (كان المسار لا يعدّ شيئًا إطلاقًا) وبفترة مطبّعة date-based."""

    uname, tid = await _seed_http_user(status="PAID")
    page_id = f"9400{uuid.uuid4().hex[:8]}"
    await _connect_shared_page(tid, page_id)
    await _mk_rule(AsyncSessionLocal, tid)

    cid = f"c_{uuid.uuid4().hex[:10]}"
    await _post_comment_webhook(app_client, page_id, cid, "كم السعر؟")

    assert [(c, t) for c, t in webhook_fake_fb.replies if c == cid], (
        "the webhook comment path must reply through the engine"
    )
    replies = await _rows(AsyncSessionLocal, Reply, tenant_id=tid)
    assert any(r.fb_comment_id == cid for r in replies)
    counters = await _rows(AsyncSessionLocal, UsageCounter, tenant_id=tid)
    assert len(counters) == 1
    assert counters[0].current_value == 1, counters[0].current_value
    assert counters[0].metric == "replies_used"
    assert counters[0].period_start.microsecond == 0, "period anchor must be date-based"
    assert counters[0].period_start.day == 1  # planless → month start


async def test_webhook_comment_blocked_for_lapsed_unpaid_tenant(app_client, webhook_fake_fb):
    """D2-H3 (سالب) — مستأجر UNPAID منتهي (plan_end ماضٍ): بوابة §5.18 تمنع الرد
    على مسار التعليقات (كان بلا بوابة إطلاقًا)."""
    uname, tid = await _seed_http_user(status="UNPAID")
    async with AsyncSessionLocal() as db:
        t = await db.get(Tenant, tid)
        t.plan_end = datetime.utcnow() - timedelta(days=2)
        await db.commit()
    page_id = f"9500{uuid.uuid4().hex[:8]}"
    await _connect_shared_page(tid, page_id)
    await _mk_rule(AsyncSessionLocal, tid)

    cid = f"c_{uuid.uuid4().hex[:10]}"
    await _post_comment_webhook(app_client, page_id, cid, "كم السعر؟")

    assert all(c != cid for c, _ in webhook_fake_fb.replies), "lapsed tenant must not be replied"
    assert (await _rows(AsyncSessionLocal, Reply, tenant_id=tid)) == []


# ════════════════════════════════════════════════════════════════════════════
# الجزء B — المحرك مباشرة (v10_world: قاعدة معزولة لكل اختبار)
# ════════════════════════════════════════════════════════════════════════════


@pytest.fixture
async def eng_world(v10_world, monkeypatch):
    """قاعدة اختبار معزولة + توجيه AsyncSessionLocal الخاص بالمحرك إليها
    (نفس آلية seam المعتمدة في bot.AsyncSessionLocal)."""
    import bot_engine.engine as engine_mod
    monkeypatch.setattr(engine_mod, "AsyncSessionLocal", v10_world.sf)
    return v10_world


async def _seed_engine_tenant(world, *, status="PAID", plan_id=None,
                              plan_end=None, plan_start=None) -> int:
    from _hash import hash_password

    async with world.sf() as db:
        t = Tenant(name=f"ENG-{uuid.uuid4().hex[:8]}", subscription_status=status,
                   is_active=True, plan_id=plan_id, plan_end=plan_end, plan_start=plan_start)
        db.add(t)
        await db.flush()
        db.add(User(username=f"u_{t.id}", email=f"u_{t.id}@t.ly",
                    password_hash=hash_password("pass123456"),
                    tenant_id=t.id, role="admin"))
        await db.commit()
        return t.id


# ── D10-H1/H5: انتهاء متناظر + إشعار واحد ────────────────────────────────────


async def test_paid_expired_converts_to_unpaid_on_first_use_notifies_once(eng_world):
    """D10-H1 — PAID منتهٍ: أول استخدام يحوّله UNPAID (لا انتظار cycle — الذي لا
    يعمل على Vercel أصلًا) + D10-H5: إشعار عربي واحد + BotLog — ولا تكرار."""
    from bot_engine.engine import BotEngine

    world = eng_world
    plan_id = await _seed_plan(world.sf, name_ar="برو فييرا")
    tid = await _seed_engine_tenant(world, status="PAID", plan_id=plan_id,
                                    plan_end=datetime.utcnow() - timedelta(days=1))
    fake = FakeFB()
    engine = BotEngine(fake, tenant_id=tid)
    await _mk_rule(world.sf, tid)

    r1 = await engine.process_single_message(_messaging("m1", "كم السعر؟"))
    assert r1 is None, "expired-PAID must not reply (was: forever-free replies)"
    assert fake.dms == []
    t = await _refresh_tenant(world.sf, tid)
    assert t.subscription_status == "UNPAID", "self-heal must happen at FIRST use"

    notifs = await _rows(world.sf, Notification, tenant_id=tid)
    assert len(notifs) == 1, f"exactly ONE renewal notification, got {len(notifs)}"
    assert "انتهى" in (notifs[0].title or "")
    assert "برو فييرا" in (notifs[0].body or "")
    assert notifs[0].link == "/dashboard/billing"
    logs = [lg for lg in await _rows(world.sf, BotLog, tenant_id=tid) if "انتهى" in (lg.message or "")]
    assert logs, "tenant-scoped BotLog must record the expiry"

    # الاستخدام الثاني: لا رد ولا إشعار جديد (الحالة محوّلة → فرع بلا تحويل)
    r2 = await engine.process_single_message(_messaging("m2", "وكم التوصيل؟", user="u2"))
    assert r2 is None
    assert len(await _rows(world.sf, Notification, tenant_id=tid)) == 1
    t = await _refresh_tenant(world.sf, tid)
    assert t.subscription_status == "UNPAID"


async def test_trial_expired_first_use_converts_and_basic_replies_continue(eng_world):
    """D10-H1 — تجربة منتهية: أول استخدام يحوّل TRIAL→EXPIRED_TRIAL ويُخطر،
    والردود الأساسية تستمر فعليًا (الوعد الموثق — الوعد الكاذب سابقًا)."""
    from bot_engine.engine import BotEngine

    world = eng_world
    tid = await _seed_engine_tenant(world, status="TRIAL",
                                    plan_end=datetime.utcnow() - timedelta(days=3),
                                    plan_start=datetime.utcnow() - timedelta(days=17))
    fake = FakeFB()
    engine = BotEngine(fake, tenant_id=tid)
    await _mk_rule(world.sf, tid)

    assert await engine._subscription_active() is True
    t = await _refresh_tenant(world.sf, tid)
    assert t.subscription_status == "EXPIRED_TRIAL"
    notifs = await _rows(world.sf, Notification, tenant_id=tid)
    assert len(notifs) == 1 and "التجربة" in notifs[0].title

    # الرد الأساسي يستمر (وكان: رد واحد محظوظ ثم صمت دائم)
    res = await engine.process_single_message(_messaging("m1", "كم السعر؟"))
    assert res is not None and fake.dms, "EXPIRED_TRIAL keeps BASIC replies"


async def test_expired_trial_basic_replies_continue_on_later_events(eng_world):
    """D10-H1 — الحدث الثاني وما بعده لـEXPIRED_TRIAL يستمر في الرد
    (القديم: الحدث الثاني يقع في الفرع غير المسموح → False → صمت دائم)."""
    from bot_engine.engine import BotEngine

    world = eng_world
    tid = await _seed_engine_tenant(world, status="EXPIRED_TRIAL",
                                    plan_end=datetime.utcnow() - timedelta(days=10))
    engine = BotEngine(FakeFB(), tenant_id=tid)
    await _mk_rule(world.sf, tid)

    assert await engine._subscription_active() is True, (
        "EXPIRED_TRIAL must stay ACTIVE for basic replies (documented promise)"
    )
    fake2 = FakeFB()
    engine2 = BotEngine(fake2, tenant_id=tid)
    res = await engine2.process_single_message(_messaging("mx", "شحال السعر؟"))
    assert res is not None and fake2.dms


async def test_rejected_tenant_blocked_on_all_paths(eng_world):
    """§5.18 matrix — REJECTED ممنوع على مساري الرسائل والتعليقات."""
    from bot_engine.engine import BotEngine

    world = eng_world
    tid = await _seed_engine_tenant(world, status="REJECTED")
    await _mk_rule(world.sf, tid)
    fake = FakeFB()
    engine = BotEngine(fake, tenant_id=tid)

    assert await engine._subscription_active() is False
    assert await engine.process_single_message(_messaging("m1", "كم السعر؟")) is None
    assert fake.dms == []
    await engine.process_single_comment(_comment(f"c_{uuid.uuid4().hex[:8]}", "كم السعر؟"), "p1")
    assert fake.replies == []


# ── D2-H1: بوابات الحدود في نقاط الاستخدام ──────────────────────────────────


async def test_comment_reply_blocked_when_quota_exhausted(eng_world):
    """D2-H1 (max_replies، مسار تعليقات webhook) — سالب: السقف مستنفد → لا رد
    + BotLog عربي يشرح السبب للمستأجر."""
    from bot_engine.engine import BotEngine

    world = eng_world
    plan_id = await _seed_plan(world.sf, max_replies=1)
    tid = await _seed_engine_tenant(world, status="PAID", plan_id=plan_id,
                                    plan_start=datetime.utcnow() - timedelta(days=2))
    await _mk_rule(world.sf, tid)
    await _seed_counter(world.sf, tid, period_start_for(await _refresh_tenant(world.sf, tid)), 1)

    fake = FakeFB()
    engine = BotEngine(fake, tenant_id=tid)
    await engine.process_single_comment(_comment(f"c_{uuid.uuid4().hex[:8]}", "كم السعر؟"), "p1")
    assert fake.replies == [], "quota exhausted → no reply"
    logs = [lg for lg in await _rows(world.sf, BotLog, tenant_id=tid)
            if "الحد الشهري" in (lg.message or "")]
    assert logs, "the owner must SEE why replies stopped (Arabic BotLog)"


async def test_messenger_reply_blocked_when_quota_exhausted(eng_world):
    """D2-H1 (max_replies، مسار رسائل webhook) — سالب."""
    from bot_engine.engine import BotEngine

    world = eng_world
    plan_id = await _seed_plan(world.sf, max_replies=2)
    tid = await _seed_engine_tenant(world, status="PAID", plan_id=plan_id,
                                    plan_start=datetime.utcnow() - timedelta(days=2))
    await _mk_rule(world.sf, tid)
    await _seed_counter(world.sf, tid, period_start_for(await _refresh_tenant(world.sf, tid)), 2)

    fake = FakeFB()
    engine = BotEngine(fake, tenant_id=tid)
    assert await engine.process_single_message(_messaging("m1", "كم السعر؟")) is None
    assert fake.dms == []
    logs = [lg for lg in await _rows(world.sf, BotLog, tenant_id=tid)
            if "الحد الشهري" in (lg.message or "")]
    assert logs


async def test_comment_reply_allowed_below_quota_and_counted(eng_world):
    """D2-H1 (موجب) — تحت السقف: الرد يُرسل ويُحسب (+1 ذرّي في نفس معاملة الرد)."""
    from bot_engine.engine import BotEngine

    world = eng_world
    plan_id = await _seed_plan(world.sf, max_replies=5)
    tid = await _seed_engine_tenant(world, status="PAID", plan_id=plan_id,
                                    plan_start=datetime.utcnow() - timedelta(days=2))
    await _mk_rule(world.sf, tid)

    fake = FakeFB()
    engine = BotEngine(fake, tenant_id=tid)
    res = await engine.process_single_comment(_comment(f"c_{uuid.uuid4().hex[:8]}", "كم السعر؟"), "p1")
    assert res is not False or fake.replies, "below quota the reply must be sent"
    assert fake.replies, "reply actually sent"
    counters = await _rows(world.sf, UsageCounter, tenant_id=tid)
    assert len(counters) == 1 and counters[0].current_value == 1


async def test_dm_after_comment_gated_without_has_dm(eng_world):
    """D2-H1 (has_dm) — سالب: خطة بلا DM: الرد العام يُرسل والرد الخاص (private
    reply/DM) لا يُرسل + BotLog عربي. (كان العلم ديكوريًا بلا أي نقطة فرض)."""
    from bot_engine.engine import BotEngine

    world = eng_world
    plan_id = await _seed_plan(world.sf, has_dm=False)
    tid = await _seed_engine_tenant(world, status="PAID", plan_id=plan_id,
                                    plan_start=datetime.utcnow() - timedelta(days=1))
    await _mk_rule(world.sf, tid, dm="راسلنا على الخاص يا {name}")

    fake = FakeFB()
    engine = BotEngine(fake, tenant_id=tid)
    await engine.process_single_comment(_comment(f"c_{uuid.uuid4().hex[:8]}", "كم السعر؟"), "p1")
    assert len(fake.replies) == 1, "the PUBLIC reply is basic — it must be sent"
    assert fake.private == [] and fake.dms == [], "has_dm=False must stop the private reply"
    logs = [lg for lg in await _rows(world.sf, BotLog, tenant_id=tid)
            if "الرد الخاص" in (lg.message or "")]
    assert logs, "the owner must SEE why DMs stopped (Arabic BotLog)"


async def test_dm_after_comment_allowed_with_has_dm(eng_world):
    """D2-H1 (has_dm، موجب) — خطة بـDM: private reply يُرسل."""
    from bot_engine.engine import BotEngine

    world = eng_world
    plan_id = await _seed_plan(world.sf, has_dm=True)
    tid = await _seed_engine_tenant(world, status="PAID", plan_id=plan_id,
                                    plan_start=datetime.utcnow() - timedelta(days=1))
    await _mk_rule(world.sf, tid, dm="راسلنا على الخاص يا {name}")

    fake = FakeFB()
    engine = BotEngine(fake, tenant_id=tid)
    await engine.process_single_comment(_comment(f"c_{uuid.uuid4().hex[:8]}", "كم السعر؟"), "p1")
    assert len(fake.replies) == 1
    assert len(fake.private) == 1, "has_dm=True → private reply attempted"


# ── D8-B4: ACK — محاولة واحدة قبل الـ200 ────────────────────────────────────


async def test_webhook_comment_single_send_attempt_on_failure(eng_world):
    """D8-B4 — فشل إرسال تعليق webhook: محاولة واحدة فقط (كانت 3 + backoff
    يحتجز الـACK حتى 7 ثوانٍ)."""
    from bot_engine.engine import BotEngine

    world = eng_world
    tid = await _seed_engine_tenant(world, status="PAID")
    await _mk_rule(world.sf, tid)

    fake = FakeFB(fail_comment=True)
    engine = BotEngine(fake, tenant_id=tid)
    t0 = asyncio.get_running_loop().time()
    await engine.process_single_comment(_comment(f"c_{uuid.uuid4().hex[:8]}", "كم السعر؟"), "p1")
    elapsed = asyncio.get_running_loop().time() - t0
    assert len(fake.replies) == 1, "exactly ONE send attempt (fast ACK)"
    assert elapsed < 2.0, f"no backoff before the 200 — took {elapsed:.1f}s"


async def test_messenger_single_send_attempt_on_failure(eng_world):
    """D8-B4 — فشل إرسال رسالة webhook: محاولة واحدة + السبب العربي الصادق
    في BotLog (v4 §5.17) بلا حلقة إعادة محاولة تحتجز الـACK."""
    from bot_engine.engine import BotEngine

    world = eng_world
    tid = await _seed_engine_tenant(world, status="PAID")
    await _mk_rule(world.sf, tid)

    fake = FakeFB(fail_dm=True)
    engine = BotEngine(fake, tenant_id=tid)
    t0 = asyncio.get_running_loop().time()
    res = await engine.process_single_message(_messaging("m1", "كم السعر؟"))
    elapsed = asyncio.get_running_loop().time() - t0
    assert res is None
    assert len(fake.dms) == 1, "exactly ONE send attempt"
    assert elapsed < 2.0, f"no 1.2^n backoff before the 200 — took {elapsed:.1f}s"
    logs = [lg for lg in await _rows(world.sf, BotLog, tenant_id=tid)
            if "فشل إرسال الرد الآلي" in (lg.message or "")]
    assert logs, "honest failure reason still persisted (tenant-scoped)"


# ── D8-B1: نافذة dedup + سباق mark/load ────────────────────────────────────


async def test_replied_ids_loaded_once_per_ttl_not_per_comment(eng_world, monkeypatch):
    """D8-B1 — استعلام الردود (48h) يجري مرة واحدة لكل نافذة TTL، لا لكل تعليق
    (كان: مسح كامل × عدد التعليقات — أثقل نقطة DB في المسار الساخن)."""
    from bot_engine.engine import BotEngine

    world = eng_world
    tid = await _seed_engine_tenant(world, status="PAID")
    await _mk_rule(world.sf, tid)

    engine = BotEngine(FakeFB(), tenant_id=tid)
    calls = {"n": 0}
    orig = engine._load_replied_ids

    async def counting(session):
        calls["n"] += 1
        return await orig(session)

    monkeypatch.setattr(engine, "_load_replied_ids", counting)
    for i in range(3):
        await engine.process_single_comment(
            _comment(f"c_{uuid.uuid4().hex[:8]}", f"سؤال {i}", user=f"u{i}"), "p1")
    assert calls["n"] == 1, f"bounded window query must run once per TTL, ran {calls['n']}x"


async def test_dedup_mark_survives_processing_no_replace_race(eng_world):
    """D8-B1 (سباق mark/load) — علامة dedup غير الملتزمة بعد لا تُمحى أثناء
    معالجة تعليق آخر (كان dedup.load() يستبدل المجموعة كلها فيمحوها)."""
    from bot_engine.engine import BotEngine

    world = eng_world
    tid = await _seed_engine_tenant(world, status="PAID")
    await _mk_rule(world.sf, tid)

    engine = BotEngine(FakeFB(), tenant_id=tid)
    await engine._ensure_cache()
    ghost = f"c_ghost_{uuid.uuid4().hex[:6]}"
    await engine._dedup_engine.mark(ghost)  # أُرسل الرد ولم يُلتزم بعد (السباق)

    await engine.process_single_comment(
        _comment(f"c_{uuid.uuid4().hex[:8]}", "كم السعر؟", user="other"), "p1")

    assert await engine._dedup_engine.is_dup(ghost) is True, (
        "in-flight dedup marks must survive comment processing (no replace)"
    )


async def test_dedup_window_skips_already_replied_comment(eng_world):
    """D8-B1 — نافذة 48h من DB تمنع إعادة الرد على تعليق مُردّ عليه (بعد إعادة
    التشغيل / عبر الحوادث) دون إعادة تحميل لكل تعليق."""
    from bot_engine.engine import BotEngine

    world = eng_world
    tid = await _seed_engine_tenant(world, status="PAID")
    await _mk_rule(world.sf, tid)

    fake = FakeFB()
    engine = BotEngine(fake, tenant_id=tid)
    cid = f"c_{uuid.uuid4().hex[:8]}"
    await engine.process_single_comment(_comment(cid, "كم السعر؟"), "p1")
    assert len(fake.replies) == 1

    # محرك «جديد» (إعادة تشغيل) — نفس التعليق يُردّ عليه مرة واحدة فقط
    engine2 = BotEngine(FakeFB(), tenant_id=tid)
    await engine2.process_single_comment(_comment(cid, "كم السعر؟"), "p1")
    replies = await _rows(world.sf, Reply, tenant_id=tid)
    assert all(r.fb_comment_id != cid for r in replies[1:]) or len(replies) == 1
    assert len(replies) == 1, "uq_reply_tenant_comment + 48h window keep it single"


# ── D2-H3/D12-H3: العدّ الموحّد في pipeline ─────────────────────────────────


async def test_webhook_comment_counted_once_per_reply_normalized_period(eng_world):
    """D2-H3/D12-H3 — كل رد تعليق = +1 واحد ذرّي؛ ردّان = صف واحد قيمته 2
    وفترة date-based مطبّعة (كان المسار لا يعدّ إطلاقًا / utcnow بميكروثانية)."""
    from bot_engine.engine import BotEngine

    world = eng_world
    tid = await _seed_engine_tenant(world, status="PAID")
    await _mk_rule(world.sf, tid)

    engine = BotEngine(FakeFB(), tenant_id=tid)
    await engine.process_single_comment(_comment(f"c1_{uuid.uuid4().hex[:6]}", "كم السعر؟", "u1"), "p1")
    await engine.process_single_comment(_comment(f"c2_{uuid.uuid4().hex[:6]}", "شحال السعر؟", "u2"), "p1")

    counters = await _rows(world.sf, UsageCounter, tenant_id=tid)
    assert len(counters) == 1, f"one row for the period, got {len(counters)}"
    assert counters[0].current_value == 2
    assert counters[0].period_start.microsecond == 0
    assert counters[0].period_start.hour == 0


async def test_messenger_reply_counted(eng_world):
    """D2-H3 — رد الرسائل يبقى محسوبًا (السلوك الموجب محفوظ) عبر الزيادة الذرّية."""
    from bot_engine.engine import BotEngine

    world = eng_world
    tid = await _seed_engine_tenant(world, status="PAID")
    await _mk_rule(world.sf, tid)

    engine = BotEngine(FakeFB(), tenant_id=tid)
    res = await engine.process_single_message(_messaging(f"m_{uuid.uuid4().hex[:6]}", "كم السعر؟"))
    assert res is not None
    counters = await _rows(world.sf, UsageCounter, tenant_id=tid)
    assert len(counters) == 1 and counters[0].current_value == 1


# ════════════════════════════════════════════════════════════════════════════
# الجزء C — get_plan_limits (نقطة القراءة المركزية)
# ════════════════════════════════════════════════════════════════════════════


async def test_get_plan_limits_attached_plan(eng_world):
    world = eng_world
    plan_id = await _seed_plan(world.sf, max_replies=7, has_dm=False, has_ai=True,
                               has_broadcast=False)
    tid = await _seed_engine_tenant(world, status="PAID", plan_id=plan_id,
                                    plan_start=datetime.utcnow() - timedelta(days=3))
    async with world.sf() as db:
        limits = await get_plan_limits(db, tid)
    assert limits is not None
    assert limits["max_replies"] == 7
    assert limits["has_dm"] is False and limits["has_ai"] is True
    assert limits["has_broadcast"] is False
    assert limits["replies_used"] == 0
    # المرساة = تاريخ بدء الخطة مطبّعًا (بلا وقت/ميكروثانية)
    assert limits["period_start"].hour == 0 and limits["period_start"].microsecond == 0


async def test_get_plan_limits_planless_falls_back_to_free_then_fails_open(eng_world):
    """مستأجر بلا خطة: صف «Free» المبذور يحدّه (قمع الدخول)؛ وغيابه (بيئة
    اختبار بلا بذر) → None → غير محدود (fail-open الموثق)."""
    world = eng_world
    tid = await _seed_engine_tenant(world, status="UNPAID")
    async with world.sf() as db:
        assert await get_plan_limits(db, tid) is None, "no plan rows → fail-open unlimited"

    free_id = await _seed_free_plan(world.sf)
    assert free_id
    async with world.sf() as db:
        limits = await get_plan_limits(db, tid)
    assert limits is not None
    assert limits["plan_name"] == "Free"
    assert limits["max_replies"] == 100 and limits["has_dm"] is False


async def test_get_plan_limits_expired_trial_degrades_to_free(eng_world):
    """D10-H1 — EXPIRED_TRIAL: حدود «Free» (أساسيات) لا حدود الخطة المجربة،
    والمرساة = لحظة الانتهاء (فترة أساسية جديدة)."""
    world = eng_world
    paid_plan = await _seed_plan(world.sf, max_replies=5000, has_dm=True, has_ai=True)
    await _seed_free_plan(world.sf)
    end = datetime.utcnow() - timedelta(days=2)
    tid = await _seed_engine_tenant(world, status="EXPIRED_TRIAL", plan_id=paid_plan,
                                    plan_end=end, plan_start=datetime.utcnow() - timedelta(days=32))
    async with world.sf() as db:
        limits = await get_plan_limits(db, tid)
    assert limits is not None
    assert limits["plan_name"] == "Free", "lapsed → BASIC tier limits, not the trialed plan"
    assert limits["has_dm"] is False
    assert limits["period_start"].date() == end.date()


async def test_get_plan_limits_usage_summed_over_current_period(eng_world):
    """القراءة = SUM(الصفوف ≥ المرساة): صفوف الفترات السابقة تاريخ لا تُحسب،
    وتراكم الفترة الحالية يُجمع (تعامل مع صفوف legacy المنقسمة)."""
    world = eng_world
    plan_id = await _seed_plan(world.sf, max_replies=10)
    tid = await _seed_engine_tenant(world, status="PAID", plan_id=plan_id,
                                    plan_start=datetime.utcnow() - timedelta(days=5))
    t = await _refresh_tenant(world.sf, tid)
    anchor = period_start_for(t)
    await _seed_counter(world.sf, tid, anchor, 3)
    # صف تاريخي (فترة سابقة) — لا يُحسب
    await _seed_counter(world.sf, tid, anchor - timedelta(days=40), 999)
    async with world.sf() as db:
        limits = await get_plan_limits(db, tid)
    assert limits["replies_used"] == 3, "previous-period rows are history, not usage"


# ════════════════════════════════════════════════════════════════════════════
# الجزء D — D12-H3: العدّاد الذرّي (قاعدة ملفات باتصالات متزامنة حقيقية)
# ════════════════════════════════════════════════════════════════════════════


@pytest.fixture
async def counter_db():
    """قاعدة ملفات SQLite باتصالات مستقلة حقيقية (ليس StaticPool) — لاختبار
    التزامن الفعلي للزيادات مع file-locking + busy timeout."""
    from models import Base
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    fd, path = tempfile.mkstemp(prefix="v15_e1_counter_", suffix=".db")
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


async def test_counter_atomic_increment_under_gather(counter_db):
    """D12-H3 — 10 زيادات متزامنة (asyncio.gather) على صف قائم: القيمة النهائية
    بالضبط +10 في صف واحد (نمط القراءة-التعديل-الكتابة كان يفقد التحديثات)."""
    sf = counter_db
    tid, anchor = 4242, period_start_for(None)
    await _seed_counter(sf, tid, anchor, 5)

    async def one():
        async with sf() as s:
            await increment_replies_used(s, tid, 1, period_start=anchor)
            await s.commit()

    await asyncio.gather(*[one() for _ in range(10)])
    rows = await _rows(sf, UsageCounter, tenant_id=tid)
    assert len(rows) == 1
    assert rows[0].current_value == 15, f"lost update! got {rows[0].current_value}"


async def test_counter_concurrent_first_increment_creates_single_row(counter_db):
    """D12-H3 (انقسام الصفوف) — 5 منشئين متزامنين لأول صف: فريد
    uq_usage_tenant_metric_period + مسار IntegrityError→UPDATE → صف واحد قيمته 5
    (كان utcnow() بميكروثانية يخلق صفًا لكل منشئ)."""
    sf = counter_db
    tid, anchor = 5252, period_start_for(None)

    async def one():
        async with sf() as s:
            await increment_replies_used(s, tid, 1, period_start=anchor)
            await s.commit()

    await asyncio.gather(*[one() for _ in range(5)])
    rows = await _rows(sf, UsageCounter, tenant_id=tid)
    assert len(rows) == 1, f"period split! rows: {[(r.period_start, r.current_value) for r in rows]}"
    assert rows[0].current_value == 5
    assert rows[0].period_start == anchor


async def test_counter_period_anchor_date_based(counter_db):
    """D12-H3 — المراسي date-based: بلا خطة → بداية الشهر (بلا ميكروثانية)."""
    sf = counter_db
    tid = 6363
    async with sf() as s:
        await increment_replies_used(s, tid, 1)
        await s.commit()
    rows = await _rows(sf, UsageCounter, tenant_id=tid)
    assert len(rows) == 1
    now = datetime.utcnow()
    assert rows[0].period_start == datetime(now.year, now.month, 1)


async def test_old_rmw_pattern_loses_updates_demonstration(counter_db):
    """D12-H3 (الإثبات السالب الموثق) — نمط القراءة-التعديل-الكتابة القديم
    (قراءة ORM ثم كتابة القيمة المحسوبة) تحت gather يفقد أحد التحديثين —
    هذا هو سبب الاستبدال بـUPDATE الذرّي في SQL."""
    sf = counter_db
    tid, anchor = 7474, period_start_for(None)
    await _seed_counter(sf, tid, anchor, 0)

    async def old_rmw():
        async with sf() as s1:  # القراءة (نافذة السباق)
            uc = (await s1.execute(
                select(UsageCounter).where(
                    UsageCounter.tenant_id == tid,
                    UsageCounter.metric == "replies_used",
                ))).scalar_one()
            value = uc.current_value or 0
        await asyncio.sleep(0.05)
        async with sf() as s2:  # الكتابة بالقيمة المحسوبة من قراءة قديمة
            uc2 = (await s2.execute(
                select(UsageCounter).where(
                    UsageCounter.tenant_id == tid,
                    UsageCounter.metric == "replies_used",
                ))).scalar_one()
            uc2.current_value = value + 1
            await s2.commit()

    await asyncio.gather(old_rmw(), old_rmw())
    rows = await _rows(sf, UsageCounter, tenant_id=tid)
    assert rows[0].current_value < 2, (
        f"the RMW pattern under gather lost an update — value {rows[0].current_value}"
    )


# ════════════════════════════════════════════════════════════════════════════
# الجزء E — §2: نداءات عقد cycle() للبث/الحملات
# ════════════════════════════════════════════════════════════════════════════


async def test_cycle_drains_broadcast_and_campaign_contracts(eng_world, monkeypatch):
    """§2 — نهاية cycle() تستدعي process_pending(session) و
    process_pending_campaigns(session) بعقد الواجهة (E3 ينفذهما)، حتى مع
    خروج مبكر من الدورة (لا قواعد)."""
    import broadcast_engine as be_mod
    from bot_engine.engine import BotEngine
    from routers import marketing as mk_mod

    seen: list[tuple[str, object]] = []

    async def fake_pending(session):
        seen.append(("broadcast", session))
        return 3

    async def fake_campaigns(session):
        seen.append(("campaigns", session))
        return 2

    monkeypatch.setattr(be_mod, "process_pending", fake_pending, raising=False)
    monkeypatch.setattr(mk_mod, "process_pending_campaigns", fake_campaigns, raising=False)

    engine = BotEngine(FakeFB(), tenant_id=999123)
    await engine.cycle()

    kinds = [k for k, _ in seen]
    assert kinds == ["broadcast", "campaigns"], f"both §2 drains must run — {kinds}"
    for _, session in seen:
        assert session is not None, "contract: the cycle's session is passed"
    assert engine._cycle == 1


async def test_cycle_drain_failure_isolated_and_cycle_survives(eng_world, monkeypatch):
    """§2 — فشل كل نداء معزول: الدورة تكتمل بلا استثناء (فشلهما لا يكسر الدورة)."""
    import broadcast_engine as be_mod
    from bot_engine.engine import BotEngine
    from routers import marketing as mk_mod


    async def boom(session):
        raise RuntimeError("E3 drain boom")

    monkeypatch.setattr(be_mod, "process_pending", boom, raising=False)
    monkeypatch.setattr(mk_mod, "process_pending_campaigns", boom, raising=False)

    engine = BotEngine(FakeFB(), tenant_id=999456)
    await engine.cycle()  # must NOT raise
    assert engine._cycle == 1


async def test_cycle_completes_without_e3_implementations(eng_world, monkeypatch):
    """§2 (احتياط الغياب) — لو غاب تنفيذ E3 (تراجع/إصدار جزئي): الدورة تكتمل
    بهدوء (getattr None → لا استثناء ولا ضجيج). المحاكاة عبر delattr لأن
    تنفيذا E3 هبط فعلاً (broadcast_engine.process_pending +
    marketing.process_pending_campaigns)."""
    import broadcast_engine as be_mod
    from bot_engine.engine import BotEngine
    from routers import marketing as mk_mod

    assert hasattr(be_mod, "process_pending"), "precondition: E3 landed (contract §2)"
    assert hasattr(mk_mod, "process_pending_campaigns"), "precondition: E3 landed (contract §2)"

    monkeypatch.delattr(be_mod, "process_pending")
    monkeypatch.delattr(mk_mod, "process_pending_campaigns")

    engine = BotEngine(FakeFB(), tenant_id=999789)
    await engine.cycle()  # must NOT raise
    assert engine._cycle == 1
