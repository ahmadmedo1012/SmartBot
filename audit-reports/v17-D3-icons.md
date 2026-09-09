# v17-D3 — تدقيق نظام الأيقونات الكامل (جولة المالك: "الأيقونات")

**الوكيل:** وكيل تشخيص (READ-ONLY — لم يُعدَّل أي كود)
**النطاق:** `fb_dashboard/frontend/src` كاملًا + سكربتات العقد (`gen_icon_set.py`, `check_a11y_labels.ts`, `e2e/v7-icon-evidence.mjs`)
**منهجية:** مسح آلي (Python regex + ripgrep) لكل استيرادات/مواضع lucide-react، تحليل سياقي لكل موضع JSX، تشغيل بوابة a11y، مقارنة مع عقد v7 §2.

---

## 0. الملخص التنفيذي

| المؤشر | القيمة |
|---|---|
| ملفات تستورد lucide-react | **73** (الموجز قال 67 — انزياح +6) |
| أسماء أيقونات فريدة مستوردة | **92** (+ نوعان: `LucideIcon`, `LucideProps`) |
| مواضع عرض lucide (JSX) | **300** + 19 موضع `DirectionalIcon` + 7 مواضع أيقونات متحركة مخصصة + ~6 SVG مضمّنة |
| مكتبات أيقونات أخرى | **لا شيء** (لا react-icons/heroicons/fontawesome/material) — توحيد كامل ✓ |
| بوابة a11y (`node scripts/check_a11y_labels.ts`) | **PASS — 0 مخالفة** (161 ملفًا) |
| **نسبة الاتساق النهائية** | **86%** (التفصيل §9) |

خلاصة: البنية الصحية ممتازة (مكتبة واحدة، بوابة a11y خضراء، عقد الأسهم عبر `DirectionalIcon` محترم في 40/47 موضعًا اتجاهيًا). الثغرات الفعلية: **انشقاق دلالي في أيقونات الحالات** (نجاح: `CheckCircle` مقابل `CheckCircle2`؛ خطأ فارغ: `AlertCircle` في صفحات المستأجر مقابل `AlertTriangle` في صفحات الإدارة؛ تحذير التوست = `Star`!)، **تصادم دلالي** (ترويسة صفحة الرسائل تستخدم `Bell` = أيقونة الإشعارات)، **4 مواضع RTL غير معكوسة** متبقية، واستيرادات ميتة.

---

## 1. الجرد الكامل (الأيقونة | المواضع | السياق)

تصنيف السياقات: **ت** = تنقل، **إ** = إجراء، **ح** = حالة، **ز** = زخرفة/هوية.

### 1.1 الأكثر استخدامًا (≥5 مواضع استيراد)

| الأيقونة | ملفات | السياق | أبرز المواضع (file:line) |
|---|---|---|---|
| RefreshCw | 23 | إ (تحديث/إعادة محاولة) | كل صفحات dashboard التحميلية؛ premium-toast:4 |
| AlertCircle | 21 | ح (خطأ تحميل/فارغ) | comments:88, reports:56, posts:114, ads:59 … (size-12 text-destructive/50)؛ input.tsx:35؛ ChartCard:76 |
| Loader2 | 15 | ح (تحميل) — **24/24 موضعًا مع `animate-spin`** ✓ | admin/telegram/*, connect:145, wizard:13, payment-instructions:13 |
| Bot | 14 | ز + ت (هوية البوت/nav الردود) | AdminSidebar:8, dashboard:5, HeroMockup:11, OptimizedImage:93 (fallback) |
| MessageCircle | 13 | ت (nav الرسائل) + ز | AdminSidebar:8, MobileBottomNav:19, Footer:8, HeroMockup:11 |
| Send | 12 | إ (إرسال) — 18 موضع JSX، **17 معكوسة rtl:-scale-x-100** | messages:378, broadcast:128/167, posts:97/143, admin/settings:378 … |
| Users | 10 | ت (nav الجمهور) + ز | AdminSidebar:8, analytics:6, audience:5 |
| Sparkles | 9 | ز (CTA اشتراك/AI) | AdminSidebar:214, wizard:13, FinalCTASection:4, pricing:82 |
| AlertTriangle | 8 | ح (تحذير) + **خطأ فارغ في admin** | SetupWarnings:124/74, CronHeartbeatCard:61, admin/page:130/231, admin/support:173, telegram/error:24 |
| BarChart3 | 8 | ت (nav التحليلات) | AdminSidebar:8, MobileBottomNav:19, analytics:6 |
| Trash2 | 8 | إ (حذف) — **حصريًا، لا يشاركه X** ✓ | posts:147, scheduled:165, autoreply:203, tools:132/174, Diagnostics:122, BroadcastTargets:82 |
| Activity | 7 | ت (nav سجل النشاطات) | AdminSidebar:8, activity:5, CronHeartbeatCard:4 |
| Star | 7 | ز + **ح (toast "warning" = Star!)** | premium-toast:33, PlanSelector:3, LandingIslands:13, page.tsx:11 |
| CheckCircle2 | 6 | ح (نجاح — النظام "ب") | input.tsx:33, payment-status:88/170, pages:111/133, wizard:558, CronHeartbeat:68, Diagnostics:174 |
| CreditCard | 6 | ت (nav الفواتير) + دفع | AdminSidebar:8, billing:6, PaymentSection:4, notifications:9 |
| Link2 | 6 | إ (ربط) + تحذير إعداد | SetupWarnings:63, connect:5, messages:7, pages:7, HowItWorks:7 |
| MessageSquare | 6 | ت (nav التعليقات) | AdminSidebar:8, comments:8, notifications:9, analytics:6 |
| Plus | 6 | إ (إضافة) | autoreply:8, broadcast:7, marketing:7, tools:7, BroadcastTargets:8, Diagnostics:8 |
| Zap | 6 | ز (طاقة/سرعة) | connect:5, billing:6, pricing:17, FeaturesSection:7 |
| Bell | 5 | ت (nav الإشعارات) + **خرق: ترويسة الرسائل** | AdminSidebar:8, MobileBottomNav:19, **messages:159** ✗, notifications:186, demo:480 |
| CheckCircle | 5 | ح (نجاح — النظام "أ") | premium-toast:28, RegisterForm:174/190/206/229, admin:286, demo:279 |
| TrendingUp | 5 | ز + ترويسة لوحة التحكم | dashboard:148, HeroMockup:11, reports:5, notifications:9, demo:214 |
| XCircle | 5 | ح (رفض/فشل) | RegisterForm:174-229, payment-status:128, pages:111/134, admin:290, Diagnostics:146/154/179 |
| Check | 4 | ح (بند مكتمل) | pricing:262 (strokeWidth=3!), connect:164/193/203/209, HeroMockup:11, motion-icons:3 |
| Clock | 4 | ت (nav المجدول) | AdminSidebar:8, scheduled:7, analytics:6, demo:451 |
| HelpCircle | 4 | ت (nav الدعم) + مساعدة | AdminSidebar:8, support:6, pages:7, [...slug]:21 |
| Shield | 4 | ز (أمان) | connect:5, settings:7, team:5, pricing:17 |
| Smartphone | 4 | إ (محفظة الدفع) | payment/index:36, payment-methods:8, payment-status:11 |
| Target | 4 | ت (nav الإعلانات) | AdminSidebar:8, ads:5, wizard:13 |
| UserPlus | 4 | ت (nav العملاء المتوقعين) | AdminSidebar:8, leads:5, notifications:9, RegisterForm:14 |
| X | 4 | إ (إغلاق/إخفاء فقط — **لا يُستخدم للحذف** ✓) | SetupWarnings:133, Header:110, MobileBottomNav:132, connect:342 |

### 1.2 باقي الأيقونات (≤3 مواضع)

| الأيقونة | السياق | المواضع |
|---|---|---|
| ChevronLeft | ت/كشف | directional-icon:28 (المصدر) + dashboard/support:436/527 (استثناء موثق: مؤشر تمدد) + admin/support:262 (**خام — انظر §5**) |
| ChevronRight | ت | directional-icon:28 + admin/support:274 (**خام**) |
| Eye / EyeOff | إ (إظهار/إخفاء كلمة المرور والرمز) — أزواج متسقة ×3 | login:237, RegisterForm:214/237, TelegramConfig:74 |
| FileText | ت (nav الصفحات) | AdminSidebar:8, pages:7, tools:7 |
| Landmark | إ (تحويل بنكي) | payment-instructions:13, payment-methods:8, admin/settings:318 |
| LogOut | إ (خروج) — معكوس في 2/3 | AdminSidebar:221 ✓, MobileBottomNav:166 ✓, premium-toast:32 ✗ (غير معكوس) |
| Save | إ (حفظ) | admin/settings:307, TelegramConfig:101, premium-toast:36 |
| Settings (+alias `SettingsIcon`) | ت (nav الإعدادات) | AdminSidebar:8, settings:7, demo:491 |
| Calendar | ت (nav تقويم المحتوى) | AdminSidebar:8, landing-data:1 |
| CalendarDays | ت (ترويسة التقويم — انحراف عن Calendar) | calendar:6, scheduled:7 |
| Copy | إ (نسخ) | connect:187, premium-toast:38 |
| Crown | ز (باقة مميزة) | pricing:17, PlanSelector:3 |
| FileBarChart | ت (nav التقارير) | AdminSidebar:8, reports:5 |
| Inbox | ز (صندوق وارد) | dashboard:5, admin/support:5 |
| Info | ح (معلومة) — استخدام وحيد بالصفحات | admin/settings:270 + premium-toast:30 |
| LayoutDashboard | ت (nav لوحة التحكم) | AdminSidebar:8, MobileBottomNav:19 |
| LogIn | إ (دخول) — **غير معكوس في كل مواضعه** ✗ | login:254/256, premium-toast:31 |
| Mail | ز | settings:7, support:6 |
| Megaphone | ت (nav التسويق) | AdminSidebar:8, marketing:7 |
| Newspaper | ت (nav المنشورات) | AdminSidebar:8, posts:7 |
| Radio | ت (nav البث) | AdminSidebar:8, broadcast:7 |
| Stethoscope | ز (تشخيص) | Diagnostics:8, TelegramConfig:8 |
| ToggleLeft / ToggleRight | ح (تفعيل القاعدة) مع aria-pressed ✓ | autoreply:200, tools:7 |
| User | ز (ملف شخصي) | settings:7, team:5 |
| Users2 | ت (nav الفريق) | AdminSidebar:8, team:5 |
| Webhook | ز/إعداد | admin/settings:5, connect:5 |
| Wrench | ت (nav الأدوات) | AdminSidebar:8, tools:7 |
| ArrowLeft / ArrowRight | ت | **حصريان داخل directional-icon.tsx:28** ✓ |
| ArrowUpRight | ت (رابط خارجي) — معكوس ✓ | FeaturesSection:96 (مع تعليق عقد §2.2) |
| BellRing | إ (تعليم الكل كمقروء) | notifications:200 |
| BrainCircuit | ز | HowItWorks:7 |
| Building2 | ز | PlanSelector:3 |
| CheckCheck | ح (مقروء) | notifications:216 |
| ChevronDown | كشف FAQ (group-open:rotate-180 — دوران حالة وليس انعكاس RTL) | FaqSection:30 |
| Flame / Rocket / Smile / Globe / ShieldCheck / LineChart / Share2 | ز | PlanSelector:3 / notifications:9 / analytics:6 / landing-data:14 / landing-data:13 / HowItWorks:7 / landing-data:1 |
| Gift | ز (toast) | premium-toast:34 |
| Headset / LifeBuoy / Ticket / Phone | ز (دعم) | admin/settings:5 / admin:176 / support:6 / support:6 |
| KeyRound / Lock | ز (أمان) | settings:7 |
| Menu | ت (المزيد) | MobileBottomNav:202 |
| MessageSquareReply | ح (تحذير "لا قواعد") | SetupWarnings:96 |
| MessagesSquare | ت (تقارير) | reports:5 |
| Receipt | ز (فواتير) | billing:6 |
| Reply | إ (رد) — معكوس ✓ | comments:152 |
| RotateCcw | إ | admin/settings:5 |
| Search | إ (بحث) | messages:175 |
| Tag | ز | tools:7 |
| UserCheck | ح (تحقق) | Diagnostics:8 |

**استيرادات ميتة (زومبي):** `Smartphone`, `Share2`, `CheckCircle` في `landing-data.ts:1` — مستوردة غير مستخدمة (Share2 لا يستخدم في أي مكان آخر بالمشروع كله).

---

## 2. الاتساق الدلالي: القسم ↔ القائمة الجانبية ↔ ترويسة الصفحة

مصدر القائمة الجانبية: `AdminSidebar.tsx:48-96` (`defaultNavSections` — تُستخدم أيضًا بواسطة MobileBottomNav — **مصدر واحد بلا تكرار** ✓). طلب الموجز عينة 6 أقسام؛ الغطاء هنا كامل (22 قسمًا):

| القسم | أيقونة القائمة الجانبية | أيقونة ترويسة الصفحة | مطابقة؟ |
|---|---|---|---|
| لوحة التحكم | LayoutDashboard | **TrendingUp** (dashboard:148) | ✗ انحراف |
| الرسائل | MessageCircle | **Bell** (messages:159) | ✗ **تصادم مع الإشعارات** |
| التعليقات | MessageSquare | MessageSquare (comments:62) | ✓ |
| المنشورات | Newspaper | Newspaper (posts) | ✓ |
| المجدول | Clock | Clock (scheduled) | ✓ |
| التحليلات | BarChart3 | BarChart3 (analytics) | ✓ |
| الجمهور | Users | Users (audience) | ✓ |
| العملاء المتوقعون | UserPlus | UserPlus (leads) | ✓ |
| الإعلانات | Target | Target (ads) | ✓ |
| البث الجماعي | Radio | Radio (broadcast) | ✓ |
| التسويق | Megaphone | Megaphone (marketing:143) | ✓ |
| التقارير | FileBarChart | FileBarChart (reports) | ✓ |
| الصفحات | FileText | FileText (pages) | ✓ |
| الفريق | Users2 | Users2 (team) | ✓ |
| تقويم المحتوى | Calendar | **CalendarDays** (calendar:6) | ✗ انحراف نسخة |
| الردود التلقائية | Bot | Bot (autoreply:69) | ✓ |
| سجل النشاطات | Activity | Activity (activity) | ✓ |
| الإشعارات | Bell | Bell (notifications:186) | ✓ |
| الأدوات | Wrench | Wrench (tools) | ✓ |
| الفواتير | CreditCard | CreditCard (billing) | ✓ |
| الدعم | HelpCircle | HelpCircle (support) | ✓ |
| الإعدادات | Settings | Settings (settings:64) | ✓ |

**19/22 = 86%.** الثلاث المخالفة:
1. **messages:159 — `Bell` لترويسة "الرسائل"** بينما `Bell` هي أيقونة الإشعارات في القائمة الجانبية (AdminSidebar:89) وترويسة الإشعارات (notifications:186) وMobileBottomNav. المستخدم يرى الجرس نفسه لقسمين مختلفين. الأصح: `MessageCircle` (الاتساق مع القائمة) أو `Inbox` (المتوفر أصلًا في الكود).
2. dashboard:148 — `TrendingUp` بدل `LayoutDashboard`: انحراف مقصود محتمل ("اتجاه الأداء") لكنه غير موثق.
3. calendar:6 — `CalendarDays` بدل `Calendar`: انزياح نسخة بلا مسوغ.

**انقسام بنيوي إضافي (ليس أيقونة لكنه يفسد اتساق الترويسات):** 6 صفحات تستخدم `PageHeader` (أيقونة داخل شريحة `size-8` متدرجة) و16 صفحة تستخدم ترويسة لاصقة مضمّنة (أيقونة داخل صندوق `size-7` باهت) — نفس السياق الوظيفي بوزن بصري مختلف.

**فحوصات إضافية سليمة ✓:**
- الحذف: `Trash2` في 8 ملفات، حصري. الإغلاق/الإخفاء: `X` في 4 مواضع حصرية. **لا تداخل** حذف/إغلاق إطلاقًا.
- الإرسال: `Send` موحدة في 12 ملفًا (لا `MessageSquareSend`/`CornerUpLeft` بديلة).
- التحديث: `RefreshCw` حصرية (لا `RotateCw` متزامن).
- قاعدة كلمات المرور: زوج `Eye`/`EyeOff` متطابق في 3 مواضع.

---

## 3. نظام الحالات الدلالية (success / warning / info / error)

**لا يوجد نظام موحد واحد — يوجد ثلاثة أنظمة فرعية متزايزة:**

| الحالة | النظام "أ" | النظام "ب" | الحكم |
|---|---|---|---|
| **success** | `CheckCircle` — premium-toast:28، RegisterForm×4، admin:286، demo:279 | `CheckCircle2` — input.tsx:33، payment-status×2، pages×2، wizard:558، CronHeartbeat:68، Diagnostics:174 | ✗ **انشقاق كامل** — نفس الدلالة بغليفين مختلفين بصريًا في lucide (دائرة ممتلئة مقابل دائرة كبيرة) |
| **error** | `XCircle` = نتيجة/رفض (RegisterForm، payment:128، admin:290، pages:134، Diagnostics:179) | `AlertCircle` = خطأ تحميل فارغ في **صفحات المستأجر** (19 موضعًا size-12) | `AlertTriangle` = نفس حالة "فشل التحميل الفارغ" في **صفحات الإدارة** (admin:130/231، admin/support:173، telegram/error:24) — ✗ انقسام إداري/مستأجر |
| **warning** | `AlertTriangle` — SetupWarnings:124، input:34، connect، CronHeartbeat | — | ✓ متسقة في الصفحات… **باستثناء `brandedToast.warning()` التي ترسم `Star`** (premium-toast:33 + :99 — مفتاح داخلي "star") ✗ |
| **info** | `Info` — admin/settings:270 + toast info | — | ✓ (نادر لكن متسق) |
| **loading** | `Loader2` + `animate-spin` — 24/24 موضعًا | — | ✓ **مثالي** |
| التحقق من صحة الحقول | RegisterForm: `CheckCircle`/`XCircle` + `role="img"` + aria-label عربي (صالح/غير صالح) | input.tsx: `CheckCircle2`/`AlertTriangle`/`AlertCircle` + aria-hidden | نمطان لنفس سياق "حالة حقل" |

ملاحظة موجزة عن الخطورة: هذه ليست مجرد جماليات — `CheckCircle` و`CheckCircle2` **ليسا متطابقين شكلًا** في lucide (الأول أقدم بالاسم المستعار `CircleCheck`، والثاني `CircleCheckBig`)، فيظهر "النجاح" بشكلين مختلفين على نفس رحلة الدفع (toast النجاح `CheckCircle` مقابل شاشة النجاح `payment-status:88 CheckCircle2`).

**نمط إيجابي:** `EmptyState.tsx` (ui/EmptyState) يقدم API موحدًا (`icon: LucideIcon`) لكن 16 صفحة dashboard لا تستخدمه للترويسات الفارغة بل تكرر النمط يدويًا، و`ErrorState` المدمج فيه (EmptyState:98) يرسم SVG يدويًا مكررًا لـ AlertCircle بدل تمرير الأيقونة (تكرار بلا مسوغ).

---

## 4. الأحجام والسماكات

### 4.1 توزيع رموز الأحجام (مواضع lucide JSX فقط — 300+9)

| الرمز | العدد | أبرز السياق |
|---|---|---|
| `size-4` | 142 (47%) | ترويسات الصفحات (22/22)، عناوين البطاقات، أزرار أساسية، القائمة الجانبية |
| `size-3` | 59 | أزرار صفوف الجداول، إجراءات صغيرة، سطر الحالة |
| `size-3.5` | 30 | أزرار sm، إغلاق SetupWarnings |
| `size-5` | 17 | شريط الجوال السفلي، أيقونة حالة input |
| `size-12` / `size-8` / `size-16` | 15 / 14 / 2 | حالات فارغة/بطولية ( wizard:558 size-16) |
| `size-10` | 4 | status الدفع، Sparkles pricing |
| `size-6` | 8 | KPI، fallback الصور |
| شواذ: `size-2.5`×1 (Sparkles HeroMockup)، `size-4.5`×1 (Bot HeroMockup:52)، `size-7`×1 | 3 | زخرفي landing |

**تناسق السياق الواحد:**

| السياق | الاتساق | الدليل |
|---|---|---|
| عنوان البطاقة (CardTitle + أيقونة) | **100%** — 17/17 موضعًا `size-4 text-accent-foreground` | demo×8, dashboard×2, settings×2, admin/settings×4, dashboard/page:214 |
| ترويسة الصفحة | 100% `size-4` | 22 صفحة |
| عنصر القائمة الجانبية | 100% `size-4` (AdminSidebar:183) | مقابل `size-5` لشريط الجوال (MobileBottomNav:152/189) — تكبير مقصود لمس اللمس ✓ |
| زر رجوع (DirectionalIcon back) | **65%** — انجراف `size-3` (wizard:594) / `size-3.5` (login:181, register:137) / `size-4` (البقية ×11) | نفس السياق بثلاثة أحجام |
| إعادة المحاولة (RefreshCw) | 85% — `size-3` مع `Button size="sm"` (×20)، `size-4` مع زر افتراضي (dashboard:72, admin:205)، **شاذ: `size-3.5` مع زر sm (telegram:252)** | الانحراف الأخير غير مبرر |
| إجراء إرسال (Send) | هرمية منطقية: 4 للأزرار الأساسية، 3/3.5 لصفوف الجدول ✓ | messages:378, broadcast:167 |
| Toast | فريد: `size-[18px]` (premium-toast:46) — خارج هرمية size-* كلها | مقصود للبطاقة المصممة |

### 4.2 صيغة الأحجام

- `size-*` = **308** موضعًا مقابل **9** مواضع `h-N w-N` — **كلها في ملف واحد: `connect/page.tsx`** (145, 164, 261, 284, 288, 292, 342, 366, 377). ملف واحد لم يُهاجر إلى صيغة المشروع.

### 4.3 السماكة (strokeWidth)

- الافتراضي lucide (2) في **299/300** موضع ✓
- **الانحراف الوحيد:** `pricing/page.tsx:262` — `<Check strokeWidth={3}>` (علامة أثقل لقائمة ميزات الأسعار) — انحراف معزول بلا توثيق، لا نظير له.
- الأيقونات المخصصة كلها `strokeWidth=2` افتراضيًا ✓؛ SVG المضمّنة (global-error:37، DefaultError:26، EmptyState:98، ThemeToggle:52/67) = 2 ✓.

---

## 5. RTL الاتجاهية (عقد v7 §2)

`directional-icon.tsx` = المصدر الوحيد؛ **19 موضع استدعاء** كلها تمرر المعنى (`semanticDirection`) لا الغليف ✓:
SetupWarnings:155, FinalCTA:48, PageHeader:85 (chevron مسار)، page.tsx:163, PlanSelector:124, SubscribeContent:128/132, connect:261, demo:128, messages:284 (كل المحادثات)، calendar:76/84 (chevron)، admin:157, admin/settings:300, admin/support:124, login:181, wizard:594/622, RegisterForm:137.

### 5.1 `rtl:-scale-x-100` خارج directional-icon.tsx — **محصور في القائمة المسموحة §2.2:**

| الأيقونة | المواضع | الحالة |
|---|---|---|
| Send | 17 موضعًا (broadcast, marketing, messages, posts, scheduled, support, demo, admin/settings, TelegramConfig, BroadcastTargets) | ✓ معكوس |
| Reply | comments:152 | ✓ معكوس |
| LogOut | AdminSidebar:221, MobileBottomNav:166 | ✓ معكوس |
| ArrowUpRight | FeaturesSection:96 (مع تعليق §2.2) | ✓ معكوس |

**المخالفات (غير معكوسة رغم كونها اتجاهية):**
1. `SetupWarnings.tsx:142` — `Send` تُرسم عبر `<w.icon className="size-4" />` بلا انعكاس (الأيقونة الوحيدة غير المعكوسة من أصل 18 موضع Send).
2. `premium-toast.tsx:31/32` — `LogIn`/`LogOut` داخل رقاقة التوست **بلا انعكاس** (نفس `LogOut` معكوسة في الشريط الجانبي!).
3. `login/page.tsx:254/256` — `LogIn` في زر الإرسال الرئيسي بلا انعكاس.

### 5.2 `rotate-180`

- **صفر** `rtl:rotate-180` متبقية ✓ (الحظر محترم).
- الوحيد الموجود: `FaqSection.tsx:30` — `group-open:rotate-180` على `ChevronDown` = **دوران حالة** (فتح/إغلاق) وليس انعكاس اتجاه قراءة — مشروع، لكنه **اصطلاح مختلف** عن FAQ لوحة التحكم (dashboard/support:527 يستخدم `ChevronLeft` + `-rotate-90` كاستثناء موثق). اصطلاحان لكشف FAQ نفسه.

### 5.3 الأسهم الخام المستوردة مباشرة (خرق §2 ما لم تكن داخل directional-icon.tsx)

| الموضع | الأيقونة | التقييم |
|---|---|---|
| `admin/support/page.ts:262` | `ChevronRight` لزر "السابق" | **خرق عقد** — شيفرون تنقّل دلالي (ترقيم صفحات) خارج المصدر. النتيجة البصرية صحيحة صدفةً (ChevronRight يشير يمينًا = اتجاه "رجوع" في RTL) لكنه يمرر الغليف لا المعنى، وغير مغطى بأدلة v7 e2e |
| `admin/support/page.tsx:274` | `ChevronLeft` لزر "التالي" | مثل السابق |
| `dashboard/support/page.tsx:436` | `ChevronLeft` (مؤشر تمدد تذكرة + `-rotate-90`) | استثناء **موثق** في تعليق v7 §2.2 (سطر 433-435) ✓ |
| `dashboard/support/page.tsx:527` | `ChevronLeft` (كشف FAQ) | استثناء موثق (524-526) ✓ — ومثبت في e2e: "support FAQ disclosure NOT mirrored" |

`ArrowLeft`/`ArrowRight` **محصورتان حصريًا داخل directional-icon.tsx:28** ✓.

**الأدلة السابقة:** `e2e/v7-icon-evidence.mjs` + اللقطات `docs/screenshots/v7-{local,prod}-*.png` (28 لقطة) تغطي: landing CTA، login/register/demo back، wizard prev/next، subscribe back/continue، connect back، messages "كل المحادثات"، admin back، telegram، استثناء FAQ. **الفجوة:** ترقيم صفحات admin/support (الخرق أعلاه) وتوست premium-toast وlogin LogIn غير مغطاة بأدلة.

### 5.4 حصيلة RTL

47 موضعًا اتجاهيًا دلاليًا (19 DirectionalIcon + 18 Send + 3 LogOut + 3 LogIn + 1 Reply + 1 ArrowUpRight + 2 شيفرون خام): **40 متوافقًا مع العقد (85%)**، منها 42 صحيحة بصريًا (89%). 5 مواضع غير معكوسة (SetupWarnings Send، toast LogIn/LogOut، login LogIn×2) + 2 خرق عقد خام.

---

## 6. الأيقونات المخصصة مقابل lucide + a11y

### 6.1 الأيقونات المتحركة الأربع (هوية Smart-Menu المنقولة)

| الملف | المستخدم في | المسوغ | الاتساق البصري مع lucide |
|---|---|---|---|
| `x-icon.tsx` (AnimatedX) | dialog.tsx:8 (إغلاق الحوار)، premium-toast:81 (إغلاق التوست) | حركة رسم X عند hover (CSS `.ai-icon`) — lucide لا يقدمها | viewBox 24 ✓ stroke=2 ✓ round caps ✓ currentColor ✓ aria-hidden ✓ |
| `message-circle-icon.tsx` | FloatingWhatsApp.tsx:3 | رسم المسار عند hover (WhatsApp affordance) | ✓ مطابق |
| `copy-icon.tsx` (AnimatedCopy) | copy-field.tsx:37, payment-instructions | اهتزاز النسخة الأمامية | ✓ مطابق |
| `upload-icon.tsx` (AnimatedUpload) | payment-instructions | طيران السهم | ✓ مطابق |

**الحكم:** المسوغ (حركات draw-on-hover بهوية smart-link.ly المشتركة) **ما زال قائمًا** — لا lucide مكافئ حركي، والغلاف البصري متطابق مع اصطلاحات lucide (24/2/round/currentColor/aria-hidden). إضافة: `MotionCheck` (motion-icons.tsx:52) يغلّف lucide `Check` بحركة CSS — نفس النمط ✓.

**الازدواجية الوحيدة:** `EmptyState:98` يرسم alert-circle يدويًا كـ SVG مضمن (بدل تمرير `AlertCircle` من lucide عبر prop `icon` المتاح!)، وكذلك ThemeToggle (شمس/قمر يدويان) وDefaultError/global-error — SVG مضمّنة مكررة لوظائف lucide موجودة، بلا مسوغ حركي.

### 6.2 a11y

- **بوابة `check_a11y_labels.ts`: PASS — 0 أزرار أيقونية-فقط بلا اسم** (161 ملفًا). أنماط سليمة موثقة: CopyIconButton (title+ariaLabel إلزاميان — copy-field.tsx:20)، MobileBottomNav إغلاق/المزيد، SetupWarnings إخفاء (aria-label سطر 130).
- تغطية `aria-hidden` الصريحة على أيقونات lucide: **32/300 (10.7%)** + 8 مواضع `role="img"` (RegisterForm — أيقونات معلوماتية مشروعة تحمل اسمها بنفسها). الباقي (260) يعتمد على وجود نص في الأب التفاعلي (سليم عمليًا لأن قارئات الشاشة تتخطى SVG بلا دور/اسم، والبوابة تضمن الأزرار الأيقونية) — لكنه **انحراف عن الاصطلاح المعلن** في رأس directional-icon.tsx ("icons are decorative by default (aria-hidden)") الذي لم يُعمم.

---

## 7. الرموز/الإيموجي المستخدمة كأيقونات

| الرمز | الموضع | التقييم |
|---|---|---|
| ✅ | connect:104, 128 (نصوص توست نجاح)، connect:388, 396 (لافتات نجاح) | ✗ إيموجي يكرر دلالة النجاح التي توفرها الأيقونات ونظام التوست أصلًا |
| 💡 | admin/telegram/page.tsx:278 (عنوان "خطوات التفعيل") | ✗ إيموجي في عنوان إداري |
| ✓ / ✗ | OnboardingWizard:433, 444 (نص حالة اختبار الاتصال) | ✗ رموز نصية كحالة نجاح/فشل بدل CheckCircle2/XCircle (واختبار OnboardingWizard.test.tsx:266/288 يثبّتها!) |
| ← (نص) | connect:214, admin/settings:132, 399 (مسار تعليمات "developers.facebook.com ← تطبيقك ← Webhooks") | ✓ مقصود ومقبول — سلسلة قراءة RTL نصية وليست أيقونة |
| → في التعليقات/الاختبارات | ~120 موضعًا | ✓ توثيق فقط، ليس واجهة |
| ✓ ✗ ● ▲ في الواجهة | لا شيء آخر | ✓ نظيف |

---

## 8. المخالفات مرتبة بالأولوية (للجولة العلاجية — لم يُعدّل شيء)

| # | الخطورة | الموضع | المشكلة | الإصلاح المقترح |
|---|---|---|---|---|
| 1 | عالية | premium-toast:28 vs input.tsx:33 (+payment-status, wizard, pages, RegisterForm, admin, demo) | انشقاق نجاح: `CheckCircle` مقابل `CheckCircle2` (شكلان مختلفان على رحلة الدفع نفسها) | توحيد على `CheckCircle2` (الأحدث في lucide) عبر الأنظمة الثلاثة |
| 2 | عالية | messages:159 | ترويسة الرسائل = `Bell` = أيقونة الإشعارات (تصادم قسمين) | استبدال بـ `MessageCircle` (أو `Inbox`) |
| 3 | عالية | premium-toast:33 + :99 | `brandedToast.warning()` يرسم `Star` وليس `AlertTriangle` | تعيين أيقونة تحذير صحيحة |
| 4 | متوسطة | admin/page:130/231, admin/support:173, telegram/error:24 مقابل 19 موضع AlertCircle في صفحات المستأجر | حالة "فشل تحميل فارغ" بأيقونتين مختلفتين حسب المنطقة | توحيد على `AlertCircle` |
| 5 | متوسطة | SetupWarnings:142 (Send)، premium-toast:31/32 (LogIn/LogOut)، login:254/256 (LogIn) | 5 مواضع اتجاهية بلا `rtl:-scale-x-100` | إضافة الانعكاس |
| 6 | متوسطة | admin/support:262/274 | شيفرون ترقيم خام خارج DirectionalIcon (خرق عقد v7 §2 + غير مغطى بأدلة e2e) | التحويل إلى `DirectionalIcon variant="chevron"` + مسبار e2e |
| 7 | متوسطة | connect:104/128/388/396، wizard:433/444، telegram:278 | إيموجي/رموز نصية ✓✗✅💡 بديلة عن نظام الحالات | استبدال بأيقونات lucide |
| 8 | منخفضة | pricing:262 (strokeWidth=3) | السماكة الوحيدة المخالفة في المشروع | توثيق أو إزالة |
| 9 | منخفضة | connect/page.tsx (9 مواضع h-N w-N) | صيغة أحجام غير مهاجرة إلى size-* | تحويل ميكانيكي |
| 10 | منخفضة | dashboard:148 (TrendingUp)، calendar:6 (CalendarDays) | انحراف خريطة ترويسة عن القائمة الجانبية | مواءمة أو توثيق قاعدة |
| 11 | منخفضة | أزرار الرجوع: size-3/3.5/4، telegram:252 (size-3.5) | انجراف أحجام بنفس السياق | تثبيت قاعدة: back=size-4 / sm=3 |
| 12 | منخفضة | landing-data.ts:1 | 3 استيرادات ميتة (Smartphone, Share2, CheckCircle) | حذف |
| 13 | منخفضة | EmptyState:98، ThemeToggle:52/67، DefaultError:26، global-error:37 | SVG يدوية مكررة لوظائف lucide (بلا مسوغ حركي) | استبدال بـ lucide أو توثيق |
| 14 | منخفضة | 6 صفحات PageHeader مقابل 16 ترويسة مضمّنة | بنيتان لترويسة الصفحة نفسها (وزن أيقونة مختلف) | توحيد على PageHeader |
| 15 | منخفضة | autoreply:200, tools:7 | ToggleLeft/Right بدل مكوّن Switch الموجود (ui/switch.tsx) | قرار تصميمي: توحيد |
| 16 | معلوماتي | 260/300 أيقونة بلا aria-hidden صريح | اصطلاح "زخرفي افتراضيًا" المعلن في directional-icon غير معمم (البوابة خضراء عمليًا) | قرار: إما تعميم aria-hidden أو تحديث الاصطلاح |

**ما لا يحتاج إصلاحًا (سليم بنيويًا):** توحيد lucide حصريًا؛ `directional-icon.tsx` كمصدر وحيد مع 19 استدعاء سليمًا؛ `ArrowLeft/ArrowRight` محصوران؛ صفر rtl:rotate-180؛ `Trash2`/`X` منفصلان نظيفًا؛ `Loader2+animate-spin` 24/24؛ عناوين البطاقات 17/17 متطابقة؛ القائمة الجانبية مصدر واحد للملاحة (sidebar+mobile)؛ الأيقونات المتحركة الأربع مسوّغها حي ومتسقة بصريًا؛ بوابة a11y خضراء.

---

## 9. نسبة الاتساق النهائية

| البعد | الوزن | النتيجة | الأساس |
|---|---|---|---|
| توحيد المكتبة (lucide فقط، صفر مكتبات أخرى) | 10 | 100% | مسح شامل |
| خريطة القسم ↔ أيقونة (جانبية ↔ ترويسة) | 15 | 86% | 19/22 قسمًا |
| نظام الحالات الدلالية | 15 | 62% | انشقاق success، انقسام error فارغ، toast warning=Star، loading 100% |
| فصل الإجراءات (حذف/إغلاق/إرسال/تحديث/بحث) | 10 | 100% | Trash2/X/Send/RefreshCw/Search حصريات |
| عقد RTL (v7 §2) | 20 | 85% | 40/47 موضعًا متوافقًا |
| الأحجام حسب السياق | 15 | 78% | بطاقات/ترويسات 100%، رجوع 65%، retry 85%، توست فريد |
| السماكة (strokeWidth) | 5 | 99.7% | 299/300 |
| a11y (بوابة الأسماء) | 10 | 100% | PASS 0/161 |
| **المجموع المرجّح** | **100** | **86%** | |

**86% — نظام صحي البنية (مصدر حقيقة موحد للاتجاه، مكتبة واحدة، بوابة a11y) مع انشقاق دلالي في طبقة الحالات وتسريب RTL محدود قابل للإغلاق كله في موجة إصلاح واحدة صغيرة (16 بندًا، أغلبها سطري).**

---

## 10. ملاحظات على أدوات العقد

- `scripts/gen_icon_set.py` — مولد أيقونات PWA/العلامة من `brand-icon.png` (192/512/180/favicon + maskable). **لا علاقة له بـ lucide** — خط إنتاج سليم، لا إجراء.
- `e2e/v7-icon-evidence.mjs` — عقد الأدلة الحي (هندسة scale عبر getComputedStyle). **الفجوات المكتشفة:** لا يغطي ترقيم admin/support (الخرق §5.3)، ولا أيقونات premium-toast/زر تسجيل الدخول (المواضع غير المعكوسة §5.1) — يوصى بإضافة 3 مسبارات عند الموجة العلاجية.
- `scripts/check_a11y_labels.ts` — شُغّل من `fb_dashboard/frontend`: **PASS** (0 مخالفة / 161 ملفًا).
