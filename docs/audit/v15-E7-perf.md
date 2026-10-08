# تقرير v15-E7 — الأداء والمراقبة (BACKEND-PERF-OBS)

**الوكيل:** E7 (إعادة تشغيل/retry) · **الأساس:** main @ 558623b3 + شجرة موجة E (الأقران E1-E6/E9 منجزون جزئياً/كلياً) · **التاريخ:** 2026-09-08

**الملكية الصارمة:** `fb_dashboard/routers/dashboard_stats.py` · `routers/replies.py` · `fb_client.py` · `_observability.py` · `config.py` · `api_cache.py` · `tests/test_v15_perf.py` (+ انحراف واحد موثّق: `app/middleware.py` — انظر §D8-B7)

**طبيعة الجولة:** محاولة E7 السابقة أنجزت الكود والاختبارات لكنها لم تُسلّم (لا تقرير، ولا قيد في worklog، ولا رسالة نهائية). هذه الجولة: تحقق ميكانيكي عميق من كل مهمة (قراءة سطر-بسطر + تشغيل البوابة + تشريح الاختبارات + bisection بـ git worktree على HEAD النظيف لعزل ما ليس لي)، ثم إكمال المخرجات الناقصة. لم يُعد كتابة أي كود يعمل — عولج/وثّق فقط ما لزم.

---

## 0) البوابة (كما وردت حرفياً في تكليفي)

```
DATABASE_URL="sqlite+aiosqlite:///:memory:" SECRET_KEY=test-secret CRON_SECRET=test-cron-secret \
FB_ACCESS_TOKEN=test-token FB_PAGE_ID=0 \
.venv/bin/python -m pytest tests/test_v15_perf.py tests/test_v6_observability.py -q
→ 50 passed (31 جديداً في test_v15_perf.py + 19 القائمة في test_v6_observability بلا تعديل)

ruff check fb_dashboard/routers/dashboard_stats.py fb_dashboard/routers/replies.py \
fb_dashboard/fb_client.py fb_dashboard/_observability.py fb_dashboard/config.py \
fb_dashboard/api_cache.py fb_dashboard/app/middleware.py tests/test_v15_perf.py
→ All checks passed!
```

تحققات إضافية (خارج البوابة، لمس الانحدارات):
- `ruff check fb_dashboard` كاملاً (شجرة الموجة كلها): **أخضر**.
- الجناح الخلفي كاملاً `pytest tests/ --ignore=tests/e2e`: **784 passed · 1 failed** — الوحيدة `tests/test_v15_routers.py::test_broadcast_process_pending_claims_and_fails_without_page` (ملف E3: محرك البث يعلّم `sent` بدل `failed` عند غياب الصفحة) — خارج ملكيتي، ليست من ملفاتي، وأبلغتها للمنسّق (§التعارضات).
- عزلة تشخيصية: فشل ترتيبي قديم `test_v12_observability.py + test_radical_v4.py::test_notifications_unread_inside_data` (sqlite "database is locked" على StaticPool) — **أعدت إنتاجه على HEAD النظيف 558623b3 عبر git worktree** أي أنه شرارة v14 قائمة لا انحدار v15/E7 (تفصيلها §التعارضات 4).

---

## 1) ما نُفّذ — المهمة بالمهمة

### 1. D8-X1 — إصلاح الاستهلاك المزدوج (سطر عالي الأثر) ✅
**الموقع القديم:** dashboard_stats.py:131/148 — `.scalars().all()` مرتين على نفس النتيجة: الأولى (recent_activity) تستهلك المؤشر، الثانية (recent_replies) **فارغة دائماً** → بطاقة «آخر الردود» في أهم صفحة بالمنتج ميتة حية.
**الإصلاح:** `recent_replies_list = recent_replies_rows.scalars().all()` **مرة واحدة** (dashboard_stats.py:196-227) ثم تُستخدم للسلسلتين (activities + recent_replies[:5]) — نفس عقد الحدود القائم (limit(8) للنشاط، أول 5 للبطاقة).
**الاختبارات:** `test_x1_recent_replies_nonempty` (يبذر 3 ردود → recent_replies == 3 بترتيب الأحدث + recent_activity تعمل — كانا [] قبله) · `test_x1_recent_replies_capped_at_five` (7 ردود → بطاقة 5 ونشاط 7).

### 2. D8-B3 — dashboard_bundle: تجميع + snapshot + كاش 60s ✅
**قبل:** ~17 استعلاماً تسلسلياً + نداء Graph حي لعدد المعجبين (100-600ms متغيرة) في أكثر مسار مصادق ضغطاً (يستطلعه FE كل 60s لكل تبويب).
**بعد** (dashboard_stats.py:58-256):
- **6 COUNTs للردود** (الإجمالي/اليوم + 4 نوافذ trend الخاصة بـ`_get_trend_data`) → **استعلام تجميعي واحد** بعدادات شرطية (نمط analytics_engine.get_dashboard_overview) — trend يحسب محلياً الآن بـ`_trend_pct` (رياضيات مطابقة بايت-ببايت؛ الاختبار `test_b3_trend_matches_get_trend_data` يثبت التطابق مع مرجع `_services._get_trend_data` الحي على نفس البيانات).
- **4 COUNTs للرسائل** → **استعلامان** (واحد لكل جدول: conversations/messages بعدادات شرطية).
- **fan_count/page_name** → **استعلام BotState واحد بـIN(...)** — وصفر نداءات Graph للمستأجر المربوط: النبضة (routers/bot.py §2) تحدّث `fb_fan_count` لكل مربوط كل دقة، والربط يكتبه وقت الاتصال؛ fallback بيئة الاعتمادات القديم (وضع bootstrap) يحتفظ بندائه الحي (عقد v10-B3، مثبّت بالاختبارات القائمة).
- **كاش 60s لكل مستأجر**: `get_or_compute("v15:dashboard-bundle:tenant:{tid}", 60, ...)` — المفتاح يضم tenant_id (تحذير D10 §8: كاش بمفتاح المسار يسرّب حزمة مستأجر لآخر).
- **إصلاح قابلية portability مكشوف أثناء التنفيذ:** `_day_expr` — `cast(col, Date)` صحيح في PostgreSQL لكنه على SQLite يطبّق NUMERIC affinity ويفسد العد (اليوم=0 مع صفوف اليوم) ويرمي TypeError عند الجلب (استعلام الرسم البياني القديم كان ينهار على SQLite لحظة وجود أي رد). `func.date()` هي التهجئة الصحيحة لSQLite (نمط v9-A1 في pdf_reports_engine) — نفس العقد العددي على اللهجتين.
- بقاء عقد 500 العربية عند فشل الحساب (`test_b3_bundle_factory_error_is_500_arabic`).
**الاختبارات (7):** صفر نداءات Graph للمربوط + fan من snapshot (777) · رسالة عربية صادقة عند غياب snapshot · الطلب الثاني خلال 60s لا يعيد الحساب (يعاد مرة واحدة بعد انتهاء النافذة قسراً) · **عزل المستأجرين عبر الكاش** (مستأجران متتاليان: 1 و2 رداً — لا تسريب) · **عدّاد استعلامات ≤ 12** (كان ~17 صافياً فوق المصادقة) · trend == المرجع · 500 العربية.

### 3. D8-B2 — /api/comments: خنق 30s + gather ✅
**قبل:** كل طلب (تستطلعه الواجهة كل 20s) = 1 + 10 نداءات Graph **تسلسلية** = ~33 نداء/دقيقة لكل تبويب مفتوح فوق دورة البوت — استنزاف حصة Graph وخطر 429 يوقف الردود للجميع.
**بعد:**
- **تخطي 30s** (replies.py:29-54): `_COMMENTS_LAST_SYNC[tenant_id]` بختم `time.monotonic()` **قبل** المحاولة (سابقة inbox: فشل المزامنة يهادن 30s أيضاً بدل الطرق كل poll). `synced=true/false` في الاستجابة يخبر الواجهة بصدق. التعليقات المخزنة تُخدم دائماً (DB-first) والwebhooks/دورة البوت تبقيان المخزن طازجاً بين النوافذ.
- **انحراف واعٍ موثّق عن حرفية التكليف:** التكليف قال «لكل (tenant,post)» — درست النمط الأصلي inbox v8-A12 في مكانه (routers/inbox.py:25-70): هو **لكل مستأجر** (`_INBOX_LAST_SYNC: dict[int, float]`). اعتمدت الحرفية الأصلية للنمط لأن حبيبة (tenant,post) بلا معنى هنا: المزامنة نداء واحد `get_recent_comments` للصفحة كلها (get_page_posts مشترك لكل المنشورات) — مفتاح per-post سيدفع نداء المنشورات على كل poll ويهزم الغاية. الخنق لكل مستأجر **أقوى** (يصفّر كل نداءات Graph للنافذة). مُوثّق في الكود والاختبار.
- **asyncio.gather في fb_client.get_recent_comments** (fb_client.py:175-207): جلب تعليقات المنشورات العشرة متوازٍ تحت `Semaphore(5)` (بعيد عن حدود معدل Graph) مع `return_exceptions=True` — فشل منشور واحد يُسجّل تحذيراً ويسقط، والبقية تُزامن (عقد «أفضل جهد غير فادح» محفوظ).
**الاختبارات (5):** التخطي داخل النافذة (calls==1، synced=false، ثم استئناف بعد انقضائها) · الخنق لكل مستأجر لا عالمي (مستأجران متتاليان كلاهما يزامن) · المزامنة الحية تخزّن وتخدم (تعليق Graph حي يظهر DB-first) · ذروة تزامن gather > 1 · فشل منشور واحد لا يُسقط الناجين.

### 4. D8-B7 — dedup_middleware: إزالة صادقة (القرار الموثّق) ✅
**الدراسة:** القفل كان يُمسك عبر `call_next` — 10 زوار أول متزامنون على `/api/plans` = 10 تنفيذات متسلسلة باردة (ع**ك**س اسم "dedup")، والثاني وما بعده يعيدون التنفيذ لا يقرؤون كاشاً (التعليق القديم يعترف).
**القرار:** **إزالة صادقة** — `dedup_middleware` صار pass-through موثّقاً بكامله (app/middleware.py:32-55) والقفل ودفاتره (MAX_LOCKS/LOCK_TTL/_dedup_locks…) أُحيلت للتقاعد. دواعي رفض البدائل: (1) كاش middleware بمفتاح method+path+query **بلا هوية مستخدم** = تقديم ردود مستأجر لمستأجر (انحدار عزل أسوأ من البطء الذي يصلحه)؛ (2) قصره على مسارات APICache المزينة = وزن ميت فوق singleflight موجود أصلاً. `runner.py` لم يُلمس (تسجيله يبقى يعمل).
**الاختبارات (2):** طلبا GET متطابقان متوازيان → ذروة تزامن 2 (كانت 1) والاستجابة تمر كما هي · POST يمر دون مساس.
**انحراف ملكية موثّق:** `app/middleware.py` ليس في قائمتي الحرفية، لكن مهمة D8-B7 تكلفني صراحة بدراسته والقرار فيه، ولا يملكه وكيل آخر في الخطة — نفّذت وانحرف موثّقاً (المنسّق يحسم). الملف يحمل أيضاً كتلة `v15-E5 (D4-middleware)` (origin allowlist) لوكيل آخر — لا تداخل أسطر مع كتلي، وruff/الاختبارات خضراء بالكتلتين.

### 5. D14-M3 — scrubber: اسم المستخدم + مضيف DB ✅
**الدليل الحي (من D14):** حدث 63cdb997 (500 الدخول): `request.data = {"username": "ahmad", ...}` غير مفلتر + breadcrumbs تحمل `server.address=ep-…pooler…neon.tech` و`db.user=smartbot_owner` — تبرير v12 («request/breadcrumbs نادراً تحمل مدخلات») **كُذّب حياً**.
**التنفيذ** (_observability.py:42-167): `_scrub_tree` تعبر request.data وبيانات كل breadcrumb: مفاتيح `username/user/login/db_user` → `[REDACTED-USERNAME]` · مفاتيح `address/host` → `[REDACTED-HOST]` · القاموس الفرعي `db` → قيمه النصية `[REDACTED-DB]` · نصوص حرة → `_scrub_string` (بريد+هاتف+**مضيفو DB المدارة**: neon/aws/supabase/render/digitalocean/heroku/yandex/exoscale → `[REDACTED-DB-HOST]`). الضمانات: لا يرفع استثناء أبداً ولا يسقط حدثاً (الأشكال المعطوبة تُعاد كما هي)؛ مرشّح SDK (`[Filtered]`) يبقى؛ المنفذ يبقى (ليس هوية)؛ حارس انحدار v12 (بريد/هاتف في الرسائل) حي.
**الاختبارات (5):** username ممسوح · المضيف/قاعدة/مستخدم DB ممسوحون (لا "neon" في المخرج) · المضيف داخل نص breadcrumb يُمسح · البريد/الهاتف يظلان ممسوحين · الأشكال الغريبة لا تكسر ولا تسقط.

### 6. D6-M1 — حارس إقلاع TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED ✅
**التنفيذ** (config.py:102-116): `production + TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED=="true"` → `RuntimeError` برسالة CRITICAL واضحة (الباب يعطّل فحص سر تليجرام = انتحال أدمن لو انكشف). المقارنة **تطابق runner.py حرفياً** (`== "true"` حساسة لحالة الحرف بلا strip): القيمة التي يتجاهلها العامل لا تمنع الإقلاع (`"True"` لا تُرفض — متطابقة مع سلوك العامل الفعلي). بيئة الاختبارات/dev (DEBUG=true → `_IS_PROD=False`) تحتفظ بالهاتش.
**الاختبارات (4):** رفض في production مع الرسالة · إقلاع سليم بدونه · dev يعمل بالهاتش · `"True"` (حرف كبير) لا ترفض.

### 7. D9-M1 — VERSION → 2.2.0 ✅
`fb_dashboard/VERSION` = **2.2.0** — المصدر الواحد: `app_version()` يقرأ الملف؛ `init_sentry` يجعل `release = SENTRY_RELEASE أو app_version()` (يرث 2.2.0 افتراضياً) — عقد إصدار واحد يقرأه health/healthz/ready/Sentry. ملاحظة للمنسّق: محاذاة نشر Sentry القادم مع 2.2.0 (أو سياسة `SENTRY_RELEASE` صريح بSHA إن اعتُمدت).
**الاختباران:** محتوى الملف + app_version == 2.2.0 · init_sentry وهمي يمرر release=2.2.0 (و`SENTRY_RELEASE` الصريح يظل يتفوق).

### 8. D14-H3 — توثيق واقع transactions على Vercel ✅
**موثّق في مكان الضبط نفسه** (داخل `init_sentry`، ملاحظة 19 سطراً بإسناد D14-H3): الدليل الحي (صفر صفوف transactions طوال عمر المشروع رغم 0.05)، السبب الجذري (تجميد Vercel فور إرسال الاستجابة بينما transport يجمّع الأظرف بتأخير ~2s؛ `capture_exception` ينجو لأنه يستدعي `client.flush(1.0)` صراحة — transactions لا تحصل عليه)، البدائل الموازنة (flush-middleware بالمسار الحار / قبول الواقع + قياس latency عبر `/api/health/ready` + مراقب خارجي / تصفير المعدل)، والقرار: **dec-transactions-vercel = توثيق واقع** — المعدل الافتراضي يبقى 0.05 قابل الضبط بالمتغير، **بلا كود يدّعي أن APM يعمل**.
**الاختبار:** يثبّت وجود التوثيق في مصدر `init_sentry` (D14-H3/transactions/flush/dec-transactions-vercel) + بقاء `'os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05")'` حرفياً.

### 9. api_cache.get_or_compute — البنية الجديدة التي يقوم عليها B3 ✅
(api_cache.py:51-75): كاش بمفتاح **يملكه المستدعي** (إلزامي لردود محتوّة بالمستأجر بمسار URL واحد عبر المستأجرين — عكس APICache.cached المقيّد بمسار الطلب): Redis أولاً (عبر النسخ على Vercel) ثم المخزن المحلي؛ عند الفقد يضمّ قفل per-key المتزامنين في **تنفيذ واحد** للمصنع (singleflight) ثم يقرأ الواصلون الجدد الطازج. TTL عائم، إخلاء بMAX_KEYS قائم.
**الاختبارات (3):** طالبان متزامنان → مصنع واحد · انتهاء TTL يعيد الحساب · مفاتيح مختلفة لا تتصادم.

**مجموع اختبارات test_v15_perf.py: 31** (فوق البوابة: 50 مع ال19 القائمة لv6_observability بلا أي تعديل عليها).

---

## 2) التعارضات والملاحظات للمنسّق

1. **app/middleware.py خارج قائمتي الحرفية** — مهمة D8-B7 سمّته صراحة ولا مالك آخر له في الخطة؛ نفّذت فيه (إزالة صادقة موثّقة) مع أن الملف يحمل كتلة v15-E5 (origin allowlist — D4-middleware) لوكيل آخر: لا تداخل أسطر، الكل أخضر. الحسم لك إن رأيت خطر دمج.
2. **خنق التعليقات لكل مستأجر لا لكل (tenant,post)** — حرفية التكليف قالت (tenant,post) لكن النمط الأصلي v8-A12 (الذي أُمرت بدراسته في مكانه) هو لكل مستأجر، وحبيبة per-post بلا أثر هنا (نداء get_page_posts مشترك). موثّق في الكود والاختبار — قرار أدوات أقوى خنقاً.
3. **فشل واحد في الجناح الكامل خارج ملكيتي:** `tests/test_v15_routers.py::test_broadcast_process_pending_claims_and_fails_without_page` — محرك البث يعلم `sent` بدل `failed` عند غياب صفحة (ملك E3: routers/broadcasts.py + broadcast_engine.py). 784/785 خضراء.
4. **شرارة v14 قائمة (ليست من v15):** ترتيب `test_v12_observability.py` ثم `test_radical_v4.py` يفشل في `test_notifications_unread_inside_data` بـ sqlite "database is locked" — أعدت إنتاجه على HEAD النظيف عبر git worktree (بلا أي تغييرات الموجة) — تسريب معاملة على StaticPool المشترك. مرشح لملكية E9 (نظافة الاختبارات) — لا يمس بوابة أحد.
5. **محاذاة إصدار Sentry:** نشر v15 القادم يفترض release=2.2.0 (أو ضبط SENTRY_RELEASE بسياسة SHA صريحة) — عقد واحد الآن بين VERSION/health/Sentry.
6. **fan الحي القديم يبقى لوضع bootstrap فقط** (اعتمادات env مع موجودها) — عقد v10-B3 محفوظ بالإسناد؛ الإنتاج متعدد المستأجرين لا يمر به (الاعتمادتان فارغتان).

---

## 3) ما لم يُلمس عمداً

- runner.py (تسجيل middleware القائم يعمل بلا تغيير) · tests/test_v6_observability.py (بوابتي القديمة، بقيت بلا تعديل) · رفع refetchInterval للواجهة (ملك واجهة، ليس لي) · مسارات D8 الأخرى (B1/B4/B5/B6/B8+ — ملك E1/E3/others في الخطة) · FE Sentry (E6 أنجز H2 بواجهته).
- الأداء المتوقع (من D8): TTFB الحزمة من ~300-900ms (زائد 100-600ms Graph) إلى ~80-150ms باردة أول مرة ثم <5ms من الكاش خلال النافذة · نداءات Graph لتعليقات التبويب المفتوح من ~33 إلى ≤2/دقيقة · مسار GETs العامة بلا تسلسل زائف.

*التحقق متعمد: كل مطالبة أعلاه مقرونة بموقع كود أو اختبار يعمل في بوابة نُفّذت هذه الجولة؛ ما ليس لي عُزل بbisection على HEAD النظيف قبل إبلاغه.*
