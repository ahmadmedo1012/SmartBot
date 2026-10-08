# تقرير D9 — تدقيق التكوين / CI / التوثيق / الإصدارية (جولة v15)

**الوكيل:** D9 (config/CI/docs/engineering) · **التاريخ:** 2026-09-07 · **الأساس:** main @ 558623b3 (شجرة نظيفة)
**المنهج:** قراءة كل ملفات التكوين + تشغيل البوابات الثابتة حيةً (ruff بأربع نسخ، i18n، a11y-labels، contrast، css-token، عقود الرواتر، pytest كامل مع التغطية) + مطابقة كل رقم موثّق ضد الواقع + تتبّع wiring الإصدار/Sentry. **لا كود تطبيق كُتب.**

> التزمت بقاعدة عدم إعادة الإبلاغ: إغلاقات v14 التي تحققت أنها موجودة وحية (Node 24 في CI، بوابة css-token في CI، عقود ok() متعددة المستويات، حذف vercel-frontend.json — غير موجود فعلاً في الشجرة، بوابة نضارة static داخل gate_all) موثقة في §2 «الصادق/الحي» ولا تُحتسب ضمن الإيجادات.

---

## 0) الملخص التنفيذي

| المؤشر | القيمة |
|---|---|
| إجمالي الإيجادات | **23** = حرج 1 · عالي 2 · متوسط 8 · منخفض 12 |
| أبرز ما انهار | **CI Gate 1 (ruff) أحمر على main الآن** — 8-10 أخطاء في ملفات اختبار v14 نفسها؛ لا توجد نسخة ruff قابلة للتشغيل تمرّ (0.9.6 و0.12.5 و0.16.6 كلها حمراء) → ادعاء v14 «ruff clean» غير قابل لإعادة الإنتاج إطلاقاً |
| ثاني أكبر | **cron تنظيف السجلات اليومي على Vercel ميت بنيوياً** (مسار POST-only يستدعيه Vercel بـ GET → 405 يومياً) |
| ثالث أكبر | **excludeFiles في vercel.json لا يستثني fb_dashboard/static** — الدليل الحي الملتزم في المستودع (بطارية v14: A4/A6/G43) يثبت أن static يُخدَم فعلاً من نطاق API في الإنتاج، عكس ما تقوله ARCHITECTURE.md §6 |
| مقياس الصدق العام | جيد إلى جيد جداً في الأغلب (بوابات v6/v14 الثابتة كلها خضراء حية وأعدادها صادقة: 183/156/112/21)، مع 6 مواضع أرقام متقادمة/منحرفة (README vitest وcontrast، ARCHITECTURE، INDEX) |
| الحالة الحية للبوابات على الشجرة | i18n ✅ · a11y-labels ✅ · contrast ✅ · css-token ✅ · عقود الرواتر ✅ · pytest 622-623+2skip (flake موثق) · تغطية 61.77% ≥ 60 ✅ · **ruff ❌ (8-10 أخطاء)** |

---

## 1) الإيجادات الحرجة

### C1 — بوابة ruff حمراء على main الآن؛ ادعاء «ruff clean» في تقرير v14 غير قابل لإعادة الإنتاج بأي نسخة ruff (والجدار لا يمنع شيئاً)

- **الشدة:** حرج (CI/صدق)
- **المواقع:**
  - الأمر الحاكم: `.github/workflows/ci.yml:49-50` — `run: ruff check fb_dashboard api tests scripts`
  - الأخطاء الثمانية (ruff 0.16.6، نسخة sandbox وCI معاً):
    - `tests/test_v14_engines.py:32:1` — I001 (كتلة استيراد غير مرتبة)
    - `tests/test_v14_engines.py:161:5` — I001
    - `tests/test_v14_engines.py:217:5` — I001
    - `tests/test_v14_engines.py:569:31` — B905 (`zip()` بلا `strict=`)
    - `tests/test_v14_engines.py:811:9` — B007 (متغير حلقة `i` غير مستخدم)
    - `tests/test_v14_engines.py:818:13` — F841 (`uid` معيّن غير مستخدم)
    - `tests/test_v14_sse.py:38:1` — I001
    - `tests/test_v14_sse.py:45:33` — UP037 (اقتباسات في annotation)
- **مقتطف (نموذجي):**
  ```text
  I001 [*] Import block is un-sorted or un-formatted
    --> tests/test_v14_engines.py:32:1
  B905 zip() without an explicit `strict=` parameter
    --> tests/test_v14_engines.py:569:31
  ```
- **الأدلة متعددة النسخ (تفنيد فرضية انحراف النسخة):**
  - ruff **0.16.6** → 8 أخطاء (خروج 1)
  - ruff **0.12.5** → 10 أخطاء
  - ruff **0.9.6** → 10 أخطاء
  - ruff **0.8.6** و**0.6.0** (أرضية requirements.txt) → لا يعملان أصلاً: `Unknown rule selector: UP045` (القاعدة غير موجودة قبل 0.9)
  - الخلاصة: **كل نسخة ruff قادرة على قراءة ruff.toml ترفض الشجرة الحالية** — إذن «ruff | clean» في `docs/reports/v14-world-class-report.md:68` (§4) لا يمكن أن يكون صحيحاً على الشجرة النهائية. الملفان المخالفان دخلا في التزام v14 نفسه (541b7585) — غالباً أُضيفا بعد آخر تشغيل للبوابة ولم يُعَد تشغيل ruff.
- **تفاقم إنفاذي (لماذا «أحمر» لا يوقف شيئاً):**
  1. `requirements.txt:35` — `ruff>=0.6.0` غير مثبّت الإصدار + `ci.yml:47` يضيف `pip install ruff` مجرداً (غير مثبّت أيضاً ومكرر) → بوابة غير حتمية النسخة أصلاً.
  2. `docs/branch-protection.md` يجعل required status checks **اختيارية** («اختياري لكن موصى به») وسير العمل الموثق = push مباشر إلى main → CI الأحمر لا يمنع الدفع/النشر.
  3. `ci.yml:20-22` — `cancel-in-progress: true`: دفعة ثانية سريعة تُلغي تشغيل الأولى فتختفي النتيجة أصلاً.
- **الإصلاح المقترح:**
  1. `ruff check --fix` (5 من 8 قابلة للإصلاح الآلي) + ترميب البقية يدوياً (B905 → `strict=False` صريح، B007 → `_i`، F841 → حذف).
  2. تثبيت `ruff==0.16.*` في requirements (ورفع الأرضية من 0.6.0 غير الصالحة).
  3. حذف سطر `pip install ruff` المكرر من CI.
  4. تفعيل required status checks على main (بند المالك في branch-protection.md) قبل نهاية v15.

---

## 2) الصادق/الحي (تحققت حية — منع إعادة الإبلاغ)

| الادعاء | التحقق الحي |
|---|---|
| بوابة i18n: «183 ملفاً / 0 خرق» | ✅ `python scripts/check_i18n_calls.py` → PASS (183 ملفاً) |
| بوابة a11y-labels على Node 24 | ✅ `node scripts/check_a11y_labels.ts` → 0 عناصر مجهولة (156 ملفاً) — Node 24.19.0 |
| بوابة contrast AA بالوضعين | ✅ 28 زوجاً كلها ≥ 4.5:1 (لاحظ: README يقول 30 — انظر M4) |
| بوابة css-token: «112 خاصية» | ✅ `OK: 112 unique custom properties` |
| عقود الرواتر متعددة المستويات (v14-E8) | ✅ نسخت نسخة CI 5e حرفياً → `router contracts: OK` |
| CI Node 24 (إغلاق v11-D11) | ✅ `ci.yml:71` node-version: 24 |
| حذف vercel-frontend.json (v14-E8) | ✅ غير موجود في الشجرة |
| بوابة نضارة static داخل gate_all (v14) | ✅ `gate_all.sh:84-116` — لكنها ليست في CI (انظر M2) |
| عدّاد 624+ pytest | ~✅ يجمع 625؛ تشغيل كامل حي: 622-623 passed + 2 skipped (فشل عابر واحد عابِر يزول بإعادة التشغيل = فئة flake الموثقة v13؛ D7 أثبت 623+2skip) |
| تغطية ≥ 60 | ✅ 61.77% حية (التعليق يقول 50 — انظر M8) |
| viewport-sweep «21/21 (375/768/1440)» | ✅ حساب صادق: 7 مسارات × 3 عروض = 21 |
| a11y-sweep «7/7 صفحات» | ✅ `PAGES` = 7 مسارات عامة فعلاً |
| alembic حتى 013 | ✅ 13 ترحيلة، آخرها 013 |
| `.npmrc` legacy-peer-deps (ادعاء getting-started) | ✅ موجود بالتعليق المبرر |
| روتا كرون heartbeat/bot-cycle | ✅ كلتاهما GET (bot.py:110,169) — تتعارض فقط مع cleanup-logs (H1) |
| MobileBottomNav موصول في DashboardShell | ✅ (DashboardShell.tsx:6,66) — قاعدة CLAUDE.md متزامنة |
| static الموثق 115 ملفاً | ✅ 115 ملفاً متتبعاً (uploads/ مستثنى صحيحاً في .gitignore:42) |
| كل متغير بيئة في .env.example له قارئ فعلي · كل متغير يقرؤه الكود موثّق في installation.md | ✅ جرد كامل (incl. DB_SSL_VERIFY, INITIAL_ADMIN_*, SUPPORT_*, API_PUBLIC_URL — كلها حية) |

---

## 3) الإيجادات العالية

### H1 — كرون Vercel اليومي لتنظيف السجلات ميت بنيوياً: مسار POST-only يستدعيه Vercel بـ GET → 405 كل يوم

- **الشدة:** عالي (عمليات/نمو بيانات)
- **المواقع:** `vercel.json:93-97` + `fb_dashboard/routers/plans_config.py:218`
- **المقتطفات:**
  ```json
  "crons": [
    { "path": "/api/cron/cleanup-logs", "schedule": "0 3 * * *" },
    { "path": "/api/cron/heartbeat",    "schedule": "0 4 * * *" }
  ]
  ```
  ```python
  @router.post("/api/cron/cleanup-logs")          # plans_config.py:218
  async def cleanup_old_logs(request: Request, token: str = Form("")):
      """…Vercel Cron calls this daily at 03:00 UTC via vercel.json config."""
  ```
- **السلسلة:** كرونات Vercel تستدعي المسار بـ **GET حصراً** (سلوك Vercel الموثق؛ ولذلك صُمم heartbeat وbot-cycle بـ GET ويعملان). GET على مسار POST-only يسقط في `spa_catch_all` (app/spa.py:58-73) الذي يردّ **405 + Allow: POST** — نفس السلوك الموثق في بطارية v14 (F37). أي: **منذ تعريف الكرون، يستدعي Vercel المسار يومياً ويُصفع بـ405** — حذف BotLog>30 يوماً + RateLimitEntry المنتهية لا يحدثان عبر القناة المعلنة. (تنقية Blacklist محمية جزئياً عبر purge عند الإقلاع — startup.py:224-230.)
- **المفارقة التوثيقية:** الـdocstring نفسه يقول «Vercel Cron calls this daily» وأضاف Bearer («what Vercel Cron actually sends» — plans_config.py:225-227) أي أن المؤلف درس توثيق Vercel وفاته **الفعل** GET فقط؛ و`docs/deployment.md:117` يعد بأن «تنظيف السجلات… cron يومي 03:00 (معرّف في vercel.json)» — وعد غير منفَّذ فعلياً.
- **الإصلاح:** قبول GET بجانب POST (`@router.api_route(..., methods=["GET","POST"])` مع نفس حارس Bearer/CRON_SECRET) أو تحويل الكرون إلى مسار GET مخصص؛ ثم التحقق مرة واحدة من سجلات Vercel (Cron Jobs tab) أن الاستدعاء 200.

### H2 — excludeFiles لا يستثني fb_dashboard/static من حزمة الـAPI رغم نصّه الصريح — الدليل الحي الملتزم يثبت خدمة static من نطاق API، عكس ARCHITECTURE.md §6

- **الشدة:** عالي (تكوين لا يفعل ما يقوله + توثيق يكذب على الواقع + انتفاخ حزمة)
- **المواقع:** `vercel.json:85-92`:
  ```json
  "functions": {
    "api/*.py": {
      "includeFiles": "fb_dashboard/**",
      "excludeFiles": "{fb_dashboard/frontend/**,fb_dashboard/static/**,__pycache__/**,**/.pytest_cache/**,tests/**,mobile/**,docs/**,e2e_artifacts/**,.playwright-mcp/**,*.md,*.db,botlogo.png}"
    }
  }
  ```
- **الدليل الحي (من ملف أدلة v14 الملتزم):** `docs/evidence/v14/post-deploy-verification.txt`:
  - `A4 api domain root 200 (synced static)` — سكربت البطارية (`scripts/v14_postdeploy_battery.sh:129`) يستخرج رابط chunk من HTML جذر نطاق API: `TA=$(curl -s "$API/" | grep -oE '/_next/static/…chunks/….js')` — استخراج ناجح ⇒ جذر API يقدّم **index.html الحقيقي** (لا placeholder `spa.py:34`) ⇒ `STATIC_DIR` موجود في حزمة الـLambda.
  - `A6 K4 skip-link on 404 (api domain)` — 404.html الحقيقي يُقدَّم من نطاق API (البطارية تفحص `id="page-content"`).
  - `G43 api chunk immutable ✅` — `/_next/static/chunks/*.js` يُخدَم من نطاق API بترويسة immutable.
- **السبب الأرجح:** دلالات Vercel — **includeFiles تتغلب على excludeFiles**؛ `includeFiles: "fb_dashboard/**` يعيد إدخال `fb_dashboard/static/**` و`fb_dashboard/frontend/**` (المستثنيين نصاً) إلى الحزمة. (احتمال مساعد: النمط المفرد الملفوف بأقواس قد لا يُفك كسلسلة بدائل أصلاً.)
- **الأثر:**
  1. نية «حزمة API نحيفة» (وعد `docs/ARCHITECTURE.md:62`: «يشمل fb_dashboard/** ويستثني frontend/static/tests/docs») **غير محققة** — مصدر الواجهة كاملاً + 115 ملف بناء static تُحزم داخل Lambda بايثون (ذاكرة 512MB).
  2. `docs/ARCHITECTURE.md:68`: «fb_dashboard/static/ يُخدم محليًا فقط… Vercel لا يستخدمه» — **مكذوب بأدلة المستودع نفسه** (وقد انتقل هذا الاعتقاد إلى تأطير D6-M2).
  3. استثناءات ميتة إضافية في نفس السطر: `mobile/**` (مجلد غير موجود + gitignored)، `botlogo.png` (غير موجود في الجذر).
- **ملاحظة معاكسة تُحسب للتكوين:** كون alembic/ وalembic.ini (جذر المستودع، غير مستثنيين) داخل الحزمة يجعل ادعاء deployment.md:51 «الترحيلات تُطبَّق تلقائياً عند الإقلاع» **معقولاً ومتسقاً** مع آلية lifespan (startup.py:199-217).
- **الإصلاح:** حذف `includeFiles` (الافتراضي يشمل المستودع كله للـPython) والإبقاء على excludeFiles فقط، أو تعداد includeFiles بمسارات دقيقة بلا static/frontend؛ ثم `vercel inspect` للتأكد، وتصحيح سطرَي ARCHITECTURE.md 62 و68 (وتنبيه D6-E-wave بأن /static مفتوح على نطاق API في الإنتاج — uploads مستثناة لأنها غير متتبعة، لكن أي شيء يُلتزم تحت static يصبح عاماً).

---

## 4) الإيجادات المتوسطة

### M1 — الإصدارية مجمدة منذ v6+ وإصدار Sentry للـAPI يبلع 8 جولات في release واحد

- **المواقع:** `fb_dashboard/VERSION` (= 2.1.0، آخر تعديل: التزام v6+ `71c62c83` بتاريخ 2026-09-06) · `fb_dashboard/_observability.py:162` (`release = os.getenv("SENTRY_RELEASE", "").strip() or app_version()`) · `fb_dashboard/frontend/package.json:8` (build script: `SENTRY_RELEASE=$(git rev-parse --short HEAD)`).
- **الواقع (من أدلة v14: sentry-canary-and-deploy):** `smartbot-api` release = **2.1.0** (semver مجمّد — كل أحداث v7→v14 تحت وسم واحد، لا يمكن عزو خطأ API إلى التزام معيّن) بينما `smartbot-web` release = **541b7585** (SHA لكل نشر). استراتيجيتان مختلفتان للمشروعين المتكاملين؛ و`/api/health` يردّ 2.1.0 منذ 9 أيام و8 جولات.
- **الإصلاح:** إمّا رفع VERSION مع كل جولة (عملية مالكة بسيطة) أو حقن `SENTRY_RELEASE=VERCEL_GIT_COMMIT_SHA` في متغيرات مشروع API على Vercel (موازٍ لآلية الواجهة) — والثاني أرخص وأدق.

### M2 — بوابة نضارة static ليست في CI رغم أن CI يبني — فئة حادثة v12 تعبر جدار الإنتاج

- **المواقع:** `.github/workflows/ci.yml:125-126` (Gate 4 = `npx next build` ثم انتهاء) مقابل `scripts/gate_all.sh:84-116` (البوابة 4.5 موجودة هنا فقط).
- **السيناريو:** مطوّر يعدّل الواجهة ويدفع دون تشغيل gate_all محلياً → CI أخضر بالكامل (يبني .next ولا يقارنه بشيء) → push مباشر → **نطاق API يقدّم static متقادماً** — نفس فئة docs/reports/v12-world-class-report.md §0.1 التي بُنيت البوابة لأجلها. CI يملك كل المكونات (بعد build) ولا يشغّلها.
- **الإصلاح:** خطوة CI بعد Gate 4: `python scripts/sync_next_static.py` + نفس فحص buildId/الأجيال القديمة من gate_all (مقارنة `git status --porcelain fb_dashboard/static` يجب أن تكون فارغة بعد sync إن كانت الشجرة محدّثة — أو تحويل الفحص إلى «buildId الحالي ملتزم في الشجرة»).

### M3 — `npm ci || npm install` في CI يبتلع انحراف lockfile (أخضر مع lockfile مكسور)

- **الموقع:** `.github/workflows/ci.yml:74`.
- **السلوك:** إن فشل `npm ci` (lockfile غير متزامن مع package.json — وهو بالضبط ما يكتشفه npm ci)، يسقط التنفيذ إلى `npm install` الذي «يصلح» الأمر بصمت ويكمل البوابات خضراء بينما الملف الملتزم في المستودع خاطئ، وكل بيئة CI تالية تكرر نفس الإخفاء. هذه فئة v14 نفسها: «بوابة خضراء وهي مكسورة».
- **الإصلاح:** `npm ci` فقط (الفشل = فشل بوابة صادقة). .npmrc بـlegacy-peer-deps موجود ويجعل npm ci سليماً على استنساخ نظيف (تحققت).

### M4 — README: أرقام متقادمة/خاطئة + خلط بوابات CI ببوابات يدوية تحت عنوان «تعمل آلياً»

- **المواقع (README.md):**
  - `:57` — «vitest … 23 ملفًا / 184 اختبارًا (v13)»: الواقع **25 ملفاً / 210 اختبارات** (عددت الملفات حيةً = 25؛ D7 شغّلها حيةً = 210). السطر نجا من تحديث E8 رغم أن السطر نفسه يقول «ترتفع كل جولة».
  - `:63` — «تباين AA … 30/30 توليفة»: العدد الفعلي للبوابة الحية = **28** (14 داكن + 14 فاتح).
  - `:46` العنوان «بوابات الجودة (…) — تعمل آليًا على كل push/PR عبر GitHub Actions» ثم صفوف `:59-60` (a11y-sweep 7/7 · viewport-sweep 21/21) وهما **ليستا في CI ولا gate_all** — بوابات يدوية يتطلب تشغيلها خادماً حياً.
- **الإصلاح:** تحديث 184→210 و23→25 و30→28؛ فصل عمود «أين تعمل: CI / gate_all / يدوي» في الجدول.

### M5 — بوابة ميزانية JS غير موصولة بأي جدار رغم إدراجها في جدول بوابات v14

- **المواقع:** `scripts/measure_bundle.py` (موجود ومحكم) — لا يستدعيه `.github/workflows/ci.yml` ولا `scripts/gate_all.sh` ولا CLAUDE.md؛ المستدعون الوحيدون: `scripts/v13_fill_report.py` (تعبئة تقرير) وتقرير v13.
- **الأثر:** الجدول في `docs/reports/v14-world-class-report.md:63` («ميزانية JS 187.3KB ≤ 190KB — PASS») يوحي ببوابة قائمة وهي قياس يدوي لمرة واحدة — أي انحدار ميزانية (187→190+) يعبر CI بصمت. (ملاحظة: خط الـ750KB الخام في بطارية post-deploy فحص مختلف ويعمل ضمنها.)
- **الإصلاح:** سطر واحد في gate_all بعد build: `python scripts/measure_bundle.py` مع عتبة فشل.

### M6 — INDEX.md متأخر خطوة عن الواقع (وv15 غير ممثلة)

- **المواقع (docs/INDEX.md):** `:7` — «**v14** — الجولة الجارية… تقريرها سيُضاف إلى reports/ عند اكتمال البوابات والنشر» بينما التقرير ملتزم منذ 558623b3 (والبطارية 60/60 مكتملة)؛ وجدول التقارير `:46-48` يبدأ عند v13 **بلا صف لتقرير v14** رغم أن التزام 541b7585 حدّث INDEX نفسه (+27 سطراً — خطط فقط). حُدِّث الفهرس للخطط ولم يُحدَّث للتقرير اللاحق في 558623b3.
- **الإصلاح:** صف v14 في جدول التقارير + سطر v15 (خطط/تقارير audit-reports) عند بدء الجولة — بند روتيني لكل منسّق.

### M7 — getting-started: «Node.js 20+» بينما سلسلة الأدوات تتطلب ≥23.6 (وCI نفسه يوثق أن 20 يفشل)

- **المواقع:** `docs/getting-started.md:10` — «Node.js | 20+ (مبني ومختبر على 24)» مقابل `.github/workflows/ci.yml:65-68` — «type stripping requires Node >=22.6 / >=23.6؛ Node 20 fails it» و`CLAUDE.md:55` — «Gates/CI run on Node 24… Node 20 cannot run it».
- **الأثر:** مساهم يثبّت Node 20 (LTS شائع) بناءً على دليل البدء → بوابة a11y-labels حمراء محلياً بلا سبب مفهوم له — تناقض توثيقي من فئة v14 نفسها (doc يقول X والبوابة تتطلب Y).
- **الإصلاح:** «Node.js 24+ (متطلب بوابة a11y-labels؛ ≥23.6 حدّ أدنى تقني)».

### M8 — تعليق بوابة التغطية يقول 50% والأمر يفرض 60% (في مكانين)

- **المواقع:** `.github/workflows/ci.yml:56-57` — «v10-F3: coverage floor **50%** — measured 52% at v10» ثم `--cov-fail-under=**60**`؛ نفس التضارب في `scripts/gate_all.sh:27-28`.
- **الواقع الحي:** التغطية 61.77% والعتبة 60 تعمل — التعليق فقط متقادم (رفعت العتبة لاحقاً دون تحديث السرد).
- **الإصلاح:** توحيد التعليق مع القيمة (60، مقاسة 61.77 في v15).

---

## 5) الإيجادات المنخفضة

| # | الإيجاد | الموقع + مقتطف | الإصلاح |
|---|---|---|---|
| L1 | تعليق runner.py يصف excludeFiles بالمقلوب: يدّعي أن includeFiles «يحزم» static — متسق مع H2 لكنه كُتب كضمان خاطئ | `fb_dashboard/runner.py:313-314` — `# ponytail: Vercel includeFiles bundles fb_dashboard/static/** but the Python function may see files at a different path` | حذف التعليق بعد تسوية H2 |
| L2 | استثناءات ميتة في vercel.json: `mobile/**` (غير موجود + gitignored) و`botlogo.png` (غير موجود في الجذر) و`e2e_artifacts/**` (غير موجود) | `vercel.json:90` | تنظيف القائمة إلى ما له وجود |
| L3 | سكربت lint ميت: `next lint` أُزيل من Next 16، ولا توجد أي حزمة ESLint في devDependencies أصلاً | `fb_dashboard/frontend/package.json:10` — `"lint": "next lint"` | حذف السكربت أو إضافة ESLint CLI (eslint + eslint-config-next) كسكربت `eslint .` |
| L4 | strictNullChecks معطلة بوعد متقادم: «v9: enable next round» — مرّت 6 جولات (v10→v15) | `fb_dashboard/frontend/tsconfig.json:12` — `"strictNullChecks": false, // v9: null-safety migration deferred — enable next round` | إما تنفيذها كموجة مستقلة أو تحديث التعليق إلى قرار مؤجل بلا موعد |
| L5 | .env.example ينقصه 11 متغيراً موثقاً في installation.md فقط (INITIAL_ADMIN_USERNAME/PASSWORD · SUPPORT_EMAIL/PHONE/WHATSAPP/WORKING_HOURS · SENTRY_DSN/BOOT_CANARY/ENVIRONMENT/RELEASE/TRACES_SAMPLE_RATE · DB_SSL_VERIFY · API_PUBLIC_URL) + سطر `NEXT_PUBLIC_API_HOST` المعطّل ما زال موجوداً رغم أن README:44 يقول «حُذف من التوثيق في v14» | `.env.example:70` | نقل المتغيرات الاختيارية كأسطر معلّقة إلى .env.example (قيم فارغة) وحذف سطر NEXT_PUBLIC_API_HOST نهائياً |
| L6 | conftest يضبط متغيرين بلا أي قارئ في الكود (أسماء مهجورة ما قبل الحزمة) | `conftest.py:38-39` — `os.environ["FB_ACCESS_TOKEN"] = "test-token"` / `os.environ["FB_PAGE_ID"] = "0"` | حذفهما (القارئ الفعلي FACEBOOK_ACCESS_TOKEN/FACEBOOK_PAGE_ID عبر pydantic) |
| L7 | ARCHITECTURE.md أرقام حقبة v5 رغم ترويسة «يصف الكود كما هو فعلًا»: «25+ ملف مسارات» (الواقع 43) · «~40 نموذج» (الواقع 48) · «تسجيل 25+ router» (الواقع 38 include_router) | `docs/ARCHITECTURE.md:2,31,34,35` | تحديث الأعداد أو إضافة تاريخ/إصدار مرجعي |
| L8 | عدّاد endpoints غير معاير بين الجولات: v14-D5 قال 250، D1-v15 قال 239، والقياس الميكانيكي = 243 decorator على الرواتر + ~19 مساراً على مستوى runner (صحة/كرون/webhook/أصول الجذر/catch-alls) | لا يتطلب إصلاح كود — يحتاج تعريف عدّ موحد | اعتماد تعريف واحد (مثلاً: handlers داخل routers/ = 243) وتوثيقه في ARCHITECTURE |
| L9 | CI بلا آلية إعادة محاولة للـflake الموثق بينما gate_all لديه retry واحد — فشل عابر واحد (حدث فعلاً في تشغيلي: test_v14_webhook_multi واحد) يحمّر Gate 2 في CI | `.github/workflows/ci.yml:58-62` مقابل `gate_all.sh:30-43` | نقل نفس سياسة «إعادة واحدة شفافة» إلى CI (أو إصلاح جذر فئة database-is-locked) |
| L10 | تسمية سكربتات البوابات غير متجانسة: شرطات مقابل شرطات سفلية | `scripts/check-css-token-duplication.py` مقابل `scripts/check_i18n_calls.py` | تجميلي: توحيد التسمية عند أول لمسة |
| L11 | setup-node بلا `cache: npm` — CI أبطأ من اللازم بلا سبب (lockfile موجود ومستقر) | `.github/workflows/ci.yml:69-71` | إضافة `cache: npm` و`cache-dependency-path: fb_dashboard/frontend/package-lock.json` |
| L12 | أرضية ruff في requirements غير صالحة: `ruff>=0.6.0` — النسخ 0.6-0.8 تتعطل على ruff.toml نفسه (`Unknown rule selector: UP045`) + تثبيت مزدوج في CI | `requirements.txt:35` + `ci.yml:47` | تثبيت `ruff==0.16.*` (يغلق أيضاً نصف C1) |

---

## 6) خريطة البوابات — أين تعمل فعلاً (أجوبة سؤال المهمة المباشر)

| البوابة | CI (push/PR) | gate_all.sh | يدوي/لا مكان |
|---|---|---|---|
| ruff | ✅ (`ci.yml:49`) — **حمراء الآن (C1)** | ✅ | — |
| pytest أمامي + عكسي + تغطية 60 | ✅ (`:58-62`) | ✅ (أمامي فقط + retry) | — |
| tsc | ✅ (`:118`) | ✅ | — |
| vitest | ✅ (`:123`) | ✅ | — |
| next build | ✅ (`:126`) | ✅ (قابل للتخطي بعلم) | — |
| i18n seam | ✅ (`:78`) | ✅ | — |
| a11y labels (Node 24) | ✅ (`:82`) | ✅ | — |
| contrast AA | ✅ (`:86`) | ✅ | — |
| css-token | ✅ (`:91`) | ✅ | — |
| عقود ok()/fail() متعددة المستويات | ✅ (`:102-115`) | ✅ | — |
| **sync static + نضارة buildId** | ❌ **(M2 — فجوة الجدار)** | ✅ (`:84-116`) | — |
| **ميزانية JS (measure_bundle)** | ❌ | ❌ | قياس يدوي (M5) |
| a11y-sweep (axe) | ❌ | ❌ | يدوي (README يوهم خلافه — M4) |
| viewport-sweep | ❌ | ❌ | يدوي (21/21 = 7×3 صادقة) |
| e2e/journey + sim battery | ❌ (مقصود — مكدس مزدوج) | ❌ | سكربتات مخصصة (D7 يملك جودة ادعاءاتها) |

**الجواب الصريح على «أي بوابة يمكن أن تمر خضراء وهي مكسورة»:** ثلاث حالات مثبتة — (1) ruff نفسها **حمراء ومكسورة الآن** والجدار الإنفاذي (حماية فرع اختيارية + push مباشر + cancel-in-progress) يمرّرها؛ (2) `npm ci \|\| npm install` يخضّر lockfile منحرفاً (M3)؛ (3) غياب sync/النضارة من CI يجعل فئة حادثة v12 تعبر خضراء (M2). أخطاء فئة v14 (Node قديم/نطاق glob) **لم تعد موجودة** — Node 24 حي والعقود متعددة المستويات تعمل وتغطي payments/ (تحققت حية).

---

## 7) جدول مقياس الصدق — الأرقام الكبيرة (ادّعاء ↔ واقع)

| الرقم | المصدر | الواقع المقيس | الحكم |
|---|---|---|---|
| pytest 624+ | README:7,25 | 625 مجمّعة؛ 622-623 passed + 2 skipped حيةً | صادق ضمنياً (D7 يوثق تفصيل عدم قابلية استنساخ 624/1skip) |
| vitest 23/184 «(v13)» | README:57 | 25 ملفاً / 210 اختبارات | **متقادم** (M4) |
| contrast «30/30» | README:63 | 28 زوجاً (14+14) | **منحرف -2** (M4) |
| i18n 183 ملفاً / a11y 156 / css 112 | v14 §4 + README | 183/156/112 حيةً | صادق تماماً |
| build «41/41 routes» | v14 §4:62 | 35 صفحة + ميتاداتا/404 → 41 معقولة | متسق (غير قابل للتحقق محلياً بلا node_modules) |
| endpoints 250 (v14-D5) / 239 (v15-D1) | التقريران | 243 decorator بالرواتر + 19 على runner | انحراف منهجية (L8) |
| جداول 49 (D3/v14) / «45+» (installation) / «~40» (ARCHITECTURE) | 3 مستندات | 48 (`__tablename__`) | ARCHITECTURE متقادم (L7)؛ 49 يحتاج تعريف D3 (غالباً يعدّ شيئاً إضافياً) |
| رواتر «25+» / «40+» | ARCHITECTURE:34 / installation:16 | 43 ملفاً في routers/ (+logs_api) · 38 include_router | installation صادقة، ARCHITECTURE متقادمة (L7) |
| static «115 ملفاً» | v14 §4:69 | 115 متتبعاً حيةً | صادق |
| Node 24 | v14-E8 + CLAUDE.md:55 | ci.yml:71 ✅ لكن getting-started يقول 20+ | تناقض داخلي (M7) |
| «ruff clean» | v14 §4:68 | 8-10 أخطاء بأي نسخة قابلة للتشغيل | **غير صادق** (C1) |
| Sentry api release 2.1.0 «حية» | v14 §9:110 | صادق كإطلاق — لكن مجمّد منذ v6+ (M1) | صادق الوصف، معلّق الزمن |

---

## 8) توصيات موجة التنفيذ (E-wave، بترتيب الأولوية)

1. **E-CI-1 (يغلق C1+L12):** `ruff --fix` + الترميب اليدوي (5 دقائق) + تثبيت ruff==0.16.* + حذف السطر المكرر في CI + (مالك) تفعيل required checks على main. **بدونها كل جولات CI القادمة ستبدأ حمراء وتُتجاهل.**
2. **E-CI-2 (يغلق H1):** قبول GET في /api/cron/cleanup-logs + تحقق واحد من سجل كرون Vercel (أو نقله لمسار GET مخصص) — يوقف نمو BotLog/RateLimitEntry الإنتاجي اليومي.
3. **E-CI-3 (يغلق H2+L1+L2):** إصلاح includeFiles/excludeFiles + `vercel inspect` للتدقيق + تصحيح ARCHITECTURE.md:62,68 + تنبيه مسار D6-E لملكية /static على نطاق API.
4. **E-CI-4 (يغلق M2+M3+M5):** خطوة sync+نضارة بعد build في CI · `npm ci` بلا سقوط · سطر measure_bundle في gate_all.
5. **E-CI-5 (يغلق M1):** SENTRY_RELEASE=VERCEL_GIT_COMMIT_SHA لمشروع API (متغير Vercel، لا كود).
6. **E-DOCS-1 (يغلق M4+M6+M7+L5+L7):** جولة تحديث أرقام واحدة (README vitest/contrast/عمود «أين تعمل»، INDEX صف v14+v15، getting-started Node 24+، .env.example المتغيرات الـ11+حذف NEXT_PUBLIC_API_HOST، أعداد ARCHITECTURE).
7. **E-CI-6 (يغلق L9):** سياسة إعادة المحاولة الواحدة في CI كما في gate_all — أو إغلاق جذر فئة flake مع D7.

---

## 9) ملحق — الأوامر التنفيذية المستخدمة (قابلية إعادة الإنتاج)

```bash
.venv/bin/ruff check fb_dashboard api tests scripts            # 8 أخطاء (0.16.6) — نفس أمر CI
ruff==0.12.5 / 0.9.6 / 0.8.6 / 0.6.0 بنفس الأمر                 # 10 / 10 / UP045-crash / UP045-crash
.venv/bin/python scripts/check_i18n_calls.py                    # PASS 183
node scripts/check_a11y_labels.ts (من frontend)                 # PASS 156
node scripts/check_contrast.mjs                                 # PASS 28 زوجاً
.venv/bin/python scripts/check-css-token-duplication.py         # OK 112
(نسخة حلقة 5e من ci.yml حرفياً)                                  # router contracts: OK
.venv/bin/python -m pytest -q --cov=fb_dashboard --cov-fail-under=60   # 622-623+2skip · 61.77% · فشل عابر واحد (يعود للنجاح معزولاً)
pytest --collect-only -q | tail                                  # 625 tests collected
git log --follow -- fb_dashboard/VERSION                        # آخر لمسة v6+ (71c62c83)
find src/app -name "page.tsx" | wc -l                           # 35
rg -c "app.include_router\(" runner.py                          # 38
rg -c "__tablename__" models.py                                 # 48
```

**ملاحظة منهجية:** node_modules غير مثبتة في بيئة v15 الحالية (التنسيق قيد الإعداد) — لذا لم أشغّل tsc/vitest/build محلياً؛ اعتمدت فيهما على تشغيل D7 الحي (vitest 210) وعلى قراءة نص أوامر CI نفسها، والبقية مثبتة أعلاه بأوامر مباشرة.
