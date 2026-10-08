# تقرير v15-D4 — تدقيق عميق شامل لكل مسارات الواجهة (35 راوتاً)

**الوكيل:** D4 (تشخيص مسارات الواجهة) · **الجولة:** v15 · **الأساس:** main @ 558623b3 (v14 مكتملة)
**النطاق:** `fb_dashboard/frontend/src/app/` كاملة — صفحة صفحة، فرع فرع، بلا استثناء + مكوناتها المباشرة (AuthGuard، PaymentDialog، OnboardingWizard، AdminSidebar، middleware العميل apiFetch/unwrapApi) مع الرجوع إلى عقد الخلفية عند الحاجة لإثبات الانطباق.
**قاعدة:** لا يُعاد الإبلاغ عن إصلاحات v14 (تحققت منها سلباً: /connect عبر unwrapApi يعمل، حارس إعادة التوجيه موجود، false-empty في /admin موجود، skip-link في كل الفروع).

## 0) خريطة التغطية (35 راوتاً + الحدود)

| المجموعة | المسارات | الحالة |
|---|---|---|
| عامة ثابتة | `/`، `/pricing`، `/privacy`، `/terms`، `/demo` | 5 ✅ مدققة |
| مصادقة | `/login`، `/register`، `/connect`، `/onboarding` (مكوّن عبر AuthGuard — لا يوجد page.tsx لها) | 4 ✅ |
| المال | `/subscribe` (+PlanSelector/StepIndicator/PaymentSection/PaymentDialog) | 1 ✅ |
| الإدارة | `/admin`، `/admin/settings`، `/admin/telegram` (+3 أقسام) | 3 ✅ |
| اللوحة | `/dashboard` + 21 فرعاً مسمى + `/dashboard/[...slug]` | 23 ✅ |
| حدود | not-found، global-error، error.tsx/loading.tsx لكل مجلد (17 ملفاً) | ✅ نمط موحّد |

**الحصيلة:** 1 حرجة · 6 عالية · 8 متوسطة · 10 منخفضة = **25 إيجاداً**.

---

## 1) الحرجة

### C1 — رحلة «الخطة المجانية» تنتهي بمسار مسدود في نافذة الدفع (زر الهبوط الرئيسي «ابدأ الآن مجاناً»)

سلسلة الرحلة: الهبوط `ابدأ الآن مجاناً` → `/subscribe` → اختيار بطاقة «مجاني» → «متابعة مع خطة مجاني» → زر «ادفع الآن (0 د.ل)» → **فشل**.

- `src/app/page.tsx:154-157` — `<Link href="/subscribe">… ابدأ الآن مجاناً`
- `src/app/subscribe/PlanSelector.tsx:88-92` — تعرض الخطة price=0:
  ```tsx
  <span className="text-2xl font-bold tabular-nums">
    {Number(plan.price) === 0 ? "مجاني" : toArabicNumber(plan.price)}
  </span>
  ```
  والاستمرار ممكن (`disabled={!selectedPlan}` فقط).
- `src/app/subscribe/PaymentSection.tsx:58-61` — `ادفع الآن ({toArabicNumber(currentPlan.price)} د.ل)` → «ادفع الآن (0 د.ل)».
- `src/components/shared/payment/index.tsx:225-228` — **المانع**:
  ```tsx
  if (!isBank && Number(price) <= 0) {
    premiumToast("error", "سعر الباقة غير صالح — أعد فتح نافذة الدفع")
    return
  }
  ```
  الرسالة نفسها تقول «أعد فتح النافذة» — وإعادة الفتح لا تصلح شيئاً (نفس السعر 0). الخلفية كانت ستقبل (`plans.py:108`: `float(amount) != float(plan.price)` → 0==0 يمرّ)، فالمانع أمامي بحت. `/api/plans` يعيد الخطة المجانية فعلاً (`plans_config.py:33-55`) فالبطاقة قابلة للاختيار دائماً. لا يوجد أي مسار بديل في الواجهة لتفعيل المجاني (نموذج التسجيل لا يرسل `plan_id` رغم أن `auth.py:208-216` يدعم خطة تجريبية).
- **الشدة:** حرجة — أول CTA في الموقع يقود إلى رسالة خطأ نهائية.
- **الإصلاح المقترح:** في `ReviewSummary`/`PaymentDialog`: إذا `price === 0` استبدل زر الدفع بزر «تفعيل الخطة المجانية» يستدعي نقطة تفعيل مباشرة (بدون انتظار موافقة إدارة على مبلغ 0)، أو أخفِ الخطة المجانية من PlanSelector وأبقِ الـCTA يوجه لـ`/register`.

---

## 2) العالية

### H1 — زر «تخطي» في معالج التهيئة يفشل بصمت (403 CSRF) فلا يُثبَّت التجاوز — المعالج يعود بعد كل تحديث

- `src/app/dashboard/AuthGuard.tsx:129`:
  ```tsx
  fetch("/api/onboarding/skip", { method: "POST", credentials: "include" }).catch(() => {})
  ```
  استدعاء fetch خام **بلا X-CSRF-Token** — بينما كل GET على `/api/*` غير المعفى يزرع كوكي `csrf_token` (`app/middleware.py:179-191`)، وAuthGuard نفسه للتو استدعى `GET /api/me` فزرع الكوكي. الوسيط يرفض POST بلا ترويسة مطابقة (`middleware.py:171-176`: 403 «طلب غير موثوق (CSRF)») — والcatch يبتلع الـ403. النتيجة: `/api/onboarding/skip` (الذي وُجد أصلاً «ليثبّت التجاوز» — `auth.py:274-280`) لا يُستدعى أبداً بنجاح، و`onboardingCompleted` يبقى false → **المعالج يظهر مجدداً بعد كل F5** رغم ضغط المستخدم «تخطي».
- **الشدة:** عالية (تراجع صامت لوظيفة أُصلحت عمداً).
- **الإصلاح:** استبدالها بـ`apiFetch("/api/onboarding/skip", { method: "POST" })` (تضيف الترويسة تلقائياً) مع معالجة خطأ مرئية، أو إضافة المسار إلى CSRF_EXEMPT (غير مستحسن).

### H2 — حفظ إعدادات تليجرام يرسل الرمز المقنّع «••••••••» فيُرفض الحفظ كله (400)

- `src/app/admin/telegram/page.tsx:74` — تُبذَر القيمة عند التحميل:
  ```tsx
  setConfig({ botToken: d.botTokenMasked ? "••••••••" : "", … })
  ```
  GET `/api/telegram/config` لا يعيد الرمز أصلاً (يعيد `botTokenMasked: true` فقط — `routers/telegram_config.py:43-50`).
- `src/app/admin/telegram/page.tsx:120-134` — `handleSave` يرسل `...config` كما هي؛ فأي حفظ لتغيير `chatId` أو `isActive` فقط يرسل `botToken: "••••••••"` → الخلفية ترفض بصيغة الرمز (`telegram_config.py:64-65`: `^\d{6,12}:[A-Za-z0-9_-]{30,}$` → 400 «telegram_bot_token غير صالح»). **لا يمكن للأدمن تغيير أي إعداد دون إعادة لصق الرمز كاملاً**، برسالة خطأ مربكة. (ولو كان الـregex أرخم لكان استُبدل الرمز الحقيقي بالقناع — خطر كامن.)
- **الإصلاح:** عند `botTokenMasked` ابدأ الحقل فارغاً بعنصر placeholder «الرمز محفوظ — أدخل رمزاً جديداً لاستبداله»، وأرسل `botToken` فقط إذا غُيّر فعلياً (نمط empty=لا تغيير الذي يستخدمه `admin/settings`).

### H3 — انتهاء الجلسة أثناء الاستخدام: لا معالجة 401 عالمية — 22 صفحة تتحول لحالات خطأ بلا توجيه للدخول

- `src/lib/csrf-client.ts:42-47` — apiFetch يرمي `ApiError` عند !ok دون تمييز 401.
- `src/components/shared/QueryProvider.tsx:26-31` — QueryClient بلا أي `queryClient` error handling.
- `src/app/dashboard/AuthGuard.tsx:47-100` — التحقق يعمل فقط عند تغيّر `pathname` (وليس عند فشل الاستعلامات اللاحقة).
- **السيناريو المُثبت:** توكن منتهٍ وأنت داخل `/dashboard/analytics` → كل `refetchInterval` (60s) يفشل بـ401 → صفحة «فشل تحميل التحليلات» + «إعادة المحاولة» تدور بلا نهاية. المستخدم مطرود عملياً بلا «سجّل الدخول مجدداً». المسارات الوحيدة التي تعالج 401: `/connect` (v14) و`PaymentDialog` (→ login). لا يوجد أي 401-handling في: كل صفحات react-query (activity/ads/analytics/audience/autoreply/billing/broadcast/calendar/comments/leads/marketing/messages/notifications/pages/posts/reports/scheduled/settings/team/tools/support + /admin) — 429 كذلك يظهر كنص عام.
- **الإصلاح:** إما في apiFetch (window.location.replace("/login?redirect=…") عند 401 لمسارات المصادقة) أو QueryCache onError عالمي + `mutation onError`، مع رسالة عربية «انتهت الجلسة — أعد تسجيل الدخول».

### H4 — صفحة تشخيص تليجرام تعرض بيانات غير موجودة في عقد الخلفية (تشخيص مضلل)

الواجهة تتوقع `DiagnoseResult{ linkedAdmins, events, broadcastTargets }` والخلفية تعيد `{ configExists, isActive, source, adminCount, botTokenPreview, dryRunResult }` (`routers/telegram_config.py:87-109`):
- `src/app/admin/telegram/page.tsx:103` — `const linkedAdmins = diagnose?.linkedAdmins ?? 0` → **«عدد المشرفين المرتبطين: 0» دائماً** مهما كان العدد الحقيقي (`adminCount` مهمل).
- `src/app/admin/telegram/DiagnosticsSection.tsx:165-167` — `diagnose.events` غير موجود في الرد → «الأحداث: —» دائماً.
- `DiagnosticsSection.tsx:168-173` — «✅ اتصال API سليم — البوت يعمل بشكل صحيح» تُعرض بمجرد `configExists` (وجود توكن) **حتى لو فشل dryRun** («fail: …» في `dryRunResult` الذي لا يُعرض إطلاقاً) — عكس الهدف المعلن للبطاقة (الحقيقة الفورية للمشغّل).
- `DiagnosticsSection.tsx:174-188` — قسم «نتائج جهات الإرسال» (`broadcastTargets`) لا يصل بياناته أبداً → كود ميت.
- **الإصلاح:** مطابقة الأسماء (`adminCount`→linkedAdmins، عرض `dryRunResult`، حذف الحقول الميتة)، واشتراط نجاح dry-run قبل رسالة «يعمل بشكل صحيح».

### H5 — نمط `if (!res.ok)` ميت بعد apiFetch في 4 مسارات: رسائل الخطأ العربية الفعلية تُستبدل بـ«خطأ في الاتصال»

`apiFetch` يرمي ApiError على أي non-2xx (`csrf-client.ts:43-47`)، لذا فروع `else`/`!res.ok` التالية غير قابلة للوصول، والـcatch العام يهمل `e.message` العربي:
1. `src/app/dashboard/settings/page.tsx:39-55` — تغيير كلمة المرور: الخلفية ترمي 401 «كلمة المرور الحالية غير صحيحة» (`auth.py:364`) → المستخدم يرى **«خطأ في الاتصال»** (رسالة الشبكة!) بدل السبب الحقيقي. (الفرع الميت 49-52 يحتوي أصلاً كود عرض detail — دليل أن القصد ضاع).
2. `src/app/admin/page.tsx:106-118` — قبول/رفض الدفعات: أي فشل → «خطأ في الاتصال».
3. `src/app/admin/settings/page.tsx:211-238` — حفظ إعدادات المنصة: أي فشل (مثلاً 403 لأدمن مستأجر) → «خطأ في الاتصال» بدل «detail» العربي.
4. `src/app/admin/settings/page.tsx:240-254` — رسالة تليجرام التجريبية: نفس النمط.
- **الإصلاح:** حذف الفروع الميتة وعرض `e instanceof ApiError ? e.message : …` (النمط المتبع أصلاً في connect/login).

### H6 — أفعال مالية ولا رجعة فيها بضغطة واحدة بلا أي تأكيد

- `src/app/admin/page.tsx:267-277` — **قبول/رفض طلب دفع** (تفعيل اشتراك بمال حقيقي / إلغاء طلب زبون) بضغطة زر واحدة في جدول — نقرة خاطئة حاسمة مالياً.
- `src/app/dashboard/broadcast/page.tsx:159-169` — إرسال بث جماعي لكل المشتركين بلا تأكيد.
- `src/app/dashboard/marketing/page.tsx:280-302` — إرسال حملة + حذف حملة بلا تأكيد.
- `src/app/dashboard/autoreply/page.tsx:192-194` — حذف قاعدة رد نهائي بلا تأكيد (ولا تراجع).
- `src/app/dashboard/posts/page.tsx:139-146` و`scheduled/page.tsx:158-163` — نشر فوري على فيسبوك + حذف، بلا تأكيد.
- `src/app/dashboard/tools/page.tsx:129,168` — حذف قالب/عرض بلا تأكيد.
- **الإصلاح:** حوار تأكيد موحّد (AlertDialog) للأفعال المدمرة/المرسلة جماعياً، على الأقل لطابور الدفعات والبث/الحملات.

---

## 3) المتوسطة

### M1 — صفحة الأدوات: لا توجد أي واجهة لإنشاء «العروض» (مسدود رغم دعم الخلفية)
`src/app/dashboard/tools/page.tsx:150-153` — الحالة الفارغة تقول «أضف عروض صفحتك الحالية…» لكن لا نموذج إضافة إطلاقاً (grep على `src/`: لا يوجد POST `/api/offers` — آخر ظهور هو تعريف النوع فقط)، بينما الخلفية توفر `POST /api/offers` (`routers/offers_routes.py:34`). قوالب الرد لها نموذج، العروض لا. **الإصلاح:** نموذج إضافة عرض (title/description/is_active) مثل قسم القوالب.

### M2 — حقل «الأحداث المرسلة» في إعدادات تليجرام وهمي (حفظ صامت بلا أثر)
`src/app/admin/telegram/TelegramConfigSection.tsx:88-91` يعرض حقلاً قابلاً للتحرير «الأحداث المرسلة (مفصولة بفاصلة)» و`page.tsx:126` يرسله، لكن `POST /api/telegram/config` لا يقرأ/يحفظ `events` إطلاقاً (`telegram_config.py:60-84`)، وGET يعيد قائمة ثابتة (`:47`). المستخدم «يحفظ» أحداثاً لا تذهب لأي مكان — وتظهر قائمة أخرى ثابتة بعد التحديث. **الإصلاح:** إما إظهار الأحداث للقراءة فقط أو دعمها فعلياً في الخلفية.

### M3 — المعالج (OnboardingWizard) يبتلع الفشل بصمت في خطواته الجوهرية
- `src/app/onboarding/OnboardingWizard.tsx:218-227` — فشل `POST /api/onboarding/connect-page` (الغرض الأساسي للخطوة) → `catch { /* Non-fatal */ }` **بلا أي إشعار**؛ يكمل المستخدم معتقداً أن صفحته مربوطة. كذلك `:229-238` لقاعدة الرد الأولى.
- `:119-129` — فشل `/api/plans` → `plans` تبقى فارغة → البطاقة الوهمية «جارٍ التحميل…» تظهر **للأبد** (`:486-489`) رغم أن الحالة الفعلية فشل.
- `:184-186` — catch اختبار الاتصال يهمل رسالة ApiError العربية (يفقد أخطاء الخلفية).
- **الإصلاح:** toast تحذير «لم يتم حفظ الربط — يمكنك إكماله من صفحة الصفحات»، وحالة خطأ مميزة للخطط بدل «جارٍ التحميل» الدائم.

### M4 — 22 مساراً تحت /dashboard بلا عنوان تبويب مميز
`src/app/dashboard/layout.tsx:5-10` يصدّر metadata واحدة («لوحة التحكم») لكل الشجرة؛ لا توجد layouts فرعية — فعنوان التبويب/السجل/قارئ الشاشة يقرأ «لوحة التحكم | SmartBot» في `/dashboard/messages` و`/dashboard/billing` و… جميعها. (كل صفحات الفرع `"use client"` فلا تستطيع تصدير metadata بنفسها). **الإصلاح:** layout.tsx صغير لكل مسار فرعي يصدّر `title` (نمط login/register/connect القائم).

### M5 — صفحة «الصفحات»: توست نجاح يعلن الاشتراك في الويبهوك حتى لو فشل الاشتراك
`src/app/dashboard/pages/page.tsx:43-55` — handleSave يقرأ `res.json()` بلا unwrapApi ويتجاهل نتيجة الويبهوك؛ الخلفية تُرجع `ok({ok, webhook: webhook_result | "skipped", page_name})` حيث قد يكون `webhook = {error: …}` (`routers/facebook_routes.py:146-157,193`) → المستخدم يرى «تم حفظ بيانات فيسبوك **والاشتراك في الويبهوك**» بينما الاشتراك فشل والرمز غير صالح أصلاً (PUT لا يتحقق من التوكن). **الإصلاح:** unwrapApi + فحص `webhook.error` وإظهار تحذير عربي.

### M6 — صفحة «المنشورات»: زر «نشر» ينشئ مسودة فقط (تسمية مضللة)
`src/app/dashboard/posts/page.tsx:91-95` — الزر «نشر» يستدعي `POST /api/scheduled-posts` الذي ينشئ `draft/scheduled` فقط (`routers/scheduled_posts_routes.py:40-72`)، والنشر الفعلي زر ثانٍ من البطاقة. المستخدم يضغط «نشر» فيظن أنه نُشر على فيسبوك. **الإصلاح:** تسمية «حفظ منشور» أو دمج خيار «نشر الآن» في النموذج.

### M7 — `/subscribe?plan=`: الاحتياطي بالموقع قد يختار خطة مختلفة عن المقصودة
`src/app/subscribe/SubscribeContent.tsx:50-57` — `const byPos = sorted[Number(preselectedPlan) - 1]; const found = byId ?? byPos` — إذا تغيرت هويات الخطة في DB يُختار للمستخدم **ثاني أصغر خطة بترتيب مختلف** (قد تختلف في السعر والاسم) بينما يظن أنه يتابع الخطة التي ضغطها من /pricing. أيضاً `plan` غير رقمي (مثلاً "free") → `Number(...)`=NaN → صفحة «لم تُختر خطة بعد» مع أن المستخدم قادم من CTA. **الإصلاح:** حذف الاحتياطي byPos (المعرف يجب أن يكون دقيقاً) ورسالة «الخطة المطلوبة غير متاحة» عند عدم التطابق.

### M8 — بوابات الإدارة غير متسقة: أدمن مستأجر (role=admin, tenant_id>0) يرى أخطاء تحميل بدل «غير مصرح»
`src/app/admin/page.tsx:121` يقارن `role !== "admin"` فقط بينما `/api/admin/subscriptions` و`/api/telegram/*` تتطلب platform-admin (tenant 0) → أدمن مستأجر يصل `/admin` يدوياً فيرى «فشل تحميل طلبات الاشتراك» (banner خطأ) و`/admin/telegram` يرى «فشل تحميل الإعدادات» + toast فشل — بدل شاشة «غير مصرح» النظيفة الموجودة أصلاً للـrole غير الإداري. (login landing يوجههم لـ/dashboard أصلاً، لكن الوصول المباشر/الرابط القديم يصل). **الإصلاح:** اشتراط `tenant_id === 0` في نفس الفحص الأمامي.

---

## 4) المنخفضة

- **L1** — `src/app/dashboard/AuthGuard.tsx:84-92`: عدّاد `attempts` ref لا يُصفّر أبداً بعد أول فشل → أي وميض شبكة لاحق (بعد أول إعادة محاولة في الجلسة) يقصي المستخدم فوراً إلى login؛ كما أن مهلة الـ5s قد تقصي جلسة صالبة على شبكة بطيئة (Abort). **الإصلاح:** تصفير العدّاد عند النجاح/تغيير المسار + رفع المهلة.
- **L2** — `src/app/dashboard/broadcast/page.tsx:68-73`: توست «تم إرسال البث للمشتركين» بينما الخلفية fire-and-forget (`broadcasts.py:96-100` spawn) — النتيجة الفعلية تظهر لاحقاً فقط (أو لا). كذلك `POST /api/broadcasts/{id}/cancel` غير مستعمل في الواجهة.
- **L3** — `src/app/connect/page.tsx:70-73`: فشل `/api/webhook/check` صامت → بطاقة «متصل» بلا قائمة فحص الويبهوك بلا تفسير؛ وبعد اختبار ناجح، تعديل الرمز/المعرف يُبقي «حفظ وتفعيل» مفعلاً فيحفظ بيانات غير مختبرة.
- **L4** — `src/app/onboarding/OnboardingWizard.tsx:184-186`: رسالة خطأ عامة «تعذر الاتصال — تحقق من البيانات» تبتلع detail العربي (نفس عائلة H5).
- **L5** — `src/app/dashboard/activity/page.tsx:32,66`: يجلب 100 سجلاً ويعرض 50 فقط بلا ترقيم/إشارة.
- **L6** — `src/app/admin/telegram/BroadcastTargetsSection.tsx:37-44`: مسح المدخلات حتى عند فشل الإضافة؛ `src/app/dashboard/marketing/page.tsx:205-209`: عند فشل audience-size تظهر «ستصل الحملة إلى 0 مشترك» (بلا فرع isError).
- **L7** — `src/components/shared/payment/index.tsx:387-399,267-270`: إعادة تعيين النافذة عند الإغلاق لا تعيد `provider` لـliyana؛ و401→`/login?redirect=/subscribe` يفقد الخطة المختارة (بلا ?plan).
- **L8** — `src/app/subscribe/PlanSelector.tsx:120`: `disabled={!selectedPlan}` — فحص falsy وليس null (لو صادف id=0 يبقى الزر معطلاً) — سلامة نمطية.
- **L9** — `src/components/layout/AdminSidebar.tsx:126`: نقطة «متصل» الخضراء بجانب الشعار دائمة بغض النظر عن حالة الربط الفعلية (زخرفية لكنها تعلن حالة غير صادقة) — بينما PageHeader في /dashboard يعرض الحالة الحقيقية.
- **L10** — `src/app/robots.ts:23` يحظر `/onboarding` رغم عدم وجود راوت له أصلاً (404 — المكون يُركَّب عبر AuthGuard)؛ و`src/app/dashboard/[...slug]/page.tsx:45` يعرض أول مقطع فقط (`/dashboard/a/b` → «/a غير موجود»).

---

## 5) ما تم فحصه ووُجد سليماً (سلباً — منع تكرار الإبلاغ)

1. **Hydration:** نظيف بالكامل — لا `Date.now()/Math.random()` في أي مسار عرض أولي؛ `timeAgo` تُستعمل فقط على بيانات react-query بعد التحميل؛ `calendar/page.tsx:20-33` و`scheduled/page.tsx:23-30` تعالجان server/client month & min-date بالفعل (v9-B1/B6)؛ AuthGuard يبقي اللوحة على loader حتى يُثبت التفويض فيتطابق SSR/CSR.
2. **حدود error/loading/not-found/global-error:** 35/35 مغطاة بنمط DefaultError/DefaultLoading الموحد (+skip-link وh1 في كل شاشة خطأ).
3. **429:** login/register يعرضان قفل countdown حي مع تحليل ثواني الرسالة العربية (v12-E4.8) — ممتاز؛ طوابير الخلفية تعرض detail العربي عبر ApiError في صفحات react-query.
4. **SSE/المستمعون:** PaymentDialog ينظف SSE + poll + visibilitychange في كل مسارات الخروج (`payment/index.tsx:199-213,382-384`)؛ OnboardingWizard ينظف مستمع keydown؛ CronHeartbeatCard ينظف interval — لا تسريبات.
5. **metadata:** موجودة وكاملة (title/description/canonical/og) للعامة + login/register/connect (إصلاحات v14 سليمة)؛ robots/sitemap متسقان مع سجل المسارات المركزي.
6. **اللغة:** عربية 100% في كل النصوص الظاهرة (المصطلحات التقنية Page ID/IBAN… مقبولة)؛ `instructions` الإنجليزية في رد `/api/webhook/check` غير معروضة للمستخدم.
7. **false-empty:** جميع صفحات react-query تفصل error عن empty بفرع isError صريح + إعادة محاولة (إصلاح v14 في /admin ما زال سليماً).
8. **حارس إعادة التوجيه login (`safeRedirect`)** والمعالجة الخلفية لـ`/\` — سليم (v14).
9. **states الـdemo والـmock:** ثابتة SSR-safe.

## 6) ملاحظات عابرة (خارج نطاق المسارات)

- `app/middleware.py:157-159` يضمّن نطاقات Origin في الكود (`bot.smart-link.ly`, `api.smart-link.ly`) بينما نطاق الواجهة قابل للضبط عبر `NEXT_PUBLIC_DOMAIN` — أي نشر على نطاق مختلف يعطّل كل POST بـ403 «المصدر غير مصرح به». (مجال D5/D11 لكنه يمس كل أزرار الواجهة.)
- `auth.py:208-216` يدعم `plan_id` تجريبي عند التسجيل لكن RegisterForm لا يرسله — مسار ميت في الواجهة (يتقاطع مع C1).
- تكرار استدعاء `/api/me`: AuthGuard + admin/page.tsx + admin/telegram (3 مرات لكل تحميل إدارة) — تحسين تجميع لاحق.

## 7) الأولوية المقترحة للتنفيذ (E-wave v15)

1. **C1** (رحلة المجاني) — أولوية قصوى: أول CTA في الموقع.
2. **H1 + H5** (إصلاح ميكانيكي واحد: apiFetch مع e.message) — رخيصان وعاليان الأثر.
3. **H2 + H4** (إدارة تليجرام قابلة للاستخدام فعلاً).
4. **H3** (401 عالمي) — إصلاح بنيوي واحد يغطي 22 صفحة.
5. **H6 + M1…M8** دفعة صقل.
