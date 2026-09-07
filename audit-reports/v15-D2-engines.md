# v15-D2 — تدقيق عميق للمحركات (~9,300 سطر)

**الوكيل:** D2 (المحركات) · **الجولة:** v15 · **الأساس:** main @ 558623b3 (v14 مكتملة)
**النطاق:** `fb_dashboard/`: bot_engine/ (كل الملفات)، facebook_engine/ (كل الملفات)، subscriber_engine، broadcast_engine، sequence_engine، flow_engine، offer_engine، commerce_engine، team_engine، context_engine، analytics_engine، publisher_engine، pdf_reports_engine، content_calendar، agent_brain، agent_engine، agent_memory، agent_tools، enhanced_intent، messenger_service، bot، fb_client — قراءة سطراً بسطر، مع تتبّع المتصلين في `routers/` و`app/` و`_services.py` للتحقق من قابلية الوصول.

**استُبعد عمداً:** كل ما أُغلق في v14 وتحققتُ من بقائه مغلقاً — Publisher per-request (C-ENG1)، CalendarScheduler اعتماد per-tenant + سقف محاولات (C-ENG2)، عزل مستأجر subscriber_engine (E2)، WeasyPrint خارج حلقة الأحداث (D6 #7)، بروكسي SequenceScheduler/FlowEngine per-tenant في `_services.py`، عدّادات `subscriber_engine.get_detail` المقيّدة بالمستأجر.

---

## 1) الملخص التنفيذي

المحركات في حالة جيدة بنيوياً بعد v14: لا singletons عابرة للمستأجرين ناشطة، لا SQL نصي (كل الاستعلامات SQLAlchemy parameterized)، لا `requests` متزامن داخل async، وWeasyPrint والملف JSON مقروءان عبر `to_thread`. الإيجادات الحقيقية هذه الجولة من عائلتين:

1. **منطق الأعمال والفوترة**: حدود الخطة (max_replies) ومزاياها المدفوعة (has_dm/has_broadcast/has_ai) غير مفروضة في أي مسار محرك رغم أن تعليقات الكود تدّعي ذلك؛ مسار تعليقات webhook بلا بوابة اشتراك ولا عدّاد استخدام؛ أداة نشر الوكيل تعمل بعميل المنصة لا عميل المستأجر.
2. **مسارات صامتة/كاذبة**: بذر قوالب DM لا-op بسبب عدم تطابق مفاتيح (name مقابل id)، فحص نية intent-first وقاموس dm_map مبنيان على أسماء قواعد لا توجد في DB، أدوات وكيل تعيد «تم بنجاح ✅» دون تنفيذ، وإعادة محاولة لا تفرّق أخطاء 4xx الدائمة عن العابرة.

كما وُجد **SSRF حقيقي قابل للوصول** في flow_engine (فعل webhook بلا حارس) عبر POST /api/flows + /test ل أي editor — الحارس موجود في الكود (v10-A8/v12 E1.3) لكنه لم يُطبَّق هنا.

**الأعداد:** حرج **0** · عالي **4** · متوسط **11** · منخفض **13** — الإجمالي **28** إيجاداً.

---

## 2) الجدول المرتّب (بذات ترتيب الشدة)

| # | الشدة | الملف:السطر | الإيجاد المختصر |
|---|---|---|---|
| H1 | عالي | bot_engine/engine.py:95-97 · pipeline.py:199 · broadcast_engine.py:188 | حدود ومزايا الخطة غير مفروضة إطلاقاً في مسارات الرد/DM/البث — والتعليق يدّعي أنها مفروضة «elsewhere» |
| H2 | عالي | flow_engine.py:529 (via routers/flows.py:110-127) | SSRF: فعل webhook يرسل بيانات المشتركين إلى URL تعسفي بلا حارس (مفتوح لأي editor عبر إنشاء تدفق + test) |
| H3 | عالي | app/webhooks.py:211-214 → bot_engine/engine.py:237-254 | مسار تعليقات webhook بلا بوابة اشتراك (§5.18) وبلا عدّاد replies_used — مستأجرون منتهون يردّون بلا حدود وبلا محاسبة |
| H4 | عالي | agent_engine.py:57-63, 202-210 | publish_post/reply_to_comment للوكيل عبر عميل المنصة (env) لا عميل المستأجر: نشر بحساب خاطئ أو مسار ميت في الإنتاج متعدد المستأجرين |
| M1 | متوسط | app/startup.py:76 + bot_engine/matching.py:127-135 + engine.py:547-552 | بذر قوالب DM لا-op (JSON بلا مفتاح name) + intent-first وdm_map يعتمدان أسماء قواعد (slugs) لا تنشأ في DB أبداً |
| M2 | متوسط | fb_client.py:181-183, 239-253 + pipeline.py:167-183 + engine.py:425-431 | إعادة المحاولة تعامل 4xx الدائمة (توكن/نافذة 24h) كعابرة — 3 محاولات + سبات لكل فشل دائم |
| M3 | متوسط | bot_engine/engine.py:230-233 + cache_layer.py:84-87 + pipeline.py:195-263 | N+1: استعلام ردود 48h + `dedup.load()` يستبدل المجموعة لكل تعليق — ومحو علامات لم تُلتزم بعد (نافذة سباق إرسال مزدوج) |
| M4 | متوسط | broadcast_engine.py:188-196, 387-398 | send_broadcast بلا معامل tenant في المحرك (العزل على عاتق المتصلين فقط) + cancel أثناء sending لا يوقف الإرسال الجاري |
| M5 | متوسط | subscriber_engine.py:200-205 | مطابقة ردود المشترك بالاسم (commenter_name) لا بالمعرف — تصادم أسماء داخل المستأجر يخلط السجلات |
| M6 | متوسط | team_engine.py:36-48, 171-175 | إسناد نشاط بالسلاسل الفرعية «User {name}» بلا break — بادئة الاسم تُحسب لمستخدمين؛ contains() LIKE بلا autoescape |
| M7 | متوسط | fb_client.py:115-122 | تنزيل صورة النشر بلا سقف حجم — OOM/DoS ذاكرة من مستخدم مصرّح (بعد اجتياز حارس SSRF) |
| M8 | متوسط | facebook_engine/mcp_server.py:43-48, 127-128 | GraphClient جديد لكل استدعاء أداة بلا aclose (تسريب اتصالات)؛ publish_post lambda يستدعي asyncio.run داخل حلقة قائمة؛ --access-token في argv يظهر في ps |
| M9 | متوسط | agent_engine.py:273-283 | أدوات «system»/«analyze_comment»/«enhance_content» تعيد success ✅ دون تنفيذ أي شيء (نجاح كاذب) |
| M10 | متوسط | bot_engine/cooldown.py:16-17 + offer_engine.py:23-29 | نمو ذاكرة بلا تقليم (cooldown store/user_windows، offer _delivered) + فقدان حالة العروض عند إعادة التشغيل |
| M11 | متوسط | bot_engine/engine.py:563-565 | _add_log يكتب BotLog بلا tenant_id — سجلات أخطاء دورة المستأجر تُنسب للمستأجر 0 |
| L1 | منخفض | flow_engine.py:372-399, 410-414 | DELAY ≤60s ينام داخل الطلب عبر /test؛ عقدة SEQUENCE بين تدفقين بلا كشف دورة (RecursionError) |
| L2 | منخفض | facebook_engine/tools.py:161-166, 195-196 | JSON يدوياً بـ f-string في send_dm_to_user (اقتباس يفسد الحمولة)؛ get_campaigns قد يبني act_act_ |
| L3 | منخفض | facebook_engine/client.py:73-81 | «احترام rate-limit» لا-op فعلياً: تحليل x-business-use-case-usage/Retry-After يفشل بصمت دوماً |
| L4 | منخفض | publisher_engine.py:151-157 | get_status يدّعي facebook/instagram configured=true دائماً (معلومات مضللة للواجهة) |
| L5 | منخفض | publisher_engine.py:37, 82 | XPublisher/LinkedIn: عميل httpx جديد لكل نشر، بلا retry (نشر أحادي الفرصة) |
| L6 | منخفض | analytics_engine.py:33-37 مقابل _services.py:377-381 | دلالات «previous=0» متناقضة بين اللوحات (0% مقابل +100%) |
| L7 | منخفض | offer_engine.py:40-47, 60-62 | get_best_offer: except صامت → None + offers[0] بلا ORDER BY (اختيار غير حتمي) |
| L8 | منخفض | sequence_engine.py:306-317, 374-430 | المحرك الخام يظل عابراً للمستأجرين وبلا سقف محاولات (مغلَّف بالبروكسي v14 — كامن فقط لو استُخدم مباشرة) |
| L9 | منخفض | agent_brain.py:134-153 | fallback هيوريستي يعيد publish_post لأي نص يحوي «post/نشر» عند غياب LLM — نشر تلقائي غير مقصود (محجوز للمسؤول) |
| L10 | منخفض | bot_engine/engine.py:288-289 | بوابة الاشتراك fail-open عند فشل DB (خيار موثق — يُذكر للاطلاع لا للمخالفة) |
| L11 | منخفض | analytics_engine.py:204-207 | تعيين بدل التراكم في sentiment trend — سليم اليوم بفضل GROUP BY لكنه هش لأي تغيير تجميع |
| L12 | منخفض | matching.py:98-116 + enhanced_intent.py:33-47 | _precompute يطفّر مفاتيح في كائنات قواعد مشتركة من RuleCache؛ _LIBYAN_DIALECT مجموعة ميتة |
| L13 | منخفض | agent_engine.py:69-70, 168-170 | _history في singleton الوكيل حالة عابرة للمستأجرين (ردود مستأجر داخل كائن مشترك) — غير مقروء حالياً فلا تسريب فعلي |

---

## 3) التفاصيل

### H1 — حدود ومزايا الخطة غير مفروضة في أي مسار محرك (الفوترة ديكورية في مسار الرد)

- **المواقع:**
  - `bot_engine/engine.py:95-97` — التعليق: *"The engine KEEPS running (basic auto-replies stay) — paid features are gated elsewhere (has_ai/has_broadcast flags)"*
  - `bot_engine/pipeline.py:199-226` — المرحلة 8b ترسل DM (private reply/MESSAGE_TAG/RESPONSE) لأي قاعدة فيها dm_template — **بلا أي فحص `has_dm`**
  - `broadcast_engine.py:188-385` — `send_broadcast` كامل المسار **بلا فحص `has_broadcast`**
- **التحقق:** grep على كل `fb_dashboard/` و`routers/`: `max_replies` لا يُقرأ إلا في `plans_config.py:39` (عرض)، و`has_dm/has_broadcast/has_ai` تُقرأ فقط في العرض والبذر (`startup.py`). لا يوجد أي نقطة فرض.
- **الأثر:** خطة Free (100 رد/شهر، بلا DM/بث/AI) تحصل فعلياً على ردود غير محدودة + DM + بث جماعي — قيمة مدفوعة تُقدَّم مجاناً؛ والتعليق في الكود ادّعاء كاذب يمنع اكتشاف الفجوة (عائلة «الإخفاق الصامت/قيمة افتراضية تخفي الخطأ»).
- **الإصلاح المقترح:** (1) نقطة فرض مركزية `get_plan_limits(tenant_id)` تُقرأ في: `pipeline` قبل المرحلة 8b (has_dm)، `send_broadcast` قبل الترحيل (has_broadcast)، وفي `cycle`/`process_single_message`/`process_single_comment` قبل الإرسال (replies_used ≥ max_replies → تخطٍّ + BotLog عربي صريح)؛ (2) تصحيح التعليق الكاذب؛ (3) اختبارات سالبة: مستأجر Free يُرفض له DM/بث ويتوقف عند السقف.

### H2 — SSRF + تسريب PII في فعل webhook للتدففات (قابل للوصول من editor)

- **الموقع:** `flow_engine.py:513-535`:
  ```python
  async with httpx.AsyncClient(timeout=timeout) as client:
      ...
      r = await client.post(value, json=payload)   # value = URL من عقدة JSON يتحكم بها المستخدم
      r.raise_for_status()
  ```
  الحمولة تتضمن `from_id, from_name, text, intent, platform, metadata` — بيانات مشتركين.
- **الوصول:** `routers/flows.py:33-46` (create_flow يقبل nodes/edges خام بلا تحقق) ثم `routers/flows.py:110-127` (test_flow ينفّذ عبر `_services.flow_engine.execute`). أي editor ينشئ تدفقاً فيه عقدة `{"type":"ACTION","data":{"actionType":"webhook","value":"http://169.254.169.254/..."}}` ويستدعي test — الخادم يفتح POST داخلياً.
- **الأثر:** استكشاف الشبكة الداخلية/ metadata السحابية + قناة تسريب بيانات خارجية — نفس ثغرة v12 E1.3 التي أُغلق نظيرها لصور النشر (`_assert_safe_image_url`) لكنها لم تُطبَّق هنا.
- **الإصلاح المقترح:** تطبيق نفس الحارس (نسخة عامة `_assert_safe_url` لـ https-only/لا loopback/private/link-local) على `value` قبل POST + قائمة نطاقات مسموحة (allowlist) قابلة للضبط، ورفض redirects (`follow_redirects=False` — وهو الافتراضي، يوثَّق صراحة)، واختبار سالب مع URL داخلي. كذلك تحقق هيكلي للعقد في create/update_flow.

### H3 — مسار تعليقات webhook بلا بوابة اشتراك وبلا عدّاد

- **المواقع:**
  - `app/webhooks.py:211-214`: `engine.process_single_comment(comment, post_id)` مباشرة بعد حل المستأجر.
  - `bot_engine/engine.py:237-254`: `process_single_comment` → `_process_comment` → pipeline — **لا يستدعي `_subscription_active()`** (خلافاً لـ `process_single_message:361`) ولا يكتب UsageCounter.
  - الكتابة الوحيدة للعدّاد: `cycle` (engine.py:150-165) و`process_single_message` (engine.py:465-484).
- **الأثر:** (أ) مستأجر UNPAID/REJECTED منتهٍ يستمر بردوده على التعليقات عبر webhook بلا حدود (بوابة §5.18 غير متماثلة بين القناتين)؛ (ب) ردود تعليقات webhook لا تُحسب في `replies_used` — الفوترة تحت-العد، ويجعل حتى فرضاً مستقبلياً لـ H1 عاجزاً عن رؤية هذه الردود.
- **الإصلاح المقترح:** نداء `await self._subscription_active()` في بداية `process_single_comment`، وزيادة العداد في `pipeline.process` بعد نجاح الإرسال (نفس نمط cycle) — أو نقطة عدّ موحدة بعد الإرسال في pipeline تخدم المسارين.

### H4 — وكيل AI ينشر بعميل المنصة لا عميل المستأجر

- **المواقع:** `agent_engine.py:57-63` (`_get_fb()` يبني FBClient من `settings.FACEBOOK_ACCESS_TOKEN/FACEBOOK_PAGE_ID` ويكاشنه للأبد) و`agent_engine.py:202-210` (publish_post يستخدمه).
- **الأثر (حالتان):**
  1. إنتاج متعدد المستأجرين: المتغيران فارغان (توثيق `has_global_fb_credentials` في `_services.py:30-42`) → كل أوامر «انشر بوست…» عبر الوكيل تفشل بصمت — **مسار ميت** + استدعاءات Graph ضائعة.
  2. نشر أحادي المستأجر/legacy بوجود توكن المنصة: أي admin مستأجر ينشر عبر الوكيل على صفحة **المنصة** لا صفحته — نفس عائلة «نشر بحساب خاطئ» (C-ENG1) في مسار لم يُغلق.
- **الإصلاح المقترح:** استخدام `get_tenant_fb_client(tenant_id)` في `_execute` (متوفر أصلاً في الوحدة) مع رسالة عربية صريحة عند غياب اتصال المستأجر؛ إبطالة كاش `_fb_client` عند تدوير التوكن.

### M1 — عائلة «نية أولاً + قوالب DM» مسارات ميتة بسبب عدم تطابق المفاتيح

- `app/startup.py:76`: `{r.get("name", ""): r.get("dm_template", "") ...}` — قواعد `facebook_automation.json` **لا تحوي name إطلاقاً** (مفاتيحها: id/description/dm_template/keywords/priority/reply؛ تحققت آلياً: 20 قاعدة، أولها id="frustrated_complaint") → القاموس ينكمش إلى `{"": ...}` و`_seed_dm_templates` (startup.py:221) لا يبذر شيئاً أبداً — **لا-op صامت** بلا اختبار.
- `bot_engine/matching.py:127-135` (Phase-1) و`matching.py:134/147/161` (`self._dm_map.get(rule.get("name"))`): يتوقعان قواعد DB مسماة بالـ slugs ("frustrated_complaint"…) — لا يوجد أي بذر أو مسار ينشئ قواعد بهذه الأسماء (المستخدمون ينشئون أسماءهم). `engine.py:547-552` يبني dm_map بمفاتيح **id** الـJSON ثم البحث في matching يجري بالاسم — الاثنان لا يتطابقان عملياً.
- **الأثر:** مزايا معلنة (قوالب DM الجاهزة، المطابقة بحسب النية) لا تعمل في الإنتاج دون أي خطأ ظاهر.
- **الإصلاح:** توحيد المفتاح (id-slug) في البذر والبحث، تصحيح `r.get("id")` في startup، واختبار تكاملي يثبت أن قاعدة seeded تحصل على dm_template وأن Phase-1 يضرب قاعدة intent.

### M2 — إعادة المحاولة تعامل الأخطاء الدائمة كعابرة

- `fb_client.py:181-183` (`reply_to_comment` يردّ None عند `_error`) و`fb_client.py:239-253` (`send_dm` كذلك) — المستهلكون يميزون الفشل فقط كـ None:
  - `pipeline.py:167-183`: 3 محاولات بسبات 1/2/4s لأخطاء 4xx دائمة (توكن منتهٍ، لا صلاحية، تعليق محذوف).
  - `engine.py:425-431`: كذلك لرسائل الماسنجر — وخطأ «نافذة 24h» (code 10) الدائم يُعاد محاولته 3 مرات (~4s سبات) قبل أن يميّزه السجل (§5.17 يميّز في الرسالة لا في السلوك).
- **الإصلاح:** إرجاع بنية تحمل status/code من `_post`، والقفز الفوري عند 4xx غير قابل لإعادة المحاولة (عدا 429)، مع الاحتفاظ بالتمييز العربي للنافذة 24h.

### M3 — N+1 لكل تعليق + سباق استبدال مجموعة dedup

- `engine.py:230-233`: لكل تعليق: `_load_replied_ids(session)` (استعلام كل ردود 48h) + `await self._dedup_engine.load(replied_ids)` — و`cache_layer.py:84-87` `load` **يستبدل** `_seen` ويعيد ضبط `_loaded_at`.
- الأثر: (أ) أداء — دورة 10 منشورات × 50 تعليق = 500 استعلام كامل الجدول زمنياً؛ (ب) تصحيح — `pipeline.py:195` يعلّم dedup **قبل** commit (خطوة 9 لاحقاً في 263)، فأي `load()` متزامن من تعليق آخر يمحو العلامة غير الملتزمة → إرسال مزدوج محتمل لنفس التعليق عند تزامن webhook+cycle.
- **الإصلاح:** تحميل replied_ids مرة واحدة في بداية الدورة/الطلب، والتحويل إلى `update |= ids` في load أو الاعتماد على قيد DB وحده للسباق.

### M4 — broadcast: عزل يعتمد على المتصل + إلغاء تجميلي

- `broadcast_engine.py:188-196`: `send_broadcast` لا يستقبل tenant_id أصلاً (كل الإخوات get/update/cancel يستقبلنه) — العزل صحيح اليوم لأن `routers/broadcasts.py:86-98` و`marketing.py:194-195` يملكان الفحص، لكن أي متصل جديد ينسى الفلترة يفتح IDOR إرسال فوري (عمق دفاع غائب).
- `broadcast_engine.py:387-398`: `cancel_broadcast` يغيّر status إلى cancelled لكن حلقة الإرسال الجارية (`359-376`) لا تفحص الحالة بين الدفعات — الإلغاء أثناء sending لا يوقف شيئاً.
- **الإصلاح:** إضافة tenant_id إلى توقيع send_broadcast + فحص status داخل حلقة الدفعات.

### M5 — مطابقة ردود المشترك بالاسم

- `subscriber_engine.py:200-205`: `Reply.commenter_name == sub.name` — v14 قيّدت بالمستأجر (أُغلق التسريب العابر)، لكن داخل المستأجر الواحد: اسمان متطابقان (شائع عربياً) يتبادلان الردود، وsub.name فارغ يطابق كل ردود الاسم الفارغ. النموذج `Reply` لا يخزّن commenter_id (pipeline.py:230-238).
- **الإصلاح:** إضافة `commenter_id` إلى Reply في pipeline وإعادة المطابقة به (ترحيلة + تعبئة رجعية).

### M6 — إسناد نشاط الفريق بالسلاسل الفرعية

- `team_engine.py:45-48` (get_team_members، بلا break): رسالة "User admin2 replied" تحتوي "User admin" → تُحسب **للاثنين**. في `get_team_performance:171-175` يوجد break لكن بترتيب users فيظل البادئ يمتص.
- `team_engine.py:41/55`: `BotLog.message.contains(f"User {name}")` — SQLAlchemy لا يهرب %/_ إلا بـ `autoescape=True`؛ اسم مستخدم فيه wildcard يشوّه العدّ.
- **الإصلاح:** مطابقة بحدود كلمة (regex مس escaped) أو — الأفضل — عمود `user_id` في BotLog (ملاحظة ponytail الموجودة في الكود تطلب ذلك أصلاً).

### M7 — تنزيل صورة النشر بلا سقف حجم

- `fb_client.py:115-122`: `resp = await client.get(image_url)` ثم `resp.content` كاملاً في الملفات المرسلة إلى Graph — بلا فحص Content-Length ولا بث جزئي؛ المهلة 15s فقط تحدّ الزمن لا الحجم. مصدر URL = مستخدم مصرّح (ناشر/جدولة/وكيل) بعد اجتياز حارس SSRF.
- **الإصلاح:** سقف حجم (مثلاً 10MB) بالتحقق من Content-Length وقراءة متدفقة مع قطع عند التجاوز + رسالة عربية.

### M8 — خادم MCP المستقل: تسريب اتصالات + أداة منهارة + توكن في argv

- `mcp_server.py:43-44`: كل استدعاء أداة ينشئ `GraphClient` (وhttpx.AsyncClient داخله في `__init__`) ولا يُغلق أبداً — تسريب مقابس تراكمي لكل استدعاء.
- `mcp_server.py:47-48`: أداة publish_post مسجلة كـ sync lambda تستدعي `asyncio.run(...)` — عند تشغيلها داخل حلقة FastMCP القائمة تنهار بـ RuntimeError («cannot be called from a running event loop»).
- `mcp_server.py:127`: `--access-token` كمُعامل CLI → ظاهر في `ps aux` لكل مستخدم على المضيف (الافتراضي env موجود لكن CLI يتجاوزه).
- **الإصلاح:** async tool موحّد + `aclose()` في finally (أو AsyncExitStack) + إسقاط معامل CLI للتوكن.

### M9 — أدوات الوكيل ذات «النجاح الكاذب»

- `agent_engine.py:273-275`: `system` → يردّ `{"success": True, ... "تم تعديل الإعدادات ✅"}` دون لمس أي إعداد (والأداة مصنّفة IRREVERSIBLE!).
- `agent_engine.py:277-283`: `analyze_comment` يعيد النص الخام كـ analysis؛ `enhance_content` يعيد النص كـ enhanced — بلا أي معالجة، مع «تم التحليل/التحسين ✅».
- **الأثر:** المستخدم/الـ LLM يصدّقان أن شيئاً حدث — عائلة «قيمة افتراضية تخفي الخطأ» بعكس اتجاهها (نجاح بلا عمل).
- **الإصلاح:** إما تنفيذ حقيقي (analyze_comment → EnhancedIntentClassifier، enhance_content → ai_service) أو ردّ صريح «الأداة غير مفعّلة».

### M10 — نمو ذاكرة بلا تقليم + فقدان حالة العروض

- `bot_engine/cooldown.py:16-17`: `_store`/`_user_windows` يكبران للأبد لكل معلّق فريد (لكل مستأجر) — حلقة الخلفية تعمل للأبد على غير-Vercel.
- `offer_engine.py:23-29`: `_delivered` نفس المشكلة + **عدم الاستمرارية**: إعادة تشغيل تمحو «من استلم عرضاً» → نفس العرض يعاد إرساله لنفس المستخدم بعد كل نشر جديد.
- **الإصلاح:** تقليم دوري بحسب last_seen (كما ContextEngine) + تسليم العروض في جدول (BotState أو جدول مخصص) بدل الذاكرة.

### M11 — سجلات BotLog بلا مستأجر

- `engine.py:563-565`: `session.add(BotLog(level=level, message=message))` — `tenant_id` يسقط للافتراضي 0 (models.py:71) → أخطاء دورة المستأجر N تظهر في فضاء المستأجر 0 و**تختفي** عن `/api/logs` المقيّد بمستأجره — فقد رصدية بالضبط حيث تُحتاج (§honest telemetry).
- **الإصلاح**: `BotLog(tenant_id=self._tenant_id, ...)` + اختبار.

### المنخفضة (مقتضبة)

- **L1** `flow_engine.py:391` — `await asyncio.sleep(total_sec)` حتى 60s داخل تنفيذ الطلب (عبر /test يعلّق الطلب)؛ وSEQUENCE (`410-414`) بلا كشف دورة بين التدفقات → RecursionError محتمل. **الإصلاح:** جدولة بدل النوم + مجموعة visited لمعرفات التدفقات.
- **L2** `facebook_engine/tools.py:161-166` — `f'{{"id":"{user_id}"}}'`/`f'{{"text":"{message}"}}'` JSON يدوي: اقتباس داخل message يفسد الحمولة (استخدم json.dumps كـ fb_client.py:242-246)؛ و`get_campaigns:196` قد يبني `act_act_` (fb_client يعالجها، tools لا).
- **L3** `facebook_engine/client.py:73-81` — تحليل `x-business-use-case-usage` (JSON بمفاتيح act_ وليس call_count في الجذر) و`Retry-After` (ثوانٍ لا JSON) يفشلان دوماً في `except: pass` — «احترام حدود المعدل» فعلياً backoff ثابت فقط.
- **L4** `publisher_engine.py:153-154` — facebook/instagram configured=true دوماً بغضّ النظر عن الاتصال الفعلي — لوحة إعدادات كاذبة.
- **L5** `publisher_engine.py:37/82` — عميل httpx جديد لكل نشر، بلا retry — فشل عابر = منشور مفقود بصمت (send بإرجاع None).
- **L6** `analytics_engine.py:33-37` (0 عند previous=0) مقابل `_services.py:377-381` (100) — لوحتان تظهران اتجاهين متناقضين لنفس الحالة.
- **L7** `offer_engine.py:46-47, 60-62` — `except Exception: return None` يخفي أخطاء DB كاملة؛ `offers[0]` بلا ORDER BY → عرض «الأفضل» غير حتمي (الأول عشوائياً من الجدول).
- **L8** `sequence_engine.py` الخام يظل بلا سقف محاولات وبـ fb مشترك — اليوم مغلف بالكامل بـ`_TenantSequenceEngineProxy` (v14) فالخطر كامن لو استدعاه أحدهم مباشرة؛ يُنصح بنقل السقف داخل المحرك نفسه.
- **L9** `agent_brain.py:134-153` — الفallback الهيوريستي عند غياب LLM يحوّل أي نص فيه «post/نشر/بوست» إلى action=publish_post بثقة 0.8 وauto_exec — أدمن يكتب «حسّن نص البوست هذا» ينشر فعلياً. يُقترح action=unknown من الفallback للنشر.
- **L10** `engine.py:288-289` — fail-open موثق لبوابة الاشتراك عند فشل DB (خيار «لا نفقد الردود») — يُترك مع توثيق مخاطره في قرارات.
- **L11** `analytics_engine.py:204-207` — التعيين بدل التراكم سليم حالياً بسبب GROUP BY (d,sentiment) لكنه غير محصّن ضد تغيير تجميع مستقبلي.
- **L12** `matching.py:98-116` يضيف `_normalized_kw` إلى كائنات قواعد RuleCache المشتركة (تطفير حالة مشتركة — سليم اليوم ضمن مستأجر واحد)؛ `enhanced_intent.py:33-47` `_LIBYAN_DIALECT` مجموعة ميتة غير مستخدمة.
- **L13** `agent_engine.py:69-70/168-170` — singleton `get_agent()` يحمل `_history` مختلط المستأجرين (ردود نصية لأي مستأجر)؛ غير مقروء في أي مسار حالياً → لا تسريب فعلي، لكنه النمط الذي صيدته v14 — يُحذف أو يُقيّد.

---

## 4) ما تحقق من صحّته وسلامته (لأغراض التتبع)

- لا singletons ناشطة عابرة للمستأجرين في المحركات: `deps.py` registries per-tenant، `get_bot_engine` per-tenant بتبديل آمن للعميل، publisher per-request، FBClient._fan_count_cache مقيّد بمفتاح page_id.
- كل الاستعلامات SQLAlchemy parameters (لا SQL نصي من مدخلات)؛ لا أوامر نظام؛ لا `requests` متزامن؛ `open()/json.load` عبر `to_thread` (engine.py:556، startup.py:82)؛ WeasyPrint عبر `to_thread` (`_render_async`).
- كاشات حساسة للسرّية موصولة بالتشفير: publisher save/load (Fernet + fallback موثق)، BotState fb_access_token عبر decrypt.
- pdf_reports: escaping شامل + حارس SSRF للشعار + hex validation — نظيف (خطأ `int(campaign_id)` المحتمل محروس في المتصل reports_routes.py:68).
- messenger_service: dedup بمعرّف mid مستقر (sha256 للـ postback) + بوابة إعادة التشغيل `_is_recent` + تخطي الرد عند عدم التخزين — سليم.
- commerce_engine: HMAC بـ compare_digest + clamp للحدود — سليم (deprecated).
- retry caps موجودة في: fb_client._post (3)، GraphClient (3+backoff)، agent_brain (tenacity 3)، CalendarScheduler (3)، SequenceProxy (3).

## 5) ملاحظات عابرة للنطاقات (للمنسّق)

1. **routers/flows.py (D1/D5):** create/update_flow يقبلان nodes/edges خام بلا أي تحقق هيكلي — هذا ما يجعل H2 قابلاً للوصول؛ الإصلاح الأفضل مشترك (تحقق في الراوتر + حارس في المحرك).
2. **models.py / ترحيلات (D3):** H1 يحتاج قراءة حدود الخطة بفاعلية؛ M5 يحتاج عمود commenter_id في Reply (ترحيلة)؛ M6 يتحسن جذرياً بعمود user_id في BotLog.
3. **app/startup.py (D1):** بذر DM لا-op (M1) يعيش في startup — مسؤولية بين D1/D2.
4. **الفواتير/المال (E-المسار):** H1+H3 يقعان في مسار القيمة المُفوتر — يُقترح أن ي接管ها وكيل التنفيذ المالي بعد D8 إن رأى تضخيماً للشدة.
5. **الاختبارات (D9):** لا اختبار لأي من: فرض الحدود، بذر DM، بوابة تعليقات webhook، سلوك 4xx في retry — كل إغلاق من H1/H3/M1/M2 يستوجب اختبارات سالبة.
6. **mcp_server standalone (D2):** كل إيجاداته (M8) خارج الشجرة الحية (لا يستورده التطبيق) — أولوية أقل لكنها توثَّق لأن الملف ضمن النطاق.
