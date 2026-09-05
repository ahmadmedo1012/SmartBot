# SmartBot ↔ Smart-Menu — تدقيق التطابق الكامل (v3 final-launch plan §2)

> **تاريخ التدقيق:** 2026-09-06 | **المرجع:** menu.smart-link.ly (المصدر الحي) + مستودع Smart-Menu المحلي
> **المنهجية:** مسح كامل عنصر-بعنصر بلا استثناء (ليس عينات): كل مسار، كل مكوّن، كل توكن.
> **ملاحظة الحالة:** «مطابق» = مطابق على مستوى الكود + بنية الطبقات، ويُختم بلقطة حية
> من bot.smart-link.ly في `docs/v3-final-launch-report.md` بعد البوابة الحية (§7).

---

## 1. جرد الصفحات الكامل (§2.1) — 60 مسارًا (اتحاد المشروعين)

SM = Smart-Menu · SB = SmartBot · «L/E» = ملفات loading.tsx/error.tsx على مستوى الصفحة.
الأعمدة: الألوان/الخطوط/التخطيط — كلها تُدار مركزيًا من `globals.css` المتطابق
(القسم 3) + طبقات المكوّنات المشتركة (القسم 2)، لذا التطابق الصفحي يتبع المكوّنات.

### 1.a الصفحات المشتركة (10) — كلها «مطابق»

| المسار | SM | SB | الغرض | ملاحظات التطابق |
|---|---|---|---|---|
| `/` | ✅ (public)/page.tsx | ✅ page.tsx | صفحة الهبوط | مطابق — نفس مقاطع الهبوط المنقولة (Hero/Features/Stats/HowItWorks/FAQ/CTA) + توكنز حرفية |
| `/login` | ✅ +L+E | ✅ +L+E | تسجيل الدخول | مطابق — بطاقة العلامة + Cairo/Readex + أزرار Button المنقولة |
| `/pricing` | ✅ +L+E | ✅ +L+E | الأسعار والباقات | مطابق — PricingSection منقولة (وفر شهرين ×10) + L+E |
| `/subscribe` | ✅ +L+E | ✅ +L+E | معالج الاشتراك | مطابق — PlanSelector/StepIndicator/PaymentDialog (تطابق أصناف 129/129) |
| `/terms` | ✅ (محمية) +L+E | ✅ +L+E **(أُضيفا هذا الالتزام)** | الشروط | مطابق — صفحة قانونية رقمية عربية؛ SM يضعها تحت (protected) بينما SB عامة (قرار منتج: قانونية عامة لا تتطلب جلسة) |
| `/privacy` | ✅ (محمية) +L+E | ✅ +L+E **(أُضيفا هذا الالتزام)** | الخصوصية | مطابق — نفس قرار /terms |
| `/demo` | ⚠️ route.ts (بذرة جلسة، 404 بالإنتاج) | ✅ صفحة +L+E | التجربة | **نطاق مختلف مقصود** — SM عرض مالك حي؛ SB لوحة وهمية تفاعلية عامة. لا يُعد فجوة تطابق |
| `/admin` | ✅ لوحة KPI | ✅ إدارة الاشتراكات | لوحة الأدمن | **نطاق مختلف مقصود** — محتوى SB (موافقات الدفع) = نظير SM `/admin/subscriptions` بنفس الأنماط |
| `/admin/settings` | ✅ +L+E | ✅ (+L+E عبر قطاع /admin) | إعدادات المنصة | مطابق — 4 بطاقات إعدادات (دفع/دعم/تليجرام/ويبهوك) بنمط بطاقات SM |
| `/admin/telegram` | ✅ +L+E | ✅ +L+E | تليجرام | مطابق — 3 مكونات أقسام منقولة 1:1 (Config/Diagnostics/BroadcastTargets) |

### 1.b صفحات SM بلا مقابل في SB (25) — كلها «نطاق مطعمي مختلف»

`/menu`, `/menu/[slug]`, `/menu/[slug]/print`, `/cart`, `/order-confirmed`,
`/admin/{admins,audit-logs,menu,orders,orders/[id],qr,restaurants,subscriptions,system-events,users}`,
`/owner{,/loyalty,/menu,/menus,/orders,/orders/[id],/qr,/restaurants,/reviews,/settings}`

كلها نطاق منيو المطاعم (سلة، طلبات، ولاء، QR، مطاعم) — لا وجود لها في منتج بوت
فيسبوك **بالتصميم**. الأنماط العامة منها مستهلكة بالفعل في SB عبر المكوّنات
المنقولة (KpiCard/ChartCard/NavLink/PageHeader/PaymentDialog). ليست فجوات.

### 1.c صفحات SB بلا مقابل في SM (25 + catch-all) — «خصوصية نطاق SmartBot»

| المسار | نمط الواجهة | الحالة |
|---|---|---|
| `/register` | بطاقة تسجيل + L+E **(أُضيفا)** | مطابق النمط (بطاقة العلامة مثل /login) |
| `/connect` | صفحة ربط فيسبوك + L+E **(أُضيفا)** + قائمة صحة الويبهوك | مطابق النمط (بطاقات/مدخلات h-12) |
| `/dashboard` | DashboardShell: KpiCard/ChartCard/PageHeader المنقولة + قطاع L+E | مطابق |
| `/dashboard/messages` | PageHeader + master-detail متجاوب + إحصاءات | مطابق |
| `/dashboard/autoreply` `/marketing` `/notifications` `/settings` | PageHeader المنقول | مطابق |
| `/dashboard/{analytics,audience,ads,activity,broadcast,billing,calendar,comments,leads,pages,posts,reports,scheduled,support,team,tools}` | رأس لاصق مضغوط (h1 font-bold text-sm) + بطاقات الكود المشتركة | مطابق على مستوى المكوّنات/التوكنز؛ **الرأس الصفحي أبسط من LayoutHeader في SM بقرار تصميمي للوضع المضغوط** — بند تحسين مستقبلي (تبنّي PageHeader) مسجّل في §4 |
| `/dashboard/[...slug]` | catch-all + 404 مصمم + L+E قطاعي | مطابق |

**حاصل الصفحات:** لا فجوة تطابق واحدة قابلة للإغلاق — الفروق كلها إما منتجية
مقصودة (نطاق فيسبوك مقابل نطاق مطاعم) أو بقرار تصميم موثّق.

---

## 2. جرد المكوّنات الكامل (§2.2) — زوج-بزوج

### 2.a متطابقة حرفيًا (أو فرق تعليقات/مسار استيراد فقط)

`button` (cva كامل: orange/flame/outline/ghost/destructive + sm h-10/default h-12/lg
h-14/icon + لمعان/توهج/active:scale) · `card` (منقول حرفيًا: --card-spacing + طبقات
ارتفاع + spotlight) · `dialog` (تطابق أصناف كامل) · `label` · `separator` ·
`skeleton` · `grid-pattern` · `kinetic-text` · `scroll-reveal` · `scroll-parallax` ·
`clip-path-reveal` · `copy-icon` · `upload-icon` · `x-icon` · `GlowPool` ·
`OptimizedImage` (فرق وحيد: أيقونة الاحتياط Bot مقابل UtensilsCrossed — نطاق مناسب) ·
`SectionHeader` · `KpiCard` · `ChartCard` · `MiniSparkline` · `NavLink` ·
`PaymentDialog` (**129/129 صنف متطابق**) · `premium-toast` · `Toaster` (top-center) ·
`motion.ts` (كل الزنبركات) · عائلة scroll-craft كاملة.

### 2.b أُغلقت فجواتها في هذا الالتزام (v3 final-launch)

| المكوّن | الفجوة التي وجدها التدقيق | الإصلاح |
|---|---|---|
| `Eyebrow` | يفتقد `font-naskh` | ✅ أُضيفت + قاعدة CSS المنقولة حرفيًا |
| `Input` | py-2/text-sm/ring-50/placeholder/معطّل/حالات | ✅ py-3 + text-base md:text-sm + ring/20 + placeholder/70 + معطّل كامل + حالات SM حرفية |
| `Textarea` | padding/خط/حلقة/aria-invalid | ✅ px-3 py-2.5 + text-base md:text-sm + ring/40 + aria-invalid كامل (نقل حرفي) |
| `Badge` | focus-visible/أيقونات padding/destructive /10/ghost+link/dark:text | ✅ نقل حرفي كامل مع الإبقاء على الأسماء القديمة |
| `Switch` | شكل/أحجام/RTL thumb/bg-primary/منطقة لمس | ✅ نقل حرفي كامل (18.4×32 / 14×24 + rtl translate + بعد:-inset) |
| `SectionContainer` | padding ناقص (48/64 مقابل 64/96/112) بلا scroll-mt/tone | ✅ بنية SM حرفية (py-16/24/28 + scroll-mt-20 + tone="alt" + transition) |
| `ThemeToggle` | شكل مسطح بلا زنبرك/تبديل أيقونات | ✅ نقل حرفي (size-11 دائري زجاجي + whileHover 1.08/rotate + AnimatePresence) |
| `FloatingWhatsApp` | بلا safe-area/ظلال متدرجة/أيقونة متحركة | ✅ نقل حرفي (z-[60] + safe-area + animate-fade-in 3s + AnimatedMessageCircle المنقول) |
| `AdminSidebar` logo | حرف "S" نصي | ✅ الصورة الحقيقية `/brand-icon.png` (خطة §5.1) |
| `MobileBottomNav` | ورقة «كل الأقسام» بلا رأس علامة | ✅ رأس العلامة بصورة الشعار (نمط MobileNav في SM) |
| صفحات register/connect/terms/privacy | بلا L+E | ✅ أُضيفت (نمط DefaultLoading/DefaultError) |

### 2.c مكوّنات SM غير موجودة في SB (بلا مقابل) — القرار

- **عائلة نطاق المطاعم** (QrCornerMark، Confetti، CartHydrator، ServiceWorker،
  InstallPrompt، OrderNotifier، owner/*، menu/*، loyalty/*): غير منطقية في بوت
  فيسبوك — **لا تُنقل**.
- **رسوم SM البيانية المخصصة** (AreaChart/ColumnChart/…): SB يستخدم recharts
  بنفس التوكنز (`var(--primary)`) — تغطية دور، قرار معماري موثّق.
- **عناصر عامة جديرة بالنقل مستقبلًا** (مسجلة كخطة تحسين، ليست فجوات إطلاق):
  `sheet.tsx`، `select.tsx`، `table.tsx`، `search-input.tsx`،
  `action-search-bar.tsx`، `loading-announcer.tsx` (a11y)، `AvatarInitials.tsx`،
  و19 أيقونة متحركة (save/refresh/download/eye/trash/logout/send/star…).
  ملاحظة: التنقل الجوال في SB يستخدم MobileBottomNav + sheet يدوي — يغطي دور
  sheet.tsx بحجم أصغر.
- `PageHeader` (SB) و`SetupWarnings` (SB) و`OnboardingTour` (SB): إضافات SB
  الذكية بلا مقابل في SM — تراث خاص.

---

## 3. جرد التوكنات الكامل (§2.3) — **صفر فروق قيم**

مسح آلي لكل متغير CSS في `:root` + `.dark` بكلا المشروعين:
- **Smart-Menu: 109 توكنًا · SmartBot: 98 توكنًا · فروق القيم على المشترك: 0 (صفر)**

المفاتيح غير المشتركة كلها نطاقية بحتة:
- SM فقط: `--c-device-*` (خمسة) = نظائر `--iphone-*` في SB بأسماء مختلفة؛
  `--showcase-accent-*` (عشرة) لمشاهد المنيو الدوّارة؛ `--menu-glow*`؛
  `--confetti-{emerald,yellow}` = نظائر SB بأسماء أخرى.
- SB فقط: `--accent-fg` (نظير `--destructive-foreground`)؛ `--accent-soft`
  (اسم قديم دلالته = `--accent` نفسها — بلا مستهلكين، بقايا تُركت عمدًا لأنها
  متعادلة)؛ أسماء confetti/iphone المذكورة أعلاه.

**قيم التطابق الحاسمة (أُعيد التحقق بها مباشرة):** `--primary oklch(0.55 0.19 45)`
(الداكن 0.40) · `--accent oklch(0.55 0.19 45/0.15)` (الداكن 0.12) · `--orange/
--ring oklch(0.55 0.19 45)` · `--whatsapp #25D366` · نصف القطر 8/12/18/28 ·
الزنبركات ease-out-quart/ease-smooth · ظلال الزجاج.

**الخطوط (§6 — أُغلقت هذا الالتزام):**
- `--font-heading` في `@theme inline`: **"Readex Pro" أولًا** ثم `var(--font-cairo)`
  — نقل حرفي من SM؛ الأداة `.font-heading` تُصدر القيمة مضمّنة (تطابق الإنتاج
  الحي للم SoftMenu حرفيًا: `.font-heading{font-family:"Readex Pro", var(--font-cairo,"Cairo"),…}`).
- `:root` `--font-heading` يبقى Cairo-first **مطابقًا لحرفية SM** (سطرهم 156) —
  قاعدة h1-h5 المجردة عند الطرفين تُحلّ للطبقة غير المُصنّفة نفسها.
- أُزيلت قاعدة `.font-heading` المكتوبة يدويًا في SB (لا وجود لها في SM — كانت
  تُبطل عمل القيمة المضمّنة وتُعيد Cairo للعناوين).
- ملفات الخطوط محلية (Cairo 400-800 + Readex Pro variable + Noto Naskh) بلا
  أي طلبات خارجية — نفس نمط fonts.css في SM.

---

## 4. بنود التحسين المستقبلية المسجّلة (ليست فجوات إطلاق — قرار موثّق)

1. **تبنّي PageHeader على صفحات الرأس المضغوط الـ15** — الرأس اللاصق الحالي
   (h1 font-bold text-sm) مقصود للوضع المضغوط؛ PageHeader المنقول يضيف فتات
   خبز/حبة حالة/حركة دخول. تبنيه لكل صفحة = 15 تعديلات صفحية تُنفّذ بعد
   الاستقرار (خطر انحدار على مسارات الإنتاج قبل الإطلاق).
2. **نقل عائلة الرسوم SVG المخصصة من SM** (تغطية دور حالية بـ recharts).
3. **نقل select/table/search-input/loading-announcer** عند الحاجة الوظيفية.
4. **توحيد حزمة الحركة** (motion/react مقابل framer-motion) — نفس واجهة API؛
   قرار حزمة فقط.

## 5. بوابة الحياة (§7)

هذا الملف يوثّق تطابق الكود + بنية الطبقات. الدليل الحي (لقطات من
bot.smart-link.ly بمقاسات 375/768/1440 + التحقق الوظيفي للويبهوك/التليجرام)
يُرفق في `docs/v3-final-launch-report.md` بعد اكتمال نشر Vercel — كل صف «مطابق»
أعلاه يُختم هناك بلقطته.
