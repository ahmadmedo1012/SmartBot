"""v22-D7 (FIX-B) — بوابة تهريب تيليغرام: HTML mode + سقوط آمن إلى نص خام + تكافؤ الحسم.

الصنف المُصلَح (الأدلة الحية W1-D5 الدفعتان #26/#28 + W1-D10 التذاكر 3/4/5/8):
كل بُناة الإشعار كانت تبني ``parse_mode: "Markdown"`` مع بيانات مستخدم خام —
أي ``_``/``*``/```` ``` ``/``[`` في اسم المستخدم/الهاتف/الباقة/متن التذكرة جعل
تيليغرام يرفض الرسالة بـ 400 «can't parse entities» والمعتمد لا يصل إليه شيء
إطلاقًا (فقدان صامت — اسم ``v22d5_z9jscc`` حطّ الكيان عند البايت 67).

هذه البوابة تُثبت العقد الجديد:

  [x] البُناة الثلاثة (payment/subscription/support) يرسلون parse_mode=HTML
        مع تهريب الحقول الديناميكية (``&lt;``/``&amp;``) — بيانات المستخدم
        لم تعد قادرة على كسر المحلل، ورموز ``_``/``*`` صارت خاملة حرفيًا.
  [x] بنية HTML سليمة: امشِ النص بمحلل html.parser — الوسوم الوحيدة المسموح
        بها <b></b> متوازنة (لا وسم مستخدم يمكنه فتح/إغلاق كيان).
  [x] الأزرار (callback_data) تبقى كما هي في الحِمل — وبعد السقوط أيضًا.
  [x] FALLBACK (حزام الأمان): 400 «can't parse entities» ⇒ إعادة محاولة واحدة
        بنفس النص خامًا (بلا parse_mode، الأزرار محفوظة) ⇒ sent=1 — الرسالة
        لا تضيع أبدًا. المحاولتان تُسجّلان.
  [x] 400 غير parse (chat not found) / 403: لا سقوط ولا إعادة — عقد v18
        (4xx تهيئة لا ومضة) محفوظ حرفيًا.
  [x] السقوط محدود: المحاولة الخام نفسها إن فشلت ⇒ عمق 2 فقط.
  [x] التكافؤ (FIX-B #2): sub_app/sub_rej عبر الويبهوك ينشئ إشعارًا داخل
        التطبيق لصاحب الدفعة (نفس قيم الحالة + العربية في approvals.py)،
        مرة واحدة (لا تكرار عند الضغطة المزدوجة)، ونص editMessageText
        نفسه صار HTML آمنًا (الباقة/المستخدم مُهَرَّبان).

Hermetic: لا شبكة — httpx.post وget_bot_token وget_admin_ids مُحاكاة؛ اختبارات
الويبهوك تكتب عبر AsyncSessionLocal على قاعدة الاختبار المشتركة (نمط test_v11).
"""

from __future__ import annotations

import logging
import os
import sys
import uuid
from html.parser import HTMLParser
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

VALID_TOKEN = "123456789:AAHfiqksKZ8WmoMTsD2ky9KzR7pZ5c5c9"
ADMIN_A = 111

# الأدلة الحية التي كسرت Markdown — تُستخدم هنا كما هي (المُعاد إنتاجه)
W1D5_USERNAME = "v22d5_z9jscc"          # ← `_` عند البايت 67 (دفعتا #26/#28)
W1D5_PHONE = "0910089975_2"
W1D5_PLAN = "مميز_السعر"                 # باقة باسم يحوي `_`
W1D10_SUBJECT = "مشكلة_في_الدفع_مع_رموز * ` [ ("
W1D10_EMAIL = "w1d10_43031@example.com"  # ← بريد بشرطة سفلية (تذكرة #5)
PARSE_ERR_400 = {
    "ok": False, "error_code": 400,
    "description": "Bad Request: can't parse entities: "
                   "Can't find end of the entity starting at byte offset 67",
}


# ── محلّل بنية HTML: الوسوم الوحيدة المسموح بها <b>…</b> متوازنة ─────────────


class _TagWalk(HTMLParser):
    """Collect tag-structure violations: unknown tags, unbalanced close, open."""

    ALLOWED = frozenset({"b"})

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stack: list[str] = []
        self.errors: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag not in self.ALLOWED:
            self.errors.append(f"unexpected open <{tag}>")
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1] != tag:
            self.errors.append(f"unbalanced close </{tag}>")
        else:
            self.stack.pop()


def assert_telegram_html(text: str) -> None:
    """المستخدم لا يستطيع فتح/إغلاق أي كيان: البنية <b> فقط، متوازنة تمامًا."""
    p = _TagWalk()
    p.feed(text)
    p.close()
    assert p.errors == [] and p.stack == [], (p.errors, p.stack, text)


# ── عالم الوحدات: httpx مُحاكى + توكن/مستلمون معروفون (نمط v18) ─────────────


@pytest.fixture
def tg(monkeypatch):
    import telegram_bot

    monkeypatch.setattr(telegram_bot, "_RETRY_DELAY_S", 0.0)

    calls: list[dict] = []

    def fake_post(url, json=None, timeout=None):
        calls.append({"url": url, "json": json, "timeout": timeout})
        return httpx.Response(200, json={"ok": True, "result": {"message_id": len(calls)}})

    monkeypatch.setattr(telegram_bot.httpx, "post", fake_post)

    def set_post(handler):
        monkeypatch.setattr(telegram_bot.httpx, "post", handler)

    async def set_state(token: str, admin_ids: list[int]):
        async def fake_token():
            return token

        async def fake_admins():
            return list(admin_ids)

        monkeypatch.setattr(telegram_bot, "get_bot_token", fake_token)
        monkeypatch.setattr(telegram_bot, "get_admin_ids", fake_admins)
        calls.clear()

    return SimpleNamespace(mod=telegram_bot, calls=calls, set_state=set_state,
                           set_post=set_post)


def _payload(tg) -> dict:
    assert len(tg.calls) == 1, "one recipient — exactly one sendMessage"
    return tg.calls[0]["json"]


# ── (1) البُناة الثلاثة: HTML mode + تهريب + بنية سليمة + أزرار ──────────────


async def test_payment_notify_escapes_user_fields_under_html_mode(tg):
    """طلب دفع: اسم المستخدم/الهاتف يُهرَّبان، الوضع HTML، الأزرار كما هي،
    وبيانات W1-D5 الحية تظهر حرفيًا (خاملة تحت HTML — لا فقدان معلومات)."""
    await tg.set_state(VALID_TOKEN, [ADMIN_A])
    result = await tg.mod.notify_admins_new_payment(
        26, f"{W1D5_USERNAME}<script>&", 19, "liyana", W1D5_PHONE)
    assert result["sent"] == 1 and result["failed"] == 0 and result["payment_id"] == 26
    payload = _payload(tg)
    assert payload["parse_mode"] == "HTML", "v22-D7: HTML mode (Markdown is the bug)"
    text = payload["text"]
    # user-controlled segments: escaped for the HTML parser
    assert "v22d5_z9jscc&lt;script&gt;&amp;" in text, text
    assert "<script>" not in text and "v22d5_z9jscc<script>" not in text
    # the W1-D5 metachars stay verbatim (inert under HTML — no data loss)
    assert W1D5_USERNAME in text and W1D5_PHONE in text
    # fixed labels: bold via <b>…</b>, no Markdown *…* left
    assert "<b>طلب دفع جديد</b>" in text and "*طلب دفع جديد*" not in text
    assert_telegram_html(text)
    assert payload["reply_markup"]["inline_keyboard"] == [
        [{"text": "🟢 موافقة", "callback_data": "pay_app:26"}],
        [{"text": "🔴 رفض", "callback_data": "pay_rej:26"}],
    ], "approval buttons MUST reach Telegram unchanged"


async def test_subscription_notify_escapes_plan_phone_username(tg):
    """طلب اشتراك: الباقة «مميز_السعر» والهاتف يحويان `_` — حرفيان وخالدون
    تحت HTML؛ أزرار sub_app/sub_rej محفوظة؛ البنية سليمة."""
    await tg.set_state(VALID_TOKEN, [ADMIN_A])
    result = await tg.mod.notify_admins_new_subscription(
        29, "fixb_*user[", 29.0, "bank", W1D5_PHONE, W1D5_PLAN)
    assert result["sent"] == 1 and result["failed"] == 0
    payload = _payload(tg)
    assert payload["parse_mode"] == "HTML"
    text = payload["text"]
    assert f"الباقة: {W1D5_PLAN}" in text, text
    assert W1D5_PHONE in text and "fixb_*user[" in text
    assert "<b>طلب اشتراك جديد</b>" in text and "*طلب اشتراك جديد*" not in text
    assert_telegram_html(text)
    assert payload["reply_markup"]["inline_keyboard"] == [
        [{"text": "🟢 موافقة على التفعيل", "callback_data": "sub_app:29"}],
        [{"text": "🔴 رفض الطلب", "callback_data": "sub_rej:29"}],
    ]


async def test_support_notify_escapes_subject_email_body(tg):
    """تذكرة دعم: الموضوع/البريد/المتن حرّ المستخدم — تهريب كامل؛ متن
    التذكرة يحوي وسوم خام <b>/</i> و& و_ غير موزونة فلا شيء يكسر المحلل."""
    await tg.set_state(VALID_TOKEN, [ADMIN_A])
    result = await tg.mod.notify_admins_support_ticket(
        W1D10_SUBJECT,
        "جسم فيه <b>وسم</i> و & و _ * و ` غير موزونة",
        W1D10_EMAIL)
    assert result["sent"] == 1 and result["failed"] == 0
    payload = _payload(tg)
    assert payload["parse_mode"] == "HTML"
    text = payload["text"]
    assert W1D10_SUBJECT in text and W1D10_EMAIL in text, text
    # the user's raw tags are neutralised — only OUR <b> label survives
    assert "&lt;b&gt;وسم&lt;/i&gt;" in text and "&amp;" in text
    assert "<b>وسم" not in text
    assert "<b>طلب دعم جديد</b>" in text and "*طلب دعم جديد*" not in text
    assert_telegram_html(text)


# ── (2) FALLBACK: 400 «can't parse entities» ⇒ نص خام مرة واحدة ─────────────


async def test_parse_error_400_retries_once_as_plain_text(tg, caplog):
    """السيناريو الحرفي للإنتاج: 400 can't parse entities (البايت 67!) ثم
    نجاح ⇒ إعادة واحدة بنفس النص خامًا، الأزرار محفوظة، sent=1 — لا فقدان."""
    def telegram_400_then_200(url, json=None, timeout=None):
        tg.calls.append({"url": url, "json": json, "timeout": timeout})
        if json and json.get("parse_mode"):
            return httpx.Response(400, json=PARSE_ERR_400)
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})

    tg.set_post(telegram_400_then_200)
    await tg.set_state(VALID_TOKEN, [ADMIN_A])
    with caplog.at_level(logging.WARNING, logger="fb-tg"):
        result = await tg.mod.notify_admins_new_payment(
            26, W1D5_USERNAME, 19, "liyana", "0911111111")
    assert result["sent"] == 1 and result["failed"] == 0, result
    assert len(tg.calls) == 2, "exactly ONE plain-text retry"
    first, second = tg.calls[0]["json"], tg.calls[1]["json"]
    assert first["parse_mode"] == "HTML"
    assert "parse_mode" not in second, "the retry must be plain text (no parse_mode)"
    assert second["text"] == first["text"], "same text — nothing dropped"
    assert second["chat_id"] == first["chat_id"]
    assert second.get("reply_markup") == first.get("reply_markup"), \
        "approval buttons must survive the plain-text retry"
    # both attempts observable in logs
    assert "parse rejected" in caplog.text and "PLAIN TEXT" in caplog.text, caplog.text


async def test_parse_error_fallback_bounded_to_one_retry(tg):
    """السقوط محدود: المحاولة الخام نفسها تفشل (403) ⇒ نداءان فقط، failed=1 —
    لا حلقة، ولا إعادة سقوط (الحمولة الخاملة بلا parse_mode لا تُسقط مجددًا)."""
    def parse_then_blocked(url, json=None, timeout=None):
        tg.calls.append({"url": url, "json": json, "timeout": timeout})
        if json and json.get("parse_mode"):
            return httpx.Response(400, json=PARSE_ERR_400)
        return httpx.Response(403, json={"ok": False, "description": "Forbidden: bot was blocked"})

    tg.set_post(parse_then_blocked)
    await tg.set_state(VALID_TOKEN, [ADMIN_A])
    result = await tg.mod.notify_admins_new_payment(5, "t", 10, "liyana", "091")
    assert result["sent"] == 0 and result["failed"] == 1
    assert len(tg.calls) == 2, "fallback depth is exactly 2 — never more"


async def test_non_parse_400_gets_no_plain_retry(tg):
    """عقد v18 محفوظ: 400 «chat not found» (خطأ تهيئة لا تنسيق) ⇒ نداء واحد
    فقط — السقوط النصي خاص بصنف «can't parse entities» وحده."""
    def always_chat_not_found(url, json=None, timeout=None):
        tg.calls.append({"url": url, "json": json, "timeout": timeout})
        return httpx.Response(400, json={"ok": False, "error_code": 400,
                                         "description": "Bad Request: chat not found"})

    tg.set_post(always_chat_not_found)
    await tg.set_state(VALID_TOKEN, [ADMIN_A])
    result = await tg.mod.notify_admins_new_payment(6, "t", 10, "liyana", "091")
    assert result["sent"] == 0 and result["failed"] == 1
    assert len(tg.calls) == 1, "non-parse 4xx must NOT trigger the plain-text retry"


async def test_call_self_heal_covers_edit_message_too(tg):
    """حزام الأمان يعمل على مستوى _call: editMessageText (يحقن اسم الباقة/
    المستخدم في app/telegram.py) يحصل على نفس السقوط الخام — نداءان،
    والثاني بلا parse_mode بنفس النص."""
    def telegram_400_then_200(url, json=None, timeout=None):
        tg.calls.append({"url": url, "json": json, "timeout": timeout})
        if json and json.get("parse_mode"):
            return httpx.Response(400, json=PARSE_ERR_400)
        return httpx.Response(200, json={"ok": True, "result": True})

    tg.set_post(telegram_400_then_200)
    payload = {"chat_id": 777, "message_id": 88,
               "text": f"✅ <b>تم تأكيد الاشتراك</b> #1\nالباقة: {W1D5_PLAN}",
               "parse_mode": "HTML"}
    res = tg.mod._call("editMessageText", payload, VALID_TOKEN)
    assert isinstance(res, dict) and res.get("ok") is True
    assert len(tg.calls) == 2
    assert "parse_mode" not in tg.calls[1]["json"]
    assert tg.calls[1]["json"]["text"] == payload["text"]


async def test_send_message_plain_mode_stays_plain(tg):
    """العقد الصريح: parse_mode=None ⇒ لا مفتاح parse_mode في الحمولة أصلًا
    (وضع النص الخام متاح للمستدعين صراحة)."""
    await tg.set_state(VALID_TOKEN, [ADMIN_A])
    await tg.mod.send_message(ADMIN_A, "نص خام <b>و&", parse_mode=None)
    payload = _payload(tg)
    assert "parse_mode" not in payload
    assert payload["text"] == "نص خام <b>و&"


# ── (3) التكافؤ: sub_app/sub_rej عبر الويبهوك يُشعِران صاحب الدفعة ────────────

TG_TEST_SECRET = "v22-tg-webhook-secret"
TG_ADMIN_ID = 4242


@pytest.fixture(scope="module")
async def wh_client():
    """عميل HTTP على التطبيق الحقيقي + قاعدة الاختبار المشتركة (نمط test_v11)."""
    from database import engine as db_engine
    from models import Base
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://test") as ac:
        yield ac


@pytest.fixture
def wh(wh_client, monkeypatch):
    """تثبيت عالم الويبهوك: سر صحيح + معتمد معروف + مسجّل نداءات تيليغرام."""
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

    def post(cq_data: str, from_id: int = TG_ADMIN_ID, secret: str | None = TG_TEST_SECRET):
        headers = {}
        if secret is not None:
            headers["x-telegram-bot-api-secret-token"] = secret
        return wh_client.post("/api/telegram/webhook", json={
            "callback_query": {
                "id": "cb1", "data": cq_data, "from": {"id": from_id},
                "message": {"chat": {"id": 777}, "message_id": 88},
            }
        }, headers=headers)

    return SimpleNamespace(post=post, calls=calls,
                           edits=lambda: [t for k, t in calls if k == "edit"])


async def _seed_sub_payment() -> tuple[int, int, int]:
    """زرع دفعة اشتراك pending بعدوانية W1: مستخدم بـ`_` وباقة «مميز_السعر»
    → (payment_id, tenant_id, user_id)."""
    from database import AsyncSessionLocal
    from models import SubscriptionPayment, SubscriptionPlan, Tenant, User

    async with AsyncSessionLocal() as db:
        t = Tenant(name=f"T-V22TG-{uuid.uuid4().hex[:8]}",
                   subscription_status="TRIAL", is_active=True)
        db.add(t)
        await db.flush()
        u = User(username=f"v22fix_{uuid.uuid4().hex[:8]}",
                 email=f"v22fix_{uuid.uuid4().hex[:6]}@test.ly",
                 password_hash="x", tenant_id=t.id, role="admin")
        db.add(u)
        await db.flush()
        plan = SubscriptionPlan(name=f"pv22_{uuid.uuid4().hex[:6]}", name_ar=W1D5_PLAN,
                                period_days=30, price=29)
        db.add(plan)
        await db.flush()
        sp = SubscriptionPayment(user_id=u.id, tenant_id=t.id, phone=W1D5_PHONE,
                                 amount=29, plan_id=plan.id, plan_name=W1D5_PLAN,
                                 status="pending", extra_data={"username": u.username})
        db.add(sp)
        await db.commit()
        return sp.id, t.id, u.id


async def _owner_notifications(user_id: int) -> list:
    from database import AsyncSessionLocal
    from models import Notification

    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(Notification).where(
            Notification.user_id == user_id))).scalars().all()
        return list(rows)


async def test_sub_approve_pushes_inapp_notification_to_owner(wh):
    """التكافؤ (FIX-B #2): موافقة تيليغرام تُنشئ إشعارًا داخل التطبيق لصاحب
    الدفعة — نفس عنوان/نص/رابط approvals.py تمامًا، مع بيانات W1 العدوانية."""
    spid, tid, uid = await _seed_sub_payment()
    r = await wh.post(f"sub_app:{spid}")
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    notes = await _owner_notifications(uid)
    assert len(notes) == 1, "exactly ONE in-app notification for the payment owner"
    n = notes[0]
    assert n.tenant_id == tid and n.type == "payment"
    assert n.title == "تم تأكيد الدفع وتفعيل الاشتراك"
    assert "29.00" in n.body and W1D5_PLAN in n.body, n.body
    assert n.link == "/dashboard/billing" and n.read is False
    # editMessageText (the admin's chat) is HTML-safe with escaped user data
    edited = [t for t in wh.edits() if "تم تأكيد الاشتراك" in t]
    assert edited and "<b>تم تأكيد الاشتراك</b>" in edited[0]
    assert f"الباقة: {W1D5_PLAN}" in edited[0] and "*تم تأكيد الاشتراك*" not in edited[0]
    assert_telegram_html(edited[0])


async def test_sub_reject_pushes_rejection_notification_to_owner(wh):
    """الرفض عبر تيليغرام يُشعِر صاحب الدفعة أيضًا (مرآة approvals.py:161-166)."""
    spid, tid, uid = await _seed_sub_payment()
    r = await wh.post(f"sub_rej:{spid}")
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    notes = await _owner_notifications(uid)
    assert len(notes) == 1
    n = notes[0]
    assert n.title == "تم رفض طلب الدفع"
    assert "رُفضت دفعة بقيمة 29.00" in n.body, n.body
    assert n.type == "payment" and n.link == "/dashboard/billing"
    # double-tap: the atomic claim makes the second tap a no-op — no duplicate
    r2 = await wh.post(f"sub_rej:{spid}")
    assert r2.status_code == 200
    assert len(await _owner_notifications(uid)) == 1, "double-tap must not re-notify"


async def test_pay_paths_do_not_crash_and_still_credit(wh):
    """انحدار مسار الدفع القديم (pay_): الرصيد يُضاف ونص التعديل صار HTML —
    اسم مستخدم PaymentRequest يُهرَّب (كان خامًا في Markdown)."""
    from database import AsyncSessionLocal
    from models import PaymentRequest, Tenant

    async with AsyncSessionLocal() as db:
        t = Tenant(name=f"T-V22PAY-{uuid.uuid4().hex[:8]}",
                   subscription_status="TRIAL", is_active=True)
        db.add(t)
        await db.flush()
        pr = PaymentRequest(tenant_id=t.id, username="v22pay_user&<x>",
                            amount=100, status="pending")
        db.add(pr)
        await db.commit()
        pid, tid = pr.id, t.id
    r = await wh.post(f"pay_app:{pid}")
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    async with AsyncSessionLocal() as db:
        assert (await db.get(PaymentRequest, pid)).status == "confirmed"
    edited = [t for t in wh.edits() if "تم تأكيد الدفع" in t]
    assert edited and "v22pay_user&amp;&lt;x&gt;" in edited[0], edited
    assert_telegram_html(edited[0])
    _ = tid  # balance crediting itself is covered by test_v11_telegram.py
