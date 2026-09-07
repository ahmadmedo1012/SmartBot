# تقرير v15-D5 — تدقيق عميق للمكونات و a11y/RTL (مقابل WCAG 2.2 AA)

**الوكيل:** D5 (components + a11y/RTL) · **الأساس:** main @ 558623b3 (v14 مكتملة) · **التاريخ:** 2026-09-07
**النطاق:** `fb_dashboard/frontend/src/components/` (كلها: ui / shared / shared/payment / layout / landing / charts / onboarding / subscribe) + `src/app/**/*.tsx` (كل الصفحات التفاعلية) — لا كود تطبيق.
**المنهج:** قراءة سطراً بسطر لكل مكون/صفحة تفاعلية + 14 جولة grep آلية (onClick على غير تفاعلي، rtl:-scale-x-100، خصائص فيزيائية ml/mr/pl/pr/text-left، dir="auto"، prefers-reduced-motion، recharts، aria-label/label/aria-describedby، onKeyDown، تصديرات ميتة عبر محلل AST مبسط) + حساب تباين WCAG فعلي (سكربت oklch→sRGB→contrast لكل زوج مشبوه في الوضعين داكن/فاتح على القيم الرمزية الحقيقية من globals.css).

---

## 0) إغلاقات v14 المُتحقَّق منها حيةً (لم تُعَد في الإحصاء)

توكن placeholder AA (input.tsx:51 `placeholder:text-placeholder-text`) · رفع الإيصال sr-only+peer (payment-instructions.tsx:243-265) · إعلانات حالة الدفع aria-live + إدارة التركيز بين الخطوات (payment/index.tsx:71-77, 123-137) · aria-pressed لعائلة أزرار التبديل (admin:180, messages:182, pricing:129, payment-methods:59) · h1 sr-only (admin:147, settings:290, connect:244, wizard:298, DefaultError:35) · DirectionalIcon للتقويم (calendar:75-84) · reduced-motion للعداد (KpiCard:34-40, StatsSection:41-43) · زر إظهار كلمة المرور داخل ترتيب Tab (login:226-233) · fixes عائلة الشفافيات الموثقة: فقاعة الرسائل /70 و/50 (messages:332-347)، login:264 (footer /80)، StepIndicator:80 (foreground/70 كامل)، إشعار mention bloom (notifications:44-51)، glow/spotlight color-mix (Header:211, card:68) · حذف التصديرات الميتة الموثقة (buttonVariants/badgeVariants/DialogTrigger…).

## 0-ب) مُتحقَق نظيف (لمنع إعادة الإبلاغ لاحقاً)

- **RTL عموماً نظيف ومتّسق:** لا `ml-/mr-` متبقية إطلاقاً؛ الاستثناءات الفيزيائية المتبقية مقصودة وموثّقة: `text-left/pl-10` على حقول `dir="ltr"` فقط (توكن/هاتف/IBAN)، `fixed top-0 right-0` لعمود الشريط الجانبي المثبّت مع تعليق "App is RTL-only" (AdminSidebar:163-166، demo:527). عناصر `start/end/ps/pe/ms/me` في كل ما عدا ذلك.
- **`rtl:-scale-x-100` المتبقية (20 موضعاً) ليست خرقاً:** قرار v7 §2.2 الموثق في directional-icon.tsx:22-23 يلزم الأيقونات غير السهمية (Send/Reply/LogOut/ArrowUpRight) بالآلية نفسها مباشرة. كل السهام/الشيفرونات الدلالية تمر عبر DirectionalIcon (15 مستهلكاً). استثناءا الشيفرون في support:428,516 موثقان (كاشف فتح/إغلاق لا اتجاه قراءة).
- **الحوارات:** base-ui v1.8.0 (Dialog) يوفر مصيدة التركيز/Escape/إعادة التركيز أصلاً؛ MobileMenu (Header) و more-sheet (MobileBottomNav) والمعالج (OnboardingWizard) لديها مصيدة Tab + Escape + إعادة تركيز مكتوبة يدوياً ومطابقة.
- **النماذج الكبرى نموذجية:** login/RegisterForm (label htmlFor + autocomplete صحيح + aria-invalid + aria-describedby للأخطاء عبر describedBy + role=alert + أيقونات صلاحية role=img) · wizard (label+hint مرتبطان، h1، منطقة live لنتيجة الاختبار) · support (radiogroup بأسهم كاملة مع التفاف، textarea مع aria-describedby/aria-invalid، role=alert).
- **recharts:** كل المستهلكين الحقيقيين يمررون `summary` sr-only (dashboard عبر ChartCard:203، analytics:85/119، demo stats:222) — موضع واحد فقط فاتته (L3 أدناه).
- **reduced-motion:** غطاء عام شامل (globals.css:549-551 يوقف كل الرسوم/الانتقالات) + حراس matchMedia في كل الحركات JS (KpiCard، StatsSection، ScrollReveal، KineticText، SectionHeader، charts/index:27-37) + صناديق media مخصصة لكل عائلة (globals.css:450-547، enter-motion.css:82، wizard CSS:50-52).
- **كود ميت:** فحص كل تصديرات المكونات آلياً — لا مكون يتيم؛ كل مكون له مستهلك واحد على الأقل.

---

## 1) العالية (5)

### H1 — زوج /80 على muted-foreground في زرّي الرجوع بشاشتي الدخول/التسجيل (نفس زوج v14-D4-H03 في سطرين آخرين لم يُصلحا)
- **الملف:** `src/app/login/page.tsx:175` و `src/app/register/RegisterForm.tsx:131`
- **المقتطف:**
  ```tsx
  <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground/80 hover:text-foreground">
    <DirectionalIcon semanticDirection="back" className="size-3.5" />
    العودة للرئيسية
  ```
- **القياس (محسوب على التوكنات الفعلية):** 3.89:1 داكن / 4.08:1 فاتح — تحت أرضية 4.5:1 (WCAG 1.4.3). v14 أصلح الزوج نفسه في سطر footer مجاور (login:261-264 علّق القياس نفسه 3.89/4.08 وتبديله بالتوكن الكامل) لكن سطري زرّي الرجوع بقيا.
- **الإصلاح المقترح:** حذف `/80` (التوكن الكامل = 5.59:1 داكن / 6.54:1 فاتح) — تعديل سطرين.

### H2 — ترويسة نافذة الدفع: وصف `text-white/70` فوق تدرّج accent-foreground = 2.56:1 (المسار المالي)
- **الملف:** `src/components/shared/payment/index.tsx:422-429`
- **المقتطف:**
  ```tsx
  <div className="bg-gradient-to-br from-accent-foreground to-accent-foreground/80 text-white p-6">
    ...
    <DialogDescription className="text-white/70 text-sm">
      ادفع عبر المحفظة الإلكترونية
    </DialogDescription>
  ```
- **القياس:** الوصف (نص صغير) = 2.56:1 داكن على الطرف الصلب / 3.45:1 على طرف /80؛ فاتح 3.02-3.86:1 — فشل في الوضعين. كما أن اسم الخطة `<span className="font-bold">{planNameAr}</span>` (نص 14px عريض، ليس "نصاً كبيراً") أبيض كامل = 3.77:1 داكن — فشل. (العنوان text-lg bold = نص كبير → 3.77 يمر بحد 3:1).
- **الإصلاح المقترح:** الوصف → `text-white` مع تفتيح التدرّج قليلاً (مثلاً `from-accent-foreground/90`)، أو `text-espresso` على التدرّج الفاتح من saffron؛ اسم الخطة → `text-white` + رفعه لحجم/وزن "نص كبير" (text-base bold) أو نقش داكن.

### H3 — أحرف بادئة أفاتار المحادثات: أبيض على لون مشتق من hsl(hash(name), 55%, 45%) — يصل إلى 2.26:1
- **الملف:** `src/app/dashboard/messages/page.tsx:52-55`
- **المقتطف:**
  ```tsx
  <div className="size-11 rounded-full ... text-white font-bold text-sm ..."
    style={{ background: `hsl(${((conv.senders?.[0]?.name || "").length * 37) % 360}, 55%, 45%)` }}>
    {initials(conv.senders?.[0]?.name)}
  ```
- **القياس (عيّنات من القيم الممكنة فعلياً — hash طول الاسم):** hue 60→2.26:1، 120→2.78:1، 200→3.97:1، 0→6.13:1، 240→9.25:1. نص صغير 14px عريض — الأغلبية تحت 4.5:1 (WCAG 1.4.3).
- **الإصلاح المقترح:** تثبيت الإضاءة بدل التشبع: `hsl(h, 45%, 32%)` (أرضية داكنة لأي hue تضمن ≥4.5:1)، أو الأبسط: تدرّج توكني ثابت (نمط KpiCard `bg-gradient-to-br from-accent-foreground to-accent-foreground/70`) مع dir="auto" على الاسم المجاور (موجود أصلاً).

### H4 — إشعارات مقروءة: تعتيم البطاقة كلها `opacity-70` يُسقط نص المتن إلى 3.20:1
- **الملف:** `src/app/dashboard/notifications/page.tsx:259-263`
- **المقتطف:**
  ```tsx
  <Card ... className={[
    "transition-all",
    n.read ? "opacity-70 border-border/40" : "border-accent-foreground/25 bg-primary/[0.02]",
  ].join(" ")}
  ```
- **القياس:** muted-foreground (متن الإشعار) عند شفافية 0.7 فوق الخلفية = 3.20:1 داكن / 3.28:1 فاتح — كل إشعارات "المقروءة" (الأغلبية بعد الاستخدام) نصّها تحت 4.5:1. عضو متبقٍّ من عائلة الشفافيات لم يُغلق في v14 (الإغلاقات استهدفت أزواج لون/نص صريحة لا opacity على الحاوية).
- **الإصلاح المقترح:** تمييز الحالة المقروءة بالحدّ/الخلفية فقط (border-border/40 + بلا bg-primary) وإبقاء النص كامل الشفافية، أو opacity-90 (يبقى ≈4.4 — لا يكفي) → الأفضل إزالة التعتيم عن النص: `n.read ? "border-border/40" : …`.

### H5 — روابط "إنشاء حساب/تسجيل الدخول" بين شاشات المصادقة: `text-accent-foreground/80` = 3.76:1 داكن
- **الملف:** `src/app/login/page.tsx:257` و `src/app/register/RegisterForm.tsx:257`
- **المقتطف:**
  ```tsx
  <Link href="/register" className="text-xs text-accent-foreground/80 hover:text-accent-foreground hover:underline transition-colors">
    ليس لديك حساب؟ إنشاء حساب جديد
  ```
- **القياس:** 3.76:1 داكن (فشل) / 4.53:1 فاتح (يمر بهامش 0.03). رابط تفاعلي في مسار الدخول.
- **الإصلاح المقترح:** حذف `/80` (التوكن الكامل 5.41:1 داكن / 6.47:1 فاتح).

---

## 2) المتوسطة (7)

### M1 — صفحة /connect: أخطاء التحقق والتحذيرات تُعرض صامتة (بلا role=alert ولا aria-describedby)
- **الملف:** `src/app/connect/page.tsx:350-355` (+ 333-348)
- **المقتطف:**
  ```tsx
  {errorMsg && (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs text-destructive">{errorMsg}</p>
    </div>
  )}
  ```
- **المشكلة:** رسالة خطأ "تعذر الاتصال/رمز غير صالح" في مسار ربط الصفحة (مسار ما قبل المال) لا تُعلن لقارئ الشاشة ولا ترتبط بحقول page-id/access-token؛ مقارنةً بالمعالج (role=status aria-live) وبـ login (role=alert). scopeWarnings كذلك.
- **الإصلاح:** `role="alert"` على errorMsg، و`aria-describedby="connect-error"` على حقل الرمز عند وجوده؛ scopeWarnings → role="status".

### M2 — أزرار التبديل/الحذف الأيقونية في القواعد والعروض: لا aria-pressed + تسميات عامة ("تبديل"، "حذف")
- **الملفات:** `src/app/dashboard/autoreply/page.tsx:189,192` و `src/app/dashboard/tools/page.tsx:165,168`
- **المقتطف (autoreply):**
  ```tsx
  <Button size="sm" variant="ghost" onClick={() => toggleMut.mutate(r.id)} ... aria-label="تبديل">
    {r.enabled === false ? <ToggleLeft .../> : <ToggleRight .../>}
  ...
  <Button ... aria-label="حذف"><Trash2 .../></Button>
  ```
- **المشكلة (WCAG 4.1.2):** زر تبديل حالة بلا `aria-pressed` — حالة نشط/متوقف غير مكشوفة برمجياً (الأيقونة وحدها)، وفي قائمة قواعد متعددة لا يعرف مستخدم SR أي قاعدة سيُحذف/تُبدَّل (مقارنة بـ posts:143 `aria-label="حذف المنشور"` الصحيح).
- **الإصلاح:** `aria-pressed={r.enabled !== false}` + `aria-label={`حذف قاعدة ${r.name}`}` / `تبديل حالة قاعدة ${r.name}` (والمثل في tools باسم العرض).

### M3 — زر فتح/إغلاق تذكرة الدعم بلا aria-expanded/aria-controls
- **الملف:** `src/app/dashboard/support/page.tsx:406-431`
- **المقتطف:** زر native يبدّل `openTicketId` ويظهر شيفرون يدور؛ الحالة المفتوحة/المغلقة غير معلنة (FAQ المجاور يستخدم details/summary فيوفرها أصلاً).
- **الإصلاح:** `aria-expanded={openTicketId === t.id}` و`aria-controls={`ticket-thread-${t.id}`}` مع id مطابق.

### M4 — radiogroup الجمهور في صفحة التسويق بلا عقد أسهم لوحة المفاتيح (تفاوت مع support)
- **الملف:** `src/app/dashboard/marketing/page.tsx:183-204`
- **المقتطف:** أزرار `role="radio"` + aria-checked داخل `role="radiogroup"` — تعمل بـ Tab/Enter (لا خرق 2.1.1) لكن نمط ARIA للراديو يوجّب ArrowKeys لتحريك الاختيار؛ صفحة support نفسها (273-292) تنفذ العقد كاملاً مع RTL صحيح — التفاوت هو الخلل.
- **الإصلاح:** نقل نمط onKeyDown من support:273-292 إلى الحاوية (مع اجتياز PRIORITY→AUDIENCES) + focus برمجي على المختار.

### M5 — حقول نموذج الدفع: تلميح غير مرتبط وrequired بصري فقط
- **الملف:** `src/components/shared/payment/payment-instructions.tsx:112-115, 219-228`
- **المقتطف:**
  ```tsx
  <p className="text-2xs text-muted-foreground mt-1">
    10 أرقام تبدأ بـ 09 — حتى نتمكن من التأكد من استلام التحويل
  </p>
  ...
  <Label htmlFor={senderNumberId}>رقم حساب المُرسِل *</Label>
  <Input id={senderNumberId} ... />  // لا required ولا aria-required ولا autoComplete
  ```
- **المشكلة (WCAG 3.3.2):** التلميح المرئي لنمط الهاتف غير مربوط بـ aria-describedby؛ النجمة في label رقم الحساب واسم المُرسل إلزامية بالتحقق (handleSent:234) لكن غير معلنة برمجياً في رقم الحساب/المبلغ؛ حقل الهاتف نفسه صحيح (required + autoComplete="tel") — اللاحق غير كامل. (ملاحظة مجاورة: `min={1}` بلا أثر مع type="text").
- **الإصلاح:** تمرير التلميح عبر `hint` المكوّن Input (يربطه آلياً) أو `aria-describedby` يدوي؛ `required` على الحقلين الإلزاميين.

### M6 — بقايّا عائلة /60: نص "مجاناً بدون بطاقة…" في CTA النهائي و"أضيف بواسطة" في التشخيص
- **الملفات:** `src/components/landing/sections/FinalCTASection.tsx:57` و `src/app/admin/telegram/DiagnosticsSection.tsx:121`
- **المقتطف (الأول):** `className="text-xs text-muted-foreground/60 mt-6"` — 2.62:1 داكن / 2.68:1 فاتح (نص طمأنة تعاقدي في صفحة الهبوط).
- **الثاني:** `<span ... className="font-sans text-muted-foreground/60"> · أضيف بواسطة {a.addedBy.name}</span>` — 2.62:1.
- **الإصلاح:** التوكن الكامل في الموضعين (تجاوز gate-contrast آلياً بعدها).

### M7 — bidi: قيم حية بلا dir="auto" (مواضع متبقية)
- **الملفات/المواضع:**
  - `src/app/dashboard/comments/page.tsx:118` — نص التعليق نفسه `c.message` (from_name له dir=auto لكن نص التعليق اللاتيني/المختلط لا).
  - `src/app/dashboard/messages/page.tsx:338` — متن الفقاعة `msg.message`.
  - `src/app/onboarding/OnboardingWizard.tsx:403-408` — `testResult.page_name` داخل منطقة aria-live (اسم صفحة فيسبوك لاتيني يُدمج في جملة عربية).
  - `src/app/admin/page.tsx:255` — `p.username` في جدول المدفوعات.
  - `src/app/dashboard/team/page.tsx:69` — `m.email`.
- **الإصلاح:** `dir="auto"` على هذه العناصر (نمط messages:65/leads:64 الموثق v14-E5 D3-ج).

---

## 3) المنخفضة (10)

### L1 — Card التفاعلية: Space يُفعّل ويُمرّر الصفحة معاً (لا preventDefault)
- **الملف:** `src/components/ui/card.tsx:52-56`
- **المقتطف:** `onKeyDown={(e) => { if (interactive && (e.key === "Enter" || e.key === " ")) { e.currentTarget.click(); } }}` — النقر بالمسافة على div[tabIndex] يُصفّح الصفحة أيضاً (AdminSidebar:156 يعملها صحيحة بـ preventDefault — نموذج جاهز للنسخ).
- **الإصلاح:** `if (e.key === " ") e.preventDefault()` قبل click.

### L2 — عنصر المحادثة `<button role="listitem">` يُلغي دلالة الزر
- **الملف:** `src/app/dashboard/messages/page.tsx:40-43` — role="listitem" فوق زر native: SR يعلن "عنصر قائمة" لا "زر" بينما Enter يُفعّل (مفاجئ). الأفضل: `<li>` غلاف + الزر داخله (نمط notifications:258 الموثق B18).

### L3 — رسم AnalyticsTab في /demo بلا بديل نصي
- **الملف:** `src/app/demo/page.tsx:423-426` — `ActivityBarChart` بلا `summary` وغير ملفوف بـ ChartCard (كل المستهلكين الآخرين يمررونه؛ demo:222 يمرره في تبويب آخر).
- **الإصلاح:** `summary="مخطط أعمدة لنشاط أسبوعي تجريبي"`.

### L4 — هياكل التحميل المتناثرة بلا aria-busy/role=status
- **الملفات:** `src/components/ui/EmptyState.tsx:115-129` (LoadingState) + الهياكل المضمّنة في ~15 صفحة (autoreply:144، leads:44، reports:129…). ChartCard:64-73 ينفذها صحيحاً (aria-busy + sr-only). قارئ الشاشة لا يعرف أن التحميل جارٍ.
- **الإصلاح:** في LoadingState: `<div role="status" aria-busy="true"><span className="sr-only">جارٍ التحميل…</span>` (موجّه واحد يغطي 11 مستهلكاً).

### L5 — alt="SmartBot" مكرر نصاً مجاوراً في الشريط الجانبي/الشيت
- **الملفات:** `src/components/layout/AdminSidebar.tsx:118` و `src/components/layout/MobileBottomNav.tsx:115` — الصورة بجوار نص "SmartBot" مرئي؛ v9-D4 أصلح Header/MobileMenu (alt="") وترك هذين (axe image-redundant-alt).
- **الإصلاح:** `alt=""` في الموضعين.

### L6 — حقول رمز الوصول type="password" بلا autocomplete="off"
- **الملفات:** `src/app/onboarding/OnboardingWizard.tsx:367` و `src/app/connect/page.tsx:321` — المتصفح يعرض مطالبة "حفظ كلمة المرور" لرمز Page Access Token (ليس كلمة مرور) ويخزّنه في مدير كلمات المرور.
- **الإصلاح:** `autoComplete="off"` على الحقلين.

### L7 — تصديرات/أنماط ميتة صغيرة
- `src/components/ui/dialog.tsx:107-114` — DialogOverlay/DialogPortal مصدَّران لكن صفر مستوردين خارجيين (التعليق:105-106 يقول "module-internal" لكنهما ما زالا في قائمة export).
- `src/components/ui/badge.tsx:35-36` — متغيرا variant `saffron` و`gradient` (و`gold` جزئياً) صفر استهلاك في التطبيق.
- **الإصلاح:** إزالتهما من قائمة التصدير/المتغيرات (أثر حزمة شبه صفري، اتساق مع حملات v10-W4/v14-E5 لحذف الميت).

### L8 — تمرير سلس إجباري عند وصول رسائل جديدة
- **الملف:** `src/app/dashboard/messages/page.tsx:139-141` — `scrollIntoView({ behavior: "smooth" })` عند كل تحديث (refetch كل 10 ثوان) بلا فحص prefers-reduced-motion (غلاف CSS globals:549 لا يلتقط السلوك البرمجي).
- **الإصلاح:** `behavior: mq.matches ? "auto" : "smooth"` (نمط usePrefersReducedMotion الجاهز في نفس الشجرة: charts/index:27).

### L9 — عناصر <label> يتيمة غير مرتبطة
- **الملفات:** `src/app/dashboard/support/page.tsx:268` (label "الأولوية" بلا htmlFor — المجموعة تستخدم aria-label مستقلاً؛ الأنظف aria-labelledby نحو الlabel المرئي) و`src/components/shared/payment/payment-instructions.tsx:233` (label "صورة التحويل (اختياري)" بلا هدف؛ الاسم البرمجي للحقل يأتي من label الرفع الفعلي:255).
- **الإصلاح:** ربط أو تحويلها إلى عناصر نصية عادية مع aria-labelledby.

### L10 — حالات صامتة متناثرة
- `src/app/admin/telegram/DiagnosticsSection.tsx:181` — `<Badge variant="default">✅</Badge>` إيموجي وحده كمحتوى حالة (SR يقرأ الاسم الرمزي للإيموجي أو لا شيء) — استبداله بـ"نجح"/sr-only.
- `src/components/shared/CronHeartbeatCard.tsx:73-89` — نص الحالة (متوقف/حديث/تعذر) يتحدث بالاستقصاء الدوري دون aria-live؛ صفحة الأدمن فقط.
- `src/app/dashboard/autoreply/page.tsx:188` — أزرار الإجراءات `opacity-70 group-hover:opacity-100`: التعتيم لا يُرفع عند focus-visible (يبقى 70% لمستخدمي لوحة المفاتيح) — إضافة `group-focus-visible:opacity-100`.

---

## 4) إحصاء وخلاصة

| الشدة | العدد | أبرزها |
|---|---|---|
| حرج | **0** | — |
| عالي | **5** | بقايا عائلة الشفافيات في مسارات المصادقة/المال (H1, H2, H4) + أفاتار hsl (H3) + روابط auth (H5) |
| متوسط | **7** | أخطاء connect صامتة (M1) · aria-pressed غائب (M2) · aria-expanded (M3) · عقد أسهم radio (M4) · نماذج الدفع 3.3.2 (M5) · /60 (M6) · bidi متبقٍ (M7) |
| منخفض | **10** | Space scroll (L1) · role=listitem على زر (L2) · summary غائب (L3) · aria-busy (L4) · alt مكرر (L5) · autocomplete off (L6) · ميت (L7) · smooth scroll (L8) · labels يتيمة (L9) · حالات صامتة (L10) |

**الحكم العام:** الكود ناضج جداً بمعايير WCAG 2.2 AA — الحوارات والقوائم والمعالج والنماذج الكبرى كلها تنفذ الأنماط الصحيحة مع توثيق قرارات في التعليقات. الخروق المتبقية كلها من فئة "أعضاء ناجون" من حملات إصلاح سابقة (شفافيات بأزواج/أسطر لم تُشمّل، أوضاع تفاعل لم تُكشف برمجياً في صفحات أحدث) وليست أنماطاً معيبة منهجياً.

**ترتيب التنفيذ المقترح لموجة E:**
1. **E-D5-1 (ميكانيكي، يغلق H1+H5+M6):** حذف 6 قيم شفافية نصية (`/80` ×4، `/60` ×2) + إزالة opacity-70 من بطاقة الإشعار المقروء (H4) — 7 أسطر، قابلة للبوابة بقياس contrast آلي.
2. **E-D5-2 (H2):** ترويسة نافذة الدفع (نص espresso/أبيض كامل + ضبط التدرّج).
3. **E-D5-3 (H3):** أفاتار المحادثات — إضاءة ثابتة داكنة.
4. **E-D5-4 (دلالة الحالة):** M2+M3+L10 (aria-pressed/aria-expanded/✅ → نص) — دفعة دلالية واحدة.
5. **E-D5-5 (تجميع النماذج):** M1+M5+L9 (role=alert في connect + hint/required في الدفع + labels).
6. **E-D5-6 (L-wave):** الباقي (Space، L2، L3، aria-busy في LoadingState، alt، autocomplete، smooth scroll، dead exports).

**ملاحظات عبر النطاقات:**
- M1 وH2 يقعان في مسار المال (ربط الصفحة → الدفع) — ينسّقان مع أولويات D4 (مساراته نفسها) إن أُدرج wave واحد.
- L6 (مطالبة حفظ التوكن) له بعد أمني خفيف (توكن في مدير كلمات مرور المتصفح) — يُشار مع D6.
- جدول مقارنة الخطط `components/subscribe/plan-comparison.ts` و lib/* خارج نطاقي (D2/D4) — لم أجد في المكونات نفسها أي خرق.
