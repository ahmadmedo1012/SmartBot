# تقرير v15-D1 — تدقيق عميق حصري لكل راوترات الخلفية (239 endpoint)

**الوكيل:** D1 (تشخيص راوترات الخلفية) · **الجولة:** v15 · **الأساس:** main @ 558623b3 (v14 مكتملة، شجرة نظيفة)
**النطاق:** `fb_dashboard/routers/` كاملة — 43 ملفاً + `payments/` (6 ملفات فرعية) = 44 ملفاً، **239 endpoint** (عدّ AST للمزخرجات المسجلة)، ملفاً ملفاً وendpoint endpoint بلا استثناء، مع البنية المشتركة (`routers/auth.py` الحراس، `_responses.ok/fail`، `app/errors.py`، `get_db`).
**قاعدة عدم الإعادة:** ما أُغلق في v14 لم يُعد عدّه — تحققت سلباً: `require_platform_admin` على حسم الدفع (approvals.py:81)، `token_ver` عند تغيير/إعادة كلمة المرور (auth.py:339/370 + users.py:64)، `days` مسقوفة في `/api/logs/clear` (bot.py ClearLogsBody:355)، سقوف قوائم payments/history (wallet.py:192) وsubscribers/crm/inbox/broadcasts (v14-E3)، إيصالات JSON عبر مسار محمي (approvals.py:189)، و`(tenant_id, key)` فريد (models.py:95).

## 0) المنهجية

1. قراءة كاملة سطراً سطراً لكل ملف في `routers/` (44 ملفاً، ~7230 سطراً).
2. مسح IDOR: كل `db.get()` وكل `where(Model.id == …)` قياس غياب مرشّح `tenant_id` **بعده** — النتيجة: **لا ثقب IDOR جديد** (كل مسار يفحص الملكية قبل الرد/التعديل؛ الاستثناءات المشروعة platform-admin مثل `platform_update_user` و`admin_resolve_subscription`).
3. مطابقة العقد: `ok()/fail()` مقابل `HTTPException` مقابل ردود خام — ومطابقة «المستهلك الفعلي» لكل endpoint عبر استخراج كل مسارات `/api/...` من `frontend/src` (99 مساراً حرفياً + الديناميكية `${…}`) ومن `e2e/` و`tests/` و`scripts/`.
4. تجارب سلوكية مباشرة على SQLAlchemy 2.0.52 (`db.get` بمفتاح نصي، `int()/float()` بأنواع وضعت) لإثبات أو نفي الـ500ات قبل الإبلاغ.
5. تتبع الجذور العابرة للملفات: spawn-بعد-الرد على Vercel، عائلة IntegrityError، عائلة الحدود غير المسقوفة.

**الحصيلة: 1 حرجة · 5 عالية · 10 متوسطة · 12 منخفضة = 28 إيجاداً** (لا حرج أمني جديد — العزل سليم؛ الحرج الوحيد وظيفي/إنتاجي).

---

## 1) جدول الإيجادات (مرتب بالشدة)

| # | الشدة | الإيجاد | الموقع | السطر |
|---|---|---|---|---|
| C1 | **حرج** | البث الجماعي `spawn()` بعد الرد = لا يُرسل أبداً على Vercel (بيئة الإنتاج) — ميزة مدفوعة | routers/broadcasts.py | 96-99 |
| H1 | عالي | عائلة مدخلات خام → 500 + إنذار تيليغرام/سنتري حرج لأخطاء عملاء (24+ موقعاً، منها 4 مسارات مالية) | wallet/plans/approvals/auth/bot + 18 `request.json()` | انظر §H1 |
| H2 | عالي | مسارات المعالج `connect-page`/`first-rule` بلا بوابة دور — viewer يربط صفحة/توكن وينشئ قواعد | routers/onboarding.py | 54, 204 |
| H3 | عالي | الحملات «المجدولة» لا تُرسل أبداً: لا مستهلك cron/heartbeat للميقات — تعفن صامت في status=scheduled | routers/marketing.py | 102-108 |
| H4 | عالي | D13-F1 (معروف): الربط المزدوج → IntegrityError 500 عبر **مسارين** + 4 سباقات check-then-insert أشقاء | onboarding.py:79 + facebook_routes.py:177 | انظر §H4 |
| M1 | متوسط | `days/limit/page/per_page` غير مسقوفة في 25+ موقعاً (analytics/widgets/team/diagnostics/facebook/approvals) | انظر §M1 | انظر §M1 |
| M2 | متوسط | ~82 endpoint (من 239) بلا مستهلك واجهة إطلاقاً — 9 راوترات كاملة ميته + نقطة معطلة منطقياً | انظر §M2 | انظر §M2 |
| M3 | متوسط | pipeline النشر المجدول: `failed` لا يُثبَّت أبداً لمستأجر غير مربوط (detached) + 400-داخل-الحلقة يفقد نتائج منشورة (نشر مزدوج محتمل) | routers/bot.py + analytics.py | 228-230, 215 |
| M4 | متوسط | `datetime.fromisoformat(expires_at)` بلا catch → 500 خام عند صيغة تاريخ سيئة | routers/offers_routes.py | 40 |
| M5 | متوسط | تباين مساري إنشاء المنشور المجدول: `/api/publisher/publish` يقبل الماضي وتوقيت aware ولا يطبّع (أخوه `/api/scheduled-posts` يرفض/يطبّع) | routers/publisher_routes.py | 63-77 |
| M6 | متوسط | كعب كاذب: GET/PUT `/api/admin/notification-preferences` يردّد القيم ولا يخزن شيئاً | routers/auth.py | 399-414 |
| M7 | متوسط | سقف صامت 200 محادثة + ترقيم في الذاكرة في inbox — `total` مضلل للمستأجرين الكبار | routers/inbox.py | 118-124 |
| M8 | متوسط | تناقضات التاريخ/التنسيق: `utcnow()` المهجورة و`isoformat()+"Z"` في 4 مواقع بدل `iso_z` | alerts_routes/admin_routes/support | انظر §M8 |
| M9 | متوسط | أطوال نصية بلا حدود عليا (عائلة): هاتف/مرجع/اسم مرسل/وسوم/قواعد/تذاكر → صفوف عملاقة | انظر §M9 | انظر §M9 |
| M10 | متوسط | `_post_cursors`: dict عالمي (tenant,page) ينمو بلا تنظيف — نمو ذاكري قابل للتضخيم + حالة مشتركة | routers/facebook_routes.py | 31, 233-236 |
| L1 | منخفض | تسجيل الدخول لا يفحص `tenant.is_active` → جلسة تُمنح ثم 403 على كل طلب | routers/auth.py | 145 |
| L2 | منخفض | عقد 200-بدل-404: subscribe/unsubscribe ترجع `ok({ok:false})`؛ حذف معتمدي/أهداف تيليغرام يرد 200 دائماً | sequences.py:106/113، telegram_config.py:137/171 | — |
| L3 | منخفض | `"isActive" in body` مع `Body(None)` فارغ → TypeError 500 | routers/telegram_config.py | 164 |
| L4 | منخفض | `update_flow` يقبل `status` غير مُتحقق (قيم مهملة تُخزَّن) | routers/flows.py | 78-80 |
| L5 | منخفض | `crm_update` لا يستطيع تفريغ حقل + `stage` غير مُتحقق | routers/crm_routes.py | 93-102 |
| L6 | منخفض | `str(e)[:200]` يصل العميل في مسارات فيسبوك (تسريب نص أخطاء Graph الداخلية) | facebook_routes.py | 157, 225 |
| L7 | منخفض | سباق seed لـBrandConfig قد ينشئ صفّين عالميين | routers/brand_routes.py | 17-31 |
| L8 | منخفض | `db.get(SubscriptionPlan, "5")` (معرف نصي سليم) → None → 400 «الباقة غير موجودة» (مُثبت تجريبياً؛ ليس 500) | payments/plans.py | 105 |
| L9 | منخفض | `demo-test-comment` ببوابة tenant-admin بينما عائلته platform-admin (تباين، لا تسريب) | routers/diagnostics.py | 92-98 |
| L10 | منخفض | `create_user` بلا فحص محارف username (فحص طول فقط، بعكس register الذي يفحص regex) | routers/users.py | 30-31 |
| L11 | منخفض | مسار شحن المحفظة كله بلا واجهة ولا مسار HTTP للحسم (تيليغرام حصراً) — عدم تناسق معماري مع SubscriptionPayment | payments/wallet.py | 124-176 |
| L12 | منخفض | إشعار تذكرة الدعم عبر `spawn()` يموت على Vercel (الصف يبقى؛ إشعار الأدمن يضيع) | routers/support.py | 118 |

---

## 2) التفاصيل

### C1 — البث الجماعي لا يُرسل أبداً على Vercel (حرج)

- **الموقع:** `routers/broadcasts.py:96-99`
- **المقتطف:**
```python
bc_id = bcast_id
async def _send():
    async with AsyncSessionLocal() as s:
        await broadcast_engine.send_broadcast(bc_id, s)
spawn(_send())
return ok({"ok": True, "message": "Broadcast sending started"})
```
- **الجذر:** `spawn()` هو `asyncio.create_task` مع إشارة قوية فقط (`_async.py:52-66`) — لا آلية انتظار. على Vercel (بيئة الإنتاج المؤكدة: `vercel.json` framework=fastapi) تتجمد الدالة بعد كتابة الرد وتُعلَّق المهمة إلى الأبد. هذه **نفس حقيقة المنصة التي بنا عليها v14-E1 إصلاحه** («Vercel kills post-response tasks» — `wallet.py:27-31`) للإشعارات المالية، لكن البث لم يُصلَح بالمثل.
- **الأثر:** البث الجماعية ميزة **مدفوعة** (`SubscriptionPlan.has_broadcast`) — العميل يضغط «إرسال» في `/dashboard/broadcast`، يرى «بدأ الإرسال»، ويبقى الصف `draft` للأبد (الحالة يضبطها المحرك داخل `_send` التي لا تجري). النقر مجدداً مسموح (الفحص `status != "draft"` يمر). صمت كامل: لا خطأ، لا Sentry (المهمة لا تنتهي بخطأ بل تتجمد).
- **الإصلاح المقترح:** تشغيل الإرسال inline مثل `send_campaign` (marketing.py:194-202 الذي يشغّل `send_broadcast` داخل الطلب بنفس النمط) — أو على الأقل `await asyncio.wait_for(_send(), timeout=…)`. نفس الفحص يستحق أن يشمل بقية spawn-البنائية: `support.py:118` (L12) و`alerts_routes.py:69` و`bot.py:80` (إشعارات ws — تأثير تجميلي).

---

### H1 — عائلة المدخلات الخام → 500 + إنذار حرج لأخطاء عملاء (عالي)

`app/errors.py:29-42` يحوّل أي استثناء غير ملتقط إلى 500 + `report_critical` (سنتري + **إنذار تيليغرام حرج**). لذا كل مدخل غير متحقَّر من النوع أسفل يولّد: عقد خاطئ (500 بدل 400/422) + ضجيج إنذار حرج لذروة عميل. الجسم لا يسرب traceback (تم التحقق في p06) — المشكلة عقد + تشغيل.

**أ) تحويلات `int()/float()` غير محمية (500 مضمون تجريبياً — ValueError/TypeError):**

| الملف:السطر | المقتطف | المسار |
|---|---|---|
| payments/wallet.py:168 | `pr = await db.get(PaymentRequest, int(pid))` | POST /api/payments/confirm — **مال** |
| payments/wallet.py:130 | `if amount < 1 or amount > 10000:` (amount نصّي → TypeError) | POST /api/payments/topup — **مال** |
| payments/plans.py:108 | `float(amount) != float(plan.price)` | POST /api/subscriptions — **مال** |
| payments/plans.py:118 | `bank_amount = float(body.get("amount") or plan.price)` | نفسه (فرع bank) |
| payments/plans.py:218, 222 | `float(amount)` | POST /api/subscriptions/upgrade — **مال** |
| payments/approvals.py:105 | `SubscriptionPayment.id == int(payment_id or 0)` | POST /api/admin/subscriptions |
| auth.py:210 | `trial_plan = await db.get(SubscriptionPlan, int(trial_plan_id))` | POST /api/register |
| auth.py:330 | `User.id == int(user_id)` | POST /api/admin/reset-password |
| bot.py:132 | `shard = int(raw_shard) % _CRON_SHARDS` (ترويسة cron غير رقمية) | GET /api/cron/bot-cycle |

**ب) 18 موقعاً `await request.json()`** — JSON غير صالح → `JSONDecodeError` → 500 (المفروض 400): calendar_routes.py:30,48 · commerce_routes.py:26,53 · sequences.py:25,50,74,83 · facebook_routes.py:81 · broadcasts.py:53,78,115 · subscribers_tags_routes.py:41,61 · reports_routes.py:35 · flows.py:35,77,112.

**ج) 6 مواقع `body["key"]` بلا مفتاح → KeyError → 500** (المفروض 422 عربي مثل `validation_handler`): subscribers_tags_routes.py:42 (`body["tag_id"]`) و63 (`body["name"]`) · sequences.py:27 (`body["name"]`) · flows.py:37 (`body["name"]`) · calendar_routes.py:33 (`body["message"]`) · broadcasts.py:55 (`body["name"]`). (ملاحظة: `auth.py:326` و`admin_routes.py:489` و`telegram_config.py:125/153` محمية بفحص `"key" not in body` سابق — سليمة.)

- **الإصلاح المقترح (موجّه):** للمال (wallet/plans/approvals): Pydantic BaseModel مع `StrictInt/StrictFloat` أو تحويل ملفوف بـtry/except → 400 «قيمة غير صالحة». لـrequest.json(): حارس صغير `try: body = await request.json() except: raise HTTPException(400, "جسم الطلب JSON مطلوب")` (نسخة موحدة في `_utils`)، أو الانتقال إلى `Body(dict)` المُتحقق. كررها في مواقع KeyError بمفتاح مطلوب. بديل جذري: اعتماد payload models لكل راوترات Dict-الجسم دفعة واحدة (يعطي 422 العربية تلقائياً من validation_handler).

---

### H2 — مسارات المعالج بلا بوابات دور (عالي)

- **الموقع:** `routers/onboarding.py:54-58` و`:204-208`
- **المقتطف:**
```python
@router.post("/connect-page")
async def connect_page(body: ConnectPagePayload = Body(...), db=Depends(get_db),
                       current_user: User = Depends(get_current_user)):   # ← أي دور
```
```python
@router.post("/first-rule")
async def create_first_rule(body: FirstRulePayload = Body(...), db=Depends(get_db),
                            current_user: User = Depends(get_current_user)):  # ← أي دور
```
- **المشكلة:** كلا المسارين يعدّل حالة **المستأجر كله** (ربط fb_page_id/fb_access_token — وتشفير توكن المنشور! — وإنشاء قواعد رد تعمل فوراً `enabled=True`) بينما المساران الموازيان الرسميان يفرضان أدواراً: `facebook_routes.py:79` (PUT /api/facebook/settings) يتطلب **admin**، و`rules.py:65` (POST /api/rules) يتطلب **editor**. مستخدم بدور **viewer** (أدنى الهرم) يستطيع عبر API مباشرة: تغيير صفحة/توكن المستأجر كله، أو حقن قاعدة رد عاملة.
- **الشدة:** عالي — الثغرة تتطلب حساباً داخل المستأجر (ليست مجهولة)، لكنها قفزة صلاحيات واضحة (viewer → تعديل بنية الاتصال والردود للمستأجر) وتناسق كسير مع بقية السطح.
- **الإصلاح المقترح:** `require_role("admin")` على connect-page (مطابقة لمسار settings الموازي) و`require_role("editor")` على first-rule. سطر واحد لكل مسار + اختبار سالب لدور viewer (403).

---

### H3 — الحملات «المجدولة» لا تُرسل أبداً (عالي)

- **الموقع:** `routers/marketing.py:102-108, 117`
- **المقتطف:**
```python
if scheduled_at:
    try:
        sched = datetime.fromisoformat(str(scheduled_at))
        status = "scheduled"
    ...
    MarketingCampaign(..., status=status, scheduled_at=sched)
```
- **الإثبات:** استهلاك `scheduled_at` لـMarketingCampaign موجود في الملفين فقط: هذا المسار (الكاتب) ولا شيء آخر — `rg "MarketingCampaign"` في كامل fb_dashboard يطابق: `routers/marketing.py`، `routers/admin_routes.py` (حذف مستأجر فقط)، `models.py`. لا heartbeat ولا cron ولا محرك يلتقط حملة status=scheduled. أي عميل API ينشئ حملة مجدولة (العقد يسمح، والواجهة تعرض شارة «مجدولة» status badge في marketing/page.tsx:56) يحصل على حملة **لن تُرسل أبداً بصمت** — والحالة تعرض للمستخدم كأنها بانتظار موعد.
- **شواهد إضافية:** نموذج الواجهة لا يرسل `scheduled_at` (form = name/message/audience فقط، marketing/page.tsx:61) — المسار الميت يُختم من الطرفين.
- **الإصلاح المقترح:** (أ) مدقق مسبق: رفض `scheduled_at` بـ400 «الجدولة غير متاحة بعد» حتى يوجد مرسل، أو (ب) مد المرسل: خطوة في `/api/cron/heartbeat` تحوّل حملات scheduled المستحقة إلى إرسال (بنفس نمط sweep المنشورات) — الخيار (ب) الأنسب لأن نية الميزة معلنة في العقد والواجهة.

---

### H4 — D13-F1 (معروف مفتوح): الربط المزدوج 500 عبر مسارين + عائلة IntegrityError (عالي)

المعروف الموثق في v14 §6.2 — المطلوب هنا خريطته الكاملة وأشقاؤه:

**المسار 1 (الذي تختبره بطارية p06):** `routers/onboarding.py:51` insert + `:79` commit:
```python
db.add(BotState(tenant_id=tenant_id, key=key, value=value))   # _upsert_botstate
...
await db.commit()   # ← IntegrityError على uq_botstate_key_value
```
**المسار 2 (الموازي):** `routers/facebook_routes.py:125` insert (و`:124` تحديث row.value) + `:177` commit:
```python
db.add(BotState(tenant_id=tenant_id, key="fb_page_id", value=page_id))
...
await db.commit()
```
**القيد المسؤول:** `models.py:97-99` — `uq_botstate_key_value` فهرس فريد جزئي على (key, value) WHERE key='fb_page_id'. المصادر الأربعة الأخرى لرفض القيد نفسه: `facebook_routes.py:123` (row.value = page_id — UPDATE يخترق الفهرس الفريد أيضاً).

**أشقاء السباق (check-then-insert بلا التقاط IntegrityError → 500 عابر):**
| الموقع | القيد | التقييم |
|---|---|---|
| auth.py:198-224 (register: فحص ثم flush) | uq_user_tenant_username | سباق تسجيلين متزامنين → 500 |
| users.py:32-39 (create_user) | نفسه | سباق → 500 |
| inbox.py:290-298 (create_tag) | uq_ctag_tenant_name | سباق → 500 |
| crm_routes.py:69-77 (crm_create) | uq_customer_tenant_fbuser | سباق → 500 |
| telegram_config.py:126-131 (add_approver) | telegram_id فريد | **لديه فحص 409 مسبق** — السباق فقط يبقى → 500 نادر |

(المحركات سليمة: `subscriber_engine.py:288` و`sequence_engine.py:230` و`bot_engine/pipeline.py:264` و`_wallet.py:112` تلتقط IntegrityError.)

- **الإصلاح المقترح (خطة E واحدة):** (1) في المسارين: التفاف الـcommit بـ`except IntegrityError: rollback(); raise HTTPException(409, "هذه الصفحة مربوطة بمستأجر آخر — تواصل مع الدعم")` — يقلب بطارية p06 إلى `SIM_STRICT_409=1`. (2) للأشقاء: اعتماد نمط telegram (فحص 409 + التقاط IntegrityError → 400 عربي) أو upsert بـON CONFLICT. (3) ملاحظة معمارية: رفض الربط المزدوج عبر قيد DB فقط يترك المسار «اختبار ثم تأكيد» غائباً — إضافة فحص مسبق `select BotState where key='fb_page_id' and value=:page` يمنح رسالة أوضح و400/409 قبل أي تشفير.

---

### M1 — عائلة حدود الاستعلام غير المسقوفة (متوسط)

v14 قيّدت `days` في `/api/logs/clear` وper_page في subscribers/crm/inbox/broadcasts — بقيت هذه:

| الموقع | المقتطف | الأثر |
|---|---|---|
| analytics.py:23, 230, 236, 242, 254, 260, 273 | `days: int = Query(30)` بلا ge/le | days=100000 → مسح كامل؛ days=-1 → cutoff مستقبلي (نتائج فارغة بصمت) |
| analytics.py:149 | `format` غير مُتحقق + `days` بلا سقف | export كامل الجدول (CSV ضخم) |
| analytics.py:248, 267 | `limit: int = Query(10)` بلا ge/le | limit=10⁹ |
| widgets_routes.py:61, 80 | `days: int = Query(7)` | كما فوق |
| widgets_routes.py:102 | `limit: int = Query(10)` | كما فوق |
| team_routes.py:20 | `days: int = Query(7)` | كما فوق |
| diagnostics.py:50 | `limit: int = Query(20)` بلا ge/le | **تناقض داخلي**: logs/events بجواره مسقوفة `ge=1, le=500` (سطر 57 و73) |
| approvals.py:52 | `page: int = Query(1, ge=1)` بلا le (per_page ثابت 20) | offset ضخم — تكلفة فقط |
| facebook_routes.py:229 | `page: int = Query(1), per_page: int = Query(10)` بلا حدود | per_page=100000 → طلب Graph عملاق؛ page=0/سالب → سلوك cursor غريب |

- **الإصلاح المقترح:** توحيد `days: Query(30, ge=1, le=365)` (نفس عقد `/api/logs/clear` وreports/generate المسقوفين: bot.py:355, reports_routes.py:42) و`limit: Query(N, ge=1, le=…)`. سطر واحد لكل موقع — أو نمط `_pagination_defaults` مشترك.

### M2 — ~82 endpoint بلا مستهلك واجهة (متوسط — نظافة المنتج)

مطابقة استهلاك كاملة (frontend/src + e2e + scripts) — **9 راوترات كاملة (47 endpoint) صفر مستهلك واجهة**:

| الراوتر | endpoints الميتة | ملاحظات |
|---|---|---|
| routers/ai.py | 8 (ai/suggest, analyze, generate-reply, analyze-image, status + agent/interpret, memory, memory/clear) | اختبارات فقط |
| routers/sequences.py | 10 | كذلك — **والخطط تبيع has_sequences!** |
| routers/flows.py | 7 | كذلك — **والخطط تبيع has_flows!** |
| routers/widgets_routes.py | 5 | 1 ملف اختبار |
| routers/reports_routes.py | 5 (status, generate, schedule, schedules, delete) | صفحة reports تستخدم analytics فقط — محرك PDF كامل بلا مستهلك |
| routers/commerce_routes.py | 4 | ميت كلياً |
| routers/publisher_routes.py | 3 | النشر الفعلي يمر عبر scheduled-posts/facebook |
| routers/health_alerts_routes.py | 3 | كلياً |
| routers/brand_routes.py | 2 | كلياً |

**وجزئياً (~35 نقطة إضافية):** facebook 9 من 13 (كل /api/posts*, /api/publish, كل /api/messages*, ads/campaigns, ads/ads — الواجهة تستخدم inbox وads/accounts فقط) · bot 6 من 9 (status, interval, trigger, stop, restart, logs/clear) · analytics 7 من 11 (export وscheduler-check وdaily-trend وhourly-heatmap وtop-rules وsentiment-trend وpeak-hour) · team 3 من 4 · auth 4 من 15 (notification-preferences×2, audit/logs, GET /api/users) · users.py **3 من 3** (لا واجهة لإدارة أعضاء الفريق CRUD) · admin_routes 8 من 13 (rules/{id}/priority, cooldown, template-vars, rules-categories, cron/alert-test, repair, tenants DELETE, **platform/users PATCH — لا طريقة واجهة لمنح صلاحية مسؤول منصة مفوَّض أصلاً**) · webhooks 1 من 2 (events) · payments/wallet 2 من 4 (**topup وconfirm كلاهما بلا واجهة** — انظر L11) · crm 2 من 3 · inbox 5 من 9 (كل مسارات tags) · replies 2 من 5 (hide, delete) · broadcasts 3 من 7 (update, cancel, estimate).

**الحالة الخاصة القاتلة منطقياً:** `analytics.py:190-215` (POST /api/analytics/scheduler-check): `require_platform_admin` **ثم** `_tid = current_user._tenant_id` → لأدمن الإقلاع (tenant 0) الاستعلام `ScheduledPost.tenant_id == 0` = فارغ دائماً — النقطة الوحيدة المسموح لها لا ترى شيئاً (نمط عكس تناسق C-SEC1-قائمة v14 نفسه).

- **الإصلاح المقترح:** قرار منتج لكل عائلة: (أ) واجهة (flows/sequences ميزتان مدفوعتان في الخطط — إما UI أو إسقاط العلم من الخطط)، أو (ب) حذف الراوتر الميت (docs/v14 سبق حذف /api/stats و/api/env بنفس المنطق)، أو (c) وسم «API-only» موثّق. مع إصلاح scheduler-check (tid للحسم أو platform sweep واعٍ).

### M3 — pipeline النشر المجدول: lost-failed وdouble-publish (متوسط)

- **(أ) `routers/bot.py:228-230`:**
```python
fb = await get_tenant_fb_client(post.tenant_id)
if fb is None:
    post.status = "failed"      # ← detached: الجلسة الأولى أُغلقت عند السطر 223
    continue                    # ← لا جلسة ثانية ولا commit
```
منشور لمستأجر غير مربوط يبقى `scheduled` إلى الأبد ويُعاد فحصه **كل نبض** (5 دقائق) بلا نهاية — التعليم failed لا يصل DB أبداً (متغير detached). **الإصلاح:** جلسة `async with AsyncSessionLocal()` + تحديث الصف قبل continue (نفس نمط الفرع الناجح في الأسطر 235-244).
- **(ب) `routers/analytics.py:210-226` (scheduler-check):** `raise HTTPException(400, …)` **داخل** حلقة المنشورات (سطر 215 عند أول مستأجر بلا صفحة) — يجهض الدورة؛ تغييرات `post.status="published"` للمنشورات السابقة **غير مُلزَمة** (commit سطر 225 لا يصل) → أُعيد المحاولة → **نشر مكرر على فيسبوك** لما نُشر فعلاً. **الإصلاح:** commit تدريجي لكل منشور (أو تجميع الفشل في قائمة والرد بها) وعدم رفع HTTPException داخل حلقة mutation.

### M4 — `fromisoformat` بلا حارس في offers (متوسط)

- **الموقع:** `routers/offers_routes.py:40`
- **المقتطف:** `exp = datetime.fromisoformat(expires_at) if expires_at else None`
- `expires_at="31/12/2026"` (صيغة مستخدم شائعة) → ValueError → **500 خام** — بينما الراوتر الشقيق `calendar_routes.py:42-43` يلتقط ValueError بـ400، و`scheduled_posts_routes.py:56-57` كذلك، و`marketing.py:107-108` كذلك. offers هو الشاذ الوحيد.
- **الإصلاح:** try/except ValueError → `HTTPException(400, "صيغة تاريخ الانتهاء غير صالحة — استخدم ISO 8601")`.

### M5 — تباين مساري الجدولة (متوسط)

- **الموقع:** `routers/publisher_routes.py:63-77` مقابل `routers/scheduled_posts_routes.py:46-61`
- **التفاوتات:** (1) `/api/publisher/publish` بـ`scheduled_at` **لا يرفض الماضي** (أخوه يرفض: «لا يمكن جدولة منشور في الماضي»)؛ (2) لا يُطبّع التوقيت (`astimezone(UTC).replace(tzinfo=None)`) — قيمة aware تُخزَّن كما هي، بينما sweep النبض يقارن بـ`utcnow()` naive (bot.py:221) — على SQLite تُخزَّن كسلسلة نصية مع لاحقة الإزاحة فتفسد المقارنة السلسلية (نشر مبكر/متأخر بالإزاحة)؛ (3) `fromisoformat` هنا يقبل الصيغتين لكن بلا استبدال `Z/+0000` (أخوه يستبدل). نفس التفكك في `marketing.py:105` (aware بلا تطبيع — لكنه ميت حالياً بلا مرسل).
- **الإصلاح:** استخراج helper واحد `_parse_schedule(str) -> datetime|None` (تطبيع UTC-naive + رفض الماضي) واستخدامه في المسارين الثلاثة.

### M6 — كعب notification-preferences الكاذب (متوسط)

- **الموقع:** `routers/auth.py:399-414`
- **المقتطف (PUT):**
```python
async def update_notification_prefs(body: dict = Body(None), current_user: User = Depends(get_current_user)):
    return ok({
        "telegramNotifyOrders": body.get("telegramNotifyOrders", True) if body else True, ...
```
- GET يرد hardcoded True×3، وPUT **يردّد جسم العميل** دون تخزين أي شيء — عقد وهمي: أي واجهة مستقبلية ستصدق أن التفضيلات حُفظت ثم تعود True دائماً. (لا مستهلك حالياً — انظر M2.) التفضيلات الحقيقية تعيش في `alerts_routes.py:88-131` (6 مفاتيح مختلفة) — بقاء هذا الكعب يخلق مطب تسمية ثالث.
- **الإصلاح:** الحذف (نفس منطق حذف GET /api/users و/api/stats الميتة في v12-E2.8) أو إعادة توجيهه إلى عقد alerts_routes الحقيقي.

### M7 — سقف 200 الصامت في inbox (متوسط)

- **الموقع:** `routers/inbox.py:118-124`
- **المقتطف:**
```python
rows = (await s.execute(
    select(Conversation).where(Conversation.tenant_id == tenant_id)
    .order_by(Conversation.last_message_at.desc())
    .limit(200)          # ← سقف صامت
)).scalars().all()
```
ثم الفلترة (search/tag/status) **في الذاكرة** على 200 فقط (سطور 151-167) ثم الترقيم. لمستأجر فيه >200 محادثة: (أ) المحادثات الأقدم تختفي بصمت نهائياً؛ (ب) `total` = عدد المفلتر من 200 لا الحقيقي. الفلترة أيضاً لا تستفيد من فهارس DB.
- **الإصلاح:** نقل الفلاتر إلى SQL (status→unread_count، search→ilike على user_name/last_message_text، tag→join ConversationLabel) + `count()` حقيقي + offset/limit — أو على الأقل توثيق السقف في العقد وواجهة (زر «الأقدم غير متاح»).

### M8 — تناقضات datetime/ISO (متوسط)

- `alerts_routes.py:24`: `"created_at": a.created_at.isoformat() + "Z" if a.created_at else None` — بدل `iso_z` (يُستخدم في health_alerts_routes.py:27 لنفس الكيان!). سلسلة مختلفة البنية إن كانت القيمة aware.
- `admin_routes.py:470`: `u.created_at.isoformat() + "Z"` بدل iso_z (البقية كلها iso_z).
- `support.py:212, 238`: `t.updated_at = __import__("datetime").datetime.utcnow()` — `utcnow()` المهجورة (DeprecationWarning) + naive بدون tzinfo بينما `_utils.utcnow()` هو المعتمد، وimport داخل السطر.
- **الإصلاح:** استبدال موضعي بـ`iso_z` و`utcnow()` من `_utils` (4 مواقع).

### M9 — أطوال نصية بلا حدود عليا (متوسط — عائلة)

كل النصوص التالية تُخزَّن كما وردت بلا سقف (Form/JSON) → عميل واحد يستطيع خزن صفوف عملاقة (والتضخيم عبر rate-limit الدفع محدود لكن tags/templates/keywords مفتوحة): auth.py:189 (`name` عند register — بدون سقف بينما username محدود 32) · wallet.py:135-136 (phone: حد أدنى 7 **بلا أعلى**) و173 (reference) · plans.py:123-124 (sender_name/sender_account) · rules.py:61-64 (name/keywords/reply_template/description) · templates_routes.py:31-33 · offers_routes.py:36-38 (title/code/description) · support.py:93-95 (body — subject مسقوف 200 بينما الرسالة لا) · inbox.py:285-296 (tag name/color بلا فحص طول أو صيغة hex) · crm_routes.py:61-63 (fb_user_id) · telegram_config.py:125 (telegram_id بلا سقف — العمود String(50)) · users.py:23-31 (password بلا حد أعلى — argon2 على 10MB). **الإصلاح:** `max_length` على كل Form/Field أو تعمية/قطع مركزي — حزمة واحدة.

### M10 — `_post_cursors` نمو ذاكري غير محدود (متوسط)

- **الموقع:** `routers/facebook_routes.py:31, 233-236`
- **المقتطف:**
```python
_post_cursors: dict[tuple[int, int], str] = {}
...
if paging and paging.get("cursors", {}).get("after"):
    _post_cursors[(tid, page)] = paging["cursors"]["after"]
```
- المستخدم يطلب `/api/posts?page=1..N` — كل (tenant, page) فريد يضاف **ولا يُحذف أبداً**؛ مستخدم مصادق يستطيع ضخ 100k مدخل بطلبات متتابعة (page=1..100000) → نمو ذاكري غير محدود في العملية (single-worker uvicorn). كما أن الحالة مشتركة بين مستخدمي المستأجر نفسه (مستخدمان يقلبان الصفحات يفسدان مؤشر بعضهما).
- **الإصلاح:** سقف حجم مع LRU (مثل `functools.lru_cache` أو قص إلى 256 مدخل مع إزالة الأقدم) + مفتاح يشمل user_id أو توليد cursor من معلمات الطلب.

---

## 3) المنخفضة (تفصيل مختصر)

- **L1** — `auth.py:145`: login يتحقق من كلمة المرور فقط؛ لا فحص `tenant.is_active` (الموجود في `get_current_user:80-83`). مستأجر موقوف: تسجيل دخول ناجح + كوكي ثم 403 على كل طلب — تجربة مشوشة (رسالة الإيقاف لا تظهر عند الدخول). الإصلاح: نفس فحص get_current_user قبل منح الكوكي.
- **L2** — `sequences.py:104-114`: subscribe/unsubscribe ترجع `ok({"ok": done})` دائماً 200 حتى حين فشل (المستهلك لا يميز)؛ و`telegram_config.py:135-139, 169-173`: DELETE معتمد/هدف يرد 200 دائماً حتى لمعرف غير موجود (بعكس `remove_approver` في telegram… لا، هو أيضاً 200 — لكن `update_target:163` يرد 404 سليماً). توحيد: 404 عند غياب الهدف.
- **L3** — `telegram_config.py:160-165`: `update_target(target_id, body: dict = Body(None))` ثم `if "isActive" in body` — جسم غائب → `TypeError: argument of type 'NoneType' is not iterable` → 500. (أشقاؤه في الملف محميون بـ`if not body`.) الإصلاح: `body = body or {}`.
- **L4** — `flows.py:78-80`: تحديث whitelist لخمسة مفاتيح لكن `status` غير مُتحقق — أي سلسلة تُخزَّن، و`ST_CYCLE.get` في toggle يتخطاها لاحقاً (حالة غير قابلة للتبديل). الإصلاح: whitelist قيم {draft, active, paused}.
- **L5** — `crm_routes.py:93-102`: تحديث truthy-only (`if notes: c.notes = notes`) يمنع التفريغ (لا يمكن مسح ملاحظة) + `stage` غير whitelist. الإصلاح: `if "notes" in body` شكلاً + whitelist للمراحل.
- **L6** — `facebook_routes.py:157, 225`: `str(e)[:200]` يصل العميل (رسائل أخطاء Graph + أحياناً تفاصيل شبكة). سابقة v12-E2.13 (healthz) تعدّت هذا تسريباً. الإصلاح: تسجيل كامل + رسالة عامة.
- **L7** — `brand_routes.py:17-31`: seed-on-first-GET بدون قيد فريد — طلبان متزامنان أول أمرين ينشئان صفّي BrandConfig؛ لاحقاً كل التعديلات تطال الأول فقط (الثاني أشباح). الإصلاح: قيد فريد أو get-or-create ذري.
- **L8** — `payments/plans.py:105` (مُثبت تجريبياً على SQLAlchemy 2.0.52): `db.get(SubscriptionPlan, "5")` → None (لا استثناء ولا مطابقة) → 400 «الباقة غير موجودة» لمعرف سليم أُرسل نصياً. الإصلاح: `int(plan_id or 0)` بـtry أو StrictInt.
- **L9** — `diagnostics.py:92-98`: `demo-test-comment` ببوابة `require_role("admin")` (أدمن مستأجر) بينما باقي العائلة platform-admin — المسار نفسه غير مسرب (تصنيف محلي فقط) لكنه تباين وصول بمنطق «أدوات تشخيص المنصة». الإصلاح: توحيد البوابة.
- **L10** — `users.py:30-31`: فحص طول username 3-32 **بلا** فحص محارف (register يفحص `^[\w.-]+$` — auth.py:194) → اسم بمسافات/رموز عبر مسار الفريق. الإصلاح: نفس regex.
- **L11** — `payments/wallet.py:124-176`: مسار شحن المحفظة (topup/confirm) بلا أي مستهلك واجهة (billing يقرأ balance/history فقط؛ الدفع عبر /api/subscriptions) — والحسم الوحيد للـPaymentRequest عبر تيليغرام (app/telegram.py:124-146) بلا مسار HTTP موازٍ (على عكس SubscriptionPayment الذي حُسم عبر approvals بعد C-SEC1). ملاحظة معمارية: قناة واحدة للحسم = انقطاع تيليغرام يجمّد المحافظ.
- **L12** — `support.py:118`: `spawn(notify_admins_support_ticket(...))` — على Vercel يموت الإشعار بعد الرد (نفس جذر C1) — التذكرة نفسها محفوظة (flush+commit قبل spawn) لذا التأثير فقدان التنبيه فقط. الإصلاح: نفس دواء C1 (inline بtimeout قصير).

---

## 4) ما تحقق سليماً (شهادات سالبة — لتوثيق الثقة)

1. **IDOR: صفر ثقوب جديدة** — كل 40+ مسار بحث/تعديل بمفتاح يفحص `tenant_id` (أو ملكية user) قبل الرد؛ الاستثناءات platform-admin بوعي. عينات تحقق يدوي: notifications.py:79، support.py:172/205/235، payments (status/sse/receipt)، marketing:154/241/259، inbox (assign/remove tag v9-A3)، users.py:48/72، admin reset-password:330-332.
2. **لا تسجيلات مسارات مكررة** — مسح AST لـ239 مزخرفة: صفر تعارض (تكرار /api/support/info الظاهري هو تعليق docstring لا مسار).
3. **عقد ok/`fail` ملتزم** في كل 239 endpoint (خارج الاستثناءات الموثقة: PDF/CSV/SSE/healthz) — لا ردود خام جديدة.
4. **حذف المستأجر GDPR كامل** — تحقق الجداول: كل 39 جدولاً scoped + SupportTicketReply عبر استعلام فرعي + User + Tenant (admin_routes.py:366-384) — لا جدول scoped متبقٍ.
5. **CSRF/session**: لا مسار POST حساس بلا المصادقة؛ logout يسوديد jti؛ token_ver مرفوع في كل مسارات تغيير كلمة المرور الثلاثة.
6. **اختبار تحويل الأنواع التجريبي** أثبت أن `db.get` بمفتاح نصي لا يسبب 500 (رُقّي إلى L8) وأن int/float تسببه (H1).

## 5) ملاحظات عابرة للنطاقات (للمنسّق)

- **C1/L12 تخص نشر Vercel وليس الراوترات فقط** — نفس عائلة «v14-E1 #3». أي إصلاح يجب أن يمس الدلالة (inline مقابل spawn) عبر broadcasts + support + (ws الإشعارات الاختيارية).
- **H4 يتطلب لمسة D7 (ترحيلات/قيد)**: فحص مسبق في المسارين أو ON CONFLICT — تنسيق مع مالك models.py.
- **M2 (الميت واجهياً) قرار منتج قبل أن يكون كوداً**: has_flows/has_sequences/has_reports أعلام مدفوعة بلا UI — يحتاج رأي المالك (واجهة أم إسقاط علم من الخطط أم حذف). D4 (الواجهة) لديه نصف الصورة الآخر.
- **H1/H3/M3 يصطادون «تشغيل صامت»** — كلها ستختفي من سنتري/تيليغرام فقط عند إغلاق H1 (500ات العميل) — أولوية تشغيلية عالية لخفض ضجيج الإنذار قبل بطارية الإنتاج.
- **الاختبارات**: يفتقد المستودع اختبارات سالبة لكل عائلة H1 (مدخلات سيئة → 400 لا 500) — رصيد E جاهز.
