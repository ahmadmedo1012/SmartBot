# v17-E-B3 — خلفية: صدق النصوص والتفضيلات (BACKEND-TRUTH-COPY)

> **Task ID:** v17-E-B3 · **النوع:** وكيل تنفيذ · **الأساس:** خطة v17 §E-B3 + `audit-reports/v17-D9-arabic-copy.md` (بند 5-ج/2 + الأخطر 10 #3) + `audit-reports/v17-D5-dead-controls.md` (F3)
> **الملكية المنفَّذة:** `fb_dashboard/routers/facebook_routes.py` (السطران 202 و274 فقط — انزاحا إلى 202-207 و278-284 بعد التحرير) · `fb_dashboard/routers/onboarding.py` (السطر 225 فقط — انزاح إلى 223-231) · **ملف محرك الإشعارات المحدَّد بالبحث:** `rg "def push_notification" fb_dashboard/` → `fb_dashboard/routers/notifications.py:25` (لا وكيل آخر في الخطة يملكه — الملكية رُتِّبت هنا) · `tests/test_v17_backend_truth.py` (جديد)

---

## 1) الملخص التنفيذي

| # | المهمة | الحالة | الدليل |
|---|---|---|---|
| 1 | إزالة str(e) الإنجليزية (D9 #3) — المواضع الثلاثة | ✅ منفَّذ | §2 أدناه — رسالة عربية ثابتة في detail + النص التقني إلى `log.warning` (لا حذف للتسجيل — التسجيل أُنشئ حيث لم يكن) |
| 2 | مستهلك تفضيلات الإشعارات (D5-F3) | ✅ منفَّذ للمسار الموجَّه ل مستخدم + **سقف موثَّق** لمسار بث المستأجر | §3 — البوابة داخل `push_notification` (نقطة التسليم الوحيدة لقاعدة الإشعارات) + اقتراح الحل الجذري للمنسّق |
| 3 | الاختبارات (أ/ب/ج) | ✅ 5 اختبارات خضراء | §4 — `tests/test_v17_backend_truth.py` |

**بوابات التسليم (أدلة حرفية):**

```
$ DATABASE_URL="sqlite+aiosqlite:///:memory:" SECRET_KEY=test-secret CRON_SECRET=test-cron-secret FB_ACCESS_TOKEN=test-token FB_PAGE_ID=0 .venv/bin/python -m pytest tests/test_v17_backend_truth.py -q
5 passed, 13 warnings in 9.11s

$ .venv/bin/ruff check fb_dashboard/routers/facebook_routes.py fb_dashboard/routers/onboarding.py
All checks passed!

$ .venv/bin/ruff check fb_dashboard/routers/notifications.py tests/test_v17_backend_truth.py
All checks passed!
```

---

## 2) إزالة str(e) — المواضع الثلاثة (D9 #3)

### 2-أ) `facebook_routes.py` — PUT /api/facebook/settings (فشل اشتراك الويبهوك)

قبل (السطر 202 كما في D9):
```python
except Exception as e:
    webhook_result = {"error": str(e)[:200]}
```

بعد:
```python
except Exception as e:
    # v17-E-B3 (D9 #3): the Graph API's English error text never
    # reaches the user — technical detail goes to the log, the
    # payload carries a fixed Arabic message.
    log.warning("webhook subscribe failed (tenant=%s page=%s): %s",
                tenant_id, page_id[:40], str(e)[:300])
    webhook_result = {"error": "تعذر تفعيل الويبهوك — تحقق من رمز الوصول ومعرف الصفحة"}
```

- الرسالة **سياقية**: هذا المسار يفشل تحديدًا في خطوة «اشتراك الويبهوك بعد الحفظ» — الرسالة تسمّي الخطأ بالاسم (تفعيل الويبهوك) وتوجّه للسببين الفعليين (رمز الوصول/معرف الصفحة)، لا رسالة عامة.
- `log` كان موجودًا في الملف (`log = logging.getLogger("fb-api")` السطر 29) — النص التقني انتقل إليه بلا أي حذف تسجيل (التسجيل هنا كان غائبًا أصلًا — أُضيف).
- الحمولة تصل إلى `ok({... "webhook": webhook_result ...})` — الشكل `{"error": ...}` محفوظ كما هو (عقد الاستجابة لم يتغير).

### 2-ب) `facebook_routes.py` — POST /api/facebook/test (اختبار الاتصال)

قبل (السطر 274 كما في D9):
```python
except Exception as e:
    return ok({"connected": False, "fan_count": 0, "error": str(e)[:200]})
```

بعد:
```python
except Exception as e:
    # v17-E-B3 (D9 #3): English exception text never reaches the user (the
    # connect page renders td.error in errorMsg + toast) — log it instead.
    log.warning("facebook connection test failed (tenant=%s page=%s): %s",
                tenant_id, page_id[:40], str(e)[:300])
    return ok({"connected": False, "fan_count": 0,
               "error": "فشل الاتصال بفيسبوك — تحقق من رمز الوصول ومعرف الصفحة"})
```

- هذه هي القيمة التي تعرضها الواجهة حرفيًا في `errorMsg` + toast (`connect/page.tsx107-108`: `td.error || "فشل الاتصال — تحقق من رمز الوصول والصفحة"`) — الرسالة الثابتة الآن تحمل نفس عائلة المصطلحات (فشل/رمز الوصول/الصفحة) فلا تنكسر سلسلة النبرة مع الاحتياطي.
- قناة D9 المسجلة (`connect:107-108`) مغلقة من المصدر.

### 2-ج) `onboarding.py` — POST /api/onboarding/test-connection

قبل (السطر 225 كما في D9):
```python
except Exception as e:
    # v12-E2.11: ok() envelope (see above)
    return ok({"connected": False, "error": f"تعذر الاتصال بفيسبوك: {str(e)[:150]}"})
```

بعد:
```python
except Exception as e:
    # v12-E2.11: ok() envelope (see above)
    # v17-E-B3 (D9 #3): the English exception detail never reaches the
    # wizard (OnboardingWizard renders testResult.error) — it goes to the
    # log, the payload carries a fixed Arabic message.
    log.warning("onboarding test-connection failed (tenant=%s page=%s): %s",
                current_user._tenant_id, page_id[:40], str(e)[:300])
    return ok({"connected": False,
               "error": "تعذر الاتصال بفيسبوك — تحقق من اتصالك بالإنترنت ثم أعد المحاولة"})
```

- هذا الفرع يلتقط **استثناءات الشبكة** (httpx: انقطاع/DNS/مهلة) — لذا الرسالة الثابتة تتحدث عن الاتصال بالإنترنت وإعادة المحاولة (دقيقة للسياق، ليست عامة).
- `log = logging.getLogger("fb-onboarding")` كان موجودًا في الملف (السطر 38) — النص التقني انتقل إليه.
- القيمة تُعرض للمستخدم في `OnboardingWizard.tsx:444` (`"✗ " + testResult.error`) — القناة مغلقة.

### 2-د) ما لم يُمس (انضباط الملكية)

- `onboarding.py:219` — `"error": f"فشل التحقق من فيسبوك: {detail or r.status_code}"` يمرر **رسالة Graph API الإنجليزية** (`detail`) في مسار «الاستجابة 200 غير ناجحة». **خارج ملكيتي (السطر 225 فقط)** — أُبلغ عنه هنا للمنسّق: نفس نمط D9 #3 ويحتاج نفس المعالجة (نص تقني إلى log + عربية ثابتة). مساره الظاهر: OnboardingWizard.tsx:444 أيضًا.
- لا حذف لأي تسجيل قائم — التسجيل في المواضع الثلاثة كان غائبًا (str(e) يذهب للمستخدم مباشرة) وأُنشئ `log.warning` في كل موضع.

---

## 3) مستهلك تفضيلات الإشعارات (D5-F3) — المنفَّذ + السقف الموثَّق

### 3-أ) التشخيص البنيوي (لماذا push_notification هي نقطة التسليم الوحيدة)

1. `rg "def push_notification" fb_dashboard/` → **موضع واحد**: `routers/notifications.py:25`.
2. `rg "Notification\(" fb_dashboard/ --type py` → **كاتب واحد لجدول الإشعارات**: `notifications.py:32` داخل `push_notification` نفسها. أي أن قاعدة الإشعارات الدائمة (التي تغذي `GET /api/notifications` وشارة غير المقروء) تُكتب من هذه الدالة حصرًا — البوابة هنا تغطي كل التسليم الدائم.
3. المتصلون السبعة: `support.py:230,253` (type `support`، مع `user_id`) · `payments/approvals.py:154,161` (type `payment`، مع `user_id=sp.user_id`) · `marketing.py:181,298` (type `marketing`، **بدون** user_id) · `bot_engine/engine.py:419` (type `payment`، **بدون** user_id). **لا متصل يستهلك القيمة المرجعة** (تأكيد rg) — تغيير الإرجاع إلى `None` عند التخطي آلف مع الجميع.
4. القنوات اللحظية (`ws_manager.broadcast_to_tenant` في bot.py/replies.py/pipeline.py) بثّ عرضي زائل لا يكتب صفوفًا — خارج وعد الصفحة (الشارة/القائمة من القاعدة الدائمة).

### 3-ب) التنفيذ

داخل `routers/notifications.py`:

```python
_PREF_KEY_BY_TYPE = {
    "payment": "payment_alerts",     # «تنبيهات الدفع — عند تأكيد أو رفض طلب دفع»
    "marketing": "marketing_reports", # «تقارير التسويق»
    "system": "system_updates",      # «تحديثات النظام»
}
```

- **خريطة النوع → المفتاح**: كل نوع إشعار له مفتاح تحكم حقيقي في صفحة الإعدادات يُستشار. الأنواع **بدون** مفتاح (support/reply/mention — لا مفتاحًا في الصفحة يدّعي التحكم بها) تُسلَّم بلا بوابة — هذا صادق وليس ثغرة: لا يوجد مفتاح وعد بها.
- `_preference_allows(db, user_id, type_)`: استعلام `NotificationPreference` للمستخدم؛ **بلا صف محفوظ → الافتراضيات نفسها التي تعرضها الصفحة** (`DEFAULT_NOTIF_PREFS` مستوردة من `alerts_routes.py` — المصدر الواحد للمخطط والافتراضيات؛ استيراد آلف: alerts_routes لا يستورد notifications فلا دورة).
- في `push_notification`: إذا كان `user_id` محددًا **و** التفضيل معطل → **لا يُنشأ صف** (تخطي التسليم) + سجل skip:

```python
if user_id is not None and not await _preference_allows(db, user_id, type_):
    log.info("notif skip (pref off): user=%s type=%s key=%s title=%r",
             user_id, type_, _PREF_KEY_BY_TYPE.get(type_, "-"), (title or "")[:60])
    return None
```

- **ما يُغلق فعليًا الآن**: مثال D5-F3 الحرفي («تعطيل تنبيهات الدفع لا يمنع وصول إشعار دفع») — إشعارات تأكيد/رفض الدفع (`approvals.py:154,161`، type `payment`، موجّهة لمستخدم) تخضع للبوابة: مستخدم أوقف «تنبيهات الدفع» لا يُنشأ له الصف أصلًا (لا قائمة، لا شارة غير مقروء).
- عزل المستخدمين: الاستعلام بـ `user_id` حصرًا — تفضيل مستخدم آخر (حتى في نفس المستأجر) لا يؤثر.
- لم يمسّ مسار القراءة (`list_notifications`): الصفوف المحجوبة لا تُنشأ أصلًا، فلا حاجة لفلترة القائمة — والعقد مع الواجهة بلا تغيير.

### 3-ج) السقف الموثَّق (يقرره المنسّق) — بثّ المستأجر (user_id=None)

**الحالة:** 3 من 7 مواضع استدعاء تُنشئ إشعارات **بدون** مستلم محدد: `marketing.py:181,298` (تأكيد إرسال الحملة) و`engine.py:419` (تحذير انتهاء الاشتراك). هذه صفوف في **قائمة مستأجر مشتركة**: `list_notifications` (notifications.py:49-54) تعرض كل صفوف المستأجر **بغض النظر عن user_id** — أي أن «التسليم» هنا مرئي لكل أعضاء المستأجر دفعة واحدة.

**لماذا لا يمكن حلها نظيفًا ببوابة بسيطة (السبب الدقيق):**
1. التفضيل **لكل مستخدم** (`NotificationPreference.user_id` + قيد `uq_notif_pref_user`) بينما الصف الواحد **لكل المستأجر** (`Notification.user_id` قابل للفراغ، والقراءة لا تفلتر به). لا يوجد «مستخدم» واحد يمكن أن يستشير البثّ صادقًا:
   - لو حجبنا البثّ عند تعطيل **أحد** الأعضاء → نحرم بقية الفريق (سلوك خاطئ متعدد المستخدمين).
   - لو حجبنا عند تعطيل **الجميع** → سلوك مُخترَع غير متسق مع أي وعد في الصفحة، ومتغير بتكوين الفريق.
   - لو حجبنا بتفضيل **المالك وحده** → تفضيلات بقية الأعضاء تصبح كذبة.
2. (خيار دُرِس ورُفض) «البوابة إن كان للمستأجر مستخدم واحد»: نصف حل يتغير سلوكه بحجم الفريق — عكس قاعدة الخطة («لا تخترع half-fix»).
3. ملاحظة دلالية إضافية: مفتاح `marketing_reports` وصفه في الصفحة «**ملخصات دورية** لأداء حملاتك» (ميزة ReportSchedule) وليس تأكيد الإرسال اللحظي — فربطه ببثّ الإرسال قرار منتج لا قرار تقني.

**الحل المقترح (للمنسّق، إن أراد إغلاق السقف):** fan-out لكل مستخدم في `push_notification` عند `user_id=None`: استعلام أعضاء المستأجر النشطين → إنشاء صف لكل عضو يسمح تفضيله (مع `user_id` لكل صف) + تحويل مسار القراءة إلى `WHERE tenant_id=? AND (user_id = :me OR user_id IS NULL)` (الصفوف القديمة ذات NULL تبقى مرئية للجميع — سياسة ترحيل لطيفة) + تقييد `read-all` بالمستخدم الحالي. هذا يصحح أيضًا ثغرة مجاورة (إشعار موجّه لمستخدم يظهر اليوم لكل زملائه في القائمة المشتركة). كلفته: تغيير نموذج قراءة + دلالات الشارة لكل مستخدم + اختبارات قراءة جديدة — تعديل معماري يستحق قرارًا مركزيًا لا ربطًا جانبيًا في مهمة نصوص.
**البديل الصفري المقبول:** نص الصفحة `notifications/page.tsx:377` («تُطبق على جميع المنصات») يُصحح في S2 ليعد بما ينفَّذ فعلاً (الإشعارات الموجّهة لك تخضع لتفضيلاتك) — كما تنص الخطة («نص الصفحة يُصحح في S2»).

---

## 4) الاختبارات — `tests/test_v17_backend_truth.py` (جديد)

| الاختبار | العقد |
|---|---|
| `test_facebook_test_connection_fixed_arabic_error` | (أ) monkeypatch لـ `FBClient.get_page_fan_count` يرمي `(#190) Access token does not have permission — English raw error` → `data.error` **يساوي حرفيًا** «فشل الاتصال بفيسبوك — تحقق من رمز الوصول ومعرف الصفحة» + النص الإنجليزي **غائب عن كامل نص الاستجابة** |
| `test_facebook_settings_webhook_fixed_arabic_error` | (أ-2) monkeypatch لـ `subscribe_page_webhooks` يرمي نصًا إنجليزيًا → `data.webhook` يساوي حرفيًا `{"error": "تعذر تفعيل الويبهوك — …"}` + لا أثر للإنجليزية |
| `test_onboarding_test_connection_fixed_arabic_error` | (ب) monkeypatch لـ `httpx.AsyncClient.get` يرمي `All connection attempts failed` → `data.error` يساوي حرفيًا «تعذر الاتصال بفيسبوك — تحقق من اتصالك بالإنترنت ثم أعد المحاولة» |
| `test_push_notification_off_skips_and_on_delivers` | (ج-الجوهر) التفضيل يُحفظ عبر **نقطة الحفظ الحقيقية** `PUT /api/notifications/settings` (نفس الصف الذي تكتبه الصفحة) → `payment_alerts=off`: `push_notification` يعيد `None` **وصفر صفوف** في جدول الإشعارات → إعادة التفعيل: الصف يُنشأ |
| `test_push_notification_gate_boundaries` | (ج-الحدود كما هي موثقة) بلا صف تفضيل → الافتراضي on يُسلّم · نوع بلا مفتاح (`support`) يُسلّم دائمًا · بثّ المستأجر (`user_id=None`) يُسلّم (السقف §3-ج) · تفضيل مستخدم في مستأجر آخر لا يعبر |

بنية الاختبار تستخدم حزام `v10_seed` المعياري (عالم معزول + زرع + auth) — لا fixtures جديدة مكررة.

---

## 5) صحة الجوار (أدلة حرفية)

- الملفات التي تلمس الإشعارات (10 ملفات اختبار مرجعية) — كلها خضراء:

```
$ pytest tests/test_phase_d_pages.py tests/test_v15_routers.py tests/test_phase_e_onboarding.py tests/test_track_a_response_shape.py -q
59 passed, 140 warnings in 19.05s
$ pytest tests/test_v16_prod_truth.py tests/test_v15_money_core.py tests/test_v12_contract.py tests/test_v10_auth_negative.py tests/test_track_e_pages_gate.py -q
170 passed, 193 warnings in 78.45s
$ pytest tests/test_v16_ssrf.py tests/test_radical_v4.py tests/test_v17_backend_truth.py -q
32 passed, 47 warnings in 23.41s
```

- **ملاحظة صدق حول التشغيل الكامل:** تشغيل `pytest tests/` كاملًا مرتين أثناء هذه الجولة أعطى فشلًا واحدًا مختلفًا في كل مرة (`test_radical_v4::test_webhook_message_replay_does_not_reply_twice` ثم `test_v16_ssrf::test_real_render_survives_remote_img_and_renders_data_uri`) — كلاهما **يجتاز منفردًا ومعًا** مع تعديلاتي (الدليل أعلاه)، وكلٌّ منهما بعيد تمامًا عن ملفاتي (replay الماسنجر / عرض PDF). سجل العمل يحتوي وكلاء E آخرين يعدّلون ملفات خلفية في نفس الشجرة الآن (`inbox.py`, `templates_routes.py`, `telegram_config.py`, `users.py` — `git status`)، وفشلًا مختلفًا في كل تشغيل مع 848 اختبارًا أخضر في الثاني نمطٌ كلاسيكي لتقاطع تحريرات متوازية/اعتماد ترتيب — **ليس** أثر تعديلاتي. تشغيل البوابة الكاملة النهائي مسؤولية المنسّق فوق شجرة مدمجة (كما تنص الخطة §3-ق7).

---

## 6) ما لم يُلمس (حدود الملكية)

- `fb_dashboard/routers/alerts_routes.py` (مالك القيم الافتراضية) — قراءة فقط عبر الاستيراد، لا تعديل.
- مسارات القراءة (`list_notifications`/`mark_read`/`read-all`) — بلا تغيير (الصفوف المحجوبة لا تُنشأ).
- المتصلون السبعة بـ `push_notification` — بلا تعديل (توقيع الإضافة اختياري والقيمة المرجعة كانت مهملة أصلًا).
- نص صفحة الإشعارات (`notifications/page.tsx:377`) — ملك S2 وفق الخطة.
- `onboarding.py:219` — خارج ملكية السطر 225؛ مُبلَّغ عنه في §2-د.
