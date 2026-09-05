# نظام التصميم الموحّد — SmartBot Design System

> المرجع الوحيد للتوكنز وقواعد التصميم (latest_plan.md المسار D).
> **قاعدة حاكمة:** أي وكيل (بشري أو AI) يضيف لونًا/ظلًا/خطًا خامًا في مكوّن جديد = مخالفة. كل شيء يُعرَّف هنا أولًا.
> **هوية مشتركة (2026-09-05):** التوكنز الجوهرية موحّدة 100% مع Smart-Menu
> (github.com/ahmadmedo1012/Smart-Menu) تحت مظلة smart-link.ly — نفس الألوان
> والمقياس والقيم. أي تعديل على قيمة مشتركة هنا يجب أن يُطبّق في المشروعين معًا.

## 1. المصدر الوحيد للحقيقة

| الملف | الدور |
|-------|-------|
| `fb_dashboard/frontend/src/app/globals.css` | كل التوكنز: الألوان، المسافات، الحركة، الطبقات z-index، الباعثات الخاصة |
| `fb_dashboard/frontend/tailwind…` عبر `@theme inline` | يربط التوكنز بأسماء Tailwind (`bg-card`, `text-accent`…) |

## 2. الألوان الدلالية — متى تستخدم كل واحد

| التوكن | القيمة (OKLCH) | الاستخدام الحصري |
|--------|----------------|-------------------|
| `--accent` | `oklch(0.55 0.19 45)` | **البرتقالي الرسمي الوحيد** — أزرار رئيسية، روابط، تركيز. لا يُشتق منه أي برتقالي مستقل |
| `--destructive` | `oklch(0.6 0.22 25)` | حذف، رفض دفع، أخطاء حرجة |
| `--success` | `oklch(0.62 0.18 145)` | تفعيل اشتراك، نجاح عملية، حالة «متصل» |
| `--warning` | `oklch(0.7 0.16 80)` | انتهاء تجربة، رصيد منخفض، تحذير غير حرج |
| `--info` | `oklch(0.62 0.13 245)` | تلميحات، روابط تعليمية، إشعارات محايدة (نسخة AA على الداكن — موحّدة مع Smart-Menu) |

**قاعدة الاشتقاق:** `--primary`/`--ring`/`--accent-soft` كلها مشتقة من `--accent` في `globals.css` — لا تُضبط مستقلة أبدًا.

**الوضع الفاتح:** يفرض الوضع الفاتح قيمًا أغمق للـ AA على الأبيض (accent = 0.40، success = 0.48،
warning = 0.52، info = 0.48 — نفس مقياس «السطوع المزدوج» في Smart-Menu).

## 3. الباعثات الخاصة المركزية (أُضيفت في المسار D.1)

### 3.1 الكونفيتي `--confetti-*` (13 لونًا)
احتفال متعدد الألوان **بقصد** — لكن القيم تعيش في `globals.css` فقط:
`--confetti-gold, --confetti-gold-bright, --confetti-red, --confetti-coral, --confetti-green, --confetti-teal, --confetti-sky, --confetti-sage, --confetti-violet, --confetti-pink, --confetti-plum, --confetti-orange, --confetti-accent`

المستهلك الوحيد: `components/shared/Confetti.tsx` (يقرأ `var(--confetti-…)`).

### 3.2 ألوان الجهاز `--iphone-*` (4)
نغمات فيزيائية لمحاكاة الآيفون (ليست ألوان ثيم): `--iphone-black, --iphone-titanium, --iphone-natural-titanium, --iphone-screen`. المستهلك: `components/ui/iphone-mockup.tsx`.

## 4. الخطوط — سقف خطّين

| التوكن | العائلة | الاستخدام |
|--------|---------|-----------|
| `--font-sans` / `--font-arabic` | Cairo + Noto Sans Arabic | النصوص والواجهة |
| `--font-heading` | Cairo + Readex Pro | العناوين فقط |
| `--font-mono` | Cairo + Noto Naskh | الأرقام والهواتف والمعرّفات |

**ممنوع** استيراد عائلة خط ثالثة دون تحديث هذا الملف أولًا.

## 5. التباعد والأنصاف

- شبكة Tailwind الافتراضية (مقياس 4px) — `gap-4 = 16px` إلخ. لا قيم `px` خام خارج المكوّنات الأساسية.
- مقياس الأنصاف الموحّد مع Smart-Menu: `--radius-sm/md/lg/xl = 8/12/18/28px`.
  عمليًا: `rounded-lg` للمدخلات، `rounded-xl` للبطاقات، `rounded-full` للأزرار الدائرية والشارات النقطية.
- عناصر اللمس في الشريط الجانبي: `min-h-11` (44px — نفس معيار Smart-Menu).

## 6. الأيقونات — `lucide-react` حصرًا

56 ملفًا تستورده، **صفر** مكتبات أيقونات أخرى (react-icons/heroicons/fontawesome). أي أيقونة جديدة تأتي من `lucide-react` — لا رموز نصية بديلة (✓/✗ كنص) ولا إيموجي.

## 7. RTL والاتجاه

- الوثيقة كلها `dir="rtl"` مع خط عربي.
- **كل حقل إدخال `<Input>` يحمل `dir="auto"`** (بند التدقيق القديم #4 — أُغلق في المسار D.4): الأرقام/البريد تُعرض LTR تلقائيًا، والعربية RTL، دون كسر أي نموذج.
- `text-left` + `font-mono` تبقى للهواتف/المبالغ داخل حقول dir=auto (تلقائي مع الأرقام).

## 8. الاستثناءات الموثَّقة (بوابة المسار D)

نتيجة فحص `grep "bg-white|text-black|bg-black"` — **أربعة مواضع فقط**، كلها مشروعة:

| الملف | السطر | السبب |
|-------|-------|-------|
| `components/ui/switch.tsx:32` | `bg-white` | مقبض مفتاح التبديل (shadcn primitive) — العنصر الأبيض على مسار ملون هو نمط المفتاح القياسي |
| `dashboard/notifications/page.tsx:318` | `bg-white` | مقبض مفتاح تفضيلات — نفس النمط أعلاه (مكوّن مخصص) |
| `demo/page.tsx:57` | `bg-black/40` | حجاب (scrim) لإغلاق القائمة الجانبية على الجوال — وظيفي، لا دلالي |
| `components/layout/MobileBottomNav.tsx:56` | `bg-black/40` | حجاب لوحة الجوال السفلية — نفس النمط الوظيفي أعلاه |

**قاعدة البوابة:** أي `bg-white/bg-black/text-[#…]` جديد خارج هذا الجدول يُرفض في المراجعة. الفحص:
```bash
grep -rn "bg-white\|text-black\|bg-black\|text-\[#\|bg-\[#" fb_dashboard/frontend/src/app/ fb_dashboard/frontend/src/components/ --include="*.tsx" | grep -v "dark:"
# المتوقع: 3 أسطر فقط — كلها في هذا الجدول
```

## 9. الحركة والطبقات

- منحنيات الحركة: `--ease-out-expo` (افتراضي للدخول)، `--ease-smooth`، `--ease-in-out-quart` — لا `ease-in-out` الخام.
- المدد: `--duration-fast/base/slow` (0.2s/0.4s/0.7s).
- z-index هرمي مثبّت: dropdown(10) < sticky(20) < nav(30) < modal-backdrop(40) < modal(50) < toast(60) < tooltip(70).

## 9.5 منظومة السَّعفَر/الجمر (2026-09-05 — نقل حرفي من Smart-Menu)

التوكنز الدافئة المنقولة حرفيًا من Smart-Menu (`--c-*`) — تُستخدم في تدرّج اللهب
وحوافّ بطاقات الخطط، ولا يُسمح بإعادة تعريفها في مكان آخر:

| التوكن | القيمة (داكن) | الدور الحصري |
|--------|----------------|----------------|
| `--c-ember` | `oklch(0.44 0.17 52)` | عمق اللهب — بداية تدرّج `flame` وعُقد معالج الاشتراك |
| `--c-saffron` | `oklch(0.78 0.14 70)` | وهج العنبر — نهاية التدرّج (`--c-saffron` لا يتغير بين الوضعين) |
| `--c-espresso` | `#1a130b` | قهوة عميقة — النص الأمامي على أسطح اللهب/العنبر |
| `--c-bloom` | `oklch(0.56 0.2 16)` | حرارة وردية — تدرّجات بطاقات Pro/Enterprise |
| `--image-shimmer` | `oklch(0.2 0 0 / 0.15)` | مسح الوميض في `OptimizedImage` |

الوضع الفاتح يعيد تعريف `--c-ember` إلى `oklch(0.5 0.15 52)` فقط (نفس سلوك
Smart-Menu). أداة `Button` تكتسب الصيغة `flame`:
`bg-[linear-gradient(135deg,var(--c-ember),var(--c-saffron))] text-espresso`.

### مكوّنات الدفع المشتركة (نقل معماري من Smart-Menu)

هذه الملفات منقولة حرفيًا (مع تكييف عقود الـ API فقط) ويجب أن تبقى متطابقة
الشكل بين المشروعين:

- `components/shared/PaymentDialog.tsx` — نافذة الدفع (ترويسة برتقالية متدرجة،
  تبويبات المزوّد الثلاثة، بطاقة USSD، أقسام البنك، رفع الإيصال، شاشات الانتظار/القبول/الرفض)
- `app/subscribe/PlanSelector.tsx` + `StepIndicator.tsx` + `PaymentSection.tsx`
  — معمارية معالج الاشتراك (فُقاعة الاختيار، شارة اللهب، عقد مرقّمة)
- `components/ui/dialog.tsx` (Base UI)، `OptimizedImage.tsx`، `motion-icons.tsx`،
  `x-icon.tsx`، `lib/premium-toast.tsx`، `lib/arabic-plural.ts`، `hooks/useConfig.ts`
- مزوّدو SmartBot: `liyana | madar | bank` (عقد الخادم) — مقابل
  `libyana | madar | bank` في Smart-Menu؛ الجِلب الاتصالي USSD متطابق.

## 10. قائمة رفض أنماط «AI النمطية» (مستلهمة scroll-craft)

ممنوع في أي صفحة جديدة:
1. شبكات بطاقات-ميزات متطابقة تمامًا (3 أعمدة × نفس البطاقة).
2. عدادات زخرفية `01/06` على الأقسام.
3. إشارات تمرير/scroll زخرفية بلا وظيفة.
4. تدرجات بنفسجية-زرقاء نمطية «AI».
5. لوحة «حرفي» بني-كريمي مستهلكة.
6. أي رسم بياني يدوي بـ `<div style={{height}}>` — استخدم `recharts` (المسار E.5).
