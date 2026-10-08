# تقرير تدقيق جولة D2 — التأثيرات الحركية والانتقالات (Motion/Effects Audit)

**Task ID:** v17-D2 · **النوع:** وكيل تشخيص READ-ONLY (لا تعديلات كود) · **التاريخ:** 2026 (جولة المالك «التأثيرات»)
**النطاق:** `SmartBot/fb_dashboard/frontend/src` — Next.js 16 + Tailwind 4، عربي RTL.

## المنهجية
1. قراءة كاملة `src/app/globals.css` (587 سطرًا — قسم الحركة 396-587) + `components/shared/enter-motion.css` (91) + CSS مضمّن في `OnboardingWizard.tsx`.
2. قراءة المكونات الحركية: `motion-icons.tsx`, `kinetic-text.tsx`, `scroll-reveal.tsx`, `scroll-parallax.tsx`, `GlowPool.tsx` + مكونات التفاعل: `button.tsx`, `card.tsx`, `dialog.tsx`, `switch.tsx`, `input.tsx`, `textarea.tsx`, `badge.tsx`, `skeleton.tsx`, `app-toaster.tsx`, `premium-toast.tsx`, `MobileBottomNav.tsx`, `AdminSidebar.tsx`, `Header.tsx`, `KpiCard.tsx`, `MiniSparkline.tsx`, `charts/index.tsx`.
3. مسح منهجي بـ grep عبر `src/`: `duration-\d+` (7 قيم)، `transition-*` (18 صيغة)، `animate-*`، `hover:/active:/focus-visible:`، `translate-x`، `scrollIntoView`، إحصاء كلاسات الدخول لكل صفحة dashboard/admin، ومراجعة يدوية لكل عنصر `<button` خام (35 موضعًا خارج components/ui).

---

## 1) ملخص تنفيذي

| المؤشر | القيمة |
|---|---|
| عناصر تفاعلية بلا hover/active/focus بصري | **5 مواضع** (منها 1 hover معطّل بنفس القيمة) |
| فجوات «انتقال مفاجئ» (state change بلا حركة) | **12 موضعًا**، أبرزها: 17 صفحة dashboard بلا أي حركة دخول |
| قيم duration متفرقة | **7 قيم Tailwind + ~17 قيمة ثانية خام** — **صفر** `--duration-*` tokens |
| منحنيات easing مختلفة | **8 منحنيات**، منها **2 فقط** موكنة (`--ease-smooth`, `--ease-out-quart`) |
| حركات غير محمية reduced-motion | **1 حركة JS** + **2 تركيبة delay** تقنية (الباقي محمي بشبكة أمان عامة) |
| حركات translate-x ثابتة الاتجاه في RTL | **3 مواضع** (واحد وظيفي صحيح صدفةً، اثنان زخرفيان) |

**الخلاصة:** النظام الحركي **مؤسَّس بشكل ممتاز** (نظام CSS خالٍ من framer-motion بالكامل، شبكة reduced-motion عالمية، أدوات stagger جاهزة، مكونات أساسية مغطاة hover/active/focus) — لكن **التغطية غير موزّعة بالتساوي**: الصفحات العامة (landing/pricing/subscribe) وصفحة `/dashboard` الرئيسية و`/admin` تتمتع بـ choreography كاملة، بينما **17 من 23 صفحة dashboard فرعية تدخل بلا أي حركة**، وعدة حالات تفاعلية (تبديل تبويب الرأس، فتح تذاكر الدعم، تبديل حالة العروض) تقفز فورًا.

---

## 2) نقاط القوة (تُثبَّت ولا تُمسّ)

- **نظام حركة CSS صافٍ 100%**: لا يوجد أي `import ... from "framer-motion"` حي في المشروع (تحقق rg — كل المطابقات تعليقات توثيقية للـ"CSS twins"). `enter-motion.css` يعيد إنتاج حركات framer السابقة 1:1 بقيم موثقة.
- **شبكة أمان reduced-motion عالمية**: `globals.css:549-551` — `animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important` على `*, *::before, *::after` — تحمي حتى الحركات المضبوطة inline (تفوق `!important` الأنماط السطرية).
- **حراس مخصصون** لكل عائلة: `animate-fade-in-150/250/400/900/1100 + wipe-up` (450-453)، `price-swap` (463-465)، `reveal/reveal-scale` (482-484)، `kinetic-unit` (495-497)، `sheet-*` (503-505)، `tt-icon` (510-512)، `motion-icon` (516-519)، `ai-icon` (544-547)، `sb-*` (enter-motion.css:82-90)، `ob-*` (OnboardingWizard.tsx:50-52).
- **حراس JS**: `KpiCard.tsx:50-57` (count-up يقفز للقيمة النهائية)، `StatsSection.tsx:41-44`، `charts/index.tsx:27-37+58` (`isAnimationActive={!reduced}`)، `ScrollReveal.tsx:68-72`، `KineticText.tsx:58-62`، `ScrollParallax.tsx:66+85-88` (+ تعطيل على اللمس).
- **المكونات الأساسية مكتملة الحالات**: `Button` (hover/active:scale-0.97/focus-visible ring/loading spinner — button.tsx:11)، `Card interactive` (hover bg + active:scale-[0.99] + focus — card.tsx:47)، `Switch` (**انزلاق مقبض RTL-aware**: switch.tsx:50 يجمع `translate-x-[calc(100%-2px)]` مع `rtl:-translate-x-[...]`)، `Input/Textarea` (transition + focus glow)، `MobileBottomNav` (sheet transitions + active:scale-90 + focus rings)، `AdminSidebar` (hover lift + icon micro-interaction — 162-219).
- **choreography نموذجية**: `HeroMockup.tsx` (تتابع 900/1100/1200+i·150/2000/2200+i·100 + مؤشر كتابة bounce متدرج 0/150/300ms — أسطر 30-135)، `KineticText` (lead unit يرسم فورًا — LCP)، `price-swap` (pricing/page.tsx:237-251 key-remount)، `FaqSection.tsx:32` (أكورديون grid-rows-[0fr→1fr] transition-all 300ms — أفضل ممارسة)، `messages/page.tsx:202-204` (isFetching → opacity-60 مع keepPreviousData)، `OptimizedImage.tsx:57-76` (shimmer → fade)، `payment-status.tsx` (ping + scale-in + fade-in-150 + delay-300 متدرج).
- **توكنز easing موجودة وتعمل**: `--ease-smooth` و`--ease-out-quart` معرّفة في `@theme inline` (globals.css:78-79) فتنبع كلاسات `ease-smooth` (14 استعمالًا).

---

## 3) الفحص التفصيلي حسب محاور المهمة

### 3.1 عناصر تفاعلية بلا hover/active/focus بصري

مسح كل `<button`/`<a`/onClick خارج components/ui (35 زرًا خامًا + مكونات) — **معظم الأزرار الخام مغطاة** (premium-toast:78، SetupWarnings:131/152، payment-methods:50-61، payment-instructions:88، telegram:67-75، MobileBottomNav:125-204، Header:23/110، connect:181-184، support radio:295-306، marketing radio:188-198). الثغرات:

| # | الموضع | المقتطف | المشكلة |
|---|---|---|---|
| 1 | `app/not-found.tsx:21` | `className="... bg-primary hover:bg-primary ... transition-colors"` | **hover معطّل**: نفس قيمة bg في الحالتين — الزر الرئيسي في صفحة 404 لا يتغير إطلاقًا عند المرور (الشريك الثاني بالسطر 27 سليم: `hover:bg-muted`). |
| 2 | `app/dashboard/audience/page.tsx:96` | `<button className="underline outline-none focus-visible:ring-2 ..." onClick={topQuery.refetch}>إعادة المحاولة</button>` | زر نصي underline بلا `hover:` وبلا `transition` — لا تغيير لون ولا underline-offset عند المرور (القاعدة العامة للروابط `a{transition:color}` globals.css:357 لا تشمل `<button>`). |
| 3 | `app/dashboard/tools/page.tsx:170-173` | `<Button ... aria-pressed={!!o.is_active}>{o.is_active ? <ToggleRight/> : <ToggleLeft/>}</Button>` | تبديل حالة العرض = **استبدال أيقونتين فورًا** — لا انزلاق ولا نبضة، والمكوّن `Switch` المتوفر (RTL-aware) غير مستخدم. نفس النمط في مفاتيح auto dark/data… إن وجدت مستقبلاً. |
| 4 | `app/dashboard/marketing/page.tsx:181` | raw `<textarea className="... focus-visible:ring-2 ..." >` | textarea خام **بلا transition** على الحالة focus (الحلقة/الحد يقفزان) بينما `Textarea` المشترك لديه `transition-[...] duration-200` — تجربة غير متسقة مع كل الحقول الأخرى. نفس النمط: `support/page.tsx:332`. |
| 5 | `components/layout/MobileBottomNav.tsx:191` | `{active && <span className="h-0.5 w-6 rounded-full bg-primary mt-0.5" />}` | مؤشر التبويب النشط يظهر/يختفي **فورًا** عند التنقل (بلا scale/opacity transition) — الحالة الفاعلة للشريط السفلي أهم عنصر حركي فيه. |

### 3.2 اتساق المدة والتخفيف (duration/easing)

**التوكنز:** `--ease-smooth` و`--ease-out-quart` موجودان ومستعملان — لكن **حصرًا داخل ملفات CSS** (globals.css 23 موضعًا، enter-motion.css عبر نسخ القيمة خامًا). لا وجود لأي `--duration-*` في المشروع إطلاقًا (تحقق: rg `--duration` = صفر نتائج).

**جدول القيم المتفرقة (المصدر: مسح كامل لـ src/):**

| القيمة | مواضع ممثّلة | التصنيف |
|---|---|---|
| `duration-300` ×37 | button.tsx:11, RegisterForm:136/166/182/198/221, login:214/225, KpiCard:167, Header:27-29/123, AdminSidebar:212, FaqSection:26, StepIndicator:59, PlanSelector:62/72… | متسق نسبيًا (أغلبية) |
| `duration-200` ×28 | messages:44/59, admin:267, autoreply:102-136, Input:51, Textarea:23, badge:11, Header:110/186/202… | متسق (تفاعلات سريعة) |
| `duration-500` ×20 | LandingIslands:103, Header:173, StepIndicator:92, ComparisonBars:119 (charts:119), OptimizedImage:75… | متفرق |
| `duration-700` ×12 | لمعة الزر `before:duration-700` (button.tsx:11 ونسخه اليدوية global-error:52, RegisterForm:136, messages:233) | زخرفة |
| `duration-250` ×2 | dialog.tsx:27+54 | **قيمة خام وحيدة** (250ms لا تنتمي لأي سلم) |
| `duration-150` ×2 | messages:44/191 | سريع |
| `duration-400` ×1 | OnboardingWizard:358 | **قيمة مفردة** |
| قيم ثانية خام في CSS | globals.css: 0.2/0.25/0.3/0.32/0.35/0.5/0.55/0.6/0.7/0.9/1.4/1.5/1.8/2/3/3.5s · enter-motion.css: 0.28/0.4/0.5/0.8s · inline: 0.35s (premium-toast:66, app-toaster:32) · JS: 800ms (KpiCard:61), 30×30ms (StatsSection:45-48), 600ms (charts:91) | **~17 قيمة غير موكنة** |

**منحنيات easing (8 منحنيات، 2 موكنة فقط):**

| المنحنى | الموضع | ملاحظة |
|---|---|---|
| `var(--ease-out-quart)` = cubic-bezier(0.165, 0.84, 0.44, 1) | globals.css ×17 | ✅ موكن |
| `var(--ease-smooth)` = cubic-bezier(0.16, 1, 0.2, 1) | globals.css ×6 + كلاس `ease-smooth` ×14 | ✅ موكن |
| `ease-out` (كلاس Tailwind) | ×18 موضعًا (KpiCard, ThemeToggle, button, pricing, billing…) | ⚠️ خارج نظام التوكنز |
| `cubic-bezier(0.34, 1.56, 0.64, 1)` | globals.css:514 (`.motion-icon`) — منحنى spring/overshoot | ❌ غير موكن (منحنى «الارتداد» الوحيد في المشروع، يستحق توكن `--ease-spring`) |
| `cubic-bezier(0.22, 1.1, 0.36, 1)` | enter-motion.css:55 (`.sb-page-enter`) | ❌ نسخة خام قريبة من ease-smooth بقفزة |
| `cubic-bezier(0.25, 0.1, 0.35, 1)` | OnboardingWizard.tsx:48-49 | ❌ خام |
| `cubic-bezier(0.165, 0.84, 0.44, 1)` مكرر حرفيًا | enter-motion.css:66 (`.sb-fade-up`) — **نفس قيمة `--ease-out-quart` منسوخة يدويًا** | ❌ تكرار توكن بقيمة خام |
| `ease` / `ease-in-out` (كلمات مفتاحية) | globals.css:334 (body theme)، 357 (a)، 399/404 (skeleton/shimmer)، 499 (sheet-backdrop)، 507 (tt-icon)، 576 (.card-hover border-color **بلا أي easing**) | ⚠️ التخلف الافتراضي |

**انقسامات تنفيذية واضحة:**
- **عدّاد count-up بتنفيذين مختلفين**: `KpiCard.tsx:45-80` (rAF + easeOutCubic 800ms، يتحدث من القيمة الحالية) مقابل `StatsSection.tsx:32-54` (setInterval خطوة ثابتة 30×30ms). نفس المفهوم، منطقان، مدتان، منحنيان.
- `dialog` الوحيد بـ 250ms بينما بقية الـsurfaces بـ 200/300 — لا ضرر لكنه خارج السلم.
- `sb-fade-up` يعيد قيمة ease-out-quart حرفيًا بدل `var(--ease-out-quart)` (انتكاسة توكن داخل enter-motion.css نفسه — الملف موثّق بأنه «نسخ 1:1» من framer فبقي بالقيمة الخام).

### 3.3 فجوات الانتقال المفاجئة (abrupt state changes)

| # | الموضع | الحالة | الدليل |
|---|---|---|---|
| **1** | `components/layout/Header.tsx:207-222` | **حبة tubelight للتبويب النشط تقفز بين الروابط** | `{linkActive && <span className="absolute inset-0 -z-10 rounded-full bg-primary shadow-lg" ...>}` — تُركّب/تُفكك فورًا عند التنقل. التعليق (208-214) يوثّق أنها كانت `motion.div layoutId="tubelight"` تنزلق، واستُبدلت بحبة ثابتة عند إخراج framer — **أفقد التصميم حركته المميزة في أبرز عنصر تنقّل بالصفحة العامة**. |
| **2** | `app/dashboard/support/page.tsx:442-443` | **خيط التذكرة يظهر/يختفي فورًا** | `{openTicketId === t.id && (<div id={`ticket-thread-...`}>` — الفتح/الغلق pop بلا حركة، بينما chevron السطر 437 يدور بـ `transition-transform` (تباين حاد داخل نفس العنصر: المؤشر يتحرك والمحتوى يقفز). |
| **3** | **17 صفحة dashboard بلا حركة دخول** (إحصاء entrance-census) | المحتوى يظهر دفعة واحدة بعد skeleton | صفحات: `leads, posts, comments, activity, scheduled, team, billing, audience, reports, ads, broadcast, calendar, analytics, tools, pages, support, [...slug]` — **صفر** كلاسات `sb-fade-up/sb-kpi-enter/animate-fade-in` وصفر `PageHeader` (المكوّن الوحيد الذي يجلب animate-fade-in — مستخدم في 6 صفحات فقط: dashboard الرئيسية، messages، notifications، settings، marketing، autoreply). المقابل: `dashboard/page.tsx` (5 كلاسات + stagger KPI) و`admin/page.tsx:129/230/267` و`admin/settings:315/333` — **عدم اتساق صارخ بين صفحات نفس القسم**. |
| 4 | `app/dashboard/DashboardShell.tsx:57` | sb-page-enter تعمل **مرة واحدة فقط** عند أول mount للـshell | الكلاس على `div#page-content` داخل layout ثابت (`dashboard/layout.tsx` يغلف children بـ DashboardShell) — عند التنقل بين صفحات dashboard يتغيّر children فقط فلا تُعاد الحركة: **لا انتقال دخول لأي صفحة فرعية عند التنقّل** (App Router بلا page transitions). |
| 5 | `app/dashboard/messages/page.tsx:304+` | الرسائل الجديدة (refetchInterval 10s + بعد الرد) تُضاف فورًا بلا حركة دخول | خلافًا لـ hero mockup الذي يتحرك، فقاعات الدردشة الحقيقية pop. |
| 6 | أدوات/ردود تلقائية: `tools/page.tsx:131/173`, `autoreply/page.tsx:202` | **الحذف بلا خروج متحرك** | delete mutate → invalidate → العنصر يختفي لحظيًا من القائمة (لا collapse/fade-out). |
| 7 | `app/login/page.tsx:237`, `RegisterForm.tsx:233`, `TelegramConfigSection.tsx:74` | **Eye↔EyeOff يستبدل فورًا** | نفس نمط تبديل الأيقونة لدى ThemeToggle له crossfade مدروس (`tt-icon` globals.css:507-512) — الثلاثة الأخرى بلا أي انتقال للأيقونة (الأزرار نفسها لديها hover جيد). |
| 8 | `app/dashboard/notifications/page.tsx:283` | نقطة غير المقروء `<span className="size-2 rounded-full bg-primary">` تختفي فورًا عند القراءة | تغيّر حالة البطاقة نفسها محمي (Card transition-all) لكن النقطة pop-out. |
| 9 | كل `loading.tsx` العشرة | قفزة spinner→محتوى | DefaultLoading (spinner مركزي) بدل skeleton لهيكل الصفحة — layout jump عند اكتمال التحميل (داخل الصفحات نفسها skeletons ممتازة، الفجوة في الانتقال الوسيط للمسار). |
| 10 | `app/admin/telegram/loading.tsx:7` | لوادر مختلفة عن باقي النظام | `Loader2 size-6` inline بدل DefaultLoading (حجم/نمط/وضع مختلف عن المسارات العشرة الأخرى). |
| 11 | `app/demo/page.tsx:171-181` | DemoActivityBars ثابتة تمامًا | أعمدة `div` بارتفاع inline بلا transition/animation — بينما التوأم الحقيقي `ActivityBarChart` (charts/index.tsx:91) يتوهج بـ 600ms و`ComparisonBars:119` تنمو بـ duration-500: **العرض الترويجي أقل حيوية من المنتج الحقيقي**. |
| 12 | `messages/page.tsx:44-47` تحديد المحادثة | التحديد موجود (gradient + border-s) لكن انتقال الخلفية فقط | حالة selected تتبدل عبر `transition-colors` — مقبول؛ الفجوة الفعلية في غياب دخول لوحة الرسائل عند أول اختيار (التبديل بين placeholders/skeleton/instant content). |

**ملاحظة إيجابية:** القوائم المنسدلة/dialogs/toasts مغطاة — `dialog.tsx:27+54` (base-ui `data-starting-style/ending-style` + duration-250 **دخول وخروج**)، `MobileBottomNav` sheet (globals.css:499-505 دخول وخروج)، `premium-toast:65` (animate-slide-up)، tabs الـdemo (`demo/page.tsx:547-548` keyed remount + animate-fade-in)، تبديل الأسعار (price-swap) — هذه أفضل نقاط النظام.

### 3.4 Stagger / Choreography

- **`animate-fade-in-150/250/400` مستخدمة فعليًا في 6 ملفات فقط** (16 موضعًا): `app/page.tsx:143/148/160/175`، `app/pricing/page.tsx:80/105`، `components/landing/HeroMockup.tsx` ×6 (مع 900/1100 + delays مخصصة 1200+i·150 / 2000 / 2200+i·100)، `LandingIslands.tsx:103`، `payment-status.tsx:95/135`، `demo/page.tsx:553`. **الصفحات العامة فقط — صفر استخدام في dashboard** (نظيرها هناك `sb-fade-up/sb-kpi-enter` لكن في 4 ملفات: dashboard/page، admin/page، admin/settings، admin/support).
- `KineticText` في ملفين فقط (app/page.tsx, pricing/page.tsx) — `ScrollReveal` في 7 ملفات (كلها landing/pricing).
- `KpiCard` stagger (`index×0.06s` — KpiCard.tsx:170/190) يعمل في `dashboard/page.tsx` **فقط** (المستهلك الوحيد للـKpiCard حسب rg).
- صفوف الجداول: `admin/page.tsx:267` و`admin/support:215` تتحرك بـ sb-fade-up؛ جداول dashboard (demo:273, dashboard:262) لديها hover فقط بلا دخول.
- **الخلاصة:** الأدوات موجودة وكاملة لكن استعمالها محصور في القسم العام — «التتابع» ينقطع عند بوابة /dashboard.

### 3.5 Reduced-Motion — التدقيق الكامل

| الفحص | النتيجة |
|---|---|
| كل `.animate-*` في globals.css | ✅ محمية — إما بكتلة `animation: none` مخصصة (450-453, 463-465) أو بالشبكة العامة (549-551) التي تجعل المدة 0.01ms (fill-mode `both` يُنهي فورًا إلى الحالة النهائية) وتوقف اللانهائية (`iteration-count:1`). |
| كل `sb-*` / `ob-*` / `reveal` / `kinetic` / `sheet` / `tt-icon` / `motion-icon` / `ai-icon` | ✅ كتل مخصصة (enter-motion.css:82-90, OnboardingWizard:50-52, globals.css 482-519+544-547). |
| transition المتبقية (Tailwind classes + inline) | ✅ الشبكة العامة 550 (`transition-duration: 0.01ms !important`) تغطي الكل بما فيها inline styles. |
| حركات JS | ✅ 6 حراس matchMedia (KpiCard, StatsSection, charts, ScrollReveal, KineticText, ScrollParallax). ❌ **واحدة غير محمية**: `messages/page.tsx:147` — `scrollIntoView({ behavior: "smooth" })` يستدعي smooth scroll برمجيًا؛ وسيط CSS `scroll-behavior:auto !important` (globals.css:550) **لا يقيّد** سلوك behavior الصريح في scrollIntoView وفق مواصفة CSSOM View → مستخدم reduce يزحف زحفًا ناعمًا 50ms-debounced عند كل فتح محادثة. |
| ثقب تقني دقيق | ⚠️ `PageHeader.tsx:55/94` (`animate-scale-in delay-100`) و`payment-status.tsx:99/139` (`animate-fade-in delay-300`): غير مدرجة في كتل `animation:none` المخصصة، وتحت reduce تعتمد على الشبكة العامة التي **تُصفّر المدة فقط وتُبقي animation-delay** → مع fill `both` يبقى العنصر مخفيًا 100-300ms ثم يقفز (قيمة `delay-100/300` globals.css:432/467 تبقى فعّالة). أثر قصير لكنه واقعي. |
| sonner exit animation | ✅ ملك المكتبة (unmount tween) — الحد العام يشملها. |

### 3.6 Micro-interactions مفقودة

| النمط | الحالة | الدليل |
|---|---|---|
| نسخ (copy) | ✅ toast إشعار (`brandedToast.success("تم نسخ…")` connect:185, premium-toast:189) + أيقونة wiggle عند hover (`copy-wiggle` globals.css:526). تحسين اختياري: تبديل الأيقونة → ✓ لحظيًا على الزر نفسه. |
| تفعيل/تبديل | ❌ tools ToggleRight/Left swap فوري (3.1#3)؛ ✅ المقابل الصحيح: switch.tsx + notifications:361-368 (انزلاق سلس `transition-all`). |
| نجمة/إعجاب bounce | — لا يوجد مكون إعجاب في التطبيق (غير قابل للتدقيق). |
| حذف | ❌ بلا خروج متحرك (3.3#6) — كل قوائم dashboard. |
| عدادات | ✅ موجودة لكن **ب实现ين منفصلين** (3.2) — KpiCard animated + StatsSection. صفحة demo تعرض أرقامًا ثابتة (مقبول لعرض وهمي). |
| أيقونة password | ❌ swap فوري ×3 (3.3#7) مقابل نمط tt-icon المتاح. |
| زر التحميل | ✅ `Button loading` spinner (button.tsx:47) مستخدم في إنشاء/حفظ/إرسال. |

### 3.7 الصفحات الوسطى وأول paint

- `dashboard/loading.tsx` (+ كل loading.tsx العشرة) = `DefaultLoading` (دوار + نص pulse + sr-only) — **يعمل ومحمي**، لكنه spinner مجرد: هيكل الصفحة لا يُهيَّأ (skeleton للشريط/الرأس) → قفزة layout عند الاستبدال، وانتقال spinner→محتوى غير موجود.
- **انتقالات بين الصفحات: غير موجودة** — لا route transitions (App Router، بلا view transitions API) وsb-page-enter مرة واحدة (3.3#4). الوسيط الوحيد هو loading.tsx.
- **أول paint ممتاز:** KineticText يرسل الوحدات في SSR مع lead-unit بلا بوابة (kinetic-text.tsx:87-89 + globals.css:494)، staggers الـhero CSS خالصة بلا JS (توثيق globals.css:434-440)، `disableTransitionOnChange` في providers.tsx:40 يمنع وميض السمة (لكن يُبطل عمليًا transition السمة المعلن في globals.css:334 — تناقض توثيقي بلا أثر مستخدم).

### 3.8 الحواف الحركية في RTL (translate-x ثابت الاتجاه)

| الموضع | المقتطف | التقييم |
|---|---|---|
| `components/ui/switch.tsx:50` | `group-data-[size=default]/switch:translate-x-[calc(100%-2px)] ... group-data-[size=default]/switch:rtl:-translate-x-[calc(100%-2px)]` | ✅ **النمط الصحيح** — منطقي RTL (انزلاق المقبض يعكس مع dir). |
| `components/layout/AdminSidebar.tsx:166` | `"hover:-translate-x-[3px] active:scale-[0.97]"` | ⚠️ اتجاه فيزيائي ثابت داخل RTL. **صحيح بصريًا صدفةً** (الشريط مثبت يمينًا globals.css.. DashboardShell:46 — فالنزوح -x = نحو المحتوى) لكنه غير معبر منطقيًا: لو انتقل الشريط لليسار يومًا انقلبت الإشارة. |
| `components/ui/button.tsx:11` (+ نسخ يدوية: global-error.tsx:52, RegisterForm.tsx:136, messages/page.tsx:233) | `before:-translate-x-full ... hover:before:translate-x-full` | ⚠️ لمعة الزر تجتاح **يسار→يمين دائمًا** في واجهة RTL — زخرفية ومقبولة جماليًا (parity مع Smart-Menu) لكنها حركة اتجاهية غير منطقية RTL. |
| `globals.css:397-404` (shimmer/skeleton) | `background-position: -200% 0 → 200% 0` | ⚠️ مسح LTR ثابت — زخرفي. |
| المراجع الصحيحة | `MobileBottomNav:166` (`rtl:-scale-x-100`)، `DirectionalIcon` (آلية `rtl:-scale-x-100` الموحدة)، `messages:46` (`border-s-[3px]` منطقية) | ✅ يثبت أن للمشروع لغة RTL ناضجة — الفجوات أعلاه خارجها فقط. |

---

## 4) الجدول النهائي الموحد (الموضع | الفجوة | التصنيف | الأولوية)

| الموضع | الفجوة | التصنيف | الأولوية |
|---|---|---|---|
| `Header.tsx:207-222` | حبة التبويب النشط (tubelight) تركّب فورًا عند التنقل — بديل framer layoutId بلا انزلاق | غير-متسق / بلا-تأثير | **P1** |
| `dashboard/support/page.tsx:442-443` | خيط التذكرة يظهر/يختفي بلا حركة (chevron يدور والمحتوى يقفز) | بلا-تأثير | **P1** |
| 17 صفحة dashboard (leads/posts/comments/activity/scheduled/team/billing/audience/reports/ads/broadcast/calendar/analytics/tools/pages/support/[...slug]) | صفر حركة دخول — المحتوى يظهر دفعة بعد skeleton بينما 6 صفحات شقيقة تتحرك | غير-متسق | **P1** |
| `messages/page.tsx:147` | `scrollIntoView({behavior:"smooth"})` غير محمي reduced-motion (JS API لا يشمله الحد العام) | غير-محمي-reduced-motion | **P1** |
| `tools/page.tsx:170-173` | تبديل حالة العرض بأيقونتين فوريتين — Switch RTL-aware متوفر وغير مستخدم | بلا-تأثير | **P2** |
| `login:237` + `RegisterForm:233` + `TelegramConfigSection:74` | Eye↔EyeOff swap فوري بلا crossfade (نمط tt-icon موجود) | غير-متسق | **P2** |
| `not-found.tsx:21` | `bg-primary hover:bg-primary` — hover بلا أثر بصري | بلا-تأثير | **P2** |
| أدوات/ردود تلقائية (tools:131/173, autoreply:202) | حذف بلا حركة خروج | بلا-تأثير | **P2** |
| المشروع كله | لا `--duration-*` توكنز: 7 قيم Tailwind + ~17 قيمة خام + duration-250/400 معزولتان | غير-متسق | **P2** |
| globals.css:514 + enter-motion.css:55 + OnboardingWizard:48 | 3 منحنيات bezier خام غير موكنة (+ enter-motion.css:66 يكرر قيمة ease-out-quart حرفيًا) | غير-متسق | **P2** |
| `KpiCard.tsx:45-80` مقابل `StatsSection.tsx:32-54` | تنفيذان مختلفان لنفس الـcount-up (منطق/مدة/منحنى) | غير-متسق | **P2** |
| كل loading.tsx العشرة + `DashboardShell.tsx:57` | spinner وسطي بلا هيكل skeleton + لا انتقال دخول عند التنقل بين الصفحات | غير-متسق | **P2** |
| `MobileBottomNav.tsx:191` | مؤشر التبويب النشط يظهر/يختفي فورًا | بلا-تأثير | **P3** |
| `audience/page.tsx:96` | زر «إعادة المحاولة» بلا hover ولا transition | بلا-تأثير | **P3** |
| `marketing:181` + `support:332` | textarea خام بلا transition للتركيز (خلاف Textarea المشترك) | غير-متسق | **P3** |
| `messages/page.tsx:304+` | الرسائل الجديدة تُضاف بلا دخول | بلا-تأثير | **P3** |
| `notifications/page.tsx:283` | نقطة unread تختفي فورًا عند القراءة | بلا-تأثير | **P3** |
| `demo/page.tsx:171-181` | DemoActivityBars ثابتة مقابل توأمها المتحرك (600ms/500ms) | غير-متسق | **P3** |
| `PageHeader.tsx:55/94` + `payment-status.tsx:99/139` | delay-100/delay-300 غير مدرجة في كتل animation:none → 100-300ms خفاء تحت reduce | غير-محمي-reduced-motion | **P3** |
| `admin/telegram/loading.tsx:7` | لوادر مختلفة عن DefaultLoading الموحد | غير-متسق | **P3** |
| `button.tsx:11` (+ 3 نسخ يدوية) | لمعة translate-x-full اجتياح LTR ثابت في RTL | غير-محمي-RTL (زخرفي) | **P3** |
| `AdminSidebar.tsx:166` | `hover:-translate-x-[3px]` اتجاه فيزيائي ثابت (صحيح صدفةً) | غير-محمي-RTL | **P3** |
| `globals.css:576` | `.card-hover` border-color بلا easing token | غير-متسق | **P3** |
| `app-toaster.tsx:32` | inline animation بقيمة bezier خام (نفس قيمة ease-smooth منسوخة) | غير-متسق | **P3** |

---

## 5) التوصيات المرتبة (لجولة الإصلاح)

1. **P1 — إعادة حركة tubelight للرأس**: كلاس pill منزلق واحد (`transition-[left,right]` مع تحديد بـ `inset-inline-start` منطقي) أو grid-template-columns مع motion — يعيد أبرز حركة مفقودة بلا أي مكتبة.
2. **P1 — دخول خيط التذكرة**: نفس تقنية FaqSection (grid-rows-[0fr→1fr] + transition-all) — نمط مثبت محليًا، نسخ ولصق.
3. **P1 — توحيد دخول صفحات dashboard**: نقل sb-fade-up (أو animate-fade-in-150/250) إلى SectionContainer/PageHeader الافتراضي أو إلى غلاف children في DashboardShell keyed بالـpathname — خط واحد يغطي 17 صفحة.
4. **P1 — حماية smooth scroll البرمجي**: `const behavior = mq.matches ? "auto" : "smooth"` في messages:147 (نمط usePrefersReducedMotion موجود بالفعل في 6 مواضع — سابع).
5. **P2 — استبدال ToggleRight/Left بـ Switch** في tools (المكون موجود + RTL-aware).
6. **P2 — توكنز**: إضافة `--duration-fast:200ms/--duration-base:300ms/--duration-slow:500ms` + `--ease-spring: cubic-bezier(0.34,1.56,0.64,1)` إلى @theme، وتوحيد dialog:250→200/300، وربط enter-motion.css بـ var(--ease-out-quart) بدل النسخة الحرفية.
7. **P2 — توحيد count-up** في hook واحد (useCountUp) يخدم KpiCard وStatsSection.
8. **P2 — crossfade لأيقونات password** بنمط tt-icon (كلاس عام `icon-swap`).
9. **P2 — هيكل skeleton للوسائط**: DefaultLoading يستقبل شكلًا (sidebar+header) أو يقتصر على مقاطع المحتوى.
10. **P3**: إصلاح hover:not-found، مؤشر bottom-nav بscale transition، دخول الرسائل الجديدة، خروج عناصر الحذف (animate-out قبل invalidate)، إدراج delay-100/300 في كتلة reduce، نسخ Button عبر cva بدل اللصق اليدوي (يمنع انحراف اللمعة).

## 6) خلاصة المالك
الجولة تكشف مشروعًا **متقدمًا جدًا في هندسة الحركة** (framer-free + شبكة reduced-motion + RTL-aware في المكونات الأساسية) لكن **التطبيق الانتقائي هو الثغرة**: الحركات محتشدة في الصفحات العامة وصفحة dashboard الرئيسية، بينما 17 صفحة داخلية تعمل «كإصدار ثابت»، وثلاث حالات تفاعلية عالية الظهور (تبويب الرأس، فتح التذاكر، مفاتيح العروض) تقفز. كل الإصلاحات المقترحة CSS-فقط أو بأنماط مثبتة محليًا — لا مكتبات جديدة مطلوبة.
