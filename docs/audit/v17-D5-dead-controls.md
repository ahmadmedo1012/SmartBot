# v17-D5 — مسح وظيفي لعناصر التحكم الميتة/الوهمية (READ-ONLY)

**النطاق:** 22 صفحة dashboard + 3 صفحات admin (root/support/settings/telegram) + onboarding + subscribe (5 مكوّنات) + Shell/القائمة الجانبية/القائمة السفلية.
**المنهجية:** قراءة كاملة لكل صفحة، تتبّع كل معالج (onClick/onSubmit/onCheckedChange) حتى استدعاء fetch، ثم مطابقة كل مسار API مع تعريفه الفعلي في `routers/` (نوع الوسيطات: Form مقابل Body مقابل Request.json) — لأن زرًا «موصولًا» بـ endpoint يتوقع صيغة مختلفة هو زر ميت عمليًا.

---

## 1. الخلاصة التنفيذية

الحالة العامة **ممتازة مقارنة بالتاريخ المشبوه**: لا يوجد أي `onClick` فارغ، لا `href="#"`، لا select/tabs وهمية، وكل أزرار retry/toggle/delete/send في الصفحات الـ28 موصولة فعليًا بـ mutations عبر `apiFetch` مع معالجة أخطاء عربية. المسح العميق كشف **عيبًا هيكليًا واحدًا قاتلًا (زر يفشل 100%)**، و**كتلة تحكمات وهمية واحدة** (تحفظ ولا تُطبَّق/تعود بعد التحديث)، و**إعدادًا محفوظًا بلا أي مستهلك**، وعدة إخفاقات «وعد مقابل واقع» منخفضة الخطورة.

**عدد الإيجادات:** P0×1 · P1×2 · P2×2 · P3×4 + ملاحظات إيجابية.

---

## 2. جدول الإيجادات (مرتّب بالأولوية)

| # | الصفحة | العنصر | النوع | الأولوية | الدليل (file:line) |
|---|--------|--------|------|---------|--------------------|
| F1 | dashboard/tools | زر «حفظ» في نموذج «قالب جديد» | **زر ميت فعليًا — يفشل 422 في كل محاولة** | **P0** | الواجهة: `tools/page.tsx:42-49` ترسل `JSON.stringify` ← `csrf-client.ts:108-112` يضبط `Content-Type: application/json` ← الخادم: `templates_routes.py:30-32` يعلن `name: str = Form(...), text: str = Form(...)` **يتطلب form-encoded** ← FastAPI يرد 422 دائمًا (حقول body مفقودة) ← المستخدم يرى toast «فشل الطلب (422)». قارن مع الصفحة الشقيقة autoreply التي تستخدم `URLSearchParams` (`autoreply/page.tsx:43-48`) ضد `rules.py:71-76` (Form) فتنجح. **لا يمكن إنشاء أي قالب رد من الواجهة إطلاقًا.** |
| F2 | admin/telegram | مفتاح «تفعيل إشعارات تليجرام» + حقل «الأحداث المرسلة» | **تحكم وهمي — يُرسَل ويُتجاهَل، ويعود لقيم hardcoded بعد التحديث** | **P1** | الواجهة ترسلهما: `admin/telegram/page.tsx:145-150` (payload يحوي `events` و`isActive`) — الخادم `POST /api/telegram/config` يقرأ **botToken/chatId فقط**: `telegram_config.py:69-71` ويكتب الزوجين فقط `:80-83` — لا يوجد أي حفظ لـ events/isActive في أي جدول. `GET` يعيد قيمًا ثابتة: `telegram_config.py:47-48` (`events: ["new_order","payment","settings_change"], isActive: bool(token)`). النتيجة: المستخدم يطفئ المفتاح أو يعدّل الأحداث → «تم حفظ إعدادات تليجرام» → إعادة تحميل → القيم عادت كما كانت. (المفاتحان معروضان في `TelegramConfigSection.tsx:54` و`:94-96`.) |
| F3 | dashboard/notifications | مفاتيح «إعدادات التنبيهات» الستة (new_comments…marketing_reports) | **إعدادات تُحفَظ ولا تُطبَّق — بلا أي مستهلك** | **P1** | الحفظ حقيقي: `alerts_routes.py:102-131` (PUT يكتب `NotificationPreference`). لكن grep شامل يؤكد أن `NotificationPreference` لا تُقرأ في أي مسار توليد/تسليم إشعارات: `notifications.py:25-35` (`push_notification`) لا يستشير التفضيلات، و`list_notifications` (`:40-69`) لا يفلتر بها. المستهلكون الوحيدون: GET نفسه (`alerts_routes.py:92`)، حذف مستخدم (`users.py:84`)، وتنظيف مستأجر (`admin_routes.py:377`). نص الواجهة يدّعي: «تُحفظ إعداداتك تلقائيًا **وتُطبق على جميع المنصات**» (`notifications/page.tsx:376-378`) — **ادّعاء غير صحيح وظيفيًا**: تعطيل «تنبيهات الدفع» مثلاً لا يمنع وصول إشعار دفع. |
| F4 | dashboard/team | صفحة «الفريق» بعنوان فرعي «إدارة أعضاء الفريق» | **وعد إدارة بلا أي أدوات إدارة** | **P2** | `team/page.tsx:44` (العنوان الفرعي) و`:55-58` (EmptyState: «عند إضافة أعضاء إلى فريقك سيظهرون هنا…») — لكن الصفحة عرض-فقط: لا زر إضافة/دور/حذف. الخادم: `team_routes.py:14,19,24,29` — **GET فقط** (members/activity/performance/role-summary). CRUD كامل موجود بالخادم بلا أي واجهة: `users.py:22,44,69` (POST/PUT/DELETE /api/users) و`admin_routes.py:443,475` (platform/users GET/PATCH) — grep يؤكد صفر استدعاء لها في `frontend/src`. |
| F5 | admin/settings → بطاقة «مفاتيح الذكاء الاصطناعي» | تلميح الحفظ | **إحالة لميزة غير موجودة** | **P2** | `admin/settings/page.tsx:412-415`: «تفعّل مساعد الردود الذكية (اقتراح ردود، تحليل مشاعر) **من صفحة الأدوات**» — `dashboard/tools` لا يحتوي أي ميزة AI (قوالب وعروض فقط)، وgrep يؤكد **صفر** مستهلك frontend لـ `/api/ai/*` (`ai.py:22,42,54,70,105` يتيمة). الاستخدام الفعلي الوحيد للمفاتيح: معالج التهيئة `onboarding.py:236-260` (`/api/onboarding/suggest-reply`). المفاتيح تُحفظ فعلاً (`admin_routes.py:222-234`) لكن الوصف يوجّه المالك لمكان خاطئ. |
| F6 | onboarding (خطوة القاعدة الأولى) | زر «التالي» عند ترك الحقول فارغة | تحقق صامت | **P3** | `OnboardingWizard.tsx:241-251`: `if (step === 2 && keyword && reply)` — الحفظ شرطي؛ حقلان فارغان → التقدم دون حفظ ودون أي إشعار أن القاعدة لم تُنشأ. ليس تحكمًا ميتًا (سلوك اختياري متعمد غير فادح-السطر `:237-239` نفسه «Non-fatal»)، لكنه الثغرة الوحيدة المتبقية في فئة «تحقق عربي» داخل النطاق. |
| F7 | admin/support (طابور التذاكر) | الجدول بلا أي عمود إجراءات | قناة اطلاع أحادية الاتجاه | **P3** | الصفحة `admin/support/page.tsx:199-248` قراءة-فقط (لا رد/إغلاق). الخادم يملك `POST /api/support/tickets/{id}/reply` (`support.py:206-237`) و`/close` (`:240-260`) — لكن كليهما **tenant-scoped** (`:218,249`: `t.tenant_id == current_user._tenant_id`) فيعيد 404 لمالك المنصة (tenant 0). أي أن الرد عبر التطبيق متاح لـ admin المستأجر فقط؛ الرد الوحيد للمالك هو بوت تليجرام — قرار موثّق (v16-E3) لكن «تذاكر الدعم» في `admin/page.tsx:175-177` قد توحي بإدارة كاملة. |
| F8 | نقاط نهاية بلا واجهة (فئة عامة) | — | ميزات خلفية كاملة بلا UI | **P3** | إخفاء/حذف تعليق: `replies.py:172,189` · إغلاق تذكرة: `support.py:240` · توليد/جدولة تقارير: `reports_routes.py:48,121,135,149` (صفحة التقارير KPI-فقط) · تعديل قالب: `templates_routes.py:40` (PUT) · إنشاء عرض: `offers_routes.py:34` (POST — الأدوات تعرض/تبدّل/تحذف فقط). هذه «قدرات معطلة» وليست أزرارًا ميتة — تحويلها لأزرار هو مكسب وظيفي مباشر. |

---

## 3. أجوبة الأسئلة الصريحة للمهمة

### 3.1 `[...slug]/page.tsx` — ماذا يعرض حرفيًا؟
**لا توجد رسالة «قيد التطوير» بعد.** الملف (`dashboard/[...slug]/page.tsx`, 47 سطرًا) يعرض صفحة Not-End مصمّمة: أيقونة HelpCircle داخل دائرتين، `h1` sr-only «لوحة التحكم»، ثم:

- `:27` — «هذا القسم غير متاح»
- `:29` — «المسار /{slug} غير موجود ضمن لوحة التحكم»
- `:32` — «ربما كان رابطاً قديماً — كل الأقسام متاحة من القائمة الجانبية»
- `:34-36` — زر «العودة إلى لوحة التحكم» (`window.location.assign("/dashboard")`) — **يعمل**.

التعليق `:8-11` يوثّق أن الـ21 slug كلها لها صفحات مخصصة وأن GenericListView القديم أُزيل (v9-B8). المسار الشامل صار **not-found حقيقي** فقط.

### 3.2 أزرار ميتة (onClick فارغ/مفقود)
**صفر** في النطاق كله. grep على `onClick={() => {}}` ونظائره: لا نتائج. كل زر في الـ28 ملفًا يملك معالجًا يصل إلى fetch أو router.push أو setStep مُغذّي لـ fetch لاحقًا.

### 3.3 أزرار disabled بلا سبب ظاهر
لا شيء معلَّق بلا سبب. كل حالات disabled مرتبطة بحالة ظاهرة: `isPending` صفّي، حقول فارغة (زر الحفظ معطّل حتى الامتلاء مع نص الزر نفسه يشرح: «اختر خطة أولاً» — `PlanSelector.tsx:123`)، أو شرط معالج («إرسال رسالة تجريبية» معطّل أثناء `dirty` لأن الحفظ يجب أن يسبق الاختبار — `admin/settings/page.tsx:375`). StepIndicator يعطّل خطوة «المراجعة» قبل اختيار خطة — دلالة معالج خطوات سليمة.

### 3.4 تحكمات وهمية (state محلي لا يصل API)
- **F2** (أقوى حالة): المفتاح/الأحداث في admin/telegram — تصل API لكن الخادم يتجاهلها (أسوأ فئة: وهمية بالمعنى الكامل — تعود بعد التحديث).
- **F3**: مفاتيح notifications تصل API وتُحفظ لكن لا تُطبَّق على أي تسليم.
- ما عدا ذلك: **لا select في النطاق كله** (grep `<select` = صفر)، والمفتاح الوحيد `role="switch"` (notifications:343) موصول بـ PUT. فلاتر messages (all/unread/read/needs_reply) **تغيّر الـ queryKey وتعيد الجلب فعليًا** (`messages/page.tsx:111-120`) — ليست شكلية.

### 3.5 روابط مكسورة
**صفر.** طوبولوجيا كاملة تم التحقق منها: 21 رابط قائمة `AdminSidebar.tsx:52-93` + 4 روابط `MobileBottomNav.tsx:24-27` تطابق صفحات موجودة 1:1 في `src/app/dashboard/*/`. روابط العرض: `/connect` ✓، `/subscribe` ✓، `/admin/settings|telegram|support` ✓ (كُشفت في `admin/page.tsx:160-177` — كانت يتيمة قبل v14/v16)، `/login?redirect=` ✓. ملاحظة شكلية فقط: `robots.ts:23` يحظر مسار `/onboarding` الذي ليس route مستقلة (المعالج مكوّن يُركَّب من `AuthGuard.tsx:26-29`) — غير مرئي للمستخدم ولا يكسر شيئًا.

### 3.6 forms بلا تحقق عربي
كل النماذج في النطاق محمية: support (required + role=alert + toast بطول أدنى — `support/page.tsx:322,338,345`)، pages (toast `:37-39`)، autoreply/tools/posts/scheduled/broadcast/marketing (disabled على الامتلاء + حدود طول)، settings (طول 8 + toast)، subscribe (زر معطّل بنص مُفسِّر)، PaymentDialog (تحقق هاتف بنمط `09\d{8}` مع رسالة — `payment/index.tsx:249-265`). **الثغرة الوحيدة**: F6 (تقدم صامت بلا رسالة في معالج التهيئة).

### 3.7 tabs بلا تمييز محتوى
**لا tabs في نطاق dashboard/admin/subscribe/onboarding** (grep tab-state = صفر). تبويبات demo (خارج النطاق) حقيقية باتفاق v10-C4. أقرب نمط — فلاتر admin/support وadmin/subscriptions — يبدّل queryKey ويعيد الجلب (`admin/support/page.tsx:92-99`).

---

## 4. مصفوفة التوصيل (صفحة ← API ← حالة)

| الصفحة | التحكمات الفعالة | الحالة |
|--------|------------------|--------|
| dashboard (رئيسية) | KpiCard hrefs، empty-state CTAs → /connect،/autoreply | ✓ موصولة (`page.tsx:108-113,283`) |
| messages | بحث debounce، فلاتر، إرسال رد، ربط | ✓ (`:100-103,112,132-144`) |
| comments | رد لكل صف + pending صفّي | ✓ (`:37-55,144-153`) |
| posts / scheduled | إنشاء/نشر/حذف (URLSearchParams→Form ✓) | ✓ |
| autoreply | إنشاء/تبديل/حذف قواعد | ✓ |
| tools | تبديل/حذف عرض ✓ · **إنشاء قالب ✗ (F1)** · حذف قالب ✓ | ◐ |
| broadcast | إنشاء (JSON→Request.json ✓) + إرسال | ✓ |
| marketing | إنشاء/إرسال/حذف + audience-size حيّ | ✓ |
| notifications | feed/mark-one/mark-all ✓ · **التفضيلات ◐ (F3)** | ◐ |
| support | إنشاء تذكرة + رد + خيط | ✓ |
| settings | عرض /api/me + تغيير كلمة مرور (JSON→Body ✓) | ✓ |
| billing | رصيد/سجل + CTA→/subscribe | ✓ |
| analytics/reports/audience/leads/calendar/activity/team/ads/pages | قراءة + retry + تصفح شهري | ✓ (قراءة-فقط بالتصميم؛ team=الوعد الفارغ F4؛ ads=«قريباً» صادقة موثّقة `ads/page.tsx:41-54`) |
| admin (root) | قبول/رفض دفع (JSON→Body ✓) + فلاتر + Cron | ✓ |
| admin/support | فلاتر/صفحات/refresh | ✓ (قراءة-فقط — F7) |
| admin/settings | 4 أقسام حفظ dirty-aware (JSON→Body ✓، مفتاح masked يُتجاهل `admin_routes.py:184-185`) | ✓ |
| admin/telegram | حفظ توكن/chatId ✓ · **isActive+events ✗ (F2)** · تشخيص حقيقي dry-run ✓ · approvers/targets CRUD ✓ | ◐ |
| onboarding | 5 endpoints (كلها Body ✓) + اقتراح AI | ✓ |
| subscribe | خطط→مراجعة→PaymentDialog (رفع+اشتراك+تحقق) | ✓ |

---

## 5. التوصيات (مرتبة بالعائد/الجهد)

1. **F1 (سطر واحد):** غيّر جسم createTmpl في `tools/page.tsx:43-48` إلى `new URLSearchParams({ name, text, category })` — يحاكي نمط autoreply المجرَّب. يفتح ميزة كاملة كانت معطلة.
2. **F2 (خياران):** إمّا إزالة المفتاح/الأحداث من الواجهة (وحذفها من payload `:147-149`)، وإمّا استقبالهما فعليًا في `telegram_config.py:53` (عمودان في SystemConfig + قراءتهما في GET `:38-50` بدل hardcoded).
3. **F3:** أيّ من: (أ) تعديل نص `notifications/page.tsx:376-378` ليقول «تُحفظ تفضيلاتك» بلا وعد التطبيق، أو (ب) تنفيذها فعليًا: استشارة التفضيلات في `push_notification` أو فلترة feed بنوع الإشعار.
4. **F4:** إما خفض الوعد (العنوان الفرعي «أعضاء الفريق» + إزالة «إدارة») وإما بناء زر «دعوة عضو» فوق `POST /api/users` الجاهز — أعلى ميزة «مكسب مجاني» بالخادم.
5. **F5:** صحّح التلميح في `admin/settings/page.tsx:413` ليقول «من معالج الإعداد الأول» بدل «صفحة الأدوات».
6. **F8:** مرشّح لموجة E: أزرار إخفاء/حذف تعليق، وإغلاق تذكرة من طابور الأدمن (يتطلب مسارًا platform-scoped جديدًا لأن reply الحالي tenant-scoped).

## 6. نقاط قوة تُثبَّت (لا تُلمس)

- انتظام العقد: كل استدعاء يمرّ `apiFetch`+`unwrapApi`، والأخطاء تظهر بالعربية مع retry مرئي (لا فشل صامت).
- pending صفّي متسق: `deleteTmpl.variables === t.id` ونظائره في كل صفحة إجراءات.
- الحفاظ على مسودات الرد عند الفشل (support `:124-127`، comments `:42-51`) — صحيح وظيفيًا.
- استرجاع القناع: admin/telegram لا يبثّ التوكن المخزّن ولا يعيد إرسال القناع (`TelegramConfigSection.tsx:59-66` + `telegram_config.py:59-63` + `admin_routes.py:184-185`).
