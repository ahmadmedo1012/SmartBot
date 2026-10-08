# v17-E-F4 — الأيقونات (ICONS) — تسليم (إعادة محاولة)

**Task ID:** v17-E-F4 (retry) · **الوكيل:** وكيل تنفيذ واجهة · **النطاق:** `fb_dashboard/frontend` · **الأساس:** خطة v17 §E-F4 + `audit-reports/v17-D3-icons.md` (بنود 1/3/5/7/8/12 + قرار §8#4)
**الحالة:** منفَّذ كاملًا — 7/7 مهام · جراحي (أيقوني فقط — صفر منطق) · لا وكلاء فرعيين.

> **سياق إعادة المحاولة:** كان في شجرة العمل تعديل سابق غير مكتمل لمحاولة E-F4 الأولى (ملفات الملكية التسعة معدَّلة دون تقرير/بوابات/سجل). هذه الجولة تحقّقت من كل بند سطرًا-سطرًا، أكملت البنود الأربعة المتبقية (admin:286، demo:279، ✅×4 في connect، 💡 في admin/telegram)، ثم شغّلت البوابات كاملة.

---

## 1) البنود المنفَّذة (كود + دليل file:line)

### T1 — توحيد النجاح: CheckCircle → CheckCircle2 (D3 #1)
الغليف القديم أُحيل للتقاعد في كامل `src/` — `rg "CheckCircle[^2]"` = صفر استيرادات/استخدامات (بقايا التعليقات التوثيقية فقط):

| الملف | الدليل |
|---|---|
| `src/lib/premium-toast.tsx:5,46` | استيراد + `iconConfig.success: { icon: CheckCircle2 }` — توست النجاح = نفس غليف شاشة النجاح (`payment-status.tsx:88/170`) — **رحلة الدفع بغليف نجاح واحد** |
| `src/app/register/RegisterForm.tsx:14,174,190,206,229` | أزواج الحكم ×4: `CheckCircle2 aria-label="صالح" role="img"` + `XCircle aria-label="غير صالح"` (النمط الأصلي محفوظ — الاختبارات `RegisterForm.test.tsx:172-200` تمر) |
| `src/app/admin/page.tsx:5-7,288` | زر «قبول» في موافقات الاشتراكات (امتداد ملكية حصريًا لسطر الأيقونة — عيّنه بند المهمة «admin») — `<CheckCircle2 className="size-4" aria-hidden="true" />` |
| `src/app/demo/page.tsx:17,281` | حالة «نشط» في جدول القواعد → `CheckCircle2 aria-hidden` (سطر الأيقونة فقط — E-F2 كان مالك سطر FAB بالملف نفسه) |
| `src/components/ui/input.tsx:6,33` | كان `CheckCircle2` أصلًا (النظام «ب») — تحقق بلا تغيير |
| `src/app/onboarding/OnboardingWizard.tsx:17,571` | شاشة الإتمام `size-16` — كانت CheckCircle2 أصلًا · `src/components/shared/payment/index.tsx` (المكافئ لمسار `subscribe/payment` — غير موجود في `src/app`) خالٍ من أي CheckCircle/إيموجي — تحقق بلا تغيير |

### T2 — توست التحذير: Star → AlertTriangle (D3 #3)
- `premium-toast.tsx:49` — `warning: { icon: AlertTriangle, bg: "bg-warning/12", color: "var(--warning…)" }` (كان `Star` — غليف تقييم زخرفي يحمل دلالة تحذير كاذبة). `brandedToast.warning()` (:117) يرث تلقائيًا.

### T3 — انعكاسات RTL الخمسة (D3 #5 — آلية `rtl:-scale-x-100` بقائمة السماح §2.2)
| الموضع | الدليل |
|---|---|
| SetupWarnings (Send) | `SetupWarnings.tsx:34-37,91,148` — prop جديد `iconClassName?: string` يمرر `"rtl:-scale-x-100"` لعنصر تليجرام فقط (`<w.icon className={cn("size-4", w.iconClassName)} />`) — 18/18 موضع Send معكوسة الآن |
| login (LogIn ×2) | `login/page.tsx:257,259` — زر الإرسال الرئيسي + حالة التحميل: `rtl:-scale-x-100` |
| توست (LogIn/LogOut) | `premium-toast.tsx:50,51,64` — `flip?: boolean` في التكوين + `cfg.flip && "rtl:-scale-x-100"` في الرقاقة — 3/3 مواضع LogIn وLogOut معكوسة (الشريط الجانبي كان معكوسًا أصلًا) |

### T4 — pricing: حذف strokeWidth (D3 #8)
- `pricing/page.tsx:265` — `<Check strokeWidth={3}>` → `<Check>` (الافتراضي 2). كان الانحراف الوحيد عن السماكة الموحدة في 300 موضع — الآن 100%.

### T5 — landing-data.ts: الاستيرادات الميتة (D3 #12)
- `landing-data.ts:4` — حُذف `Smartphone, Share2, CheckCircle` (غير مستخدمة؛ `Share2` بلا أي استخدام في المشروع كله). tsc يثبت صفر مراجع.

### T6 — الإيموجي/الرموز → أيقونات lucide (D3 #7)
| قبل | بعد | الدليل |
|---|---|---|
| `✓`/`✗` نصية في اختبار اتصال الويزارد | `CheckCircle2`/`XCircle` (نفس زوج RegisterForm) `aria-hidden` + نص عربي نظيف داخل `role="status"` | `OnboardingWizard.tsx:437-441` · الاختبار المثبِّت حُدّث: `OnboardingWizard.test.tsx:265-270,291-296` (يثبت svg + النص) |
| `✅` ×2 في نصوص توست النجاح (connect) | حُذف الإيموجي — رقاقة التوست نفسها ترسم `CheckCircle2` الموحد (لا يمكن تمرير JSX في عنوان نصي؛ D3 نفسه: «إيموجي يكرر دلالة النجاح التي يوفرها نظام التوست أصلًا») | `connect/page.tsx:106,132` |
| `✅` ×2 في لافتات النجاح (connect) | `<CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />` مع `flex justify-center gap-1.5` | `connect/page.tsx:394-397,404-407` |
| `💡` في عنوان «خطوات التفعيل» | `<Info className="size-4 shrink-0" aria-hidden="true" />` (غليف المعلومة الموحد — النمط الوحيد بالصفحات: admin/settings:279) | `admin/telegram/page.tsx:285-290` |

### T7 — AlertCircle vs AlertTriangle (قرار D3 §8#4 حسب السطح)
قرار D3: «فشل تحميل فارغ» يوحَّد على `AlertCircle`؛ التحذير يبقى `AlertTriangle`. أسطحي (ضمن ملكيتي) **مطابقة أصلًا — صفر تغيير مطلوب**:
- `premium-toast.tsx:47,49` — error=`AlertCircle` (توست = سطح حالة مستأجر) · warning=`AlertTriangle` ✓
- `input.tsx:34-35` — warning=`AlertTriangle` · error=`AlertCircle` (نمط «حالة الحقل» بالنظام «ب») ✓
- `SetupWarnings.tsx:130` — يانر تحذير إعداد = `AlertTriangle` ✓ (سياق تحذير صريح، ليس خطأ تحميل)
- انقسام منطقة admin (AlertTriangle في `admin/page.tsx:132` + `admin/support:173` + `admin/telegram/error:24`) **خارج ملكيتي** — بقي كما هو (انظر §4).

---

## 2) البوابات (الأدلة الحرفية)

```
$ cd /home/z/my-project/SmartBot/fb_dashboard/frontend
$ npx tsc --noEmit && npx vitest run --silent 2>&1 | tail -3 && npm run build 2>&1 | rg "Compiled|Generating static|error" | head -3
   Start at  09:42:40
   Duration  70.17s (transform 1.46s, setup 6.73s, import 6.19s, tests 22.38s, environment 25.75s)

✓ Compiled successfully in 9.9s
  Generating static pages using 1 worker (0/43) ...
  Generating static pages using 1 worker (10/43)
```
- `npx tsc --noEmit` — **صفر أخطاء** (exit 0)
- `npx vitest run --silent` — **35 ملفًا / 276 اختبارًا passed** (سلسلة && اكتملت حتى build = خروج 0)
- `npm run build` — **✓ Compiled successfully in 9.9s** + **43/43 صفحة ثابتة** + جدول المسارات كامل
- a11y (المسار الفعلي للسكربت: جذر المستودع `scripts/` مع cwd=frontend):

```
$ node /home/z/my-project/SmartBot/scripts/check_a11y_labels.ts
=== unnamed icon-only interactive controls: 0 ===
PASS a11y gate — all icon-only interactive controls have accessible names (168 files scanned)
```

> ملاحظة بوابة صادقة: `scripts/check_a11y_labels.ts` غير موجود تحت `fb_dashboard/frontend/scripts/` (المسار الحرفي بالتعليمات) — السكربت في `SmartBot/scripts/` ويقرأ `process.cwd()/src`؛ شُغِّل بـ cwd=frontend كما يوثّق رأس السكربت نفسه. مخرج واحد إضافي: إيموجي الواجهة `rg "✅|💡" src/` = صفر في الكود (تعليقات التوثيق فقط).

> ملاحظة رقابة على التذبذب: في تشغيلين متوازيين لوحظ فشل عابر في اختبارات وكلاء آخرين (`useCountUp.test.tsx` — E-F11، و`AdminSettingsLoadError.test.tsx` — E-F3، متقطع تحت الحمل المتوازي) — **بلا أي علاقة بتعديلاتي الأيقونية** (ليست في مخطط استيرادها). التشغيلات المرجعية (3 من 4) والتشغيل النهائي المتسلسل: 276/276 خضراء.

---

## 3) حدود الملكية الموسعة (شفافية كاملة)
1. عدّلت **أسطر الأيقونات فقط** في 4 ملفات خارج قائمة الملكية التسعة، كلها عيّنها بندُ المهمة صراحةً: `admin/page.tsx` (بند 1: «admin») · `connect/page.tsx` (بند 6: «✅×4» — مواضعها الأربعة كلها فيه) · `admin/telegram/page.tsx` (بند 6: «💡») · `demo/page.tsx` (عنوان بند 1: «كل CheckCircle» + قرار D3#1 — تعديل E-F2 بالملف نفسه لم يُمسّ). التغييرات: استيراد + غليف واحد لكل موضع، بأدلة بالجدول أعلاه.
2. `src/app/subscribe/payment/index.tsx` غير موجود؛ المكافئ الفعلي = `src/components/shared/payment/index.tsx` (تفكيك v11-A3 لمكوّن الدفع) — فُحص وخلاه من أي بند D3 (Smartphone:36 غليف محفظة مشروع) — بلا تغيير.

## 4) ملاحظات للمنسّق (خارج ملكيتي — لا إجراء مني)
1. **D3 #4 (انقسام خطأ فارغ):** أسطح admin الثلاثة (`admin/page.tsx:132` «غير مصرّح»، `admin/support:173`، `admin/telegram/error:24`) ما زالت `AlertTriangle` مقابل `AlertCircle` في 19 موضع مستأجر — قرار D3 يوحّد على AlertCircle لكن الملفات مملوكة لـ E-F3/E-F8/غير مسندة؛ بندُ «AlertCircle vs AlertTriangle» عندي تحقّق أسطح (مطابقة) لا تحويل منطقة.
2. **فجوات أدلة e2e (D3 §10):** يوصى بموجة S5 بإضافة 3 مسبارات إلى `v7-icon-evidence.mjs`: توست premium-toast (رقاقة LogIn/LogOut المعكوسة)، زر تسجيل الدخول، وعنصر تليجرام في SetupWarnings.
3. **D3 #2 (messages:159 Bell):** لم يعيّن لي — ترويسة الرسائل ما زالت Bell (ملكية E-F1/موجة لاحقة).
4. **تذبذب الاختبارات:** `useCountUp` (E-F11) فشل حتمي معزول مرتين ثم مرّ — يُستحسن مراجعة السباق في اختبار reduced-motion.

## 5) حصيلة D3 بعد الجولة (بند → حالة)
| بند D3 | الحالة |
|---|---|
| #1 انشقاق نجاح CheckCircle/CheckCircle2 | **مغلق** — غليف واحد (CheckCircle2) في كل src |
| #3 توست warning=Star | **مغلق** — AlertTriangle |
| #5 انعكاسات RTL الخمسة | **مغلق** — 45/47 موضعًا اتجاهيًا متوافقًا (40 أصلي + 5 أُغلقيت هنا)؛ الباقي 2 = شيفرون ترقيم admin/support الخام (خرق عقد ≠ مواضعي — ملكية E-F8 بند 9 بالخطة) |
| #7 إيموجي/رموز ✓✗✅💡 | **مغلق** — صفر إيموجي واجهة |
| #8 strokeWidth=3 | **مغلق** — 300/300 بالسماكة الافتراضية |
| #12 استيرادات ميتة landing-data | **مغلق** |
| #2/#4/#6/#9-11/#13-16 | خارج ملكية E-F4 (انظر §4) |
