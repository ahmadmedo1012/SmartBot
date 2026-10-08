# تقرير D14 (v15) — تدقيق المراقبة/الرصد/الصحة الإنتاجية

**الوكيل:** D14 (observability / monitoring / production health) · **الأساس:** main @ 558623b3 · **التاريخ:** 2026-09-07T17:04Z
**المنهجية:** قراءة كاملة لملفات الرصد الخلفية (`_observability.py`, `monitor.py`, `diagnostics.py`, `routers/diagnostics.py`, `routers/health_alerts_routes.py`, `routers/bot.py` (cron), `routers/plans_config.py` (healthz/cleanup), `app/errors.py`, `app/middleware.py`, `app/startup.py`, `runner.py` health probes) + واجهة (`src/lib/sentry-config.ts`, `src/instrumentation.ts`, `src/instrumentation-client.ts`, `next.config.ts`, error boundaries) + **استعلامات حية لـ Sentry API** (eu-api.sentry.io، org `subnation`، للفحص فقط) + قياسات إنتاج حية بالـ curl على النطاقين. لا كود تطبيق كُتب.

---

## 0) الخلاصة التنفيذية

البنية المحلية للرصد (كود) صلبة ومختبرة (64 اختباراً)، لكن **الطبقة الحية في الإنتاج تنهار في ثلاث زوايا**: (1) **لا قواعد إنذار Sentry على مشروعي SmartBot إطلاقاً** — والإغلاق الموثق في السجل (v12/v13) **غير موجود فعلياً في الـ API** (404)؛ (2) **ربط release الواجهة ميت** — 100% من أحداث الواجهة بلا release، والـ release `541b7585` المزعوم في تقرير v14 غير موجود في Sentry أصلاً؛ (3) **صفر transactions** رغم traces_sample_rate=0.05 — لا بيانات أداء/زمن استجابة إطلاقاً. وبينما أكتب هذا: **الإنتاج فيه خطأ 500 حي على /api/login** (متوقع من D1-H1/D3: `int(None)` على `token_ver` في قاعدة legacy) و**توكن فيسبوك منتهي منذ 2026-09-05** يجعل دورة البوت مكسورة بصمت — والإشارة الوحيدة لهما موجودة في مشروع Sentry لا ينذر أحداً.

**الحصيلة:** 16 إيجاداً = **0 حرج · 3 عالي · 8 متوسط · 5 منخفض** + إثباتات حية تُغلق أسئلة معلقة (D6: قاعدة الإنتاج الحية ليست المضيف المسرب في git) وتؤكد صحة تنبؤات D1/D3 بأدلة إنتاج.

---

## 1) لقطة Sentry الحية — آخر 48 ساعة (أدلة API)

> كل الاستعلامات عبر `GET https://eu-api.sentry.io/api/0/...` بتوكن الفحص. مشروع `smartbot-api` أُنشئ 2026-09-06T03:20Z (عمره ~38 ساعة عند الفحص — أي أن «آخر 48 ساعة» = كامل تاريخه).

### 1.1 الأعداد

| المؤشر | القيمة (دليل) |
|---|---|
| مشاريع المنظمة | 4: `smartbot-api` (python) · `smartbot-web` (javascript-nextjs) · `javascript-react` (قديم 2026-05) · `subnation-backend` (قديم) |
| أحداث smartbot-api (48س/الإجمالي) | **155**: 83 production · 70 local · 2 smoke-test (`events/?field=environment&field=release&field=count()`) |
| أحداث smartbot-web (48س/الإجمالي) | **9** — كلها بتاريخ 2026-09-06T11:24-25Z، كلها release=null |
| قضايا smartbot-api غير المحلولة | **13** (قسمة: 4 إنتاج حقيقي · 1 canary معلوماتي · 2 smoke · 6 ضجيج محلي) |
| قضايا smartbot-web | **1** (resolved) — `SMARTBOT-WEB-1` InvariantError |
| قواعد الإنذار في المنظمة | **1 فقط** — على مشروع `javascript-react` القديم (id 10001207828، عبر Telegram Alerts Bot) — **صفر على مشروعَي SmartBot** |
| Monitors (cron) | `[]` — لا يوجد أي monitor |
| Transactions (أداء) | **0 صفاً** على الإطلاق (dataset=transactions، 14d) |
| release 2.1.0 (API) | حي: firstEvent 2026-09-06T04:34:51Z · lastEvent **2026-09-07T16:52:20Z** (35 دقيقة قبل الفحص) |

### 1.2 أخطاء الإنتاج الحقيقية التي وصلت Sentry (48 ساعة)

**(أ) 500 حي على POST /api/login — 2026-09-07T08:17:04Z** (حدثان: قضية `SMARTBOT-API-A` سجلُ log + قضية `SMARTBOT-API-B` الاستثناء)
- المستخدم: متصفح Mobile Safari / iOS 18.7 / iPhone (مستخدم حقيقي من الجوال) — transaction=`/api/login`، url=`https://api.smart-link.ly/api/login`، release=2.1.0، environment=production.
- Stacktrace الحي: `routers/auth.py:147 (login)` → `routers/auth.py:36 (make_token)` → **`TypeError: int() argument must be a string... not 'NoneType'`** على `int(token_ver)`.
- التشخيص: `getattr(user, "token_ver", 0)` يُرجع `None` (العمود موجود بقيمة NULL على قاعدة legacy — لا server_default كما أثبت D3) → `int(None)` → 500. **هذا إثبات إنتاج مباشر لعائلة D1-H1 (500 خام لمدخلات/قيم خام) ولإيجاد D3 حول token_ver NULL-forever على legacy.** الإصلاح المقترح: `int(token_ver or 0)` في `make_token` + backfill/`server_default` في الترحيلة القادمة.
- ملاحظة جانبية (تغلق سؤال D6 المفتوح): breadcrumb الحدث يكشف أن قاعدة الإنتاج الحية هي **`ep-small-block-avvdwdb8-pooler.c-11.us-east-1.aws.neon.tech` (db=smartbot_db, user=smartbot_owner)** — **ليست** المضيف المسرب في تاريخ git (`ep-dark-unit…`) → تسريب Neon التاريخي لا يفضح قاعدة الإنتاج الحالية (يبقى التدوير واجباً صحياً).

**(ب) توكن صفحة فيسبوك منتهي — دورة cron/heartbeat 2026-09-07T04:06:24Z** (قضيتان `SMARTBOT-API-8/9`، حدثان)
- `GET 400 1235690416285843(/posts): "Error validating access token: Session has expired on Saturday, 05-Sep-26 10:00:00 PDT"` — environment=production، logger=fb-client، transaction=`/api/cron/heartbeat`.
- المعنى: **البوت معطّل فعلياً منذ 05-09** (كل دورة تعذر نشر/جلب/رد) والنبض «أخضر» 200 لأن أخطاء لكل-مستأجر تُسجَّل في `report["errors"]` ولا تُفشل النبضة (routers/bot.py:195-199 بالتصميم) — **الإشارة الوحيدة موجودة في Sentry بلا أي قاعدة إنذار** (انظر H1). ولا BotAlert ولا تلغرام (انظر M6).

**(ج) بقية القضايا = ضجيج لا إنتاج:** `SMARTBOT-API-4` (21 حدث Graph-400 على `127.0.0.1:8321/api/stats`)، `5/6` (Errno 98 bind، CancelledError — محلية)، `7` (صفحة `12345` وهمية من fixtures)، `C/D` (500 على `/webhook` من `http://127.0.0.1:8017` — من تشغيل محلي لا بطارية sim الرسمية التي تضبط `SENTRY_DSN=off` في scripts/v14_sim_local_battery.sh:56) — انظر M1.

**(د) أحداث الواجهة التسعة كلها محلية موسومة زوراً بـ production:** الحدث `a36c29d85a48449cb28a2af6c1892f8a` (`GET http://localhost:3999/pricing`, InvariantError "client reference manifest… does not exist", مسارات مطلقة `/home/z/my-project/.../node_modules/next/...`) — أي أن **مشروع smartbot-web لم يستقبل حدث إنتاج واحداً في تاريخه** (انظر H2/M1).

---

## 2) الإيجادات (file:line / دليل API + شدة + إصلاح)

### 🔴 العالية (3)

#### H1 — قواعد إنذار Sentry الموثقة في السجل **غير موجودة** في المنظمة (مصادقة كاذبة + صفر تنبيه لأخطاء الإنتاج)
- **الدليل الحي:** `GET /api/0/organizations/subnation/alert-rules/` → قاعدة واحدة (id=10001207828) على مشروع `javascript-react` فقط. `GET .../alert-rules/776237/` → **404 "The requested resource does not exist"** وكذلك `776238`.
- **المتناقض الموثق:** docs/deployment.md:142 («✅ أُنجزت في v12 عبر API: smartbot-api (id=776237) وsmartbot-web (id=776238)… الدليل الحي») + docs/decisions-ledger.md:83 (إغلاق `dec-sentry-alerts` في v13) + docs/evidence/v12/sentry-canary-and-alerts.txt الذي يسرد الرقمين.
- **الأثر:** أي خطأ إنتاج (بما فيه 500 تسجيل الدخول الحي وتوكن FB المنتهي) لا يُبرِد/يُنذر أحداً عبر Sentry. القناة الحية الوحيدة = جسر تلغرام للـ500 (يعمل — انظر «المُتحقق سليمه») + كشف cron اليومي.
- **الإصلاح المقترح:** (1) إنشاء قاعدتي issue-alert عبر API (env=production، أي issue جديد → email + Telegram Alerts Bot الموجود أصلاً في المنظمة) — استدعاء API واحد لكل مشروع بلا لوحة تحكم؛ (2) إعادة التحقق بـ GET وطباعة الدليل في ملف evidence؛ (3) تصحيح السجل/التوثيق بصراحة (الإغلاق السابق لم يثبت)؛ (4) بوابة دورية: سكربت `scripts/check_sentry_alerts.sh` في gate_all يفشل إذا نقص عدد القواعد عن المتوقع — يمنع تكرار «إغلاق بلا تحقق».

#### H2 — ربط release الواجهة ميت في الإنتاج، وادعاء v14 (`541b7585`) غير موجود أصلاً
- **الدليل الحي:** `GET .../releases/541b7585/` → 404. كل أحداث smartbot-web التسعة release=null (استعلام `field=release`). الـ release الوحيد للمشروع هو `56d1a3e4` (أُنشئ 2026-09-07T10:54:01Z، **firstEvent=None, newGroups=0** — أُنشئ بلا أي حدث يحمله). تقرير v14 §9 + docs/evidence/v14/sentry-canary-and-deploy.txt ي_claimان «release 541b7585 يظهر مع أول حدث أمامي» — **لم يحدث أبداً** (أول حدث أمامي لم يصل قط).
- **السبب الجذري (كود):** `src/instrumentation.ts:37` — `release: process.env.SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_SENTRY_RELEASE`. المتغيران يُحقنان بواسطة أمر البناء (`package.json` build: `SENTRY_RELEASE=$r NEXT_PUBLIC_SENTRY_RELEASE=$r next build`) — **متغيرات بيئة زمن البناء لا تُحفظ في بيئة تشغيل serverless في Vercel** → أحداث SSR تخرج بلا release (مطابق للمرصود). جهة العميل (`instrumentation-client.ts:27`) تُضمَّن قيمتها وقت البناء فتعمل غالباً — لكن **لا حدث عميل واحد وصل قط لإثباتها**.
- **الأثر:** لا نسبة أي خطأ واجهة إلى نشر بعينه؛ خرائط المصدر تظل بلا مرساة؛ كشف «regression بعد نشر» مستحيل على جانب الويب.
- **الإصلاح المقترح:** استعمال `process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)` (متغير **وقت تشغيل** توفره Vercel) كـ fallback في `instrumentation.ts` — إصلاح كود بلا مالك؛ + canary أمامي واحد مُتحكَّم به (capture_message من صفحة عامة أو `onRouterTransitionStart` مرة/إقلاع) لإثبات السلسلة؛ + تحديث توثيق v14 بتصحيح الادعاء.

#### H3 — صفر بيانات أداء (transactions) رغم traces_sample_rate=0.05 — الـ APM معلنٌ وميت
- **الدليل الحي:** `GET .../events/?dataset=transactions&statsPeriod=14d` → **0 صفوف** لمشروع api طوال عمره، بينما تكامل FastAPI يعمل (أحداث الأخطاء تحمل tags transaction=`/api/login` إلخ، sdk=`sentry.python.fastapi`).
- **السبب المرجح:** تجميد Vercel بعد الاستجابة — الـ transaction يُرسَل من خلفية الـ SDK بتأخير ~2 ث بعد نهاية الطلب بينما تُجمَّد النسخة فور إرسال الاستجابة؛ `capture_exception` ينجو لأنه يستدعي `client.flush(timeout=1.0)` صراحة (`_observability.py:203-212` — التعليق نفسه يوثق الآلية!) بينما الـ transactions لا تُflush.
- **الأثر:** لا زمن استجابة/latency مرصود إطلاقاً — قياساتي الحية (healthz باردة **12.2s**، دافئة 0.41s؛ ready 0.32s وDB 69ms؛ الهبوط 0.36s) لا توجد في أي نظام مراقبة. مقترح «مراقبة زمن استجابة النطاقين» يظل بلا مصدر بيانات.
- **الإصلاح المقترح (بدائل):** (أ) flush في نهاية الاستجابة: middleware يوازي `request_logging_middleware` يستدعي `client.flush(timeout=1.0)` للطلبات المُعيَّنة (كلفة زمن محدودة)؛ (ب) أو الاستسلام بواقعية: `SENTRY_TRACES_SAMPLE_RATE=0` لتوفير الحصة، والاعتماد على `latency_ms` المكشوف أصلاً من `/api/health/ready` + مراقب uptime خارجي يقيس TTFB (بند 5)؛ (ج) Sentry Cron Monitor للنبضة (بند 5). أوصي بـ (ب)+(ج) للجولة الحالية و(أ) لاحقاً إن لزم APM داخلي.

### 🟠 المتوسطة (8)

#### M1 — وسم environment كاذب للواجهة (محلي = «production») + تلوث مشروع API بأحداث محلية (70/155)
- **الدليل:** حدث الويب `a36c29d8`: `request.url=http://localhost:3999/pricing` مع tag `environment=production`. السبب: `src/instrumentation-client.ts:26` و`src/instrumentation.ts:31` يسقطان إلى `NODE_ENV ?? "production"` — و`next start` يضبط NODE_ENV=production محلياً (إصلاح v12-E5.6 لمشكلة D12 كان ناقصاً). للـ API: 70 حدثاً محلياً (ذات 8321/8323/8325/8017، Errno 98، صفحة «12345») من تشغيلات ad-hoc لا تضبط `SENTRY_DSN=off` — البطارية الرسمية وpytest يعطّلانه (scripts/v14_sim_local_battery.sh:56، conftest.py:45)، لكن أي `uvicorn` يدوي يرسل إلى مشروع الإنتاج.
- **الأثر:** 46% من حجم مشروع الإنتاج ضجيج؛ «is:unresolved» تختلط فيها القضايا المحلية؛ وكل إحصاءات «production» للويب زائفة.
- **الإصلاح:** للواجهة — `environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? (typeof window !== "undefined" && location.hostname.endsWith("smart-link.ly") ? "production" : "local")` للعميل، و`SENTRY_ENVIRONMENT ?? VERCEL_ENV ?? "local"` للخادم (نفس منطق الخلفية `_observability.py:156-161` الصحيح). للخلفية — تحذير/تعطيل عند `DEBUG=1` بلا `SENTRY_DSN` صريح + توثيق README بـ `SENTRY_DSN=off` للتشغيل المحلي؛ وفلترة افتراضية `environment:production` في استعلامات الفرز.

#### M2 — قناة «cron-job.org كل 5 دقائق» الموثقة كعاملة = غير عاملة
- **الدليل:** docs/deployment.md:136-137 تعدها قناة ثانية «موجودة وتعمل». الواقع: توكن FB منتهٍ منذ 05-09 — لو كانت النبضات كل 5 دقائق لتولّد ~288 خطأ Graph-400/اليوم في Sentry؛ المرصود: **حدثان فقط، كلاهما 04:06** (= كرون Vercel اليومي 0 4 * * *). أي أن الكشف عن انقطاع DB عبر 503-النبضة **لا يراقبه أحد**، والكشف الأسوأ-حالة 24 ساعة (الكرون اليومي وحده).
- **الإصلاح:** إما تفعيل cron-job.org فعلياً (مالك، مجاني، 5 دقائق — يخفض أيضاً الانطلاقات الباردة 12s المرصودة) أو Sentry Cron Monitor (بند 5) + تصحيح deployment.md ليطابق الواقع.

#### M3 — تسريب PII/بنية تحتية في أحداث Sentry أوسع من السياسة المعلنة
- **الدليل:** حدث `63cdb997` (500 الدخول): `request.data = {"username": "ahmad", "password": "[Filtered]"}` — اسم مستخدم حقيقي غير مفلتر؛ breadcrumbs تكشف `server.address=ep-small-block-avvdwdb8-pooler…neon.tech, db.user=smartbot_owner, db.name=smartbot_db`؛ أحداث الويب تكشف مسارات مطلقة. المبرر في `_observability.py:44-49` («breadcrumbs/request/tags نادراً تحمل مدخلات») **مُكذَّب حياً**.
- **الإصلاح:** توسيع `before_send` (نفس ملف `scrub_pii`): حذف `event["request"]["data"]` (أو استبدال username بـ [Filtered]) + فلترة breadcrumbs من عناوين خوادم DB (`before_breadcrumb` يحذف data.server.address) — ~15 سطراً، مع اختبار.

#### M4 — تهدئة الإنذار (cooldown) في الذاكرة فقط — بلا ضمان على serverless متعدد النسخ
- **الموضع:** `_observability.py:221-242` (`_last_alert` dict داخل العملية). على Vercel كل استدعاء قد يقع على نسخة باردة مختلفة → عاصفة أخطاء واحدة قد ترسل حتى N تنبيه تلغرام (N = عدد النسخ المتزامنة) بدل «تنبيه واحد كل 5 دقائق». (الجانب الجيد المُختبر: sentinel-None يضمن إطلاق أول تنبيه بعد أي إقلاع.)
- **الإصلاح:** نقل دفتر التهدئة إلى قاعدة البيانات (نمط ledger النبضة نفسه — SystemConfig بمفتاح بصمة) أو جدول RateLimitEntry الموجود — قراءة+كتابة واحدة قبل الإرسال.

#### M5 — BotLog بلا tenant_id من مسار StructuredLogger + رسائل تحمل أسماء مستخدمي فيسبوك
- **الموضع:** `monitor.py:29-32` (`_flush_botlog` يضيف `BotLog(level,message)` بلا tenant → يهبط إلى 0) و`bot_engine/engine.py:564` مثله؛ بينما رسائل المحرك تحمل أسماء المعلقين (`pipeline.py:159` "→ Reply to {ctx.from_first}"، `engine.py:460`) — PII يسقط في صفحات tenant 0؛ `/api/logs` للمستأجر (routers/bot.py:336 يفلتر بـ tenant_id) لا يرى نشاط بوته من هذا المسار أصلاً.
- **الاحتفاظ:** 30 يوماً عبر `/api/cron/cleanup-logs` اليومي 03:00 (plans_config.py:218-253) ✓ سليم.
- **الإصلاح:** حقل `tenant_id` في `LogEvent` → `_flush_botlog` يكتبه؛ أو على الأقل إزالة `ctx.from_first` من نص الرسالة المسجلة.

#### M6 — نظام BotAlert الداخلي ميت من الطرفين + لا إنذار على انتهاء توكن Graph (الحادثة الحية)
- **الدليل:** منتج BotAlert الوحيد = إنشاء يدوي (`routers/alerts_routes.py:35`)؛ `/api/health/alerts` و`/api/health/bot-check` بلا أي مستهلك واجهة (grep نظيف في src/e2e/tests — يطابق «راوترات ميتة» في D1). `bot-check` نفسه ممتاز (يفحص صلاحية توكن المستأجر عبر Graph فعلياً health_alerts_routes.py:59-73) لكن لا أحد يستدعيه دورياً ولا يترجح نتيجته critical إلى BotAlert/تلغرام.
- **الأثر المباشر:** توكن FB المنتهي (1-ب أعلاه) كان سيُكشف خلال دقائق من bot-check — بدل ذلك مرّ يومان بلا إشعار.
- **الإصلاح (E-wave):** النبضة اليومية (routers/bot.py:169) تنفّذ منطق bot-check لكل مستأجر مربوط: أي `fb_token critical` → صف BotAlert + تلغرام (باستخدام `telegram_alert` الموجود) — يغلق الحادثة الحية بنيوياً.

#### M7 — «جاهزية النظام 99.9%» على صفحة الهبوط قيمة وهمية ثابتة
- **الموضع:** `routers/plans_config.py:152` (`"uptimePercent": 99.9` ثابتة، التعليق نفسه يعترف: "status page assumed; replace with real probe later") تُعرض في `StatsSection.tsx:76` تحت بند «جاهزية النظام» — فوق تعليق «الأرقام حقيقية ولا تُ_hardcode أبداً». أثناء انقطاع فعلي ستظل الصفحة تعلن 99.9%.
- **الإصلاح:** حساب rolling من دفتر النبضة/المراقب (يكتمل مع بند 5) أو إخفاء البند حتى يوجد مراقب حقيقي — لا يبقى رقم ثابت يواجه الزبائن.

#### M8 — عِدّات التشخيص (ring buffers) لكل-نسخة = فارغة/مضللة على serverless
- **الموضع:** `monitor.py:71-89` (عازلة 1000 حدث داخل العملية) و`diagnostics.py:16-37` (100 عينة/نسخة). على Vercel كل طلب قد يخدمه instance بارد → `/api/diagnostics/logs|stats|recent-errors|status` (routers/diagnostics.py:30-75) ترجع عينات من نسخة عشوائية (غالباً شبه فارغة) — «سجلات النظام الحية» للمالك لا تعكس الإنتاج. (تعمل جيداً في النشر أحادي الخادم/محلي.)
- **الإصلاح (اتجاه):** اعتماد BotLog (DB) كمصدر حقيقة للتشخيص (بعد M5) أو تسجيل العدادات في Redis/DB دورياً؛ حتى ذلك الحين توثيق القيد بصراحة في اللوحة («بيانات النسخة الحالية فقط»).

### 🟡 المنخفضة (5)

#### L1 — ازدواج حدث لكل 500 (زوج قضايا لكل حادث واحد)
- **الدليل الحي:** `SMARTBOT-API-A+B` (الدخول) و`C+D` (webhook): سطر `log.error("Unhandled 500 | …")` في `app/errors.py:37` يلتقطه تكامل Logging الافتراضي كحدث، بينما `report_critical` يلتقط الاستثناء نفسه → قضايا مزدوجة تشرذم الفرز.
- **الإصلاح:** في `before_send`: إسقاط الأحداث التي logger=fb-api وlogentry يبدأ بـ "Unhandled 500 |" (التوأم الاستثنائي موجود دوماً) — 5 أسطر.

#### L2 — عبء canary الإقلاعي على حصة 5k/شهر
- **الدليل:** ~122 حدث canary/48س (~80 إنتاج + 42 محلي) ≈ 1,800/شهر قبل أي خطأ حقيقي من حصة 5k. **ملاحظة قيمة مرافقة:** 80 إقلاعاً بارداً/48س = معدل انطلاق بارد عالٍ جداً على Hobby (كل زائر أول يدفع ~12 ثانية — قيست 12.17s على healthz).
- **الإصلاح:** الإبقاء على الكناري (قيمته التشخيصية عالية) + إسكات الضجيج المحلي (M1) يكفي؛ مراقبة الحصة فصلياً.

#### L3 — `json.loads` خام في /webhook → 500 (دفاع بالعمق)
- **الموضع:** `app/webhooks.py:89` — جسم غير JSON بعد اجتياز HMAC يرمي JSONDecodeError (الحدث المحلي C/D أعلاه). في الإنتاج يحتاج المهاجم السر (401 أولاً) → خطر منخفض.
- **الإصلاح:** try/except → 400 عربية صامتة.

#### L4 — لا تمثيل مستأجر (tenant_id) في أحداث Sentry
- **الموضع:** `capture_exception` يوسم request_id/path/method فقط (`_observability.py:194-201`). للمساعدة في الفرز السريع (بلا PII): وسم `tenant_id` حيث يتوفر من سياق المصادقة.
- **الإصلاح:** `scope.set_tag("tenant_id", …)` في مواقع الالتقاط المؤتمنة (اختياري).

#### L5 — release الخلفية ثابت 2.1.0 عبر النشرات
- **الدليل:** release 2.1.0 أول حدث 06-09 وآخر 07-09 16:52 (حي)، لكن v13/v14 نُشرا تحت نفس الوسم (تصميم «بلا version bump» — موثق في evidence v14) → لا نسبة قضايا جديدة إلى نشر بعينه (newGroups=11 كلها غير قابلة للتأريخ بنشر).
- **الإصلاح:** نفس آلية H2 للخلفية: `VERCEL_GIT_COMMIT_SHA` كـ release أساسي (أو bump لكل نشر) — سطر واحد.

---

## 3) تدقيق صفحات الصحة (health endpoints) — ماذا تفحص فعلاً؟

| المسار | ما يفحص | لا يفحص | قياس حي (17:09Z) |
|---|---|---|---|
| `GET /api/health` (runner.py:149-161) | liveness فقط (بلا DB بالتصميم) | كل شيء آخر | 200 · 0.27s ✓ |
| `GET /api/health/ready` (runner.py:164-198) | اتصال DB + جدول محوري (tenants) + latency_ms | Fernet · Graph · Telegram · Redis | 200 · 0.31-0.34s · DB 69ms ✓ |
| `GET /healthz` (plans_config.py:165-196) | DB + عدد الخطط + version | نفسه | 200 · **باردة 12.17s** ثم 0.41s ✓ |
| `GET /api/health/bot-check` (health_alerts_routes.py:47-94) | ردود/ساعة + **صلاحية توكن المستأجر عبر Graph** + القواعد + حالة البوت | (لكن بلا مستهلك ولا مجدول — M6) | يتطلب مصادقة |

**الفجوة:** لا يوجد أي مسار يفحص **Fernet** (انفجارها يظهر فقط كـ500 عند ربط/استخدام توكن — يتقاطع مع D6-L4: لا تحقق مفتاح عند الإقلاع) ولا **Graph** على مستوى المنصة ولا **قناة تلغرام نفسها** (القناة التي تحمل كل الإنذارات لا تُفحص دورياً — يوجد فحص يدوي للأدمن فقط في admin_routes). 
**الإصلاح المقترح:** `/api/health/ready?deep=1&token=CRON_SECRET` — فحص Fernet (encrypt/decrypt roundtrip لمصطنع) + Graph `GET /me` للتوكن العام + Telegram `getMe` — يستدعيه كرون النبضة ويسجل النتيجة في الـ ledger؛ يبقى `/ready` العام رخيصاً كما هو.

**crons (الأجهزة الدورية):** CRON_SECRET إلزامي إنتاجياً (config.py:96-97 fail-fast ✓) · Bearer أولاً + توافق query مهجور مع تحذير (bot.py:118-130, 183-192 — بند D6-M3 لا يُعاد) · مهمتان على Vercel: cleanup-logs 03:00 وheartbeat 04:00 (vercel.json:93-102) — **النبضة أثبت حياته 04:06** عبر أحداث Sentry. المسارات الأربعة للنبضة (منشورات/معجبون/دورة/دفتر) + 503 عند فشل المسح + التحقق الارجاعي من الدفتر (bot.py:308-330) — تصميم ممتاز ومختبر؛ فجوته الوحيدة: M2 (لا قناة 5 دقائق تراقب الـ503) وM6 (لا إنذار على أخطاء per-tenant داخل التقرير).

**السجلات (سياسة/حجم/تسريب):** الاحتفاظ 30 يوماً (cleanup يومي) ✓ · stdout بلا log drain خارجي (مالك اختياري — التحقيق الجنائي التاريخي محصور في Sentry) · حجم العدادات مقيد بالعازلات (1000/100) لكل نسخة (M8) · PII داخل BotLog (M5) · أحداث Sentry تحمل request.data وbreadcrumbs (M3).

---

## 4) المُتحقق سليمه (موثق لمنع إعادة الإبلاغ)

- `send_default_pii=False` في الجهتين (`_observability.py:167`, `instrumentation-client.ts:29`) ✓ · كلمات المرور مفلترة افتراضياً (حي: `[Filtered]`) ✓ · scrubber الرسائل يعمل (لا بريد/هاتف غير ممسوح في الأحداث الحية) ✓
- **release 2.1.0 للخلفية يعمل حياً** (121 حدث canary موسومة، آخرها قبل 35 دقيقة من الفحص) ✓ — آلية canary الإقلاع (حدث واحد/إقلاع، `SENTRY_BOOT_CANARY=off` للتسكيع) سليمة ومُختبرة ✓
- **جسر 500→تلغرام أطلق فعلاً** على حادثة الدخول الحية: الحدث `SMARTBOT-API-A` هو حرفياً سطر `log.error` داخل `global_500_handler` → أي أن `report_critical` نفِّذ والمسار كامل (errors.py:29-42 + _observability.py:279-309) ✓ · تهدئة 5 دقائق/بصمة + sentinel-None الصحيح (مُوثق ومختبر) ✓
- كشف ركود النبضة + الدفتر الارجاعي + 503 المسح ✓ (اختبارات: tests/test_v6_observability.py 19 + test_v12_observability.py 21 + test_v11_telegram.py 24 = 64)
- health probes صادقة (503 عند فشل DB، بلا تسريب نص الخطأ) ✓ (D2.5/E2.13/E3.7 مغلقات ولم تُفتح)
- تكامل Sentry الخلفي: DSN عام send-only مقصود، معطل بـ `SENTRY_DSN=off`، لا يكسر الإقلاع أبداً (try/except شامل) ✓ · التقاط أخطاء startup للـ Sentry (startup.py:341-351) ✓
- توثيق المتغيرات (README.md:69) صادق في وصفه للآلية (الدليل الحي كذّب الادعاءات اللاحقة في deployment.md فقط) ✓

---

## 5) uptime — الحد الأدنى بدون مالك + مقترح مراقبة ليبيا الواقعي

### 5.1 الحد الأدنى القابل للتثبيت **بدون المالك** (كلها كود/ـAPI، لا لوحات تحكم):

1. **GitHub Actions كمراقب خارجي فعلي** (الأقوى): المستودع عام وpush يعمل — workflow `.github/workflows/uptime.yml` بمؤقت cron 15 دقيقة: curl `https://api.smart-link.ly/healthz` + `https://api.smart-link.ly/api/health/ready` + `https://bot.smart-link.ly/` — فشل خُطوتين متتاليتين يُفشِل الـ job → GitHub يبريد صاحب آخر push (المالك) تلقائياً. **خارج Vercel بالكامل** → يرصد انقطاع المنصة كلها (ما لا يرصده أي فحص ذاتي). كلفة: ملف YAML واحد.
2. **Sentry Cron Monitor** على النبضة اليومية: إنشاء monitor عبر API + استدعاء check-in من `/api/cron/heartbeat` (سطر كود) → Sentry يبريد عضو المنظمة عند غياب النبضة — يغلق «هل الكرون حي؟» بلا خدمة خارجية.
3. **فحص ذاتي داخل النبضة للنطاقين**: النبضة تجلب `https://bot.smart-link.ly/` و`https://api.smart-link.ly/healthz` وتسجل uptime في SystemConfig ledger + تلغرام عند الفشل — يرصد DNS/شهادات/انحراف نشر الويب (كرون API يفحص دومين الويب = غير دائري لتلك الطبقة).
4. **قاعدتا إنذار Sentry** (إصلاح H1) — عبر API مباشرة.
- هذه الأربعة تغطي: انقطاع كامل، موت الكرون، فشل DB (عبر 503 النبضة التي يراقبها 1/2)، أخطاء التطبيق (4). **يبقى للمالك** (dec-uptime-monitor كما هو): مراقب 5 دقائق احترافي (UptimeRobot مجاني) بمواقع فحص متعددة + keep-warm ملازم — 10 دقائق من وقته، ويُصعَّد في السجل كخيار تحسين لا كعائق.

### 5.2 مقترح مراقبة ليبيا (واقعي ومُقيَّس بالقياسات الحية):

- **خط الأساس المُقاس (من هذا الفحص):** هبوط الويب 0.36s · API دافئ 0.27-0.41s · DB 69ms · عبر وكيل bot-domain 1.32s · **باردة API 12.2s** (أكبر مصدر بطء ملحوظ للمستخدم الليبي: 80 إقلاعاً/48س + زمن الرحلة).
- **عتبات مقترحة:** إنذار تعطل عند فشلين متتاليين (فاصل 5 د) · إنذار بطء TTFB > 5s دافئاً / > 15s بارداً (يفصل الانطلاق البارد عن التدهور) · `latency_ms` من /ready > 300ms · SLO شهري 99.5% (واقعي مع Hobby+الانطلاقات) مع موازنة أخطاء موثقة.
- **مواقع الفحص:** نقطة EU-جنوبية (الأقرب ليبيا: ميلانو/فرانكفورت) + نقطة US-east (نفس منطقة iad1/Neon) — التمييز بين «الخادم بطيء» و«المسار من ليبيا بطيء».
- **خصوصية ليبيا:** انقطاعات الإنترنت الوطنية المتكررة وتدخل DPI/DNS يعني أن مراقباً خارجياً يرى «الخدمة سليمة» بينما ليبيا مقطوعة — الحل الأدنى الواقعي: (أ) قناة بلاغ المستخدمين موجودة أصلاً (واتساب الدعم) توثَّق كقناة كشف، (ب) لاحقاً نقطة رصد داخل ليبيا (VPS محلي أو هاتف Termux ينبض كل 15 دقيقة إلى endpoint خفيف)، (ج) أثناء الانقطاع: نشر حالة على صفحة الفيسبوك (وسيلة الجمهور الفعلية) — نفس قناة جمهور المنتج.
- **الإبلاغ:** ملخص uptime أسبوعي إلى تلغرام الأدمن من الدفتر (يمكن توليده من كرون النبضة نفسه) — يغلق M7 برقم حقيقي بدل 99.9 الثابتة.

---

## 6) أولويات التنفيذ المقترحة (لموجة E)

1. **E-OBS-1 (ساعة، بلا كود تطبيق):** إنشاء قاعدتي إنذار Sentry + Cron Monitor عبر API → إعادة GET للتحقق → دليل evidence جديد → **تصحيح deployment.md:142/136 وdecisions-ledger.md:83 وادعاء release v14** (أمانة التوثيق أول خطوة).
2. **E-OBS-2 (كود صغير):** release بـ `VERCEL_GIT_COMMIT_SHA` للجهتين (H2/L5) + environment ذكي للويب (M1) + before_send يوسم/يحذف request.data وbreadcrumbs الحساسة (M3) + إسقاط توأم «Unhandled 500 |» (L1).
3. **E-OBS-3:** bot-check داخل النبضة → BotAlert + تلغرام عند critical (M6 — يغلق حادثة التوكن المنتهي نيوياً) + تكملة deep-check لـ Fernet/Graph/Telegram (بند 3).
4. **E-OBS-4:** uptime.yml في GitHub Actions + check-in للـ Cron Monitor + فحص النطاقين من النبضة (5.1).
5. **E-OBS-5 (هيكلي لاحق):** تهدئة الإنذار في DB (M4) + tenant_id في BotLog/LogEvent (M5) + قرار APM: 0 أو flush (H3).

**إحالات عابرة للنطاقات:** D1/D3 (500 الدخول الحي = عائلتهما — إصلاح `int(None)` بـ `or 0` + backfill) · D6 (تسريب PII في أحداث Sentry امتدادٌ لسياقه + جواب سؤاله: القاعدة الحية ≠ المسربة) · D13-sim (أحداث sim محلية دخلت مشروع الإنتاج من تشغيلات غير البطارية الرسمية).

---

## 7) أدلة الاستعلامات (لإعادة الإنتاج)

```bash
TOK="sntryu_…450d9"  # توكن فحص فقط
# قواعد الإنذار (H1):
curl -H "Authorization: Bearer $TOK" https://eu-api.sentry.io/api/0/organizations/subnation/alert-rules/
curl -H "Authorization: Bearer $TOK" https://eu-api.sentry.io/api/0/organizations/subnation/alert-rules/776237/   # → 404
# الإصدارات (H2):
curl -H "Authorization: Bearer $TOK" https://eu-api.sentry.io/api/0/organizations/subnation/releases/541b7585/     # → 404
# الأحداث 48س:
curl -G -H "Authorization: Bearer $TOK" https://eu-api.sentry.io/api/0/organizations/subnation/events/ \
  --data-urlencode "project=smartbot-api" --data-urlencode "statsPeriod=48h" \
  --data-urlencode "field=environment" --data-urlencode "field=release" --data-urlencode "field=count()"
# تفاصيل حادثة الدخول (M3/إثبات D1-H1):
curl -H "Authorization: Bearer $TOK" https://eu-api.sentry.io/api/0/organizations/subnation/issues/145425887/events/latest/
# transactions (H3): dataset=transactions&statsPeriod=14d → 0 صفوف
```
