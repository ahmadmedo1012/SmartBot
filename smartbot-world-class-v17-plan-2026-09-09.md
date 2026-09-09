# خطة v17 — جولة تجربة المستخدم والتأثيرات والأيقونات والشكل الكامل + كل الوظائف بلا استثناء

> **التاريخ:** 2026-09-09 · **الأساس:** main @ 1338038c (v16 مكتملة — 103/103 بعد النشر) · **الطلب:** الجولة القادمة أعمق، تركيز كامل على: تجربة المستخدم · التأثيرات الحركية · الأيقونات · الشكل الكامل · كل الوظائف والخصائص بلا أي استثناء ليكون المشروع جاهزًا بشكل كامل.
> **البنية:** 11 وكيل تشخيص متوازٍ (D1-D11، مكتملة — التقارير في `audit-reports/v17-D*.md`) + **موجة تنفيذ أولى: 12 وكيلًا متوازيًا** (E-B1..E-B3 خلفية/كامل-المكدس + E-F1..E-F9 واجهة بملكية ملفات صارمة) + **موجة ثانية: 5 كنس عبر-الملفات** (S1-S5 بعد دمج الموجة الأولى) + منسّق (دمج + بوابات + بطاريات + دفع واحد + أدلة حية + توثيق).

---

## 0) الحصيلة التشخيصية (11 تقريرًا — 2,582 سطر أدلة)

| المحور | أبرز النتائج |
|---|---|
| **D1 حالات UX (38 صفحة)** | 31 كاملة (82%) · **P1: خيط المحادثة في messages يعرض «لا رسائل» عند فشل التحميل** (خطأ متنكر كفراغ) · P2: admin/settings فشل تحميل = toast عابر + نموذج فارغ · P2: notifications/support أخطاء بلا زر إعادة محاولة · P3: KPIs في analytics/audience تعرض «—» بدل سكلتون · P3: أزرار إنشاء بـ disabled فقط بلا «جارٍ…» (posts/scheduled/tools) |
| **D2 التأثيرات** | الأساس ممتاز (framer-free، reduced-motion عام) لكن **التطبيق انتقائي**: P1×4 — حبة التبويب النشط في Header تقفز (بديل layoutId بلا انزلاق) · خيط تذكرة support يقفز بلا حركة · **17 من 23 صفحة dashboard بلا أي حركة دخول** · smooth-scroll برمجي غير محمي reduced-motion · P2: لا توكنز `--duration-*` · count-up بتنفيذين · تبديل Eye/Toggle فوري · حذف بلا خروج متحرك |
| **D3 الأيقونات (اتساق 86%)** | lucide حصريًا ✓ · DirectionalIcon مُحترم ✓ · صفر rotate-180 ✓ · **انشقاق CheckCircle/CheckCircle2** (رحلة الدفع!) · **Bell تصادم قسمين** (رسائل=إشعارات) · **توست تحذير يرسم Star** · 5 انعكاسات RTL مفقودة (Send/LogIn/LogOut) · ترقيم admin/support بشيفرون خام خارج العقد · strokeWidth=3 وحيدة في pricing · 3 استيرادات ميتة |
| **D4 الشكل البصري (اكتمال 76%)** | **15 هيدرًا يدويًا مقابل PageHeader مؤسسي (5 فقط)** · سقف عرض غير موحد (dashboard=1220px، settings=3xl، 20 صفحة بلا سقف) · **وصفة بطاقة رباعية** (radius 2xl/xl/md/lg + padding 16/20/24) · `to-white` خام في PaymentSection:34 · بوابة §8 متقادمة (لا تغطي text-white ×17) · z-index 100% ✓ · الظلال نصف معايرة |
| **D5 التحكمات الميتة** | **P0: زر «حفظ قالب» في tools يفشل 422 دائمًا** (واجهة ترسل JSON والخادم يعلن Form — لا يمكن إنشاء قالب إطلاقًا) · P1: مفاتيح admin/telegram وهمية (تُرسل ولا تُقرأ) · P1: تفضيلات notifications تُحفظ ولا يستهلكها أحد (نص يعد «تُطبق على جميع المنصات») · P2: team قراءة-فقط خلف CRUD جاهز · صفر onClick فارغ/href="#" ✓ · catch-all مصمم ✓ |
| **D6 الفجوة الوظيفية (240 endpoint)** | **90 فقط بمستهلك واجهة (37%)** · ميزات مدفوعة موعودة بلا سطح: **التسلسلية (محرك حي منذ v16 — لا يمكن إنشاء حملة!)** · العروض (يمكن حذف لا إنشاء) · PDF (محرك 606 سطر بلا زر) · فريق CRUD · ترقية الخطة · 9 أعلام خطة زخرفية · قائمة 13 ميزة مرتبة بالكلفة |
| **D7 الجوال (اكتمال 71%)** | **P0×3: ~15 حقلًا <16px → iOS يكبّر عند كل تركيز** · **/admin/* بلا أي تنقل جوال** · viewportFit:cover غائب (safe-area كله no-op) · P1: FloatingWhatsApp يغطي زر «المزيد» في /demo · ~19 هدف لمس <40px · قفز scroll كل 10s في messages · نقاط قوة: MobileBottomNav موجود ومختبر ✓ · Button يفرض 44px ✓ |
| **D8 فحص حي (12 لقطة)** | صفر overflow أفقي ✓ · صفر pageErrors ✓ · **P0: /subscribe يطرد المجهول إلى login** (apiFetch /api/me بلا skipAuthRedirect يفعّل معالج 401 — يناقض تعليق التصميم في نفس الملف) · P2: SpeedInsights 404 على النشر الذاتي (بلا بوابة VERCEL) |
| **D9 النصوص العربية** | البنية ممتازة (countPhrase ×32، بوابة أرقام نظيفة) لكن: **«خطة/باقة» لنفس المفهوم في مسار المال نفسه** · **تسريب إنجليزي حي: «Failed to fetch»** (~20 معالج e.message) + str(e) من الباك-إند في مسارين · fan_count بأربعة مسميات · «إشعار/تنبيه» في صفحة واحدة · N غير مقروءة خام (dashboard:174) |
| **D10 تفاعلات البيانات** | **الجذر: كل الصفحات تعرض الصفحة الأولى فقط** (4 endpoints تدعم page وترجع total يُهمل) · **messages: لا يوجد mark-read أصلاً → unread يكذب** · scroll يقفز أثناء القراءة · **مسودة الرد تتسرب بين المحادثات** (خطر إرسال رد لعميل خاطئ) · 0/9 ترتيب/صفحات/جماعي/URL-state · طاقة خادمية معطلة (إخفاء تعليق، وسم محادثات، أدوار فريق) |
| **D11 منهجية gstack** | الطبقة الرابعة غير المستوردة: **G1 ماسح AI-slop للواجهة** (قواعد design-checklist تتقاطع حرفيًا مع إيجادات D2/D4) · G2 design-baseline.json رقمي · G3 مسبار المصيَّر≠الموثَّق · G4 أساس بصري 3 مقاسات · G5 بروتوكول UX نصي |

**الحرجات المفتوحة على main الآن (تُغلق هذه الجولة):** قالب لا يمكن إنشاؤه (422) · /subscribe يطرد المجهول (SEO) · حقل iOS يكبّر · admin بلا تنقل جوال · تفضيلات إشعارات كاذبة · ميزة مدفوعة (تسلسلية) بلا أي واجهة · unread يكذب · مسودة تتسرب بين العملاء.

---

## 1) خريطة الملكية الصارمة — الموجة الأولى (12 وكيلًا متوازين)

> قاعدة حاكمة: **لا يعدّل وكيل ملفًا خارج قائمته**. التعارض المكتشف يُرفع للمنسّق. كل بند بدليل file:line من تقرير D المقابل (تم تحقق المنسّق من الأدلة الحاسمة بنفسه).

### E-B1 — خلفية: القالب والمحادثة (BACKEND-INBOX) · sonnet
**ملفاته:** `fb_dashboard/routers/templates_routes.py` · `fb_dashboard/routers/inbox.py` · `tests/test_v17_inbox_templates.py` (جديد)
**المهام:**
1. **إصلاح 422 القالب (D5-F1):** `create_template` يقبل **JSON (نموذج Pydantic `TemplateCreate`) + Form معًا** (توافق خلفي) — العميل يرسل JSON فعليًا (`tools/page.tsx:42-49`) فالإصلاح الجذري هنا. نفس المعاملة لـ PUT إن لزم. اختبار: إنشاء عبر JSON + عبر Form كلاهما ok().
2. **mark-read (D10-2):** `POST /api/inbox/conversations/{id}/read` — يصفّر unread للمحادثة + يعيد ok({"unread": total_after}) — اختبارات: صفّر فعلي + 404 لمحادثة غير موجودة + عزل مستأجر.

### E-B2 — كامل-المكدس: تليجرام صادق + حد الفريق (FULLSTACK-TELEGRAM-TEAM) · sonnet
**ملفاته:** `fb_dashboard/routers/telegram_config.py` · `fb_dashboard/routers/users.py` · `src/app/admin/telegram/page.tsx` · `tests/test_v17_telegram_users.py` (جديد)
**المهام:**
1. **المفاتيح الوهمية (D5-F2):** GET يقرأ القيم الفعلية المدومة (events_enabled/notify_* حسب الأعمدة الفعلية — افحص النموذج أولًا) بدل hardcoded، POST يدمجها في الحفظ — المفاتيح لا «تعود» بعد التحديث. اختبار: حفظ ثم قراءة = نفس القيمة.
2. **admin/telegram/page.tsx:** ربط القيم الفعلية + crossfade أيقونة العين (نمط D2 tt-icon) عند kشف/إخفاء التوكن.
3. **حد الفريق (D6):** POST /api/users يرفض بـ403 عربي «حد أعضاء الفريق لخطتك N» عند بلوغ max_team (اقرأ خطة المستأجر) — يغلق علمًا زخرفيًا من التسعة. اختبارات: فوق الحد 403 + داخله ينجح.
4. **قرار الدور:** POST يرفض ترقية عضو لدور admin (فقط owner/admin للمنصة — راجع users.py الحالي واحترم حارسه إن موجود).

### E-B3 — خلفية: صدق النصوص والتفضيلات (BACKEND-TRUTH-COPY) · sonnet
**ملفاته:** `fb_dashboard/routers/facebook_routes.py` · `fb_dashboard/routers/onboarding.py` · ملف محرك الإشعارات (حدده بالبحث: rg "def push_notification" fb_dashboard/) · `tests/test_v17_backend_truth.py` (جديد)
**المهام:**
1. **إزالة str(e) (D9):** facebook_routes.py:202,274 + onboarding.py:225 — استبدال برسائل عربية ثابتة مصممة (احتفظ بالتفاصيل التقنية في log.warning وليس في detail).
2. **مستهلك التفضيلات (D5-F3):** push_notification يستشعل NotificationPreference للمستخدم (استثناء من يوقف النوع) — إن تعذر لعزل المستأجر، وثّق السبب في تقريرك بديل صادق (نص الصفحة يُصحح في S2). اختبار: مستخدم كتفضيله off لا يستلم.

### E-F1 — صفحة الرسائل شاملة (MESSAGES-PAGE) · sonnet
**ملفاته:** `src/app/dashboard/messages/page.tsx` · `src/test/MessagesPage.test.tsx` (إن رخيص)
**المهام (كلها D1/D7/D10):**
1. **فرع خطأ الخيط (P1):** فك isError من استعلام الخيط + بطاقة «تعذر تحميل الرسائل» + زر إعادة محاولة (نمط مرآة support:449-455).
2. **mark-read متفائل:** عند فتح المحادثة (selectedId يتغير): استدعاء POST read (عقد E-B1) + تحديث كاش unread في القائمة optimistic.
3. **سلوك scroll (P1):** scrollToBottom فقط عند: أول تحميل للخيار، إرسال رد، أو زيادة طول الرسائل **والمستخدم قرب الأسفل** (≈150px) — لا قفز أثناء قراءة التاريخ.
4. **عزل المسودة (خطر مالي):** replyText لكل محادثة (خريطة keyed بselectedId — يُمسح عند التبديل أو يُحفظ لكل محادثة) — لا تسريب رد بين عملاء.
5. **حقل الرد ≥16px:** التحويل لمكوّن Textarea المشترك أو `text-base md:text-sm` (D7-P0 جزء).
6. **smooth-scroll محمي:** `behavior` حسب prefers-reduced-motion (نمط موجود سابع).
7. **أيقونة القسم:** Bell → أيقونة غير متصادمة مع الإشعارات (مثل MessagesSquare أو Inbox من lucide — متسقة مع D3) — يغلق تصادم القسمين.

### E-F2 — القشرة والجوال والصفحات العامة (SHELL-MOBILE-PUBLIC) · sonnet
**ملفاته:** `src/app/layout.tsx` · `src/app/subscribe/SubscribeContent.tsx` · `src/app/dashboard/DashboardShell.tsx` · `src/app/admin/layout.tsx` · `src/components/layout/AdminMobileNav.tsx` (جديد) · `src/app/demo/page.tsx` · `src/components/layout/MobileBottomNav.tsx`
**المهام:**
1. **/subscribe للمجهولين (D8-G1 — P0):** apiFetch("/api/me") بـ skipAuthRedirect (أو استدعاء لا يمر بمعالج 401) — الزائر يرى الخطط، المصادقة عند الدفع فقط (يحقق تعليق التصميم في الملف نفسه).
2. **viewportFit (D7-P0):** viewport: { viewportFit: "cover" } + في نفس التغيير: DashboardShell pb-16 → pb-[calc(4rem+env(safe-area-inset-bottom))] (زوج مرتبط).
3. **SpeedInsights خلف بوابة (D8-G3):** يُركب فقط عند process.env.VERCEL — زائل 404 على النشر الذاتي.
4. **تنقل الأدمن (D7-P0):** AdminMobileNav جديد (شريط سفلي md:hidden بأقسام الأدمن الأربعة) داخل admin/layout.tsx + روابط متبادلة في ترويسات صفحات الأدمن إن ناقصة.
5. **حركة دخول 17 صفحة (D2-P1):** غلاف children في DashboardShell keyed بالـpathname يطبق sb-fade-up/animate-fade-in-150 (CSS فقط) — يغطي كل صفحات dashboard دفعة واحدة.
6. **FAB في /demo (D7-P1):** رفع FloatingWhatsApp فوق الشريط: bottom-[calc(env(safe-area-inset-bottom)+5rem)] md:bottom-… (لا تغطية لزر «المزيد»).
7. **زر إغلاق sheet:** size-8 → حجم ≥40px (min-h/min-w أو size-10) في MobileBottomNav.

### E-F3 — حالات إعادة المحاولة والسكلتونات (STATES-RETRY) · sonnet
**ملفاته:** `src/app/admin/settings/page.tsx` · `src/app/dashboard/notifications/page.tsx` · `src/app/dashboard/audience/page.tsx` · `src/app/dashboard/posts/page.tsx` · `src/app/dashboard/scheduled/page.tsx`
**المهام (D1):**
1. **admin/settings:** فشل تحميل = بطاقة خطأ داخلية + زر إعادة محاولة (نمط مرآة admin/telegram:248-255) بدل toast عابر ونموذج فارغ.
2. **notifications:** بطاقتا خطأ (التغذية + الإعدادات) بمعالج إعادة محاولة refetch.
3. **audience:** KPI الثلاثة سكلتون أثناء التحميل بدل «—» + خطأ المشتركين ب زر إعادة محاولة.
4. **posts/scheduled:** أزرار النشر/الجدولة تمرر loading («جارٍ النشر…/جارٍ الجدولة…») — Button يملك loading prop بالفعل.

### E-F4 — الأيقونات (ICONS) · sonnet
**ملفاته:** `src/lib/premium-toast.tsx` · `src/components/ui/input.tsx` · `src/app/subscribe/payment/index.tsx` · `src/app/onboarding/OnboardingWizard.tsx` (أسطر الأيقونات فقط) · `src/app/login/page.tsx` · `src/app/register/RegisterForm.tsx` (إن كان ملفًا منفصلًا — حدد بالبحث) · `src/app/pricing/page.tsx` · `src/components/landing/landing-data.ts` · أي ملف SetupWarnings (ابحث: rg -l SetupWarnings src/)
**المهام (D3):**
1. **توحيد النجاح:** CheckCircle → CheckCircle2 في كل المواضع (أو العكس — اعتمد CheckCircle2 الأحدث بصريًا) — رحلة الدفع موحدة.
2. **توست التحذير:** premium-toast:33/99 — Star → AlertTriangle (أيقونة تحذير فعلًا) + انعكاس LogIn/LogOut RTL (rtl:-scale-x-100).
3. **RTL الخمسة:** SetupWarnings:142 (Send) + login:254/256 (LogIn) + توست LogOut — آلية rtl:-scale-x-100 الموحدة.
4. **pricing:** strokeWidth=3 → 2 (سماكة موحدة) + Eye في login/Register crossfade؟ لا — crossfade موجة S3. هنا فقط الأيقونات دلاليًا.
5. **landing-data.ts:** حذف 3 استيرادات ميتة.
6. **رسالة زر الدخول:** «تسجيل الدخول» أيقونة متناسقة مع الرحلة.

### E-F8 — الوظائف المفقودة (FEATURES-UI) · sonnet — أثقل وكيل
**ملفاته:** `src/app/dashboard/tools/page.tsx` · `src/app/dashboard/team/page.tsx` · `src/app/dashboard/billing/page.tsx` · `src/app/dashboard/reports/page.tsx` · `src/app/dashboard/support/page.tsx` · `src/app/dashboard/broadcast/page.tsx` · `src/app/dashboard/autoreply/page.tsx` · `src/app/admin/support/page.tsx` · `fb_dashboard/routers/support.py` (زر إغلاق فقط) · `fb_dashboard/routers/broadcasts.py` (إلغاء فقط — تحقق أولًا من وجود endpoint) · `tests/test_v17_features_ui.py` (أجزاء الخلفية الصغيرة)
**المهام (D6/D5/D2):**
1. **إنشاء عرض (D6-1):** نموذج «عرض جديد» في tools (مرآة نموذج القالب الموجود) → POST /api/offers — يغلق وعد Premium الأرخص.
2. **ترقية الخطة (D6-2):** زر «ترقية خطتك» في billing للمستأجر النشط → إعادة استخدام PaymentDialog (تحقق من عقد POST /api/subscriptions/upgrade أولًا — إن اختلف العقد أبلغ المنسّق ولا تخترع).
3. **تقرير PDF (D6-4):** زر «تنزيل تقرير PDF» في reports → POST /api/reports/generate (blob download) + خيارات النوع/المدة — وعد Basic+Premium.
4. **إدارة الفريق (D6-5):** team: نموذج إضافة عضو (POST /api/users مع رسالة حد max_team العربية من E-B2) + تغيير دور (PUT) + حذف (DELETE) — يغلق وعد «فريق حتى N».
5. **إغلاق تذكرة:** admin/support زر إغلاق (إذا وُجد endpoint — تحقق) + dashboard/support عرض الحالة المغلقة.
6. **إلغاء بث معلق:** زر إلغاء في broadcast للحالة scheduled (تحقق من endpoint).
7. **تعديل قاعدة/قالب:** autoreply زر تعديل (PUT موجود) + tools تعديل قالب (PUT) — نماذج تعديل inline أو dialog.
8. **حركة خيط التذكرة (D2-P1):** support:442 — grid-rows-[0fr→1fr] + transition (نمط FaqSection المثبت محليًا).
9. **admin/support الترقيم:** التحويل لـ DirectionalIcon (chevron variant) بدل الاستيراد الخام.
10. **tools:** ToggleRight/Left → Switch المكوّن + زر حفظ القالب بloading prop «جارٍ الحفظ…» (الحفظ نفسه يصلح E-B1 خلفيًا).

### E-F9 — صفحة الحملات التسلسلية (SEQUENCES-PAGE) · sonnet
**ملفاته:** `src/app/dashboard/sequences/page.tsx` (جديد) · `src/components/layout/AdminSidebar.tsx` (إضافة عنصر فقط) · `src/test/SequencesPage.test.tsx` (إن رخيص)
**المهام (D6-3 — وعد Pro 129د.ل بلا سطح):**
1. اقرأ عقد الـ11 endpoint في `fb_dashboard/routers/sequences.py` (GET قائمة/تفاصيل، POST إنشاء، PUT تحديث، DELETE، تفعيل/إيقاف، خطوات...) ثم ابنِ الصفحة: قائمة الحملات (بطاقات بحالة pending/active/completed) + محرر خطوات (نموذج: اسم، جمهور، خطوات متسلسلة بخيارات التأخير/الرسالة — حسب العقد الفعلي) + زر تفعيل/إيقاف + حذف بconfirm.
2. النمط: مرآة بنية broadcast/page.tsx (نفس البنية البصرية والحالات الثلاثية سكلتون/فراغ/خطأ) + دخول بالحركة (يغطيها غلاف DashboardShell من E-F2 تلقائيًا).
3. عنصر تنقل: AdminSidebar في قسم «الأعمال» — MobileBottomNav يرثه تلقائيًا (يستورد defaultNavSections).
4. قفل رحلة: إن كانت الميزة مقيدة بخطة (has_sequences) — اعرض حالة «متاحة في Pro» صادقة عند الرفض (اقرأ عقد الخطة من الباك-إند).

### E-F10 — التحليلات المتقدمة (ANALYTICS-ADVANCED) · sonnet
**ملفاته:** `src/app/dashboard/analytics/page.tsx` · `src/components/charts/` (إن لزم مكون مخطط جديد)
**المهام (D1-P3 + D6-8):**
1. KPI سكلتونات بدل «—» أثناء التحميل.
2. أقسام «تحليلات متقدمة» من endpoints الجاهزة (D6: daily-trend / heatmap / peak-hour / top-rules / period-comparison — اقرأ مساراتها الفعلية من routers/analytics.py): ChartCard + recharts lazy (نمط موجود) — وسم «متاح في Premium» عند 403 الخطة إن كان العقد كذلك.
3. tooltips عربية + countPhrase للعدادات.

### E-F11 — لوحة التحكم الرئيسية (DASHBOARD-HOME) · sonnet
**ملفاته:** `src/app/dashboard/page.tsx` · `src/components/ui/KpiCard.tsx` (حدد مساره) · `src/components/landing/StatsSection.tsx` (حدد مساره) · `src/hooks/useCountUp.ts` (جديد)
**المهام (D6-9 + D9 + D2-P2):**
1. **بطاقة صحة البوت:** من /api/health/bot-check (اقرأ عقد endpoint أولًا) — زر «فحص فوري» + آخر تنبيه — تكمل CronHeartbeatCard إن وجدت.
2. **عدّاد عربي:** dashboard:174 «N غير مقروءة» → countPhrase (نمط 32 استدعاء موجود).
3. **توحيد count-up:** hook واحد useCountUp يخدم KpiCard وStatsSection (منطق/مدة/منحنى واحد) + reduced-motion يعطل.

### E-F12 — اقتراح الرد الذكي (AI-SUGGEST) · sonnet
**ملفاته:** `src/app/dashboard/comments/page.tsx` · (dialog داخل نفس الملف أو src/components/ai/SuggestDialog.tsx جديد)
**المهام (D6-6 — وعد Basic «ردود ذكية AI»):**
1. زر «اقترح ردًا» بجانب صندوق الرد (أو في بطاقة التعليق) → POST /api/ai/suggest (اقرأ العقد الفعلي من routers/ai.py أولًا: النص المطلوب/الاستجابة) → dialog بـ1-3 اقتراحات قابلة للإدراج بنقرة.
2. فحص الجاهزية: GET /api/ai/status — إن لم تكن مفاتيح AI مضبوطة: الزر يظهر حالة «الذكاء الاصطناعي غير مفعل — فعّله من الإعدادات» صادقة (لا زر ميت).
3. حالات: سبينر أثناء الاقتراح + خطأ عربي + إدراج يملأ مسودة الرد.

---

## 2) الموجة الثانية — كنس عبر-الملفات (S1-S5، بعد دمج الموجة الأولى)

| # | الوكيل | الملفات (ملكية حصرية للكنس) | المهام |
|---|---|---|---|
| **S1** | ترحيل الهيدرات | الـ15 صفحة التي بهيدر يدوي (D4 §التوصية — القائمة في تقريره) + `src/components/subscribe/PaymentSection.tsx` + `docs/design-system.md` | ترحيل لـPageHeader + سقف عرض موحد (SectionContainer) + إصلاح to-white + تحديث بوابة §8 (text-white/§fill) |
| **S2** | كنس النصوص العربية | payment/index.tsx (باقة→خطة) · pricing layout · csrf-client.ts (لف Failed to fetch بعربي) · fan_count مواضع · connect tone · تسميات placeholders | معجم موحد + استبدالات ~35 سطرًا (قائمة D9 الأخطر 10) |
| **S3** | الحركة 2 | `src/components/landing/Header.tsx` (tubelight منزلق) · `globals.css` (توكنز --duration-*/--ease-spring + .icon-swap + .exit-fade) · `dialog.tsx` · `enter-motion.css` · not-found.tsx · login/RegisterForm (Eye crossfade) · حذف-بلا-خروج في tools/autoreply | D2 البنود P2 كاملة |
| **S4** | الجوال الكامل | ~15 حقلًا خامًا (قائمة D7 §5.2) + ~19 هدف لمس + billing:130,139 مفاتيح 28px + جداول admin المكدسة (data-label CSS) + فصل أزرار النشر/الحذف gap-2 | D7 P0-1 + P1-2/4 + P2-1/2 |
| **S5** | بوابات gstack | `scripts/slop_scan.py` (قواعد واجهة: transition:all، bounce، dark-glow...) · `scripts/design_baseline.py` (جديد — درجات A-F) · `scripts/v7-icon-evidence.mjs` (مسبارات D3 الثلاثة) · `scripts/gate_all.sh` (تشغيلها) | G1+G2+أدلة الأيقونات |

## 3) عقود الواجهة بين الوكلاء (ملزمة)

1. **E-B1 → E-F1:** `POST /api/inbox/conversations/{id}/read` يعيد `ok({"unread": int})` — E-F1 يستهلكه متفائلًا.
2. **E-B1 → E-F8:** create_template يقبل JSON (والواجهة ترسل JSON كما هي) — لا تغيير مطلوب في tools للـ422.
3. **E-B2 → E-F8:** 403 عربي «حد أعضاء الفريق لخطتك N» من POST /api/users — team UI يعرضه toast.
4. **E-B2 → نفسه:** GET telegram_config يعيد القيم المدومة — صفحته تربطها.
5. **E-F2 → الكل:** غلاف حركة دخول DashboardShell يغطي الصفحات الجديدة (sequences) تلقائيًا — E-F9 لا يضيف حركة يدوية.
6. **E-F4 → الكل:** لا وكيل آخر يستورد CheckCircle — S2/S3 يلتزمان الاختيار الموحد.
7. **S* → E-*:** السنس تعمل فوق شجرة مدمجة — أي تعارض يُرفع للمنسّق.
8. **الكل:** تقرير تسليم `audit-reports/v17-E*-report.md` + سطر worklog + بواباته قبل التسليم.

## 4) قواعد عامة لكل وكلاء التنفيذ

1. صفر إعادة كتابة شاملة — جراحي فقط، كل بند بدليل file:line.
2. كل إصلاح خلفي بسيط يرافقه اختبار pytest؛ كل مكون واجهة جديد: tsc + vitest يمران.
3. ok()/fail() حصرًا · unwrapApi مركزيًا · لا حراس شكل مزدوجة جديدة · slop_scan يبقى صفر dual-shape.
4. الأيقونات: lucide حصرًا + DirectionalIcon لكل اتجاهي + aria-label عربي وصف لكل زر أيقوني.
5. النصوص عربية موحدة المصطلح (S2 معجم).
6. الحركة: CSS حصرًا (لا framer) + reduced-motion محمي + توكنز بعد S3.
7. الحزمة: الأساس gz ≤190KB (بوابة 4.6) — لا استيراد ثقيل جديد في المسارات العامة.

## 5) معايير القبول (بوابات المنسّق)

| # | المعيار |
|---|---|
| 1 | pytest كامل أخضر (+اختبارات v17 الجديدة) في أي ساعة |
| 2 | tsc/vitest/build/ruff/contrast/i18n/a11y-labels/secret-scan/measure كلها خضراء |
| 3 | بطارية محاكاة v17 المحلية: خضراء + شخصيات تتحقق من الميزات الجديدة (قالب/عرض/تسلسلية/mark-read) |
| 4 | قائمة السماح ≤4 إدخالات expires=prod |
| 5 | بعد النشر: 100+ فحصًا يشمل: /subscribe للمجهول (G1) · sequences حية · قالب ينشأ فعليًا · صفر أخطاء console جديدة |
| 6 | التزام واحد → دفع → أدلة حية → تقرير + سجل + INDEX/README/CLAUDE/ledger |

## 6) المؤجل بأمانة (خارج نطاق هذه الجولة)

- **المساعد الذكي كواجهة دردشة + شحن المحفظة:** قرارات مالك (dec-agent-stack / dec-wallet-spend) — أبواب قرارات منتج لا تُبنى ضمنيًا
- **WS/SSE تحديث حي بدل polling:** جولة أداء قادمة (dec-rsc-public عائلة)
- **وسوم CRM + virtualization:** الأولوية منخفضة (القوائم محدودة ≤200)
- **حلقة مراقبة canary 10 دقائق:** dec-canary-watch
- **mسبار المصيَّر≠الموثَّق (G3) وG4 كامل القياس:** يقيّم بعد S5 — إن رخص يُضاف للجولة القادمة

## 7) سجل القرارات — تحديثات مرتقبة (append-only)

- **dec-agent-stack:** تُقيد الحزمة بعد هذه الجولة إلى (agent/flow/publisher/commerce) — sequences/users/pdf/ai-suggest/offers بنت واجهتها → القرار يضيق
- **dec-notification-prefs (جديد):** إن نفّذ E-B3 المستهلك يُغلق؛ إن تعذر لعزل يُوثق السقف
- **dec-design-baseline (جديد):** G2 درجات التصميم تُقاس من S5 وتتتبع عبر round-metrics
- **dec-browserslist / dec-rsc-public / dec-canary-watch / dec-owner-rotations / dec-git-history-secrets:** بلا تغيير (أصحابها كما هم)
