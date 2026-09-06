"""v11-A6 — S1 backlog #1: بوابة انحدار تلغرام (الويبهوك + الإعداد).

يغطي منطقين لم يكن لهما أي اختبارات:

  [x] POST /api/telegram/webhook — تأكيدات الدفع عبر أزرار تلغرام:
        - بوابة السر: بلا TELEGRAM_WEBHOOK_SECRET → 403، سر خاطئ/غائب → 403،
          صحيح → يعالج، و TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=true يتجاوز الفحص.
        - الضغطة المزدوجة (double-tap): نفس التحديث مرتين → الثانية no-op
          كامل: رصيد واحد فقط، رسالة «تمت معالجة هذا الطلب مسبقاً»، وحالة
          الطلب لا تتغير (المطالبة الذرية UPDATE...WHERE status='pending'
          RETURNING — v9-A8). نفس الشيء لمسار sub_ (تفعيل الباقة مرة واحدة).
        - الترتيب الحتمي: رفض ثم موافقة → يبقى ملغى، والرصيد لا يُضاف.
        - صلاحية المرسل: from.id خارج قائمة المدراء → «عذراً، لا تمتلك
          الصلاحية» ولا يتغير الطلب.
        - بيانات callback غريبة (بادئة أخرى / بلا نقطتين) → ok بلا معالجة.
        - BUG (مُبلَّغ، xfail): pay_app:abc → int() غير محمي → ValueError
          يهرب كـ 500 (runner.py:731) وتلغرام يعيد المحاولة إلى الأبد.
  [x] راوتر telegram_config (35% تغطية سابقًا): حفظ/تحقق توكن البوت و
        chat_id (SystemConfig)، مدراء الموافقة CRUD (409 للتكرار)، أهداف
        البث CRUD (404 للمفقود)، و /api/telegram/test بلا توكن → 400 عربي.

Hermetic: لا شبكة — answer_callback/edit_message/edit_keyboard/get_admin_ids
مُحاكاة بمسجّلات؛ الويبهوك يكتب عبر AsyncSessionLocal (قاعدة الاختبار
المشتركة) بينما راوتر الإعداد يمر عبر get_db المُعاد توجيهه (v10_world).
"""

from __future__ import annotations

import os
import sys
import uuid

import pytest
from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

TG_TEST_SECRET = "v11-tg-webhook-secret"
TG_ADMIN_ID = 4242

# توكن بصيغة BotFather الصحيحة: ^\d{6,12}:[A-Za-z0-9_-]{30,}$
VALID_BOT_TOKEN = "123456789:AAHfiqksKZ8WmoMTsD2ky9KzR7pZ5c5c9"
VALID_CHAT_ID = "-100123456789"


# ── عالم الويبهوك: التطبيق الحقيقي + قاعدة الاختبار المشتركة ───────────────
# الويبهوك يفتح جلساته عبر AsyncSessionLocal مباشرة (لا عبر get_db)، لذا
# نزرع ونتحقق من نفس الجلسة — نفس وصفة anon_client في test_v10_auth_negative.


@pytest.fixture(scope="module")
async def wh_client():
    """عميل HTTP على التطبيق الحقيقي مع جداول قاعدة الاختبار المشتركة."""
    from database import engine as db_engine
    from models import Base
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    import httpx
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://test") as ac:
        yield ac


@pytest.fixture
def tg(wh_client, monkeypatch):
    """تثبيت عالم الويبهوك: سر صحيح + مدراء معروفون + مسجّل نداءات تلغرام.

    يعيد SimpleNamespace(calls=[...], post(...)) — كل نداء إجابة/تعديل يُسجل
    (نوع، نص) حتى نقرر اللازم منه في الاختبار دون أي نداء شبكي حقيقي.
    """
    from types import SimpleNamespace

    import runner
    import telegram_bot

    calls: list[tuple[str, str]] = []

    async def fake_answer(callback_id: str, text: str, alert: bool = True):
        calls.append(("answer", text))

    async def fake_edit(chat_id: int, message_id: int, text: str):
        calls.append(("edit", text))

    async def fake_edit_kb(chat_id: int, message_id: int):
        calls.append(("editkb", ""))

    async def fake_admins():
        return [TG_ADMIN_ID]

    monkeypatch.setattr(runner, "_TG_SECRET", TG_TEST_SECRET)
    monkeypatch.setattr(runner, "_ALLOW_UNVERIFIED", False)
    monkeypatch.setattr(runner, "answer_callback", fake_answer)
    monkeypatch.setattr(runner, "edit_message", fake_edit)
    monkeypatch.setattr(runner, "edit_keyboard", fake_edit_kb)
    monkeypatch.setattr(telegram_bot, "get_admin_ids", fake_admins)

    def post(cq_data: str, from_id: int = TG_ADMIN_ID, secret: str | None = TG_TEST_SECRET,
             cid: str = "cq1") -> object:
        headers = {}
        if secret is not None:
            headers["x-telegram-bot-api-secret-token"] = secret
        return wh_client.post("/api/telegram/webhook", json={
            "callback_query": {
                "id": cid, "data": cq_data, "from": {"id": from_id},
                "message": {"chat": {"id": 777}, "message_id": 88},
            }
        }, headers=headers)

    def post_ok() -> object:
        """نداء بجسم بلا callback_query (رسالة/تحديث عادي) مع السر الصحيح."""
        return wh_client.post("/api/telegram/webhook", json={},
                              headers={"x-telegram-bot-api-secret-token": TG_TEST_SECRET})

    return SimpleNamespace(calls=calls, post=post, post_ok=post_ok,
                           answers=lambda: [t for k, t in calls if k == "answer"])


async def _seed_payment(amount: float = 100) -> tuple[int, int]:
    """زرع طلب دفع pending → (payment_id, tenant_id) في قاعدة الاختبار."""
    from database import AsyncSessionLocal
    from models import PaymentRequest, Tenant

    async with AsyncSessionLocal() as db:
        t = Tenant(name=f"T-TG-{uuid.uuid4().hex[:8]}", subscription_status="TRIAL", is_active=True)
        db.add(t)
        await db.flush()
        pr = PaymentRequest(tenant_id=t.id, username="أحمد", amount=amount, status="pending")
        db.add(pr)
        await db.commit()
        return pr.id, t.id


async def _seed_sub_payment() -> tuple[int, int, int, int]:
    """زرع دفعة اشتراك pending → (payment_id, tenant_id, plan_id, user_id)."""
    from database import AsyncSessionLocal
    from models import SubscriptionPayment, SubscriptionPlan, Tenant, User

    async with AsyncSessionLocal() as db:
        t = Tenant(name=f"T-TSUB-{uuid.uuid4().hex[:8]}", subscription_status="TRIAL", is_active=True)
        db.add(t)
        await db.flush()
        u = User(username=f"su_{uuid.uuid4().hex[:8]}", email=f"su_{uuid.uuid4().hex[:6]}@test.ly",
                 password_hash="x", tenant_id=t.id, role="admin")
        db.add(u)
        await db.flush()
        plan = SubscriptionPlan(name=f"p_{uuid.uuid4().hex[:6]}", name_ar="مميز",
                                period_days=30, price=50)
        db.add(plan)
        await db.flush()
        sp = SubscriptionPayment(user_id=u.id, tenant_id=t.id, phone="0911111111",
                                 amount=50, plan_id=plan.id, plan_name=plan.name,
                                 status="pending", extra_data={"username": u.username})
        db.add(sp)
        await db.commit()
        return sp.id, t.id, plan.id, u.id


async def _payment_status(pid: int) -> str:
    from database import AsyncSessionLocal
    from models import PaymentRequest

    async with AsyncSessionLocal() as db:
        return (await db.get(PaymentRequest, pid)).status


async def _balance(tenant_id: int) -> int:
    from database import AsyncSessionLocal
    from models import BotState

    async with AsyncSessionLocal() as db:
        bs = (await db.execute(select(BotState).where(
            BotState.tenant_id == tenant_id, BotState.key == "balance"))).scalar_one_or_none()
        return int(float(bs.value)) if bs and bs.value else 0


# ── بوابة السر (webhook secret) ─────────────────────────────────────────────


async def test_webhook_rejected_when_secret_not_configured(wh_client, monkeypatch):
    """لا TELEGRAM_WEBHOOK_SECRET في البيئة → رفض كل نداء غير موقّع (403)."""
    import runner
    monkeypatch.setattr(runner, "_TG_SECRET", "")
    r = await wh_client.post("/api/telegram/webhook", json={"callback_query": {"id": "x"}})
    assert r.status_code == 403, r.text


async def test_webhook_rejected_on_wrong_secret(tg):
    """سر خاطئ في x-telegram-bot-api-secret-token → 403 (مقارنة زمن-ثابتة)."""
    r = await tg.post("pay_app:1", secret="attacker-guess")
    assert r.status_code == 403, r.text


async def test_webhook_rejected_on_missing_secret_header(tg):
    """نداء بلا ترويسة السر إطلاقًا → 403، لا معالجة."""
    r = await tg.post("pay_app:1", secret=None)
    assert r.status_code == 403, r.text


async def test_webhook_allow_unverified_bypass(wh_client, monkeypatch):
    """TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=true → يعمل بدون سر (وضع التصحيح)."""
    import runner
    monkeypatch.setattr(runner, "_ALLOW_UNVERIFIED", True)
    r = await wh_client.post("/api/telegram/webhook", json={})
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text


async def test_webhook_no_callback_query_is_noop(tg):
    """جسم بلا callback_query (رسالة عادية) → ok فوري بلا أي معالجة."""
    r = await tg.post_ok()
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    assert tg.calls == [], tg.calls


async def test_webhook_unknown_callback_data_ignored(tg):
    """بيانات بادئتها ليست pay_/sub_ أو بلا نقطتين → ok دون لمس أي طلب."""
    r = await tg.post("menu:5")
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    r = await tg.post("pay_nodata")
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    assert tg.calls == [], tg.calls


# ── الضغطة المزدوجة: المطالبة الذرية (v9-A8) ────────────────────────────────


async def test_pay_approve_credits_balance_once(tg):
    """موافقة الدفع: الحالة confirmed، الرصيد يُضاف مرة، والرسائل عربية."""
    pid, tid = await _seed_payment(amount=100)
    r = await tg.post(f"pay_app:{pid}")
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    assert await _payment_status(pid) == "confirmed"
    assert await _balance(tid) == 100
    assert any("تم تأكيد الدفع" in t for t in tg.answers()), tg.calls
    assert any("وإضافة الرصيد" in t for t in tg.answers()), tg.calls


async def test_pay_double_tap_is_idempotent(tg):
    """الضغطة المزدوجة (نفس التحديث مرتين): الثانية no-op — رصيد واحد فقط،
    الحالة لا تعود pending، وإجابة «تمت معالجة هذا الطلب مسبقاً» (المطالبة
    الذرية UPDATE...WHERE status='pending' RETURNING — v9-A8)."""
    pid, tid = await _seed_payment(amount=60)
    r1 = await tg.post(f"pay_app:{pid}")
    r2 = await tg.post(f"pay_app:{pid}")
    assert r1.status_code == r2.status_code == 200, (r1.text, r2.text)
    # 200 لكلا الطلبين حتى لا تعيد تلغرام الإرسال، لكن بأثر واحد فقط:
    assert await _balance(tid) == 60, "double-tap credited the balance TWICE"
    assert await _payment_status(pid) == "confirmed"
    assert any("تمت معالجة هذا الطلب مسبقاً" in t for t in tg.answers()), tg.calls


async def test_pay_reject_leaves_balance_untouched(tg):
    """رفض الدفع: الحالة cancelled ولا يُنشأ رصيد أصلًا."""
    pid, tid = await _seed_payment(amount=30)
    r = await tg.post(f"pay_rej:{pid}")
    assert r.status_code == 200, r.text
    assert await _payment_status(pid) == "cancelled"
    assert await _balance(tid) == 0
    assert any("رفض" in t for t in tg.answers()), tg.calls


async def test_pay_reject_then_approve_stays_cancelled(tg):
    """الترتيب حتمي: بعد الرفض لا يمكن للموافقة إحياء الطلب أو إضافة رصيد
    (المطالبة تشترط status='pending' — لا رجعة بعد أول قرار)."""
    pid, tid = await _seed_payment(amount=45)
    await tg.post(f"pay_rej:{pid}")
    r = await tg.post(f"pay_app:{pid}")
    assert r.status_code == 200, r.text
    assert await _payment_status(pid) == "cancelled"
    assert await _balance(tid) == 0
    assert any("تمت معالجة هذا الطلب مسبقاً" in t for t in tg.answers()), tg.calls


async def test_sub_approve_activates_tenant_and_user_once(tg):
    """موافقة الاشتراك: الدفعة verified، المستأجر والمستخدم PAID مع
    الباقة ومدة صلاحية الباقة (30 يومًا)."""
    from database import AsyncSessionLocal
    from models import SubscriptionPayment, Tenant, User

    spid, tid, plan_id, uid = await _seed_sub_payment()
    r = await tg.post(f"sub_app:{spid}")
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    async with AsyncSessionLocal() as db:
        sp = await db.get(SubscriptionPayment, spid)
        t = await db.get(Tenant, tid)
        u = await db.get(User, uid)
        assert sp.status == "verified"
        assert t.subscription_status == "PAID" and t.plan_id == plan_id
        assert t.plan_end is not None and t.plan_start is not None
        assert u.subscription_status == "PAID" and u.plan_id == plan_id
    assert any("تم تأكيد الاشتراك" in t for t in tg.answers()), tg.calls


async def test_sub_double_tap_activates_plan_exactly_once(tg):
    """ضغطة مزدوجة على sub_app: التفعيل مرة واحدة — plan_end/plan_start
    للثانية كما هي حرفيًا (لو أعيد التفعيل لتقدمت مدة الصلاحية)."""
    from database import AsyncSessionLocal
    from models import SubscriptionPayment, Tenant

    spid, tid, _plan_id, _uid = await _seed_sub_payment()
    await tg.post(f"sub_app:{spid}")
    async with AsyncSessionLocal() as db:
        first_end = (await db.get(Tenant, tid)).plan_end
    r2 = await tg.post(f"sub_app:{spid}")
    assert r2.status_code == 200, r2.text
    async with AsyncSessionLocal() as db:
        t = await db.get(Tenant, tid)
        sp = await db.get(SubscriptionPayment, spid)
        assert t.plan_end == first_end, "double-tap re-activated the subscription"
        assert sp.status == "verified"
    assert any("تمت معالجة هذا الطلب مسبقاً" in t for t in tg.answers()), tg.calls


async def test_sub_reject_keeps_tenant_trial(tg):
    """رفض الاشتراك: الدفعة cancelled والمستأجر يبقى كما كان (لا PAID)."""
    from database import AsyncSessionLocal
    from models import SubscriptionPayment, Tenant

    spid, tid, _plan_id, _uid = await _seed_sub_payment()
    r = await tg.post(f"sub_rej:{spid}")
    assert r.status_code == 200, r.text
    async with AsyncSessionLocal() as db:
        assert (await db.get(SubscriptionPayment, spid)).status == "cancelled"
        assert (await db.get(Tenant, tid)).subscription_status != "PAID"


async def test_callback_from_non_admin_is_rejected_without_side_effects(tg):
    """from.id ليس مدراء الموافقة → «عذراً، لا تمتلك الصلاحية» والطلب
    يبقى pending (بوابة الصلاحية قبل أي كتابة)."""
    pid, tid = await _seed_payment(amount=15)
    r = await tg.post(f"pay_app:{pid}", from_id=999999)
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    assert await _payment_status(pid) == "pending"
    assert await _balance(tid) == 0
    assert any("لا تمتلك الصلاحية" in t for t in tg.answers()), tg.calls


# FIXED in v11: int(payment_id) now guarded — malformed callback data is a
# logged graceful no-op (200 ok) instead of a 500 that Telegram retries forever.
async def test_webhook_malformed_payment_id_is_graceful_noop(tg):
    """بيانات callback بمعرف غير رقمي (pay_app:abc) يجب أن تُتجاهل برشاقة
    (200 ok) — لا 500: تلغرام يعيد المحاولة عند كل استجابة غير 2xx."""
    pid, _tid = await _seed_payment()
    r = await tg.post("pay_app:abc", cid="cq-malformed")
    assert r.status_code == 200, f"malformed callback data → {r.status_code} (Telegram will retry forever)"
    assert await _payment_status(pid) == "pending"


# ── راوتر telegram_config (SystemConfig + المدراء + أهداف البث) ─────────────


async def test_config_get_defaults_from_env(v10_seed, monkeypatch):
    """GET /api/telegram/config بلا قيم DB: botTokenConfigured من البيئة فقط."""
    import routers.telegram_config as tgc
    monkeypatch.setattr(tgc, "BOT_TOKEN", "")
    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/telegram/config")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["botTokenConfigured"] is False
    assert data["botTokenSource"] == ""
    assert data["events"] == ["new_order", "payment", "settings_change"]


async def test_config_post_validates_and_persists(v10_seed):
    """POST /api/telegram/config: توكن وchat_id صحيحان → SystemConfig سري،
    والقراءة بعدها تعكس المصدر db."""
    from models import SystemConfig

    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    c = v10_seed.world.client

    r = await c.post("/api/telegram/config", json={
        "botToken": VALID_BOT_TOKEN, "chatId": str(VALID_CHAT_ID)})
    assert r.status_code == 200, r.text
    assert set(r.json()["data"]["updated"]) == {"telegram_bot_token", "telegram_chat_id"}

    async with v10_seed.world.sf() as db:
        rows = {row.key: row for row in (await db.execute(
            select(SystemConfig).where(SystemConfig.key.in_(
                ("telegram_bot_token", "telegram_chat_id"))))).scalars()}
        assert rows["telegram_bot_token"].value == VALID_BOT_TOKEN
        assert rows["telegram_bot_token"].is_secret is True
        assert rows["telegram_chat_id"].value == str(VALID_CHAT_ID)

    r = await c.get("/api/telegram/config")
    data = r.json()["data"]
    assert data["botTokenSource"] == "db"
    assert data["botTokenConfigured"] is True
    assert data["chatId"] == str(VALID_CHAT_ID)


async def test_config_post_rejects_invalid_token_and_chat(v10_seed):
    """توكن بغير صيغة BotFather → 400 عربي؛ chat_id غير صالح → 400؛ جسم
    فارغ → 400 «جسم الطلب JSON مطلوب»."""
    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    c = v10_seed.world.client

    r = await c.post("/api/telegram/config", json={"botToken": "not-a-token"})
    assert r.status_code == 400 and "BotFather" in r.json()["detail"], r.text

    r = await c.post("/api/telegram/config", json={"chatId": "!!bad!!"})
    assert r.status_code == 400 and "telegram_chat_id" in r.json()["detail"], r.text

    r = await c.post("/api/telegram/config")
    assert r.status_code == 400 and "JSON" in r.json()["detail"], r.text


async def test_config_post_empty_values_clear_db_override(v10_seed):
    """قيم فارغة تحذف تجاوز DB (العودة لfallback البيئة) — لا تحفظ «»."""
    from models import SystemConfig

    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    c = v10_seed.world.client

    await c.post("/api/telegram/config", json={"botToken": VALID_BOT_TOKEN,
                                               "chatId": str(VALID_CHAT_ID)})
    r = await c.post("/api/telegram/config", json={"botToken": "", "chatId": ""})
    assert r.status_code == 200, r.text
    async with v10_seed.world.sf() as db:
        left = (await db.execute(
            select(SystemConfig).where(SystemConfig.key.in_(
                ("telegram_bot_token", "telegram_chat_id"))))).scalars().all()
        assert left == [], "empty value must DELETE the DB override, not store ''"


async def test_approvers_crud_with_duplicate_conflict(v10_seed):
    """مدراء الموافقة: إضافة ثم قائمة ثم حذف؛ التكرار → 409 (وليس صفًا
    ثانيًا)."""
    uname, _tid, uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    c = v10_seed.world.client
    tg_id = f"{uuid.uuid4().hex[:10]}"

    r = await c.post("/api/admin/telegram/approvers",
                     json={"telegramId": tg_id, "label": "المدير أحمد"})
    assert r.status_code == 200 and r.json()["data"]["telegramId"] == tg_id, r.text
    assert r.json()["data"]["label"] == "المدير أحمد"

    r = await c.post("/api/admin/telegram/approvers", json={"telegramId": tg_id})
    assert r.status_code == 409, r.text

    r = await c.post("/api/admin/telegram/approvers", json={})
    assert r.status_code == 400, r.text

    r = await c.get("/api/admin/telegram/approvers")
    ids = [a["telegramId"] for a in r.json()["data"]]
    assert tg_id in ids
    approver_id = [a["id"] for a in r.json()["data"] if a["telegramId"] == tg_id][0]
    assert all(a["label"] is not None for a in r.json()["data"])

    r = await c.delete(f"/api/admin/telegram/approvers/{approver_id}")
    assert r.status_code == 200, r.text


async def test_broadcast_targets_crud_and_missing_patch(v10_seed):
    """أهداف البث: إضافة/تفعيل-تعطيل/حذف؛ PATCH لمفقود → 404."""
    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    c = v10_seed.world.client

    r = await c.post("/api/telegram/broadcast-targets",
                     json={"chatId": str(VALID_CHAT_ID), "label": "قناة الإعلانات"})
    assert r.status_code == 200, r.text
    target_id = r.json()["data"]["id"]
    assert r.json()["data"]["isActive"] is True

    r = await c.patch(f"/api/telegram/broadcast-targets/{target_id}", json={"isActive": False})
    assert r.status_code == 200, r.text

    r = await c.get("/api/telegram/broadcast-targets")
    row = [t for t in r.json()["data"] if t["id"] == target_id][0]
    assert row["isActive"] is False

    r = await c.patch("/api/telegram/broadcast-targets/999999", json={"isActive": True})
    assert r.status_code == 404, r.text

    r = await c.delete(f"/api/telegram/broadcast-targets/{target_id}")
    assert r.status_code == 200, r.text


async def test_telegram_test_without_token_returns_arabic_400(v10_seed, monkeypatch):
    """/api/telegram/test بلا توكن → 400 «لم يتم إعداد توكن البوت» (لم يكن
    يرسل شيئًا فعليًا — كان stub يعيد sent:true أعمى)."""
    import telegram_bot

    async def no_token():
        return ""
    monkeypatch.setattr(telegram_bot, "get_bot_token", no_token)
    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    r = await v10_seed.world.client.post("/api/telegram/test")
    assert r.status_code == 400, r.text
    assert "توكن البوت" in r.json()["detail"], r.text


async def test_telegram_test_sends_to_admins_when_configured(v10_seed, monkeypatch):
    """/api/telegram/test مع توكن: يرسل للمدارة (send_message مُحاكى) ويعيد
    عدد المستلمين — بلا أي نداء شبكي."""
    import telegram_bot

    sent_to: list[str] = []

    async def fake_token():
        return VALID_BOT_TOKEN

    async def fake_admins():
        return [TG_ADMIN_ID]

    async def no_chat():
        return ""

    async def fake_send(chat_id, text, buttons=None):
        sent_to.append(str(chat_id))
        assert "تجريبية" in text, text
        return {"ok": True}

    monkeypatch.setattr(telegram_bot, "get_bot_token", fake_token)
    monkeypatch.setattr(telegram_bot, "get_admin_ids", fake_admins)
    monkeypatch.setattr(telegram_bot, "get_chat_id", no_chat)
    monkeypatch.setattr(telegram_bot, "send_message", fake_send)

    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    r = await v10_seed.world.client.post("/api/telegram/test")
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"sent": True, "recipients": 1}, r.text
    assert sent_to == [str(TG_ADMIN_ID)]


async def test_telegram_diagnose_reports_admin_count(v10_seed, monkeypatch):
    """GET /api/telegram/diagnose: يقرأ التوكن/المدراء ويعيد معاينة التوكن
    دون dry_run (بلا شبكة)."""
    import telegram_bot

    async def fake_token():
        return VALID_BOT_TOKEN

    async def fake_admins():
        return [TG_ADMIN_ID, 777]

    async def fake_chat():
        return str(VALID_CHAT_ID)

    monkeypatch.setattr(telegram_bot, "get_bot_token", fake_token)
    monkeypatch.setattr(telegram_bot, "get_admin_ids", fake_admins)
    monkeypatch.setattr(telegram_bot, "get_chat_id", fake_chat)

    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/telegram/diagnose")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["configExists"] is True
    assert data["adminCount"] == 2
    assert data["botTokenPreview"].startswith("123456789:")
    assert "dryRunResult" not in data, "dry_run=False must not attempt sending"
