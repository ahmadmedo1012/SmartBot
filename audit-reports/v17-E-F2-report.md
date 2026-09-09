# v17-E-F2 — القشرة والجوال والصفحات العامة (SHELL-MOBILE-PUBLIC) — تسليم

**Task ID:** v17-E-F2 · **الوكيل:** E-F2 · **النطاق:** `fb_dashboard/frontend` (7 ملفات ملكية حصرية) · **التاريخ:** 2026-09-10
**المصادر:** خطة v17 §E-F2 (بنود 1-7) · D7-mobile (P0-2, P0-3, P1-1, §2.2#5) · D8-live-probe (G1, G3) · D2-motion (جدول P1 «17 صفحة» + بند 3.3#4)
**الوضع:** منفَّذ كاملًا — 7/7 بنود · جراحي (صفر إعادة كتابة) · لا وكلاء فرعيين.

---

## 1) البنود المنفَّذة (كود + دليل file:line)

### T1 — /subscribe للمجهولين (P0 — D8-G1) ✅
- **العيب الحي:** فتح `/subscribe` مجهولًا → `apiFetch("/api/me")` → 401 → معالج 401 العالمي (`csrf-client.ts:134-141` → `handleSessionExpired`) يطرد الزائر إلى `/login?redirect=%2Fsubscribe` بعد توست 1.2s — عكس العقد العام الموثَّق (middleware publicPrefixes + sitemap + تعليق الملف نفسه).
- **الإصلاح:** `SubscribeContent.tsx:109` — `apiFetch("/api/me", { skipAuthRedirect: true })` (اسم الخيار الفعلي مقروء من `csrf-client.ts:98-101 ApiFetchOptions`). الرفض يبقى محليًا: `authed=false` → زر «العودة للرئيسية»؛ رحلة 401 الخاصة بـ PaymentDialog (توست «سجّل الدخول أولاً») غير ممسوسة — الدفع يفرض المصادقة كما هو.
- **دعم إضافي:** تعليق توثيقي موسَّع عند البند يشرح عقد skipAuthRedirect (D8-G1) لمن يقرأ الملف لاحقًا.

### T2 — viewportFit + pb الزوجي (P0 — D7-P0-3) ✅ (تغيير واحد مقترن)
- `layout.tsx:61` — viewport export أُضيف `viewportFit: "cover"` → كل `env(safe-area-inset-*)` في التطبيق صارت حقيقية (كانت no-op=0 — D7 §6).
- **الزوج المرتبط في نفس الموجة:** `DashboardShell.tsx:59` — `pb-16 md:pb-0` → `pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0` (شريط 54px + حز home-indicator 34px — وصف D7 الحرفي للسيناريو الحرج PWA standalone).
- **ثالث الزوج (ملكي أيضًا):** `admin/layout.tsx:38` — نفس pb calc أدناه md لخلوص شريط الأدمن الجديد (انظر T4) — الشريط نفسه يبطن عبر `.safe-area-pb` الموجودة (globals.css:585).
- **تحذير للمنسّق (خارج ملكيتي):** `demo/page.tsx:542` ما زال `pb-16` (ملكية demo عندي = «سطر FAB فقط») — على iOS PWA بلا pb-calc، آخر ~34px من محتوى /demo قد يختفي خلف الشريط بعد تفعيل cover. مرشّح لموجة S4 (أو تمديد ملكية). انظر §3.

### T3 — SpeedInsights خلف بوابة (D8-G3) ✅
- `layout.tsx:125` — `{process.env.VERCEL ? <SpeedInsights /> : null}`. على `next start` الذاتي: السكربت لم يُحقن إطلاقًا (تحقق بناء: `rg "_vercel/speed-insights" .next/server/app/index.html` → صفر) — اختفت أخطاء console الـ404/MIME في 12/12 صفحة. على Vercel (VERCEL=1 وقت البناء) السلوك كما هو بلا تغيير.

### T4 — تنقل الأدمن (P0 — D7-P0-2) ✅
- **جديد:** `src/components/layout/AdminMobileNav.tsx` (84 سطرًا) — شريط سفلي `fixed inset-x-0 bottom-0 z-30 md:hidden` مرآة عقد MobileBottomNav البصري/a11y (bg-card/95 + backdrop-blur + safe-area-pb + grid-cols-4) بالأقسام الأربعة: الاشتراكات `/admin` (CreditCard) · التذاكر `/admin/support` (LifeBuoy) · تليجرام `/admin/telegram` (Send مع `rtl:-scale-x-100`) · الإعدادات `/admin/settings` (Settings) — الأيقونات نفس المستعملة في ترويسة admin/page.tsx:160-177.
- **a11y/لمس:** روابط `<Link>` حقيقية (prefetch + middle-click) · `aria-label` لكل خانة + `aria-current="page"` للنشطة + `nav aria-label="تنقل الإدارة"` · `min-h-11` (44px) لكل خانة (قاعدة D7 §2) · focus-visible ring + مؤشر نشط `h-0.5 bg-primary` + `active:scale-90` · `text-2xs` (11px — حد D7-P2-4 المقروئي، أعلى من `text-3xs` الخاصة بشريط dashboard).
- **التركيب:** `admin/layout.tsx:41` — `<AdminMobileNav />` **داخل AuthGuard** → لا يظهر على شاشات التحميل/403 للحارس، فقط للمدير المصرّح. `isActive` لعنصر `/admin` مطابقة تامة حتى لا تضيء خانة الاشتراكات على الأقسام الشقيقة (نفس عقد MobileBottomNav للـ/dashboard).
- **ملاحظة للمنسّق (خارج ملكيتي):** سطح المكتب بلا شريط (md:hidden): admin/telegram بلا أي رابط خروج/تنقل حتى الآن، وadmin/support رابطه الوحيد يعود لـ/dashboard — قرار «روابط متبادلة في ترويسات صفحات الأدمن» مؤجَّل لـ**S1** (ملكيتها ترويسات الصفحات، ليست layout).

### T5 — حركة دخول الصفحات (P1 — D2 «17 صفحة») ✅
- `DashboardShell.tsx:74` — غلاف children: `<div key={pathname} className="sb-fade-up flex-1 flex-col">`. قبلها: `sb-page-enter` كانت تعمل مرة واحدة عند أول mount للقشرة (D2 3.3#4) و17 صفحة فرعية تدخل بلا أي حركة. الآن كل تنقل يعيد mount الغلاف (المفتاح = pathname) ويشغّل `sb-fade-up`.
- **لماذا sb-fade-up:** معرَّفة فعلًا في `enter-motion.css:40-67` (يستوردها DashboardShell أصلًا في السطر 16) — opacity+translateY(24px) فقط (صفر reflow/كسر layout) · fill-mode `backwards` · `prefers-reduced-motion → animation: none` (enter-motion.css:82-90). مدتها 500ms (توكن دخول الأقسام المثبت في dashboard الرئيسية) — أعلى من حد 150-250ms الإرشادي لكنها الكلاس الوحيدة المعرّفة للدخول transform-only بلا delay؛ البديل `animate-fade-in-150` = 500ms + 150ms delay أبطأ. البقاء على توكن موحّد أنظف من قيمة خام جديدة (توكنز المدة ملك S3).
- **التغطية:** 23 مسار dashboard دفعة واحدة + صفحة sequences القادمة (E-F9) ترثها تلقائيًا (عقد الخطة 5: «E-F2 → الكل»). لا تعارض مع الموجود: صفحات تستخدم sb-fade-up داخليًا (dashboard الرئيسية/admin) صارت متداخلة تتابعيًا (شعور stagger، لا قفز)؛ KpiCard stagger سليم؛ لا عناصر fixed داخل children (dialogs عبر portals) فلا يتأثر fixed بـtransform الأب أثناء الـ500ms.

### T6 — FAB في /demo (P1 — D7-P1-1) ✅
- `demo/page.tsx:585-587` — غلاف حول `<FloatingWhatsApp />`: `[&>a]:bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:[&>a]:bottom-6`.
- **لماذا غلاف وليس تعديل المكون المشترك:** ملكية demo عندي «سطر FAB فقط» وFloatingWhatsApp يخدم landing/pricing/subscribe بموضعها الصحيح. محدد الابن `[&>a]:…` (خصوصية 0,1,1) يغلب كلاس المكون الأصلي `.bottom-[calc(env+1rem)]` (0,1,0) بلا تعديله.
- **تحقق التجميع (CSS مبني):** القاعدتان موجودتان ومرتّبتان صحيحًا — القاعدة العادية عند byte 146730 و`@media(min-width:48rem){.md\:\[\&>a\]\:bottom-6>a}` بعدها (146811) → الجوال: 5rem فوق الحز (فوق الشريط ~54px فلا يغطي زر «المزيد» — بوابة الأقسام الـ22) · md+: 24px. (Tailwind يرتب متغيرات responsive بعد القواعد العادية — موثّق بالقياس أعلاه.)

### T7 — زر إغلاق sheet (P1 — D7 §2.2#5) ✅
- `MobileBottomNav.tsx:130` — `size-8` (32px) → `size-10` (40px) هدف لمس ≥40px. (سطر واحد فقط — لم يُمسّ شيء آخر في الملف.)

---

## 2) البوابات (الأدلة)

| البوابة | النتيجة | الدليل |
|---|---|---|
| `npx tsc --noEmit` | ✅ صفر أخطاء | `TSC_OK` (بعد إصلاح خطأ types واحد في المسودة الأولى: `as const` → `interface AdminNavSection` لخاصية rtlFlip الاختيارية) |
| `npx vitest run` | ✅ **30 ملف / 245 اختبار passed** | Duration 57.56s — صفر فشل (بينها ApiGlobal401/PaymentFreePlan/AuthGuard التي تلامس ملكيتي) |
| `npm run build` | ✅ Compiled successfully + جدول المسارات كامل | `✓ Compiled successfully in 9.3s` · `Generating static pages (42/42)` · exit 0 |
| تحقق artifacts | ✅ | CSS مبني يحوي `calc(4rem + env(safe-area-inset-bottom))` و`calc(env(safe-area-inset-bottom) + 5rem)` و`safe-area-pb` و`sb-fade-up` · HTML الثابت يحوي `viewport-fit=cover` · **صفر** `/_vercel/speed-insights` في self-host build |

> ملاحظة بيئة: جرى `npm run build` مرتين إضافيتين للتحقق (تعارض lock عابر مع بناء متوازٍ من وكيل آخر في نفس الـworkspace — انتظرته ثم تحققت من artifacts النهائية). بوابة التسليم الثلاثية مرّت نظيفة.

## 3) ملاحظات للمنسّق (خارج ملكيتي — لا إجراء مني)

1. **S1 (قرار مطلوب):** سطح المكتب للأدمن بلا تنقل متبادل — admin/telegram معزول تمامًا على md+ (لا رابط خروج). التوصية: صف روابط متبادلة موحّدة في ترويسات صفحات الأدمن الأربع (ملكية تلك الصفحات، لا layout).
2. **S4 (مرشّح):** `demo/page.tsx:542` ما زال `pb-16` — بعد تفعيل `viewportFit:cover` يحتاج `pb-[calc(4rem+env(safe-area-inset-bottom))]` مثله مثل DashboardShell (ملكية demo عندي كانت «سطر FAB فقط» فلم أمسه).
3. **D7-P1-4/P2-4 المتبقية** (مفاتيح pricing 28px، تسميات شريط dashboard 10px، ~18 هدف لمس خام أخرى) — ملك S4 كما خطّطت الخطة.
4. **قياس مقترح (S5/D7-F5):** إضافة مسبار 375px لـ`/admin/*` + فحص rect-intersection لعناصر fixed يثبت إصلاح FAB/G1 آليًا — حاليًا الأدلة static (CSS مبني) + منطق الكود.

## 4) الخلاصة

المهام السبع منفَّذة جراحيًا: مسار المال العام للمجهولين مفتوح (G1)، الزوج المرتبط viewport/safe-area سليم (P0-3)، مدير المنصة له تنقل جوال 4 أقسام داخل AuthGuard (P0-2)، دخول الصفحات المتحرك يغطي 23+ مسارًا بسطر واحد (D2-P1)، FAB /demo فوق الشريط (P1-1)، زر إغلاق 40px (P1)، وSpeedInsights خلف بوابة VERCEL (G3). البوابات الثلاث خضراء مع أدلة artifacts.
