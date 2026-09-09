from __future__ import annotations

"""v18-1-d — بوابة قابلية رصد إشعارات تليجرام (متانة القناة الميتة).

الخلل المؤكد (تقرير المنسق): عندما يكون bot_token والمستلمون فارغين —
حالة الإنتاج المرجحة — كانت notify_* تكرّر حلقة فارغة بصمت تام: صفر رسائل،
صفر سجلات، صفر أخطاء. يدفع العميل → لا إشعار → لا موافقة → طلب معلق للأبد.

هذه البوابة تُثبت العقد الجديد:

  [x] العقد الملخص: notify_admins_new_payment/_subscription/_support تعيد
        {"sent": n, "failed": m, "recipients": k, "skipped_no_config": bool}
        (+ payment_id حيث يُعرف) — بلا استثناء أبداً في حالة «السكب».
  [x] تحذير واحد قابل للgrep لكل نداء عند السكب:
        "telegram notify skipped: no bot token configured (kind=…)"
        "telegram notify skipped: zero admin recipients (kind=…)"
  [x] عدّ sent/failed بدقة عبر httpx مُحاكى — sent = فقط ما أقرّه تليجرام
        ({"ok": true})؛ failed = فشل بعد إعادة المحاولة الواحدة.
  [x] إعادة المحاولة الواحدة: timeout/5xx → محاولة ثانية بعد 0.5s
        (مصفّرة في الاختبار)؛ 4xx لا يُعاد (خطأ تهيئة لا ومضة).
  [x] أزرار inline (callback_data للموافقة/الرفض) تبقى في الحِمل كما هي.
  [x] مسار الدفع (wallet._notify_admins_inline) يسجّل سطر الحكم القابل
        للgrep الذي سيراه المنسق في سجلات Vercel:
        "telegram payment notify: sent=1 failed=0 recipients=1"
        "telegram subscription notify: SKIPPED — no config (payment_id=15)"

Hermetic: لا شبكة ولا قاعدة بيانات — httpx.post وget_bot_token و
get_admin_ids كلها monkeypatched.
"""

import asyncio
import logging
import os
import sys
import time

import httpx
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir)))

VALID_TOKEN = "123456789:AAHfiqksKZ8WmoMTsD2ky9KzR7pZ5c5c9"
ADMIN_A, ADMIN_B = 111, 222


@pytest.fixture
def tg(monkeypatch):
    """telegram_bot مع عدّاد نداءات httpx قابل للبرمجة وتأخير إعادة محاولة صفري."""
    import telegram_bot

    monkeypatch.setattr(telegram_bot, "_RETRY_DELAY_S", 0.0)

    calls: list[dict] = []

    def fake_post(url, json=None, timeout=None):
        calls.append({"url": url, "json": json, "timeout": timeout})
        return httpx.Response(200, json={"ok": True, "result": {"message_id": len(calls)}})

    monkeypatch.setattr(telegram_bot.httpx, "post", fake_post)

    def set_post(handler):
        """استبدال سلوك httpx.post عبر monkeypatch (يُستعاد تلقائياً بعد الاختبار)."""
        monkeypatch.setattr(telegram_bot.httpx, "post", handler)

    async def set_state(token: str, admin_ids: list[int]):
        async def fake_token():
            return token

        async def fake_admins():
            return list(admin_ids)

        monkeypatch.setattr(telegram_bot, "get_bot_token", fake_token)
        monkeypatch.setattr(telegram_bot, "get_admin_ids", fake_admins)
        calls.clear()

    from types import SimpleNamespace
    return SimpleNamespace(mod=telegram_bot, calls=calls, set_state=set_state,
                           set_post=set_post)


# ── العقد الملخص في حالة «القناة الميتة» (production reality) ───────────────


async def test_telegram_notify_zero_recipients_returns_skipped_contract(tg, caplog):
    """قائمة مستلمين فارغة + توكن موجود: لا استثناء، عقد السكب كامل، وتحذير
    واحد قابل للgrep — النمط الحرفي الذي كان يمر بصمت تام قبل v18-1-d."""
    await tg.set_state(token=VALID_TOKEN, admin_ids=[])
    with caplog.at_level(logging.WARNING, logger="fb-tg"):
        result = await tg.mod.notify_admins_new_payment(
            15, "diagtest1788962199", 50, "liyana", "0911111111")
    assert result["sent"] == 0
    assert result["failed"] == 0
    assert result["recipients"] == 0
    assert result["skipped_no_config"] is True
    assert result["payment_id"] == 15
    assert "telegram notify skipped: zero admin recipients" in caplog.text, caplog.text
    assert tg.calls == [], "no HTTP call may happen when the recipient list is empty"


async def test_telegram_notify_no_bot_token_returns_skipped_contract(tg, caplog):
    """توكن فارغ + مستلمون موجودون: نفس عقد السكب — recipients يُبلّغ عن
    العدد المحلول (تشخيص: «المشكلة في التوكن لا في قائمة المستلمين»)."""
    await tg.set_state(token="", admin_ids=[ADMIN_A, ADMIN_B])
    with caplog.at_level(logging.WARNING, logger="fb-tg"):
        result = await tg.mod.notify_admins_new_subscription(
            15, "diagtest1788962199", 50.0, "liyana", "0911111111", "احترافية")
    assert result["sent"] == 0
    assert result["failed"] == 0
    assert result["skipped_no_config"] is True
    assert result["recipients"] == 2
    assert result["payment_id"] == 15
    assert "telegram notify skipped: no bot token configured" in caplog.text, caplog.text
    assert tg.calls == []


async def test_telegram_notify_support_ticket_skipped_contract(tg, caplog):
    """notify_admins_support_ticket يتبع نفس العقد (kind=support)."""
    await tg.set_state(token="", admin_ids=[])
    with caplog.at_level(logging.WARNING, logger="fb-tg"):
        result = await tg.mod.notify_admins_support_ticket("موضوع", "نص التذكرة", "a@b.ly")
    assert result == {"sent": 0, "failed": 0, "recipients": 0, "skipped_no_config": True}
    assert "telegram notify skipped: no bot token configured" in caplog.text


# ── عدّ sent/failed عبر httpx مُحاكى — بما فيه إعادة المحاولة ────────────────


async def test_telegram_notify_counts_sent_and_preserves_buttons(tg):
    """توكن + مستلمان ناجحان: sent=2 failed=0، والأزرار تصل في الحِمل كما هي
    (موافقة/رفض بcallback_data — منطق النداءات غير مكسور)."""
    await tg.set_state(token=VALID_TOKEN, admin_ids=[ADMIN_A, ADMIN_B])
    result = await tg.mod.notify_admins_new_payment(
        33, "tester", 45, "madar", "0922222222")
    assert result == {"sent": 2, "failed": 0, "recipients": 2,
                      "skipped_no_config": False, "payment_id": 33}
    assert len(tg.calls) == 2
    for call in tg.calls:
        assert call["url"].startswith(f"https://api.telegram.org/bot{VALID_TOKEN}/sendMessage")
        assert call["timeout"] == tg.mod._HTTP_TIMEOUT_S, "10s timeout must be passed to httpx"
    payload = tg.calls[0]["json"]
    assert payload["chat_id"] == ADMIN_A
    assert payload["parse_mode"] == "Markdown"
    assert payload["reply_markup"]["inline_keyboard"] == [
        [{"text": "🟢 موافقة", "callback_data": "pay_app:33"}],
        [{"text": "🔴 رفض", "callback_data": "pay_rej:33"}],
    ], "approval buttons MUST reach Telegram unchanged"


async def test_telegram_notify_retry_recovers_from_transient_timeout(tg):
    """المستلم الثاني يفشل بtimeout في المحاولة الأولى ثم ينجح في الثانية:
    إعادة محاولة واحدة → sent=2، وعدد نداءات httpx = 3 (2 مستلم + 1 إعادة)."""
    attempts_b = {"n": 0}

    def flaky_post(url, json=None, timeout=None):
        tg.calls.append({"url": url, "json": json, "timeout": timeout})
        if json["chat_id"] == ADMIN_B:
            attempts_b["n"] += 1
            if attempts_b["n"] == 1:
                raise httpx.ReadTimeout("read timed out")
        return httpx.Response(200, json={"ok": True})

    tg.set_post(flaky_post)
    await tg.set_state(token=VALID_TOKEN, admin_ids=[ADMIN_A, ADMIN_B])
    result = await tg.mod.notify_admins_new_payment(
        7, "tester", 50, "liyana", "0911111111")
    assert result["sent"] == 2
    assert result["failed"] == 0
    assert result["recipients"] == 2
    assert len(tg.calls) == 3, "exactly ONE retry per recipient was expected"
    assert attempts_b["n"] == 2


async def test_telegram_notify_retry_recovers_from_http_503(tg):
    """5xx يعامل كومضة قابلة لإعادة المحاولة: 503 ثم 200 → sent=1."""
    attempts = {"n": 0}

    def flaky_post(url, json=None, timeout=None):
        tg.calls.append({"url": url, "json": json, "timeout": timeout})
        attempts["n"] += 1
        if attempts["n"] == 1:
            return httpx.Response(503, text="upstream overload")
        return httpx.Response(200, json={"ok": True})

    tg.set_post(flaky_post)
    await tg.set_state(token=VALID_TOKEN, admin_ids=[ADMIN_A])
    result = await tg.mod.notify_admins_new_subscription(
        9, "tester", 50.0, "liyana", "0911111111", "احترافية")
    assert result["sent"] == 1 and result["failed"] == 0
    assert len(tg.calls) == 2


async def test_telegram_notify_retry_exhausted_counts_failed(tg):
    """فشل المؤقت في المحاولتين (timeout ثم timeout) → failed=1 بدقة —
    إعادة محاولة واحدة فقط، لا حلقة لا نهائية."""
    def always_timeout(url, json=None, timeout=None):
        tg.calls.append({"url": url, "json": json, "timeout": timeout})
        raise httpx.ConnectTimeout("connect timed out")

    tg.set_post(always_timeout)
    await tg.set_state(token=VALID_TOKEN, admin_ids=[ADMIN_A])
    result = await tg.mod.notify_admins_new_payment(5, "t", 10, "liyana", "091")
    assert result == {"sent": 0, "failed": 1, "recipients": 1,
                      "skipped_no_config": False, "payment_id": 5}
    assert len(tg.calls) == 2, "ONE retry only — never more"


async def test_telegram_notify_no_retry_on_client_error(tg):
    """4xx (توكن خاطئ/محظور) ليس ومضة: محاولة واحدة فقط ثم failed=1."""
    def forbidden(url, json=None, timeout=None):
        tg.calls.append({"url": url, "json": json, "timeout": timeout})
        return httpx.Response(403, json={"ok": False, "description": "Forbidden: bot was blocked"})

    tg.set_post(forbidden)
    await tg.set_state(token=VALID_TOKEN, admin_ids=[ADMIN_A])
    result = await tg.mod.notify_admins_new_payment(6, "t", 10, "liyana", "091")
    assert result["sent"] == 0 and result["failed"] == 1
    assert len(tg.calls) == 1, "4xx must NOT be retried"


async def test_telegram_notify_ok_false_response_is_not_sent(tg, caplog):
    """200 لكن {"ok": false} (رد غير معتاد من تليجرام) لا يُعدّ sent —
    العقد: sent = ما أقرّه تليجرام فعلاً بok:true."""
    def weird(url, json=None, timeout=None):
        tg.calls.append({"url": url, "json": json, "timeout": timeout})
        return httpx.Response(200, json={"ok": False, "description": "chat not found"})

    tg.set_post(weird)
    await tg.set_state(token=VALID_TOKEN, admin_ids=[ADMIN_A, ADMIN_B])
    with caplog.at_level(logging.WARNING, logger="fb-tg"):
        result = await tg.mod.notify_admins_new_payment(8, "t", 10, "liyana", "091")
    assert result["sent"] == 0 and result["failed"] == 2
    assert "telegram notify send failed" in caplog.text


async def test_telegram_notify_send_message_contract_unchanged(tg):
    """send_message يبقى dict|None (يستخدمه _observability و/telegram/test):
    نجاح → dict، توكن فارغ → None — عقد ما قبل v18 محفوظ."""
    await tg.set_state(token=VALID_TOKEN, admin_ids=[ADMIN_A])
    resp = await tg.mod.send_message(ADMIN_A, "نص")
    assert isinstance(resp, dict) and resp.get("ok") is True
    await tg.set_state(token="", admin_ids=[])
    assert await tg.mod.send_message(ADMIN_A, "نص") is None


# ── سطر الحكم في مسار الدفع (wallet._notify_admins_inline) ─────────────────


async def test_telegram_notify_inline_logs_verdict_line(monkeypatch, caplog):
    """النجاح: سطر واحد قابل للgrep بصيغة التنسيق المتفق عليها حرفياً —
    «telegram payment notify: sent=1 failed=0 recipients=1»."""
    from routers.payments.wallet import _notify_admins_inline

    async def notify_admins_new_payment():
        return {"sent": 1, "failed": 0, "recipients": 1,
                "skipped_no_config": False, "payment_id": 15}

    with caplog.at_level(logging.INFO, logger="fb-api"):
        await _notify_admins_inline(notify_admins_new_payment())
    assert "telegram payment notify: sent=1 failed=0 recipients=1" in caplog.text, caplog.text


async def test_telegram_notify_inline_logs_skipped_no_config_line(caplog):
    """السكب: «telegram subscription notify: SKIPPED — no config (payment_id=15)»
    — السطر الذي سيكشف القناة الميتة في سجلات Vercel الحية."""
    from routers.payments.wallet import _notify_admins_inline

    async def notify_admins_new_subscription():
        return {"sent": 0, "failed": 0, "recipients": 0,
                "skipped_no_config": True, "payment_id": 15}

    with caplog.at_level(logging.WARNING, logger="fb-api"):
        await _notify_admins_inline(notify_admins_new_subscription())
    assert "telegram subscription notify: SKIPPED — no config (payment_id=15)" in caplog.text, caplog.text


async def test_telegram_notify_inline_end_to_end_verdict_from_real_notify(tg, caplog):
    """السلسلة الحقيقية كاملة (بلا شبكة): wallet inline + notify_admins_new_payment
    الفعلية + httpx مُحاكى → سطر الحكم الصحيح يُسجّل مرة واحدة."""
    from routers.payments.wallet import _notify_admins_inline

    await tg.set_state(token=VALID_TOKEN, admin_ids=[ADMIN_A])
    with caplog.at_level(logging.INFO, logger="fb-api"):
        await _notify_admins_inline(
            tg.mod.notify_admins_new_payment(15, "diagtest", 50, "liyana", "0911"))
    assert "telegram payment notify: sent=1 failed=0 recipients=1" in caplog.text, caplog.text


async def test_telegram_notify_inline_legacy_none_return_stays_silent(caplog):
    """توافق رجعي: coroutine يعيد None (mock قديم/استدعاء آخر) → لا انهيار
    ولا سطر حكم — السلوك السابق محفوظ للنداءات غير المُحدّثة."""
    from routers.payments.wallet import _notify_admins_inline

    async def fake_notify():
        return None

    with caplog.at_level(logging.INFO):
        await _notify_admins_inline(fake_notify())  # must not raise
    assert "notify: sent=" not in caplog.text


async def test_telegram_notify_inline_timeout_is_capped_and_logged(caplog):
    """المهلة القصيرة تحمي زمن الرد (≤8s)، والسكب بعد المهلة يُسجّل سطر
    timeout قابل للgrep — ولا استثناء يتسرب للطالب."""
    from routers.payments.wallet import _notify_admins_inline

    async def notify_admins_new_payment():
        await asyncio.sleep(30)

    t0 = time.monotonic()
    with caplog.at_level(logging.WARNING, logger="fb-api"):
        await _notify_admins_inline(notify_admins_new_payment(), timeout=0.05)
    assert time.monotonic() - t0 < 5, "the short timeout must protect response time"
    assert "telegram payment notify: TIMEOUT" in caplog.text, caplog.text
