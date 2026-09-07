# تقرير الجولة v12 — الأعمق والأضخم والأكثر تفصيلا على كل المستويات

**التاريخ:** 2026-09-07 · **الأساس:** main @ 273565e7 (v11) · **الطلب:** «اعمل جولة اعمق واضخم واكثر تفصيلا وعلى كل المستويات» · **الالتزام:** bffc081c (+3800/−839، 253 ملفًا) · **البنية:** 12 وكيل تشخيص متواز (منهجيات gstack) + 6 وكلاء تنفيذ + منسّق (إكمال + بوابات + نشر)

## 0) اكتشافات معمارية حاسمة (D8 — تصحيح فرضيات سابقة)

1. **bot.smart-link.ly نشر Vercel مستقل** (middleware.ts حي: 307→login، CSP خاص) و**api.smart-link.ly = FastAPI + SPA منسوخ عبر sync_next_static** — كان بينهما **انحراف بناء** (api يقدّم بناء قديمًا) → أُغلق بإعادة المزامنة الحتمية (مسح 3 أجيال قطع قديمة، 116 ملفًا جديدًا).
2. **Sentry الواجهة كان منشورًا فعلًا** (DSN+SDK+init في الحزم الحية — D8 فحص الحزم مباشرة)؛ و**قندورة الإقلاع حية بأدلة API**: `SmartBot API booted` — `environment=production`, `canary=boot`, `release=2.1.0`, آخرها `2026-09-07T00:06:48Z` (إقلاع بارد بعد نشر v12 مباشرة). **بند v7 المعلق مُسوّى نهائيًا.**
3. اجتياز المسار في spa.py **غير قابل للاستغلال عبر Vercel edge** (حجب 400 لكل الترميزات القياسية) لكنه كامن → أُغلق دفاعيًا في الكود.

## 1) الأمن — إغلاق كل P1 (D2 + D9 + D3)

| # | الثغرة | الإغلاح |
|---|---|---|
| 1 | **BOLA عابر للمستأجرين في وسوم المشتركين** — add_tag/remove_tag يتجاهلان tenant_id (رابط وسم مستأجر A بمشترك مستأجر B + كشف أسماء الوسوم) | تحقق ملكية Subscriber+Tag قبل الكتابة + فلترة get_detail/search — باختبار انحدار عابر للمستأجرين |
| 2 | **حدود مالك المنصة مكسورة** — أدمن أي مستأجر يوقف حلقة البوت العامة (DoS لكل المستأجرين) وينشر بعميل المنصة | bot stop/interval/trigger + scheduler-check (تحويل POST) خلف require_platform_admin؛ أدوات الوكيل تفحص is_platform_admin؛ Shopify products/orders مقيّدة |
| 3 | **SSRF جزئي** — الحارس كان في مسار AI فقط: نشر الصور (fb_client) + PDF logo_url يجلبان URL المهاجم خادميًا | الحارس في fb_client.post_to_page_with_image + BrandingConfig (logo SSRF + primary_color regex `#[0-9a-fA-F]{3,8}`) |
| 4 | **المحفظة: اقتطاع قروش + فقد تحديثات** — int(float()) على Numeric(10,3) + read-modify-write | وحدة _wallet.py: Decimal(12,3) + UPDATE ذري CAST — باختبارات |
| 5 | **JWT لا يُلغى عند تغيير كلمة المرور** | عمود token_ver (نماذج + هجرة 011) + مطابقة في make_token/get_current_user + زيادة عند reset/change |
| 6 | اعتمادات X/LinkedIn نصًا صريحًا | Fernet عند الحفظ + سقوط آمن للقيم القديمة — اختبار round-trip |
| 7 | CSRF طبقة واحدة (SameSite+Origin) | **مزدوجة الإرسال**: كوكي Strict (يُصدر حيًا في الإنتاج — دليل set-cookie أدناه) + X-CSRF-Token في apiFetch — مضافة بأمان (تفعّل فقط عند وجود الكوكي، إعفاء المسارات الآلية) |
| 8 | CSP متساهلة | إسقاط مضيفي FB من script-src (بلا SDK فعلًا) + connect-src معدود (self + api + ingest.de.sentry.io) — مؤكد حيًا |
| 9 | find-or-create بلا نطاق مستأجر (مشترك/CRM/وسم) + حذف مستأجر ناقص 14 جدولًا | كلها محصورة نطاقيًا + GDPR مكتمل |
| 10 | healthz يسرب نص خطأ DB | حُذف + التقاط Sentry |

## 2) البيانات والأداء (D9 + D6)

- **هجرة 011 + نماذج**: فهارس bot_state(key,value) — *أعلى مسار حرارة: كل حدث webhook كان يمسح تسلسليًا*؛ ai_suggestions، payment_requests، subscription_payments، broadcasts، bot_alerts، subscribers(tenant,platform,status)
- **حزمة الواجهة (قياس أمين مقابل بناء HEAD في worktree)**: framer-motion خرج من كل المسارات المتحمسة (بقي في chunk المعالج الكسول فقط)؛ react-query معزول في تخطيطات dashboard/admin؛ sonner بعد أول طلاء → login 731→707KB، index 773→711KB، مضغوط: −8/−18KB؛ dashboard مستقر (توأمات CSS بديلة)
- **ترويسات التخزين مؤكدة حية**: api /_next chunks `max-age=0,must-revalidate` → **`immutable` 31536000** (كانت D8-P2)؛ og-image على النطاقين immutable؛ fonts 604800+SWR محفوظة

## 3) العقد والتعريب (D4 + D10)

- ok() موحّد: /api/me (إسقاط authenticated)، campaigns {items,total}، onboarding×3 (سابقة facebook-test)، 9 تحويلات ميكانيكية، page_size→per_page، **خلل iso_z في last_heartbeat (نص «آخر نبض» مُزاح ساعتين)**، /healthz إعفاء بنية تحتية دائم (6→5)
- **عقد 405 موحّد جديد**: GET على مسار POST-only حقيقي → 405 + Allow (جدول المسارات في spa_catch_all) — مؤكد حيًا على /api/login و scheduler-check
- **~25 رسالة إنجليزية عُرّبت** (كانت تصدع داخل توستات عربية)، «الأدمن»→«الإدارة»، تنوين موحد، countPhrase/formatNumber في 8 مواقع، حزمة صقل (ماسنجر، قبل، «…»)

## 4) a11y (D5) — الفشل الوحيد بالمستوى A أُغلق

إزالة tabIndex=-1 من أزرار إظهار كلمة المرور ×3؛ scroll-padding-top (2.4.11)؛ ربط أخطاء login/register بـ aria (3.3.1)؛ أدوار التوست مفصولة status/alert؛ أسهم radiogroup الأولوية؛ دفعة الخصائص المنطقية (badge كان معكوسًا فعليًا)؛ scope+labelledby للجداول؛ عدّاد 429؛ كلمة المرور 6→8 (توحيد FE=BE)؛ توجيه عميق عند انتهاء الجلسة؛ مساعدة على مسار الأموال (3.2.6)؛ USSD encodeURIComponent

## 5) المراقبة (D12) — «انقطاع DB غير مرئي» أُغلق بثلاث طبقات

1. **نبض القلب 503 عند فشل الدفتر/المسوح** → cron-job.org (يضرب كل 5 دقائق) ينذر فعليًا الآن
2. **قاعدتا تنبيه Sentry أُنشئتا عبر API**: smartbot-api (id=776237) + smartbot-web (id=776238) — مشكلة جديدة في production، بريد، تهدئة 30د
3. أخطاء الخلفية تصل Sentry بآثارها: حلقة البوت، spawn callback، WS، startup (حارس SECRET_KEY يعاد رفعه)؛ **request_id مربوط بـ request.state** (كان ميتًا — الآن في الإنذارات وSentry)؛ before_send PII scrubber

## 6) الاختبارات

- **553 خلفيًا (من 473)** + 37 أماميًا؛ **التغطية 59%→60.4%**؛ **الأرضية 50→60** (معيار gstack الأدنى) في gate_all.sh + CI
- أجنحة v12: محركات الأمان / راوترات الأمان / المراقبة (CSRF شامل) / العقود
- خطاف CSRF التوافقي في conftest يقلّد apiFetch الحقيقي (يغطي 24 ملف اختبار دفعة واحدة)
- تحويل 8 اختبارات قديمة لتثبيت العقود الجديدة (Fernet، items/total، عربية، get_tenant_fb_client)

## 7) التنظيف والوثائق

- حذف: /api/debug + /api/debug/fb-reply (128 سطرًا) + /api/stats القديم + /api/env + lib/motion.ts + hook الإبطال الميت + حقلا LOG_LEVEL/REDIS_URL + 4 متغيرات .env ميتة
- **جديد: docs/decisions-ledger.md** — 10 بنود مؤجلة بأسلوب gstack-shortcut (سقف + محفز ترقية + مالك): حزمة الوكيل بلا واجهة (~3400 سطر — قرار منتج)، ميزانية JS، تدوير مفاتيح المالك (عاجل)، payments.py تفكيك، سلسلة 003...
- deployment.md: قسم التنبيهات والتصعيد الكامل؛ CLAUDE.md: اصطلاحات الوحدات

## 8) جدول القبول — كله بأدلة حية

| # | المعيار | الحالة | الدليل (docs/evidence/v12/) |
|---|---|---|---|
| 1 | كل P1 الأمنية مغلقة باختبارات انحدار | ✅ | 553 اختبارًا + أجنحة v12 |
| 2 | البوابات | ✅ | gate_all.sh خروج 0 (ruff/pytest@60%/tsc 0/build 41/41/vitest 37/37/css/i18n/a11y/contrast) |
| 3 | cero انحراف بناء بين النطاقين | ✅ | chunk جديد 3guxw38du75sh.js + immutable حي |
| 4 | إنتاج حي بعد النشر (canary) | ✅ | post-deploy-verification.txt — 14 PASS + CSRF cookie حي + 405 الموحد حي |
| 5 | بند v7 المعلق (Sentry) | ✅ | sentry-canary-and-alerts.txt — production/canary=boot/release 2.1.0 + قاعدتا تنبيه |
| 6 | صفر رسالة إنجليزية للمستخدم | ✅ | المسح الشامل + بوابات i18n |
| 7 | commit واحد + دفع | ✅ | bffc081c → main |

## 9) المؤجل بأمانة (سجل القرارات docs/decisions-ledger.md)

قرار منتج لحزمة الوكيل/الراوترات بلا واجهة (~3,400 سطر) · تدوير Neon/SECRET_KEY/FERNET (مالك — باب أحادٍ، يتطلب تأكيدًا مطبوعًا) · تفكيك payments.py (593) · UNIQUE لـ bot_state بعد dedup · رفع خرائط مصدر Sentry (SENTRY_AUTH_TOKEN في Vercel) · تقليم حراس dual-shape بعد استقرار v12

## 10) الحصيلة

- **12 وكيل تشخيص + 6 تنفيذ + منسّق** (وكيل E2 الراوترات تجاوز حد الأدوار بعد إنجاز عمله — أكمله المنسّق)
- **253 ملفًا: +3,800/−839** · 553+37 اختبارًا · 6 ثغرات P1 مغلقة · 3 طبقات تنبيه جديدة · قاعدتا Sentry عبر API
- **الأدلة الحية**: 14 فحص post-deploy PASS + قندورة إقلاع post-deploy + كوكي CSRF حي + CSP مضيّق حيًا
