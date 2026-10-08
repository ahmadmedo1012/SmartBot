# خطة v16 — جولة الأمان الكامل وصدق البطارية والمسار الإنتاجي

> **التاريخ:** 2026-09-09 · **الأساس:** main @ ee0887a6 (v15 مكتملة — 97/97 بعد النشر) · **الطلب:** استمرار التحسين بعمق، أدق التفاصيل، دون استعجال — فحص عميق ← تشخيص ← خطة ← تنفيذ بأعداد كبيرة من الوكلاء.
> **البنية:** 7 وكلاء تشخيص متوازين (D1-D7) + 7 وكلاء تنفيذ بموجتين (E1-E7) + منسّق. أدلة التشخيص في `audit-reports/v16-D*.md`.

## 0) الحصيلة التشخيصية (7 تقارير)

| المحور | أبرز النتائج |
|---|---|
| D1 واجهة RTL/a11y (قياس حي Playwright) | ترتيب التبويب سليم في DOM — الجاني الحقيقي **رابط التخطي**: `layout.tsx:97` `focus:absolute focus:end-4` يظهر **يساراً** (end=يسار في RTL) وخارج الشاشة عند التمرير · معالج onboarding: المسار الأمامي مُصلح، **الخلفي/تخطي الإعداد يسقط التركيز خارج الحوار** (OnboardingWizard.tsx:266-272, 574-580) · Header يتخفى بـ`translate-y-full` فقط → **6 مواقف تبويب غير مرئية** (Header.tsx:164-167) · 8 CTA متداخلة Link>Button · 13 حقل إدخال خام بلا `dir="auto"` |
| D2 أمن الخلفية | **3 مواقع جلب خارجي بحارس متزامن فقط (بلا حل DNS):** إيصال الدفع (approvals.py:244-254) · صورة منشور FB (fb_client.py:115,121 — **بلا سقف حجم + قناة تسريب: البايتات المجلوبة تُرفع لصفحة المهاجم**) · شعار PDF (pdf_reports_engine.py — **WeasyPrint يتبع التوجيهات فيتجاوز حتى فحص الـIP الحرفي**) · `?token=` كرون ميت فعلياً (صفر مستدعين أحياء — قناة dec-cron-restore ميتة رياضياً) · مصفوفة authz على 15 نقطة أموال: **نظيفة 15/15** |
| D3 جودة الاختبارات | **اختبار واحد فقط يعتمد على ساعة اليوم في كامل الجناح:** test_b3_trend (يفشل 00:00-02:00 UTC — مثبت حياً وبتشغيل 24 ساعة محاكاة) · خطر توقيت SSE تحت الحمل (مكرر حياً) · **عطلان صادقان في عدالة البطارية:** كاشف الانقلاب يقرأ الملف الخطأ (grep بنيوياً = صفر دائماً) + SIM_ROUND عالق في v15 → **10 من 12 إدخال قائمة السماح منتهية الصلاحية لا تُطبَّق** |
| D4 الحقيقة الإنتاجية | **تذاكر الدعم: spawn يتجمد + لا يوجد أي مسار طابور للأدمن** — المالك لا يستطيع رؤية تذكرة أبداً بينما الوعد «خلال 24 ساعة» (support.py:115-122) · **الحملات التسلسلية ميزة مدفوعة بلا أي سطح إنتاجي** (الجدولة محلية only — Pro/Enterprise يبيعانها) · حالات ميتة: User.subscription_status يُكتب ولا يُقرأ · login يعيد user.plan الميت دائماً "free" (auth.py:166) · SSE لا يغلق عند cancelled (sse.py:86) |
| D5 أداء الحزمة | الأساس المشترك 187.3KB gz **PASS (هامش 2.7KB فقط)** · **انجراف صامت +40.6KB خام عبر v14+v15** لأن measure_bundle.py **غير موصول بأي بوابة** (E-CI-4 لا يزال مفتوحاً) · AppToaster (sonner 43.2KB) يُحمل في 4 مسارات عامة · vitest 30/243 أخضر |
| D6 البيانات | **[VERIFY] سلسلة Alembic تموت على PostgreSQL نظيف عند 003** (setval(seq,0) خارج النطاق) · حذف المستخدم = 500 على PG (FK بلا ondelete — models.py:750) · **جدول offers بلا فهرس tenant — مسح كامل لكل رسالة واردة** (مسار ساخن!) · إيصالات البنك (data: URLs) محتفظ بها للأبد بعد القرار · مصفوفة طوارئ create_all↔reconcile متطابقة عملياً |
| D7 منهجية gstack | SmartBot **يتفوق** على gstack في: السجل، السرية، ادعاءات البطارية · **فجوات للتبني:** slop-scan (اصطاد 2 حراس شكل مزدوج **جدد** في admin/telegram/page.tsx:94,122 + فرع ميت plan-comparison.ts:53-57) · careful-mode ضد الأبواب الأحادية · مقاييس الجولات JSONL · بصمة الأدلة · بوابة القياس غير الموصولة |

**الحرجات المفتوحة على main الآن (تُغلق هذه الجولة):** اختبار يعتمد على ساعة اليوم (يتكسر أي CI ليلي) · عدالة البطارية معطوبة بنيوياً (الانقلابات لا تُكتشف + TTL لا يُطبَّق) · 3 فجوات SSRF بحل DNS · تذاكر دعم بلا قناة وصول للمالك · ميزة مدفوعة (تسلسلية) بلا أي مشغل إنتاجي.

## 1) خريطة الملكية الصارمة — لا يعدّل وكيل ملفاً خارج قائمته

> **موجتان:** الموجة 1 (E1, E3, E4, E6, E7 متوازون — ملفات منفصلة تماماً) ثم الموجة 2 (E2, E5 متوازيان). التعارض الوحيد المُراعى: approvals.py وplans_config.py وbot.py ملك E2 حصرياً؛ models.py وusers.py ملك E5؛ providers.tsx ملك E4؛ test_v15_perf.py وtest_v14_sse.py ملك E6.

### E1 — إغلاق عائلة SSRF بحل DNS (BACKEND-SSRF) · sonnet
**ملفاته:** `fb_dashboard/fb_client.py` · `fb_dashboard/pdf_reports_engine.py` · `fb_dashboard/routers/reports_routes.py` · `tests/test_v16_ssrf.py` (جديد)
**المهام:**
1. **fb_client.py post_to_page_with_image (:114-127):** استبدال الحارس المتزامن بـ`await assert_safe_outbound_url(image_url, label="صورة المنشور")` (الاستيراد من ai_service) — عند الرفض: تسجيل تحذير + سقوط كريم لنشر النص فقط (نمط موجود) + **سقف حجم 5MB** مطابق لـ`_IMAGE_MAX_BYTES` (قراءة مجزأة أو فحص len قبل الرفع؛ عند التجاوز: نشر نص فقط)
2. **شعار PDF (pdf_reports_engine.py:52,180,224 + reports_routes.py:52-56):** جلب مسبق محروس عبر مساعد ai_service المحقق (timeout+sقف+إعادة فحص بعد التوجيه) في reports_routes قبل بناء HTML → تضمين `data:image/...;base64` في `<img>` + **إغلاق WeasyPrint:** تمرير `url_fetcher` مخصص يرفض أي URL خارج `data:` (يرمي استثناء) لكل استدعاءات write_pdf في المحرك — عند فشل الجلب: 400 «شعار التقرير مرفوض»
3. اختبارات الانحدار (نمط test_v15_concurrency.py:747-756): monkeypatch لـ`_resolve_host_ips` → IP داخلي → 400/سقوط نصي لكل من الموقعين + حالة إيجابية (IP عام) تمر
**بواباته:** `python -m pytest tests/test_v16_ssrf.py tests/test_v14_security.py -q` + ruff

### E2 — الحقيقة الإنتاجية: التذاكر والتسلسلية وعقود الحالة (BACKEND-PROD-TRUTH) · sonnet
**ملفاته:** `fb_dashboard/routers/payments/approvals.py` · `routers/payments/sse.py` · `routers/auth.py` · `routers/bot.py` · `fb_dashboard/bot_engine/engine.py` · `fb_dashboard/sequence_engine.py` · `fb_dashboard/routers/support.py` · `fb_dashboard/routers/plans_config.py` · `docs/deployment.md` · `tests/test_v16_prod_truth.py` (جديد) + تحديث `tests/test_v15_concurrency.py` و`tests/test_v6_observability.py`
**المهام:**
1. **إيصال DNS (approvals.py:244-254):** استبدال `_assert_safe_image_url` المتزامن بـ`await assert_safe_outbound_url(receipt, label="رابط الإيصال")` — العقد محفوظ: 400 «رابط الإيصال مرفوض» + اختبار انحدار بـmonkeypatch DNS
2. **تذاكر الدعم (support.py:115-122):** حذف spawn + `except: pass` → نمط الإخطار المحروس المُنتظر المعتمد (نمط `_notify_admins_inline` في wallet.py:69-95: asyncio.gather مع timeout=8 و`except Exception` يسجل فقط) **قبل** الرد، والالتزام موجود أصلاً قبله + **مسار طابور المنصة:** `GET /api/admin/support/tickets` (require_platform_admin، عبر المستأجرين، فلتر status/priority، صفحة محدودة) — للمالك قناة اطلاع حية (الواجهة في E3-م6)
3. **الحملات التسلسلية (sequence_engine + engine.py cycle):** مستهلك `process_due_sequence_steps(session)` بنمط المطالبة الذرّي (مرآة marketing.py:308-341: `UPDATE ... WHERE due وstatus='pending' RETURNING` أو مكافئ محقق) — يُستدعى في ذيل `cycle()` بجوار broadcast/marketing + سياسة فشل لكل خطوة (محاولة واحدة، تعليم فشل، لا حجب الدفعة) + اختبار (خطوة مستحقة تُرسل، غير المستحقة لا، السباق لا يزدوج)
4. **عقود الحالة (sse.py:86):** المجموعة النهائية → `("verified", "cancelled")` + عند الرفض كتابة `tenant.subscription_status="REJECTED"` (يغلق فرع engine.py:352 الميت) أو حذف الفرع — المفضل: الكتابة + إزالة `"active"` من plans_config.py:140 (لا كاتب له) + **مزامنة HTTP مع تلغرام:** approvals.py:122-130 يضبط `user.plan_id` مثل telegram.py:113 (إغلاق الانحراف)
5. **login الصادق (auth.py:166):** إرجاع خطة المستأجر الفعلية (`tenant.subscription_status`) بدل `user.plan` الميت
6. **إزالة `?token=` (bot.py:51-56 + plans_config.py:251-262):** حذف فرع الاستعلام (يبقى Bearer + POST form) — تحديث الاختبارين المطمئنين عليه ليتوقعا 403 + تصحيح صياغة deployment.md:118,138 (القناة الخارجية موثقة كميتة)
7. **توسيع cleanup-logs (plans_config.py:218-282):** إضافة analytics_events>90d + notifications المقروءة>90d + **تجريد إيصالات data: URL من extra_data بعد 30 يوماً من الحالة النهائية** (تحفظ الحقول المالية)
**بواباته:** `python -m pytest tests/test_v16_prod_truth.py tests/test_v15_concurrency.py tests/test_v6_observability.py tests/test_v15_money_core.py -q` + ruff

### E3 — RTL/a11y: التخطي والتركيز والحقول (FRONTEND-A11Y) · sonnet
**ملفاته:** `src/app/layout.tsx` · `src/app/onboarding/OnboardingWizard.tsx` (المسار: `src/components/` أو `src/app/` — الأصح بالبحث) · `src/components/landing/Header.tsx` · صفحات CTA المتداخلة (`src/app/page.tsx`, `components/landing/FinalCTASection.tsx`, `app/login/page.tsx`, `components/auth/RegisterForm.tsx` أو ما يعادلها, `app/dashboard/billing/page.tsx`, `app/dashboard/messages/page.tsx`, `app/global-error.tsx`, `app/admin/telegram/error.tsx`) · حقول dir="auto" (صفحات autoreply/tools/scheduled/marketing/comments/posts/messages/support/demo/payment-instructions) · `src/test/OnboardingWizard.test.tsx` · **جديد:** `src/app/admin/support/page.tsx`
**المهام:**
1. **رابط التخطي (layout.tsx:97):** `focus:absolute focus:end-4` → `focus:fixed focus:start-4` — يظهر أعلى **اليمين** (بداية القراءة RTL) ويثبت في الإطار عند التمرير — هذا يغلق p11-rtl-tab-order
2. **تركيز معالج الرجوع/التخطي (OnboardingWizard):** دالة `focusStepTitle()` (rAF → `#onboarding-step-title`) تُستدعى في handleBack (:266-272) وزر «تخطي الإعداد» (:570-581) + اختبار vitest: بعد «السابق» يكون activeElement داخل [role=dialog] وبمعرف عنوان الخطوة
3. **Header المتخفي (Header.tsx:164-167):** الفرع المخفي يضيف `invisible` + `transition-[transform,visibility]` (تُحفظ الحركة، تخرج المواقف من ترتيب التبويب)
4. **فك تداخل الـ8 CTA:** استبدال Button الداخلية بـspan مصمم بنفس الكلاسات (يبقى المرساة المفردة المركّزة)
5. **dir="auto" على الـ13 حقل** الخام المذكورة في D1 (أو الترحيل لمكون Input/Textarea المشترك حيث رخيص)
6. **صفحة طابور تذاكر الأدمن:** `admin/support/page.tsx` تعكس نمط صفحات الأدمن القائمة (جدول، فلتر status، عدادات) وتستهلك `GET /api/admin/support/tickets` عبر apiFetch/unwrapApi — **بلا حراس شكل مزدوج** (قاعدة v13-3)
**بواباته:** `npx tsc --noEmit` + `npx vitest run` + `node scripts/check_a11y_labels.ts` + بناء نظيف

### E4 — أداء الواجهة وأصقاع slop (FRONTEND-PERF) · sonnet
**ملفاته:** `src/app/providers.tsx` · `src/app/dashboard/layout.tsx` · `src/app/admin/layout.tsx` · `src/app/(auth layouts إن لزم)` · `src/app/admin/telegram/page.tsx` · `src/components/*/plan-comparison.ts` (المسار بالبحث)
**المهام:**
1. **إخراج AppToaster من الجذر:** حذف الاستيراد الديناميكي من providers.tsx:30-33 — التركيب في تخطيطات dashboard/admin (+ أي تخطيط عام يثبت استخدامه للتوست فعلياً — افحص أولاً بمسح `toast(` في المسارات العامة) — الهدف: −43.2KB خام/−12.8KB gz من المسارات العامة الأربعة
2. **حذف الحراس المزدوجين (admin/telegram/page.tsx:94,122):** `Array.isArray(...)` على بيانات مفرودة أصلاً عبر unwrapApi والخلفية تعيد ok([...]) دائماً — استبدال مباشر بالمتغير
3. **حذف الفرع الميت (plan-comparison.ts:53-57):** فرع split النصي لـ`features` — لا كاتب نصي له في المستودع كله؛ توحيد النوع string[]
4. تحقّق بعدي: `npm run build` + قياس measure_bundle.py قبل/بعد — الأرقام في تقرير الوكيل
**بواباته:** `npx tsc --noEmit` + `npx vitest run` + build + measure

### E5 — البيانات: الفهارس والمفاتيح والترحيلة 015 (BACKEND-DATA) · sonnet
**ملفاته:** `alembic/versions/015_v16_data.py` (جديد) · `alembic/versions/003_tenants.py` (تحرير موضعي — سابقة v13 معتمدة) · `fb_dashboard/models.py` · `fb_dashboard/_schema_reconcile.py` · `fb_dashboard/routers/users.py` · `tests/test_v16_migrations.py` (جديد)
**المهام:**
1. **فهرس المسار الساخن:** `Index("ix_offer_tenant_active", "tenant_id", "is_active")` على offers في models + 015 (لهجتان، Inspector-guard، CREATE INDEX IF NOT EXISTS) + قيد reconcile — يغلق المسح الكامل لكل رسالة (offer_engine.py:41-43)
2. **FK حذف المستخدم:** `telegram_approvers.added_by_id` → `ondelete="SET NULL"` (models.py:750) + 015 يسقط/يعيد بناء القيد على PG ويعلّم NULL على PG فقط (حارس لهجة) + مسار الحذف (users.py:69-80) يكتسح notification_preferences (قيدها الفريد على user_id) — يغلق الـ500 على PG
3. **003 setval:** تحويل إلى `setval(seq, GREATEST(COALESCE(MAX(id),1),1), ...)` بصيغة آمنة (إما 3-وسائط مع is_called محسوب أو تجاوز setval عند MAX=0) — سلسلة PG نظيفة تكمل حتى head (يعاد إنتاجها محلياً إن أمكن، وإلا فحص ساكن موثق + اختبار لهجة SQLite يعكس الصيغة الآمنة)
4. **تعادل السلسلة ≡ create_all:** إعلان فهرسي 002 اليتيمين (ix_sub_payment_status/ix_sub_payment_user_status) في models `__table_args__` (الإبقاء عليهما — يخدمان فحص الحالة) + إضافة ما ينقص reconcile من قائمة الشفاء (uq_user_tenant_username, ix_sub_payment_user_pending, uq_*_tenant_fb الثلاثة، فهارس 010/011 الحارة) بحيث يبقى المخطط محروساً حتى إن ماتت السلسلة
5. **PRAGMA foreign_keys=ON في محرك اختبارات SQLite** (conftest/التجربة العزل) + اختبار واحد يثبت أن حذف مستخدم ينجو من FK (كان مستحيلاً قبله)
**بواباته:** `python -m pytest tests/test_v16_migrations.py tests/test_v13_migrations.py tests/test_v15_migrations.py tests/test_schema_reconcile.py -q` + ruff

### E6 — صدق البطارية و determinism الوقت (TESTS-BATTERY) · sonnet
**ملفاته:** `tests/_dayseed.py` (جديد) · `tests/test_v15_perf.py` · `tests/test_v14_sse.py` · `e2e/sim/fixtures/sim-findings.json` · `e2e/sim/helpers/db-claims.mjs` · `scripts/v16_sim_local_battery.sh` (جديد من نسخ v15) · `scripts/v16_postdeploy_battery.sh` (جديد من نسخ v15)
**المهام:**
1. **_dayseed + إصلاح F1:** مساعد seed_day (بذور مثبتة على حدود اليوم UTC — تصميم D3 جاهز) + `_seed_reply(at=...)` + تحويل بذور test_b3_trend الخمس إلى at= + حارس منتصف الليل (skip صادق إن عبرت الاختبار الثانية)
2. **de-flake SSE (test_v14_sse.py:212-236, 320-330):** التوقيت: إما رفع مهلة الموثّق إلى ما فوق أبطأ حلقة محمّلة أو قبول كلا الترتيبين للقراءة الأولى (العقد: البقاء والنجاة من الاستثناء — ليس ترتيب الثواني)
3. **إصلاح كاشف الانقلاب:** قراءة `status.*findingClosed` من sim-findings-live.json (الصيغة التي يكتبها db-claims.mjs فعلاً) في سكربت v16 الجديد
4. **SIM_ROUND=v16:** db-claims.mjs يقرأه من env (مع افتراضي v16) والسكربت يصدّره — TTL يعضّ فعلاً
5. **تقليم قائمة السماح:** حذف الإدخالات الست الخضراء المقلبة (p10-broadcast-gate, p10-max-replies, p13-changepw-429, p13-register-race-500, p10-free-funnel, p13-cron-query-token — الأخير يقلب أخضر بإزالة ?token= في E2) + **حل الثلاثة المنتهية:** p13-ssrf-receipt-dns (يقلب أخضر بإصلاح E2-م1 — يبقى الإدخال ينتظر البطارية تؤكده ثم يحذفه المنسّق) + p12-wizard-focus-advance (أخضر بإصلاح E3-م2) + **إعادة سماح عائلتي R3** (p10-dm-gate, p10-replies-used-comments) بexpires:"prod" مثل p08-crm-lead (القياس يحتاج توكن Graph حياً)
6. **v16_postdeploy_battery.sh:** نسخة v15 + قسم P جديد: Playwright يحمّل / و/pricing و/login و/dashboard (auth وهمي) عبر وكيل LOCAL_API_PROXY مع خطاف أخطاء console/unhandledrejection → مقارنة بعدد أساس مصفوف docs/evidence/baseline-console.json (يُنشئه أول تشغيل) — فشل القسم = فشل البطارية
**بواباته:** pytest الجناح كاملاً أخضر + تشغيل البطارية المحلية كاملة (سيديرها المنسّق)

### E7 — البوابات ومنهجية gstack (GATES-METHOD) · sonnet
**ملفاته:** `scripts/gate_all.sh` · `scripts/round.env` (جديد) · `scripts/slop_scan.py` (جديد) · `scripts/round_metrics.py` (جديد) · `scripts/check_careful.sh` (جديد) · `.githooks/pre-push` (جديد) · `docs/evidence/round-metrics.jsonl` (بذر من أرقام v15)
**المهام:**
1. **قياس الحزمة في البوابة:** بعد بناء next داخل gate_all.sh: تشغيل measure_bundle.py — **عقد صارم: الأساس المشترك gz ≤190KB** (خارج = بوابة حمراء) + طباعة route-extra لكل مسار (معلوماتي — إعادة تثبيت تعريف ذراع كود التطبيق مؤجلة بتوثيق صريح لأن 60.6KB منه بنية Next غير قابلة للتحكم)
2. **slop_scan.py (gstack G1):** قواعد SmartBot الثلاث (حراس شكل مزدوج بعد unwrapApi · except→pass/continue/return-None مع عدّاد نقاط ساخنة · `?? []` بعد unwrapApi) — **تشخيصي لا يحجب أبداً** (exit 0 دائماً) بطباعة العدد واتجاهه — بوابة 5.8
3. **round_metrics.py (G3):** سطر JSONL واحد لكل جولة {round, pytest_total, coverage, allowlist_entries, expired_still_red, dual_shape_guards, silent_swallows, battery_red} — يُبذر بأرقام v15 الموثقة
4. **check_careful.sh (G2):** أنماط الرفض: force-push إلى main · `git filter-repo` · `alembic downgrade` · DROP/TRUNCATE على قاعدة بغير /tmp أو ملف اختبار · rm -rf خارج المستودع — يوصل `.githooks/pre-push` بـ`git config core.hooksPath .githooks`
5. **بصمة الأدلة (G6):** عند نجاح البوابة يكتب docs/evidence/gate-run.json {ts, head, wtree_sha: sha256(git status --porcelain + HEAD)} · قراءة ROUND من scripts/round.env (ROUND=v16) بدل التصلب — البوابة 6b تعيد الحساب وتحجب عند عدم التطابق قبل الدفع
**بواباته:** `bash scripts/gate_all.sh --skip-frontend` يمر + الفحص الكامل عند الدمج

## 2) عقود الواجهة بين الوكلاء (ملزمة حرفياً)

1. **E2 → E3:** `GET /api/admin/support/tickets` يعيد `ok({items:[{id,subject,status,priority,tenant_name,created_at,email}], total, page})` — E3 يستهلكه عبر apiFetch فقط
2. **E2 → E6:** إزالة `?token=` تجعل p13-cron-query-token يقيس 403 — E6 لا يحذفه من قائمة السماح إلا بعد قياس البطارية
3. **E5 → E7:** لا تغطية في slop_scan لأخطاء الترحيل — قواعده الأمامية فقط
4. **E4 → E7:** رقم الحزمة بعد الإصلاح يُثبت في gate-run — قياس E4 القبلي/البعدي مرجع الاتجاه
5. **الكل:** لا وكيل يعدّل ملفاً خارج ملكيته؛ التعارض المكتشف يُرفع للمنسّق في تقرير التسليم (لا حلول ذاتية عبر الملفات)

## 3) قواعد عامة لكل وكلاء التنفيذ

1. صفر إعادة كتابة شاملة — جراحي فقط؛ كل بند بدليل file:line من تقرير D المقابل
2. كل إصلاح بسيط يرافقه اختبار (المسار الجديد) أو تحديث اختبار قائم (المسار المقيد)
3. `ok()`/`fail()` من `_responses.py` حصراً · unwrapApi مركزياً — لا حراس شكل جديدة
4. رفع تقرير التسليم في `audit-reports/v16-E<n>-report.md` + سطر في worklog.md — كل بند: منفَّذ/مرفوض + دليل تيرمينال
5. كل وكيل يشغّل بواباته قبل التسليم؛ الفشل يُذكر صراحة لا يُخفى
6. الأدلة الحية بعد النشر: المنسّق وحده (single-commit push)

## 4) معايير القبول (بوابات المنسّق)

| # | المعيار |
|---|---|
| 1 | pytest كاملاً أخضر في **أي ساعة** (اختبار الساعة مغلق — إعادة تشغيل مضبوطة إن أمكن) |
| 2 | vitest + tsc + build + ruff + contrast + i18n + a11y-labels + secret-scan + **measure(≤190KB gz)** كلها خضراء |
| 3 | بطارية v16 المحلية: خضراء **صادقة** — كاشف الانقلاب يعمل (يقرأ الصيغة الصحيحة) + TTL يطبق + الخروج المركب 0/0 |
| 4 | قائمة السماح بعد الجولة: ≤4 إدخالات، كلها بأسباب وTTL سارية |
| 5 | بطارية ما بعد النشر: 90+ فحصاً + قسم أخطاء console الجديد أخضر |
| 6 | الالتزام واحد على main → دفع → أدلة حية → تقرير + سجل + INDEX/README/CLAUDE/ledger محدثة |

## 5) سجل القرارات — تحديثات مرتقبة (append-only)

- **dec-cron-restore:** يظل مفتوحاً (إجراء مالك) — إزالة `?token=` لا تغلق القناة الميتة؛ صياغة deployment.md تُصحح
- **dec-rsc-public (جديد):** تسعير/اشتراك fetch من العميل (RTT 3G قبل السعر) — ترقية عند جولة أداء واجهة
- **dec-dm-sweep (جديد):** قناة DM بلا احتياط heartbeat (تعليق يقابلها للمسح اليومي) — سقف: الاعتماد على ويبهوك حي فقط
- **dec-dead-tables (جديد):** conversation_notes/assignees/offer_claims + ReportSchedule بلا مستهلك — قرار منتج بناء/إيقاف
- **dec-canary-watch (جديد):** قسم console-JS في بطارية ما بعد النشر (v16-E6) — الترقية: حلقة مراقبة 10 دقائق مع تحمل قارئتين
- **dec-browserslist / dec-transactions-vercel / dec-wallet-spend / dec-leads-from-messages / dec-trial-journey / dec-agent-stack:** بلا تغيير (أصحابها كما هم)

## 6) المؤجل بأمانة (خارج نطاق هذه الجولة)

- **مسح تاريخ git السري (dec-git-history-secrets) وتدوير المفاتيح (dec-owner-rotations):** أبواب أحادية — بروتوكول المالك حرفياً
- **RSC-ify للمسارات العامة + polling واعٍ للشبكة + أيقونة العلامة 36px:** جولة أداء واجهة قادمة (dec-rsc-public)
- **الحملة التسلسلية كقيمة منتج كاملة (واجهة):** هذه الجولة تشغل المحرك في cycle (المستهلك) — الواجهة والبيع قرار منتج لاحق
- **قاعدة تنبيه canary تعمل داخل watch:** dec-canary-watch
- **صفحة طابور التذاكر للمالك عبر الواجهة:** منفذة (E3-م6) — تذاكر تلغرام كقناة إخطار تبقى كخيار مالك
