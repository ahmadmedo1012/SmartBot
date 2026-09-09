# v17-D4 — تدقيق اكتمال النظام البصري (Visual Design Completeness)

> **وكيل تشخيص READ-ONLY** — Task ID: v17-D4 · التاريخ: 2026-09-09
> النطاق: `fb_dashboard/frontend/src` (36 صفحة + 70 مكوّنًا) مقارنةً بعقدَي
> `docs/design-system.md` و`docs/z-index-scale.md`.
> جولة "الشكل كامل" التي طلبها المالك — تدقيق ثابت (static) بدون تعديل أي كود.

---

## 0. الخلاصة التنفيذية

| المحور | النتيجة | ملاحظة |
|---|---|---|
| 1. ألوان خام متسربة | **صفر تقريبًا** ✅ | استثناءان وظيفيان (mask/meta) فقط |
| 2. كلاسات تكسر الثيم | **خرق واحد جديد** ⚠️ | `to-white` في PaymentSection (الفاتح) |
| 3. نظام الظلال | **نصف معاير** 🟡 | sm/md/lg/xl موثّقة توكنز؛ xs/2xs/2xl افتراضية Tailwind؛ لا قسم ظلال في العقد |
| 4. الزوايا | **تشتت 4 قيم للبطاقات** 🟡 | 2xl/xl/md/lg لنفس السياق + 22× `rounded` عارية (4px تحت السلم) |
| 5. الطباعة | **انقسام عنوانين** 🟡 | PageHeader `text-base` مقابل 15 صفحة h1 يدوي `text-sm`؛ KPI 3xl/2xl |
| 6. الثيم الفاتح | **بنية مكتملة 100%** ✅ | توكنز كاملة + color-scheme + Toggle؛ ثغرات meta فقط |
| 7. الحدود والفواصل | **اتساق جيد مع تفاوت ألفا** 🟡 | 5 مستويات opacity لنفس حد البطاقة |
| 8. اتساق البطاقات/الجداول | **أخطر ثغرة بنيوية** 🔴 | 3 وصفات هيدر/حاوية/بطاقة متوازية عبر الصفحات |
| 9. z-index | **100% داخل السلم** ✅ | صفر قيم شاردة |
| 10. الخلفيات الزخرفية | **متسقة** ✅ | GridPattern/GlowPool/grain كلها توكنية |

### نسبة اكتمال النظام البصري: **≈ 76%**

الطبقة التأسيسية (ألوان/توكنز/z-index/ثيم فاتح) شبه مثالية (96%) — لكن طبقة
**التكوين البصري** (هيدر الصفحة، وصفة البطاقة، مقياس الزوايا، هوية العناوين)
منقسمة إلى مسارين متوازيين: مسار مؤسسي (PageHeader + Card + KpiCard) ومسار
مبسّط يدوي (15 صفحة dashboard)، إضافة إلى ازدواج نص كروم الزر 11 مرة.

---

## 1. الألوان الخام المتسربة (hex)

الفحص: `rg '#[0-9a-fA-F]{3,8}' src/app src/components` (خارج globals.css):

| الملف:السطر | القيمة | الحكم |
|---|---|---|
| `src/components/ui/card.tsx:69,71` | `#fff` ×2 | ✅ تقنية mask للحدود الدورانية (SVG mask pattern — ليست لون عرض) |
| `src/app/manifest.ts:10` | `#0B0A08` | 🟡 خلفية PWA — hex مطلوب شكلًا لكن **القيمة منحرفة**: oklch(0.145 0.005 85.9) مقابل `--background` oklch(0.045 0.006 55) — شاشة البداية أفتح 3× من خلفية التطبيق |
| `src/app/manifest.ts:11` + `src/app/layout.tsx:48,49` | `#bc4700` | 🟡 = oklch(0.551 0.164 42.6) — انحراف كروما/درجة عن `--primary` (0.55 0.19 45)، والقيمة نفسها للوضعين رغم أن الفاتح يستخدم 0.40 |

- **مكوّن Confetti غير موجود في المشروع** (حُذف مع `--confetti-*` في v9-C1) — استثناء "Confetti المُوثق" في وصف المهمة لم يعد له مقابل.
- `notifications/page.tsx:48` — إشارة `text-pink-500` في **تعليق** فقط (توثيق إصلاح تباين سابق) — ليس كودًا.

**الحكم: صفر ألوان خام في مكوّنات العرض.** الثغرات الثلاث كلها في طبقة meta/PWA.

## 2. كلاسات تكسر الثيم

### البوابة الموثقة (§8 من design-system.md) — الحالة الراهنة

| البند في جدول §8 | الوضع الآن |
|---|---|
| `switch.tsx:32` bg-white | **منتهي الصلاحية** — السويتش أُعيدت كتابته بمقبض `bg-background` (switch.tsx:46) — بند الجدول لم يُحدَّث |
| `notifications/page.tsx:318` bg-white | موجود لكن السطر انزاح إلى **366** (مقبض يدوي) |
| `demo/page.tsx:57` bg-black/40 | **منتهي الصلاحية** — لا يوجد scrim في demo/page.tsx حاليًا (درج demo أُعيد بناؤه) |
| `MobileBottomNav.tsx:56` bg-black/40 | موجود لكن السطر انزاح إلى **94** |

→ **جدول الاستثناءات §8 يحتاج تحديثًا: 2 من 4 بنود لم تعد موجودة، و2 انزاحت أسطرها.**

### فحص البوابة الفعلي (اليوم)

| النمط | العدد | الأدلة |
|---|---|---|
| `bg-white` | 1 | `dashboard/notifications/page.tsx:366` (مقبض — موثّق) |
| `bg-black/40` | 1 | `components/layout/MobileBottomNav.tsx:94` (حجاب — موثّق) |
| `text-black` | 0 | — |
| `text-gray-NNN / bg-gray / border-gray / slate / zinc / neutral / stone` | **0** | مسح شامل — نظيف تمامًا |
| لوح ألوان Tailwind خام (`red-500/green-500/pink-500…`) | **0** | صفر — كل الألوان الدلالية عبر `--success-soft` إلخ (إنجاز v8-D2) |
| `text-white` | 17 | تحليل أدناه |
| `fill-white` | 2 | `pricing/page.tsx:205` (Crown)، `landing/FeaturesSection.tsx:51` (Zap) |
| **`to-white`** | **1** | 🔴 `app/subscribe/PaymentSection.tsx:34` — `bg-gradient-to-r from-accent/80 to-white dark:from-accent/20 dark:to-card` — **خرق جديد غير مغطى بالبوابة**: بطاقة ملخص المراجعة تعرض **أبيض خام متدرجًا في الوضع الفاتح** (الداكن سليم عبر dark:to-card) |

### تحليل `text-white` (17 موضعًا)

كلها تقريبًا فوق أسطح براندية (`bg-primary` أو تدرّج accent) حيث الأبيض صحيح
تباينًا — لكن **التوكن النظامي `text-primary-foreground` (oklch 0.98 0 0) موجود
ولا يُستخدم** في هذه المواضع. البوابة الحالية لا تغطي `text-white/fill-white/to-white`
إطلاقًا — ثقب في الشبكة:
`onboarding/OnboardingWizard.tsx:375` · `dashboard/messages/page.tsx:59` (موثّق
تباين hsl أعلاه) · `subscribe/PlanSelector.tsx:76,85` · `layout/Header.tsx:203` ·
`payment/payment-status.tsx:40` · `HowItWorksSection.tsx:43` · `FeaturesSection.tsx:50` ·
`HeroMockup.tsx:52` · `LandingIslands.tsx:118` · `FloatingWhatsApp.tsx:26` ·
`pricing/page.tsx:204` · `notifications/page.tsx:203` · `connect/page.tsx:272` ·
`not-found.tsx:21` · `layout.tsx:103` (skip-link).

## 3. نظام الظلال

**هل يوجد مقياس موحد؟** يوجد **نصف مقياس** في globals.css:

| التوكن | داكن (globals.css:246-249) | فاتح (:322-325) | مستهلكون فعليون |
|---|---|---|---|
| `--shadow-sm` | rgba(0,0,0,.3/.22) | rgba(.06/.04) | 26 استخدام `shadow-sm` ✅ معاير |
| `--shadow-md` | ✅ | ✅ | 16 استخدام ✅ |
| `--shadow-lg` | ✅ | ✅ | 24 استخدام ✅ |
| `--shadow-xl` | ✅ | ✅ | 13 استخدام ✅ |
| `--glass-shadow/-lg` | ✅ (243-244) | ✅ (320-321) | عبر `.glass-card` فقط (صنف واحد) |
| `shadow-xs` | ❌ لا توكن | ❌ | 3 استخدامات → **قيم Tailwind الافتراضية في الوضعين** |
| `shadow-2xl` | ❌ لا توكن | ❌ | **14 استخدامًا** (Dialog، PaymentDialog، Header، MobileBottomNav، login/register، OnboardingWizard، FloatingWhatsApp، HeroMockup) → افتراضية Tailwind، غير معايرة للفاتح |

- **ظلال خام (arbitrary):** ظل واحد فقط — `input.tsx:51` `shadow-[0_0_0_4px_color-mix(in_oklch,var(--ring)_12%,transparent)]` (توكني المشتق ✅) + نمط inline واحد `Header.tsx:219` (color-mix فوق `--primary` ✅).
- **ظل خام حرفي واحد:** `globals.css:580` — `.card-hover:hover` يكرّر `oklch(0.55 0.19 45 / 0.15)` (لون البراند حرفيًا بدل var) — مستهلك واحد حي: `autoreply/page.tsx:169`.
- **فجوة توثيق:** `docs/design-system.md` **لا يحتوي قسم ظلال إطلاقًا** — التوكنز موجودة في الكود بلا عقد. والتوكنز غير ممرّرة عبر `@theme` (تعمل فقط لأن `:root` غير-طبقي يتغلب على `@layer theme`).

**الجدول المطلوب — الظلال الخام في الصفحات:** صفري (كل الصفحات تستخدم أسماء
السلم). الفجوة ليست التسريب بل **عدم اكتمال السلم** (xs/2xs/2xl) وعدم توثيقه.

## 4. نظام الزوايا (radius)

السلم الرسمي (globals.css:109-114): `sm 8 · md 12 · lg 16 · xl 20 · 2xl 28 · 3xl 36`.

**الإجماليات الفعلية** (خارج globals.css):

| القيمة | العدد | السياق المعلن |
|---|---|---|
| `rounded-full` | 131 | شارات/صور رمزية/أزرار دائرية/نقاط حالة — ✅ متسق |
| `rounded-lg` (16) | 90 | **حقول الإدخال** (input/textarea ✅) + صناديق أيقونات + أزرار (button.tsx base) |
| `rounded-xl` (20) | 74 | بطاقات ChartCard/payment/telegram/notifications + عناصر MobileBottomNav |
| `rounded-md` (12) | 27 | بطاقات خطط PlanSelector + تابات register + روابط admin |
| `rounded-2xl` (28) | 23 | ui Card/KpiCard/Dialog/PaymentDialog |
| `rounded-sm` (8) | 16 | Footer/not-found/PlanSelector شارات/زر الدفع lg |
| `rounded-3xl` (36) | 1 | HeroMockup فقط |
| **`rounded` عارية (4px)** | **22** | 🔴 تحت أدنى قيمة في السلم: connect×3, autoreply×3, calendar×2, posts×2, scheduled×2, EmptyState×2 + 8 مواضع متفرقة (سكرلتونات/أشرطة) |
| `rounded-[4px]` / `rounded-[20px]` | 2 | OptimizedImage.tsx:51 (تحت السلم)، HeroMockup.tsx:63 (قيمة غير مسماة) |

### اتساق السياق الواحد عبر الصفحات

| السياق | الوصفة الرسمية | الواقع عبر الصفحات | الحكم |
|---|---|---|---|
| بطاقة قسم | 2xl (globals comment: "unify on rounded-2xl=28px") | **Card=2xl · ChartCard=xl · KpiCard=2xl · بطاقات payment/telegram=xl · PlanSelector=md** | 🔴 4 قيم (12/16/20/28) لنفس السياق |
| زر | lg (button.tsx:11) | lg في كل الأزرار المؤسسية؛ لكن `not-found.tsx:21,27` يدوي **rounded-sm h-10**، `PaymentSection` lg مع override **rounded-sm**، روابط admin **rounded-md** | 🟡 3 قيم |
| حقل إدخال | lg | input/textarea/autoreply/messages كلها lg ✅ | ✅ |
| شارة/شريحة | full | full في كل الصفحات ✅ | ✅ |

**تناقض توثيقي:** `docs/design-system.md §5` يقول «rounded-xl للبطاقات» بينما
globals.css:107 يقول «Large surfaces unify on rounded-2xl» — مرجعان رسميان
يقولان شيئين مختلفين عن **نفس القرار**.

## 5. مقياس الطباعة

**الإجماليات:** `text-sm` 271 · `text-xs` 173 · `text-3xs` 62 · `text-2xs` 55 ·
`text-base` 53 · `text-lg` 26 · `text-xl` 21 · `text-2xl` 17 · `text-3xl` 10 ·
`text-4xl` 6 · `text-5xl` 4 · `text-6xl` 2 · `text-7xl` 1.

ترحيل v9-C2 (سلم المجاهري) **مكتمل بنسبة ~95%**: بقيت 6 مواضع خام فقط —
`FeaturesSection.tsx:82` و`HeroMockup.tsx:103,138` و`demo/page.tsx:314` (text-[9px])
و`HeroMockup.tsx:106` (12.5px) و`payment-methods.tsx:62` (13px) + 7 قيم عرض خام
(4.25rem/3.25rem/…) في هيرو/إحصاءات landing.

### التضاربات حسب المستوى

| المستوى | النمط المؤسسي | النمط اليدوي | الحكم |
|---|---|---|---|
| **عنوان الصفحة** | PageHeader.tsx:94 — `text-base` (compact `text-sm`) + truncate | 15 صفحة: h1 `font-bold text-sm` يدوي (analytics:46، leads:36، team:41، billing:53…) | 🔴 مستويان مختلفان لنفس الدلالة |
| **عنوان قسم/بطاقة** | CardTitle — `font-heading text-base font-medium` (card.tsx:99) | ChartCard h2 `text-sm font-semibold` (:55) + h2 `text-sm font-bold` يدوي (analytics:77,95,116، audience، billing:89) | 🔴 ثلاث وصفات خطية (base/heading vs sm/semibold vs sm/bold) |
| **قيمة KPI** | KpiCard:129 — `text-3xl font-bold` | analytics:68 + audience:61,70,79 — `text-2xl`؛ billing:81 — `text-3xl` | 🟡 نفس الدلالة بحجمين |
| **متن جدول** | dashboard:253 `text-sm` + رؤوس `text-xs` | متسقة عمومًا عبر الصفحات | ✅ |
| **meta/طوابع زمنية** | text-2xs/3xs | متسقة | ✅ |

**هوية الخط العرضي شبه معطلة:** `font-heading` (Readex Pro — "THE display face" وفق
globals.css:24) مستخدمة في **4 مواضع فقط**: `page.tsx:138` (هيرو)،
`Header.tsx:186` (شعار)، `card.tsx:99` (CardTitle)، `dialog.tsx:86`. كل عناوين
dashboard الخمسة عشر + ChartCard + KpiCard تُصيَّر بـ Cairo — التمييز المطبعي
المخطط له (§4 من العقد) لا يتحقق فعليًا.

## 6. الثيم الفاتح

| البند | الحالة | الدليل |
|---|---|---|
| `next-themes` مثبت | ✅ v0.4.6 | package.json |
| `attribute="class"` | ✅ | providers.tsx:37 |
| `defaultTheme="dark"` + `enableSystem` + `disableTransitionOnChange` | ✅ | providers.tsx:38-40 |
| `suppressHydrationWarning` | ✅ | layout.tsx:57 |
| `color-scheme: dark/light` | ✅ | globals.css:131 (:root) + :253 (.light) |
| كتلة `.light` كاملة | ✅ | globals.css:252-325 — كل التوكنز + background-radial:255 + grid-line + glass + grain:413 + scrollbar:373-376 |
| ThemeToggle متاح | ✅ | Header.tsx:232 · login:185 · register:141 |
| توكنات الرسوم (recharts) | ✅ | charts/index.tsx:21-23 — `var(--primary/--muted/--border)` |
| صفحات "تتمنظر" بالفاتح | 🔴 حالة واحدة | `PaymentSection.tsx:34` — `to-white` خام (بطاقة بيضاء صريحة في الفاتح) |
| theme-color | 🟡 | layout.tsx:48,49 — `#bc4700` **للوضعين معًا** + مربوطة بـ `prefers-color-scheme` (نظام التشغيل) لا بفئة التبديل اليدوي؛ والفاتح الرسمي `--primary` = 0.40 لا 0.55 |
| manifest | 🟡 | background_color أوضح 3× من --background (فلاش بداية PWA) |

**الحكم:** البنية الفاتحية سليمة تمامًا توكنيًا؛ الثغرات كلها في حافة الميتا
+ الخرق الوحيد to-white.

## 7. الحدود والفواصل

- `border-1` غير الصالح: **0** مواضع ✅. `border-2` (14 موضعًا) مقصود للسياقات
  المميزة (خطط الدفع/السبينرات/بطاقات outlined) ✅.
- **تفاوت ألفا حد البطاقة** — نفس السياق بـ 5 شدات:
  `border-border/40` (Card:38) · `/50` (KpiCard:167,188) · `/60` (ChartCard:47,
  PageHeader:46) · `/70` (Button ghost, روابط admin) · صلب `border-border`
  (الهيدرات اليدوية الـ15 + ألواح messages:170).
- **حد هيدر الصفحة:** PageHeader يستخدم `border-border/60` + `backdrop-blur-md`
  بينما الهيدر اليدوي `border-border` صلب + `backdrop-blur-sm` — الفرق مرئي
  عند التنقل بين صفحتين متجاورتين.
- **فواصل صفوف الجداول:** `border-b border-border` + `last:border-0` متسقة
  (dashboard:255,262 · autoreply · posts…)؛ قائمة المحادثات تستخدم `/60`
  (messages:50)؛ **`divide-*` مستخدم مرة واحدة فقط** في المشروع كله
  (`activity/page.tsx:65` `divide-y divide-border`) — أي الفواصل تُبنى يدويًا
  بأسلوبين مختلفين بدل نمط واحد.

## 8. اتساق جودة البطاقات/الجداول — مقارنة 5 صفحات

| البُعد | dashboard/page.tsx | analytics | messages | leads | team |
|---|---|---|---|---|---|
| الهيدر | **PageHeader** compact (:147-155) — أيقونة بصندوق متدرج، شريط حالة، blur-md، border/60 | يدوي (:40-50) — أيقونة عارية text-muted، blur-sm، border صلب | **PageHeader** (:158) | يدوي (:30-40) | يدوي (:35-45) |
| عنوان الصفحة | text-base (PageHeader) | **text-sm** | text-base (PageHeader) | **text-sm** | **text-sm** |
| الحاوية | **SectionContainer py-6** — `max-w-[1220px] mx-auto px-4/6` (:157) | `overflow-y-auto p-6` بلا سقف عرض (:52) | `flex-1 flex` ثلاثي الأعمدة (:168-170) | `p-6 space-y-4` (:42) | `p-6 space-y-3` (:46) |
| سقف عرض المحتوى | ✅ 1220px | ❌ لا سقف | ❌ لا سقف | ❌ لا سقف | ❌ لا سقف |
| بطاقة القسم | ui **Card** كاملة الكروم (CardHeader/CardTitle font-heading، --card-spacing 16px، rounded-2xl، border/40) (:212,244) | Card + CardContent **p-4** فقط بلا Header (:61,75,93,114) | ألواح يدوية `bg-card/50 border-e` (:170) | Card + p-4 (:59) | Card + p-4 (:62) |
| عنوان القسم | CardTitle `font-heading text-base` | h2 `text-sm font-bold` يدوي (:77,95,116) | — (ترويسة p-3/border-b) | p `text-sm font-bold` (:64) | p `text-sm font-medium` (:68) |
| KPI | **KpiCard** (قيمة 3xl، أيقونة rounded-xl ring، عدّاد متحرك، stagger) (:168-191) | بطاقة يدوية p-4، قيمة **2xl**، أيقونة size-8 rounded-lg (:61-72) | — | — | — |
| الإيقاع الرأسي | mb-6 بين المقاطع | space-y-6 | — | **space-y-4** | **space-y-3** |
| Skeleton | شبكة KpiCard + Skeleton h-48 (:45-63) | `h-32 bg-muted rounded animate-pulse` (:79) | Skeleton مخصص | Card p-4 pulse h-14 (:44) | Card p-4 pulse h-12 (:48) |
| صف الجدول/العنصر | p-3، border-b، hover:bg-muted/40 (:255-271) | قائمة space-y-2 بلا فواصل (:97-107) | p-3، border-b **/60** (:50) | بطاقة لكل عميل | بطاقة لكل عضو |

**الفروق الجوهرية:**
1. **العرض:** /dashboard وحدها (مع settings: `max-w-3xl mx-auto` :69) محدودة
   العرض؛ 20 صفحة dashboard الباقية تمتد بكامل الشاشة العريضة — نفس الجلسة
   تعرض إيقاعين معماريين.
2. **الوصفة:** مساران متوازيان — مؤسسي (Card كاملة + CardTitle) ومخفض
   (Card + CardContent p-4 + h2 يدوي). padding البطاقة نفسه متفاوت:
   `--card-spacing` 16px / p-4 (16) / p-5 (20 — KpiCard:179,188 وChartCard:47)
   / p-6 (24 — billing:69).
3. **الإيقاع الرأسي:** 3/4/6 — ثلاث قيم للفجوة بين بطاقات القوائم المتماثلة.
4. نمط ثالث في صفحة messages (master-detail ألواح bg-card/50) مبرر وظيفيًا
   لكنه يضيف سطحًا ثالثًا (card/50 مقابل card مقابل card/80).

## 9. z-index

المسح الكامل مقابل docs/z-index-scale.md:

| القيمة | العدد | الحكم |
|---|---|---|
| z-0 | 5 | ✅ base |
| z-10 | 19 | ✅ base |
| z-20 | 2 | ✅ sticky |
| z-30 | 24 | ✅ sticky/nav (PageHeader + هيدرات يدوية + DashboardShell:46) |
| z-40 | 3 | ✅ dropdown-backdrop (dialog backdrop, MobileBottomNav:94, Header) |
| z-50 | 6 | ✅ modal (dialog, sheet, wizard, login/register errors) |
| z-[60] | 2 | ✅ toast-layer (FloatingWhatsApp:25, demo) |
| z-[100] | 1 | ✅ a11y top (skip-link layout.tsx:103) |

**صفر قيم خارج السلم — 100% مطابقة.** 🎉

ملاحظتان (غير كاسرتين):
- **توكنات `--z-*` (globals.css:139-145) صفر مستهلكين** — كل الصفوف literal
  Tailwind. التوكنات "مرساة تكافؤ Smart-Menu" وفق التوثيق — مقصودة لكنها
  غير موصولة.
- **تضارب توثيقي:** سجل الطبقات في تعليق globals.css:5-16 (dropdown 30-40 ·
  overlay 90-100 · max 99999) **لا يطابق** docs/z-index-scale.md (modal 50 ·
  toast 60 · a11y 100 فقط) — مرجعان مختلفان للسلم نفسه.

## 10. الخلفيات الزخرفية

| العنصر | المواضع | الدليل | الحكم |
|---|---|---|---|
| GridPattern | جذر layout فقط (عالمي) | layout.tsx:77-82 — `[color:var(--grid-line)]` + opacity 0.14 + تجاوز .light | ✅ توكني، موحد لكل الصفحات |
| grain-overlay | جذر layout | layout.tsx:75 + globals.css:407-413 (فاتح 0.018) | ✅ |
| background-radial | body الجذر | layout.tsx:68 + توكن داكن/فاتح | ✅ |
| GlowPool | landing/pricing/FinalCTA | token color-mix فوق `--accent-foreground` | ✅ توكني |
| تدرج صفحات الدخول | login:116,170 · register:126 · connect:241 · subscribe:124 | `from-background via-accent/20 to-background` | ✅ نمط موحد |
| dashboard | لا طبقة زخرفية (بطاقات مسطحة) | — | ✅ اتساق حد أددي مقصود |

**متسقة عبر الصفحات العامة** — الأسلوب الزخرفي موحد ومصدره التوكنز.
(ملاحظة هامشية: GlowPool يستخدم `left-1/2 -translate-x-1/2` فيزيائيًا لا
منطقيًا — توهج متمركز زخرفي، أثره معدوم في RTL.)

---

## 11. أخطر 10 ثغرات (مرتبة بالأثر البصري)

| # | الثغرة | الدليل | الأثر |
|---|---|---|---|
| 1 | **انقسام نظام هيدر الصفحة:** PageHeader مؤسسي في 5 صفحات dashboard فقط، مقابل 15 صفحة هيدر يدوي (نص عنوان text-sm، بلا صندوق أيقونة/شريط حالة، blur-sm، حد صلب) | PageHeader.tsx:44-48 مقابل analytics:40-50 وleads:30-40 وteam:35-45 وbilling:50-53 (+12 أخرى) | هوية تنقل غير متجانسة — أول ما يلاحظه العين عند التنقل |
| 2 | **انقسام سقف عرض المحتوى:** /dashboard محصور 1220px (SectionContainer)، وsettings في 3xl، وكل البقية بلا سقف | dashboard/page.tsx:157 · settings:69 مقابل analytics:52 وleads:42 | عمودان معماريان في نفس اللوحة |
| 3 | **تعدد وصفة البطاقة (radius+padding+border معًا):** 2xl/16px//40 (Card) · 2xl/20px//50 (KpiCard) · xl/20px//60 (ChartCard) · xl (payment/telegram) · md (PlanSelector) + p-4 المخففة في 15 صفحة | card.tsx:38 · KpiCard.tsx:167,188 · ChartCard.tsx:47 · PlanSelector.tsx:62 | بطاقات القسم نفسها بأربع شخصيات |
| 4 | **`to-white` خام في الوضع الفاتح** — البوابة لا تغطي تدرجات gradient | PaymentSection.tsx:34 | بطاقة بيضاء صريحة تكسر الثيم الفاتح (الخرق اللوني الوحيد) |
| 5 | **تضارب قرار زاوية البطاقة بين المرجعين الرسميين** + 22× `rounded` عارية (4px) تحت السلم | design-system.md §5 ("xl للبطاقات") مقابل globals.css:107 ("unify 2xl") + 22 موضعًا | لا يمكن الإمتثال لعهدين متناقضين |
| 6 | **مقياس KPI وقسم متضارب:** قيم 3xl مقابل 2xl؛ CardTitle font-heading مقابل h2 sm يدوي؛ font-heading كله 4 مواضع | KpiCard:129 مقابل analytics:68 وaudience:61 · card.tsx:99 مقابل analytics:77 | فقدان التمييز المطبعي (Readex Pro شبه معطل) |
| 7 | **ازدواج كروم الزر 11 مرة:** نص صنوف Button (~1.4KB مع لمعان oklch خام ×2 لكل نسخة) منسوخ inline في 9 ملفات بدل Button/asChild | button.tsx:11 مصدرًا؛ نسخ: page.tsx:162,167 · login:180 · RegisterForm:136 · messages:233 · billing:60 · global-error:52 · admin/telegram/error:36 · FinalCTASection:47,52 | أي تعديل مستقبلي على الزر لن ينتشر — انزياح مؤكد |
| 8 | **سلم ظلال ناقص وغير موثق:** xs/2xs/2xl بلا توكنات (19 استخدامًا على افتراضيات Tailwind غير معايرة للفاتح) + لا قسم ظلال في العقد | globals.css:246-249 مقابل غياب القسم من design-system.md | ظلال Modal/Dialog بسلوك مختلف في الفاتح |
| 9 | **بوابة الألوان §8 متقادمة + لا تغطي text/fill/to-white:** بندان محذوفان (switch:32، demo:57) وسطران منزاحان (366، 94) | design-system.md §8 مقابل الفحص الفعلي | البوابة ستمرّر/ترفض خطأً في المراجعات القادمة |
| 10 | **حافة الميتا الفاتحة:** theme-color واحد للوضعين (#bc4700 ≠ أي توكن بدقة) + manifest background أوضح 3× من --background + ربط prefers-color-scheme لا فئة التبديل | layout.tsx:48-49 · manifest.ts:10-11 | تجربة PWA/متصفح تنفصل عن الثيم المبدّل |

**إشادات شرفية (خارج العشرة):** مقياس z-index مثالي 100% · صفر لوح ألوان
Tailwind خام (إنجاز v8-D2) · الترحيل المجاهري مكتمل 95% · الثيم الفاتح
بنية كاملة · `ease-in` خام ×4 فقط (messages:34 مثالًا — عقد الحركة §9 يسمح
بـ ease-smooth/ease-out-quart فقط).

---

## 12. الخطوات التالية المقترحة (بترتيب الجدوى)

1. **توحيد الهيدر (P1):** ترحيل الـ15 صفحة اليدوية إلى PageHeader (تعديل
   ميكانيكي: نفس الـprops title/subtitle/icon موجودة نصًا في كل صفحة).
2. **قرار واحد لسقف العرض (P1):** إما تعميم SectionContainer بـ py-6 على كل
   dashboard أو إسقاط max-w من /dashboard — ثم توثيقه.
3. **توسيع بوابة الألوان (P1):** إضافة `to-white|from-white|via-white|fill-white|text-white`
   إلى grep §8 + تحديث جدول الاستثناءات (حذف switch/demo، تصحيح الأسطر)
   + إدراج PaymentSection:34 كاستثناء موثق أو إصلاحه بـ `to-card`.
4. **إصلاح to-white (P2):** `to-white` → `to-card` مع `light:from-accent/15` —
   أو توثيقه كنقل حرفي من Smart-Menu.
5. **بند العقد للظلال (P2):** قسم في design-system.md + إكمال السلم
   (`--shadow-2xl/xs/2xs` داكن/فاتح) — أو حظر ما ليس معايرًا.
6. **حسم زاوية البطاقة (P2):** تعديل §5 ليطابق globals.css (2xl) ثم موجة
   توحيد ChartCard→2xl وإزالة rounded العارية الـ22.
7. **موجة KPI (P3):** ترحيل analytics/audience/billing إلى KpiCard (يغلق
   ثغرة #6 تلقائيًا).
8. **استبدال نسخ الزر المنسوخة (P3):** 11 موضعًا → `<Button asChild>` أو
   تصدير صنف أساس مشترك.
9. **ميتا الثيم (P3):** themeColor ديناميكي بقيمتين + manifest background
   ≈ oklch(0.045) → hex مكافئ.
10. **مزامنة سجل z (P4):** توحيد تعليق globals.css مع docs/z-index-scale.md.

---

## ملحق: أدلة أوامر الفحص (للتكرار)

```bash
cd fb_dashboard/frontend
rg -n '#[0-9a-fA-F]{3,8}\b' src/app src/components -g '!globals.css'
rg -n 'bg-white|text-black|bg-black|text-gray-|bg-gray-|border-gray-|text-slate-|bg-slate-' src/
rg -o --pcre2 'rounded-(full|3xl|2xl|xl|lg|md|sm)(?![\w-])' src/ -g '!globals.css' | sort | uniq -c
rg -o --pcre2 'shadow-(sm|md|lg|xl|2xl|xs|2xs|none)(?![\w-])' src/ -g '!globals.css' | sort | uniq -c
rg -o '\btext-(3xs|2xs|xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)\b' src/ -g '!globals.css' | sort | uniq -c
rg -o 'z-\[?\d+\]?\b' src/ | sort | uniq -c
rg -n '(to|from|via|fill)-(white|black)' src/
```

*نهاية التقرير — v17-D4 · وكيل READ-ONLY · لم يُعدَّل أي كود.*
