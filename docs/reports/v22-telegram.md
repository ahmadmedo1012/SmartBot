# تقرير المجال 7 — الإشعارات (تيليغرام + داخل التطبيق) — v22 (W1-D7 + FIX-B 4e25f0bc + التحقق الحي بعد الإصلاح)

- **Task ID:** W1-D7 (تشخيص) → FIX-B (إصلاح) → W2-FIN (تجميع التقرير + تحقق حي)
- **التشخيص:** `wave1-findings/W1-D7-telegram.md` (2026-09-10 12:40 UTC، إنتاج commit 54452f32)
- **الإصلاح:** commit **`4e25f0bc`** — `fix(v22-D7): telegram notifications — HTML escaping + plain-text fallback (silent-loss class) + approval in-app parity` — **مُنشر على الإنتاج** (origin/main؛ تحقق /api/version عند الدفع)
- **تحقق حي إضافي (W2-FIN):** 2026-09-10 14:40 UTC على commit 0b0bc205 (سليل 4e25f0bc)

---

## الملخص

| المسار | نتيجة W1-D7 | النتيجة بعد الإصلاح | الدليل |
|---|---|---|---|
| إشعار اشتراك/شحن/تذكرة → تيليغرام | ⚠️ يعمل **فقط** لمحتوى بلا محارف Markdown | **PASS** — تهريب HTML + fallback نص خام | FIX-B + سطور sent=0 (قبل) |
| فقدان صامت لرسائل المعتمد (400 can't parse entities) | **FAIL — علة صفّية HIGH** | **PASS** ✅ | إصلاح من طبقتين أدناه |
| أزرار الموافقة/الرفض عبر تيليغرام | ❌ مكسور معماريًا (webhook يشير إلى menu.smart-link.ly + fail-closed بلا سر) | **PASS** ✅ | إعادة توجيه webhook إلى api.smart-link.ly مع TELEGRAM_WEBHOOK_SECRET |
| تكافؤ إشعار داخل التطبيق عند الحسم عبر تيليغرام | ⚠️ فجوة (sub_app لا يُشعِر المستخدم) | **PASS** ✅ | push_notification مُرآة من approvals.py + صف 20 حيًا |
| إشعار داخل التطبيق (feed/UI/قراءة) | PASS | PASS | W1-D7 §6 (صف 19 + لقطة UI) |
| تنبيه 500 + تقادم النبض | ⚠️ معرض لعطل Markdown | **PASS** (طبقة `_call` تشمل `telegram_alert`) | FIX-B: الفallback في `_call` يغطي كل المرسلين |
| bot_alerts شبه ميت / TelegramBroadcastTarget بلا مرسل | ⚠️ | موثّق (خارج نطاق FIX-B) | W1-D7 §7 |

---

## 1) العلة الصفّية (HIGH) — فقدان إشعارات المعتمد صامتًا

**ما اختُبر (W1-D7):** كل بيانات المستخدم (username/phone/plan/subject/email/body) كانت تُسلسل خامًا في حمولة `parse_mode:"Markdown"` — أي `_` غير موزونة تفتح كيانًا غير مغلق → تيليغرام يرفض الرسالة (400 «can't parse entities») → `sent=0 failed=1` والمستخدم لا يرى شيئًا والدفع معلق بلا إشعار.

**الدليل (قبل الإصلاح، سجلات Vercel dpl_22MsyM4U):**
```
telegram sendMessage failed: HTTP 400 {"error_code":400,
  "description":"Bad Request: can't parse entities: Can't find end of the entity starting at byte offset 67"}
telegram subscription notify: sent=0 failed=1 recipients=1      ← دفعات #26/#28 (username يحوي `_`)
telegram support notify: sent=0 failed=1                        ← تذاكر 3/4/5/8 (بريد/موضوع فيه `_`)
```

**الإصلاح (4e25f0bc — طبقتان، حزام + حمّامات):
1. `parse_mode` أصبح **HTML** + `escape_user_text` (html.escape، quote=False — نمط aiogram `HtmlDecoration.quote`) على **كل** حقل يتحكم به المستخدم؛ العناوين `<b>…</b>`؛ الأزرار كما هي.
2. حزام أمان في `_call`: أي رد 400 «can't parse entities» → إعادة محاولة واحدة بنفس الحمولة **بلا parse_mode** (نص خام، الأزرار محفوظة) — عمق محدود 2، يغطي sendMessage وeditMessageText وكل مستدعٍ (بما فيها `telegram_alert` في _observability). كلتا المحاولتين تُسجَّلان.

**النتيجة:** **PASS** — فئة «الإشعار يضيع صامتًا» مغلقة بالاختبارات (سويت FIX-B) وبالكود المسار واحد لكل أنواع الإشعارات.

## 2) قناة حسم الدفعات عبر تيليغرام — من معماريًا مكسور إلى E2E حي

**ما اختُبر (W1-D7):** البوت `@Smart_link_0_bot` كان عليه webhook نحو `menu.smart-link.ly` (منتج Smart-Menu القديم — منشور مختلف) وأزرار 🟢/🔴 كانت «زخرفية»: الضغط يذهب للتطبيق القديم ولا يصل SmartBot أبدًا؛ و`/api/telegram/webhook` كان fail-closed بلا `TELEGRAM_WEBHOOK_SECRET` (403 لكل شيء).

**الإصلاح (تشغيلي + FIX-B):**
- تفعيل `TELEGRAM_WEBHOOK_SECRET` في بيئة `smart-bot-api` (نشر FIX-B فعّله)؛
- إعادة توجيه webhook البوت من `menu.smart-link.ly` إلى **`https://api.smart-link.ly/api/telegram/webhook`** مع `secret_token`.

**الدليل الحي (بعد الإصلاح):**
```
# سر خاطئ (W2-FIN probe، 2026-09-10 14:40 UTC):
POST /api/telegram/webhook  X-Telegram-Bot-Api-Secret-Token: WRONG-secret-probe
→ HTTP 403 {"detail":"Forbidden"}                          ✅ fail-closed مسلّح
# السر الصحيح (تنسيق المنسّق): {"ok":true}               ✅ (من سجل FIX-RECOVERY)
```

**E2E الموافقة الحي (من FIX-RECOVERY، 2026-09-10):** callback محاكى من المعتمد المسجل (from.id=6926512460 «Ahmed») بـ `data="sub_app:29"`:
- الدفعة 29 (v22d5_z9jscc، 29 د.ل بنكي): **pending → verified**؛
- المستأجر 36: FREE → **PAID, plan_id=3, plan_end=2026-10-10** (SELECT: `tenants.id=36 plan_id=3 subscription_status='PAID'`)؛
- المستخدم 37: **PAID, plan_id=3**؛
- إشعار داخل التطبيق **id=20** «تم تأكيد الدفع وتفعيل الاشتراك» (type=payment, tenant 36 — SELECT) — تكافؤ FIX-B (مسار sub_app يستدعي push_notification مرآة approvals.py) يعمل حيًا.

**النتيجة:** **PASS** — أزرار الموافقة صارت طريقًا تشغيليًا فعليًا مع بوابة السر، والحسم الذرّي يمنع الازدواج (double-tap → معالجة واحدة).

## 3) بنود التشخيص المتبقية (تثبيت الحالة)

| البند | ما اختُبر | الدليل | النتيجة |
|---|---|---|---|
| هوية البوت + القناة | getMe/getChat | W1-D7 §1/§2 | PASS (SmartLink Group + خاص المعتمد 6926512460 — متلقٍّ واحد بالتصميم) |
| إشعار داخل التطبيق | حملة → صف 19 → UI قراءة | W1-D7 §6 + لقطة d7-notifications-ui.png | PASS |
| تنبيه تقادم النبض | كود + نبض طازج | ledger `cron_last_heartbeat=2026-09-10T14:35:12` (SELECT حي) | PASS — النبض طازج دائمًا |
| bot_alerts (0 صفوف، كاتب يدوي فقط) | grep + SELECT | W1-D7 §7 | **موثّق — توصية**: توصيل report_critical بكتابة BotAlert أو إسقاط الجدول |
| TelegramBroadcastTarget (CRUD بلا مرسل) | grep + SELECT (0 صفوف) | W1-D7 | **موثّق** — توصية: دمج الأهداف في _notify_admins أو إزالة الواجهة |

## 4) حدود الانحدار

- سويت تيليغرام التاريخية: `test_telegram_notify_v18` (15) + `test_v11_telegram` + `test_v17_telegram_users` + `test_world_class_v3` — كلها خضراء بعد 4e25f0bc (سجل FIX-RECOVERY: 1002/1002).
- إعادة تشغيل كاملة بعد W2-FIN: **1014 passed / 0 failed** (يشمل 12 اختبار inbox جديدًا — لا علاقة بالمجال، صفر انحدار).

## 5) أدوات OSS جرى استعراضها

- **aiogram** (HtmlDecoration.quote) — نمط التهريب المعتمد في الإصلاح.
- **python-telegram-bot** — بديل واعٍ لإطار الاستلام (بقي webhook الخاص بنا: أقل اعتمادًا، نفس فئة الأمان).
- سجل مفصل: `docs/reports/v22-tooling-used.md`.
