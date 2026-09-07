# تقرير تدقيق الأداء الشامل — v15-D8

**الوكيل:** D8 (تدقيق أداء) · **الأساس:** main @ 558623b3 · **الطبيعة:** بحث/تدقيق عميق — لا كود تطبيق
**النطاق:** الخلفية `fb_dashboard/` (N+1، COUNT، ترحيل، payloads، تسلسلية، مهلات httpx) + الواجهة `fb_dashboard/frontend/` (next.config، مكتبات ثقيلة، react-query، صور، render-blocking، dynamic imports) + مقارنة بمعايير Core Web Vitals (LCP<2.5s، INP<200ms، CLS<0.1 على 3G ليبي).

---

## 0) منهجية والتحقق من إغلاقات v14 (لا تُعاد)

قرأت worklog + تقرير v14 أولاً، ثم تحققت **ميكانيكياً** أن إغلاقات v14 الأدائية حية قبل أي عدّ جديد:

| إغلاق v14 | التحقق | الحالة |
|---|---|---|
| كاش `/api/public/stats` ttl=300 | `plans_config.py:116-126` — الديكوريتور تحت `router.get` (التسجيل الصحيح) + كاش `/api/plans` (3600) و`/api/config` (300) | ✅ حي — غير معاد |
| ميزانية JS 187.3KB gz | قست المخرَج المُزامن `fb_dashboard/static/`: هبوط = 13 chunk بمجموع 669.5KB خام / **209.3KB gz** (يخص الهبوط وحده)؛ القاعدة المشتركة للـ9 مسارات العامة (طريقة البوابة نفسها) ما تزال 187.3KB ≤ 190KB | ✅ لا انحدار |
| سقوف القوائم (crm/subscribers/broadcasts/comments/notifications/logs le=…) | موجودة كلها — **لكن وجدت مسارين فاتهما السقف** (B6 أدناه — إيجاد جديد لا إعادة عدّ) |
| WeasyPrint خارج الحلقة، Publisher لكل طلب، سقف اتصالات SSE | تحققت سريعاً — حية، غير معادة |
| إصلاحات v8/v10/v11 الجبهوية (lazy recharts، usePublicStats فردي، batch upsert للتعليقات/المحادثات، تخطي مزامنة inbox 30ث) | حية في الكود | ✅ غير معادة |

قياسات ميكانيكية إضافية (أدلة، من `fb_dashboard/static/` + الملفات المصدرية):
- أكبر chunk: `1seqqbmormb-y.js` = 580.5KB خام / **182.7KB gz** = **Sentry SDK كاملة** (علامات `Sentry.init`/`dsn`/`captureMessage`، صفر كود تطبيق) — يُحمّل async بعد الترطيب من كل مسار (F1).
- chunk `25r382agt28tb.js` = 90.2KB / **29.0KB gz** = @base-ui + PaymentDialog (علامات مميزة) — يدخل تحميل `/subscribe` الأول (F2).
- CSS العام: 162.4KB خام / **21.8KB gz** — سليم. الخطوط المُحمّلة مسبقاً: cairo-arabic 30.9KB + readex-pro 22.9KB، `font-display: swap`، محلية (لا Google Fonts RTT).
- فرضية httpx الافتراضية = مهلة **5ث فقط** لكل عميل بلا `timeout=` (تحقق تجريبي: `httpx default timeout: Timeout(timeout=5.0)`).

---

## 1) إيجادات الخلفية — حرج 0 · عالي 4 · متوسط 5 · منخفض 5

### B1 — عالي — إعادة تحميل de-dup بنافذة 48 ساعة **لكل تعليق** (مسح كامل مكرر)

**الموقع:** `fb_dashboard/bot_engine/engine.py:225-235` + `:524-530`
```python
async def _process_comment(self, session, comment: dict, post_id: str) -> bool:
    rules = await self._rule_cache.get_rules()
    ...
    replied_ids = await self._load_replied_ids(session)      # ← لكل تعليق!
    await self._dedup_engine.load(replied_ids)
```
```python
async def _load_replied_ids(self, session) -> set[str]:
    cutoff = datetime.utcnow() - timedelta(hours=48)
    stmt = select(Reply.fb_comment_id).where(Reply.created_at >= cutoff)
    ...
    return {row[0] for row in result}                        # ← كل ردود 48 ساعة
```
**المشكلة:** `_process_comment` يُستدعى لكل تعليق في `cycle()` (حلقة مزدوجة: منشورات × تعليقات، engine.py:135-144) **وفي مسار الويبهوك** (`process_single_comment`). كل استدعاء ينفّذ SELECT يُرجع كل `fb_comment_id` لآخر 48 ساعة ثم يعيد بناء الـset في الذاكرة. مستأجر عنده 5,000 رد/48ث ودورة تعالج 200 تعليق → **200 استعلام × 5,000 صف = مليون صف منقول في دورة واحدة**. هذا أثقل نقطة DB في المسار الساخن كله. ملاحظة إضافية: `ReplyDedupCache.load()` (cache_layer.py:84-87) **يستبدل** `self._seen` بالكامل — أي `mark()` من مسار متوازٍ (ويبهوك + دورة) يُمحى بإحمَال لاحق (خطر سباق dedup).
**الإصلاح المقترح:** (1) التحميل مرة واحدة لكل دورة/نافذة TTL (مثلاً كل 60-120ث) بدل كل تعليق؛ أو (2) استعلام `IN (batch)` لمعرّفات تعليقات الدفعة الحالية فقط؛ أو (3) `mark()` تراكمي + reload دوري. إصلاح `load()` ليكون union لا استبدال.
**الأثر المقدر:** دورة 200 تعليق: من ~200 استعلام ثقيل إلى 1 — توفير >95% من زمن DB للحلقة؛ يفتح المجال لخفض `BOT_INTERVAL_SECONDS` بلا حرق اتصالات Neon.

### B2 — عالي — `/api/comments`: 11 نداء Graph **تسلسلية** لكل طلب، بلا خنق، والواجهة تستطلع كل 20 ثانية

**الموقع:** `fb_dashboard/routers/replies.py:111-119` + `fb_client.py:170-179`
```python
@router.get("/api/comments")
async def list_comments(limit: int = Query(30, ge=1, le=200), ...):
    fb = await get_tenant_fb_client(_tid)               # 2 SELECT + فك تشفير لكل طلب (لا كاش)
    if fb is not None:
        await _sync_recent_comments(db, _tid, fb, limit=min(limit, 50))   # ← Graph كل طلب
```
```python
async def get_recent_comments(self, limit: int = 50) -> list:
    posts, _ = await self.get_page_posts(10)            # نداء 1
    for p in posts:
        comments = await self.get_post_comments(p["id"], limit // max(len(posts), 1))  # ← 10 نداءات تسلسلية
```
**المشكلة:** كل طلب `/api/comments` (سقف v14 حدّ الحجم لا التكرار) ينفّذ **1 + 10 نداءات Graph تسلسلية** (كل واحد 100-600ms → 1.1-6.6ث زمن استجابة) + استعلامات upsert. `dashboard/comments/page.tsx:32` يستطلع `refetchInterval: 20000` → تبويب تعليقات مفتوح = **~33 نداء Graph/دقيقة/مستأجر**، تُضاف فوق دورة البوت التي تسحب المنشورات نفسها كل 10ث — استنزاف حصة Graph rate-limit (Business Use Case) وخطر 429 يوقف الردود التلقائية للجميع. قارن: inbox حصل على تخطي 30ث لكل مستأجر في v8-A12 (`_INBOX_LAST_SYNC`) — التعليقات لم تحصل عليه.
**الإصلاح المقترح:** (1) نفس نمط `_INBOX_LAST_SYNC` (تخطي 30-60ث لكل مستأجر)؛ (2) `get_recent_comments` بنداء واحد متعدد المنشورات أو `asyncio.gather` بسقف؛ (3) رفع `refetchInterval` للتعليقات إلى 30-60ث أو الاعتماد على بث WS الموجود أصلاً (`new_reply`).
**الأثر المقدر:** زمن استجابة القائمة من 1.1-6.6ث إلى <100ms في 2/3 الطلبات (DB-first)، ونداءات Graph من 33/دقيقة إلى ≤2/دقيقة لكل مستأجر مفتوح على التبويب.

### B3 — عالي — `dashboard_bundle`: ~17 استعلام DB تسلسلي + نداء Graph في المسار الحرج، بلا كاش

**الموقع:** `fb_dashboard/routers/dashboard_stats.py:21-177`
```python
total_replies = await db.scalar(select(func.count(Reply.id))...)        # 1
today_replies = await db.scalar(...)                                    # 2
chart_rows = await db.execute(...)                                      # 3
fan_count = await tenant_fb.get_page_fan_count()                        # ← Graph 100-600ms تسلسلي
... 2 استعلام snapshot ...
total_conversations/total_messages/unread/bot_replies                   # 4-7
top rule group_by                                                       # 8
rule_rows (كل القواعد)                                                  # 9
recent_replies/recent_logs                                              # 10-11
"trend": await _get_trend_data(db, _tid),                               # 12-15 (4 COUNT إضافية)
```
**المشكلة:** الصفحة الرئيسية للوحة (أكثر مسار authenticated ضغطاً، يستطلعه FE كل 60ث لكل تبويب مفتوح) ينفّذ سلسلة استعلامات **تسلسلية** + نداء Graph حي لعدد المعجبين قبل إكمال الحسابات. لا كاش (نقاط الكاش v14 عامة فقط). انظر `analytics_engine.get_dashboard_overview` (سطر 51-62) الذي يجمع 6 COUNTs في **استعلام واحد** بمرشحات — الراوتر لم يتبنّ النمط.
**الإصلاح المقترح:** (1) دمج العدادات في استعلام تجميعي واحد (نمط analytics_engine) + `asyncio.gather` للبقية المستقلة؛ (2) الاستغناء عن نداء fan الحي — **snapshot يحدّثه cron heartbeat كل 5 دقائق أصلاً** (bot.py:251-284) — اقرأه فقط؛ (3) كاش APICache قصير (30-60ث) بمفتاح tenant (مع تحذير D10 §8 المعروف: يحتاج key_fn يشمل المستأجر).
**الأثر المقدر:** TTFB للحزمة من ~300-900ms (Neon بارد أطول) إلى ~80-150ms؛ إسقاط نداء Graph يزيل 100-600ms تأخير متغير.

### B4 — عالي — تأخير ACK للويبهوك: حل Graph قبل التخزين + backoff داخل الاستجابة

**الموقع:** `messenger_service.py:31-46, 255-263` (رسائل) + `bot_engine/pipeline.py:164-192` (تعليقات) + `engine.py:423-431`
```python
# messenger_service.handle_messaging_event — قبل أي تخزين:
conv_id = await resolve_conversation_id(fb_client, page_id, sender_id)   # ← Graph RTT كامل قبل persist
m = await persist_message(db, ...)
...
result = await engine.process_single_message(messaging)                 # ← يتضمن 3 محاولات إرسال + sleep(1.2^n)
```
```python
# pipeline.Stage 8 (تعليقات): 3 محاولات + asyncio.sleep(2**attempt)  → حتى 7ث نوم
# engine.process_single_message: 3 محاولات + asyncio.sleep(1.2**attempt) → حتى ~4.4ث نوم
```
**المشكلة:** استجابة 200 لفيسبوك لا تُرسل إلا بعد: نداء Graph لحل معرف المحادثة + persist + البوابة + **محاولات إرسال الرد مع backoff** (أخطاء Graph المتكررة = 15-30ث قبل ACK). فيسبوك يعيد المحاولة عند بطء ACK (منطق dedup يلتقطها — لكن الازدواج والحمل والاحتمال إلغاء الاشتراك للنقطة البطيئة كلها مخاطر). القيد مفهوم (Vercel يقتل background tasks)، لكن الترتيب قابل للتحسين: التخزين أولاً (idempotent) ثم المعالجة.
**الإصلاح المقترح:** (1) persist فوراً بمعرف اصطناعي (آلية `_SYNTH_PREFIX` موجودة أصلاً!) ثم حل المعرف الحقيقي **بعد** التخزين (ترقية الحوار موجودة: `_get_or_create_conversation` يرقّي الاصطناعي)؛ (2) محاولة إرسال واحدة inline + تسليم إعادة المحاولة لنبضة cron/heartbeat التالية (سويتش flag على الرسالة)؛ (3) كاش معرفات المحادثات per (page,user) بدقة TTL.
**الأثر المقدر:** ACK من أسوأ حالة 15-30ث إلى <1s نموذجياً؛ انخفاض إعادة تسليم فيسبوك وازدواج المعالجة.

### B5 — متوسط — دورات cron/heartbeat **تسلسلية عبر المستأجرين** + `get_tenant_fb_client` بلا كاش (2 SELECT + فك تشفير × 3-4 لكل مستأجر لكل نبضة)

**الموقع:** `app/telegram.py:165-188` (الحلقة المحلية) + `routers/bot.py:148-163` (cron/bot-cycle) + `routers/bot.py:261-299` (heartbeat: fan sweep ثم دورة لكل مستأجر)
```python
for tenant in all_tenants:            # cron bot-cycle — تسلسلي
    fb_cli = await get_tenant_fb_client(tenant.id)   # 2 SELECT + decrypt لكل مستأجر
    ...
    await engine.cycle()              # دورة كاملة قبل المستأجر التالي
```
**المشكلة:** heartbeat الواحد ينفّذ لكل مستأجر: (أ) sweep النشر المجدول، (ب) fan refresh — `get_tenant_fb_client` مرة + جلسة للكتابة، (ج) دورة بوت كاملة — كل ذلك تسلسلياً، والمستأثر الوحيد بجلسات DB المنفصلة. `get_tenant_fb_client` (services.py:328-354) يفتح جلسة ويستعلم `fb_page_id` ثم `fb_access_token` **في استعلامين متتاليين** (يمكن واحد بـ`key.in_`) بلا أي كاش (inbox.py وحده يكاش عبر `_tenant_fb_cache`). مع 50 مستأجراً: ~150-200 round-trip DB و30-60ث زمن نداء — فوق حد Vercel Hobby (60ث) للدالة.
**الإصلاح المقترح:** دمج استعلامي BotState في واحد؛ كاش عميل لكل مستأجر (مثل inbox) بإخلاء عند تدوير التوكن؛ `asyncio.gather` بسقف (semaphore 5) لدورات المستأجرين أو تقسيم النبضة (fan sweep مجمّع بـIN واحد بدل حلقة لكل مستأجر).
**الأثر المقدر:** زمن النبضة ينخفض خطياً بعدد المستأجرين (×3-5 عند التوازي المقيّد)؛ الحماية من تجاوز حد 60ث على Hobby.

### B6 — متوسط — قائمتان فاتتهما موجة سقوف v14 وتستطلعهما الواجهة كل 30 ثانية

**الموقع 1:** `routers/scheduled_posts_routes.py:21-35`
```python
@router.get("/api/scheduled-posts")
async def list_scheduled_posts(status: str = Query(""), ...):
    stmt = select(ScheduledPost).where(ScheduledPost.tenant_id == _tid)
    ...
    rows = await db.execute(stmt.order_by(desc(ScheduledPost.scheduled_at)))   # ← لا limit
```
**الموقع 2:** `routers/rules.py:31-37` — `select(Rule)...order_by(Rule.priority, Rule.id)` بلا limit + GROUP BY عدّادات الردود لكل قاعدة.
**المشكلة:** v14-E3 سقّف crm/subscribers/broadcasts/comments/notifications/logs — هذان المساران المُستهلكان فعلاً (posts/page.tsx:26 وautoreply/page.tsx:31 — استطلاع 30ث) بقيا بلا سقف. `ScheduledPost` يحمل نص المنشور كاملاً + image_url؛ سجل تاريخي متراكم (النشر المجدول أرشيفي بطبيعته) → آلاف الصفوف كل 30ث. `rules` بلا حد **فعلي** لأن حدود الخطة غير مفروضة أصلاً (إيجاد D2-H1: max_rules ديكوري).
**الإصلاح المقترح:** `limit: int = Query(50, ge=1, le=200)` + `offset/page` على المسارين + فلترة scheduled-posts الحالية افتراضياً بـstatus (FE لا يعرض المنشورة تاريخياً).
**الأثر المقدر:** payload الطلب من غير محدود إلى ≤200 صف؛ استقرار زمن الاستجابة عند نمو البيانات.

### B7 — متوسط — `dedup_middleware` يُسلسل GETs المتطابقة **بلا كاش** (مضخم زمن الوصول للنقاط العامة)

**الموقع:** `app/middleware.py:42-62`
```python
async with lock:
    # ponytail: second concurrent caller will re-execute but hit the APICache if decorated
    response = await call_next(request)
```
**المشكلة:** القفل يُمسك أثناء التنفيذ، فالطلبات المتزامنة بنفس المفتاح (method+path+query — **بلا هوية مستخدم**) تنتظر **تسلسلياً**، والثاني وما بعده يعيدون التنفيذ (التعليق يعترف). النتيجة الصافية: 10 زوار أول متزامنين على `/api/plans` أو `/api/public/stats` = 10 تنفيذات متسلسلة (كل واحدة قد تكون باردة 100-300ms على Neon) → الزائر الأخير ينتظر ~3ث إضافية، بدل تحقيق هدف "dedup" المعلن. المفاتيح تعمل فقط للنقاط الثلاث المزينة بـAPICache.
**الإصلاح المقترح:** إما (1) singleflight حقيقي: شارك الـResponse/النتيجة مع المنتظرين (يحتاج حل Response streaming في Starlette)، أو (2) احذف الـmiddleware لأن APICache يفعل المطلوب للنقاط المزينة، أو (3) قصره على المسارات المزينة بالكاش فقط.
**الأثر المقدر:** إزالة التسلسل غير المجدي من المسار العام؛ p95 أقل لاندفجارات الزيارات المتزامنة (حملة تسويقية/مشاركة رابط).

### B8 — متوسط — جلب خيط المحادثة **كاملاً (حتى 200 رسالة) كل 10 ثانية** بلا مزامنة تزايدية

**الموقع:** `routers/inbox.py:190-210` (الخادم: `.limit(200)` ثابت) + `messages/page.tsx:117-122` (الواجهة: `refetchInterval: 10000`)
```python
msgs = (await s.execute(
    select(Message).where(Message.conversation_id == row.id)
    .order_by(Message.created_at.asc()).limit(200)
)).scalars().all()      # كل الرسائل في كل طلب
```
**المشكلة:** صفحة الرسائل تستطلع خيط المحادثة المفتوح كل 10ث وتنقل **الخيط كاملاً** (نصوص + مرفقات) في كل مرة. محادثة نشطة 200 رسالة × ~200 بايت = ~40KB JSON كل 10ث = 4KB/s لكل مستخدم فقط للانتظار — على 3G ليبي يزاحم النطاق الحقيقي ويضيف INP. البنية التحتية للـWS موجودة وتبث `new_message` — الصفحة لا تستمع لها بل تستطلع.
**الإصلاح المقترح:** (1) معامل `since=` (message_id/timestamp) يعيد الرسائل الجديدة فقط؛ (2) أو اشتراك WS/SSE الموجود لتحديث الخيط لحظياً والاستطلاع احتياطياً كل 30-60ث.
**الأثر المقدر:** ~95% خفض payload الاستطلاع؛ تحسّن INP على الهواتف الضعيفة.

### B9 — منخفض — `TagEngine.list_tags` N+1 (لكن المسار بلا مستهلك واجهة)

**الموقع:** `subscriber_engine.py:337-356`
```python
for t in tags:
    cnt_r = await session.execute(
        select(func.count(SubscriberTag.id)).where(SubscriberTag.tag_id == t.id)   # ← COUNT لكل وسم
```
**المشكلة:** `/api/tags` (subscribers_tags_routes.py:54-56) ينفّذ 1+N استعلام (وسم → COUNT). تحققت من خريطة المستهلكين: **لا صفحة واجهة تستدعي `/api/tags`** (audience تستخدم subscribers+overview+top-commenters فقط) — الإيجاد كامن لا نشط.
**الإصلاح المقترح:** استعلام واحد `GROUP BY tag_id` عند إحياء المسار.
**الأثر المقدر:** عند إحياء الواجهة: من N+1 إلى 2 استعلام.

### B10 — منخفض — `/api/analytics/export`: صفوف غير محدودة + `days` غير مقيد (مسار بلا مستهلك واجهة)

**الموقع:** `routers/analytics.py:148-155`
```python
rows = await db.execute(
    select(Reply).where(Reply.tenant_id == _tid, Reply.created_at >= cutoff).order_by(desc(Reply.created_at))
)   # ← لا limit؛ days: int = Query(30) بلا ge/le
```
**المشكلة:** `days` غير مقيد في كل مسارات analytics (`overview`, `export`…) — days=36500 يجلب كل الردود التاريخية + payload JSON/CSV كامل في الذاكرة (admin-role للتصدir فقط). v14 قيّد days على `/api/logs/clear` وحده. لا مستهلك FE لـexport (خريطة D1) لكن المسار حي ومصدَّق.
**الإصلاح المقترح:** `days: int = Query(30, ge=1, le=365)` + `limit` على التصدير (10k صف) أو تدفق StreamingResponse.
**الأثر المقدر:** سقف أعلى لذاكة/زمن الطلب عند إساءة استخدام أو إحياء الزر.

### B11 — منخفض — `offer_engine.get_best_offer`: جدول العروض كاملاً لكل تعليق نية شرائية

**الموقع:** `offer_engine.py:41-45`
```python
stmt = select(Offer).where(Offer.is_active == True)    # كل الصفوف النشطة
if tenant_id: stmt = stmt.where(Offer.tenant_id == tenant_id)
```
**المشكلة:** في `pipeline.Stage 6` يُستدعى لكل تعليق بسوق نية شرائية — يقرأ كل العروض النشطة (بلا limit/كاش) كل مرة. جدول صغير عملياً لكن النمط استعلام-per-comment مثل B1.
**الإصلاح المقترح:** كاش TTLC 60-120ث (مثل RuleCache) أو `limit(1)` مع ترتيب.
**الأثر المقدر:** إسقاط استعلام كامل من المسار الساخن عند وجود عروض.

### B12 — منخفض — عملاء httpx جُدد لكل نداء بلا مهلة صريحة في 4 محركات

**الموقع:** `publisher_engine.py:37, 82` · `commerce_engine.py:115, 144` · `routers/telegram_config.py:103` · `ai_service.py:376` (تنزيل صورة الرؤية)
```python
async with httpx.AsyncClient() as client:      # مهلة افتراضية 5ث (تحقق تجريبي)، لا limits، لا إعادة استخدام اتصال
```
**المشكلة:** كل نداء يبني عميلاً جديداً (مهلة مصادفة 5ث — Telegram/النشر قد يفشلان زوراً)، بلا pooling. `fb_client` الرئيسي سليم (عميل وحدة مشترك timeout=15 + limits — fb_client.py:26-28) و`facebook_engine/client.py` سليم (timeout=15).
**الإصلاح المقترح:** عميل وحدة لكل محرك (نمط fb_client) + `timeout=httpx.Timeout(15)` صريح. (ملاحظة: غياب سقف حجم/مهلة تنزيل صورة `_gemini_vision` مُبلَّغ في D6-H2 — لا أعيد عدّه؛ الإصلاح هنا يكمله).
**الأثر المقدر:** إعادة استخدام اتصالات TLS (خفض ~50-100ms لكل نداء) + مهلات متوقعة.

### B13 — منخفض — `scheduler-check` يحلّ عميل FB **داخل حلقة المنشورات** (نفس المستأجر)

**الموقع:** `routers/analytics.py:210-215`
```python
for post in due.scalars().all():
    platform = getattr(post, "platform", "facebook") or "facebook"
    if platform == "facebook":
        fb = await get_tenant_fb_client(_tid)     # ← لكل منشور، نفس المستأجر
```
**المشكلة:** 2 SELECT + فك تشفير Fernet لكل منشور مستحق رغم أن `_tid` ثابت. (المسار admin فقط.)
**الإصلاح المقترح:** ارفع الحل خارج اللوب (مثل نمط content_calendar.py:261-266 الذي كاش العميل لكل مستأجر في v14-E2).
**الأثر المقدر:** 2N→2 استعلام؛ مثال يحتذى لمواءمة المسارات المتشابهة.

### B14 — منخفض — أيام غير مقيدة على مسارات analytics المصادقة

**الموقع:** `routers/analytics.py:23, 149, 230, 236, 242…` — `days: int = Query(30)` بلا ge/le في overview/dashboard/daily-trend/hourly-heatmap/… (المستهلكة: analytics+audience+reports pages).
**المشكلة:** days=100000 على `/api/analytics/overview?days=…` (مصادق، يستطلع كل 60ث) = GROUP BY يومي/ساعي على كل التاريخ + heatmap بآلاف الخلايا. حد ذاتي فقط.
**الإصلاح المقترح:** `days: int = Query(30, ge=1, le=366)`.
**الأثر المقدر:** سقف أعلى لحجم الاستجابة والاستعلام.

---

## 2) إيجادات الواجهة — متوسط 2 · منخفض 3 (+ تأكيدات نضج)

### F1 — متوسط — Sentry SDK كاملة (182.7KB gz) تُحمّل بعد الترطيب في **كل زيارة باردة لكل المسارات**

**الموقع:** `src/instrumentation-client.ts:14-31` + الدليل الميكانيكي: chunk `1seqqbmormb-y.js` (580.5KB خام/182.7KB gz، علامات Sentry خالصة، لا كود تطبيق).
```ts
export async function register() {
  const dsn = resolveSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN)
  ...
  const Sentry = await import("@sentry/nextjs")   // ← يُحمّل فور الترطيب في كل مسار
```
**المشكلة:** التعليق يقول "chunk loads async after hydration" — صحيح لكنه لا يزال **أكبر مورد JS في المنصة** ينزل في نافذة حرجة: على 3G ليبي (~1.6Mbps) = ~0.9ث airtime تزاحم تحميل أجزاء LazySections والتفاعل الأول (INP). كل زائر بارد (زائر هبوط من إعلان) يدفع الثمن كاملاً رغم أن tracesSampleRate=0.05 فقط.
**الإصلاح المقترح:** خيارات: (1) تأجيل الاستيراد إلى idle (`await new Promise(r => setTimeout(r, 3000))` أو requestIdleCallback داخل register) — يبقى التقاط الأخطاء الأولى بحدود؛ (2) تحميل SDK فقط على مسارات اللوحة (القيمة الحقيقية للأخطاء هناك)؛ (3) تقليل حزمة init. قرار منتج: الترادوف بين تتبع أخطاء الزوار العام مقابل 182KB لكل زائر بارد.
**الأثر المقدر:** تحرير ~0.9ث نطاق بعد الترطيب على 3G لكل زائر بارد (يُحسّن INP وسرعة ظهور الأجزاء الكسولة).

### F2 — متوسط — تسريب `PaymentDialog` + @base-ui إلى التحميل الأول لـ`/subscribe` رغم dynamic() الموجود

**الموقع:** `src/app/subscribe/SubscribeContent.tsx:13` + `src/app/subscribe/PaymentSection.tsx:6`
```tsx
import { ReviewSummary } from "./PaymentSection"      // ← استيراد ساكن للوحدة
// PaymentSection.tsx:
import { PaymentDialog } from "@/components/shared/PaymentDialog"   // ← يجر @base-ui/dialog معه
...
const PaymentDialogWrapper = dynamic(() => import("./PaymentSection")..., { ssr: false })  // ← مُهزَم
```
**المشكلة:** `dynamic()` على `PaymentDialogWrapper` بلا فائدة عملية: الاستيراد الساكن لـ`ReviewSummary` من **نفس الوحدة** يجرّ كامل `PaymentSection.tsx` ومعه استيراد `PaymentDialog` العلوي → chunk `25r382agt28tb.js` (90.2KB/29.0KB gz: @base-ui + PaymentDialog) في تحميل أول لسطح التحويل المالي العام. الحوار يفتح فقط عند نقر "ادفع الآن".
**الإصلاح المقترح:** انقل `ReviewSummary` إلى ملف مستقل (`ReviewSummary.tsx`) — استيراد ساكن له فقط، ويبقى `PaymentSection` (حاوية الحوار) ديناميكياً بحق. سطر واحد + نقل بلوك.
**الأثر المقدر:** −29KB gz من المسار الحرج لصفحة الاشتراك (سطح التحويل) على 3G؛ أول تحميل أرَش لخطوة المراجعة.

### F3 — منخفض — `SetupWarnings`: جلب خام عند كل تركيب مسار لوحة (26 مساراً) بلا كاش

**الموقع:** `src/components/shared/SetupWarnings.tsx:46-54` — `apiFetch("/api/setup-status")` في `useEffect` بكل تركيب (DashboardShell يركّبه في كل مسار). حالة الإعداد تتغير نادراً؛ `/api/setup-status` نفسه 4-5 استعلامات. خلف `staleTime` react-query المتاح في السياق نفسه.
**الإصلاح المقترح:** حوّله إلى `useQuery` بمفتاح `["setup-status"]` مع `staleTime: 5*60_000` (يركّب تحت QueryProvider الموجود في layout اللوحة).
**الأثر المقدر:** 4-5 استعلامات DB + RTT لكل تنقل بين مسارات اللوحة → مرة كل 5 دقائق.

### F4 — منخفض — `sonner` ساكن في مسارات اللوحة (11KB gz) رغم AppToaster الديناميكي للعامة

**الموقع:** `src/lib/premium-toast.tsx:3` (`import { toast } from "sonner"`) مستورد ساكناً من `DashboardShell.tsx:4` ومكونات أخرى. حزمة العامة نحيفة (AppToaster dynamic) لكن مسارات اللوحة (26) تدفع 11KB gz في الأول — مقبول لكن قابل للإسقاط بفصل `brandedToast` إلى dynamic barrel.
**الأثر المقدر:** −11KB gz من أول تحميل للوحة؛ أولوية منخفضة.

### F5 — منخفض — `LandingTestimonials`: جلب بلا كاش وحدة عند كل زيارة هبوط لendpoint يرجع `[]` دائماً

**الموقع:** `src/components/landing/LandingIslands.tsx:65-76` — `apiFetch("/api/public/testimonials")` لكل mount (الرد ثابت `ok([])` حتى إدخال بيانات — plans_config.py:156-162). مثل `usePublicStats` الذي أخذ كاش 60ث في v10-C2، هذا بلا مثيله.
**الإصلاح المقترح:** نفس نمط كاش الوحدة 60ث (أو React cache حتى إدخال الشهادات).
**الأثر المقدر:** −1 طلب شبكة لكل زيارة هبوط.

### ✅ تأكيدات نضج موثقة (لمنع إعادة العد مستقبلاً)

- **recharts** lazy حقيقي (`charts/lazy.tsx` ssr:false + skeleton) — chunk 100.8KB gz خارج المسار العام ✓
- **framer-motion مُزال كلياً** من dependencies (v13) — بقايا CSS twins فقط ✓
- **react-query محصور** في layouts اللوحة/الأدمن (v12-E5.2) بـstaleTime 30s/retry 1/no focus-refetch ✓ — والصفحات متعددة الاستعلام (audience/reports) تُطلقها **متوازية** بحكم useQuery المستقلة ✓
- **الخطوط**: محلية + preload للعربية النشطة + unicode-range subsets + swap ✓ — لا render-blocking خارجي؛ CSP يسمح Google Fonts لكنه غير مستعمل
- **الصور**: og-image 114.9KB محسنة الكاش immutable؛ أيقونات بحجم معقول؛ `OptimizedImage` فيها sizes/loading=lazy/fetchPriority ✓ (images.unoptimized مقصود — إيصالات بعيدة)
- **LCP**: عنصر h1 نصي SSR بلا أنيميشن (page.tsx:138-146) ✓؛ الجزر الكسولة تحت الطية (LazySections dynamic) ✓
- **SpeedInsights** فقط كطرف ثالث (سكربت Vercel صغير مؤجل) — لا سكربتات خارجية render-blocking

---

## 3) إيجاد عابر للنطاقات (وظيفي — اكتُشف بالتحليل الأدائي)

### X1 — عالي (وظيفي) — `recent_replies` في `dashboard_bundle` **فارغة دائماً** (استهلاك مزدوج للنتيجة)

**الموقع:** `routers/dashboard_stats.py:124-148`
```python
recent_replies_rows = await db.execute(select(Reply)...limit(8))
...
for r in recent_replies_rows.scalars().all():          # السطر 131 — الاستهلاك الأول
    activities.append({...})
...
"recent_replies": [{
    ...
} for r in recent_replies_rows.scalars().all()[:5]]    # السطر 148 — الاستهلاك الثاني = []
```
**الإثبات:** اختبرت سلوك SQLAlchemy 2.0 (نفس عائلة إصدار المستودع): استدعاء `.scalars().all()` مرتين على نفس النتيجة → **الثانية ترجع `[]`** (المؤشر مستهلك). أي أن `recent_replies` في استجابة `/api/dashboard/bundle` **فارغة دائماً**، وبطاقة "آخر الردود" في الصفحة الرئيسية للوحة تعرض "لا توجد ردود بعد" حتى مع وجود ردود — بينما `recent_activity` (استُهلكت أولاً) تعمل. فات D1 (الخلفية) وD4 (الواجهة) لأن الواجهة تتعامل مع الفارغ بأمان.
**الإصلاح المقترح:** `recent = recent_replies_rows.scalars().all()` مرة واحدة ثم استخدمها للسلسلتين. (درس أدائي: استهلاك النتيجة مرة — نفس مبدأ B1).
**الأثر المقدر:** إحياء بطاقة ميتة على أهم صفحة في المنتج؛ إسناد للمنسق لأنه إصلاح مملوك محتمل لـE-wave الخلفية/الواجهة.

---

## 4) التقييم مقابل معايير Core Web Vitals (3G ليبي)

| المعيار | الهدف | الوضع الحالي (تحليل + قياس) | الحاسم |
|---|---|---|---|
| LCP | <2.5s | h1 نصي SSR + CSS 21.8KB gz + خطوط preload/swap + JS عام 187.3KB gz (البوابة خضراء) — **محتمل التحقق** | الفجوات المتبقية: F1 (Sentry يزاحم النطاق) و F2 (سطح الاشتراك) — ليست LCP-blockers مباشرة |
| INP | <200ms | صفحات خفيفة المعالجة، react-query، لكن: استطلاع الرسائل 10ث لخيط كامل (B8) + إعادة رسم activity 15ث لـ100 صف — خطر INP متوسط على هواتف ضعيفة | B8 + F1 هما الرافعان |
| CLS | <0.1 | skeletons بارتفاعات ثابتة، OptimizedImage بنسب أبعاد، font-display:swap (اختلاف مقاييس خط السقوط البديل = خطر CLS شبه صفري مع preload للناشطة) | سليم |

**الخلاصة:** الواجهة العامة ناضجة أدائياً (جولات v6-v14 أغلقت المذنبين الحقيقيين). المعركة المتبقية **خلفية بالكامل تقريباً**: المسار الساخن للبوت (B1)، وحصة Graph (B2)، وزمن أول رد API للوحة (B3)، وACK الويبهوك (B4) — كلها تُغذي UX "المنصة بطيئة/لا ترد" المُحسّة على 3G أكثر من أي بايت JS إضافي.

---

## 5) ترتيب التنفيذ المقترح لموجة E (للمنسق)

1. **E-P1:** B1 (تحميل dedup مرة/نافذة + إصلاح load-يستبدل) — أعلى أثر DB في المسار الساخن؛ اختبار سباق توازي (ويبهوك×دورة).
2. **E-P2:** B2 (خنق 30-60ث لمزامنة التعليقات + gather للمجموعة + رفع استطلاع FE أو WS) + B6 (سقفا scheduled-posts/rules) — كتلة "Graph والقوائم" واحدة.
3. **E-P3:** B3 (تجميع العدادات + snapshot fan بدل الحي + كاش tenant-keyed) + X1 (الإصلاح الوظيفي المرفق — سطر واحد).
4. **E-P4:** B4 (persist-قبل-الحل + محاولة واحدة inline) — يحتاج قرار Vercel spawn semantics (تنسيق مع D1-C1 broadcast no-send).
5. **E-P5:** B5/B7/B13 (التوازي المقيّد + singleflight/حذف + رفع حل العميل) ثم F1/F2 (Sentry defer + فصل ReviewSummary).
6. موجة منخفضة: B8 (since= أو اشتراك WS)، B9-B14، F3-F5.

**أعداد نهائية: 20 إيجاداً = حرج 0 · عالي 5 (B1، B2، B3، B4، X1-وظيفي) · متوسط 6 (B5، B6، B7، B8، F1، F2) · منخفض 9 (B9-B14، F3، F4، F5)**

*تحقق متعمد: لم أكتب أي كود تطبيق؛ كل الأدلة من قراءة المصدر + قياسات gzip/HTTP على المخرَج المُزامن + تجربة سلوك SQLAlchemy/httpx في venv المستودع.*
