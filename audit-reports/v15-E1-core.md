# v15-E1 — نواة البوت وبوابات المال (تنفيذ كامل + إصلاح جولة إعادة المحاولة)

**الوكيل:** E1 (BACKEND-CORE · opus) · **الجولة:** v15 (retry — المحاولة الأولى تركت الملفات نصف مكتملة بلا تقرير/سجل؛ هذه الجولة أكملتها وأصلحت 3 عيوب فيها) · **الأساس:** main @ 558623b3 + موجة E الجارية
**الملكية الصارمة:** `fb_dashboard/bot_engine/engine.py` · `bot_engine/pipeline.py` · `app/webhooks.py` · `routers/onboarding.py` · `tests/test_v15_money_core.py` (جديد)

---

## 0) ملخص تنفيذي

المهام العشر كُلّفت تنفيذاً كاملاً: **10/10 منفذة** · البوابة خضراء: **60 passed + 1 skipped (سكيب weasyprint موجود مسبقاً على main — E9 يملكه)** · ruff نظيف على ملفات التطبيق والاختبار · 36 اختباراً جديداً في `test_v15_money_core.py` لكل إصلاح اختبار سالب/موجب.

جولة إعادة المحاولة (retry) وجدت جولة E1 السابقة قد تركت: (أ) `suggest_reply` يستعمل `db` غير معرّف (NameError يُبتلع → بوابة has_ai ميتة) — أُصلح، (ب) `_load_replied_ids` مكرر (النسخة القديمة غير المحدودة تحجب نسخة D8-B1 المحدودة لأن آخر تعريف في الصنف يفوز) — أُزيل القديم، (ج) 3 أخطاء ruff في onboarding.py (B904/UP041/F821) — أُصلحت، (د) اختبار «غياب E3» أصبح خاطئ الفرضية بعد هبوط E3 — أُعيد كتابته بمحاكاة delattr.

---

## 1) ما نُفّذ — مهمة مهمة

### 1) C-CORE1 — اشتراك الويبهوك من المعالج (الحرجة الأولى)
`routers/onboarding.py · connect_page`: بعد نجاح حفظ fb_page_id/fb_page_name/fb_access_token (Fernet) والـcommit — استدعاء `subscribe_page_webhooks()` عبر **عميل المستأجر** `get_tenant_fb_client(tenant_id)` (نفس محلل dispatch الويبهوك — لا عميل المنصة أبداً)، بانتظار محدود (`asyncio.wait_for(timeout=8)`) حتى لا يعلق رد المعالج على Graph بطيء. حالة الاشتراك تعود في استجابة ok(): `webhook_subscribed: bool` + `webhook: result` + عند الفشل `webhook_hint` عربي («لم يكتمل اشتراك الويبهوك… يمكن إعادة المحاولة من صفحاتي/إعدادات فيسبوك»). الفشل/المهلة **لا يمنعان الحفظ** (قابل للمحاولة من PUT /api/facebook/settings الذي يعيد الاشتراك). بعد الحفظ: إخلاء `_tenant_fb_cache` + `reset_bot_engines()` (نفس سلوك PUT settings) ليأخذ التوكن الجديد مفعوله فوراً.
**اختبارات:** نجاح الاشتراك مرة واحدة بالضبط عبر عميل المستأجر + حفظ التوكن مشفراً؛ فشل الاشتراك لا يمنع الحفظ ويعرض التلميح العربي.

### 2) D2-H1 — حدود الخطة مفروضة في نقاط الاستخدام الفعلية
**نقطة القراءة المركزية** `pipeline.get_plan_limits(session, tenant_id)` (جديدة):
- `tenant.plan_id` → صف الخطة؛ بلا خطة → صف «Free» المبذور؛ لا صفوف → `None` → غير محدود (fail-open موثق — نفس عقيدة بوابة الاشتراك L10).
- الحالات المنتهية (EXPIRED_TRIAL / UNPAID-منتهي) **تتحلل لحدود Free** (الأساسيات الموثقة — لا مزايا الخطة المجربة) بمرساة فترة = لحظة الانتهاء.
- `replies_used` = SUM(الصفوف ≥ المرساة) — يجمع تراكم الفترة ويعامل الصفوف التاريخية المنقسمة (legacy).

نقاط الفرض:
- **max_replies:** دورة التعليقات (`cycle` → `_quota_exceeded` early-out يوفر نداءات Graph) · مسار تعليقات webhook (`pipeline` المرحلة 7.5 قبل الإرسال) · مسار رسائل webhook (`process_single_message` → `_quota_exceeded`). الرفض يكتب BotLog عربياً للمستأجر (throttle صف واحد لكل (tenant، بوابة) لكل 5 دقائق — `money_gate_log`) + تحذير monitor.
- **has_dm:** المرحلة 8b في pipeline — خطة بلا DM: الرد العام يُرسل (أساسي) والرد الخاص يتوقف + BotLog عربي.
- **has_ai:** نقطة نداء AI الوحيدة في ملفاتي — `onboarding/suggest-reply`: المزوّد لا يُستدعى إطلاقاً بدون has_ai، والاقتراح قالب + `ai_blocked/ai_note` عربية (المعالج لا يُسد أبداً).
- **has_broadcast:** عند الإنشاء/الإرسال/المحرك — نفذها E3 في ملفاته (`tenant_broadcast_allowed`) — لمستها من جهتي عبر العقد فقط (لا ملكية لي في broadcasts.py).
التعليق الكاذب القديم «gated elsewhere» (engine.py:95-97) استُأصل بحكم إعادة كتابة البوابة.

### 3) D2-H3 — مسار تعليقات webhook عبر بوابة §5.18 + محسوب
`process_single_comment` يستدعي الآن `await self._subscription_active()` قبل المعالجة (نفس بوابة الرسائل — كان بلا بوابة: مستأجرون منتهون يردّون للأبد)، والعدّ الموحد في pipeline (أدناه) يحسب كل رد — من طرف إلى طرف عبر POST /webhook بالاختبار.

### 4) D12-H3 — العدّاد ذرّي + توحيد الفترة
`pipeline.increment_replies_used(session, tenant_id, n, period_start)` — نمط `credit_wallet` الحرفي: استعلام واحد `UPDATE usage_counters SET current_value = coalesce(current_value,0)+n WHERE tenant/metric/period_start=:anchor` (بلا قراءة-ثم-كتابة)؛ صف مفقود → INSERT داخل SAVEPOINT؛ فائز قيد `uq_usage_tenant_metric_period` متزامن → IntegrityError → إعادة UPDATE الذرّي على صفه. **توحيد الفترة:** `period_start_for(tenant)` — مرساة DATE-based (بلا وقت/ميكروثانية): خطة → تاريخ plan_start؛ بلا خطة → بداية الشهر. القراءة SUM ≥ المرساة — فالقراءة والكتابة متفقتان → لا انقسام صفوف أبداً (utcnow() بميكروثانية كان يخلق صفاً لكل منشئ متزامن). التصفير القديم «self-heal» في cycle حُذف: التجديد يحرك المرساة → فترة جديدة صفرية بلا جراحة صفوف وبلا انتظار دورة (يغلق D10-M6 تبعاً). الكتابة في نفس معاملة صف Reply (نقطة عدّ واحدة تخدم المسارين).
**اختبارات:** 10 زيادات gather على صف قائم = +10 بالضبط؛ 5 منشئين متزامنين = صف واحد قيمته 5؛ المرساة date-based؛ وإثبات سالب موثق أن نمط RMW القديم يفقد التحديثات تحت gather.

### 5) D10-H1/H5 — انتهاء متناظر + إشعار تجديد واحد
`engine._expire_tenant_if_due(session, tenant)` — نقطة الانتهاء الواحدة (cycle + webhook الرسائل + webhook التعليقات عبر `_subscription_active`):
- **PAID منتهٍ → UNPAID عند أول استخدام** (لا انتظار دورة لا تعمل على Vercel) → ردود ممنوعة + إشعار تجديد **مرة واحدة** (تحويل حالة = الحدث التالي يرى UNPAID).
- **TRIAL منتهٍ → EXPIRED_TRIAL** + إشعار مرة واحدة → **الردود الأساسية تستمر فعلياً** (الوعد الموثق — القديم: رد واحد محظوظ ثم صمت دائم) — والمزايا المدفوعة تقطعها بوابة get_plan_limits (تحلل Free).
- UNPAID منتهٍ / REJECTED → ممنوع. FREE/EXPIRED_TRIAL/نشط → مسموح. مستأجر طازج بلا plan_end → مسموح (واقع register/lifespan).
**D10-H5:** `_notify_subscription_ended` — push_notification عربية (عنوان/نص/رابط /dashboard/billing، type=payment) + BotLog tenant-scoped، بفك اسم الباقة من plan_id — القديم كان تحويلاً صامتاً 100% (لا إشعار/سجل/tاريخ انتهاء مرئي).
**اختبارات:** PAID منتهٍ يتحول عند أول استخدام + إشعار واحد بالضبط (لا تكرار في الاستخدام الثاني) + BotLog؛ TRIAL → EXPIRED_TRIAL ويستمر الرد الأساسي في الأحداث اللاحقة؛ مصفوفة REJECTED على المسارين.

### 6) D8-B1 — نافذة dedup محدودة + إصلاح سباق mark/load
`_load_replied_ids`: استعلام واحد tenant-scoped (فهرس `ix_reply_tenant_created`)، `created_at ≥ now-48h`، `ORDER BY created_at DESC`، `LIMIT 5000` — بدل مسح النافذة كاملة **لكل تعليق** (أثقل نقطة DB في المسار الساخن: 200 تعليق × 5000 صف = مليون صف/دورة). النتيجة تُكاش TTL 60s (`_replied_ids_cached`) — استعلام واحد لكل نافذة. **إصلاح السباق:** استدعاءات `dedup.load()` (التي كانت **تستبدل** المجموعة وتمحو علامات لم تُلتزم بعد) أُزيلت كلياً من مسار التعليقات — `mark()` في الذاكرة يحمي الجاري داخل العملية، والنافذة من DB تحمي عبر إعادة التشغيل/الحوادث، وقيد `uq_reply_tenant_comment` (ترحيلة 014 — E2) خط الدفاع الأخير.
**إصلاح الجولة:** النسخة القديمة غير المحدودة من `_load_replied_ids` كانت لا تزال معرفة بعد الجديدة (آخر تعريف في الصنف يفوز → كل تحسين D8-B1 كان كوداً ميتاً) — حُذفت.
**اختبارات:** الاستعلام يجري مرة واحدة لكل TTL عبر 3 تعليقات؛ علامة ghost غير الملتزمة تنجو من معالجة تعليق آخر (لا استبدال)؛ تعليق مُردّ عليه لا يُرد مرة ثانية عبر محرك «جديد» (إعادة تشغيل).

### 7) D8-B4 — ACK: خزّن أولاً + محاولة واحدة قبل الـ200
- **تعليقات:** webhooks.py يخزّن صف Comment قبل dispatch المحرك (موجود v4 §4.10 — موثق ومُختبر طرفاً لطرفاً)؛ `process_single_comment(fast_ack=True)` → `pipeline.process(send_attempts=1)` — **محاولة إرسال واحدة** (كانت 3 + backoff 1/2/4s تحتجز ACK حتى 7s). الدورة الخلفية تحتفظ بالميزانية الكاملة (لا ضغط ACK هناك).
- **رسائل:** `process_single_message` — حلقة إعادة المحاولة v4 §5.16 (3 × sleep 1.2^n) أُحالت للتقاعد على مسار الويبهوك: **نداء send_dm واحد** ثم السبب العربي الصادق (v4 §5.17 — نافذة 24h/توكن) في BotLog tenant-scoped. (تأجيل إعادة المحاولة لنبضة cron يحتاج علم رسالة — ملك messenger_service (E4) — موثق للمنسّق).
**اختبارات:** فشل إرسال = محاولة واحدة بالضبط + زمن < 2s (بلا backoff) في المسارين + السبب العربي محفوظ.

### 8) D1-H2 — بوابة أدوار المعالج
`connect_page` → `require_role("admin")` (مطابق PUT /api/facebook/settings) · `first-rule` → `require_role("editor")` (مطابق POST /api/rules). كان viewer يستطيع عبر API: إعادة ربط صفحة/توكن المستأجر كله وحقن قاعدة رد حية.
**اختبارات:** viewer 403 على المسارين (ولا صف واحد يُكتب)؛ editor ينشئ القاعدة بنجاح.

### 9) D1-H4 — الربط المزدوج → 409 عربية
`connect_page`: كتلة الحفظ+commit داخل `try` → `except IntegrityError: rollback(); raise HTTPException(409, "هذه الصفحة مربوطة بمساحة عمل أخرى…")` — الفهرس الفريد الجزئي `uq_botstate_key_value` (key='fb_page_id') يطلق عند autoflush أو commit (كلاهما مغطى). كان 500 خام (بطارية p06 تبطئ هنا عند SIM_STRICT_409=1).
**اختبار:** مستأجر ثانٍ بنفس الصفحة → 409 + النص العربي + لا شيء يُحفظ للمستأجر الثاني (rollback كامل).

### 10) §2 — نداءات العقد في نهاية cycle()
`engine.cycle()` → `finally: await self._drain_broadcast_and_campaigns(session)` — كل مسارات الخروج (انتهاء/حصة/لا قواعد/استثناء) تستهلك الطابور:
- `import broadcast_engine` → `process_pending(session)` إن وُجد (getattr-callable)
- `from routers import marketing` → `process_pending_campaigns(session)` كذلك
- كل نداء داخل try مستقل: `ImportError` يمر بصمت (احتياط غياب التنفيذ — بالاختبار عبر delattr بعد هبوط E3)، وأي استثناء آخر → `self._mon.warn` فقط — **فشلهما لا يكسر الدورة أبداً** (بالاختبار boom على الاثنين والدورة تكتمل).
- import داخل الدالة (متأخر) — لا استيراد دائري.

---

## 2) البوابة (كما في التكليف حرفياً)

```
$ cd /home/z/my-project/SmartBot && DATABASE_URL="sqlite+aiosqlite:///:memory:" SECRET_KEY=test-secret \
    CRON_SECRET=test-cron-secret FB_ACCESS_TOKEN=test-token FB_PAGE_ID=0 \
    .venv/bin/python -m pytest tests/test_v15_money_core.py tests/test_v14_engines.py tests/test_v14_webhook_multi.py -q
→ 60 passed, 1 skipped, 88 warnings in 12.11s   (السكيب: weasyprint غير مثبت — موجود على main قبل جولتي — E9/C-DEP1 يملكه)

$ .venv/bin/python -m ruff check fb_dashboard/bot_engine fb_dashboard/app/webhooks.py fb_dashboard/routers/onboarding.py
→ All checks passed!   (+ ruff على tests/test_v15_money_core.py: All checks passed!)
```

**انحدار إضافي (فوق البوابة):** test_phase_e_onboarding (21 passed) · test_bot_logic/simple/track_g_engine (ضمنها) · test_radical_v4 + test_qa_scenarios + test_v12_contract + test_bot_isolation (31 passed + فشل flake مُوثق أدناه — موجود على main قبل أي تغيير) · test_v15_routers (E3) تمر كاملة عند تشغيلها **قبل** ملفي.

---

## 3) ما أُصلح في جولة إعادة المحاولة (فوق ما أنجزته المحاولة الأولى)

| # | العيب الموروث من المحاولة الأولى | الأثر كان | الإصلاح |
|---|---|---|---|
| R1 | `suggest_reply` يستدعي `get_plan_limits(db, …)` بلا `db=Depends(get_db)` في التوقيع → NameError يُبتلع في `except Exception` | بوابة has_ai ميتة 100% (ruff F821 كشفها — الاختبار فشل) | أُضيف `db=Depends(get_db)` — الاختباران (سالب/موجب) خضران الآن |
| R2 | `_load_replied_ids` معرف مرتين في الصنف (الجديدة المحدودة ثم القديمة غير المحدودة — الأخيرة تفوز في Python) | كل تحسين D8-B1 كان كوداً ميتاً | حُذفت القديمة + أضيف ORDER BY created_at DESC (أحدث 5000) + docstring |
| R3 | 3 أخطاء ruff في onboarding.py (B904/UP041/F821) — E3 رصدها في تقريره | بوابة CI حمراء (C-RUFF1 عائلة) | أُصلحت الثلاثة |
| R4 | `test_cycle_completes_without_e3_implementations` يفترض غياب تنفيذا E3 (assert not hasattr) | فشل حتمي بعد هبوط E3 | أُعيدت كتابته: فرضية hasattr (هبوط E3) + محاكاة الغياب بـ monkeypatch.delattr — الاحتياط ما زال مختبراً |
| R5 | خنق `money_gate_log` (module-level dict بمفتاح (tenant_id, key)) يتسرب بين اختبارات القواعد المعزولة (المعرّفات تتكرر id=1.. عبر القواعد) | فشل ترتيبي: اختبار يبتلع سجل بوابة اختبار لاحق | autouse fixture تصفّر `_gate_log_throttle` حول كل اختبار (سلوك الإنتاج 5-دقائق لم يُمس) |
| R6 | أخطاء ruff في ملف الاختبار نفسه (I001×4, F401×2, E741×5, F841×3) | بوابة منسّق `ruff check fb_dashboard tests` حمراء | أُصلحت كلها (ruff --fix + تحرير يدوي: l→lg، إزالة world غير المستعمل) |

**app/webhooks.py لم يُعدّل** (صفر diff): مسؤولياتي فيه كانت (أ) dispatch تعليق→`process_single_comment` — البوابة/العدّ في المحرك (مُختبر طرفاً لطرف عبر POST /webhook)، (ب) التخزين-قبل-الرد للتعليقات — موجود أصلاً في الملف (v4 §4.10) ومُغطى بالاختبار، (ج) تقليص المحاولات — في المحرك (fast_ack). مسار الرسائل Graph-قبل-التخزين (B4-جزء1) يسكن messenger_service.py — **ملف E4** (D12-H5) — لم ألمسه.

---

## 4) تعارضات وملاحظات للمنسّق

1. **فشل ترتيبي مُثبت مسبق الوجود (ليس من تغييراتي):** `test_v15_routers.py::test_broadcast_process_pending_claims_and_fails_without_page` (E3) يفشل عند تشغيله **بعد** أي وحدة تستعمل نمط `app_client` على القاعدة العالمية وتترك صفحة مربوطة لمستأجر ذي معرّف منخفض (يتصادم مع معرّف مستأجر E3 المعزول): يمر `v14_webhook_multi → v15_routers` بالفشل نفسه **وبملفاتي الأربعة مسترجعة لـHEAD** (أثبتُها بـgit stash). الجذر: `get_tenant_fb_client` في `_services` يقرأ من `AsyncSessionLocal` العالمي بينما صف Broadcast يعيش في قاعدة v10_world المعزولة — معرّفات المستأجرين تتقاطع بين القاعدتين. **الحسم لـE3/المنسّق:** الاختبار يحتاج monkeypatch لـ`get_tenant_fb_client` أو seed صريح، أو عزل `AsyncSessionLocal` في `_services`. ترتيب file-order: `v15_money_core → v15_routers` يفشل أيضاً بنفس الآلية (ملفي يترك صفحات مربوطة في القاعدة العالمية من اختبارات connect-page) — سيزول تلقائياً بإصلاح اختبار E3.
2. **flake موجود على main قبل الجولة:** `test_radical_v4.py::test_notifications_unread_inside_data` — "sqlite3.OperationalError: database is locked" عند تشغيله ضمن الملف (يمر منفرداً) — أثبتُه على main نظيف بـgit stash كامل (فئة D7-flake التي رصدها D9). ليس من ملكيتي ولا من تغييراتي.
3. **اختبار إعادة تشغيل المحرك يعتمد على قيد `uq_reply_tenant_comment` (models.py — E2 أنشأته في ترحيلة 014):** يعمل اليوم عبر create_all؛ على الإنتاج يعتمد على هبوط ترحيلة 014 (E2 أنجزها — المسار مكتمل).
4. **اختبارات connect-page للـ409 تمر عبر التقاط IntegrityError** (عقد مهمتي الحرفي) بينما E4 اختار في facebook_routes.py فحصاً مسبقاً + 409 — المساران متكاملان لا متعارضان (نفس النص العربي تقريباً — §2-3).
5. **النبض الحقيقي للتزامن في الإنتاج:** بطاريتي gather تثبت ذرّية SQL؛ انعدام التداخل الحقيقي multi-instance يكتمل بقيد DB (E2) — نمط claim قبل Graph للردود (اقتراح D12-H2) خارج نطاق مهمتي الحرفي (pipeline Stage 8b يرسل قبل INSERT لكن القيد يمنع الازدواج المحسوب — الرسالة المزدوجة النادرة موثقة D12-H2 لصاحب الدورة القادمة).
6. **D10-M4 (سقف 5/دقيقة لمسار webhook للتعليقات):** `_check_rate_limit`/`_mark_replied` بقيا cycle-only — مهمتي الحرفية لم تشمل M4 (وD10 وضعها M لا H) — موثقة هنا للجولة القادمة.

---

## 5) الإحصاءات

- 3 ملفات تطبيق معدلة (engine.py +563/-… · pipeline.py +301 · onboarding.py +156 سطراً diff) — كلها داخل ملكيتي الصارمة.
- 36 اختباراً جديداً في tests/test_v15_money_core.py (1139 سطراً): 12 سلبياً للبوابات (403×2 · 409 · بوابة اشتراك · حصة×2 · has_dm · has_ai · REJECTED×2 · سكيب منتهي UNPAID) + موجبة لكل مسار + 5 اختبارات تزامن gather + 3 اختبارات عقد §2.
- إجمالي جولة E1 النهائي: المهام 10/10 · البوابة 60 passed/1 skipped (سكيب موروث) · ruff أخضر (تطبيق + اختبار).

*الوكيل E1 (retry) — v15. الكود في الملفات الخمسة المملوكة فقط؛ لا تبعيات جديدة؛ العربية في كل رسائل المستأجر.*
