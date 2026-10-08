# خطة v14 — الجولة الشاملة بلا استثناء + بطارية المحاكاة الضخمة

**التاريخ:** 2026-09-07 · **الأساس:** main @ 56d1a3e4 (v13 مكتملة بأدلة حية) · **الطلب الموجه:** «جولة اعمق… كل شيء بالتفصيل وبدون استثناء… مجموعة صخمة من المحاكاة وكأنك مستخدم… أكبر عدد من الوكلاء» · **البنية:** 14 وكيل تشخيص متوازٍ (D1-D14) + 8 وكلاء تنفيذ متوازيين (E1-E8) بملكية ملفات صارمة + منسّق (التعارضات/البوابات/المحاكاة/الدفع/النشر/الأدلة/السجل)

---

## 0) الحصيلة التشخيصية (التقارير الكاملة في audit-reports خارج المستودع)

| الوكيل | المحور | حرجة | عالية | متوسطة | منخفضة |
|---|---|---|---|---|---|
| D1 | مسارات الواجهة (35 راوتاً) | 1 | 2 | 4 | 5 |
| D2 | المكونات (~123) | 0 | 2 | 8 | 13 |
| D3 | RTL/التعريب | 0 | 0 | 1 (bidi×4) | 2 |
| D4 | WCAG 2.2 كودياً | 1 | 8 | 4 | 13 |
| D5 | راوترات الخلفية (250 endpoint) | 0 | 6 | 14 | 8 |
| D6 | المحركات (~9300 سطر) | 2 | 9 | 14 | 11 |
| D7 | البيانات/الترحيلات (49 جدولاً) | 1 | 5 | 10 | 10 |
| D8 | الأمن (عيون جديدة) | 1 | 1 | 4 | 8 |
| D9 | الاختبارات (فجوات) | 5 فجوات | 5 | 3 | 2 |
| D10 | الأداء الساكن | 4 | 6 | ~9 | — |
| D11 | التكوين/التوثيق/CI | 5 | 13 | 6 | — |
| D12 | قدرات gstack | 10 قدرات جديدة قابلة للتطبيق | | | |
| D13 | تصميم المحاكاة | 8 شخصيات · ~130 خطوة محلية · 50 فحص إنتاج · 18 ملفاً | | | |

**الحرجات الست (تُغلق هذه الجولة):**
- **C-SEC1 (D8):** تأكيد دفعة ذاتي → اشتراك مجاني: أي مستخدم مسجل ذاتياً (admin مساحته) يُنشئ دفعة pending ثم `POST /api/admin/subscriptions {id, status:"verified"}` — يُغلق بـ`require_platform_admin` (approvals.py:44-72 + اختبار سالب)
- **C-FE1 (D1):** رحلة ربط الصفحة عبر /connect مكسورة كلياً: `handleTest` يقرأ `td.connected` من `res.json()` الخام بينما الخلفية تعيد `{success,data}` → زر الاختبار يفشل دائماً و«حفظ وتفعيل» معطّل دائماً (connect/page.tsx:63-76,328)
- **C-A11Y1 (D4):** رفع إيصال الدفع محجوب عن لوحة المفاتيح كلياً (payment-instructions.tsx:230-254)
- **C-ENG1 (D6):** PublisherEngine singleton عالمي: بيانات اعتماد آخر مستأجر تُستخدم لنشر منشور مستأجر آخر (_services.py:53 + publisher_routes.py:88-89)
- **C-ENG2 (D6):** CalendarScheduler ينشر عبر زبين المنصة العام وفي الإنتاج env فارغ → فشل لانهائي كل 60 ثانية (content_calendar.py:96-113)
- **C-DATA1 (D7):** `uq_botstate_tenant_key` مصرّح بها في النموذج ولا ترحيلة تنشئها → قرضا «أول» متزامنان ينشئان صفّي رصيد (فساد رصيد) — تُغلق بترحيلة 013 + _schema_reconcile

---

## 1) خريطة الملكية — قاعدة صرامة: لا يعدّل وكيل ملفاً خارج قائمته (تعارض = المنسّق يحسم)

### E1 — مسار الأموال والأمن (BACKEND-SEC) · نموذج: opus
**ملفاته:** `fb_dashboard/routers/payments/approvals.py` · `wallet.py` · `bank.py` · `plans.py` · `fb_dashboard/routers/users.py` · `fb_dashboard/routers/bot.py` · `fb_dashboard/ai_service.py` · `tests/test_v14_security.py` (جديد)
**المهام (بالترتيب):**
1. C-SEC1: مسار `verify_payment` HTTP → `require_platform_admin` بدل admin النطاق (approvals.py:44-72) + اختبار سالب: مستأجر عادي يحاول تأكيد دفعته → 403 (المسار التلغرامي يبقى للمنصة)
2. سقف `/api/payments/history` (wallet.py:151 — سحب كامل بلا حدود → limit/offset)
3. إشعارات موافقات الأموال `spawn()` تُقتل على Vercel → تنفيذ inline (wallet.py:110)
4. إزالة الإيصالات base64 من استجابات JSON الإدارية (bank.py:71 → plans.py:105 → approvals.py:38) — استبدال بعلم وجود/رابط تحميل محمي
5. رفع `token_ver` عند تغيير كلمة المرور في `PUT /api/users/{id}` (users.py:54) + اختبار
6. تحقق `days` في `POST /api/logs/clear` (bot.py:345): Query/Path مقيد ge=0 le=365 + اختبار سالب
7. حارس `analyze_image`: قصر المصادر على http(s)/data:image — لا `open()` لملفات محلية (ai_service.py:313-320) + اختبار LFI سالب
**بواباته المحلية:** `python3 -m pytest tests/test_v14_security.py tests/test_phase_b_payments.py -q` (كلها خضراء)

### E2 — المحركات والتزامن (BACKEND-ENG) · نموذج: sonnet
**ملفاته:** `fb_dashboard/_services.py` · `content_calendar.py` · `publisher_engine.py` · `fb_dashboard/routers/publisher_routes.py` · `fb_dashboard/app/startup.py` · `subscriber_engine.py` · `pdf_reports_engine.py` · `fb_dashboard/app/ws.py` · `fb_dashboard/routers/sse.py` · `tests/test_v14_engines.py` (جديد)
**المهام:**
1. C-ENG1: نزع حالة المستأجر من singletons — محركات Publisher/Flow تُبنى per-tenant per-request (نمط broadcast v4 §3.8 الموجود في المستودع) (_services.py:53-55 + publisher_routes.py:88-89)
2. C-ENG2: CalendarScheduler — بيانات اعتماد لكل مستأجر + سقف محاولات فاشلة مع تعليم failed (content_calendar.py:96-113)
3. SequenceScheduler: نطاق مستأجر + سقف محاولات (app/startup.py:248)
4. عزل مستأجر: `get_detail` الردود بفلتر tenant + فهرس (subscriber_engine.py:197-198) · `delete_tag` يفحص الملكية قبل الحذف (375-389)
5. WeasyPrint `write_pdf()` → `asyncio.to_thread` (pdf_reports_engine.py:212)
6. ws: قبول توكن من header كأولوية على query + فحص `token_ver` (app/ws.py:33)
7. SSE: سقف اتصالات لكل مستأجر + إعادة استخدام جلسة بدل جلسة كل ثانيتين (routers/sse.py)
**بواباته:** `python3 -m pytest tests/test_v14_engines.py tests/test_v11_publisher_team.py tests/test_track_b_sse.py -q`

### E3 — البيانات والترحيلات والأداء (BACKEND-DATA) · نموذج: sonnet
**ملفاته:** `fb_dashboard/models.py` · `alembic/versions/013_*.py` (جديد) · `alembic/env.py` · `fb_dashboard/_schema_reconcile.py` · `fb_dashboard/routers/plans_config.py` · `fb_dashboard/routers/broadcasts.py` · `fb_dashboard/routers/subscribers.py` · `fb_dashboard/routers/crm.py` (إن وجد ملف منفصل) · `tests/test_v14_migrations.py` (جديد)
**المهام:**
1. C-DATA1: ترحيلة 013 — dedup عام (tenant_id,key) لـbot_state + `CREATE UNIQUE INDEX uq_botstate_tenant_key` (لهجتا PostgreSQL/SQLite) + فهارس المسارات الساخنة: `bot_logs(tenant,created)` · `rules(tenant,enabled)` · `messages.rule_id` · `comments.commenter_id`
2. مطابقة النموذج: قيد `uq_botstate_key_value` الجزئي داخل models.py (كي لا تولد بيئات create_all بلا ضمان التفرد) + `sqlite_where` لعنقود الفهارس الجزئية (D7-03)
3. `_schema_reconcile.py`: إضافة القيدين والفهارس الجديدة (السلطة الفعلية للإنتاج)
4. `alembic/env.py`: محرك مطابق لـdatabase.py (SSL) (env.py:47-50)
5. كاش `/api/public/stats` — `@api_cache.cached(ttl=300)` (plans_config.py:116 — COUNT كامل الجدول عند كل زيارة هبوط) + تحقق مفاتيح الكاش آمنة مستقبلاً
6. سقوف القوائم: `/api/broadcasts` (broadcasts.py:18) + سقف أعلى `per_page` (subscribers + crm — قيد le=200)
**بواباته:** `python3 -m pytest tests/test_v14_migrations.py tests/test_v13_migrations.py tests/test_schema_reconcile.py -q`

### E4 — رحلة الواجهة الأمامية (FRONTEND-JOURNEY) · نموذج: opus
**ملفاته:** `src/app/connect/page.tsx` · `src/app/login/page.tsx` · `src/app/register/` (RegisterForm) · `src/app/subscribe/**` (payment/index.tsx · payment-instructions.tsx · payment-methods.tsx · PaymentSection.tsx · StepIndicator.tsx) · `src/app/onboarding/**` · `src/app/admin/page.tsx` · `src/components/admin/settings/TelegramConfigSection.tsx` (أينما كان مساره الفعلي)
**المهام:**
1. C-FE1: `handleTest` في /connect عبر unwrapApi (قراءة `data.connected`) + تفعيل منطق «حفظ وتفعيل» (connect/page.tsx:63-76,328) + metadata للصفحة + معالجة مصادق مسبقاً
2. إصلاح حارس إعادة التوجيه في login: رفض `/\evil.com` وغيره (login/page.tsx:27 — تجاوز التطبيع)
3. C-A11Y1: رفع الإيصال قابل للوصول — input مرئي sr-only داخل label قابل للتركيز (payment-instructions.tsx:230-254)
4. إعلان حالة الدفع لقارئ الشاشة: `role="status"`/aria-live عند تبديل الخطوات + نقل التركيز (payment/index.tsx:259-353)
5. تبويبات طريقة الدفع: `aria-pressed`/state برمجي (payment-methods.tsx:41-57)
6. OnboardingWizard: إضافة `accessToken` إلى deps في useCallback (253) + حجم زر «اقترح رداً» ≥24px (431-443) + h1 لمسار onboarding
7. false-empty في /admin: الفشل ≠ لا طلبات — رسالة خطأ حقيقية (admin/page.tsx:80-87,190-196) + رابط تنقل إلى /admin/telegram
8. skip-link في /connect: الهدف موجود في كل الفروع (202)
9. النصوص الشفافة الفاشلة تبايناً في ملفاته: login:175,236 · RegisterForm:151,259 · StepIndicator:77 (/50→ توكن يحقق 4.5:1) · طوابع messages تُرك لـE5
**بواباته:** `npx tsc --noEmit` + `npx vitest run src/test/ -q` (لا build — المنسّق يبني)

### E5 — صقل الواجهة: تباين/RTL/توكنز (FRONTEND-POLISH) · نموذج: sonnet
**ملفاته:** `src/components/ui/input.tsx` · `ui/textarea.tsx` · `ui/badge.tsx` · `src/components/layout/Header.tsx` · `src/components/layout/AdminSidebar.tsx` (أينما كان) · `src/components/landing/sections/StatsSection.tsx` · `src/app/dashboard/notifications/page.tsx` · `src/app/dashboard/calendar/page.tsx` · `src/app/dashboard/messages/page.tsx` · `src/app/dashboard/comments/page.tsx` · `src/app/dashboard/leads/page.tsx` · `src/app/dashboard/[...slug]/page.tsx` · `src/app/admin/telegram-unauth/page.tsx` (أينما كان)
**المهام:**
1. توكن placeholder جديد يحقق AA 4.5:1 في الوضعين (input.tsx:47 · textarea.tsx:19) — توكن واحد في globals.css وليس قيماً موضعية
2. عائلة النصوص الشفافة: messages:337 (/70 فوق primary) · StatsSection:110 (/80) — رفعها لحد AA عبر توكن نص ثانوي معتم
3. RTL: عكس hover nudge في AdminSidebar (163: `translate-x-[3px]`→`-translate-x-`) · `mr-auto`→`ms-auto` (admin/page.tsx:163 يخص E4؟ لا — E4 يملك admin/page.tsx للمنطق؛ E5 يمسك فقط ما ليس في قائمة E4 — ينسق مع المنسّق) · TelegramConfigSection:41 يخص E4
4. bidi: `dir="auto"` على القيم الحية الأربع: messages:64/69 · comments:110 · leads:62/68
5. ارتداد التوكنز (v8): notifications pink-500 · Header rgba(251,146,60) · PaymentSection to-white (يخص E4 — ملف subscribe) · عنقود oklch في ui/input+badge+card (توحيد عبر توكن)
6. chevrons التقويم عبر DirectionalIcon (calendar/page.tsx:71,79)
7. StatsSection: العداد المتحرك يحترم prefers-reduced-motion (36-43)
8. h1 لـ[...slug]:23 وtelegram-unauth:194 · إزالة `badgeVariants` المصدَّر الميت (ui/badge.tsx:46)
**بواباته:** `npx tsc --noEmit` + `node scripts/check_contrast.mjs` + `node scripts/gen_a11y_audit.mjs` إن كان ساكناً

### E6 — الاختبارات المفقودة (TESTS) · نموذج: sonnet
**ملفاته:** `src/test/` (ملفات جديدة: OnboardingWizard.test.tsx · RegisterForm.test.tsx) · `tests/test_v14_webhook_multi.py` · `tests/test_v14_sse.py` (جديد) · `e2e/journey.spec.ts` (إحياء) · `playwright.config.ts` (إصلاح baseURL/الوكيل)
**المهام:**
1. OnboardingWizard.test.tsx: تقدّم الخطوات، جسم POST لربط الصفحة (بعد إصلاح accessToken)، فشل الاتصال → رسالة عربية، إكمال → انتقال
2. RegisterForm.test.tsx: تحقق عربي (بريد/هاتف)، تطابق كلمات المرور، قفل 429
3. webhook متعدد الإدخالات: entry[] متعددة + batch من فيسبوك الفعلي (شكل الحمولة) + إدخال مكرر (idempotency) — pytest
4. SSE: استثناء/مهلة/إغلاق/تياران متزامنان (توسيع test_track_b_sse)
5. إحياء e2e: journey.spec.ts على المكدس الصحيح — uvicorn محلي + `next start` مع `LOCAL_API_PROXY` (نمط v9-authed-run-stack.sh) — baseURL قابل للتهيئة عبر env
**بواباته:** `npx vitest run src/test/OnboardingWizard.test.tsx src/test/RegisterForm.test.tsx` + `python3 -m pytest tests/test_v14_webhook_multi.py tests/test_v14_sse.py -q`

### E7 — بطارية المحاكاة الضخمة (SIM) · نموذج: opus · التصميم: v14-D13-sim-design.md
**ملفاته (كلها جديدة):** `e2e/sim-p01-visitor.spec.ts` … `e2e/sim-p08-messenger.spec.ts` (8 ملفات) · `e2e/sim/helpers/{personas,session,shots,api,webhook,net}.ts` + `db-claims.mjs` · `playwright.sim.config.ts` · `scripts/v14_sim_local_battery.sh` · `scripts/v14_postdeploy_battery.sh` · `e2e/sim/fixtures/*`
**المهام:** تنفيذ تصميم D13 حرفياً — 8 شخصيات، ~130 خطوة، فحوص إنتاج 50 بلا حالة. المنسّق يشغّل البطارية بعد اكتمال موجة التنفيذ (محلياً) وبعد النشر (إنتاجياً).

### E8 — التكوين والتوثيق وCI (CONFIG-DOCS) · نموذج: sonnet
**ملفاته:** `.github/workflows/ci.yml` · `vercel-frontend.json` (حذف) · `docs/installation.md` · `docs/deployment.md` · `docs/INDEX.md` · `README.md` · `CLAUDE.md` · `scripts/gate_all.sh`
**المهام:**
1. CI: Node 20→24 (بوابة a11y الـ.ts مكسورة منذ v6) + إضافة بوابة css-token + توسيع بوابة عقود ok() إلى `routers/payments/*.py` (glob متعدد المستويات)
2. حذف `vercel-frontend.json` المنحرف من الجذر + تصحيح deployment.md:80 (النشر الفعلي من fb_dashboard/frontend/vercel.json)
3. توثيق 21 متغير بيئة غير موثق (SENTRY_* · API_PUBLIC_URL · DB_SSL_VERIFY · TELEGRAM_WEBHOOK_SECRET · INITIAL_ADMIN_USERNAME/PASSWORD مع تحذير الطباعة لمرة واحدة) + حذف NEXT_PUBLIC_API_HOST/SITE_URL وLOG_LEVEL المهجورة من التوثيق
4. INDEX.md: تحديث لسلسلة v7→v14 · README: الأعداد الصحيحة (558 اختباراً → الرقم الجديد بعد الجولة، 012→013، vitest) · CLAUDE.md: اصطلاحات v14
5. gate_all.sh: دمج sync_next_static.py + فحص نضارة static (buildId) + منع الرجوع
**بواباته:** `bash -n scripts/gate_all.sh` + قراءة سكربتات yaml صحيحة

---

## 2) قواعد عامة لكل وكلاء التنفيذ
- لا تلمس ملفاً خارج قائمتك — إن احتجت تعديلاً خارجها: أوقف واذكره في تقريرك (المنسّق يحسم)
- التزام نمط الكود القائم: عقد ok()/err()، عزل مستأجر، عربية الواجهة، لا تبعيات جديدة دون إذن
- كل إصلاح أمني/منطقي يقترن باختبار سالب يفشل قبله (نمط investigate: regression test)
- بعد انتهائك: شغّل بوابتك المحلية فقط + `ruff check fb_dashboard` لو عدّلت بايثون
- أضف ملخصاً إلى worklog عبر append فقط. تقريرك الكامل: audit-reports/v14-E<n>-<slug>.md

## 3) معايير القبول (بوابات المنسّق بعد الموجة)
1. gate_all.sh خروج 0 كاملاً (ruff · pytest · tsc · build · vitest · css · i18n · a11y · contrast)
2. صفر من الحرجات الست (لكل واحدة اختبار يثبت الإغلاق)
3. بطارية المحاكاة المحلية: كل الشخصيات خضراء (أو تعذير موثق لكل تعطيل خارجي)
4. build + قياس الحزمة الأمين ≤190KB gz (سكربت measure_bundle.py)
5. e2e journey حي على المكدس المزدوج المحلي
6. تزامن static منفذ ضمن البوابة
7. commit واحد → دفع → نشر → بطارية post-deploy (50 فحصاً) + محاكاة إنتاج بلا حالة + لقطات → تقرير + سجل

## 4) سجل القرارات — تحديثات مرتقبة (append-only)
- إغلاقات جديدة بإسناد كودي: عنصر «بطارية المحاكاة» إذا ثبتت + عنصر «حراس قراءة المغلف الخام في الطفرات» (زاوية D1 الجديدة)
- بند جديد إن لزم: dec-region-fra (نقل منطقة Vercel iad1→fra1 — قرار مالك بحساب الكمون الليبي)
- البنود الملكية الثلاثة + dec-browserslist تبقى كما هي

## 5) المؤجل بأمانة
- dec-owner-rotations (عاجل — مالك) · dec-uptime-monitor (مالك) · dec-agent-stack (قرار منتج) · dec-browserslist (بيانات أجهزة) · توحيد أنماط الحالات الثلاثية (D2 M7 — جولة قادمة) · unwrapBody<T> التصليب الكامل إن تسبب بشلال أنواع
