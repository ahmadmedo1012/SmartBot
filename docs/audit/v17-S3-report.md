# تقرير تنفيذ جولة S3 — صقل الحركة (Motion Polish Round)

**Task ID:** v17-S3 · **النوع:** وكيل تنفيذ واجهة (حركة) · **التاريخ:** 2026 (موجة المالك «التأثيرات»)
**النطاق:** `SmartBot/fb_dashboard/frontend/src` — Next.js 16 + Tailwind v4.3.2، عربي RTL.
**أمر العمل:** `audit-reports/v17-D2-motion.md` (بنود P2 + tubelight P1 المتبقي) — CSS فقط، بلا framer، كل جديد محمي prefers-reduced-motion.

---

## 1) ملخص تنفيذي

| البند (مرجع D2) | الحالة | الملف |
|---|---|---|
| توكنز الحركة `--duration-fast/base/slow` + `--ease-spring` | ✅ منفَّذ | globals.css (توزيع ثنائي: `@theme inline` + `:root`) |
| توحيد dialog 250ms → توكنز (200/300) | ✅ منفَّذ | ui/dialog.tsx:32+59 |
| enter-motion.css: ease-out-quart حرفي → `var(--ease-out-quart)` | ✅ منفَّذ | shared/enter-motion.css:70 |
| **tubelight P1** — حبة التبويب النشط تقفز | ✅ منفَّذ (CSS-only، spring crossfade) | layout/Header.tsx:207-231 |
| كلاس عام `.icon-swap` + استعمال Eye↔EyeOff | ✅ منفَّذ (login + RegisterForm ×2) | globals.css:536-551 |
| not-found.tsx hover معطّل | ✅ منفَّذ (`hover:bg-primary/90`) | app/not-found.tsx:24 |
| duration-250/400 معزولة | ✅ منفَّذ (dialog→توكنز · wizard→`--duration-slow`) | dialog.tsx + OnboardingWizard.tsx:361 |
| switch.tsx توحيد انزلاق RTL | ⚪ لا لزوم — D2 نفسه يصنّفه «النمط الصحيح» (§3.8) | — (بلا تغيير) |

**البوابات:** `tsc --noEmit` ✓ صفر أخطاء · `vitest` 303/304 (الإخفاق الوحيد `AdminSettingsLoadError` من تعديل **موازٍ** لملك S2/F3 — انظر §5) · `next build` ✓ Compiled successfully + 43/43 صفحة ثابتة.

---

## 2) التغييرات التفصيلية

### 2.1 نظام توكنز الحركة (globals.css) — بند D2 §3.2 / توصية #6

أساس التوكنز كان موجودًا للـeasing فقط (`--ease-smooth`, `--ease-out-quart`) — **صفر** توكنز مدة في المشروع كله. أُضيف:

```css
/* @theme inline (بعد --ease-smooth) — يُصدر كلاس ease-spring */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

/* :root (نسخ runtime — inline @theme لا يُصدر custom properties) */
--duration-fast: 200ms;   /* تفاعلات سريعة: تبديل أيقونات، hovers، حقول */
--duration-base: 300ms;   /* أسطح: dialog، sheets، حبّات التنقل */
--duration-slow: 500ms;   /* دخول / كوريغرافيا كبيرة */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

قرارات التصميم:
- **الدرجات الثلاث = درجات Tailwind السائدة فعلًا** في القياس (duration-200 ×28، duration-300 ×37، duration-500 ×20) — لا قيم غريبة عن النظام.
- **سبب ازدواج `@theme inline` + `:root`:** نمط الملف القائم نفسه (توكنز easing السابقة) — `inline` يُصدر utility `ease-spring` بلا runtime var، و`:root` يوفّر var للاستهلاك الخام. Tailwind v4 **لا يملك namespace لـ `--duration-*`** (utility الـduration يستقبل أرقامًا فقط) لذا درجات المدة تعيش في `:root` وتُستهلك عبر `duration-(--duration-*)` (تم التحقق من الترجمة — §4).
- `.motion-icon` (globals.css:554): المنحنى الحرفي `cubic-bezier(0.34,1.56,0.64,1)` → `var(--ease-spring)` — **نفس القيمة حرفيًا** (إغلاق بند D2 P2: «globals.css:514 منحنى خام غير موكن»).
- `.light` لا يتجاوز أيًّا منها (توكنز مستقلة عن السمة، مثل easing).

### 2.2 tubelight الحيّ (Header.tsx:207-231) — **بند P1 المتبقي**

المشكلة (D2 §3.3#1): الحبّة كانت تُركّب/تُفكّ شرطيًا (`{linkActive && <span…>}`) فتنتقل بين الروابط لحظيًا — بديل v6 §D الثابت عن `motion.div layoutId="tubelight"` أفقد الحركة.

الحل المنفَّذ (الخيار الذي باركه أمر العمل «الأبسط: … تتوسع بscale — أي حل أنيق دون JS ثقيل»):

```tsx
<span aria-hidden className={cn(
  "absolute inset-0 -z-10 rounded-full bg-primary shadow-lg",
  "transition-[opacity,scale] duration-(--duration-base) ease-spring",
  linkActive ? "scale-100 opacity-100" : "scale-[0.6] opacity-0"
)} style={{ boxShadow: "… color-mix(in oklch, var(--primary) …)" }} />
```

- الحبّة **مركّبة دائمًا** خلف كل رابط (بلا mount/unmount): الخاملة ترتاح عند `scale-60 opacity-0`، والنشطة تتمدد بمنحنى `--ease-spring` ( overshoot ~1.05) على `--duration-base` — التنقل = تقليص/توهّج متزامن بدل القفز.
- **`transition-[opacity,scale]` تحديدًا** (لا `transform`): في Tailwind v4 يُصدر `scale-*` خاصية `scale` المستقلة — و`transition-[opacity,transform]` الحرفية **لن تحرّكها** (نفس الثقب الذي وقع فيه تعديل TelegramConfigSection الموازي — §6).
- حسم «الحبّة المنزلقة المطلقة الواحدة» (اقتراح D2 الأول): استُبعد لأن `transition-[left,right]` بمواضع الروابط يتطلب **قياس JS** (offset/ResizeObserver) مخالفًا لقيد CSS-only، ويُفقد الحبّة رسمها في SSR. الحل المختار SSR-safe، صفر JS، ومحكوم تلقائيًا بشبكة reduced-motion العامة.
- توهّج v14-E5 (`color-mix` فوق `var(--primary)`) بقيت كما هي حرفيًا.
- **ملاحظة مسار صادقة:** Header يُستورد اليوم في `/` و`/terms` و`/privacy` فقط (rg على HEAD والشجرة الحالية)، ولا يصبح رابط من `/pricing·/demo·/login` نشطًا إلا أثناء انتقال العميل قبل unmount — أي أن الحركة تظهر عمليًا في ومضة التنقل، وتجهيز الآلية يغطي أي إعادة استخدام قادمة للـHeader على تلك المسارات. (التنبيه نفسه كان ينطبق على الكود القديم — اكتشاف، لا كسر.)

### 2.3 `.icon-swap` — كلاس عام (globals.css:536-551) — بند D2 §3.3#7 / توصية #8

تعميم وصفة `tt-icon` (ThemeToggle) إلى عقد قابلة لإعادة الاستخدام:

```css
.icon-swap { display: grid; }
.icon-swap > * { grid-area: 1 / 1; transition: opacity var(--duration-fast) ease, transform var(--duration-base) var(--ease-out-quart); }
.icon-swap[data-active="a"] > :nth-child(2),
.icon-swap[data-active="b"] > :first-child { opacity: 0; transform: rotate(-90deg) scale(0.5); }
@media (prefers-reduced-motion: reduce) { .icon-swap > * { transition: none; } }
```

- العقد: غلاف `.icon-swap` + `data-active="a"|"b"` + أيقونتان — التكديس في خلية grid واحدة يضمن التطابق البكسلي، والأداة `transform` هنا **خاصية CSS خام** (لا utility) فتشتمل عليها transition حرفيًا.
- تحت reduce: تسقط الحركة ويبقى **تبديل الحالة** (opacity/transform تُطبَّق فورًا) — الأيقونة الصحيحة تظهر دائمًا.

استُعمل في المواضع المطلوبة:
| الموضع | قبل | بعد |
|---|---|---|
| login/page.tsx:243-246 | `{showPassword ? <EyeOff/> : <Eye/>}` | `<span class="icon-swap" data-active={showPassword ? "b" : "a"}>` + الأيقونتان متراكبتان |
| RegisterForm.tsx:218-221 (password) | نفس النمط | نفس الحل |
| RegisterForm.tsx:246-249 (confirm) | نفس النمط | نفس الحل (showConfirm) |

`aria-hidden="true"` على الغلاف (الأزرار لديها aria-label عربية) — لا تغيير في سلوك الوصول.

### 2.4 توحيد المدد المعزولة (بند D2 P2 الأخير)

| الموضع | قبل | بعد | المبرر |
|---|---|---|---|
| ui/dialog.tsx:32 (overlay) | `duration-250` | `duration-(--duration-fast)` (200ms) | خلفية تختفي بسرعة |
| ui/dialog.tsx:59 (content) | `duration-250` | `duration-(--duration-base)` (300ms) | السطح يبرز أبطأ — نفس تقسيم bottom-nav sheet (backdrop 0.25s / panel 0.32s) |
| OnboardingWizard.tsx:361 (شريط الخطوات) | `duration-400` | `duration-(--duration-slow)` (500ms) | القيمة المفردة 400 تقع خارج كل سلم؛ امتلاء شريط عريض يليق بالبطيء |

`rg "duration-250|duration-400" src/` بعد التنفيذ = **صفر نتائج**.

### 2.5 not-found.tsx (D2 §3.1#1)

`bg-primary hover:bg-primary` (hover بلا أثر) → `hover:bg-primary/90` — التعتيم الناعم القياسي، `transition-colors` كانت موجودة.

### 2.6 switch.tsx — قرار «لا تغيير»

D2 §3.8 نفسه يصنّف `switch.tsx:50` **«النمط الصحيح»** (انزلاق مقبض RTL-aware: `translate-x-[calc(100%-2px)]` + `rtl:-translate-x-[...]`). أمر العمل «إن لزم» — لم يلزم. تحقّق إضافي: `transition-transform` في v4 تُصدر `transition-property: transform, translate, scale, rotate` فتشمل خاصية `translate` التي يصدرها utility المقبض — يعمل بلا تدخل.

---

## 3) حماية prefers-reduced-motion — تدقيق الجولة

| الإضافة | الحماية |
|---|---|
| توكنز المدة/easing | قيم فقط — لا حركة بذاتها |
| حبّة tubelight | مشمولة بالشبكة العامة (`*` → transition-duration 0.01ms) — تظهر/تختفي فوريًا بحالتها الصحيحة |
| `.icon-swap` | كتلة مخصصة `transition: none` + الشبكة العامة — التبديل يبقى (فوريًا) |
| dialog 200/300 | نفس آلية 250 السابقة (base-ui starting/ending-style) — الشبكة العامة تكفي |
| wizard 500 | كذلك |

---

## 4) التحقق المنفَّذ (أدلة)

1. **ترجمة الكلاسات** (التقطتها قبل الدمج بعينة postcss معقولة + بعد البناء في `.next/static/chunks/3mv5yd-2knzh9.css`):
   - `--duration-fast:.2s · --duration-base:.3s · --duration-slow:.5s` في `:root` ✓
   - `.duration-\(--duration-base\){…transition-duration:var(--duration-base)}` للدرجات الثلاث ✓
   - `.ease-spring{--tw-ease:cubic-bezier(.34,1.56,.64,1);transition-timing-function:…}` ✓
   - `.icon-swap{display:grid}` + القواعد الأربع + كتلة reduce ✓ · `var(--ease-spring)` في `.motion-icon` ✓ · `transition-property:opacity,scale` للحبّة ✓ · `scale:.6` ✓
2. **SSR HTML** (`next start` + curl): `/` تحمل الحبّات الثلاث بالحالة الخاملة الصحيحة (`scale-[0.6] opacity-0` + توكنز الحركة)؛ صفحة 404 تحمل `hover:bg-primary/90`.
3. **متصفح حقيقي (agent-browser)**: `/login` بعد فك بوابة checkingAuth: الزر = `aria-label="إظهار كلمة المرور"`، الغلاف `display:grid data-active="a"`، Eye `opacity:1 transform:none`، EyeOff `opacity:0` + `matrix(0,-0.5,0.5,0,0)` (= rotate(-90°) scale(.5))، transition `opacity,transform / 0.2s, 0.3s`. **بعد النقر:** `data-active="b"`، `type="text"`، الأدوار معكوسة. `/register`: المفتاحان (password + confirm) بالعقد نفسه ✓. لا أخطاء console في الصفحات المفحوصة.
4. **البوابات:** `npx tsc --noEmit` = صفر أخطاء · `npx vitest run --silent` = 39 ملفًا، 303/304 passed · `npm run build` = `✓ Compiled successfully` + `Generating static pages (43/43)`.

---

## 5) الإخفاق الوحيد في vitest — خارج ملكيتي (توثيق للمنسق)

`src/test/AdminSettingsLoadError.test.tsx > "a raw network failure surfaces the fixed Arabic copy"` يفشل: يتوقع `تعذّر تحميل الإعدادات` ويستلم `تعذر الوصول إلى الخادم — تحقق من اتصالك بالإنترنت`.

- **السبب:** تعديل **موازٍ جارٍ** لوكيل آخر (علامته `v17-E-F3` في الـdiff) على `admin/settings/page.tsx` — تحويل الـcatch إلى `setLoadError(...)` بحالة إعادة محاولة داخل الصفحة بدل toast؛ الاختبار لم يُحدَّث بعد على النمط الجديد.
- **براءة ملفاتي:** إخفاق نصّي عربي في ملف لستُ مالكه؛ ملفاتي الثمانية ليس منها ما في سلسلة الاستيراد المؤثرة (أقرب تقاطع: `enter-motion.css` يستورده admin/settings — لكن CSS يُهمَل في jsdom، وتغييري فيه مطابقة قيمة حرفية). اختبارات ملفاتي كلها خضراء (RegisterForm 14/14، OnboardingWizard 14/14، FeaturesUiPages 12/12، ThemeToggle 6/6).
- ملاحظة تشغيلية: أمر البوابة بصيغته (`vitest … | tail -3 && build`) يواصل إلى البناء حتى عند فشل vitest (حالة pipeline = حالة `tail`) — رُصدت وأُبلغ عنها هنا بأمانة بدل اعتبارها خضراء.

---

## 6) ملاحظات للمنسق (خارج ملكيتي — لا تعديل)

1. **`TelegramConfigSection.tsx:82-85`** (تعديل موازٍ v17-E-B2): يستعمل `transition-[opacity,transform]` مع `scale-50 -rotate-90` — في Tailwind v4 هذه utilities تُصدر خاصيتي `scale`/`rotate` المستقلتين، و`transform` وحدها في transition-property **لن تحرّكهما** ⇒ الأرجح أن الـcrossfade لا يعمل هناك فعليًا (يتبدل فورًا). الحل الجاهز: استبدال الغلاف بـ `<span className="icon-swap" data-active={…}>` (كلاس هذه الجولة) — نسخة ولصق من login:243.
2. **بنية أوسع (بند D2 P1 ليس من مهامي):** دخول خيط التذكرة (support:442)، حركة دخول 17 صفحة dashboard، و`scrollIntoView` غير المحمي (messages:147) — كلها ما تزال مفتوحة لأصحابها.
3. توصية مستقبلية: `sb-page-enter` (enter-motion.css:55) وOnboardingWizard:48 يبقيان بمنحنيات خام **متعمدًا** — الملف موثّق «نسخ framer 1:1» وربطهما بتوكن سيكسر عقد التوثيق؛ يُقرر مركزيًا إن أريد.

---

## 7) خلاصة

نظام الحركة يملك الآن **طبقة توكنز مكتملة** (3 مدد + 3 منحنيات موكنة) بأول مستهلكين حقيقيين (dialog + wizard)؛ أبرز فجوة تفاعلية في الصفحة العامة (tubelight) عادت حية بلا بايت JS واحد؛ ونمط تبديل الأيقونات صار **عقدًا معماريًا مشتركًا** (`.icon-swap`) بدل 3 نسخ متفرقة. كل ذلك CSS-only، SSR-safe، محمي reduce-motion، وببوابات خضراء.
