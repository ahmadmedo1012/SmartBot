from __future__ import annotations

"""W7-I-A — مزامنة لوحة الإدارة مع نسخ تليجرام: الحقيقة ثنائية القناة.

الفراغ (الدين الصادق المتبقي من W7-H): b172fa1 جعل مسار أزرار تليجرام
صادقًا (توست أولًا، ثلاثية الحالة، تجريد أزرار النسخة المضغوطة)، لكن
قرار الويب كان أعمى عن نسخ تليجرام: أدمن يحسم من اللوحة → رسالة تليجرام
تبقى بأزرار موافقة/رفض حية على طلب محسوم. الجذر: معرف الرسالة الذي
يعيده sendMessage كان يُهدر لحظة إرسال أزرار الحسم، فلم يكن هناك مرجع
يُحرَّر لاحقًا.

ما يغطيه هذا المسمار:
  [x] مسار الإرسال: _notify_admins يجمع result["tg_msgs"] =
      [{chat_id, message_id}] لكل إرسال مُقرّ يحمل أزرارًا (والإرسال بلا
      أزرار — تذكرة الدعم — يبقى بالعقد الرشيق القديم: بلا مفتاح).
  [x] التثبيت: topup (pay_) وcreate/upgrade الاشتراك (sub_) يثبّتون
      المراجع في extra_data["tg_msgs"] — دمجًا فوق مفاتيح extra_data
      القائمة (username/الإيصال) لا كبتًا لها.
  [x] حسم اللوحة: POST /api/admin/subscriptions يحرّر كل نسخة إدارية بنص
      الحسم الصادق نفسه (sub_app/sub_rej — الباني المشترك) + يجرّد
      الأزرار (نفس ترتيب مسار الويبهوك بعد b172fa1).
  [x] إلغاء المستخدم: POST /api/subscriptions/cancel يخبر النسخ الإدارية
      بصدق (🚫 أُلغي — ألغى المستخدم هذا الطلب بنفسه) — لا «✅» تهنئة
      ولا «❌ رفض» تُوهم بقرار إدارة.
  [x] الرشاقة: بلا مراجع → لا تحرير؛ وعميل تليجرام يرمي → القرار 200
      والحسم خالد في القاعدة (الفشل يُسجَّل فقط).
  [x] عائلة pay_: بُناة نصوص الشحن (تأكيد/رفض) بالنص الحرفي لمسار
      الويبهوك — لا يوجد اليوم مسار لوحة يحسم PaymentRequest (الشحنات
      تُحسم من تليجرام وحده)، فالباني يُثبّت هنا لأي سطح حسم مستقبلي.
  [x] الترحيلة 020: السلسلة تصل 020 وpayment_requests.extra_data موجود،
      وreconcile يشفي شكل legacy بلا العمود.

Hermetic: لا شبكة — send_message/edit_message/edit_keyboard/get_bot_token/
get_admin_ids كلها مُحاكاة بمسجّلات (نمط test_v11_telegram.py)؛ حزام
v10_seed يملك مسارات HTTP الحقيقية.
"""

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "fb_dashboard"))

_REPO = Path(__file__).resolve().parent.parent
_ALEMBIC_DIR = _REPO / "alembic"

TG_ADMIN_ID = 4242
VALID_TOKEN = "123456789:AAHfiqksKZ8WmoMTsD2ky9KzR7pZ5c5c9"


# ── مساعدات المحاكاة (نمط test_v11_telegram.py — بلا أي نداء شبكي) ─────────


@pytest.fixture
def tg_send(monkeypatch):
    """محاكاة الإرسال: send_message تعيد message_id ثابتًا لكل مستلم."""
    from types import SimpleNamespace

    import telegram_bot

    sent: list[dict] = []

    async def fake_send(chat_id, text, buttons=None, parse_mode="HTML"):
        sent.append({"chat_id": chat_id, "text": text, "buttons": buttons})
        return {"ok": True, "result": {"message_id": 5000 + len(sent)}}

    async def fake_token():
        return VALID_TOKEN

    async def fake_admins():
        return [TG_ADMIN_ID]

    monkeypatch.setattr(telegram_bot, "send_message", fake_send)
    monkeypatch.setattr(telegram_bot, "get_bot_token", fake_token)
    monkeypatch.setattr(telegram_bot, "get_admin_ids", fake_admins)
    return SimpleNamespace(sent=sent)


@pytest.fixture
def tg_edit(monkeypatch):
    """مسجّل التحرير: edit_message/edit_keyboard يُسجّلان (أو يرميان)."""
    from types import SimpleNamespace

    import telegram_bot

    calls: list[tuple[str, object]] = []

    async def fake_edit(chat_id, message_id, text):
        calls.append(("edit", (chat_id, message_id, text)))

    async def fake_kb(chat_id, message_id):
        calls.append(("editkb", (chat_id, message_id)))

    monkeypatch.setattr(telegram_bot, "edit_message", fake_edit)
    monkeypatch.setattr(telegram_bot, "edit_keyboard", fake_kb)
    return SimpleNamespace(calls=calls, monkeypatch=monkeypatch)


def _edits(rec):
    return [v for k, v in rec.calls if k == "edit"]


def _kbs(rec):
    return [v for k, v in rec.calls if k == "editkb"]


# ── (1) مسار الإرسال يجمع المراجع — والبلا-أزرار يبقى رشيقًا ────────────────


async def test_notify_subscription_collects_refs_per_admin(tg_send):
    import telegram_bot

    result = await telegram_bot.notify_admins_new_subscription(
        77, "زاهر", 50.0, "libyana", "0912345678", "مميز")
    assert result["sent"] == 1 and result["failed"] == 0
    assert result["tg_msgs"] == [{"chat_id": TG_ADMIN_ID, "message_id": 5001}], result


async def test_notify_support_stays_lean_without_refs(tg_send):
    """تذكرة الدعم بلا أزرار حسم → لا دورة حياة تحرير → لا مفتاح tg_msgs."""
    import telegram_bot

    result = await telegram_bot.notify_admins_support_ticket("موضوع", "نص", "a@b.ly")
    assert result["sent"] == 1
    assert "tg_msgs" not in result, "buttonless broadcasts keep the lean v18-1-d contract"


async def test_notify_refs_absent_when_message_id_missing(monkeypatch):
    """مُحاكاة قديمة تعيد {"ok": true} بلا result.message_id → لا مراجع ولا كسر."""
    import telegram_bot

    async def fake_send(chat_id, text, buttons=None, parse_mode="HTML"):
        return {"ok": True}

    async def fake_token():
        return VALID_TOKEN

    async def fake_admins():
        return [TG_ADMIN_ID]

    monkeypatch.setattr(telegram_bot, "send_message", fake_send)
    monkeypatch.setattr(telegram_bot, "get_bot_token", fake_token)
    monkeypatch.setattr(telegram_bot, "get_admin_ids", fake_admins)
    result = await telegram_bot.notify_admins_new_payment(5, "t", 10, "libyana", "091")
    assert result["sent"] == 1
    assert "tg_msgs" not in result


# ── (2) التثبيت: topup (pay_) وcreate الاشتراك (sub_) — دمج لا كبت ──────────


async def test_topup_persists_pay_refs_into_extra_data(v10_seed, tg_send):
    """الشحن: المراجع تثبت في payment_requests.extra_data["tg_msgs"] (العمود
    الجديد W7-I-A) — عائلة pay_ أصبحت قابلة للتحرير من أي سطح حسم ويب."""
    from models import PaymentRequest

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="TopupRefs")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/payments/topup", json={
        "amount": 50, "provider": "liyana", "phone": "0912345678",
    })
    assert r.status_code == 200, r.text
    pid = r.json()["data"]["payment_id"]
    assert len(tg_send.sent) == 1, "the admin notify must fire exactly once"
    async with v10_seed.world.sf() as db:
        pr = await db.get(PaymentRequest, pid)
        assert pr.extra_data["tg_msgs"] == [
            {"chat_id": TG_ADMIN_ID, "message_id": 5001}], pr.extra_data


async def test_subscription_create_persists_refs_and_keeps_username(v10_seed, tg_send):
    """إنشاء الاشتراك: المراجع تُدمج فوق username القائم في extra_data —
    لا كبت لمفاتيح الإيصال/المستخدم، ولا فقد للمراجع."""
    from models import SubscriptionPayment, SubscriptionPlan, Tenant

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="SubRefs")
    async with v10_seed.world.sf() as db:
        t = await db.get(Tenant, tid)
        t.subscription_status = "UNPAID"  # بوابة v19: PAID يرفض الإنشاء
        plan = SubscriptionPlan(name="W7IPlan", name_ar="مميز", price=50.0,
                               period_days=30, is_active=True)
        db.add(plan)
        await db.commit()
        plan_id = plan.id

    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/subscriptions", json={
        "plan_id": plan_id, "provider": "libyana", "amount": 50.0,
        "phone": "0912345678",
    })
    assert r.status_code == 200, r.text
    pid = r.json()["data"]["payment_id"]
    async with v10_seed.world.sf() as db:
        sp = await db.get(SubscriptionPayment, pid)
        assert sp.extra_data["username"] == uname, "existing key MUST survive the merge"
        assert sp.extra_data["tg_msgs"] == [
            {"chat_id": TG_ADMIN_ID, "message_id": 5001}], sp.extra_data


async def test_topup_without_refs_stays_clean(v10_seed, monkeypatch):
    """قناة ميتة (بلا توكن) → بلا مراجع → extra_data يبقى فارغًا (عقد رشيق)."""
    import telegram_bot
    from models import PaymentRequest

    async def no_token():
        return ""

    async def fake_admins():
        return [TG_ADMIN_ID]

    monkeypatch.setattr(telegram_bot, "get_bot_token", no_token)
    monkeypatch.setattr(telegram_bot, "get_admin_ids", fake_admins)

    uname, tid, _uid = await v10_seed.tenant_user(tenant_name="TopupNoRefs")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/payments/topup", json={
        "amount": 50, "provider": "libyana", "phone": "0912345678",
    })
    assert r.status_code == 200, r.text
    pid = r.json()["data"]["payment_id"]
    async with v10_seed.world.sf() as db:
        pr = await db.get(PaymentRequest, pid)
        assert not (pr.extra_data or {}).get("tg_msgs")


# ── (3) حسم اللوحة: مرآة نص الحسم + تجريد الأزرار على كل نسخة ──────────────


async def _seed_pending_sub(v10_seed, *, refs=None, username="زاهر_تجربة"):
    """زرع خطة + دفعة اشتراك معلقة (مع مراجع تليجرام اختياريًا)."""
    from models import SubscriptionPayment, SubscriptionPlan

    uname, tid, uid = await v10_seed.tenant_user(tenant_name="PanelSync")
    async with v10_seed.world.sf() as db:
        plan = SubscriptionPlan(name="W7IResolve", name_ar="مميز_<فاخر>",
                               price=50.0, period_days=30, is_active=True)
        db.add(plan)
        await db.flush()
        extra = {"username": username}
        if refs is not None:
            extra["tg_msgs"] = refs
        sp = SubscriptionPayment(
            user_id=uid, tenant_id=tid, phone="0912345678", amount=50.0,
            provider="libyana", plan_id=plan.id, plan_name=plan.name_ar,
            status="pending", extra_data=extra,
        )
        db.add(sp)
        await db.commit()
        return uname, tid, uid, sp.id


_TWO_REFS = [{"chat_id": 7001, "message_id": 91},
             {"chat_id": 7002, "message_id": 92}]


async def test_panel_resolution_edits_every_admin_copy_verified(v10_seed, tg_edit):
    """موافقة اللوحة: كل نسخة إدارية تُحرَّر بنص sub_app الحرفي (تهريب HTML
    للباقة) ثم يُجرَّد كلاهما — نفس ترتيب مسار الويبهوك."""
    _payer, _tid, _uid, pid = await _seed_pending_sub(v10_seed, refs=_TWO_REFS)
    admin, _, _ = await v10_seed.platform_admin()
    await v10_seed.login(admin)

    r = await v10_seed.world.client.post("/api/admin/subscriptions",
                                         json={"id": pid, "status": "verified"})
    assert r.status_code == 200, r.text

    expected = (f"✅ <b>تم تأكيد الاشتراك</b> #{pid}\n"
                f"الباقة: مميز_&lt;فاخر&gt;\n"
                f"المستخدم: زاهر_تجربة")
    assert _edits(tg_edit) == [
        (7001, 91, expected), (7002, 92, expected)], tg_edit.calls
    assert _kbs(tg_edit) == [(7001, 91), (7002, 92)], tg_edit.calls

    from models import SubscriptionPayment
    async with v10_seed.world.sf() as db:
        assert (await db.get(SubscriptionPayment, pid)).status == "verified"


async def test_panel_resolution_reject_edits_with_reject_truth(v10_seed, tg_edit):
    """رفض اللوحة: نص sub_rej الصادق («تم رفض» — W7-H1 أصلح التهنئة) + تجريد."""
    _payer, _tid, _uid, pid = await _seed_pending_sub(v10_seed, refs=_TWO_REFS)
    admin, _, _ = await v10_seed.platform_admin()
    await v10_seed.login(admin)

    r = await v10_seed.world.client.post("/api/admin/subscriptions",
                                         json={"id": pid, "status": "cancelled"})
    assert r.status_code == 200, r.text

    expected = (f"❌ <b>تم رفض طلب الاشتراك</b> #{pid}\n"
                f"الباقة: مميز_&lt;فاخر&gt;\n"
                f"المستخدم: زاهر_تجربة")
    assert _edits(tg_edit) == [
        (7001, 91, expected), (7002, 92, expected)], tg_edit.calls
    assert _kbs(tg_edit) == [(7001, 91), (7002, 92)]
    for _chat, _mid, text in _edits(tg_edit):
        assert "تم تأكيد" not in text, "rejection must never congratulate"


async def test_panel_resolution_without_refs_is_silent_and_still_200(v10_seed, tg_edit):
    """دفعة قديمة بلا مراجع (كل ما أُنشئ قبل W7-I-A): القرار 200 وعدم أي
    نداء تليجرام — الصفوف القديمة تُحيَّد، لا تُكسر."""
    _payer, _tid, _uid, pid = await _seed_pending_sub(v10_seed, refs=None)
    admin, _, _ = await v10_seed.platform_admin()
    await v10_seed.login(admin)

    r = await v10_seed.world.client.post("/api/admin/subscriptions",
                                         json={"id": pid, "status": "verified"})
    assert r.status_code == 200, r.text
    assert tg_edit.calls == [], tg_edit.calls


async def test_panel_resolution_survives_telegram_client_error(v10_seed, tg_edit):
    """عميل تليجرام يرمي: القرار ينجح 200 والحسم خالد في القاعدة — فشل
    المزامنة يُسجَّل فقط (لوحة الإدارة لا تُفشِلها تليجرام أبدًا)."""
    _payer, _tid, _uid, pid = await _seed_pending_sub(v10_seed, refs=_TWO_REFS)
    admin, _, _ = await v10_seed.platform_admin()
    await v10_seed.login(admin)

    async def exploding(chat_id, message_id, text):
        raise RuntimeError("telegram down")

    tg_edit.monkeypatch.setattr("telegram_bot.edit_message", exploding)

    from models import SubscriptionPayment
    r = await v10_seed.world.client.post("/api/admin/subscriptions",
                                         json={"id": pid, "status": "verified"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "verified"
    async with v10_seed.world.sf() as db:
        assert (await db.get(SubscriptionPayment, pid)).status == "verified"


# ── (4) إلغاء المستخدم الذاتي: نص صادق يميّز الإلغاء عن قرار الإدارة ────────


async def test_user_cancel_syncs_admin_copies_truthfully(v10_seed, tg_edit):
    """المستخدم يسحب طلبه → نسخ الأدمن تُحرَّر بـ«🚫 أُلغي … ألغى المستخدم
    هذا الطلب بنفسه» + تجريد الأزرار — لا «✅» ولا «رفض» تُوهم بقرار إدارة."""
    owner, tid, _uid, pid = await _seed_pending_sub(v10_seed, refs=_TWO_REFS)
    v10_seed.auth(owner, tid)

    r = await v10_seed.world.client.post("/api/subscriptions/cancel",
                                         json={"payment_id": pid})
    assert r.status_code == 200, r.text

    expected = (f"🚫 <b>أُلغي طلب الاشتراك</b> #{pid}\n"
                f"الباقة: مميز_&lt;فاخر&gt;\n"
                f"المستخدم: زاهر_تجربة\n"
                f"ألغى المستخدم هذا الطلب بنفسه")
    assert _edits(tg_edit) == [
        (7001, 91, expected), (7002, 92, expected)], tg_edit.calls
    assert _kbs(tg_edit) == [(7001, 91), (7002, 92)]
    for _chat, _mid, text in _edits(tg_edit):
        assert "تم رفض" not in text and "تم تأكيد" not in text


async def test_user_cancel_without_refs_stays_silent(v10_seed, tg_edit):
    """إلغاء طلب بلا مراجع (قديم): 200 وعدم أي نداء — عقد الرشاقة نفسه."""
    owner, tid, _uid, pid = await _seed_pending_sub(v10_seed, refs=None)
    v10_seed.auth(owner, tid)
    r = await v10_seed.world.client.post("/api/subscriptions/cancel",
                                         json={"payment_id": pid})
    assert r.status_code == 200, r.text
    assert tg_edit.calls == [], tg_edit.calls


# ── (5) عائلة pay_: بُناة النصوص بالنص الحرفي لمسار الويبهوك ────────────────


def test_pay_resolution_edit_texts_match_webhook_family():
    """نصوص الشحن مطابقة بايت-بايت لنصوص مسار أزرار تليجرام (b172fa1) —
    المرآة تصير بالبناء المشترك، لا بالنسخ القابل للانحراف."""
    from telegram_bot import pay_resolution_edit_text

    assert pay_resolution_edit_text(26, 19, "أحمد", confirmed=True) == (
        "✅ <b>تم تأكيد الدفع</b> #26\nالمبلغ: 19 د.ل\nالمستخدم: أحمد")
    assert pay_resolution_edit_text(26, 29.5, "أحمد", confirmed=False) == (
        "❌ <b>تم رفض الدفع</b> #26\nالمبلغ: 29.5 د.ل\nالمستخدم: أحمد")


def test_sync_helper_is_defensive_against_corrupt_refs():
    """مراجع فاسدة (غير قاموس/بلا معرفات) تُتخطى بصمت — لا استثناء يتسرب
    أبداً إلى إجراء اللوحة."""
    import telegram_bot

    seen: list = []

    async def fake_edit(chat_id, message_id, text):
        seen.append((chat_id, message_id))

    async def fake_kb(chat_id, message_id):
        pass

    import asyncio

    orig_edit, orig_kb = telegram_bot.edit_message, telegram_bot.edit_keyboard
    telegram_bot.edit_message, telegram_bot.edit_keyboard = fake_edit, fake_kb
    try:
        synced = asyncio.run(telegram_bot.sync_resolution_to_admins(
            ["junk", {}, {"chat_id": 1}, {"message_id": 5},
             {"chat_id": 2, "message_id": 6}], "نص"))
    finally:
        telegram_bot.edit_message, telegram_bot.edit_keyboard = orig_edit, orig_kb
    assert synced == 1
    assert seen == [(2, 6)]


# ── (6) الترحيلة 020: السلسلة + شفاء شكل legacy ──────────────────────────


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    """قاعدة sqlite معزولة + توجيه settings الفعلي والبيئة إليها (نمط
    test_p21w7_fk_validate.py — قاعدة الجنات المشتركة لا تُلمس)."""
    from config import settings

    db_path = tmp_path / "w7i_sync.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.setattr(settings, "DATABASE_POOLED_URL", "")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DATABASE_POOLED_URL", "")
    return db_path


def test_chain_reaches_020_with_payment_requests_extra_data(fresh_db):
    """السلسلة 001→head: الرأس 020 وpayment_requests.extra_data موجود —
    تفويض reconcile (نمط 007) يشفي العمود على قواعد السلسلة."""
    import sqlalchemy as sa
    from alembic.config import Config as AlembicConfig

    from alembic import command

    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(_ALEMBIC_DIR))
    command.upgrade(cfg, "head")

    con = sqlite3.connect(fresh_db)
    try:
        assert con.execute(
            "SELECT version_num FROM alembic_version").fetchone()[0] == "020"
    finally:
        con.close()

    from sqlalchemy import create_engine

    engine = create_engine(f"sqlite:///{fresh_db}")
    try:
        with engine.connect() as conn:
            cols = {c["name"] for c in sa.inspect(conn).get_columns("payment_requests")}
    finally:
        engine.dispose()
    assert "extra_data" in cols, cols


def test_reconcile_heals_legacy_payment_requests_without_extra_data(tmp_path):
    """شكل legacy (payment_requests بلا extra_data — إنتاج Neon قبل W7-I-A):
    شبكة الإقلاع reconcile_schema تضيف العمود — الحزام الذي يشفي حتى لو
    تُركت السلسلة (idempotent: الإعادة no-op)."""
    from _schema_reconcile import reconcile_schema
    from sqlalchemy import create_engine

    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "CREATE TABLE payment_requests ("
                " id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL,"
                " username VARCHAR(100), amount NUMERIC(10,3) NOT NULL,"
                " provider VARCHAR(20), phone VARCHAR(50),"
                " reference VARCHAR(100), status VARCHAR(20),"
                " note VARCHAR(500), created_at DATETIME,"
                " updated_at DATETIME)")
        with engine.begin() as conn:
            added = reconcile_schema(conn)
        assert "payment_requests.extra_data" in added, added
        # idempotent: إعادة التشغيل لا تضيف شيئًا لهذا الجدول
        with engine.begin() as conn:
            added2 = reconcile_schema(conn)
        assert "payment_requests.extra_data" not in added2, added2
    finally:
        engine.dispose()
