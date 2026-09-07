# تقرير v15-D12 — التزامن والسباقات وasync (تدقيق عميق)

**الوكيل:** D12 (التزامن/السباقات/async) · **الأساس:** main @ 558623b3 (شجرة نظيفة) · **التاريخ:** 2026-09-08
**النطاق:** fb_dashboard/ كاملاً (الخلفية FastAPI على Vercel serverless + runner المحلي) + alembic/versions (مصدر حقيقة القيود) + tests/ (بنية اختبار السباقات). لا كود تطبيق كُتب.

**المنهجية:**
1. جرد آلي شامل لكل الحالة على مستوى الوحدة (globals/caches/locks/counters/registries) عبر fb_dashboard — ثم تتبّع كل واحدة لمن يكتبها ومن يقرؤها تحت التزامن.
2. تعداد كل أنماط check-then-act (TOCTOU): `scalar_one_or_none` ثم insert/update — مع تصنيف من يملك الـ constraint المقابل على قاعدة الإنتاج (legacy عبر سلسلة alembic) مقابل create_all (اختبارات).
3. تتبّع ترتيب العمليات في مسارات الرد/النشر/الحسم: أين يقع `await` خارجي (Graph/Telegram) بالنسبة لـ INSERT/UPDATE/commit — هذا هو مفتاح كل سباقات الإرسال المزدوج.
4. تحليل عائلة المهام الخلفية (`spawn`) على serverless مقابل runner.
5. فحص المكتبات المتزامنة داخل handlers غير المتزامنة.
6. فحص بنية الاختبارات: هل يمكن أصلاً لسباق أن يظهر فيها؟

---

## 0) ملخص تنفيذي

| الشدة | العدد | الأبرز |
|---|---|---|
| حرج | 0 | — |
| عالي | 5 | H1 نشر منشور مجدول مرتين (بلا claim قبل Graph) · H2 ردّ مزدوج عبر الحدود (ترتيب إرسال-قبل-حفظ + قيد ناقص في الإنتاج) · H3 عداد `replies_used` غير ذرّي + انقسام صفوف (فوترة) · H4 تسجيل بنفس البريد مرتين = حساب زومبي لا يستطيع الدخول · H5 فشل upsert المشترك يُسمم معاملة الرسالة كلها ويكذب `stored=True` |
| متوسط | 7 | M1 بث مزدوج (نافذة draft→sending) · M2 كرون بلا قفل تقاطع + `_cron_lock` ميت · M3 argon2id على حلقة الأحداث · M4 عائلة spawn-بعد-الرد على Vercel (فقد بيانات) · M5 SSE ‏/api/events بلا سقوف · M6 restart/stop يخلق حلقة يتيمة · M7 DDL تنافسي في الإقلاع البارد |
| منخفض | 12 | انظر §6 |
| فجوات اختبار السباقات | 3 | لا اختبار يطلق نفس الطلب المتغيّر مرتين متزامنتين؛ StaticPool يخفي التداخل هيكلياً؛ constraints الاختبار ≠ constraints الإنتاج |

**المحصلة النظامية (أهم من أي إيجاد منفرد):** الكود يملك **النمط الصحيح** منذ v9/v12 — `UPDATE ... WHERE status='pending' RETURNING` (حسم الدفعات HTTP+Telegram) و`credit_wallet` الذرّي — لكنه **لم يُطبَّق** على أربعة مسارات أخرى (النشر المجدول، البث، الرد التلقائي، عدادات الاستخدام). وكل حرّاس الذاكرة (cooldown/dedup/rule-cache) هم **per-instance** يتبخرون عبر نسخ Vercel، فيما القيد الوحيد الذي كان سيمنع الرد المزدوج (`uq_reply_tenant_comment`) **معلن في models.py ولا توجد ترحيلة تنشئه على الإنتاج** — عكس إخوته (008/009 أنشأت رسائل/تعليقات/محادثات).

---

## 1) إغلاقات v14 المُعاد التحقق منها حيّةً (لا يُعاد الإبلاغ عنها)

| الإغلاق | الدليل الحي |
|---|---|
| PublisherEngine per-request + ContextVar shim | `_services.py:58-104` — إنشاء جديد لكل طلب؛ الاختبار interleave `tests/test_v14_engines.py:88` موجود |
| SSE سقف اتصالات (5/مستأجر + عمر 600s + جلسة واحدة) | `routers/payments/sse.py:33-63,98-103` — increment/f decrement ضمن finally صحيح |
| WS token_ver parity | `app/ws.py:95-97` |
| CalendarScheduler/SequenceScheduler per-tenant + سقف محاولات | `app/startup.py:247-263` (مقيدة بـ not Vercel)، `_services.py:109-201`، `content_calendar.py:151-180` |
| حسم الدفعات ذرّي (HTTP + Telegram) | `routers/payments/approvals.py:99-112`، `app/telegram.py:84-98,123-131` — UPDATE…WHERE pending RETURNING |
| قرض المحفظة ذرّي | `_wallet.py:75-116` + `begin_nested` + إعادة محاولة UPDATE |
| إشعارات المال inline بلا spawn | `routers/payments/wallet.py:35-61` (timeout 8s) |
| Scheduler الحلقي/النبض لا يبدأ على Vercel | `app/startup.py:240,247,339` |
| `expire_on_commit=False` | `database.py:54` (نفى D3 سباق broadcast) — أعدت التحقق |

كما لم يُعَد الإبلاغ عن: عائلة TOCTOU قيود D3-H1 (sub/customer/tag/…)، D13-F1/D1-H4 (الربط المزدوج 500)، D1-C1 (broadcast spawn لا يرسل على Vercel)، D2-H1 (حدود الخطة غير مفروضة)، D2-H2 (SSRF)، D6-M4 (change-password بلا سقف/حساب). هذه كلها مذكورة هنا فقط كمرجع ترابط.

## 2) الجرد الكامل للحالة على مستوى الوحدة (27 موقعاً)

الحكم النظامي: **كل حرّاس منع التكرار في الذاكرة يتبخرون عند تعدد النسخ/إعادة التشغيل** — القيد في قاعدة البيانات هو الوحيد الدائم.

| # | الموقع | الحالة | تحمل حالة مستأجر؟ | ملاحظة |
|---|---|---|---|---|
| 1 | `app/middleware.py:37-39` | `_dedup_locks/_dedup_ops` | لا (مفتاح=GET+QS) | L1 |
| 2 | `app/spa.py:24-25` | كاش HTML | لا | mtime-guard ✓ |
| 3 | `api_cache.py:12-15` | كاش استجابات | لا (مسارات عامة فقط — D3) | L7 |
| 4 | `agent_engine.py:29-32,313` | brain/memory/tools/fb/_agent | **نعم (عميل المنصة)** | D2-H4 يملكه |
| 5 | `redis_cache.py:13` | اتصال | لا | |
| 6 | `bot_engine/deps.py:18-25` | محركات intent/cache/monitor + 3 dicts لكل مستأجر (context/offer/diag) | **نعم** | ContextEngine فيه إخلاء TTL داخلي ✓؛ الdicts بلا سقف (محدودة بعدد المستأجرين) |
| 7 | `bot_engine/engine.py` (داخل الكائن) | cooldown + dedup + rule-cache + `_post_reply_count` | **نعم** | **per-instance فقط** — قلب H2؛ CooldownStore بلا إخلاء (L2) |
| 8 | `_services.py:23` | `_post_cursors` | **نعم (tenant,page)** | L3 |
| 9 | `_services.py:104,136` | `_publisher` ContextVar / `_attempts` | الطلب / **نعم (sub_id)** | |
| 10 | `_services.py:247,300-301` | `_ai_service`, `_bot_engines` + RLock | **نعم** | التسجيل محمي بقفل ✓ لكن المحتوى per-instance |
| 11 | `agent_brain.py:41,48` | سجل handlers + AI | لا | |
| 12 | `diagnostics.py:75` | `_diag` singleton | جزئياً | مقابل نسخ per-tenant في deps |
| 13 | `fb_client.py:17-18` | `_http` + قفل | لا (التوكن لكل طلب) | init بقفل مزدوج ✓ (L11 لـ close) |
| 14 | `monitor.py:15-16,134` | دفعة botlog + `bot_log` | لا (الصفوف تحمل tenant) | L10 + M4 |
| 15 | `_async.py:21` | `_bg_tasks` | لا | سجل مهام قوي ✓ |
| 16 | `runner.py:132` | `_bot_task` | لا (حلقة عامة) | M6 |
| 17 | `routers/payments/sse.py:39` | `_sse_tenant_counts` | **نعم** | منظّف ✓ لكن per-process (L12) |
| 18 | `routers/payments/plans.py:36` | `_SUB_PENDING_LOCKS` | **نعم (user_id)** | L8 |
| 19 | `routers/facebook_routes.py:31` | `_post_cursors` | **نعم (tid,page)** | L3 |
| 20 | `routers/bot.py:30` | `_cron_lock` | — | **ميت: لا مستخدم** (M2) |
| 21 | `ws_manager.py:75` | `ws_manager._connections` | **نعم** | runner فقط؛ L9 |
| 22 | `event_bus.py:54` | `event_bus._subscribers` | **نعم (فلاتر مستأجر)** | unsubscribe في finally ✓ |
| 23 | `content_calendar.py` (~40) | `_publish_attempts` | **نعم (post_id)** | **in-memory فقط**: عند إعادة التشغيل يُعاد العد من صفر — يساهم في H1 |
| 24 | `telegram_bot.py:24` | `_ENV_ADMIN_IDS` | لا | |
| 25 | `ai_service.py:26-27` | مزودو AI | لا (مفاتيح المنصة) | |
| 26 | `_observability.py:146` | sentry flag | لا | |
| 27 | `app/startup.py` (bridges) | مشتركو event_bus الدائمون | جزئياً | يعاد تسجيلهم عند كل cold start ✓ |

## 3) النمط الذهبي الموجود (للاستنساخ في الإصلاح)

```python
# routers/payments/approvals.py:103 — CLAIM-then-act (v9-A8)
result = await db.execute(
    update(SubscriptionPayment)
    .where(SubscriptionPayment.id == int(payment_id or 0),
           SubscriptionPayment.status == "pending")     # الحراسة نفسها شرط التحديث
    .values(status=decision)
    .returning(SubscriptionPayment)
)
sp = result.scalar_one_or_none()   # الخاسر يحصل None → 400 نظيف
```
و`_wallet.credit_wallet` (`_wallet.py:89-115`): حساب داخل SQL + `begin_nested` + إعادة محاولة عند IntegrityError. **كل إصلاحات هذا التقرير تستنسخ هذين النمطين.**

---

## 4) الإيجادات العالية (5)

### H1 — المنشور المجدول يُنشر مرتين على صفحة فيسبوك العامة: لا "claim" قبل استدعاء Graph

**المواقع:**
- `routers/bot.py:216-244` (نبض الكرون، الخطوة 1):
```python
due = (await db.execute(select(ScheduledPost).where(
    ScheduledPost.status == "scheduled", ...))).scalars().all()   # اقرأ المستحقات
for post in due:
    result = await fb.post_to_page(post.message)                  # ← استدعاء Graph بطيء (بلا claim)
    async with AsyncSessionLocal() as db:
        fresh = await db.get(ScheduledPost, post.id)
        if result and not result.get("_error"):
            fresh.status = "published" ...                         # الحالة تتغير فقط بعد الإرسال
        await db.commit()
```
- `content_calendar.py:145-180` (`_publish_with`) بنفس الترتيب للمجدول المحلي (كل 60s).

**الشدة:** عالي (ميزة مدفوعة has_scheduling؛ تكرار مرئي علناً على صفحة العميل).

**سيناريوهات السباق (ملموسة):**
1. **تقاطع مستهلكَين على الطابور نفسه:** نبض cron-job.org (كل 5 د) يصل والمستحق `post #7` ما يزال `scheduled`؛ يبدأ النشر عبر Graph (بطيء). في الدقيقة نفسها يصل نبض Vercel اليومي (04:00) — SELECT يرى `#7` ما يزال scheduled (لم يُلتزم بعد) → ينشر **نفس المنشور ثانية** → ثم كلٌّ منهما يكتب status=published. النتيجة: **منشور عام مكرر**.
2. **تداخل نبضين متتاليين:** نبض يستغرق دقائق (عدة مستأجرين × fetch fans + posts + comments + ردود مع backoff). cron-job.org (السماح بالتوازي افتراضياً) يطلق النبض التالي قبل انتهاء الأول → نفس النمط.
3. **حتى بلا تزامن — نافذة الانهاء:** Vercel يجمّد الدالة بعد نجاح Graph وقبل `commit` (تجاوز max-duration) → الصف يبقى scheduled → النبض التالي يعيد نشره. **الازدواج منتظم لا عشوائي.**
4. على الـrunner: `_publish_with` يستغرق >60s (إعادة محاولة Graph 3×backoff في `fb_client._post`) → تكة N+1 من CalendarScheduler تلتقط نفس الصف.

**الإصلاح:** claim أولي قبل Graph: `UPDATE scheduled_posts SET status='publishing' WHERE id=:id AND status='scheduled' RETURNING *` — لا صف = تجاوز؛ نجاح Graph → published؛ فشل/تجميد → تعاد من `publishing` بمهلة (مثل سقف محاولات v14). + فهرس فريد جزئي `WHERE status='publishing' AND claimed_at < now()-interval` للتنظيف. يستنسخ حرفياً نمط approvals.py.

### H2 — ردّ آلي مزدوج عبر الحدود: إرسال-قبل-الحفظ + القيد الناقص في الإنتاج

**المواقع والترتيب (bot_engine/pipeline.py):**
```python
:63   if await self.dedup.is_dup(ctx.cid):        # 1) حراسة ذاكرة per-instance
:104  if self.cooldown.is_blocked(ctx.from_id):   # 2) حراسة ذاكرة per-instance (لا تُطبق على الرسائل — engine.py:414)
:169  result = await self.fb.reply_to_comment(...) # 3) الإرسال (يصل 3 محاولات + backoff ~15-20s)
:195  await self.dedup.mark(ctx.cid)              # 4) تعليم في الذاكرة بعد الإرسال
:230  session.add(Reply(...)) ; :263 await session.commit()  # 5) الحفظ أخيراً
```
- `app/webhooks.py:209-214`: فشل حفظ صف التعليق (IntegrityError مكرر) **يُبتلع ويستمر المسار إلى الرد رغم ذلك**.
- **models.py:52 يعلن `uq_reply_tenant_comment` — ولا توجد أي ترحيلة تنشئه** (002 يكتفي بفهرس عادي `ix_reply_tenant_created`؛ 008/009 أنشأت قيود المحادثات/الرسائل/التعليقات؛ فحصت السلسلة كاملة). create_all لا يضيف قيوداً لجداول موجودة مسبقاً.

**الشدة:** عالي (ازدواج مرئي للعميل النهائي + ازدواج إحصاءات/فوترة الردود).

**السيناريو خطوة بخطوة (طلب أ وطلب ب):**
1. فيسبوك يعيد تسليم webhook (الرد على POST بطيء — الشرط المعتاد؛ معالجة الدفعة inline + backoff الرسائل يجعل الاستجابة تتجاوز مهلة FB).
2. الطلب ب يهبط على **نسخة Vercel أخرى**: `dedup`/`cooldown` فارغان تماماً هناك (per-instance).
3. ب يفحص الرسالة: `uq_messages_tenant_fb` (ترحيلة 008 ✓) يفشل إدخال ب → IntegrityError → **except في messenger_service.py:275 → rollback** → هذا المسار محمي فعلاً. أما **التعليق**: فشل إدخال ب للتعليق يُبتلع (webhooks.py:209) → يستمر إلى `process_single_comment` → يرسل **الرد العام + DM مرة ثانية**.
4. إدخال ب لصف Reply: على الإنتاج legacy **لا قيد** → الصفان كلاهما يُدرجان (ازدواج عدّ/إحصاءات). على create_all: ب يلتقط IntegrityError في `pipeline.py:264` — **لكن الرد أُرسل فعلاً** (التنظيف بعد الجريمة).
5. نفس النافذة تنطبق على تقاطع كرون `bot-cycle` (shard) مع خطوة 3 من `heartbeat` التي تدور على **كل** المستأجرين بلا shard (`routers/bot.py:292`) — دورتان لنفس المستأجر على نسختين.

**الإصلاح (طبقتان):**
- **claim قبل الإرسال:** إدراج صف Reply (أو صف claims بحالة `sending`) بـ`flush()` قبل استدعاء Graph، مع `ON CONFLICT (tenant_id, fb_comment_id) DO NOTHING` → rowcount=0 يعني "سبقك أحدهم" → تخطٍّ نظيف. الفشل بعد claim يُعاد لاحقاً من `sending` (نفس فلسفة H1).
- **ترحيلة 014** تنشئ `uq_reply_tenant_comment` على الإنتاج (dedup ثم unique — **تنسيق مباشر مع E-DATA-1/D3-H1** التي تضيف العائلة نفسها للجداول السبعة).

### H3 — عدّاد `replies_used` غير ذرّي + انقسام الصفوف (نزاهة الفوترة)

**المواقع:**
- `bot_engine/engine.py:149-159` (مسار الدورة — التعليق يكذب "atomic"):
```python
# Increment usage counter (atomic)   ← ادعاء كاذب: هذه قراءة-تعديل-كتابة
uc = counter.scalar_one_or_none()
if uc:
    uc.current_value = (uc.current_value or 0) + total_replied   # RMW
else:
    session.add(UsageCounter(..., period_start=utcnow(), ...))    # utcnow() مايكروثانية!
```
- `bot_engine/engine.py:470-484` (مسار webhook DM — نفس النمط +1).
- `bot_engine/engine.py:106-119` (إعادة الضبط "self-healing" — RMW ينافس الزيادات).

**الشدة:** عالي (مسار المال/الحصص؛ يعمّق D2-H1: الحدّ أصلاً غير مفروض — والعداد نفسه يضيع).

**السيناريو (رسالتان متزامنتان من نفس المستأجر — دفعة FB واحدة أو حدثان):**
- **السباق 1 (فقدان تحديث):** أ يقرأ 50، ب يقرأ 50، أ يكتب 51، ب يكتب 51 → زبون استهلك ردين ودُفِع واحد.
- **السباق 2 (انقسام الصفوف):** لا صف بعد → أ و ب كلاهما يُدرج صفاً جديداً بـ`period_start=utcnow()` **مختلفتين** → القيد `uq_usage_tenant_metric_period` (tenant, metric, period_start) **لا يمنع** (الفترتان مختلفتان فعلياً رغم أنهما نفس الفترة المنطقية) → صفّان لنفس الفترة. كل القراءات اللاحقة تأخذ `order_by desc(period_start).limit(1)` → **صف واحد فقط يُحسب** والآخر يتيم إلى الأبد.
- **السباق 3:** إعادة الضبط الدورية تقرأ قديماً وتصفر بعد زيادة متزامنة → يُلغى العد.

**الإصلاح:** نسخة حرفية من `_wallet.credit_wallet`:
`UPDATE usage_counters SET current_value = CAST(CAST(current_value AS NUMERIC) + CAST(:n AS NUMERIC) AS ...) WHERE tenant_id=:t AND metric=:m AND period_start=:p` + `ON CONFLICT ... DO UPDATE` مع **تطبيع period_start إلى بداية الفترة** (date-trunc) لا utcnow().

### H4 — تسجيل بنفس البريد بطلبين متزامنين → حساب زومبي لا يستطيع الدخول أبداً

**الموقع:** `routers/auth.py:198-224`:
```python
existing = await db.execute(
    select(User).where(or_(User.username == username, User.email == email)).limit(1))
if existing.scalars().first():
    raise HTTPException(400, ...)
... tenant = Tenant(...); db.add(tenant); await db.flush()
user = User(..., tenant_id=tenant.id, ...)      # كل مستأجر جديد = قيده الفريد (tenant,username) لا يمكن أن ينشط!
```
- `models.py:130` القيد الوحيد `uq_user_tenant_username` **لكل مستأجر** — وكل تسجيل يخلق مستأجره → القيد لا يُطلق أبداً. **البريد بلا أي قيد فريد** (D3-M سجلها — هنا أضيف النتيجة التزامنية).

**الشدة:** عالي (مدخل قمع الإيرادات؛ نتيجة أسوأ من 500 — حساب مدفوع معطوب).

**السيناريو (نقرة مزدوجة/إعادة إرسال/عميل HTTP):**
1. أ: SELECT → لا صف. ب (متزامن): SELECT → لا صف (لم يلتزم أ بعد — الـbcrypt/argon2 على المسار يوسّع النافذة ~200ms).
2. أ يلتزم (مستأجر T1 + مستخدم U1). ب يلتزم (مستأجر T2 + مستخدم U2 بنفس username/email).
3. الدخول لاحقاً: `auth.py:138-140` `where(User.username==...).order_by(User.id).limit(1)` → يختار U1 **حتمياً** → صاحب ب يُدخل كلمة مروره → 401 دائماً → **حساب ب مقفل للأبد** (مع أي دفعة/اشتراك مرتبطة به)، ودعم فني بلا تشخيص (لا رسالة تقول "بريدك مستخدم مرتين").
- ملاحظة: على قواعد create_all لا IntegrityError أصلاً (لا قيد) — فالنمط "اختبار ثم إدراج" عارٍ تماماً هنا.

**الإصلاح:** فهرس فريد `lower(email)` (ترحيلة، بbackfill dedup أولاً — تنسيق مع E-DATA-1)، و/أو قيد عالمي على username + التقاط IntegrityError → 409 عربية؛ قفل idempotency للطلب في FE موجود جزئياً (RegisterForm) لكن لا يغني عن القيد.

### H5 — فشل upsert المشترك يُسمم معاملة الرسالة كلها ويكذب `stored=True` (تعميق D3-H1 بنتيجة جديدة)

**الموقع:** `messenger_service.py:262-277`:
```python
m = await persist_message(db, ...)          # flush داخلها (سطر 193)
status["stored"] = m is not None            # :264 — تُضبط قبل الالتزام!
try:
    await _upsert_subscriber(db, ...)       # :269 — db.add بلا flush (لا يفشل هنا)
    log.warning(...)                        # :271-272 — الاستثناء لا يُلتقط هنا أصلاً
await db.commit()                           # :274 — IntegrityError القيد (uq_sub_tenant_fbuser على create_all)
except Exception: ...
    await db.rollback()                     # :277 — الرسالة والمحادثة والعدادات كلها تُلغى
```
- upsert المشترك لا ينفّذ flush → الخطأ يظهر عند الـ**commit** خارج نطاق try الداخلي → rollback يشمل رسالة العميل.
- `status["stored"]=True` ضُبطت قبل الالتزام → مسار الرد يستأنف (الشرط في :284 يرى True).

**الشدة:** عالي على قواعد create_all/المهاجرة (فقدان رسالة عميل + ردّ بلا أثر DB)؛ متوسط على legacy (النتيجة هناك ازدواج المشتركين — ملك D3-H1).

**السيناريو:** رسالتان متزامنتان من نفس المرسل الجديد (بوت يرد + إعادة تسليم):
1. أ: persist يفلش الرسالة ✓، `stored=True`، إدراج Subscriber في الهواء، يلتزم → نجاح.
2. ب (متزامن): SELECT المشترك → لا صف (التزام أ لم يكتمل) → إدراج → **commit يفشل بIntegrityError** → rollback → **رسالة ب lost + المحادثة lost** لكن `stored=True` بقيت.
3. ب يرد على العميل فعلياً (engine) → `_persist_bot_reply` يبحث المحادثة → لا توجد (رولباك) → الرد **لا يُحفظ أيضاً** → العميل يرى رداً والداشبورد يرى صفراً — «البوت يرد ولا شيء يظهر» (نفس عرْض الشكوى التاريخية لكن بسبب جديد).

**الإصلاح:** `begin_nested()` حول إدراج المشترك + flush داخله + ابتلاع IntegrityError هناك فقط (المعاملة الأم تنجو)، وتعيين `status["stored"]` بعد نجاح الـcommit، أو تحويله إلى `INSERT ... ON CONFLICT DO UPDATE last_interaction_at`.

---

## 5) الإيجادات المتوسطة (7)

### M1 — بث مزدوج: نافذة `draft→sending` غير ذرّية
`broadcast_engine.py:188-213`: فحص `status != "draft"` ثم `await get_tenant_fb_client` (نقطة تعليق) ثم `b.status="sending"; commit`. طلبا إرسال متزامنان (زرّان/تبويبان — D4-H6: بلا تأكيد أصلاً) كلاهما يرى draft → كلاهما ينشئ مستلمين (`:283-288` — ولا قيد فريد على (broadcast_id, subscriber_id)) → **كل مشترك يستلم الرسالة مرتين** + صفوف مستلمين مضاعفة. الإصلاح: claim ذرّي `UPDATE broadcasts SET status='sending' WHERE id=:id AND status='draft' RETURNING` (نسخة approvals.py) + قيد فريد (broadcast_id, subscriber_id).

### M2 — الكرون بلا قفل تقاطع + `_cron_lock` معرّف ولا يُستخدم أبداً
`routers/bot.py:30` ينشئ `asyncio.Lock` **بلا أي استخدام** (grep: صفر استدعاءات acquire). `heartbeat` و`bot-cycle` بلا أي حراسة تقاطع؛ وخطوة 3 من heartbeat (`:289-292`) تدير دورات لكل المستأجرين **بلا shard** بينما bot-cycle يقسم 10 — التقاطع وارد عبر نسخ/زمن. النتيجة تغذي H1/H2. الإصلاح: زرع نبض "قيد جارٍ" ذرّي في SystemConfig (claim ب`UPDATE ... WHERE ts < now()-interval`) يجعل النبض الثاني ينسحب بنظافة، واستخدام القفل الموجود على الأقل داخل العملية.

### M3 — argon2id/bcrypt متزامنة داخل handlers غير متزامنة (حجب حلقة الأحداث)
`_hash.py:8` (argon2id: t=3, m=64MB, p=4) و`routers/auth.py:145,219` (verify/hash داخل async بلا to_thread): كل محاولة تسجيل دخول تحجب الحلقة ~100-250ms + 64MB تخصيص. **سلسلة الضرر:** 10 محاولات دخول متزامنة → ~2s تجميد لكل الطلبات في النسخة → معالجة webhook تتجاوز مهلة فيسبوك → إعادة تسليم → يضخّم H2 مباشرة. ومسار change-password بلا سقف لكل حساب (D6-M4) يجعل المهاجم **يدوّس الأداء للجميع بنفسه**. الإصلاح: `asyncio.to_thread(verify_password, ...)` (argon2 يحرر GIL جزئياً بparallelism) أو خفض `memory_cost`؛ تسجيل الدخول أكثر مسار تزامن في المنصة.

### M4 — عائلة spawn-بعد-الرد على Vercel: فقد بيانات صامت خارج المال
v14 أصلح إشعارات **المال** فقط (inline). المتبقي يموت عند تجميد الدالة بعد الرد:
- `routers/support.py:118` — **إشعار تذكرة الدعم للأدمن لا يصل أبداً على Vercel** → الزبون ينتظر بلا رد (ثقة مستخدم).
- `monitor.py:102` — دفعة BotLog (كل 10 أحداث) تضيع → /api/logs وSentry يريان أقل من الحقيقة.
- `_services.py:401` (`_track_event`) — أحداث analytics للـwebhook/التعليقات تضيع → لوحات أقل من الواقع.
- `routers/bot.py:378` — `POST /api/bot/trigger` يرد "تم تشغيل الدورة" والدورة تموت بعد الرد — **كذبة نجاح** (نفس جذر D1-C1 لكن مساراً مختلفاً).
- `api_cache.py:119`, `content_calendar.py:179` — كتابات كاش/تحليلات.
الإصلاح: inline بمهلة (نمط `_notify_admins_inline`) للدعم وbotlog/trigger؛ أو جدول outbox يستهلكه النبض (M2).

### M5 — SSE ‏/api/events بلا سقوف: طابور غير محدود + اشتراك داخل المولّد
`app/ws.py:145-181`: على عكس SSE المدفوعات (v14) هذا المسار: `asyncio.Queue()` **بلا maxsize** (عميل متوقف عن القراءة + أحداث نشطة = تسريب ذاكرة غير محدود)، بلا سقف اتصالات/مستأجر، بلا سقف عمر (`while True` + keepalive 30s)، والاشتراك يحدث داخل `event_generator` (لا يبدأ حتى يقرأ العميل أول chunk — الأحداث قبله تُفقد). على Vercel يقتله max-duration في النهاية (finally يعمل ✓)؛ الخطر الفعلي على runner/النشر أحادي الخادم. الإصلاح: نسخ قيود sse.py نفسها (5/مستأجر، 600s، Queue(maxsize)+إسقاط الأقدم).

### M6 — restart/stop للبوت بلا قفل → حلقة يتيمة مزدوجة
`routers/bot.py:70-98`: `cancel` ثم `create_task` بلا قفل؛ طلبا restart متزامنان → المهمة الأولى تُنشط لكن handle يُستبدل بالمهمة الثانية → **حلقة الأولى يتيمة تعمل للأبد** (وتنشأ بـ`asyncio.create_task` خارج سجل `_bg_tasks` — مرشحة لGC أيضاً) → دورات مضاعفة لكل المستأجرين (cooldown يخفف الرد المزدوج لكن يعطل الأداء والسجلات). الإصلاح: قفل على العملية + `spawn()` بدل create_task + إلغاء أي `_bot_task` قائم قبل الإنشاء (كما يفعل جزئياً).

### M7 — إقلاع بارد متزامن: create_all + reconcile + alembic + seeds على قاعدة واحدة من نسخ متعددة
`app/startup.py:184-237`: بعد كل نشر، اندفاع طلبات يجمّد/يطلق نسخاً متعددة → كل نسخة تشغّل نفس DDL والترحيلات والبذور. أعراض متكررة: أخطاء "already exists" (تُبتلع بتحذير ✓)، سباق `alembic_version`/DDL أقفال (تبقى معاملة ترحيل واحدة وتبقى الأخرى "skipped" بتحذير)، وبذرة plans بفحص-ثم-إدراج (`_seed_subscription_plans:158-167`) قد تفشل لأحدهما (ُيبتلع outer → "app continues" منقوص البذر). الإصلاح: قفل PostgreSQL advisory حول كتلة الترحيل/البذر (`pg_advisory_lock`) — رخيص ويحل العائلة كلها.

---

## 6) الإيجادات المنخفضة (12)

| # | الموقع | الإيجاد + السيناريو المصغّر | الإصلاح |
|---|---|---|---|
| L1 | `app/middleware.py:54-79` | pop للمفتاح بينما ب ينتظر القفل + إخلاء TTL لقفل مازال محجوزاً → قفل جديد → طلبا GET متطابقان يعملان معاً (dedup استشاري فقط — لا فساد) | إبقاء القيد في dict المرجع؛ حذف فقط عند عدم انتظار أحد |
| L2 | `bot_engine/cooldown.py:16` | `_store` entry لكل مستخدم فريد **للأبد** (لا إخلاء) — تسريب بطيء على runner (100k معلق ≈ عشرات MB) | evict دوري للحواجز الأقدم من max window |
| L3 | `facebook_routes.py:31,233-236`؛ `_services.py:23` | `_post_cursors[(tid,page)]` مشترك: قيمة الcursor تعتمد per_page — طلبان بper_page مختلفين → صفحة خاطئة/تكرار عناصر؛ dict لا يُخلى | مرر cursor في الطلب (stateless) أو مفتاح يشمل per_page + سقف |
| L4 | `_rate_limit.py:24-36` | قرار العدّ غير ذرّي: N طلبات متزامنة عند الحدّ تتجاوز جميعاً (over-admission محدود)؛ التنظيف ينظف **مفتاح الطلب فقط** → الجدول ينمو بلا حدود (لا sweeper) | عدّ داخل UPDATE/counting مستقل + sweeper في النبض |
| L5 | `messenger_service.py:188-192,352-354` | `message_count/unread_count` RMW على ORM: رسالتان متزامنتان بنفس المحادثة → زيادة واحدة تضيع (انحراف عدّادات الواجهة) | `UPDATE conversations SET message_count = message_count + 1` أو تجميع |
| L6 | `sequence_engine.py:228,253`؛ `pipeline.py:297` | `total_subscribers`/`total_interactions` RMW — انحراف عدادات CRM/الحملات | UPDATE ذرّي بالمزيّد |
| L7 | `api_cache.py:18-21,97-102` | إخلاء `_cache_locks` قد يحذف قفلاً مازال محجوزاً → قفل جديد → تنفيذان متزامنان للـfn (stampede نافذة) | إخلاء المخزن فقط؛ الأقفال بLRU منفصل |
| L8 | `routers/payments/plans.py:42-43` | `clear()` للسجل عند >1024 بينما طلبات **تحمل** أقفاله → قفل جديد لنفس المستخدم → نافذة check-then-insert تُفتتح | `del` لكل user بعد الخروج من القفل، لا clear جماعي |
| L9 | `app/ws.py:47-103` | حلقة receive بلا مهلة خمول: اتصال half-open يبقى للأبد بلا بثّ يكشفه؛ المصافحة بلا rate limit (استعلامات DB لكل محاولة) | ping/pong دوري + سقف مصافحات/IP |
| L10 | `monitor.py:26-36` | فشل flush يبتلع الدفعة (تضيع) — والspawn يقتلها على Vercel (M4) | retry/backoff + كتابة critical inline |
| L11 | `fb_client.py:381-385` | `close()` بلا قفل يصفّر `_http` بينما طلبات تحمله → أخطاء عابرة عند إيقاف runner فقط | قفل + إعادة ضبط مرجعية |
| L12 | `routers/payments/sse.py:39` | السقف 5 **لكل عملية** — مزرعة تبويبات عبر نسخ Vercel لا تحدها فعلياً | قيد عدّ في Redis/DB عند الحاجة (موثّق فقط) |

---

## 7) المعاملات وجلسات async عبر استدعاءات خارجية (طلب البند 4)

فحصت كل مسار يفتح جلسة ثم يستدعي Graph/Telegram قبل الإغلاق:

| المسار | الحكم |
|---|---|
| `app/telegram.py:79-161` (حسم sub_/pay_) | **سليم**: claim→commit ثم استدعاءات Telegram **بعد** الالتزام — لا قفل صف يمتد عبر HTTP خارجي |
| `routers/payments/approvals.py:103-151` | **سليم**: نفس الترتيب؛ قفل الصف قصير (push_notification داخلية) |
| `messenger_service.py:255-277` | **سليم تقنياً**: resolve Graph يحدث قبل أول عبارة SQL (لا معاملة مفتوحة) — لكنه يطيل زمن الاستجابة |
| `bot_engine/engine.py:86-235` (cycle) + `pipeline.py` | **خطر بالاحتفاظ لا بالقفل**: جلسة واحدة تُمسك طول الدورة كلها (كل نداءات Graph + backoff) — NullPool = اتصال مخصص لكل دورة/حدث webhook (دقائق) — لا row-locks تمتد (SELECTs فقط قبل الإرسال) فلا deadlock، لكن ضغط اتصالات Neon وتضخيم مهلة الاستجابة (مضخّم إعادة التسليم لـ H2) |
| `broadcast_engine.py:297-355` | **سليم بنيوياً** (جلسة لكل مهمة + Semaphore(10)) — عدا M1 |
| `content_calendar.py:255-270` + `routers/bot.py:216-244` | الجلسة تُفتح، وGraph يُستدعى داخلها (post للجدول المحلي)؛ لا تعديل قبل الإرسال → لا قفل ممتد؛ الخطر هو H1 نفسه |

**لا يوجد `with_for_update`/`FOR UPDATE`/advisory lock واحد في المستودع كله** (grep: صفر) — كل التسلسل الموجود إما في-الذاكرة أو claim-UPDATE.

## 8) async: المكتبات المتزامنة داخل handlers

- `requests`: **صفر** ✓. `time.sleep`: **صفر** في fb_dashboard ✓ (retries كلها `asyncio.sleep`).
- **bcrypt/argon2: موجودة وتُنفَّذ على الحلقة** (M3) — في login/register/change-password.
- Fernet (`_crypto.py`): ميكروثانية — مقبول.
- قراءة الملفات المتزامنة: أُخرجت من الحلقة في أماكنها (`_load_dm_map` to_thread ✓، startup to_thread ✓) — استثناء واحد: `spa.py` (mtime+قراءة) عند أول طلب — صغير.
- Pillow re-encode للإيصالات: في upload path — CPU متوسط الحجم؛ مرشّح to_thread لاحقاً (ليس عاجلاً).

## 9) بنية اختبار السباقات (طلب البند 9) — 3 فجوات

**ما هو موجود فعلاً (إيجابي يُبنى عليه):**
- `test_v14_engines.py:88` — interleave حقيقي (gather) لـPublisher عبر مستأجرين ✓ (يثبت أن الفريق يعرف كتابة اختبار سباق).
- `test_v14_sse.py:321` — تدفقان متزامنان لنفس الدفعة ✓.
- `test_tenant_isolation.py:71-92`, `test_bot_isolation.py:137`, `test_cache.py:48` — gather على المحركات/الكاش.
- اختبارات replay **متسلسلة**: `test_radical_v4.py:201`, `test_world_class_v3.py:150` (نفس mid مرتين — الثانية بعد التزام الأولى).

**T1 — لا يوجد اختبار واحد يطلق نفس الطلب المُغيِّر مرتين متزامنتين.** المسارات الحرجة كلها بلا اختبار مزدوج-متزامن: register (H4)، subscriptions create (L8)، حسم approve مزدوج، broadcast send مزدوج (M1)، نشر مجدول مزدوج (H1)، webhook نفس التعليق متزامناً (H2)، عداد متزامن (H3). كل اختبارات replay الموجودة تمر **لأن الأولى التزمت قبل الثانية** — عكس الترتيب الذي يصنع السباق.

**T2 — القاعدة الاختبارية تخفي التداخل هيكلياً.** `conftest.py:72-78` + `database.py:16-24`: SQLite + StaticPool = **اتصال واحد مشترك** تسلسله قائمة aiosqlite → معاملتان متزامنتان لا يمكن أن تتناوبا أصلاً (BEGIN/COMMIT تتشابك على اتصال واحد)؛ وcreate_all ينشئ القيود — **قاعدة أقوى من الإنتاج** حيث uq_reply/قيود D3 غير موجودة (اختبارات تُصدِّق قاعدة لا يعيشها الإنتاج).

**T3 — لا غطاء لترتيب claim-قبل-الإرسال.** لا اختبار يثبت أن "صف الحماية موجود قبل نداء Graph" (يمكن بموك send يفحص DB لحظة الاستدعاء — ينكشف H1/H2 فوراً).

**المقترح (خطة موجزة):**
1. **بطارية double-submit**: helper واحد `fire_concurrent(client, method, url, body, n=2)` بasyncio.gather → يُطبَّق على المسارات الستة أعلاه؛ التوقع: فائز واحد + رد نظيف للخاسر (400/409/تخطّي) — لا صفوف مكررة (`assert count == 1`).
2. **عنصر interleaving للـpipeline**: خطاف `await asyncio.sleep(0)` قابل للحقن (نقطة قطع) عند مواضع claim/send في المحركات — يفرض التناوب الحتمي المطلوب للكشف (نمط "deterministic interleave" بدل الاعتماد على الحظ).
3. **وضع اختبار PG مؤقت** (docker أو Neon branch مؤقت في CI) لتشغيل بطارية القيود (T2) — ولو لمسارات المال فقط.
4. **اختبار ترتيب-العملية**: mock لـ`reply_to_comment`/`post_to_page` يتحقق أن صف الحماية/الرد موجود في DB **قبل** الاستدعاء (يكشف H1/H2/H5).
5. تثبيت إيجابي: اختبار gather لحسم دفعتين متزامنتين (sub_/pay_) يثبت النمط الذهبي لا يتراجع (regression guard).

## 10) ترتيب التنفيذ المقترح + الترابط مع بقية الوكلاء

| الأولوية | البند | يغلق | التنسيق |
|---|---|---|---|
| 1 | migration 014: `uq_reply_tenant_comment` (+ عائلة D3-H1 السبعة بbackfill) | نصف H2 | **E-DATA-1/D3** — نفس الترحيلة |
| 2 | claim-قبل-Graph للنشر المجدول (heartbeat + content_calendar) | H1 | مع M2 (قفل النبض) في وكيل الكرون |
| 3 | claim-قبل-الإرسال لمسار الرد (pipeline) + status بعد الالتزام + begin_nested للمشترك | H2/H5 | D2 (محركات) — نفس الملف |
| 4 | عداد ذرّي (نسخ credit_wallet) لتطبيع period_start | H3 | ربطه بإغلاق D2-H1 (فرض الحدود) — واحد بدون الآخر بلا معنى |
| 5 | قيد lower(email) + 409 | H4 | مع E-DATA-1 |
| 6 | بطارية double-submit + interleaving hook | T1/T2/T3 | **D7/E-wave اختبارات** |
| 7 | M1 claim البث + M4 (support inline) + M3 (to_thread) + M5/M6/M7 | متوسطات | حسب الملكية |
| 8 | L-wave حسب الفرصة | — | — |

**ملاحظات عابرة للمنسّق:**
- النمط الذهبي موجود منذ v9 — مشكلة v15 هنا **انتشار** النمط لا اختراعه؛ التنفيذ ميكانيكي منخفض المخاطر.
- M3 (argon2 على الحلقة) يبدأ أداءً لكنه **مُضخِّم لـH2** عبر مهلة webhook — أنصح معالجته في نفس الموجة.
- كل إيجاد من إيجاداتي الخمسة العالية قابل لاختبار سالب مزدوج-متزامن مباشر (بند 9-1) — أي إصلاح بلا الاختبار سيبقى غير مثبّت.
- قيد `ix_sub_payment_user_pending` (partial unique) **موجود على PG** عبر 002 → فشل الـdouble-submit المتزامن عبر نسخ = 500 خام (عائلة D13-F1) وليس ازدواجاً — يُحسم مع تحويل D13-F1 إلى 409.
