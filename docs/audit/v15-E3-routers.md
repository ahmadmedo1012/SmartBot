# تقرير v15-E3 — تحصين الراوترات ومدخلاتها + نمط claim للبث/الحملات

**الوكيل:** E3 (BACKEND-ROUTERS) · **الجولة:** v15 · **الأساس:** main @ 558623b3 (شجرة عمل موجة E متزامنة)
**الملكية المنفَّذة حرفياً:** `routers/broadcasts.py` · `routers/marketing.py` · `routers/payments/approvals.py` · `routers/payments/wallet.py` · `routers/payments/plans.py` · `routers/plans_config.py` · `routers/users.py` · `routers/subscribers.py (=subscribers_tags_routes.py — انظر §0.1)` · `broadcast_engine.py` · `tests/test_v15_routers.py` (جديد) — **زائد ملفان خارج القائمة بموجة مهمة §E3-6 (انظر §0.2)**

**البوابة (كما في الخطة):** `pytest tests/test_v15_routers.py tests/test_v14_security.py tests/test_phase_b_payments.py -q` → **60 passed / 0 failed** · `ruff check` على كل ملفاتي → **نظيف تماماً** (باقي نطاق البوابة الكامل فيه 3 أخطاء في `onboarding.py` — ملف E1 الجاري تحريره، ليس لي — انظر §5).

**انحدار إضافي (اختياري، لحماية التزام الموجة الواحد):** `test_v11_broadcast_sequence` (22) · `test_schema_reconcile` · `test_security_hardening` · `test_v14_migrations` · `test_track_a_response_shape` · `test_v9_security` · `test_v10_auth_negative` · `test_v12_routers_security` · `test_v12_contract` · `test_v14_engines` · `test_phase_g_security` → كلها خضراء باستثناء فشل واحد في `test_v9_security::test_agent_memory_same_username_separate_tenants` سببه قيد `uq_user_email_lower` الجديد (ترحيلة 014 من **E2** المتزامنة) — ليس من تغييراتي (§5).

---

## 0) تفسيران للملكية — بمسؤولية، للمنسّق

### 0.1 — «routers/subscribers.py» غير موجود → نفّذت في subscribers_tags_routes.py
لا يوجد ملف باسم `routers/subscribers.py` في المستودع. راوتر المشتركين الفعلي (الوحيد الحامل لاسمهم) هو **`routers/subscribers_tags_routes.py`** — وفيه تحديداً مواقع عائلة D1-H1 المذكورة في التقرير (request.json() في السطرين 41/61 + `body["tag_id"]`/`body["name"]`). اعتُبر هو الملف المقصود ونُفِّذ فيه (تأكيد المنسّق شكلي).

### 0.2 — ملفا rules.py و scheduled_posts_routes.py: مهمتي §E3-6 لكنهما غائبان عن قائمة ملفاتي
مهمة 6 في قسم §E3 من الخطة تسمّيهما **صراحةً**: «سقوف قوائم مفقودة (scheduled-posts/rules — D8-B6)»، بينما قائمة الملفات الحرفية لا تضمهما، ولا يملكهما أي وكيل E آخر في خريطة الملكية (E1/E2/E4/E7 كلها مُحصّاة). **القرار:** نُفِّذت السقوف فيهما كتغيير جراحي minimal (معاملات Query فقط، لا منطق)، مع توثيق الانحراف هنا أولاً. إن رأى المنسّق غير ذلك: الرجوع سهل (revert لسطرين لكل مسار).

---

## 1) C-BCAST1 — البث الجماعي: من spawn-ميت إلى طابور claim ذرّي (حرجة → مغلقة)

### 1.1 الشكل الجديد للمسار (ثلاث مراحل مفصولة)

```
POST /api/broadcasts/{id}/send          broadcast_engine.process_pending(session)     [E1: نهاية cycle()]
──────────────────────────           ─────────────────────────────────────           ──────────────────────
تحقق 404/بوابة has_broadcast    →    claim ذرّي لكل صف:                          →    إرسال فعلي per-recipient
claim ذرّي draft→pending:             UPDATE broadcasts SET status='sending'          (Semaphore(10) + جلسة
UPDATE ... WHERE id=? AND             WHERE id=? AND status='pending'                 لكل مستلم) → sent/failed/
  tenant_id=? AND status='draft'      RETURNING id                                    partial
RETURNING id → لا صف = 400 نظيف       (الخاسر المتزامن يرى صفر صفوف ويتخطى)
commit → رد فوري «تم وضع البث في
الطابور — سيبدأ الإرسال تلقائياً
مع دورة البوت القادمة»
```

- **الجذر المغلق:** `spawn(_send())` بعد الرد (broadcasts.py:96-99 القديم) — على Vercel تُجمَّد الدالة فور كتابة الرد فلا يُرسل البث **أبداً** (ميزة مدفوعة تموت صامتة). حُذف الاستيراد كله.
- **العقد الحرفي لـE1 (§2 من الخطة) — مُسلَّم بصيغتين لضمان أي شكل استدعاء:**
  - دالة على مستوى الوحدة: `async def process_pending(session: AsyncSession) -> int` في `broadcast_engine.py` (ترجع عدد ما استُلم هذه الجولة).
  - **facade بالحالة** `BroadcastEngine.process_pending(self, session) -> int` → نفس الدالة — كي يعمل الاستدعاء أيضاً عبر singleton `_services.broadcast_engine` الكسول الذي قد يمسكه E1. تحقق آلي لكلا الشكلين.
- **D12-M1 مغلقة في نفس الجولة:** `send_broadcast` نفسه (مسار dispatch الحملات/الاستدعاءات المباشرة) صار claim ذرّياً `draft→sending` قبل أي إرسال (كان check-then-act: طلبا إرسال متزامنان يرسلان لكل مشترك مرتين). جسم الإرسال استُخرج إلى `_send_claimed_broadcast` مشترك بين مساري الاستلام.
- **إلغاء الصف في الطابور:** `cancel_broadcast` يقبل الآن `pending` أيضاً (إيقاف بث مُجدول قبل أن يلتقطه المستهلك).
- **دفعات محدودة:** `process_pending` يعالج ≤20 بثاً/نبضة (لا يحتكر استدعاء كرون)؛ كل استلام يلتزم تقدّمه قبل الإرسال.

### 1.2 بوابة has_broadcast (D2-H1 — نصيب E3)
`tenant_broadcast_allowed(session, tenant_id) -> (bool, reason)` في broadcast_engine.py، تُفرض في **ثلاث نقاط**:
1. **إنشاء** البث (رouters/broadcasts.py) → 403 «ميزة البث الجماعي غير متاحة في باقتك الحالية — قم بالترقية لاستخدامها».
2. **الإرسال** (نفس الملف) → 403 قبل الاصطفاف.
3. **المحرك** (`_send_claimed_broadcast`) → status=failed + سجل عربي عند الرفض (يغطي dispatch الحملات والصفوف المستلمة بعد تنزيل الباقة).

**قرار موثّق:** مستأجر بلا `plan_id` (تراثي/يدوي/كل fixtures الاختبار قبل v15) **مسموح** عند هذه البوابة عمداً — بوابة دورة حياة الاشتراك (PAID/TRIAL/UNPAID + max_replies) ملك E1 في المحرك؛ هذه البوابة تجيب فقط «هل باقته الحالية تبيع البث أصلاً».

### 1.3 اختبارات C-BCAST1 (كلها في tests/test_v15_routers.py)
- `test_broadcast_send_queues_and_double_submit_is_rejected` — طلب أول: 200 + «الطابور» + status=pending + **صفر** مستلمين (لا إرسال بعد الرد)؛ الطلب المتتالي الثاني: **400 عربية** (خسر claim) — «طلبان متتاليان» كما في الخطة.
- `test_broadcast_process_pending_claims_and_fails_without_page` — مستهلك يستلم ثم فشل صادق (failed) لمستأجر بلا صفحة؛ استهلاك ثانٍ = 0.
- `test_process_pending_sends_exactly_once` — على قاعدة المحرك بعميل FB مزيّف: استدعاءان متتاليان للمستهلك → **3 رسائل لثلاثة مشتركين مرة واحدة بالضبط**، 3 صفوف مستلمين (لا تضاعف)، الحالة sent.
- `test_broadcast_plan_feature_gate` — باقة بلا has_broadcast: إنشاء 403 + إرسال 403؛ باقة بها العلم: يعمل.

---

## 2) D1-H3 — الحملات المجدولة تُرسل فعلاً (عالية → مغلقة)

- **العقد الحرفي:** `async def process_pending_campaigns(session: AsyncSession) -> int` في **routers/marketing.py** (نص §2 من الخطة حرفياً).
- **الاستلام ذرّي:** `UPDATE marketing_campaigns SET status='sending' WHERE status='scheduled' AND scheduled_at <= now RETURNING id` — نمط approvals.py v9-A8: الحارس نفسه شرط التحديث؛ نبضان متداخلان لا يستلمان الحملة نفسها.
- **مسار واحد لا انحراف:** جوهر dispatch استُخرج من مسار `/campaigns/{id}/send` إلى `_dispatch_campaign(db, c, actor)` — المستهلك المجدول والزر اليدوي يرسلان **بنفس الكود بالضبط** (إشعار push مشترك `_campaign_dispatched_push`).
- **إنشاء حملة scheduled يبقى مقبولاً** (عقد 200: status=scheduled كما كان) + **D1-M5 أُغلق عرضاً:** تطبيع `scheduled_at` الواعي إلى UTC-naive عند الإنشاء (قيمة واعية كانت تُخزَّن بلاحقة إزاحة تكسر مقارنة الاستحقاق على SQLite).
- **قرار موثّق (حملة مستحقة بلا صفحة مربوطة):** تهبط على `queued` (نفس الحالة الصادقة للمسار اليدوي) + إشعار للمستأجر — زر الإرسال اليدوي يبقى مسار إعادة المحاولة بعد ربط الصفحة. لا تُعاد من queued تلقائياً (توثيق صريح؛ تكرار الالتقاط التلقائي سيحتاج قرار منتج).
- **اختبارات:** `test_campaign_scheduled_create_stays_scheduled` (عقد الإنشاء) + `test_process_pending_campaigns_sends_due_and_skips_future` — حملة مستحقة (الماضي): تُستلم وتُرسل عبر محرك البث فعلياً (رسالة لكل مشترك مرة، delivered=2، بث واحد status=sent)؛ حملة مستقبلية: **لا تُلمس**؛ استدعاء ثانٍ = 0 (لا إرسال مزدوج).

---

## 3) D1-H1 — عائلة 422 العربية (عالية → مغلقة في كل ملفاتي)

### 3.1 المسارات المالية (الأربعة + الحسم)
مساعدان صريحان في `routers/payments/wallet.py` (تصديرهما لـplans/approvals كعائلة واحدة):
```python
_as_float(value, field)  # «50» تمر، "abc"/True/قوائم → 422 «قيمة غير صالحة: المبلغ يجب أن يكون رقماً»
_as_int(value, field)    # "5" و 5.0 يمرّان، "5abc"/"5.5" → 422
```
| الموقع القديم | المسار | قبل | بعد |
|---|---|---|---|
| wallet.py:130 `amount < 1` بنص | POST /api/payments/topup | TypeError → 500 + إنذار حرج | 422 «قيمة غير صالحة» |
| wallet.py:168 `int(pid)` | POST /api/payments/confirm | ValueError → 500 | 422 «معرف الدفع» |
| plans.py:108 `float(amount)` | POST /api/subscriptions | 500 | 422 (قبل فحص الخطة) |
| plans.py:118 `float(body.get("amount") or plan.price)` | نفسه (فرع bank) | 500 | 422 |
| plans.py:218/222 `float(amount)` | POST /api/subscriptions/upgrade | 500 | 422 |
| approvals.py:105 `int(payment_id or 0)` | POST /api/admin/subscriptions (حسم المال) | 500 لأدمن المنصة | 422 «معرف الدفعة» |

(ملاحظة سلوكية موثّقة: `plan_id` أصبح يمر عبر `_as_int` أيضاً — «5» النصي كان يرد 400 «الباقة غير موجودة» (D1-L8: ليس 500) والآن يُطابَق رقمياً بشكل صحيح؛ القيم غير الرقمية 422.)

**اختبار سالب 422 لكل مسار مالي** (5 اختبارات): topup (نص + bool) · confirm (معرف نصي) · subscriptions (محفظة + فرع بنك) · upgrade · حسم أدمن المنصة — كل واحد يفشل كان 500 ويجتاز الآن بـ422 عربية.

### 3.2 عائلة request.json()/body["key"] (ملفاتي)
مساعدان في `routers/broadcasts.py` (يستوردهما subscribers_tags_routes.py — نفس نمط عائلة payments التي تصدّر مساعدها من wallet.py):
- `_json_body(request)` — JSON غير صالح أو غير كائن → 422 «قيمة غير صالحة: جسم الطلب ليس JSON صالحاً» (كان JSONDecodeError → 500).
- `_required_key(body, key)` — مفتاح مطلوب غائب → 422 «قيمة غير صالحة: الحقل 'x' مطلوب» (كان KeyError → 500).

المواقع المغلقة: broadcasts.py create (`name`) / update / estimate (json×3) · subscribers_tags_routes.py assign-tag (json + `tag_id`) وcreate-tag (json + `name`) — مع اختبار سالب لكل نمط.

### 3.3 مواقع D1-H1 في ملفات **ليست لي** (للمنسّق — لم ألمسها)
`auth.py:210/330` (E2) · `bot.py:132` (E4) · `calendar_routes.py` · `commerce_routes.py` · `sequences.py` · `facebook_routes.py:81` (E4) · `reports_routes.py` · `flows.py` (الأخيرة بلا مالك في خريطة E — تحتاج حسم المنسّق).

---

## 4) D9-H1 + D6-M3 + D12-M4 + D8-B6

### 4.1 cleanup-logs يقبل GET + بوابة Bearer الموحدة (plans_config.py — ملكي)
- `@router.api_route("/api/cron/cleanup-logs", methods=["GET", "POST"])` — **يغلق موت كرون Vercel اليومي** (كان POST-only يستدعى بـGET → 405 يومياً منذ التعريف → نمو BotLog/RateLimitEntry بلا تنظيف).
- **البوابة = نمط bot.py حرفياً (D6-M3):** `Authorization: Bearer` هو الأساس (constant-time)؛ نموذج POST القديم يبقى (توافق خلفي موثّق — test_schema_reconcile/test_security_hardening يعملان بلا تعديل)؛ **`?token=` في نص الاستعلام تعمل لكنها «مهملة»** — كل استخدام يسجّل تحذير إهمال صريح (تسريب CRON_SECRET لسجلات الوصول) — نفس رسالة تحذير bot.py. السر الفارغ لا يصادق أبداً (fail-closed محفوظ).
- **bot.py ليس ملكي** — نمط Bearer هناك (heartbeat/bot-cycle) يخص **E4** (والبوابة هناك موجودة أصلاً منذ v12-E2.5).
- الاختبار الحي: GET+Bearer=200 · GET بلا توكن=403 · GET ?token= صحيحة=200 (مع التحذير) · ?token= خاطئة=403 · POST نموذج=200 (توافق) · POST خاطئة=403.

### 4.2 D12-M4 — عائلة spawn-بعد-الرد في ملفاتي
الموقع الوحيد في ملفاتي كان **broadcasts.py:96-99** — أُغلق بـC-BCAST1 (استُأصل الاستيراد كله). المواقع الأخرى للعائلة (support.py:118 · monitor.py:102 · _services.py:401 · bot.py:378 · api_cache.py:119 · content_calendar.py:179) كلها خارج ملكيتي — المسار الصحيح موثّق في تقرير D12-M4 لأصحابها.

### 4.3 D8-B6 — سقوف القوائم
- `GET /api/scheduled-posts?limit=50 (ge=1, le=200)&offset=0 (ge=0)` — كانت بلا سقف (أرشيف نصوص منشورات + image_url يُستطلع كل 30ث).
- `GET /api/rules?limit=50 (ge=1, le=200)&offset=0` — نفس الشكل (عائلة استطلاع autoreply كل 30ث).
- FE لا يمرر معاملات (تحقق: posts/page.tsx:25، scheduled/page.tsx:37 بـ?status فقط، autoreply/page.tsx:27) — لا كسر عقد. قوائم ملفاتي المسقوفة أصلاً بقت كما هي (broadcasts 50/200 من v14-E3؛ marketing campaigns 20/100).
- الاختبارات: 200 للافتراضي/الحد الأقصى/offset، و422 لـ201/0/-5/-1.

---

## 5) تعارضات وملاحظات عابرة للمنسّق (لم أتدخل فيها)

1. **ruff داخل نطاق بوابتي الكامل:** 3 أخطاء في `routers/onboarding.py` (B904 سطر 108 · UP041 سطر 138 · سطر 261) — من تحرير **E1** المتزامن (119 سطراً أُضيفت لملفه: 409 الربط المزدوج + subscribe webhooks). ملفاتي كلها نظيفة.
2. **فشل test_v9_security::test_agent_memory_same_username_separate_tenants:** `UNIQUE constraint failed: index 'uq_user_email_lower'` — الاختبار يزرع مستخدمين بنفس البريد في مستأجرين، وقيد lower(email) الجديد (ترحيلة **014 من E2** المتزامنة، وهو عين إصلاح D12-H4) يرفضه الآن — الاختبار يحتاج تحديثاً (بريدان مختلفان) وملفه يخص E9/مالك الاختبارات. ليس من تغييراتي (تحققت: فشل يعزل بنفسه داخل ملفه).
3. **users.py لم يحتج تعديلاً:** لا مواقع D1-H1 فيه (L10 فحص محارف username خارج مهامي؛ موثّق تركه).
4. **bank.py لم يحتج تعديلاً:** لا مواقع من عائلة H1/السقوف (المسار بلا مدخلات رقمية خام).
5. **D1-M9 (أطوال نصية) وD1-M1 (page بلا le في approvals) في ملفاتي لم تُنفذ** — خارج قائمة مهام §E3 (متوسطات، أصحابها القرار في جولة لاحقة) — أُثبت هنا للشفافية.

---

## 6) خريطة التغييرات (ملف:طبيعة)

| الملف | التغيير |
|---|---|
| `fb_dashboard/broadcast_engine.py` | docstring عقود v15 · `tenant_broadcast_allowed` (D2-H1) · `send_broadcast` → claim ذرّي draft→sending + تفويض لـ`_send_claimed_broadcast` (D12-M1) · `_send_claimed_broadcast` (الجسم المشترك + بوابة has_broadcast) · **`process_pending(session)->int`** (عقد §2 + facade بالحالة) · `cancel_broadcast` يقبل pending · دفعة 20/نبضة |
| `fb_dashboard/routers/broadcasts.py` | حذف spawn نهائياً (C-BCAST1) · `_json_body`/`_required_key` (422) · إنشاء: بوابة has_broadcast + name مطلوب 422 · **إرسال: claim ذرّي draft→pending + رد «في الطابور»** · estimate/update: حراسة JSON |
| `fb_dashboard/routers/marketing.py` | **`process_pending_campaigns(session)->int`** (استلام ذرّي scheduled→sending) · `_dispatch_campaign`/`_campaign_dispatched_push` (مسار مشترك) · تطبيع tz لـscheduled_at (D1-M5) · send_campaign يفوّض للمسار المشترك |
| `fb_dashboard/routers/payments/wallet.py` | `_as_float`/`_as_int` (422 عربية) + topup/confirm محوّلان |
| `fb_dashboard/routers/payments/plans.py` | create/upgrade: amount/plan_id عبر المساعدين (كل مواقع float() الخام) |
| `fb_dashboard/routers/payments/approvals.py` | حسم الدفعة: payment_id عبر `_as_int` (422) |
| `fb_dashboard/routers/plans_config.py` | cleanup-logs: **GET+POST** · Bearer أساس · ?token= مهملة مع تحذير · نموذج POST متوافق · حذف Form غير المستخدم |
| `fb_dashboard/routers/subscribers_tags_routes.py` | `_json_body`/`_required_key` على assign-tag/create-tag (422) |
| `fb_dashboard/routers/rules.py` *(§0.2)* | limit 50/200 + offset على GET /api/rules |
| `fb_dashboard/routers/scheduled_posts_routes.py` *(§0.2)* | limit 50/200 + offset على GET /api/scheduled-posts |
| `tests/test_v15_routers.py` | **جديد — 16 اختباراً** (البث×4 · الحملات×2 · 422×7 · الكرون×1 · السقوف×2) |

## 7) الأعداد النهائية للبوابة

```
pytest tests/test_v15_routers.py tests/test_v14_security.py tests/test_phase_b_payments.py -q
→ 60 passed, 0 failed (منها 16 اختباراً جديداً لي)
ruff check (كل ملفاتي، الإحدى عشر ملفاً + الاختبار) → All checks passed
```

— انتهى تقرير E3 · جولة v15 —
