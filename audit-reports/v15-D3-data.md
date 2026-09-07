# تقرير التدقيق D3 — طبقة البيانات (جولة v15)

**الوكيل:** D3 (تدقيق عميق حصري لطبقة البيانات) · **الأساس:** main @ 558623b3 (v14 مكتملة) · **التاريخ:** 2026-09-07
**النطاق:** `fb_dashboard/models.py` (49 جدولاً) · `alembic/` (001→013 + env.py) · `_schema_reconcile.py` · `database.py` · `api_cache.py` · `cache_layer.py` · `redis_cache.py` + الربط بالراوترات/المحركات لكشف الفهارس المفقودة والمعاملات.
**المنهجية:** قراءة كاملة لكل ملف + **تحقق ميكانيكي** ببنائين متوازيين على SQLite: (أ) سلسلة alembic كاملة `upgrade head`، (ب) مسار إقلاع التطبيق `create_all + reconcile_schema`، ثم مقارنة انعكاسية شاملة (أعمدة/فهارس/قيود/FK) + اختبار FK فعال بـ`PRAGMA foreign_keys=ON` لمحاكاة PostgreSQL.

**القاعدة:** لا إبلاغ عمّا أُغلق في v14 (ترحيلة 013 + uq_botstate_tenant_key + الفهارس الأربعة الساخنة + env.py SSL — كلها تحققت سليمة ومطابقة ثلاثياً ✓).

## الخلاصة بالأرقام

| الشدة | العدد | |
|---|---|---|
| حرجة | **0** | — |
| عالية | **3** | H1، H2، H3 |
| متوسطة | **8** | M1–M8 |
| منخفضة | **10** | L1–L10 |
| معلوماتية/عابرة | 10 | §م |

**سلامة البنية الثلاثية (models ↔ migrations ↔ reconcile):** تحققت ميكانيكياً — على قاعدة تُبنى بالسلسلة من الصفر: الأعمدة والقيود المصرّح بها في `models.py` كلها موجودة، والرأس واحد (`013`)، والسلسلة خطية بلا تفرع، و`downgrade` موجود في كل الترحيلات الثلاث عشرة (001/007 عمداً no-op موثقة). الانحرافات الثلاثية المكتشفة محدودة بالأعمدة/الفهارس **الزائدة** (M5، M6) وبفجوة legacy الموثقة في reconcile (H1).

---

## أ) العالية (3)

### H1 — قيود التفرد على جداول ما قبل إعادة البناء غير مضمونة في الإنتاج + upsert غير محمي على مسار الويبهوك الساخن
- **الموقع:** `fb_dashboard/models.py:321` (`uq_sub_tenant_fbuser`)، `models.py:747` (`uq_customer_tenant_fbuser`)، `models.py:348/207/369/462/703` (`uq_tag_tenant_name`، `uq_ctag_tenant_name`، `uq_subscriber_tag`، `uq_seq_sub`، `uq_usage_tenant_metric_period`)
- **المقتطف:** `_schema_reconcile.py:41-43` يصرّح بالحد:
  ```python
  NOT covered (documented limits): other unique/index/FK drift beyond the list
  below. App-level checks already guard these paths; ...
  ```
  والكاتب الحي على مسار الويبهوك check-then-insert بلا قيد ولا معالجة:
  ```python
  # messenger_service.py:217-237
  row = await db.execute(select(Subscriber).where(
      Subscriber.tenant_id == tenant_id, Subscriber.fb_user_id == sender_id))
  sub = row.scalar_one_or_none()          # تكرارات → MultipleResultsFound
  if sub is None:
      db.add(Subscriber(tenant_id=tenant_id, fb_user_id=sender_id, ...))
  ```
- **التحليل:** جداول `subscribers/customers/tags/subscriber_tags/sequence_subscriptions/usage_counters` موجودة في الإنتاج منذ ما قبل إعادة البناء (ترحيلة 001 أضافت لها tenant_id — أي أنها كانت قائمة). `create_all` لا يعدّل جداولاً قائمة، ولا ترحيلة ولا reconcile تنشئ قيودها الفريدة، والـSQL اليدوي (migrations/002_saas_migration.sql) أنشأ فقط `uq_reply_tenant_comment` و`uq_user_tenant_username`. v14 عالجت هذه العائلة لجدول bot_state حصراً (013 + _INDEX_HEAL). الكتابات متزامنة (حدثان ويبهوك لنفس مستخدم جديد) تُنشئ تكراراً صامتاً؛ كل حدث لاحق يفشل في `scalar_one_or_none` → يُبتلع بتحذير (messenger_service.py:268-272 / pipeline.py:310-311) → **تجمّد تحديث الجمهور/CRM لذلك المستخدم نهائياً** + تضخّم العدّاد + استهداف البث يرى صفّين لنفس الشخص (رسالة مزدوجة). على قواعد create_all النظيفة يظل سباق check-then-insert يولّد IntegrityError خاماً = 500 (عائلة D13-F1 المفتوحة أصلاً — instance جديد).
- **الإصلاح المقترح:** ترحيلة `014` على نمط 013 حرفياً (dedup بـ keep MAX(id) + `CREATE UNIQUE INDEX`) لقيود التفرد السبعة على الجداول الستة، وتوسيع `_INDEX_HEAL` بها؛ وتحويل upsert الجمهور إلى نمط `begin_nested + IntegrityError` المجرب في `_wallet.credit_wallet` (v14). ملاحظة: dedup لـsubscriber_tags يحتاج مجموعة (subscriber_id, tag_id) فقط.

### H2 — `SequenceEngine.subscribe` لا يضبط tenant_id → الصفوف تسقط في المستأجر 0 والميزة لا تُرسل أبداً
- **الموقع:** `fb_dashboard/sequence_engine.py:209-232`
- **المقتطف:**
  ```python
  sub = SequenceSubscription(
      subscriber_id=subscriber_id, sequence_id=sequence_id,
      current_step=0, status="active",
  )                          # tenant_id غائب → default 0
  session.add(sub)
  ...
  except IntegrityError:
      await session.rollback()   # يرجع جلسة المستدعي كلها للوراء
  ```
- **التحليل:** الراوتر يمرر `tenant_id` (`routers/sequences.py:104`) لكن الدالة تستعمله فقط للتحقق من Sequence وتتجاهله عند الإدراج. النتائج: (1) وكيب v14-E2 (`_services.py:109-130`) يحلّ عميل الإرسال من `tenant_id` صف الاشتراك (=0) → `get_tenant_fb_client(0)` بلا اعتماديات → «tenants without connected credentials are SKIPPED» → **كل اشتراك يُنشأ عبر الـAPI لا يُرسَل له خطوة واحدة** — ميزة drip ميتة بصمت مع أن المجدول يعمل؛ (2) حذف المستأجر (admin_routes.py:381 يفلتر `tenant_id`) لا يمس هذه الصفوف → يتيمة دائمة؛ (3) `rollback()` الكامل anti-pattern يُلغي أي تغييرات معلقة للمستدعي. تحقق جانبي: `get_or_create` الخاص بالمشتركين (subscriber_engine.py:19-68) **كود ميت** (صفر مستدعين) لكنه يحمل نفس الخلل — يُحذف أو يُصلح معه.
- **الإصلاح المقترح:** `SequenceSubscription(..., tenant_id=tenant_id)` + استبدال rollback بـ`begin_nested`، وحذف/إصلاح `get_or_create` الميت، وترحيلة dedup تصلح الصفوف القائمة (tenant من الـSequence المقابل).

### H3 — `delete_sequence` يعتمد على FK CASCADE غير موجود في الإنتاج → خطوات واشتراكات يتيمة تستمر بالإرسال
- **الموقع:** `fb_dashboard/sequence_engine.py:141-151`
- **المقتطف:**
  ```python
  """Delete sequence and all related steps + subscriptions.
  Steps cascade via FK ondelete=CASCADE. Return True if deleted."""
  ...
  await session.delete(seq)     # بلا relationship في النموذج ولا حذف صريح
  ```
- **التحليل:** النموذج (`models.py:416-430`) لا يعرّف relationship للأبناء، والاعتماد كله على FK DB-level — وهي غير موجودة على جداول ما قبل إعادة البناء: ترحيلة `002:79-88` توثّق صراحة أن FKs «manual for production DBs» ولم تُنفّذ (ولا reconcile يشفّي FKs). وSQLite في الاختبارات لا يفعّل FK افتراضياً → **الاختبارات لا تلتقط ذلك** (تحققت ميكانيكياً: الحذف ينجح ويترك الأبناء). النتيجة: حذف تسلسل يترك steps+subscriptions حية؛ في وضع الخادم الواحد/المحاكاة (المجدول يعمل — startup.py:254-256) **تستمر رسائل drip لتسلسل محذوف**؛ في الإنتاج Vercel (لا مجدول) الأثر تراكم صفوف يتيمة + استعلامات المجدول المستقبلية فوق بيانات مقطوعة. مقارنةً: flows وinbox وtags كلها تحذف الأبناء صراحة (flows.py:92، inbox.py:246/310) — التسلسلات وحدها تعتمد على الـFK.
- **الإصلاح المقترح:** حذف صريح بأسلوب flows.py قبل `session.delete(seq)`؛ واختبار سلبي بـSQLite-FK-ON أو مستوى الشبكة يثبت اليتيم اليوم.

---

## ب) المتوسطة (8)

### M1 — register: فحص عالمي (username OR email) مقابل قيد per-tenant + بريد بلا قيد إطلاقاً
- **الموقع:** `routers/auth.py:198-202` مقابل `models.py:130` (`uq_user_tenant_username` على tenant_id+username).
- **المقتطف:** `select(User).where(or_(User.username == username, User.email == email)).limit(1)`
- **التحليل:** الفحص التطبيقي عالميّ عبر المستأجرين بينما القيد الفعلي per-tenant (انحراف دلالي)؛ وعمود `email` **بلا أي قيد تفرد** — سباق تسجيلين بنفس البريد يمر عبر الفحص وينتج تكراراً دائماً (لا IntegrityError أصلاً ليوقفه). سباق username عبر مستأجرين مختلفين يمر عبر القيد لكن يصدّه الفحص؛ سباق username داخل نفس المستأجر → IntegrityError خام → 500 (عائلة D13-F1).
- **الإصلاح:** قيد فريد على email (أو فحص+قيد متطابقان per-tenant) + التقاط IntegrityError → 409 عربية.

### M2 — reconcile يسقط server_default: أعمدة NOT-NULL-in-model تُضاف NULL في الإنتاج وتبقى كذلك
- **الموقع:** `_schema_reconcile.py:144-146`
- **المقتطف:**
  ```python
  stmt = f'ALTER TABLE {table.name} ADD COLUMN "{col.name}" {col_type}'
  bind.execute(sa.text(stmt))     # بلا DEFAULT
  ```
- **التحليل:** مثالان حيان: `users.is_platform_admin` (models.py:159: nullable=False + server_default false — **لا ترحيلة له إطلاقاً**، المصدر الوحيد هو reconcile) و`users.token_ver` (ترحيلة 011 تحمل server_default='0' لكن حارسها `if "token_ver" not in cols` يتخطى التعبة لأن reconcile سبقها — ترتيب الإقلاع في startup.py:185-214 هو create_all → reconcile → alembic). النتيجة على الإنتاج القديم: أعمدة قابلة للـNULL بقيم NULL دائمة رغم عقد النموذج. اليوم يُسدّ الثغر تطبيقياً (`auth.py:78` بـ`or 0`، و`is_platform_admin` falsy=None آمن default-deny)، لكن عقد المخطط مكسور وأي SQL/انعكاس/BI لاحق يفترض NOT NULL سيخالف.
- **الإصلاح:** في reconcile: إذا كان للعمود `server_default` أضفه للجملة (`ADD COLUMN x BOOLEAN DEFAULT false` — مدعوم في SQLite/PG للثوابت)، أو ترحيلة تكميلية `UPDATE ... SET` + `SET NOT NULL`.

### M3 — إبطال الكاش عبر النسخ مكسور: invalidate_on_write ميت وclear_all محلي فقط
- **الموقع:** `api_cache.py:107-127` و`routers/admin_routes.py:236-241`
- **المقتطف:**
  ```python
  # admin_set_config بعد الـcommit:
  from _services import api_cache
  api_cache.clear_all()      # يمسح _cache_store المحلي فقط — لا Redis
  ```
  و`invalidate_on_write` (التي تكتب لـRedis) **لا مستدعٍ لها في المستودع كله** (grep).
- **التحليل:** على Vercel متعدد النسخ: المسؤول يغيّر أرقام الدفع/البنك → نسخته تُصفّر محلياً وتبقى مفاتيح Redis عند النسخ الأخرى تُقدَّم حتى انتهاء TTL (≤5 دقائق `/api/config`، ≤ساعة `/api/plans`) — مستخدم في تلك النافذة يرى **أرقام حساب قديمة ويدفع لها** (مسار مالي). `invalidate_on_write` نفسها تحمل عيباً كامناً (L1).
- **الإصلاح:** في `clear_all`: مسح Redis بـ`SCAN`+`DEL` بادئة المفتاح، وتفعيل `invalidate_on_write` على مسارات الكتابة، وتوثيق عقد «TTL هو الحد الأعلى للانتشار».

### M4 — delete_user يترك يتائم بلا FK (مثبت ميكانيكياً) ويصطدم بـRESTRICT في TelegramApprover
- **الموقع:** `routers/users.py:69-80`، `models.py:726` (`added_by_id = Column(Integer, ForeignKey("users.id"))` بلا ondelete).
- **التحليل:** تحققت بمحاكاة FK-ON: حذف مستخدم يترك `notification_preferences` (صف + قيد uq_notif_pref_user يتيم)، `notifications.user_id`، `support_tickets(+replies).user_id`، `audit_logs.actor_id` — كلها بلا FK (مقبول لسجل التدقيق، ليس للبقية). وعلى قواعد create_all على PG: حذف مستخدم مُشار إليه في `telegram_approvers.added_by_id` → IntegrityError → 500 خام.
- **الإصلاح:** حذف تابع صريح (prefs/notifications/tickets-scoped) + `ondelete="SET NULL"` للموافّق أو فحص مسبق → 409.

### M5 — عمودان ترحيليان بلا مقابل في النموذج (انحراف ثلاثي مثبت ميكانيكياً)
- **الموقع:** `alembic/versions/004_security_features.py:51-52` و`alembic/versions/001_initial.py:83-84`.
- **المقتطف:** التحقق الآلي أظهر بعد `upgrade head` مقابل `create_all`:
  ```
  [COLS DIFF] users: chain-only=['onboarding_completed']
  [COLS DIFF] payment_requests: chain-only=['amount_numeric']
  ```
- **التحليل:** 004 يضيف `users.onboarding_completed` بينما النموذج يضعه على **Tenant** (models.py:121) — عمود ميت على كل قاعدة تمر بالسلسلة (النموذج لا يقرأه من users أبداً). 001 يضيف `payment_requests.amount_numeric` بينما النموذج يستعمل `amount` — عمود ميت مماثل. لا أثر تشغيلي (ORM يتجاهلهما) لكنه انحراف ثلاثي صريح يربك أي فحص schema-freshness مستقبلي.
- **الإصلاح:** حذف السطرين من الترحيلات (أو نقل onboarding إلى مكانه الصحيح تاريخياً) + بوابة فحص مطابقة metadata↔انعكاس في CI.

### M6 — فهرس scheduled_posts مزدوج الاسم والأعمدة بين النموذج والترحيلات (مثبت ميكانيكياً)
- **الموقع:** `models.py:230` `Index("ix_schedpost_status_sched", "status", "scheduled_at")` مقابل `alembic/002:73-77` `ix_schedpost_tenant_status_sched` على `(tenant_id, status, scheduled_at)` — والتعليق في 002 يدّعي «also defined in ScheduledPost.__table_args__» وهو غير دقيق (اسم مختلف).
- **التحليل:** على كل قاعدة تُبنى بالسلسلة يوجد **كلا** الفهرسين (تحققت آلياً) + ثالث بذات منطق النموذج أضافه SQL الإنتاج اليدوي (001_neon_verify.sql:21). الاستعلام الحي (`analytics.py:202-207` و`content_calendar.py`) يفلتر (tenant, status, scheduled_at) — يخدمه المتغير الثلاثي؛ الأحادي (status, scheduled_at) زائد بلا قيمة: تضخيم كتابة على جدول نشط.
- **الإصلاح:** حذف `ix_schedpost_status_sched` من النموذج (واحتفاظ بصيغة tenant) + ترحيلة إسقاط للأحادي، وتصحيح تعليق 002.

### M7 — مسح تسلسلي كل 60 ثانية + N+1 في مجدول التسريب؛ الجدول لا يُشذَّب
- **الموقع:** `sequence_engine.py:313-317` و`:325-330`.
- **المقتطف:**
  ```python
  select(SequenceSubscription).where(SequenceSubscription.status == "active")
  # ثم لكل اشتراك: select(SequenceStep).where(sequence_id == ...) — N+1
  ```
- **التحليل:** الفهرس الموجود `(tenant_id, status)` لا يخدم فلتر status-فقط (models.py:462) → مسح جدولي كامل كل 60 ثانية في وضع الخادم الواحد، مع استعلام خطوات لكل اشتراك. الصفوف completed/failed تبقى للأبد (لا شطف) → نمو مستمر للجدول الممسوح. (البث اليدوي/صفوف قليلة اليوم — تصنيف متوسط وقائي.)
- **الإصلاح:** فهرس `(status, entered_at)` أو join واحد مع steps، وشطف completed الأقدم من 90 يوماً في cron cleanup-logs.

### M8 — عائلة CRM: upsert بلا قيد/إعادة محاولة + فرز قائمة بلا فهرس مطابق
- **الموقع:** `bot_engine/pipeline.py:289-308` (auto-lead)، `routers/crm_routes.py:69-78`، و`crm_routes.py:40` `order_by(desc(Customer.last_contacted_at))` داخل فلتر tenant.
- **التحليل:** نفس نمط H1 على جدول customers (قيد مفقود في الإنتاج + `scalar_one_or_none`): التكرار يجعل كل تحديث CRM لاحق لذلك العميل يفشل داخل `except` → تحذير فقط → **سجل العميل يتجمد** (نفس عائلة R3 الموثقة في v14 لإنشاء الرد — هنا السبب طبقة بيانات). والفرز `(tenant, last_contacted_at)` بلا فهرس — الفهرسان الموجودان `(tenant, stage)` و`(stage, last_contacted_at)` لا يخدمان المسار الشائع (بلا stage).
- **الإصلاح:** يشمل H1 (قيد + retry)، وفهرس `(tenant_id, last_contacted_at)`.

---

## ج) المنخفضة (10)

### L1 — فخ فك-ترميز مزدوج كامن في APICache.cached عبر قيمة فارغة من Redis
`api_cache.py:81-83`: `cached = await _rcache_get(key); if cached is not None: return json.loads(cached)`. القيمة التي تكتبها `invalidate_on_write` هي `''` (سطر 119: `spawn(_rcache_set(k, '', 1))`) — `redis_cache.get` تفكّها إلى `''` (غير None) ثم `json.loads('')` يرفع **JSONDecodeError → 500**. المسار ميت اليوم (الديكوريتور بلا مستدعٍ) لكنه قنبلة عند أول تفعيل لـM3. الإصلاح: `delete(key)` بدل كتابة `''`، أو فحص falsy قبل إعادة فك الترميز.

### L2 — محدد المعدل DB: 4 رحلات + commit لكل طلب وعدّ غير ذري
`_rate_limit.py:14-36`: DELETE + INSERT + flush + commit + COUNT لكل فحص (كل طلب auth/دفع على Neon يفتح معاملة كتابة)، وطلبان متزامنان يجتازان الحد معاً (لا قفل/atomic increment). عملياً مقبول لسقوف الحجم الحالية. الإصلاح: `INSERT ... ON CONFLICT`/`UPDATE count=count+1 RETURNING` بمعاملة واحدة.

### L3 — NullPool لكل PostgreSQL حتى غير serverless
`database.py:14-15`: `if _IS_VERCEL or _is_pg: _pool_args = {"poolclass": NullPool}` — نشر self-hosted/uvicorn على PG (وضع المحاكاة بالمكدس الحقيقي إذا استُعمل PG) يدفع مصافحة TCP+TLS كاملة لكل طلب. المقايضة موثقة للـserverless لكنها تبتلع غير المستهدف. إصلاح: `NullPool` فقط عند `VERCEL` أو URL فيه `pgbouncer`/`pooler`.

### L4 — redis_cache: sentinel لا يُعاد أبداً + close() مهمل + بلا namespace
`redis_cache.py:45-46` (`_redis = False` للأبد — انقطاع لحظي عند إقلاع خادم واحد طويل العمر يعطّل الكاش لدورة العملية كلها رغم عودة Redis)؛ `:52` `await _redis.close()` مهملة في redis≥5 (المطلوب `aclose()`)؛ والمفاتيح بلا بادئة تطبيق (`smartbot:`) — مشاركة REDIS_URL مع تطبيق آخر تعني تصادم مفاتيح. كذلك `get_or_set` (سطر 89) بلا مستدعٍ — كود ميت.

### L5 — docstring مجدول التسريب يناقض الواقع
`sequence_engine.py:6-9`: «no scheduler dispatches sends. Kept for future use» بينما `app/startup.py:254-256` يشغّل `SequenceScheduler` فعلياً (وv14-E2 بُني عليه وكيل per-tenant). توثيق مضلل يخفي أن H2/H3 مسار حي.

### L6 — جدول ConversationNote ميت بالكامل
`models.py:588-597`: لا كاتب ولا قارئ في المستودع (grep شامل — يُذكر فقط في قائمة حذف المستأجر). جدول يُنشأ في كل قاعدة ولا يُستعمل. حذفه أو تنفيذ ميزة الملاحظات.

### L7 — feed الإشعارات يتجاهل user_id
`routers/notifications.py:49-53`: القائمة tenant-scoped فقط بينما `Notification.user_id` يميّز الموجه (None = بث). إشعار دفع/نظام موجه لمستخدم واحد يظهر لكل مستخدمي المستأجر. تمييز `user_id in (None, current_user.id)` يغلقها.

### L8 — حذف محادثة يترك وسومها (ConversationLabel) يتيمة
`routers/inbox.py:245-248`: يمسح الرسائل والمحادثة فقط؛ `ConversationLabel` المرتبطة بـconversation_id (string) تبقى. نفس نمط flows/tag النظيف موجود في نفس الملف (سطر 310) — سهل الإغلاق.

### L9 — عدّاد الاستخدام: `except Exception: pass` يبتلع الفشل + سباق إدراج بلا قيد على legacy
`bot_engine/engine.py:150-167`: تحديث/إنشاء UsageCounter داخل try/except-pass — فشل الكتابة يمر بصمت (فرض حدود الخطة يتحلل تدريجياً)، وعلى الإنتاج القديم (لا uq_usage_tenant_metric_period) قد ينشأ صفّان للفترة نفسها فيقرأ limit(1) أحدهما اعتباطياً (عدم فرض سليم). القارئ آمن من MultipleResultsFound لأنه `order_by ... limit(1)`.

### L10 — حذف قاعدة رد يترك replies.rule_id / messages.rule_id يشيران لمحذوف
`routers/rules.py:105-113`: بلا FK ولا تنظيف — إحصاءات per-rule (analytics_engine) تفقد اسم القاعدة بعد الحذف. أثر إحصائي فقط؛ إصلاح: `SET NULL` دفعة واحدة قبل الحذف (نفس أسلوب M4).

---

## د) معلوماتية / عابرة (لا تُعد إيجادات مطلوبة الإصلاح)

1. **سلسلة alembic غير حتمية تاريخياً:** 001/007/008 تستدعي `create_all`/`reconcile_schema` وتستورد models الحية — ترحيلة تعتمد على كود اليوم لا 2026-09. تعمل (الحارسات idempotent) لكنه anti-pattern alembic معروف؛ أي تدقيق مستقبلي «schema as of revision X» غير ممكن.
2. **downgrades:** كلها موجودة؛ 001/007 عمداً no-op (خسارة بيانات) و012/013 guarded — سليمة.
3. **dedup 013 لـbot_state** يبقي `MAX(id)` — لو وُلد التكرار من سباق قرض (صف أصلي برصيد متراكم + صف سباق برصيد السباق) فقد يُحتفظ بأصغرهما؛ مقايضة v14 الموثقة، تسجل للملاحظة لا كإيجاد.
4. **وضعان للنشر متنافسان سلوكياً:** على Vercel لا يعمل لا مجدول تسريب ولا تقويم ولا حلقة البوت (crons فقط cleanup+heartbeat — vercel.json:93-102) — أي خلل محركي يظهر فقط في وضع الخادم الواحد/المحاكاة (وهو ما جعل H2/H3 غير مرئية في بطارية v14 Production). انظر dec-e2e-stack.
5. **env.py مرآة يدوية لـdatabase.py** (مُختبَر بـtest_env_py_engine_mirrors_database_py ✓) — يبقى ازدواج مصدر يجب مزامنته يدوياً عند أي تغيير pool/SSL.
6. **الاتصال:** SSL تحقق كامل + `statement_cache_size=0` (pgbouncer) + timeout اتصال 15s — سليم؛ لا `command_timeout` للاستعلامات (استعلام معلق يستهلك maxDuration 30s في Vercel).
7. **`rate_limit_entries` window_end بلا فهرس** — التنظيف اليومي cron يمسح تسلسلياً؛ الجدول محدود الحجم بطبيعته.
8. **register يمنع نفس username عبر المستأجرين** (سياسة/تسجيل دخول عالمي بالاسم) بينما القيد per-tenant — مصمم على الأرجح؛ يذكر لسياق M1.
9. **`BotState` بلا عمود زمني** — «الأحدث» في كل dedup = MAX(id) حصراً (موثق في 012/013)؛ عمود updated_at مستقبلي يسهّل any dedup/مزامنة.
10. **`tenant_configs` جدول يدوي** (002_saas_migration.sql:81-89) ليس في models.py — يشطح بلا نموذج (بقايا Sprint-3 مذكورة في models.py:125).

---

## هـ) ما تحقق سليماً (للسجل — لا إبلاغ)
- **المطابقة الثلاثية لترحيلة 013:** `uq_botstate_tenant_key` + `uq_botstate_key_value` + فهارس botlog/rules/messages/comments الساخنة: موجودة ومتطابقة في models/السلسلة/reconcile (تحقق آلي + قراءة).
- **ترتيب حذف المستأجر آمن مع FK:** `Conversation` قبل `Message` في قائمة admin_routes:370-379 لا يسبب انتهاكاً لأن FK رسائل المحادثات `ON DELETE CASCADE` (تحقق ميكانيكي بـFK-ON) — والراوترات تحذف الأبناء صراحة في flows/inbox/tags فتغطي غياب FK في الإنتاج.
- **المعاملات الحرجة ذرّية:** حسم الدفعات HTTP (approvals.py:103-151) وTelegram (app/telegram.py:88-155) — UPDATE-claim ذري + commit واحد يغطي الدفعة/الخطة/المستخدم/الإشعار؛ قرض المحفظة atomic (credit_wallet) داخل معاملة المستدعي ✓؛ التسجيل tenant+user+audit بcommit واحد ✓؛ push_notification لا تفتح commit (المستدعي يملكه) ✓.
- **تغطية حذف المستأجر كاملة الجداول** (39 جدولاً + ردود التذاكر بـsubquery + users + tenant — v12-E2.6) — راجعتها جدولاً جدولاً مقابل النموذج: لا نواقص.
- **فهارس القوائم الساخنة الرئيسية** موجودة ومربوطة براوتراتها: notifications (tenant,created)/(tenant,read)؛ inbox (tenant,last_message_at) + (conversation,created)؛ audience (tenant,last_interaction)/(tenant,platform,status)؛ comments/replies (tenant,created)؛ admin payments (tenant,status,created)؛ usage uq؛ blacklisted jti-unique (يُقرأ بكل طلب مصادقة)؛ bot_logs widgets (013).

## و) التوصية التنفيذية لـE-round
1. **E-DATA-1 (عالية):** ترحيلة 014 «unique-constraints backfill» لقيود H1 (سبعة قيود/ستة جداول، نمط 013: dedup→unique index) + توسيع `_INDEX_HEAL` + إعادة كتابة upsert الجمهور/CRM بـbegin_nested+retry — يغلق H1/M8/M1-جزئياً.
2. **E-DATA-2 (عالية):** إصلاح sequence_engine (tenant_id عند subscribe، حذف صريح عند delete، حذف docstring المضلل + كود get_or_create الميت) — يغلق H2/H3/L5.
3. **E-DATA-3 (متوسطة):** reconcile بserver_default + تنظيف الأعمدة/الفهارس الميتة (M2/M5/M6) + فهرس CRM/M7.
4. **E-DATA-4 (متوسطة):** إبطال كاش Redis حقيقي في clear_all + DELETE بدل '' (M3/L1) + حذف تابع للمستخدم (M4).
