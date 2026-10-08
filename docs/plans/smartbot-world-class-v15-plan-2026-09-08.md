# خطة v15 — أعمق جولة: إصلاح الحقيقة الإنتاجية + عدالة البطارية

**التاريخ:** 2026-09-08 · **الأساس:** main @ 558623b3 (v14 مكتملة بأدلة حية 60/60) · **الطلب الموجه:** «جولة اعمق… كل شيء بالتفصيل وبدون استثناء… خذ كل الوقت… خطط ثم نفّذ بمثالية… دفع للرئيسي وانتظار النشر واختبار كامل… عدد كبير من الوكلاء… استفد من المهارات والمشاريع المفتوحة… مجموعة صخمة من المحاكاة»

**البنية:** 14 وكيل تشخيص متوازٍ (D1-D14) + 9 وكلاء تنفيذ متوازيين (E1-E9) بملكية ملفات صارمة + منسّق (تعارضات/بوابات/بطارية/دفع/نشر/أدلة/إنذارات/تقرير).

---

## 0) الحصيلة التشخيصية (14 تقريراً في audit-reports/)

| الوكيل | المحور | حرجة | عالية | متوسطة | منخفضة |
|---|---|---|---|---|---|
| D1 | الراوترات (239 endpoint) | 1 | 5 | 10 | 12 |
| D2 | المحركات (~9300 سطر) | 0 | 4 | 11 | 13 |
| D3 | البيانات/الترحيلات | 0 | 3 | 8 | 10 |
| D4 | مسارات الواجهة (35) | 1 | 6 | 8 | 10 |
| D5 | المكونات + WCAG | 0 | 5 | 7 | 10 |
| D6 | الأمن (اختراق) | 0 | 2 | 4 | 5 |
| D7 | جودة الاختبارات | 3 | 4 | 10 | 3 |
| D8 | الأداء | 0 | 5 | 6 | 9 |
| D9 | التكوين/CI/التوثيق | 1 | 2 | 8 | 12 |
| D10 | مسار المال والبوت | 1 | 5 | 8 | 6 |
| D11 | gstack | 16 قدرة مرتبة | — | — | — |
| D12 | التزامن/السباقات | 0 | 5 | 7 | 12 |
| D13 | تصميم المحاكاة v15 | 14 شخصية · ~199 خطوة · 90 فحص إنتاج | | | |
| D14 | المراقبة/Sentry حياً | 0 | 3 | 8 | 5 |

**الحرجات السبع (تُغلق هذه الجولة):**
- **C-CORE1 (D10):** معالج onboarding لا يشترك في webhooks الصفحة أبداً (`routers/onboarding.py` — `subscribe_page_webhooks` متصلها الوحيد facebook_routes:150) — **البوت ميت من أول رسالة** لمستخدمي المعالج
- **C-BCAST1 (D1):** إرسال البث عبر `spawn()` بعد الرد → لا يُرسل أبداً على Vercel — ميزة مدفوعة تموت صامتة (broadcasts.py:96-99)
- **C-FREE1 (D4):** رحلة الخطة المجانية مسدودة: `price <= 0` يرفض «ادفع الآن (0 د.ل)» (payment/index.tsx:225-228) — القناة الأولى للتسجيل معطلة أمامياً
- **C-GATE1 (D7):** `checkClaim` في البطارية يسجل ولا يفشل شيئاً (55 موقعاً) — «البطارية خضراء» يمكن أن تمر مع ادعاءات حمراء
- **C-DEP1 (D7):** weasyprint ليس في requirements.txt → حارس PDF (v14-E2) معطّل دائماً في CI
- **C-RUFF1 (D9):** بوابة ruff حمراء على main الآن (8-10 أخطاء في test_v14_*.py) — لا توجد نسخة تمر
- **C-5001 (D14 حياً):** **500 إنتاج حقيقي على /api/login** (`int(None)` على token_ver — عائلة server_default المفقودة D3-M2) + قواعد إنذار Sentry غائبة (404)

**العالية الأبرز (تُغلق في موجة التنفيذ):** حدود الخطة لا تُفرض إطلاقاً (D2-H1) · مسار تعليقات webhook بلا بوابة اشتراك ولا عداد (D2-H3) · قيود التفرد السبعة بلا ترحيلة (D3-H1) · عداد replies_used يكذب atomic (D12-H3) · النشر المجدول مرتين (D12-H1) · التسجيل المتزامن = حساب زومبي (D12-H4) · upsert المشترك يسمم المعاملة (D12-H5) · SSRF فجوة DNS (D6-H2) · SSRF flow-webhook (D2-H2) · انتهاء غير متناظر (D10-H1) · skip المعالج CSRF 403 (D4-H1) · 401 عالمية غائبة (D4-H3) · الرمز المقنّع يُرسل للخلفية (D4-H2) · عائلة تباين مصادقة (D5-H1-H5) · كرون cleanup-logs ميت POST-only (D9-H1) · حملات scheduled لا تُرسل (D1-H3) · بطء حقيقي خلفي B1-B4 (D8) · dashboard recent_replies ميتة (D8-X1) · مسار مهاجم كرون بلا توكن رأس (D6-M3) · محرك AI بعميل المنصة (D2-H4)

---

## 1) خريطة الملكية الصارمة — لا يعدّل وكيل ملفاً خارج قائمته

### E1 — نواة البوت وبوابات المال (BACKEND-CORE) · opus
**ملفاته:** `fb_dashboard/bot_engine/engine.py` · `bot_engine/pipeline.py` · `fb_dashboard/app/webhooks.py` · `fb_dashboard/routers/onboarding.py` · `tests/test_v15_money_core.py` (جديد)
**المهام (بالترتيب):**
1. **C-CORE1:** بعد نجاح connect-page في onboarding — استدعاء `subscribe_page_webhooks` عبر عميل المستأجر (نمط facebook_routes.py:150) وإرجاع حالة الاشتراك في الاستجابة + اختبار (نجاح/فشل لا يمنع الحفظ — يُعاد المحاول في heartbeat)
2. **D2-H1 حدود الخطة:** فرض `max_replies` (عبر UsageCounter) و`has_dm` و`has_broadcast` و`has_ai` في نقاط الاستخدام: دورة التعليقات، مسار DM، إنشاء البث، نداء AI — رسالة عربية للمستأجر/سجل عند الرفض + اختبارات سالبة لكل بوابة
3. **D2-H3:** مسار `process_single_comment` (app/webhooks.py:213) — بوابة `_subscription_active()` + زيادة `replies_used` (نفس مسار الرسائل)
4. **D12-H3:** زيادة العداد ذرّياً (نمط `UPDATE usage_counters SET value = value + 1 WHERE ...` أو `credit_wallet` الحرفي) + توحيد الفترة (date-based) + اختبار تزامن gather
5. **D10-H1/H5:** انتهاء متناظر: PAID منتهٍ → تحويل UNPAID عند أول استخدام (وليس انتظار cycle) + رسالة تجديد عربية واحدة للزبون + BotLog + push_notification؛ EXPIRED_TRIAL → ردود أساسية مستمرة (مطابق للتعليق الكودي) — توثيق القرار في الاختبار
6. **D8-B1:** نافذة dedup — استعلام مفهرس مضبوط (tenant + created_at > now-48h + LIMIT) بدل مسح كامل + إصلاح السباق (mark/load)
7. **D8-B4:** ACK الويبهوك — التخزين أولاً ثم الحل/الرد (تقليص المحاولات قبل 200)
8. **D1-H2:** بوابة دور admin/editor على connect-page/first-rule (onboarding.py:54,204)
9. **D1-H4:** connect-page: التقاط IntegrityError → 409 «الصفحة مرتبطة بمساحة أخرى» + اختبار
10. **عقد النداء للبث/الحملات:** في نهاية `cycle()` استدعاء `await broadcast_engine.process_pending(session)` و`await marketing.process_pending_campaigns(session)` (عقود الواجهة في §2)
**بواباته:** `python -m pytest tests/test_v15_money_core.py tests/test_v14_engines.py tests/test_v14_webhook_multi.py -q`

### E2 — تكامل البيانات والترحيلات (BACKEND-DATA) · sonnet
**ملفاته:** `fb_dashboard/models.py` · `alembic/versions/014_v15_integrity.py` (جديد) · `fb_dashboard/_schema_reconcile.py` · `fb_dashboard/sequence_engine.py` · `fb_dashboard/routers/auth.py` · `tests/test_v15_migrations.py` · `tests/test_v15_auth.py` (جديد)
**المهام:**
1. **ترحيلة 014:** قيود التفرد السبعة (uq_sub_tenant_fbuser · customers · tags×2 · subscriber_tags · seq_sub · usage_counters) + **uq_reply_tenant_comment** (D12-H2) — بلهجتي PostgreSQL/SQLite + backfills خصم البيانات المكررة (إبقاء الأحدث ودمج العدادات)
2. **server_defaults المفقودة** (D3-M2): is_platform_admin/token_ver/ال بقية القائمة → في 014 و_schema_reconcile (قيم افتراضية آمنة) — **هذا يغلق C-5001 الحي على /api/login**
3. **D3-H2:** `sequence_engine.subscribe` يضبط tenant_id من السياق + backfill صفوف tenant 0 الموجودة
4. **D12-H4:** فريد `lower(email)` في models + 014 (backfill: كشف التكرارات الحالية) + auth.py: التقاط IntegrityError → 409 عربية + login حتمي
5. **D6-M4:** سقف 5 محاولات/ساعة على change-password لكل مستخدم (نمط _rate_limit القائم)
6. إزالة عمودين الترحيليين الميتين + فهرس scheduled_posts المزدوج (توثيق في 014)
7. reconcile يضيف كل القيود الجديدة (السلطة الفعلية)
**بواباته:** `python -m pytest tests/test_v15_migrations.py tests/test_v15_auth.py tests/test_v13_migrations.py tests/test_v14_migrations.py tests/test_schema_reconcile.py -q`

### E3 — تحصين الراوترات ومدخلاتها (BACKEND-ROUTERS) · sonnet
**ملفاته:** `fb_dashboard/routers/broadcasts.py` · `routers/marketing.py` · `routers/payments/approvals.py` · `routers/payments/wallet.py` · `routers/payments/bank.py` · `routers/payments/plans.py` · `routers/plans_config.py` · `routers/users.py` · `routers/subscribers.py` · `fb_dashboard/broadcast_engine.py` · `tests/test_v15_routers.py` (جديد)
**المهام:**
1. **C-BCAST1:** إرسال البث → claim pattern: تعيين status=pending ثم استدعاء `process_pending` (تنفيذها في broadcast_engine.py: استلام ذرّي `UPDATE SET status='sending' WHERE status='pending' RETURNING` → إرسال → sent/failed) — **عقد الواجهة: `async def process_pending(session) -> int`** (E1 يستدعيها في cycle؛ الـendpoint يرد «في الطابور» فوراً)
2. **D1-H3:** حملات scheduled: نفس النمط — `marketing.process_pending_campaigns(session) -> int` (استلام الحملات المستحقة scheduled→sending→sent)
3. **عائلة D1-H1 في ملفاته:** كل `int(pid)`/`float(amount)`/`request.json()`/`body["key"]` → تحقق Pydantic/صريح → 422 عربية (لا 500 خام) — خصوصاً المسارات المالية الأربعة
4. **D9-H1:** cleanup-logs يقبل GET (كرون Vercel) + **D6-M3:** الترويسة Authorization: Bearer مقبولة و؟token= مهمل مع تحذير
5. **D12-M4:** عائلة spawn-بعد-الرد في ملفاته → inline/BackgroundTasks (إشعارات الدعم، تحليلات)
6. سقوف قوائم مفقودة (scheduled-posts/rules — D8-B6)
**بواباته:** `python -m pytest tests/test_v15_routers.py tests/test_v14_security.py tests/test_phase_b_payments.py -q`

### E4 — التزامن وSSRF وعائلة 409 (BACKEND-CONC) · opus
**ملفاته:** `fb_dashboard/routers/bot.py` · `fb_dashboard/content_calendar.py` · `fb_dashboard/messenger_service.py` · `routers/facebook_routes.py` · `routers/crm.py` · `fb_dashboard/ai_service.py` · `fb_dashboard/flow_engine.py` · `fb_dashboard/agent_engine.py` · `tests/test_v15_concurrency.py` (جديد)
**المهام:**
1. **D12-H1:** النشر المجدول: claim ذرّي قبل Graph (`UPDATE scheduled_posts SET status='publishing' WHERE id=? AND status='scheduled' RETURNING` — نمط approvals.py v9) + نبضان Vercel اليومي ونبضان cron-job.org لا يزدوجان + اختبار interleave
2. **D12-H5:** messenger_service: flush قبل الإرسال + retry عند IntegrityError (ON CONFLICT/إعادة قراءة) + `stored` يضبط بعد الالتزام + اختبار «العميل يرى الرد والداشبورد يرى»
3. **D3-H1 أشقاء:** كل upsert يدوي في ملفاته (facebook/settings ربط مزدوج، crm، inbox tag) → التقاط IntegrityError → 409 عربية (يغلق **D13-F1** نهائياً: البطارية تقلب لاحقاً `SIM_STRICT_409=1`)
4. **D6-H2:** حارس SSRF بفجوة DNS: `_assert_safe_image_url` يحل DNS ويرفض النطاقات الداخلية (RFC1918/link-local/169.254.169.254) — لـai_service + **D2-H2:** فعل webhook في flow_engine يستعمل نفس الحارس + مهلة 10s + سقف حجم 5MB
5. **D2-H4:** agent_engine: بيانات اعتماد لكل مستأجر (get_tenant_fb_client) — لا عميل المنصة العام
6. **D12-M2:** إزالة `_cron_lock` الميت · **D12-M4:** `/api/bot/trigger` صادق (inline محدود أو رسالة واضحة)
7. **D12-M3:** bcrypt/argon2 خارج حلقة الأحداث (to_thread) في المسارات الساخنة إن وجدت في ملفاته
**بواباته:** `python -m pytest tests/test_v15_concurrency.py tests/test_v14_engines.py tests/test_v8_security.py -q`

### E5 — رحلات الواجهة الأمامية (FRONTEND-JOURNEY) · opus
**ملفاته:** `src/components/shared/payment/index.tsx` (+إخوته في shared/payment) · `src/components/auth/AuthGuard.tsx` · `src/lib/api.ts` · `src/app/dashboard/settings/page.tsx` · `src/components/admin/settings/TelegramConfigSection.tsx` (مساره الفعلي) · صفحة تشخيص تليجرام (مسارها الفعلي) · `middleware.ts` · `src/test/AuthGuard*.test.tsx` + `src/test/PaymentFreePlan*.test.tsx` (جديدة)
**المهام:**
1. **C-FREE1:** الخطة المجانية (price=0): زر «تفعيل مجاني» مسار مباشر بلا طرق دفع/إيصال → تأكيد → تفعيل — والخلفية تدعم (تحقق من عقد subscribe: payload plan_id بلا إيصال)
2. **D4-H1:** skip المعالج عبر المغلف المركزي (X-CSRF-Token) — لا fetch خام
3. **D4-H3:** 401 عالمية: المغلف المركزي api.ts يلتقط 401 → redirect /login?redirect=الحالي + toast عربي (بلا حلقات)
4. **D4-H2:** رمز تليجرام: إرساله فقط عند تعديل فعلي (dirty state) — القناع لا يُرسل أبداً
5. **D4-H5:** الأنماط الميتة `if (!res.ok)` (4 ملفات في قائمته) → رسائل detail العربية الحقيقية
6. **D4-H4:** تشخيص تليجرام: مطابقة أسماء FE/BE (linkedAdmins) + dry-run فشل = عرض صادق
7. **D4-middleware:** قائمة Origin من env مع افتراضي آمن (راجع مع D6)
8. تباين رأس نافذة الدفع في ملفه (D5-H2: text-white/70 → توكن صحيح)
**بواباته:** `npx tsc --noEmit` + `npx vitest run src/test/ -q` (لا build — المنسّق يبني)

### E6 — صقل الواجهة: تباين وDلالات (FRONTEND-POLISH) · sonnet
**ملفاته:** `src/app/login/page.tsx` · `src/app/register/RegisterForm.tsx` (مساره) · `src/app/dashboard/messages/page.tsx` · `src/app/dashboard/notifications/page.tsx` · `src/components/ui/badge.tsx` · `src/lib/sentry-config.ts` · `next.config.ts` · أي ملفات صياغة فقط في قائمة D5 (H1/H3/H4/H5/M)
**المهام:**
1. D5-H1/H5: login:175,236 + RegisterForm:131,259 — إزالة /80 → توكن AA (6+:1)
2. D5-H3: أفاتار المحادثات messages:53 — خلفية أغمق أو نص أفتح حتى 4.5:1
3. D5-H4: الإشعارات المقروءة — إزالة opacity-70 عن النص (توكن muted صحيح)
4. دفعة aria-pressed/expanded الناقصة (قائمة D5 M) + dir="auto" المتبقية
5. D14-H2: إصدار الواجهة الحقيقي: sentry-config.ts يقرأ `NEXT_PUBLIC_SENTRY_RELEASE` والبناء يمرر `VERCEL_GIT_COMMIT_SHA` (بوابة next.config.ts env) — الأحداث ترتبط بالإصدار الفعلي
6. حذف التصدير الميت ui/badge (D5-L7)
**بواباته:** `npx tsc --noEmit` + `node scripts/check_contrast.mjs`

### E7 — الأداء والمراقبة (BACKEND-PERF-OBS) · sonnet
**ملفاته:** `fb_dashboard/routers/dashboard_stats.py` · `routers/replies.py` · `fb_client.py` · `fb_dashboard/_observability.py` · `fb_dashboard/config.py` · `fb_dashboard/api_cache.py` · `tests/test_v15_perf.py` (جديد)
**المهام:**
1. **D8-X1:** recent_replies (dashboard_stats.py:131/148) — إصلاح الاستهلاك المزدوج (سطر واحد — بطاقة ميتة حية)
2. **D8-B3:** dashboard_bundle → تجميع استعلام واحد/اثنين + كاش 60s + قراءة snapshot المعجبين بدل نداء Graph حي
3. **D8-B2:** /api/comments — خنق تخطي 30s (نمط inbox v8-A12) + asyncio.gather للصفحات
4. **D8-B7:** dedup_middleware — كاش فعلي أو إزالة صادقة
5. **D14-M3:** scrubber: اسم المستخدم + مضيف DB في request.data/breadcrumbs
6. **D6-M1:** config.py: فشل إقلاع سريع إذا TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=true في production (حارس misconfig M1)
7. **D9-M1:** VERSION → 2.2.0 + محاذاة إصدار Sentry api مع VERSION (عقد واحد)
8. **D14-H3:** توثيق واقع transactions على Vercel (قرار مؤجل إن لم يُصلح)
**بواباته:** `python -m pytest tests/test_v15_perf.py tests/test_v6_observability.py -q`

### E8 — بطارية المحاكاة v15 (SIM) · opus · التصميم: v15-D13-sim-design.md
**ملفاته (جديدة/معدلة):** `e2e/sim-p09..p14-*.spec.ts` (6 جديدة) · `e2e/sim/helpers/*` (توسيع claims) · `e2e/sim/fixtures/sim-findings.json` · `playwright.sim.config.ts` · `scripts/v15_sim_local_battery.sh` · `scripts/v15_postdeploy_battery.sh` · `scripts/v15_sim_rotate_secret.sh`
**المهام:** تنفيذ تصميم D13 حرفياً:
1. **محرك الادعاءات المفروضة (يغلق C-GATE1):** checkClaim يرمي عند الأحمر إلا إذا كان ضمن sim-findings.json (قائمة سماح بإسناد إيجاد + TTL الجولة) — والسكربت المركّب: خروج Playwright || خروج الادعاءات → exit≠0
2. 6 شخصيات جديدة (p09-p14) حسب التصميم + توسيع 8 القديمة بالخطوات الجديدة
3. قلب `SIM_STRICT_409=1` افتراضياً (يعتمد على E4 إغلاق D13-F1)
4. بطارية post-deploy v15: 90 فحصاً (المجموعات I-N/O حسب التصميم)
5. شخصية p14 (تدوير الأسرار) مع سكربت إعادة الإقلاع
**بواباته:** `npx tsc --noEmit` (الأ specs ضمن المشروع)

### E9 — الاختبارات وCI والتوثيق (TESTS-CI-DOCS) · sonnet
**ملفاته:** `requirements.txt` · `tests/test_v14_engines.py` · `tests/test_v14_sse.py` · `tests/test_track_a.py` · `tests/test_v12_contract.py` · `tests/` (إصلاحات skip/مراسي) · `tests/test_v15_admin_deletes.py` (جديد) · `.github/workflows/ci.yml` · `scripts/gate_all.sh` · `.osv-scanner.toml` (جديد) · `scripts/secret_scan.py` (جديد) · `docs/INDEX.md` · `docs/ARCHITECTURE.md` · `README.md` · `CLAUDE.md` · `docs/decisions-ledger.md` (append) · `docs/deployment.md`
**المهام:**
1. **C-DEP1:** weasyprint في requirements.txt (تعليق: حارس PDF خارج حلقة الأحداث v14-E2)
2. **C-RUFF1:** إصلاح 8-10 أخطاء ruff في test_v14_*.py (I001/B007/B905/F841/UP037) + تثبيت نسخة ruff في CI — البوابة تخضر فعلاً
3. **D7-H4:** skip الشرطي المخفي → فشل صريح (test_track_a:84 · test_v12_contract:76)
4. **D7-H3:** اختبارات DELETE: /api/users/{id} و/api/admin/tenants/{id} (سالب + موجب + عزل)
5. **D7-M:** إصلاح المراسي المهشمة (cooldown الفارغ · invoices length>200 · bot_logs after≥before)
6. **D11-القدرات:** (1) سكربت secret-scan بتطبيع Unicode — بوابة CI تمنع تكرار حادثة .env (2) إعداد OSV-scanner config (3) بوابة الجاهزية قبل الدفع في gate_all.sh (REVIEWS/TESTS/DOCS) (4) بوابة نضارة static داخل CI
7. `npm ci` صارم في CI (لا fallback install) · Node 24 ثابت
8. التوثيق الصادق: INDEX صف v15 · README الأعداد الفعلية النهائية · ARCHITECTURE (239 endpoint · 50 جدولاً · الأرقام الحقيقية) · CLAUDE.md اصطلاحات v15 · deployment.md: **إجراء المالك: استعادة قناة cron-job.org 5-دقائق** (شواهد D14-M2) + **تدوير مفاتيح git-history** (D6-H1 — مع بروتوكول one-way-door)
9. ledger append: القرارات الجديدة والمؤجلة (§5)
**بواباته:** `python -m pytest tests/ -q` (الكل) + `ruff check fb_dashboard tests` + `bash -n scripts/gate_all.sh`

---

## 2) عقود الواجهة بين الوكلاء (ملزمة حرفياً)

1. **البث:** `broadcast_engine.process_pending(session: AsyncSession) -> int` — E3 ينفذ، E1 يستدعي في نهاية `cycle()` داخل try/except (فشلها لا يكسر الدورة)
2. **الحملات:** `marketing.process_pending_campaigns(session: AsyncSession) -> int` — ملف routers/marketing.py يستضيف الدالة، نفس العقد
3. **409 العربية الموحدة:** HTTPException(409, detail="...") — نص محدد لكل سياق (الصفحة مربوطة/البريد مسجل/التسلسل موجود)
4. **ترحيلة 014:** chain 013 → 014_revision، down_revision=013 — E2 يملك alembic/versions كاملة
5. **src/lib/api.ts:** E5 يضيف 401-redirect وCSRF مركزياً — E6 لا يقترب من الملف
6. **العدّاد الذري:** استعلام واحد `UPDATE ... SET value = value + 1` مع RETURNING (لا قراءة-ثم-كتابة)

## 3) قواعد عامة لكل وكلاء التنفيذ
- لا تلمس ملفاً خارج قائمتك — إن احتجت: أوقف واذكره في تقريرك (المنسّق يحسم)
- الالتزام بنمط الكود: ok()/err()، عزل مستأجر، عربية الواجهة، لا تبعيات جديدة (weasyprint استثناء موثق E9)
- كل إصلاح أمني/منطقي يقترن باختبار سالب يفشل قبله
- بعد انتهائك: بوابتك المحلية + `ruff check fb_dashboard` إن عدّلت بايثون + `npx tsc --noEmit` إن عدّلت الواجهة
- worklog append-only + تقريرك الكامل: audit-reports/v15-E<n>-<slug>.md
- البطارية يشغلها المنسّق بعد اكتمال الموجة (لا تشغّلها أنت)

## 4) معايير القبول (بوابات المنسّق)
1. gate_all.sh خروج 0 كاملاً (ruff أخضر فعلاً · pytest · tsc · build · vitest · css · i18n · a11y · contrast · نضارة static)
2. الحرجات السبع مغلقة بالكود + اختبار لكل واحدة (و500-الدخول الحي لا يعود)
3. بطارية المحاكاة المحلية: 14 شخصية، ادعاءات مفروضة، exit=0 صادق (أو تعذير موثق بسببه لكل تعطيل خارجي)
4. ≥40 اختباراً جديداً (pytest/vitest/e2e)
5. التزام واحد → دفع → نشر → بطارية post-deploy 90 فحصاً + محاكاة إنتاج + أدلة حية
6. قواعد إنذار Sentry حية (المنسّق ينشئها عبر API) + توثيق إجراءات المالك (cron-job.org · تدوير المفاتيح · purge التاريخ)

## 5) سجل القرارات — تحديثات مرتقبة (append-only)
- إغلاقات بإسناد: dec-sim-battery (التوسعة 14) · عناصر جديدة: dec-cron-restore (إجراء مالك cron-job.org) · dec-git-history-secrets (تدوير+purge — باب أحادي) · dec-wallet-spend (مسار إنفاق المحفظة — منتج) · dec-leads-from-messages (منتج) · dec-trial-journey (منتج) · dec-agent-stack (يبقى مؤجلاً) · dec-transactions-vercel (توثيق واقع)
- استيرادات gstack v15: secret-scan · readiness-gate · evidence-linked · OSV · exit-propagation

## 6) المؤجل بأمانة (خارج نطاق هذه الجولة)
- dec-owner-rotations (عاجل — مالك، بروتوكول one-way-door في deployment.md) · dec-uptime-monitor · dec-browserslist · dec-agent-stack · القرارات المنتجية في §5
