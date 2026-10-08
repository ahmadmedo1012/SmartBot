# خطة SmartBot v9 — الإغلاق العالمي الأعمق (التشخيص بـ6 وكلاء + أدوات مفتوحة المصدر)

التاريخ: 2026-09-06 · الأساس: main @ 72505c3e (v8 مكتملة وممدودة) · الأسلوب: فحص وتشخيص عميق متوازٍ → خطة → تنفيذ موجات متوازية → بوابات → commit واحد

## §0 — ملخص التشخيص (ما وجدناه، بأدلة)

ستة وكلاء متوازيون + بطارية أدوات مفتوحة المصدر (axe-core/Deque · pip-audit · bandit · ruff الكامل · tsc --strict · ESLint):

1. **D1 أدوات OS**: 5 ثغرات HIGH في npm — أخطرها **GHSA-6gpp-xcg3-4w24 (تجاوز middleware مع mono-locale — قابل للتطبيق: عندنا middleware.ts وواجهة أحادية اللغة)** → ترقية next 16.3.4. و**27 مهمة asyncio معلّقة** (RUF006 — GC قد يقتل معالجة الدفعات/البث صامتة). وtsconfig غير strict + 7 أخطاء. وreport_engine.py ميتة تكتب /tmp باسم متوقع.
2. **D2 OWASP API Top 10**: **P1 تسريب عابر للمستأجرين في PDF** (pdf_reports_engine بلا tenant_id إطلاقاً — أسماء معلقين وحملات الآخرين) · **P1 تسريب page access token خام** عبر /api/debug/fb-reply (يصل له admin مستأجر بالتسجيل الذاتي) · P2 BOLA وسوم الصندوق · P2 ذاكرة وكيل AI مشتركة بين المستأجرين (مفاتيح بلا tenant) · **P2 خمسة عشر مساراً تُنفّذ العملية ثم تعيد 500** (ok-shadowing: `ok = await engine…` يحجب دالة ok) · P2 سجلات/تشخيصات عالمية بلا فلتر tenant · P2 2FA كود ميت 0% تغطية · P3 سباقات الدفع + حقن CSV + بقايا pagination.
3. **D3 جودة React/TS**: **P1 تعارض هيدريشن مضمون** (scheduled min= بـ Date.now أثناء الرندر: سيرفر UTC مقابل عميل +02) · P1 فشل صامت يظهر كـ"لا منشورات" · P2 بحث رسائل = طلب HTTP لكل حرف · P2 نقر مزدوج ينشر مرتين (4 صفحات بلا حراسة isPending) · P2 فقدان نص الرد عند فشل الإرسال · 69 `any` · كود [...slug] ميت باستعلام معيب.
4. **D4 نظام التصميم**: **67/154 توكناً ميتاً** (فوق تقدير v8 البالغ ~40 — مع جسور @theme الميتة) · 9 كيفرامات ميتة · 13 صنفاً ميتاً · **استيراد tw-animate-css كامل بلا مستهلك واحد** · ألوان joyride محرفة قابلة للتوكنة (يقبل var()) · 123 موضع text-[9-11px] تنتظر سلم 2xs/3xs.
5. **D5 axe-core حي (40 توليفة: 9 صفحات × ثيم × مقاس + 4 مصادقة)**: **22/36 توليفة عامة نظيفة تماماً وصفر تحذيرات هيدريشن** (إنجاز v8 مؤكد آلياً). المخالفات الإلزامية: (أ) Footer spans «قريباً» aria-label بلا role = aria-prohibited-attr (WCAG A، 36 عقدة) — حكم v8 "زخرفية" فنّدته الأداة؛ (ب) AdminSidebar تسميات أقسام 3.26:1 ( AA يتطلب 4.5)؛ (ج) **رابط التخطي target مفقود في 8/9 صفحات عامة** — خلل وظيفي حقيقي لمستخدمي لوحة المفاتيح.
6. **D6 الخط/SEO/الأداء**: 🔴 **P1 خط الجسم = Times New Roman في الإنتاج** (`--font-cairo` غير معرّف → `var()` بلا fallback تُبطل font-family كلها) — وcairo-arabic.woff2 يُنزّل بالـpreload ثم لا يُستخدم! · P1 og:image مفقودة على 6 مسارات فهرسية (استبدال كائن openGraph بالدمج الضحل) · P2 تعارض مصدري robots.txt + حجب /_next/ · **P2 recharts 344K eager على /dashboard (1299K خام/389K gz — ادعاء v6 "lazy" غير قائم فعلياً)** · P2 joyride eager على 26 مساراً · 5 بقايا إنجليزية · عيوب طباعة عربية (leading h1 1.02).

## المسار A — أمن الباكند (P1 أولاً، كل بند باختبار أو دليل)

| # | البند | الإصلاح |
|---|---|---|
| A1 | PDF عابر للمستأجرين | تمرير tenant_id من reports_routes لكل دوال pdf_reports_engine + where(Model.tenant_id == tid) على كل استعلام (بما فيه top_commenters وcampaign) |
| A2 | تسريب توكن خام | /api/debug/fb-reply: require_platform_admin + تحقق ^\d+$ على conversation_id + عدم إعادة access_token/نص خام |
| A3 | BOLA وسوم الصندوق | assign_tag: تحقق ملكية المحادثة للمستأجر + تعيين tenant_id للـ label · remove_tag: التحقق المزدوج (محادثة + وسم) |
| A4 | ذاكرة الوكيل مشتركة | مفاتيح ai_session/ai_memory بادئة tenant + استعلام بفلتر BotState.tenant_id |
| A5 | 15 مسار 500 | إعادة تسمية المتغير المحلي الحاجب (ok→done) في sequences/broadcasts/calendar/publisher/subscribers_tags + اختبار انحدار لمسارين منها |
| A6 | سجلات عالمية | فلتر tenant في logs_api get_buffer لمسارات stream/realtime/stats وdiagnostics (أو قصر platform-admin) |
| A7 | تفويض وظيفي | PUT /api/brand → platform_admin · marketing إرسال/حذف → require_role(editor) |
| A8 | سباقات الدفع | قيد UNIQUE جزئي (user_id, status='pending') + تعميم UPDATE-RETURNING الذري على مسارات sub_/admin_resolve |
| A9 | حزم متنوعة | ge/le على limit/page في replies/auth · سانيتيزر CSV (بادئة ' للخلايا =,+,-,@) · compare_digest لhub_token · إزالة /api/debug من بادئات الكاش العام · crm فحص تكرار بtenant |
| A10 | 2FA ميت | إزالة twofa.py (0 مستهلك) + توثيق العمود كموقوف في models (بلا migration churn) |
| A11 | 27 مهمة معلّقة | سجل مهام خلفية قياسي: مجموعة _bg_tasks + add_done_callback(discard) — يبدأ بpayments/broadcasts/alerts/runner |
| A12 | ASYNC + نظافة | asyncio.to_thread للقراءات الحاجبة (7 مواضع) · sha256 بدل sha1 (messenger_service) · حذف report_engine.py الميتة + سجلها في _services · حذف get_token_user الميتة في logs_api |
| A13 | اختبارات | test_v9_security.py: عزل PDF (مستأجر B لا يظهر في PDF/محرك A) + عزل وسوم الصندوق + عزل ذاكرة الوكيل + ok-shadowing (استدعاء حقيقي لمسارين) |

## المسار B — صحة الواجهة الوظيفية

| # | البند | الإصلاح |
|---|---|---|
| B1 | هيدريشن scheduled | حساب min في state عبر useEffect (client-only) — يقتل تعارض UTC/+02 |
| B2 | فشل صامت scheduled | isError/error + بطاقة فشل وزر إعادة (نمط posts) |
| B3 | بحث رسائل عاصف | debounce 300ms (state مؤجل قبل queryKey) |
| B4 | نقر مزدوج | حراسة isPending && variables === id على toggle/delete/publish في autoreply/tools/scheduled/posts |
| B5 | فقدان نص الرد | مسح replyText في onSuccess فقط (support) + مسح مفتاح الصف الواحد (comments) |
| B6 | تقويم | month في state client-side + مفتاح يتبع الشهر |
| B7 | providers | QueryClient عبر useState factory (إبطال مشاركة SSR) |
| B8 | كود ميت | حذف PAGE_CONFIG/GenericListView/الاستعلام المعيب من [...slug] (تبقى صفحة 404) |
| B9 | تخطي التركيز | tabIndex={-1} على #page-content في DashboardShell |
| B10 | admin/telegram | ترحيل الجلبات الخام إلى useQuery عبر apiFetch (توحيد الأخطاء) |
| B11 | أخطاء صامتة | markOne onError toast · isError فرع support thread · زر refetch في billing |
| B12 | مفاتيح | key معرفي في قوائم مرتبة (analytics/audience/reports) |

## المسار C — نظام التصميم: القلّم والإغلاق (globals.css فقط + مكونات معزولة)

| # | البند | الإصلاح |
|---|---|---|
| C1 | القلّم الكبير | حذف 48 توكناً ميتاً (confetti×13 · iphone×4 · whatsapp×4 · جسور زجاجية×6 · accent-fg/soft×4 · info/warning-fg×4 · متفرقات×13) + 9 كيفرامات + 13 صنفاً + **استيراد tw-animate-css** + إصلاح تعليق L108 + تحديث design-system.md |
| C2 | قرار مالك موثق | عائلة --c-* غير المستهلكة (18 تعريفاً) ومرساة --z-* (7): تبقى (تكافؤ Smart-Menu/توثيق) — موثق في التقرير |
| C3 | joyride | 6 قيم محرفة → var(--primary/--overlay/--muted-foreground/--font-sans/--radius-sm/md) + color-mix للspotlight |
| C4 | سلم النص المجاهري | --text-2xs (11px) و--text-3xs (10px) مع line-heights في @theme + ترحيل آلي للمواضع الآلية + ترقية الحساسة (input hint/support error/settings) إلى text-xs |
| C5 | انتقال السعر | CSS key-remount (key=annual + animation 0.35s var(--ease-smooth) + reduced-motion guard) — بلا framer (الصفحة framer-free) |
| C6 | إغلاقات لونية | text-pink-500 → text-bloom · أفاتار messages → oklch(0.45 0.13 h) (تباين ثابت) |
| C7 | طباعة | body line-height 1.65→1.75 للعربية |

## المسار D — مخالفات axe الحية (إلزامية: بوابة wcag2 صفر مخالفات)

| # | البند | الإصلاح |
|---|---|---|
| D1 | Footer spans | role="img" على spans قريباً (يفعّل aria-label قانونياً) |
| D2 | تباين AdminSidebar | text-muted-foreground/70 → كاملة (أو /90) على تسميات الأقسام + قياس ≥4.5:1 |
| D3 | رابط التخطي | إضافة id="page-content" لعمود المحتوى في 8 صفحات عامة ناقصة (أو هدف دائم #main-content عبر layout) |
| D4 | إرشادي مُغلّق | alt الشعار غير مكرر · aria-label لزر النسخ في PaymentDialog · إزالة disableLogger المُهمل |

## المسار E — الخط، SEO، الأداء

| # | البند | الإصلاح |
|---|---|---|
| E1 | 🔴 خط الجسم | :root{--font-cairo:"Cairo"} في fonts.css + **إثبات بقياس computed font-family = Cairo** على البناء |
| E2 | og:image | إضافة images+og:url في openGraph لكل layout فرعي عام (pricing/register/demo/subscribe/privacy/terms) |
| E3 | robots | حذف public/robots.txt (مصدر واحد robots.ts) + إزالة /_next/ من disallow + إضافة /onboarding |
| E4 | recharts | dynamic import لغلاف المخططات → لا 344K script في HTML صفحات dashboard |
| E5 | joyride | dynamic import للOnboardingTour (يخرج من حزمة 26 مساراً) |
| E6 | إنجليزية | "Image compress failed"→عربية · webhook×3 → الويبهوك · App Secret → النمط الموحد |
| E7 | RTL | "+n" داخل dir="ltr" (PlanSelector) · سهم admin/settings → ← · text-right→text-start (12) · leading h1 → 1.15 |
| E8 | أوزان ميتة | حذف Noto Sans Arabic (197K) + noto-naskh-latin + cairo-latin-ext من fonts.css وpublic · حذف صنف .ltr |
| E9 | رسائل خام | DefaultError لا يعرض error.message الإنجليزي (نص عربي ثابت+تفصيل بالسجل) · ROLE fallback عربي |

## المسار F — TypeScript صارم

| # | البند | الإصلاح |
|---|---|---|
| F1 | strict: true | إصلاح الـ7 (6 تعليقات إرجاع + تضييق unknown في SubscribeContent) ثم تفعيل strict — بوابة دائمة |
| F2 | طبقة أنواع | src/lib/types.ts للكيانات المتكررة + تحويل أثقل الملفات (messages/comments/broadcast/tools/admin-telegram) من any |

## جدول القبول الإلزامي (بأدلة آلية، لا تصريحات)

| # | المعيار | الدليل |
|---|---|---|
| 1 | next ≥ 16.3.4 وnpm audit صفر HIGH | npm ls next + npm audit |
| 2 | عزل tenant: PDF + وسوم + ذاكرة الوكيل | test_v9_security.py (مستأجر B لا يظهر) |
| 3 | صفر ok-shadowing | اختبار مسارين حقيقيين يعيدان success |
| 4 | RUF006 = 0 | ruff check --select RUF006 = نظيف |
| 5 | tsc --strict = 0 | npx tsc --noEmit |
| 6 | axe بوابة wcag2 = 0 مخالفة | v9-axe-sweep يعاد تشغيله — 40 توليفة |
| 7 | الخط المحسوب = Cairo | قياس Playwright computed font-family |
| 8 | og:image في HTML لكل مسار عام | grep على خرج البناء |
| 9 | recharts lazy | لا script tag لقطعة 344K في HTML الصفحة الرئيسية للوحة |
| 10 | التوكنات الميتة (دفعة أ) = 0 + لا tw-animate | grep في globals.css |
| 11 | gate_all.sh كله أخضر + ruff/pytest | تشغيل كامل |

## آلية التنفيذ

موجة 0 (رئيسي): ترقية next + npm audit fix + strict + إصلاح الـ7 → البناء نظيف.
موجة 1 (4 وكلاء متوازيون، ملفات منفصلة): A (باكند كامل + اختبارات) · B (وظيفي الواجهة) · C (globals.css + joyride + pricing) · D+E (a11y حي + SEO + أداء).
موجة 2 (بعد الموجة 1): ترحيل سلم النص 119 موضعاً + B18 role=list + F2 أنواع.
موجة 3: بوابات كاملة + إعادة axe + لقطات. ثم commit واحد + push (توفير حصة Vercel) + تحقق إنتاج + إبطال التوكنات الثلاثة.
