# SmartBot Z-Index Scale — الرسمي الوحيد (r127-F5b · canonical ladder)

> المصدر: مقياس مدارك القانوني (`--z-*` tokens في `globals.css`، tokens.css §3a) —
> نفس السلم الذي شحنته Smart-Menu وSmart-Order في r126. هذا الملف هو المرجع
> الملزم لأي طبقة جديدة.

## السلم الرسمي (من `globals.css` — الطبقات)

| الرتبة | التوكن | القيمة | الاستخدام الحصري |
|---|---|---|---|
| base | `--z-base` | `0` | المحتوى العادي |
| dropdown | `--z-dropdown` | `100` | كروم التطبيق اللاصق: الرؤوس العلوية (Header/PageHeader/pricing/demo)، الشريط الجانبي الثابت، شريط التنقل السفلي للجوال، رقاقة الزاوية في login/register/connect |
| popover | `--z-popover` | `200` | بطاقات منبثقة مرتكزة (بطاقة تلميح الجوال في OnboardingTour) |
| tooltip | `--z-tooltip` | `250` | جولة react-joyride (tooltip + overlay عبر `styles.options.zIndex`) |
| sheet | `--z-sheet` | `300` | أدراج الجوال: خلفية + لوحة معًا (قائمة Header للجوال، درج «المزيد» في MobileBottomNav) |
| modal | `--z-modal` | `400` | Dialog (الخلفية والسطح معًا)، Overlays كاملة الشاشة (OnboardingWizard، صفحات الدفع) |
| toast | `--z-toast` | `500` | Toaster (sonner — مثبّت CSS `var(--z-toast) !important`)، زر واتساب العائم، رابط «تخطَّ إلى المحتوى» عند التركيز |
| lightbox | `--z-lightbox` | `600` | عارض الصور/الوسائط (محجوز — لا مستهلك بعد) |

**الترتيب الملزم:** dropdown < popover < tooltip < sheet < modal < toast < lightbox —
قائمة منسدلة تحت أي نافذة، توست فوق كل نافذة. الاستهلاك عبر أدوات
`z-(--z-*)` حصريًا (Tailwind v4).

## تدقيق الاستخدام بعد هجرة r127-F5b (مسح `grep` كامل)

| القيمة القديمة | الرتبة الجديدة | المواضع |
|---|---|---|
| `z-10` / `z-0` (محلي) | — تبقى رقمية محلية | رؤوس فرعية داخل البطاقات، طبقات زخرفية، أشرطة التقدم العلوية في login/register/connect، بطاقة الدخول |
| `z-20` (sticky محلي) | — تبقى رقمية محلية | شريط التحذير اللاصق في messages (تحت PageHeader على رتبة 100 — الترتيب محفوظ) |
| `z-30` (كروم) | `z-(--z-dropdown)` | Header topbar، PageHeader، رأس pricing، DemoHeader + درج demo الجانبي، AdminSidebar (DashboardShell + demo)، MobileBottomNav، AdminMobileNav |
| `z-40`/`z-50` (أدراج) | `z-(--z-sheet)` | قائمة Header للجوال (خلفية+لوحة)، درج «المزيد» في MobileBottomNav (خلفية+لوحة) |
| `z-50` (نوافذ) | `z-(--z-modal)` | Dialog (خلفية+سطح)، OnboardingWizard |
| `z-40` (تلميح الجوال) | `z-(--z-popover)` | بطاقة OnboardingTour للجوال |
| `z-[60]` (FAB) | `z-(--z-toast)` | FloatingWhatsApp (يبقى فوق النوافذ ويختفي أثناء أي dialog مفتوح — نفس القرار) |
| `z-[100]` (skip-link) | `z-(--z-toast)` | رابط تخطي المحتوى في layout.tsx (نمط Smart-Order/Menu حرفيًا) |
| joyride افتراضي 145 | `var(--z-tooltip)` | OnboardingTour desktop |
| sonner افتراضي | `var(--z-toast)` | مثبت CSS في globals.css |

**النتيجة: صفر قيم شاردة، صفر طبقات خارج السلم** — كل overlay على رتبة
قانونية، وكل قيمة رقمية متبقية محلية داخل سياق تكديس مغلق (نفس قرار
Smart-Order في r126).

## قواعد ملزمة لأي إضافة جديدة

1. **ممنوع** كتابة `z-[<رقم عشوائي>]` أو `z-50`/`z-40`… لطبقات عامة — استخدم
   `z-(--z-*)` من السلم أعلاه فقط. الأرقام المحلية (`z-10`/`z-20` داخل بطاقة)
   مسموحة للتكديس المحلي المغلق فقط.
2. Modal/overlay كامل الشاشة جديد → `z-(--z-modal)`. درج جوال → `z-(--z-sheet)`.
   رأس صفحة لاصق → `z-(--z-dropdown)`.
3. أي عنصر `fixed bottom-0` يجب أن يقابله `padding-bottom` في المحتوى تحته
   (DashboardShell يطبق `pb-16 md:pb-0` لكل صفحات اللوحة — تحقق يدويًا عند
   إضافة شريط سفلي جديد خارجها).
4. الحاويات التي قد تستقبل نصًا طويلًا (أسماء عملاء/عناوين عربية) تعتمد
   `truncate` أو `overflow-hidden` — راجع قاعدة التداخل الثالثة في الخطة.

## حواف حقيقية تمت مراجعتها (لا تحتاج تعديلًا)

- **AdminSidebar يضع `border-l` (فيزيائي) وهو مثبت يمينًا**: الفاصل يظهر عند حد
  المحتوى — وهو الموضع الصحيح بصريًا. (Smart-Menu يستخدم `border-s` المنطقي مع
  شريطه داخل التدفق — النية نفسها، بنية DOM مختلفة؛ كلاهما يعرض الفاصل عند
  حدّ المحتوى الخاص بتخطيطه.)
- **MobileBottomNav (dropdown 100) تحت Dialog (modal 400)**: النقر على أي زر
  في الشريط أثناء فتح Dialog مستحيل بصريًا — الترتيب صحيح، أعلى مما كان
  (30 تحت 50) بنفس العلاقة.
- **FloatingWhatsApp (toast 500) فوق شريط التنقل (dropdown 100)**: عائم بغرض
  الوصول السريع، ويختفي فوق أي dialog مفتوح (useModalDialogOpen) — نفس قرار
  التصميم، رتبة قانونية الآن.
- **joyride (tooltip 250) فوق الكروم (100) وتحت الأدراج (300)**: الجولة تُغلق
  قبل فتح أي درج — لا تعارض.
