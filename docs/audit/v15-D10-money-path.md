# v15-D10 — تدقيق مسار المال والبوت من طرف إلى طرف (رحلة مشترك ماسنجر من أول رسالة حتى الرد المفوتر)

**الوكيل:** D10 (money-path) · **الأساس:** main @ 558623b3 · **الطبيعة:** بحث/تدقيق فقط — لا كود تطبيق.
**المنهج:** قراءة سطراً بسطر للمسار الكامل: `app/webhooks.py` → `messenger_service.py` → `bot_engine/(engine|pipeline|cooldown|matching)` → `fb_client.py` (Graph API) → `UsageCounter` → (`routers/payments/*` (plans/approvals/sse/wallet) + `app/telegram.py` + `routers/auth.py` + `app/startup.py` + `routers/onboarding.py` + `routers/facebook_routes.py` + `routers/bot.py` + `routers/inbox.py` + `broadcast_engine.py` + `routers/marketing.py` + `monitor.py` + `routers/notifications.py`) + تتبع المتصلين في الواجهة (OnboardingWizard/PaymentDialog/billing/pages) + تحقق آلي بـ grep لكل مواضع `max_replies/has_dm/has_broadcast/has_ai/UsageCounter/Customer(/subscribe_page_webhooks/credit_wallet`.

**القاعدة الملتزمة:** ما أُغلق في v14 أو أُحصي في v15 (D1/D2/D3/D4/D6/D7) لا يُعاد عده — يُثبَت أو يُنفى فقط عند تكليفي الصريح به (عدّاد الردود + حدود الخطة)، ويُسنَد للمصدر.

---

## 0) الحصيلة

| الشدة | العدد | الأبرز |
|---|---|---|
| حرج | 1 | C1: معالج الربط (wizard) لا يشترك في webhooks الصفحة أبداً → البوت ميت من أول رسالة |
| عالي | 5 | H1 انتهاء غير متناظر (PAID منتهٍ يردّ للأبد على webhook؛ EXPIRED_TRIAL رد واحد ثم صمت) · H2 التجربة المجانية ميتة طرفاً لطرفاً · H3 المحفظة بلا مسار خصم (فخ مال) · H4 رسائل الماسنجر لا تُنشئ leads أبداً · H5 لا إشعار انتهاء/تجديد إطلاقاً |
| متوسط | 8 | M1 سجلات التعليقات بلا tenant_id (عمى المستأجر عن فشل التوكن) · M2 ربط جزئي → AttributeError صامت · M3 البث الجماعي ميّت سياسةً خارج نافذة 24h · M4 تعليقات webhook تتجاوز سقف 5/دقيقة · M5 رد مزدوج عبر الحوادث المتزامنة (multi-instance) · M6 عدّاد بدون قفل/بدون تصفير عند التفعيل · M7 حارس _is_recent ميت (timestamp بمكان خاطئ) · M8 سوء استخدام POST_PURCHASE_UPDATE tag |
| منخفض | 6 | L1..L6 (تفاصيل أدناه) |

**مجموع الإيجادات الجديدة: 20** + ملحق إثبات رسمي لادعاءَي D2 (H1/H3) بمسار بمسار (§4) + مصفوفة تجربة العميل النهائي (§5) + قائمة «تحقق من صحته» (§6).

---

## 1) الحرجة

### C1 — معالج الربط في onboarding لا يستدعي `subscribe_page_webhooks` → الصفحات المربوطة عبر المعالج لا تصلها أحداث فيسبوك أبداً

- **المواقع:**
  - `fb_dashboard/routers/onboarding.py:70-79` — `connect_page` يخزّن `fb_page_id/fb_page_name/fb_access_token` (Fernet) ثم يعيد `ok` — **بلا أي استدعاء اشتراك**:
    ```python
    if body.page_id:
        await _upsert_botstate(db, current_user.tenant_id, "fb_page_id", body.page_id.strip())
    ...
    if body.access_token:
        await _upsert_botstate(db, current_user.tenant_id, "fb_access_token", encrypt_token(...))
    await db.commit()
    return ok({"page_id": body.page_id})
    ```
  - `fb_client.py:349-355` — `subscribe_page_webhooks()` (POST `/{page-id}/subscribed_apps`) له **متصل واحد في كل المستودع**: `routers/facebook_routes.py:146-157` (PUT `/api/facebook/settings`).
  - الواجهة: `frontend/src/app/onboarding/OnboardingWizard.tsx:216-227` — الخطوة 1→2 تستدعي `/api/onboarding/connect-page` **فقط**؛ مسارا `/connect` (connect/page.tsx:91,122) و`/dashboard/pages` (pages/page.tsx:43) هما اللذان يستعملان PUT `/api/facebook/settings` (المشترك). المعالج لا يمر بهما (onComplete → dashboard/subscribe).
- **الإثبات:** grep شامل: `subscribe_page_webhooks` = تعريف + متصل واحد. لا cron ولا heartbeat ولا أي مسار آخر يشترك.
- **الأثر (مسار المال):** المشترك الذي يسجل → يكمل المعالج (الخطوة الرسمية للربط) → يدفع → **فيسبوك لا يرسل أي حدث للصفحة** (لا messaging ولا feed) → صفر رسائل، صفر ردود آلية، صفر جمهور — «كل شيء أصفار» رغم أن كل شيء «يعمل» في الواجهة. العميل الليبي يكتب للصفحة → صمت مطلق. الرد الوحيد الذي يعمل هو دورة `cycle()` (تجلب التعليقات بالسحب polling) — وهي **لا تعمل على Vercel** (startup.py:240 `not _IS_VERCEL`) إلا عبر heartbeat cron-job.org الخارجي أو نبضة 04:00 اليومية. أي أن القناة الوحيدة الشغّالة لعملاء المعالج هي سحب التعليقات المُجدولة خارجياً — والرسائل (messenger) **لا تُسحب أبداً** في أي دورة (cycle يجلب posts+comments فقط، engine.py:128-144).
- **لماذا لم تلتقطها بطارية v14؟** لأن `sim/helpers/webhook.ts` يرسل الأحداث مباشرة إلى `POST /webhook` بتوقيع HMAC — الاشتراك في subscribed_apps غير مطلوب في المحاكاة. الفجوة بين المحاكاة والإنتاج حرفياً هنا.
- **الإصلاح المقترح:** (1) في `connect_page`: بعد تخزين page_id+token معاً (وبعد نجاح `test-connection` اختيارياً) استدعِ `FBClient(token, page_id).subscribe_page_webhooks()` وأعد النتيجة في الاستجابة (نجاح/فشل رسالة عربية صريحة) — نفس نمط PUT settings؛ (2) توحيد المسارين: اجعل المعالج يستدعي PUT `/api/facebook/settings` بدل نقطة نصفية ثانية؛ (3) اختبار تكاملي: بعد connect-page، مسجل Graph الوهمي يجب أن يستقبل `subscribed_apps` مرة واحدة على الأقل؛ (4) تشخيص ذاتي: `/api/webhook/check` يقرأ فعلياً `subscribed_fields` من Graph (routers/webhooks.py:85-108) — اربطه بلوحة الصفحات بشرح عربي (D4 وثّق أن toast النجاح الحالي مضلل).

---

## 2) العالية

### H1 — منطق انتهاء الاشتراك غير متناظر ومتناقض مع توثيقه: PAID منتهٍ يردّ إلى الأبد على مسار webhook؛ وEXPIRED_TRIAL يردّ مرة واحدة ثم يموت صامتاً

- **المواقع:** `bot_engine/engine.py:269-287` — `_subscription_active` (بوابة webhook الرسمية §5.18):
  ```python
  if tenant.subscription_status == "REJECTED":
      return False
  if tenant.subscription_status == "UNPAID" and tenant.plan_end and utcnow() > tenant.plan_end:
      return False
  if tenant.plan_end and utcnow() > tenant.plan_end:
      if tenant.subscription_status == "TRIAL":
          tenant.subscription_status = "EXPIRED_TRIAL"
          await session.commit()
          return True  # basic auto-replies stay on
      if tenant.subscription_status not in ("FREE", "PAID"):
          return False
  return True
  ```
- **الإثباتان:**
  1. **PAID + plan_end ماضٍ:** يسقط عبر الفرع الثالث: «PAID» موجود في `("FREE","PAID")` → لا يُرفض → `return True` — **الردود تستمر بلا حد زمني** على مسار رسائل webhook. التحويل إلى UNPAID يحدث فقط داخل `cycle()` (engine.py:101-104) — وهي لا تعمل على Vercel إلا عبر cron-job.org الخارجي أو نبضة 04:00 اليومية (vercel.json:93-102 لا يحوي bot-cycle؛ راجع routers/bot.py:169-182 docstring «cron-job.org 5-min beats»). فإذا مات cron-job.org: مستأجر مدفوع انتهى بالأمس يظل يرد مجاناً حتى 24 ساعة، أو إلى الأبد في الحد الأقصى العملي.
  2. **EXPIRED_TRIAL:** أول حدث بعد الانتهاء يحوّل TRIAL→EXPIRED_TRIAL ويردّ (return True). الحدث الثاني: الحالة EXPIRED_TRIAL ليست TRIAL وليست في (FREE, PAID) → `return False` — **رد واحد فقط ثم صمت دائم**، بينما التعليق الموثق (engine.py:95-97 وauth.py:206-207: «basic auto-replies stay») يعد ببقائها. نفس التناقض في `cycle()`: الدورة التي تحوّل TRIAL→EXPIRED_TRIAL تكمل (ترسل)، والدورة التالية تحوّلها إلى UNPAID وتتوقف (engine.py:101-105).
- **الأثر (المال):** (أ) تسريب خدمة مدفوعة بعد الانتهاء على مسار الدفع الأساسي (webhook) — بلا موعد نهائي موثوق؛ (ب) التجربة المنتهية تعطي رداً واحداً «محظوظاً» ثم تموت — سلوك غير قابل للتفسير للعميل وللمشترك، والتعليقات الكودية تمنع اكتشافه. ملاحظة: اليوم هذا مسار كامن لأن التجربة نفسها ميتة (H2) — لكن أي إصلاح للتجربة سيوقعه فوراً.
- **الإصلاح المقترح:** (1) توحيد البوابة: انتهاء PAID → تحويل ذاتي إلى UNPAID داخل `_subscription_active` نفسها (self-heal مثل cycle) بدل الاعتماد على دورة خارجية؛ (2) إما تنفيذ الوعد (EXPIRED_TRIAL ضمن الحالات المسموح أساسياتها) أو تعديل الوثائق/الحالة — القرار منتجي، موثّق في ledger؛ (3) اختبارات وحدة لتوليفات (status × plan_end) السبع — لا توجد اليوم لأي من هذه الفروع (انظر D7).

### H2 — التجربة المجانية (Trial §2.5) ميتة من طرف إلى طرف: لا خطة تملك trial_days، والواجهة لا ترسل plan_id أصلاً

- **المواقع:**
  - `app/startup.py:105-155` — الخطط القانونية الخمس **لا تتضمن `trial_days`** → العمود يبقى 0 (alembic 005: server_default="0").
  - `routers/auth.py:206-216` — مسار التفعيل مشروط `(trial_plan.trial_days or 0) > 0` — مستحيل مع البذر الحالي.
  - `frontend/src/app/register/RegisterForm.tsx:96` — جسم التسجيل `{username, email, password}` فقط؛ لا `plan_id`.
- **الأثر (المال):** قمع التحويل الفعلي هو: تسجيل → «مستأجر طازج UNPAID بلا خطة» (بوابة `_subscription_active` تسمح — engine.py:269-275 docstring) → دفع مباشر. لا فترة سماح مجانية محدودة، ولا ترقية تدريجية — والمستأجر الطازج أصلاً يحصل على كل شيء بلا حدود (تأكيد D2-H1 في §4) فلا معنى لبيع التجربة. الميزة معلنة في الخطة/الكود (EXPIRED_TRIAL، §2.5، §2.6) ولا سبيل للوصول إليها.
- **الإصلاح المقترح:** قرار منتجي: (أ) بذر `trial_days` (مثلاً 7 على Basic) + إرسال plan_id من التسجيل أو من /subscribe قبل الدفع، **مع إغلاق H1 وD2-H1 أولاً** وإلا صارت التجربة نافذة «كل شيء مجاناً»؛ أو (ب) حذف مسار الكود الميت. في الحالتين: اختبار يثبت المسار المختار.

### H3 — المحفظة (wallet) بلا مسار خصم: مال يدخل ولا يخرج — فخ استرداد

- **المواقع:**
  - `fb_dashboard/_wallet.py:75` — `credit_wallet` هي **الوحيدة** التي تعدّل الرصيد (إضافة فقط)؛ لا يوجد `debit` في المستودع.
  - `app/telegram.py:139-147` — القناة الوحيدة التي تضيف رصيداً (موافقة pay_).
  - `routers/payments/wallet.py:124-176` — topup/confirm (إنشاء PaymentRequest + موافقة أدمن → credit)؛ **لا نقطة نهاية تحوّل الرصيد إلى اشتراك**.
  - `routers/payments/plans.py:75-176,190-265` — الدفع للاشتراك/الترقية يتطلب تحويلاً جديداً + موافقة أدمن؛ لا يقرأ الرصيد إطلاقاً.
  - الواجهة: `dashboard/billing/page.tsx:68-79` تعرض «الرصيد الحالي» بارز، و`dashboard/support/page.tsx:56-57` تسأل «كيف أشحن رصيدي؟» — توحي برصيد قابل للإنفاق.
- **الأثر (المال):** عميل يشحن محفظته (يدفع فعلياً عبر ليبيانا/مدار) → الرصيد يظهر في الفواتير → **لا شيء في المنتج يمكن شراؤه به**. الاشتراك يتطلب حوالة جديدة كاملة. النتيجة: تذاكر دعم، طلبات استرداد، وثقة مالية مهدورة — مع أن المسار الآخر (اشتراك مباشر بموافقة أدمن) يعمل.
- **الإصلاح المقترح:** (أ) نقطة نهاية `POST /api/subscriptions/from-balance` (خصم ذرّي واحد بـ UPDATE شرطي يمنع السحب المزدوج، بنمط credit_wallet المعكوس + تفعيل بنفس معاملة الموافقة) أو (ب) إزالة عرض المحفظة/الشحن من الواجهة حتى يوجد مسار إنفاق. القرار منتجي؛ الحالة الحالية هي الأسوأ (نصف ميزة مالية).

### H4 — مسار الماسنجر (الرحلة الأساسية) لا يُنشئ leads/CRM أبداً — قيمة CRM محصورة في التعليقات فقط

- **المواقع:**
  - `bot_engine/engine.py:326-499` — `process_single_message` كامل: مطابقة/إرسال/عدّ/سجلات — **لا يذكر `Customer` إطلاقاً** (grep: إنشاء `Customer(` في موضعين فقط).
  - `bot_engine/pipeline.py:279-309` — إنشاء lead فقط في مسار **التعليقات**، فقط للنوايا البيعية (`price_inquiry/subscription/order/contact`)، وفقط بعد نجاح الإرسال وتسجيل Reply (المرحلة 10 بعد المرحلة 9).
  - `routers/crm_routes.py:74` — الإنشاء اليدوي الوحيد.
- **الأثر (المال):** في ليبيا الرحلة الغالبة هي مراسلة الصفحة مباشرة (DM). عميل يسأل عن السعر في الماسنجر — أثمن lead ممكن — **لا يظهر أبداً** في لوحة leads. v14-R3 وثّق أن مسار التعليقات يحتاج توكن حقيقاً ليكتمل الإنشاء؛ الحقيقة الكاملة أوسع: **حتى بتوكن حقيقي، مسار الرسائل لا يحاول أصلاً**. لوحة leads فارغة لأي نشاط messenger-first، والمبيعات المبنية عليها ميتة.
- **الإصلاح المقترح:** تكرار منطق المرحلة 10 (تصنيف النية → إنشاء/تحديث Customer بtenant المستأجر) بعد نجاح رد الماسنجر، وبحد أدنى: تسجيل lead خام عند أول رسالة واردة (بدون اشتراط نجاح الرد — الإخفاق في الرد لا يعني أن العميل ليس leadاً). + اختبار: رسالة واردة بنية price_inquiry → صف Customer جديد بنفس tenant.

### H5 — لا إشعار انتهاء اشتراك/تجديد لأحد: الانتهاء صامت للمشترك ولعميله

- **المواقع:**
  - التحويلات الصامتة الوحيدة للانتهاء: `engine.py:93-105` (داخل cycle) و`engine.py:280-286` (داخل `_subscription_active`) — تغيير حالة بلا `push_notification`/BotLog/برقية.
  - `push_notification` (routers/notifications.py:25-35، docstring «Used by payment approval/rejection, support replies, campaign sends») — لا متصل يشغّله عند الانتهاء.
  - grep «تجديد/انتهاء/انتهى/renewal» في كل fb_dashboard: مطابقات فقط في مفاتيح نوايا enhanced_intent وmodels — **لا مسار إشعار انتهاء إطلاقاً**.
  - الواجهة: لا عرض لـ `plan_end`/تاريخ الانتهاء في أي صفحة (grep `plan_end` في src = صفر).
- **الأثر (المال):** البائع (المشترك) يدفع شهراً؛ بعد 30 يوماً يتوقف البوت (أو يستمر — H1) **بلا رسالة واحدة**: لا «اشتراكك انتهى — جدّد الآن»، ولا إشعار، ولا حتى تاريخ انتهاء مرئي في الفواتير. عملاؤه يتكلمون مع صفحة صامتة. النتيجة: churn غير مرئي تماماً — أعلى كلفة ممكنة في SaaS اشتراكات.
- **الإصلاح المقترح:** عند نقطة التحويل الموحدة (بعد إصلاح H1): `push_notification` عربية («انتهى اشتراك باقة X — جدّد من /dashboard/billing» + رابط) + BotLog INFO لل tenant + (اختياري) برقية Telegram لأدمن المنصة بقائمة المنتهين؛ وعرض تاريخ plan_end في صفحة الفواتير.

---

## 3) المتوسطة

### M1 — كل سجلات monitor (مسبل خطأ إرسال التعليقات) تُكتب بلا tenant_id → عمى المستأجر عن فشل التوكن في نصف مسار الردود

- **المواقع:** `monitor.py:96-104` (كل `_emit` يُدفَع إلى `_botlog_batch`) و`monitor.py:18-36` (`_flush_botlog` → `session.add(BotLog(level=..., message=...))` — **بلا tenant_id**)؛ القارئ `routers/bot.py:333-343` يرشّح `BotLog.tenant_id == current_user._tenant_id` → هذه الصفوف (default 0) لا تظهر لأي مستأجر.
- **الأثر:** «التلمتريا الصادقة» (v3 §4.3) موجودة فعلاً في مسار الماسنجر (engine.py:445-457 يكتب BotLog بtenant)، لكن مسار **التعليقات** (pipeline.py:186-191 `self._mon.error("✗ send failed...")`) يمر عبر monitor → صف بلا tenant → **المشترك لا يرى أبداً أن توكنه منتهٍ** في قناة التعليقات، بينما يراها في الرسائل. امتداد عائلة D2-M11 (الذي أحصى engine.py:564 فقط) — موضع كتابة مختلف وأثر أوسع.
- **الإصلاح:** تمرير tenant_id في LogEvent (حقل جديد) → `_flush_botlog` يكتبه؛ أو تحويل كل كتابة سجل المسار الحرج إلى الكتابة المباشرة بtenant (نمط engine.py:452).

### M2 — الربط الجزئي (page_id بلا توكن) يجعل مسار الرد ينهار بـ AttributeError صامتاً

- **المواقع:** حفظ page_id بدون توكن مسموح في `routers/facebook_routes.py:115-125` و`routers/onboarding.py:70-73` (كل if مستقل). عندها `get_tenant_fb_client` يعيد None (`_services.py:348-349`) → `messenger_service.handle_messaging_event(fb_client=None)` → `get_bot_engine(None, …)` (engine.fb=None) → `engine.py:426` `result = await self.fb.send_dm(...)` → **AttributeError** → يُبتلع في `messenger_service.py:300-301` (log.exception للسيرفر فقط، بلا BotLog/إشعار).
- **الأثر:** رسائل العميل تُخزَّن (المحادثة تظهر!) لكن لا رد أبداً ولا أي إشارة للمشترك — حالة «الربط قبل اكتماله» حرفياً (بند الحواف في التكليف). العميل: صمت. المشترك: رسائل بلا ردود بلا تفسير.
- **الإصلاح:** حارس في `process_single_message` (`if self.fb is None: BotLog WARN عربي «توكن الصفحة غير مربوط — اربطه من /connect» + return`) + الواجهة تمنع حفظ page_id دون توكن (أو تعلّم الاكتمال كخطوة واحدة).

### M3 — البث الجماعي (ميزة مدفوعة) ميّت سياسةً خارج نافذة 24 ساعة: إرسال بلا messaging tag

- **الموقع:** `broadcast_engine.py:324` — `result_data = await tenant_fb.send_dm(sub.fb_user_id, msg)` → الوضع الافتراضي `messaging_type="RESPONSE"` (fb_client.py:239-246) — مسموح فقط خلال 24h من آخر رسالة من العميل. لا `tag` ولا تعامل مع code 10.
- **الأثر:** جمهور Subscriber نموذجي (آخر تفاعل قديم) → الغالبية الساحقة تفشل بcode 10 (تُحسب failed بأمانة) — الميزة المعلنة «بث جماعي للرسائل» (Premium/Pro/Enterprise) **غير قابلة للتسليم فعلياً** إلا لمن راسل خلال يوم. يتكامل مع D1-C1 (البث لا يُرسل أصلاً على Vercel عبر spawn) — عطلان من جهتين.
- **الإصلاح:** خيار tag صريح في نموذج البث (ACCOUNT_UPDATE/POST_PURCHASE_UPDATE ضمن سياسة Meta، بلا محتوى تسويقي) + تقرير عربي في النتيجة («وصل N — خارج نافذة 24h: M») بدل failed خام.

### M4 — تعليقات webhook تتجاوز سقف 5 ردود/دقيقة لكل منشور (السقف cycle-only)

- **المواقع:** السقف محلي داخل الذاكرة: `engine.py:68-78` (`_check_rate_limit`/`_mark_replied`) — يُستدعى **فقط من حلقة cycle** (engine.py:137-144). مسار `process_single_comment` (engine.py:237-254 → webhooks.py:211-214) **لا يفحصه ولا يعلّمه**.
- **الأثر:** خيط تعليقات نشط عبر webhook = ردود غير محدودة (يحدّها فقط cooldown لكل مستخدم 60s) — مخالفة صريحة لسقف 5/دقيقة المصمم لحماية الصفحة من حظر فيسبوك، وسبام منظور للعملاء.
- **الإصلاح:** استدعاء `_check_rate_limit`/`_mark_replied` داخل `_process_comment` (مشترك بين المسارين)، أو نقل الفحص إلى pipeline.

### M5 — رد مزدوج على نفس التعليق عبر الحوادث المتزامنة (multi-instance على Vercel)

- **المواقع/السلسلة:** webhooks.py:185-216 يستقبل التعليق (persist بمعاملة مستقلة — IntegrityError عند التزامن يُبتلع ب`log.warning` ثم **يستمر إلى المحرك** على الحادثتين) → pipeline: dedup في الذاكرة لكل عملية (TTL 300s) + `_load_replied_ids` (48h من جدول Reply) قبل الإرسال (engine.py:232-233) → إذا كانت الحادثة الأولى قد **أرسلت ولم تُلتزم بعد** (pipeline.py:169→263: الإرسال يسبق commit بمرحلتين) → الحادثة الثانية ترسل أيضاً → العميل يرى ردين متطابقين؛ القيد `uq_reply_tenant_comment` (models.py:52) يمنع الصف الثاني (pipeline.py:264-267 «DB dedup») **بعد فوات الأوان** — الرسالتان ذهبتا إلى فيسبوك.
- **الأثر:** سبام مزدوج مرئي للعملاء عند إعادة تسليم FB المتزامن عبر حوادث Vercel دافئة متعددة (FB يعيد المحاولة عند بطء 200). نافذة السباق = زمن إرسال+commit للأولى (~1-3s).
- **الإصلاح:** قفل idempotency حقيقي قبل الإرسال (Redis SETNX على cid أو INSERT-claimed لصف Reply مع status=pending قبل الإرسال ثم تحديثه) — أو على الأقل تسجيل «claim» في Comment row قبل الإرسال (الحقل replied_by_bot موجود أصلاً في models.py:583).

### M6 — عدّاد replies_used: قراءة-تعديل-كتابة بلا قفل + لا تصفير عند التفعيل/الترقية

- **المواقع:**
  - `engine.py:476-478` (و151-159 في cycle): `uc.current_value = (uc.current_value or 0) + 1` — تعديل من الذاكرة؛ رسالتان متزامنتان من زبونين → قراءة نفس القيمة → **تحت-العد** (خسارة زيادات). اليوم العداد للعرض فقط، لكنه سيُفسد أي فرض مستقبلي لـ max_replies.
  - `routers/payments/approvals.py:113-122` و`app/telegram.py:99-109`: التفعيل يضبط `plan_start/plan_end` **ولا يصفّر UsageCounter** — التصفير الوحيد هو «الشافي الذاتي» في cycle (engine.py:107-119) المشروط بدورة تعمل فعلاً (لا تعمل على Vercel إلا بcron خارجي) → عدادات التجربة السابقة تبقى ممتدة داخل الفترة المدفوعة (عرض مضلل، ولو فُرضت الحدود لَضُرِم المشترك من ردوده المدفوعة).
- **الإصلاح:** زيادة ذرّية `UPDATE usage_counters SET current_value = current_value + 1` (بنمط credit_wallet في _wallet.py) + تصفير/إنشاء عداد جديد عند كل تفعيل داخل معاملة الموافقة نفسها.

### M7 — حارس _is_recent (skip للمساعدات القديمة >10 دقائق) ميت: يقرأ timestamp من مكان خاطئ

- **الموقع:** `messenger_service.py:357-366`:
  ```python
  ts = (messaging.get("message") or {}).get("timestamp")
  ```
  فيسبوك يضع `timestamp` في **جذر** حدث messaging لا داخل `message` — لاحظ أن `persist_message` نفسه يقرأ المكانين الصحيحين (`messaging.get("timestamp") or …` السطر 187) — `_is_recent` وحده يقرأ المكان الخاطئ → ts=None → **return True دائماً**.
- **الأثر:** الحارس (v4 §5.13) لا يعمل أبداً؛ الحماية الفعلية تقع كلياً على dedup الـ mid (تعمل). أي إعادة تسليم قديمة لا تُرد بسببها بل بسبب dedup فقط — طبقة أمان معلنة بلا أثر، ولو نجح dedup بالـ mid لأي سبل (mid اصطناعي لpostback مثلاً) لَمَرّت الرسالة القديمة.
- **الإصلاح:** سطر واحد: `ts = messaging.get("timestamp") or (messaging.get("message") or {}).get("timestamp")` + اختبار بوحدة حمل لحدث قديم فعلياً.

### M8 — احتياط DM للتعليقات يستخدم POST_PURCHASE_UPDATE tag خارج سياقه — خطر تقييد الصفحة

- **الموقع:** `bot_engine/pipeline.py:211-218`: عند فشل private_reply يجرب `send_dm(..., messaging_type="MESSAGE_TAG", tag="POST_PURCHASE_UPDATE")` ثم RESPONSE.
- **الأثر:** وسم POST_PURCHASE_UPDATE مخصص لرسائل ما بعد الشراء غير التسويقية؛ استخدامه لردود ترويجية آلية على معلقي منشورات = نمط مخالف لسياسة Meta — العقوبة المعروفة: تقييد messaging للصفحة (موت البوت كله). التعليق نفسه في الكود يقول «works for opted-in users» — تجاوز لسياسة الوسم.
- **الإصلاح:** إسقاط احتياط الوسم أو تقييده بمحتوى غير تسويقي مؤكد؛ الاكتفاء بprivate_reply (المتوافق ضمن 7 أيام/تعليق) + RESPONSE، مع تسجيل عربي عند تجاوز النافذة.

---

## 4) الملحق الإلزامي — الحقيقة الكاملة المثبتة لادعاءَي D2 (بلا إعادة عدّ)

### 4.1 حدود الخطة (max_replies/has_dm/has_broadcast/has_ai) — أين تُفحص فعلاً؟ الجواب: لا مكان. تأكيد D2-H1 بمسار بمسار

| مسار الدفع/القيمة | نقطة الفحص الفعلية | الحد المفروض |
|---|---|---|
| رد ماسنجر آلي (webhook) | `_subscription_active` فقط (حالة/انتهاء) | max_replies: **لا** · has_dm: **لا** (الرد IS dm) |
| رد تعليق آلي (webhook) | **لا بوابة إطلاقاً** (D2-H3) | لا شيء |
| رد تعليق آلي (cycle/heartbeat) | حالة الاشتراك فقط (engine.py:88-105) | max_replies: **لا** |
| DM خاص بعد تعليق (pipeline 8b) | لا شيء | has_dm: **لا** (مؤكد D2-H1) |
| بث جماعي (`/api/broadcasts/{id}/send`) | status==draft فقط (broadcasts.py:93) | has_broadcast: **لا** · الاشتراك: **لا** (منتهٍ يبث) |
| حملة تسويقية فورية (marketing.py:150+) | roles + وجود فقط | لا شيء |
| رد يدوي من الـ inbox (inbox.py:255-274) | وجود اتصال فقط | لا بوابة اشتراك ولا عدّ (قابل للنقاش منتجياً — رد بشري) |
| دفع/ترقية (plans.py) | السعر/المزود/السقف | (صحيح ومحصّن) |

- المواضع الوحيدة التي تُقرأ فيها الحقول: `startup.py:108-151` (بذر)، `routers/plans_config.py:39-45` (عرض عام)، `models.py:641-648` (تعريف). **صفر نقاط فرض.** والتعليق المضلل engine.py:97 («gated elsewhere») مثبت كاذب. كما أن مقاييس `dms_used/broadcasts_used` (models.py:698) لا تُكتب في أي مكان (العداد الوحيد المكتوب: replies_used في المسارين المذكورين أدناه).

### 4.2 عدّاد replies_used — متى يزيد ومتى لا (الحقيقة الكاملة)

| المسار | يزيد؟ | الموضع |
|---|---|---|
| رد ماسنجر webhook | **نعم** (+1 لكل رد ناجح) | engine.py:465-484 |
| رد تعليق عبر cycle/heartbeat | **نعم** (+total_replied دفعة) | engine.py:146-167 |
| **رد تعليق عبر webhook (process_single_comment)** | **لا أبداً** | تأكيد D2-H3 — لا UsageCounter في pipeline.py إطلاقاً |
| رد يدوي inbox | لا | by design غير محسوم |
| بث/DM-after-comment | لا (ولا dms_used) | broadcast_engine/pipeline |

**النتيجة المالية:** الإنتاج الفعلي (تعليقات webhook هي القناة الحية الوحيدة على Vercel لأن cycle متوقف وmessenger معطّل بC1) **لا يعدّ شيئاً تقريباً** — أي عدّاد استخدام اليوم أعمى عن القناة الرئيسية؛ وحتى لو فُرضت max_replies غداً (إصلاح D2-H1) لَما رأت الحدود هذه الردود. **إصلاح موصى به مشترك:** نقطة عدّ واحدة داخل pipeline بعد نجاح الإرسال تخدم المسارين (اقتراح D2 نفسه) + النقطة المركزية get_plan_limits.

---

## 5) مصفوفة تجربة العميل النهائي في ليبيا عند كل فشل (بند التكليف)

| الفشل | ما يصل للعميل (زبون الصفحة) | ما يصل للمشترك (المستأجر) |
|---|---|---|
| صفحة رُبطت عبر المعالج (C1) | **صمت مطلق من اليوم الأول** | صفر رسائل/أصفار — لا تفسير (toast النجاح مضلل — D4) |
| توكن منتهٍ — رسائل | صمت | BotLog عربي واضح «تحقق من صلاحية توكن الصفحة» (engine.py:439-457) ✓ |
| توكن منتهٍ — تعليقات | صمت | **لا شيء** (M1) |
| نافذة 24h (code 10) | صمت | سجل عربي صادق (رسائل فقط)؛ البث: failed خام بلا سبب (M3) |
| لا قاعدة مطابقة | صمت (تصميم) | debug فقط (غير مرئي) |
| ربط جزئي بلا توكن (M2) | صمت (الرسائل تظهر للمشترك بلا ردود) | لا شيء — AttributeError في سجلات السيرفر |
| انتهاء مدفوع (H1) | الردود تستمر (مجاناً) حتى دورة قادمة ثم صمت | **لا إشعار إطلاقاً** (H5) |
| UNPAID منتهٍ | صمت (بوابة الرسائل) · **التعليقات تستمر** (لا بوابة — D2-H3) | لا إشعار |
| طلب دفع مرفوض | — | إشعار عربي + شاشة رفض خلال ≤5s (SSE data + poll) ✓ (L1 تفصيل تكميلي) |
| خطة مدفوعة لا تفرض شيئاً (§4.1) | — | «Free» يفعل كل شيء — قيمة الدفع غير ملموسة |

---

## 6) تحقق من صحته وسلامته (موثق لمنع إعادة الرصد)

1. **توقيع HMAC كامل:** `app/webhooks.py:75-87` — sha256 فوق body الخام، `hmac.compare_digest`، فشل مغلق 401 عند غياب السر (env → SystemConfig)؛ GET verify بالمثل (webhooks.py:52-65، فشل مغلق عند التوكن الفارغ). (تحقق حي في D6.)
2. **idempotency الرسائل:** قيد `uq_messages_tenant_fb` (models.py:537) + فحص موجود + `status["stored"]` يمنع الرد المزدوج عند إعادة التسليم (messenger_service.py:281-286) — إعادة تسليم FB بعد مهلة Vercel تنتهي بأمان (الالتزام الأول يفوز، الثانية تُرفض بالقيد وتُدار بrollback).
3. **معاملة التخزين:** معاملة واحدة (persist+subscriber+conv) بcommit واحد؛ IntegrityError → rollback نظيف بلا حالة جزئية (messenger_service.py:255-277).
4. **مسار الماسنجر يفعل الصواب الأكبر:** عدّاد +1 بعد نجاح الإرسال فقط، BotLog بtenant_id، تمييز عربي صادق بين نافذة 24h وتوكن منتهٍ، 3 محاولات، تخطي echoes/أحداث الصفحة، تحية أول تواصل حقيقية (تحسب أول رسالة مخزّنة — engine.py:291-309)، لا cooldown 1:1 (قرارة موثقة v4 §5.12 — وD7-F2 وثّق أن اختبار cooldown البشري كان فارغاً للسبب نفسه).
5. **hحسم الدفع ذرّي:** `UPDATE … WHERE status='pending' RETURNING` في المسارين HTTP (approvals.py:99-112) وTelegram (telegram.py:84-95) — موافقتان متزامنتان لا تفعّلان مرتين (v14 إغلاق C-SEC1)؛ قفل double-submit للطلبات المعلقة (plans.py:36-46,136-159)؛ حدود معدل على كل POST مالي؛ رسوم الإيصال محققة قبل التخزين.
6. **تفرد حل المستأجر في webhook:** القيد الجزئي `uq_botstate_key_value` (models.py:97-99 + ترحيلة 012) يضمن أن `BotState(key='fb_page_id', value)` يرجع مستأجراً واحداً — لا التباس صفحات.
7. **صفحة غير مربوطة:** تحذير + تجاهل موثق (webhooks.py:153-155, 219) — بلا أثر جانبي.
8. **إبطالة كاش عميل فيسبوك عند تدوير التوكن:** facebook_routes.py:179-190 (inbox cache + reset_bot_engines) — صحيح.
9. **حملة «إرسال الآن» inline** (لا spawn) مع عدّ صادق (marketing.py:193-208) — بخلاف البث المجدول/المؤجل (D1).
10. **عميل الإرسال:** per-tenant في كل مسارات الإرسال المفحوصة (messenger/تعليقات/بث/تسلسلات) — لا نشر بحساب جار بعد v14-E2.

---

## 7) المنخفضة (مقتضبة)

- **L1** `routers/payments/sse.py:86` — مجموعة الإغلاق `("verified","rejected","EXPIRED_TRIAL")`: الحالة المكتوبة فعلياً عند الرفض هي **cancelled** (approvals.py:97-107, telegram.py:83) — «rejected/EXPIRED_TRIAL» لا توجدان على SubscriptionPayment إطلاقاً → عند الرفض يبقى البث SSE مفتوحاً 10 دقائق يستطلع كل 2s. أثر محدود (الواجهة تُظهر الرفض عبر poll خلال ≤5s — payment/index.tsx:327-328) لكنها نسخ/لصق من نطاق آخر. **الإصلاح:** استبدال المجموعة ب`("verified","cancelled")`.
- **L2** `_services.py:389-402` — `_track_event` يعتمد `spawn` (fire-and-forget) ثم يعود الرد فوراً → على Vercel تُقتل المهمة بعد إرسال الاستجابة → أحداث التحليلات (webhook_message_processed وغيرها) تضيع جزئياً/كلياً. **الإصلاح:** await داخل الطلب أو طابور رسائل.
- **L3** أسوأ زمن لطلب webhook واحد: resolve_conversation (مهلة 15s) + 3 محاولات إرسال (3×15s + سبابات) ≈ 60s+ > سقف Vercel maxDuration=30s (vercel.json:87) → قتل الدالة → FB يعيد → الاستقرار النهائي عبر dedup (§6.2) لكن بكلفة إعادة معالجة وزمن رد للعميل قد يتجاوز 30s عند تعثر Graph. **الإصلاح:** تقليم مهلة _post في مسار الويبهوك أو محاولة واحدة + تسجيل.
- **L4** `models.py:338` — `Subscriber.reply_count` لا يزداد أبداً (grep: قراءات فقط) → فلتر بث `min_replies` (broadcast_engine.py:266-268) يساوي «لا أحد» دائماً؛ جمهور «engaged» في marketing ينجو بفضل or_. **الإصلاح:** زيادة العمود عند الرد (pipeline) أو حذف الفلتر.
- **L5** `app/webhooks.py:31-49` — عند غياب FACEBOOK_APP_SECRET من env: قراءة SystemConfig من DB **لكل حدث webhook** (roundtrip لكل رسالة). **الإصلاح:** كاش قصير للمصدر.
- **L6** `bot_engine/engine.py:53/538-553` — كاش dm_map يُعاد تحميله كل 300s من ملف JSON ثابت في كل طلب — هدر IO بلا فائدة (الملف لا يتغير وقت التشغيل). **الإصلاح:** تحميل مرة واحدة + إبطالة صريحة.

---

## 8) ما لم يُعد عدّه (إسناد موجز)

D2-H1 (حدود ديكورية — أثبتُها بمسار بمسار في §4.1) · D2-H3 (تعليقات webhook بلا بوابة/عداد — §4.2) · D2-M2 (إعادة محاولة أخطاء دائمة) · D2-M3 (load() يمحو علامة dedup) · D2-M11 (BotLog engine._add_log — أضفت موضع monitor.py في M1) · D2-M1 (خريطة DM ميتة) · D1-C1 (بث spawn على Vercel) · D1-H3 (حملات مجدولة بلا مستهلك) · D1-H4/D13-F1 (الربط المزدوج 500) · D3-H1 (قيود upsert على legacy) · D6-M1 (TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED) · D7-F2 (اختبار cooldown فارغ) · v14-R3 (lead التعليقات يحتاج توكن حقيقي — وسّعته في H4).

---

## 9) ترتيب التنفيذ المقترح لموجة E (من منظور مسار المال)

1. **E-D10-1 (C1):** اشتراك webhooks في connect_page + توحيد مسار الربط + ربط /api/webhook/check بلوحة الصفحات — يعيد الحياة لمسار الرسائل كله في الإنتاج.
2. **E-D10-2 (H1+H5):** بوابة اشتراك موحدة ذاتية الشفاء (تحويل PAID-منتهٍ داخل البوابة) + إشعار انتهاء عربي (push_notification + BotLog) + عرض plan_end في الفواتير.
3. **E-D10-3 (D2-H1/H3 + M4 + M6):** نقطة فرض مركزية get_plan_limits + عدّ موحد في pipeline + تصفير عداد عند التفعيل + سقف 5/دقيقة لمسار webhook — حزمة «الفوترة حقيقية».
4. **E-D10-4 (H3):** قرار المحفظة (خصم أو إزالة عرض).
5. **E-D10-5 (H4):** leads من مسار الماسنجر.
6. **E-D10-6 (M1+M2):** سجلات مرئية للمشترك عند فشل التوكن/الربط الجزئي.
7. **E-D10-7 (M3+M8):** سياسة البث/الوسم — حماية الصفحة من تقييد Meta.
8. **H2 (التجربة):** قرار منتجي بعد إغلاق 1-3 — وإلا فتح نافذة مجانية كاملة.

---

*الوكيل D10 — v15. التقرير في: `audit-reports/v15-D10-money-path.md`. لا كود تطبيق كُتب.*
