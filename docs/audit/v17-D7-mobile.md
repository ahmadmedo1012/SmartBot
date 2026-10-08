# v17-D7 — تدقيق تجربة الجوال واللمس (375px)

> **وكيل تشخيص READ-ONLY** — Task ID: v17-D7 · التاريخ: 2026-09-10
> النطاق: `fb_dashboard/frontend/src` — 23 صفحة dashboard + 4 صفحات admin + الصفحات العامة
> (landing/pricing/login/register/subscribe/connect/demo) على عرض 375px.
> تدقيق ثابت (static) من الكود — لا تعديل أي سطر. عقد التنقل الجوال قُرئ فعليًا:
> `MobileBottomNav.tsx` + `DashboardShell.tsx` + `e2e/mobile-nav.spec.ts`.

---

## 0. الخلاصة التنفيذية

| # | المحور | النتيجة | ملاحظة |
|---|---|---|---|
| 1 | التنقل الجوال (dashboard) | **ممتاز** ✅ | شريط سفلي 5 خانات + sheet بكل الأقسام — كل قسم ≤2 ضغطة، e2e يثبته |
| 2 | التنقل الجوال (admin) | **غائب كليًا** 🔴 | `/admin/*` بلا أي شريط/درج — صفحة معلّقة على الجوال |
| 3 | أهداف اللمس | **محمية جزئيًا** 🟡 | `Button` يفرض 44px داخليًا (عبقري) لكن 10 مواضع **خام** تحت 40px |
| 4 | الجداول | **آمنة انسيابيًا** ✅ | 4 جداول فقط، كلها داخل `overflow-x-auto` — لا انضغاط/تمزق؛ لا بطاقات بديلة |
| 5 | الطبقات اللاصقة | **نظيفة** ✅ | طبقة sticky واحدة لكل صفحة (h-14) + شريط سفلي fixed — لا تكدس |
| 6 | الحقول ولوحة المفاتيح | **13 حقلًا يكسر قاعدة 16px** 🔴 | iOS يكبّر تلقائيًا عند التركيز (أسوأها `text-xs` = 12px في الدعم) |
| 7 | viewport / safe-area | **نصف مفعّل** 🔴 | لا `viewportFit:"cover"` → كل `env(safe-area-inset-*)` = 0 (no-op) |
| 8 | الأداء الملموس | **جيد جدًا** ✅ | RSC landing + lazy charts + bundle endpoint واحد؛ تحفظات على polling |
| 9 | الصفحات العامة @375 | **سليمة** ✅ | شبكات تنهار لعمود واحد؛ `viewport-sweep` يثبت صفر overflow أفقي |

### نسبة اكتمال تجربة الجوال: **≈ 71%**

البنية الكبيرة (التنقل، الأعمدة، الجداول، اللاصق) صلبة ومختبرة — لكن **التفاصيل
العضوية للإبهام**: حقول خام 14px/12px تسبب تكبير iOS (مسار الدعم والمال)،
safe-area غير مفعّل، أزرار كشف كلمة المرور 28px، و`/admin` معلق بلا تنقل.

---

## 1. التنقل على الجوال — العقد الفعلي

### 1.1 البنية (قوية)

- **`src/components/layout/MobileBottomNav.tsx`** موجود منذ v6+ ومُوصَّل فعليًا:
  - `DashboardShell.tsx:66` (كل مسارات `/dashboard/*`)
  - `demo/page.tsx:571` (نفس البنية بلا نسخ موازية — تعليق `:527` يؤكد)
- الشريط السفلي: `grid grid-cols-5` (`MobileBottomNav.tsx:176`) — 4 أقسام ثابتة
  (لوحة التحكم/الرسائل/التحليلات/الإشعارات، `:23-28`) + زر «المزيد» (`:195-204`).
- Sheet «كل الأقسام»: `defaultNavSections` من `AdminSidebar.tsx:48-96` — **22 قسمًا**
  فعليًا (5+3+4+5+5) مرتبة في `grid grid-cols-4` (`MobileBottomNav.tsx:139`).
- **عقد ≤2 ضغطة محقق**: عنصر الشريط = ضغطة واحدة، أي قسم آخر = «المزيد» ثم القسم = ضغطتان.
- عقود a11y كاملة في الـ sheet: `role="dialog"` + `aria-modal` + مصيدة Tab + Escape
  + إعادة التركيز للزر الزار (`:51-82`).
- الجدار البصري: sidebar مخفي تحت md (`DashboardShell.tsx:46` `hidden md:block`)،
  الشريط يظهر تحت md فقط (`:173` `md:hidden`)، والمحتوى يحصل `pb-16 md:pb-0` (`:57`).

### 1.2 الاختبار الحي (e2e/mobile-nav.spec.ts)

- viewport 375×812 (`:18`)؛ يثبت: الشريط مرئي + الـ sidebar مخفي (`:48-51`)،
  التنقل بين 5 أقسام بضغطة واحدة (`:54-65`)، الوصول لقسم عميق (تقويم) عبر
  الـ sheet بضغطتين (`:67-75`)، وعدد أزرار الـ sheet ≥22 (`:80-81`) + لقطات شاشة.
- هذا عقد جوال مكتوب ومُختبر — **نادر الجودة** في المشاريع العربية.

### 1.3 الثغرات

| الثغرة | الدليل | الخطورة |
|---|---|---|
| **`/admin/*` بلا أي تنقل جوال** — admin/layout.tsx يركّب AuthGuard+QueryProvider+Toaster فقط؛ لا AdminSidebar ولا MobileBottomNav → مدير المنصة على الجوال يصل لصفحة واحدة ثم «معلّق» (رجوع المتصفح فقط) | `admin/layout.tsx:22-33` | 🔴 P0 |
| زر إغلاق الـ sheet `size-8` = **32px** هدف لمس (كل عناصر Header العامة 44px) | `MobileBottomNav.tsx:130` | 🟡 P1 |
| تعليقات/tests تقول «23 قسمًا» — العدد الفعلي **22** (انجراف توثيقي) | `MobileBottomNav.tsx:6-7` مقابل `AdminSidebar.tsx:48-96` | 🟢 P3 |
| تسميات شريط سفلي `text-3xs` (10px) وsheet `text-2xs` (11px) — مقروئية حدّية لإبهام يمر فوقها | `MobileBottomNav.tsx:185,148` | 🟢 P2 (مقروئية) |

---

## 2. أهداف اللمس (<40px)

### 2.1 حماية بنيوية تُثبَّت (اكتشاف إيجابي مركزي)

`button.tsx:11` يفرض في **أساس** كل زر: `min-h-11 min-w-11` (44×44px) — أي أن كل
استدعاءات `Button` بأحجام صغيرة (`h-7`, `h-8`, `size-8`, `className="text-xs h-7"`)
تُصيَّر فعليًا **44px** لأن `min-height` تتغلب على `height` في CSS. لذلك كل
الأزرار «الصغيرة ظاهريًا» في messages/notifications/marketing/scheduled/posts/autoreply
سليمة فعليًا. (مثال: `autoreply/page.tsx:199,202` `size-8 p-0` → 44px مرسومة.)

### 2.2 العناصر الخام تحت 40px (لا تمر عبر Button — بلا حماية)

| # | العنصر | الموضع | الحجم الفعلي |
|---|---|---|---|
| 1 | فلترات المحادثات (الكل/غير مقروء/مقروء/تحتاج رد) | `messages/page.tsx:185-199` (`text-xs px-3 py-1.5`) | **~28px** ×4 أزرار متلاصقة |
| 2 | حقل الرد السريع على التعليق | `comments/page.tsx:142` (`h-8`) | **32px** |
| 3 | أزرار الأولوية (radiogroup) | `support/page.tsx:302` (`h-8`) | **32px** ×4 |
| 4 | حقل رد التذكرة | `support/page.tsx:490` (`h-9`) | 36px (وحقل نص 12px — §5) |
| 5 | زر إغلاق sheet التنقل | `MobileBottomNav.tsx:130` (`size-8`) | **32px** |
| 6 | أزرار كشف كلمة المرور (login) | `login/page.tsx:232` (`size-7`) | **28px** |
| 7 | أزرار كشف كلمة المرور (register ×2) | `register/RegisterForm.tsx:210,233` (`size-7`) | **28px** |
| 8 | زر كشف توكن تليجرام (admin) | `admin/telegram/TelegramConfigSection.tsx:72` (`size-7`) | **28px** |
| 9 | مفاتيح الفوترة شهري/سنوي | `pricing/page.tsx:130,139` (`px-5 py-1.5`) | **~28px** — مسار مال |
| 10 | روابط تنقل admin السريعة (الإعدادات/تليجرام/الدعم) | `admin/page.tsx:160,167,175` (`px-3 py-1.5`) | **~28px** |
| 11 | «اقترح رداً» في المعالج | `onboarding/OnboardingWizard.tsx:490` (`min-h-8`) | 32px (موثّق عمدًا كـ AA 24px — دون راحة 40) |
| 12 | حقل البحث في المحادثات | `messages/page.tsx:181` (`h-9` override على `h-12`) | 36px |

**عدّ تقريبي: ~19 هدفًا خامًا تحت 40px** (زر×4 فلتر + 2×4 راديو/كشف + toggle×2 + إغلاق + روابط×3…).

### 2.3 تجاور خطير (mis-tap بين أهداف سليمة الحجم)

أزواج أزرار أيقونية متجاورة بمسافة `gap-1`/`gap-1.5` (4–6px) — إجراءات **نشر/حذف**
متلاصقة: `scheduled/page.tsx:160`، `posts/page.tsx:140`، `autoreply/page.tsx:198`،
`marketing/page.tsx:282`. البعد بين مركزي زر «نشر» و«حذف» ≈ 48px فقط — ضغطة
منحرفة تصل للحذف بدل النشر. 🟡 P2.

---

## 3. الجداول على 375px

**الجداول موجودة في 4 مواضع فقط** (كل الصفحات «الكثيفة» الأخرى بطاقات/قوائم):

| الصفحة | الأعمدة | المعالج | الحكم |
|---|---|---|---|
| `admin/support/page.tsx:199` | 7 (الرقم/الموضوع/المستأجر/الأولوية/الحالة/البريد/التاريخ) | `overflow-x-auto` (`:190-195`) | ✅ تمرير أفقي، لا تمزق |
| `admin/page.tsx:253` | 7 + عمود إجراءات (قبول/رفض) | `overflow-x-auto` (`:248`) | ✅ تمرير أفقي |
| `dashboard/page.tsx:253` | 2 (القاعدة/الحالة) | `overflow-x-auto` (`:252`) | ✅ يتّسع أصلًا |
| `demo/page.tsx:262` | 2 | (نفس نمط dashboard) | ✅ |

- **لا يوجد جدول ينضغط أو يتمزق**: العرض محفوظ بالتمرير الأفقي + `body { overflow-x: hidden; max-width: 100vw }` (`globals.css:333,345`) + `viewport-sweep.mjs` يثبت صفر overflow أفقي على الصفحات العامة في 375/768/1440.
- **بطاقات بديلة للجوال: غير موجودة** — لا `md:table` switch ولا CSS stacked-table. لافت: خلايا admin تحمل `data-label="…"` (`admin/support/page.tsx:217-244`, `admin/page.tsx:270-280`) **ولا يستهلكها أي CSS** (grep على globals.css: صفر `data-label`) — سمات ميتة توحي بنيّة نمط stacked لم يكتمل. 🟡 P2.
- activity/scheduled/team/leads/messages/comments/notifications: كلها بطاقات Card/list — **تصميم جوال-صديق بنيويًا** ✅ (مثل `team/page.tsx:60-80`، `leads/page.tsx:57-80`).
- رسالة الجوال: جدول 7 أعمدة على 375px = تمرير ~نصف الشاشة لرؤية «التاريخ» — مقبول لصفحات admin (جمهور محدود) لكن أول مرشح لبطاقات مكدّسة إذا فُتحت للمستأجرين.

---

## 4. العناصر اللاصقة (sticky)

- **كل صفحة dashboard: طبقة sticky واحدة** — رأس `sticky top-0 z-30` بارتفاع h-14
  (56px): إما عبر `PageHeader.tsx:44-50` (compact h-12) أو رؤوس خام متطابقة
  (19 صفحة: comments:59, scheduled:84, team:35, activity:40, leads:30 …).
- الشريط السفلي `fixed inset-x-0 bottom-0 z-30` (`MobileBottomNav.tsx:172-173`) —
  خارج التدفق، **لا يتكدس** مع الرأس.
- داخل sheet الأقسام: رأس sticky خاص بالنطاق القابل للتمرير (`:109`) — طبقة معزولة، سليمة.
- الصفحة العامة: Header ثابت h-16 **يخفي نفسه عند التمرير للأسفل** (`Header.tsx:172-175` `translate-y-full invisible`) — أفضل ممارسة جوال.
- `scroll-padding-top: 5rem` (`globals.css:345`) يحمي التركيز من الاختفاء خلف الرأس.
- **الحكم: صفر تكدس.** أقصى تكديس ممكن = رأس صفحة (56) + شريط سفلي (54) = قناة عمودية 375×(812-110) سليمة.

---

## 5. لوحة المفاتيح والحقول (تكبير iOS التلقائي)

**القاعدة**: iOS يكبّر الصفحة تلقائيًا عند التركيز على أي input/textarea بحجم خط
<16px — فيختفي الحقل خلف لوحة المفاتيح ويضطر المستخدم لإرجاع العرض يدويًا بعد كل تركيز.

### 5.1 الطبقة المحمية (تُثبَّت) ✅

- `Input` المشترك: **`text-base md:text-sm`** + `h-12` (`input.tsx:51`) — نمط مضاد
  للتضخيم صحيح 16px على الجوال.
- `Textarea` المشترك: نفس النمط (`textarea.tsx:21`).
- كل الصفحات المارة عبرهما سليمة: **login, register, connect, broadcast,
  admin/telegram, admin/settings, onboarding (الحقول), dashboard/support (الموضوع/البريد)**.

### 5.2 الحقول الخام الكاسرة (14px/12px على الجوال) 🔴 P0

| # | الحقل | الموضع | الخط |
|---|---|---|---|
| 1 | **رد التذكرة (الدعم)** | `support/page.tsx:490` `h-9 text-xs` | **12px — الأسوأ** |
| 2 | الرد السريع على التعليق | `comments/page.tsx:142` `h-8 text-sm` | 14px |
| 3 | رد المحادثة (messages) | `messages/page.tsx:392` textarea `text-sm` | 14px |
| 4 | **وقت الجدولة (scheduled)** | `scheduled/page.tsx:111-118` `<Input className="text-sm">` — **override يهزم الأساس 16px** (cn يضع className آخرًا) | 14px |
| 5 | محتوى المنشور المجدول | `scheduled/page.tsx:107` textarea `text-sm` | 14px |
| 6 | نص المشكلة (support) | `support/page.tsx:332` textarea `text-sm` | 14px |
| 7 | نص الرسالة (حملة تسويق) | `marketing/page.tsx:181` textarea `text-sm` | 14px |
| 8-10 | اسم القاعدة/الكلمات/نص الرد (autoreply) | `autoreply/page.tsx:102,113,125` | 14px |
| 11 | أولوية القاعدة (autoreply) | `autoreply/page.tsx:136` `w-32 h-10 text-sm` | 14px |
| 12 | منشور جديد (posts) | `posts/page.tsx:90` textarea `text-sm` | 14px |
| 13-14 | حقلا الأداة + textarea (tools) | `tools/page.tsx:96,97,98` `h-9 text-sm` | 14px |
| 15 | نص الرد في المعالج | `onboarding/OnboardingWizard.tsx:511` | 14px |

**العدد: ~15 حقلًا يكسر القاعدة**، وكلها في الصفحات اليومية (messages/comments/scheduled/support) — أي أن **عميل iPhone يفتح الرد على تعليق فيتكبّر له الإطار 15 مرة يوميًا**. الحالة #4 خبيثة خصوصًا: حقل يبدو «محترفًا» (مكوّن Input المشترك) لكن الـ override أنزل الخط لـ14px.

---

## 6. viewport / الاتجاه / الدوران

| البند | الدليل | الحكم |
|---|---|---|
| `width=device-width, initialScale=1` | `layout.tsx:51-52` | ✅ |
| لا `maximumScale` (التكبير اليدوي مسموح — a11y) | غيابه عن `:46-53` | ✅ |
| **لا `viewportFit: "cover"`** | `layout.tsx:46-53` | 🔴 **كل `env(safe-area-inset-*)` = 0** |
| `.safe-area-pb` للشريط السفلي | `globals.css:584-587` | 🟡 **no-op حاليًا** بلا viewport-fit |
| FloatingWhatsApp `bottom-[calc(env(safe-area-inset-bottom)+1rem)]` | `FloatingWhatsApp.tsx:25` | 🟡 no-op + راجع §8 لتداخل /demo |
| PWA: `display:standalone, orientation:portrait, dir:rtl` + maskable icons | `manifest.ts:9-20` | ✅ (قفل الاتجاه مقصود) |
| `dir="rtl"` جذري + `dir="auto"` للقيم الحية | `layout.tsx:57` + مسح D3/D5 السابق | ✅ |
| html: `overflow-x:hidden; max-width:100vw` | `globals.css:333,345` | ✅ حماية دوران أفقي |

**السيناريو الحرج**: في PWA standalone على iPhone بحزّ home-indicator، الشريط
السفلي (z-30، خلفية card/95) يجلس فوق منطقة الإيماءة النظامية لأن `safe-area-pb`
تقرأ صفرًا — والأسوأ أن فريقًا «يصلح» ذلك مستقبلًا بإضافة `viewportFit:"cover"`
فقط سيكسر تباعد المحتوى: `pb-16` (64px) في `DashboardShell.tsx:57` لا يكفي
لشريط 54px + inset 34px (المطلوب pb-[calc(4rem+env(...))]). الإصلاح يجب أن
يقترن دائمًا. 🔴 P0 (زوج مرتبط).

**الدوران (landscape)**: لا اختبار e2e لـ 667×375، ولا معالجة خاصة — البنية
(overflow-x محمي + شبكات تنهار) تجعل الانكسار غير متوقع، لكن الطبقة اللاصقة
h-14 + شريط سفلي ~54px في landscape 375px ارتفاعًا سيأكلان ~30% من الشاشة.
غير مختبر. 🟢 P3.

---

## 7. الأداء الملموس على الجوال (من الكود)

### 7.1 نقاط قوة تُثبَّت ✅

- **Landing = RSC + جزر** (`page.tsx:1-9`): التعليق يوثق أن 966KB→هبوط حاد لـ islands فقط؛ hero يُرسم من الخادم عند أول paint (الـ LCP على 3G).
- **Providers رشيقة** (`providers.tsx:1-33`): framer/react-query/sonner خارج المسارات العامة — الـ hydration على الجوال أدنى ممكن.
- **recharts كسول** (`charts/lazy.tsx:23-31` `ssr:false + skeleton`) — 344KB خارج first-load؛ وdemo التبويب الافتراضي رسم CSS صفر تبعيات (`demo/page.tsx:147-184`).
- **dashboard = endpoint واحد** (`dashboard/page.tsx:122-127` `/api/dashboard/bundle`) — **لا شلالات fetch** في الصفحات الرئيسية؛ استعلامات parallel عبر react-query (marketing: الحملات + حجم الجمهور معًا).
- علامات سفينة: keepPreviousData + debounce 300ms بحث (messages:99-113) + skeletons في كل الصفحات.

### 7.2 تحفظات 🟡

| الظاهرة | الدليل | الأثر الجوالي |
|---|---|---|
| **polling مزدوج في messages**: قائمة 15s + خيط مفتوح 10s معًا | `messages/page.tsx:114,128` | بطارية/بيانات + R1 أدناه |
| **قفزة للأسفل كل poll**: `scrollToBottom` يُستدعى على كل تحديث للرسائل (كل 10s) أثناء قراءة المستخدم للأعلى | `messages/page.tsx:146-150` | UX مؤذٍ فعليًا على الجوال (وثّقته D10 أيضًا) |
| لا `refetchIntervalInBackground:false` إلا في dashboard-bundle | `dashboard/page.tsx:126` مقابل البقية | الافتراضي يوقفها عند فقد التركيز — مقبول، لكن standalone-PWA «مركّزة» دائمًا |
| polling كثيف عام: comments 20s، activity 15s، team/scheduled/autoreply 30s | `comments:32`, `activity:33`, `team:21`, `scheduled:38`, `autoreply:31` | تكلفة جوال تراكمية (ليست حرجة) |

---

## 8. الصفحات العامة على 375px

| الصفحة | الحالة | الأدلة |
|---|---|---|
| **landing /** | ✅ | hero `min-h-[100svh]` (وحدات svh الصحيحة للجوال) `page.tsx:117`؛ Header يخفي نفسه عند التمرير؛ قائمة الجوال 44px (`Header.tsx:23,110,123`)؛ عناصرها px-4 py-3 |
| **pricing** | ✅ مع ⚠️ | بطاقات `md:grid-cols-3` → عمود واحد (`pricing/page.tsx:181`)؛ لكن مفاتيح شهري/سنوي **28px** (`:130,139`) — على مسار الدفع |
| **login** | ✅ مع ⚠️ | بطاقة `max-w-sm` تتّسع؛ حقول 16px آمنة؛ زر كشف كلمة المرور **28px** (`login/page.tsx:232`) |
| **register** | ✅ مع ⚠️ | نفس login؛ زرّا كشف **28px×2** (`RegisterForm.tsx:210,233`) |
| **subscribe** | ✅ | `PlanSelector` `md:grid-cols-2 lg:grid-cols-4` → عمود واحد (`PlanSelector.tsx:50`)؛ زر الدفع `h-14` full-width (`PaymentSection.tsx:58`)؛ أزرار النسخ 40px (`copy-field.tsx:26,58`)؛ الحوار `max-w-[calc(100%-2rem)] max-h-[90dvh]` (`dialog.tsx:53`) — جوال-آمن كليًا. **لا يوجد جدول مقارنة خطط** — بطاقات فقط (`plan-comparison.ts` مكتبة بيانات لا DOM) |
| **connect** | ✅ | كل الحقول عبر `Input` المشترك 16px (`connect/page.tsx:301,318`) |
| **demo** | ⚠️ | جيد بنيويًا (mobile nav كامل) — لكن انظر التداخل أدناه |

### 8.1 تداخل FloatingWhatsApp مع شريط التنقل في /demo 🔴 P1

- `/demo` يركّب **كليهما**: `MobileBottomNav` (fixed bottom z-30، ارتفاع ~54px)
  (`demo/page.tsx:571`) + `FloatingWhatsApp` (fixed `end-4 bottom-[calc(...)+1rem)]`
  **z-[60]**، 56px) (`demo/page.tsx:576`, `FloatingWhatsApp.tsx:24-26`).
- الحساب الهندسي في RTL: `end-4` = يسار؛ الزر يشغل x∈[16,72] وy∈[16,72] من
  الأسفل — بينما خانة «المزيد» (الخانة الخامسة = أقصى اليسار في شبكة RTL) تشغل
  x∈[0,75] وy∈[0,54]. **التقاطع x∈[16,72]×y∈[16,54] يبتلع معظم زر «المزيد»** —
  بوابة كل الأقسام الـ22 مغطاة جزئيًا بزر واتساب في الصفحة الأكثر زيارة من
  الجوال قبل تسجيل الدخول. تعليق `demo/page.tsx:573-575` يقرّ بالتراكب («sits
  above the mobile nav») كقصد z-index — لكنه تراكب **مادي** لا طبقي فقط.
- صفحات dashboard لا تركّب FloatingWhatsApp (DashboardShell نظيف) → المشكلة في /demo فقط؛ وviewport-sweep لا يكشفها لأنه يقيس overflow أفقي لا تراكب.

### 8.2 فجوات قياس

- `viewport-sweep.mjs:6` يغطي `/, /login, /register, /pricing, /demo, /terms, /privacy`
  فقط — **لا /subscribe ولا /connect ولا /onboarding ولا أي صفحة dashboard/admin
  بـ 375px** (هذه تحتاج جلسة موثّقة storageState — نفس توصية v17-D11 G4).
- لا اختبار landscape، ولا اختبار sheet كثافة المحتوى.

---

## 9. جدول الأولويات

| P | الإيجاد | الدليل | الإصلاح المقترح (سطر واحد) | الجهد |
|---|---|---|---|---|
| **P0-1** | ~15 حقلًا <16px → تكبير iOS عند كل تركيز (أسوأها 12px رد التذكرة) | §5.2 (support:490, comments:142, messages:392, scheduled:117…) | استبدال الخام بـ`Input/Textarea` المشترك أو إضافة `text-base md:text-sm` + إزالة override scheduled:117 | صغير لكل حقل، موجة واحدة |
| **P0-2** | `/admin/*` بلا أي تنقل جوال | `admin/layout.tsx:22-33` | تركيب MobileBottomNav (أو نسخة admin-sections) داخل admin layout | صغير |
| **P0-3** | `viewportFit:"cover"` غائب → safe-area كله no-op، و`pb-16` سينكسر لو أُضيف منفردًا | `layout.tsx:46-53`, `globals.css:585`, `DashboardShell.tsx:57` | إضافة viewport-fit + ترقية pb-16 → `pb-[calc(4rem+env(safe-area-inset-bottom))]` **في نفس التغيير** | صغير |
| **P1-1** | FloatingWhatsApp يغطي زر «المزيد» في /demo | §8.1 (`demo:576` + `FloatingWhatsApp:25`) | رفع FAB فوق الشريط: `bottom-[calc(env(...)+5rem)] md:bottom-…` في /demo فقط | سطر |
| **P1-2** | ~19 هدف لمس خام <40px (فلترات 28px، كشف كلمة مرور 28px، راديو 32px…) | §2.2 | رفعها إلى min-h-10/11 أو توسيع padding | موجة قصيرة |
| **P1-3** | قفز scroll تلقائي كل 10s أثناء القراءة + polling مزدوج في messages | `messages:146-150,114,128` | scrollToBottom فقط عند كون المستخدم قرب الأسفل + خفض/توحيد interval | صغير |
| **P1-4** | مفاتيح الفوترة 28px على مسار الدفع | `pricing:130,139` | py-2.5 → ≥40px | سطر |
| **P2-1** | جداول admin 7 أعمدة scroll أفقي فقط؛ `data-label` سمات ميتة بلا CSS | §3 | بطاقات مكدّسة `md:hidden`/`hidden md:table` أو CSS `td::before content:attr(data-label)` | متوسط |
| **P2-2** | أزرار نشر/حذف متجاورة بفاصل 4-6px | `scheduled:160, posts:140, autoreply:198` | gap-2 (8px) + فصل بصري للهدم (لون destructive) | سطر ×4 |
| **P2-3** | viewport-sweep لا يغطي /subscribe وdashboard وadmin على 375px | `viewport-sweep.mjs:6` | توسيع القائمة + storageState (يتقاطع مع G4/v17-D11) | متوسط |
| **P2-4** | تسميات الشريط 10px/شارات 10px — مقروئية إبهام | `MobileBottomNav.tsx:185` | text-2xs (11px) كحد أدنى لعناصر التنقل | موجة قصيرة |
| **P3-1** | «23 قسمًا» في التعليقات مقابل 22 فعليًا | §1.3 | تصحيح التعليق | تافه |
| **P3-2** | sheet grid-cols-4 ثابتة (ضيقة على 320px) + أزرار كشف كلمة مرور | `MobileBottomNav.tsx:139` | grid-cols-3 على <sm اختياري | اختياري |
| **P3-3** | لا اختبار landscape | §6 | إضافة viewport 667×375 للـ sweep | اختياري |

---

## 10. ما يُثبَّت (لا يُمس)

1. **`min-h-11 min-w-11` في أساس Button** (`button.tsx:11`) — درع لمس ضمني منع
   عشرات الانكسارات؛ أي إعادة كتابة للـ Button يجب أن تحافظ عليه.
2. **`text-base md:text-sm` في Input/Textarea** — النمط الصحيح؛ كل حقل جديد يجب أن يمر عبرهما (ثغرة v17-D7 كلها حقول التفّت منه).
3. **MobileBottomNav + عقد e2e/mobile-nav.spec.ts** — عقد ≤2 ضغطة مثبت باختبار حي 375px؛ إضافة قسم للـ AdminSidebar تحصل على الجوال مجانًا (نفس مصدر البيانات).
4. **رأس واحد sticky لكل صفحة + شريط سفلي fixed** — لا تكدس؛ أي رأس فرعي جديد يجب أن يبقى غير لاصق.
5. **overflow-x-auto على كل جدول + html overflow-x:hidden** — صفر تمزق.
6. **RSC landing + lazy recharts + providers diet** — فاتورة hydration جوال من الأدنى في فئتها.
7. **Master-detail في messages مع زر «كل المحادثات» للجوال** (`messages/page.tsx:282-286`) — النمط الصحيح.
8. **حوار الدفع جوال-آمن** (`dialog.tsx:53` 90dvh/100%-2rem + أزرار إغلاق 48px) — مسار المال سليم بنيويًا.

---

## 11. خطوات التنفيذ المقترحة (موجة D7 الإصلاحية)

1. **D7-F1 (حقول)**: 15 حقلًا → مكوّنات مشتركة + رفع scheduled:117 override + فحص grep بوابي: `rg '<(input|textarea)[^>]*text-(xs|sm)' src/app` يجب أن يُرجع صفرًا (يُضاف لـ slop_scan كسطح D جديد — ينسجم مع توصية v17-D11 G1).
2. **D7-F2 (admin nav)**: MobileBottomNav داخل admin/layout (sections إدارية: الموافقات/الدعم/تليجرام/الإعدادات) — ≤2 ضغطة لمدير الجوال.
3. **D7-F3 (safe-area زوجي)**: viewportFit + padding المحتوى في تغيير واحد + إضافة قياس env() في sweep.
4. **D7-F4 (لمس)**: رفع الأهداف الخام إلى ≥40px + فصل أزواج نشر/حذف + نقل FAB فوق الشريط في /demo.
5. **D7-F5 (قياس)**: توسيع viewport-sweep بـ /subscribe + مسارات dashboard عبر storageState + إضافة فحص تراكب عناصر fixed (rect-intersection) — يكشف صنف /demo تلقائيًا.

> خلاصة سطر واحد: **الهيكل الجوالي من الطراز الأول (تنقل مختبر ≤2 ضغطة، لا جداول تنكسر، لا تكدس لاصق، hydration رشيق) — لكن الإبهام الفعلي يعاني: iOS يكبّر 15 حقلًا، ومدير المنصة معلّق بلا تنقل، وزر «المزيد» في /demo مغطى بواتساب.**
