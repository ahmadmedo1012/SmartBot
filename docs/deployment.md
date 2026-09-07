# النشر — Deployment (Vercel + Neon)

> SmartBot يُنشر كقطعتين على Vercel: خادم API (serverless Python) + واجهة Next.js، بقاعدة Neon PostgreSQL.

## المعمارية في الإنتاج

```
المستخدم ──► https://bot.smart-link.ly  (Vercel: Next.js 16)
                 │  apiFetch → https://api.smart-link.ly (Vercel: FastAPI serverless)
                 │                    │
                 │                    ├──► Neon PostgreSQL (pooled)
                 │                    ├──► Telegram Bot (موافقات الدفع/الدعم)
                 └── Facebook Webhook ─► /webhook (توقيع X-Hub-Signature-256)
```

ملفا الإعداد جاهزان في المستودع:
- `vercel.json` — مشروع الـ API (Python serverless، cron للتنظيف 03:00 UTC)
- `fb_dashboard/frontend/vercel.json` — مشروع الواجهة (Next.js) — **التكوين الفعلي** الذي يقرؤه Vercel من دليل الواجهة المرتبط (v14: ملف `vercel-frontend.json` الجذر المنحرف حُذف — كان مكرراً بلا قارئ: rewrites `/webhook`/`/healthz` ناقصة فيه وسياسة خطوط تخالف الكود)

## بنية مسار الأموال — routers/payments/ (v13)

مسار الدفع **حزمة منذ v13** (كان ملفًا واحدًا `routers/payments.py` بحجم 594 سطرًا — تفكيك بنية لا سلوك):

```
fb_dashboard/routers/payments/
  __init__.py    → راوتر التجميع (untagged) يضم الوحدات الخمس — يُبقي سطح الاستيراد fb_dashboard.routers.payments كما هو
  wallet.py      → محافظ الجوال (ليبيانا/مدار): الإيداع والتأكيد والرصيد والسجل
  bank.py        → التحويل البنكي ورفع الإيصالات
  approvals.py   → موافقات الدفع عبر تلغرام (إدارة الطلبات المعلقة للأدمن)
  sse.py         → بث حالة الدفع الحي (Server-Sent Events)
  plans.py       → إنشاء/ترقية الاشتراكات وحالة الدفع
```

- الأجسام نُقلت **حرفيًا** (نقل لا إعادة كتابة) — سلوك الـAPI مطابق لما قبل التفكيك، وتحرسه اختبارات pytest القائمة على مسار الأموال.
- **رفع الإيصالات:** تُخزَّن في `fb_dashboard/static/uploads/receipts` — المسار نفسه قبل التفكيك (`_UPLOAD_DIR` مثبّت على جذر `fb_dashboard` رغم تعمّق الحزمة في الشجرة). على Vercel (نظام ملفات للقراءة فقط) يبقى السلوك كما هو: الاستجابة تُرجع data: URL.

## خطوات النشر

### 1. قاعدة البيانات (Neon)

1. أنشئ مشروعاً على [neon.tech](https://neon.tech)
2. انسخ رابطين: **pooled** (للاتصال العادي) و **direct**
3. متغيرات البيئة:

```
DATABASE_POOLED_URL=postgresql://user:pass@pooler.region.aws.neon.tech/dbname?sslmode=require
DATABASE_URL=postgresql://user:pass@db.region.aws.neon.tech/dbname?sslmode=require
DATABASE_REQUIRE_SSL=true
```

> الترحيلات تُطبَّق تلقائيًا حتى head عند أول إقلاع (lifespan يدير Alembic بلا subprocess) — السلسلة idempotent.

#### سلسلة الترحيلات (v13)

- **السلسلة:** `001` (create_all) → `002` فهارس → `003` بذرة tenants → `004`–`011` (أمن/جداول/فهارس v10–v12) → **`012` (v13): dedup صفوف `bot_state` المكررة ثم فهرس فريد جزئي `uq_botstate_key_value` على (key,value) بشرط `WHERE key='fb_page_id'`**.
- **003 صار مطابقًا للشكل (shape-adaptive، v13):** إدراج البذرة الافتراضية يفحص أعمدة جدول `tenants` الفعلية عبر inspector (حارس عمود `slug`) + `ON CONFLICT DO NOTHING` + `setval` — قاعدة PostgreSQL نظيفة تكمل السلسلة حتى head بدل أن تعلق صامتة عند 002، وبيئة عالقة تُشفى ذاتيًا في الإقلاع التالي. no-op في الإنتاج (`alembic_version` تجاوز 003 فلا يُعاد تشغيله).
- **دلالة الفهرس الجزئي (012):** محاولة مستأجر ربط صفحة فيسبوك (`fb_page_id`) مربوطة بمستأجر آخر ترفع `IntegrityError` عند الـcommit — تظهر للعميل **500 حتى صقل اختياري** (409 «الصفحة مربوطة بمساحة أخرى» — مسجَّلة كمتابعة للمنسّق). الجزئية عمدًا: مفاتيح مثل `balance` و`fb_fan_count` تتكرر عبر المستأجرين بشكل مشروع، والفريد الجدولي الكامل يفسد مسار الأموال.

### 2. خادم API

```bash
vercel link                     # اربط المشروع
vercel --prod                   # يستخدم vercel.json
```

متغيرات الإنتاج الإلزامية (Dashboard → Settings → Environment Variables):

| المتغير | ملاحظة |
|---------|--------|
| `SECRET_KEY` / `FERNET_KEY` | قيم قوية — راجع [installation.md](installation.md) |
| `CRON_SECRET` | يطابق حماية cron في vercel.json |
| `DATABASE_*` | روابط Neon أعلاه |
| `FACEBOOK_APP_SECRET` + `FB_WEBHOOK_VERIFY_TOKEN` | للـ webhook |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_IDS` | موافقات الدفع |
| أرقام المحافظ/البنك | fallbacks — الأفضل ضبطها لاحقاً عبر `/api/admin/config` |

### 3. الواجهة الأمامية

```bash
cd fb_dashboard/frontend
vercel link && vercel --prod    # يقرأ fb_dashboard/frontend/vercel.json (تكوين الدليل المرتبط — التكوين الفعلي)
```

متغيراتها:

```
NEXT_PUBLIC_DOMAIN=https://bot.smart-link.ly
```

> التوكيل إلى API لا يحتاج أي متغير «مضيف API»: `fb_dashboard/frontend/vercel.json` يعرّف rewrites من نفس الأصل (`/api/:path*` → `api.smart-link.ly` — كما يفعل `LOCAL_API_PROXY` في التطوير). المتغير `NEXT_PUBLIC_API_HOST` كان موثقاً هنا سابقاً ولا يقرؤه الكود إطلاقاً (حُذف من التوثيق في v14).

### 4. Webhook فيسبوك

في [developers.facebook.com](https://developers.facebook.com/) → تطبيقك → Webhooks:

- Callback URL: `https://api.smart-link.ly/webhook`
- Verify token: قيمة `FB_WEBHOOK_VERIFY_TOKEN`
- اشترك في حقل `feed`
- فعّل توقيع التطبيق (`FACEBOOK_APP_SECRET`) — الخادم **يرفض** الطلبات غير الموقعة

### 5. الزرع الأولي

عند أول إقلاع يُزرع الأدمن الأولي **من متغيري البيئة** `INITIAL_ADMIN_USERNAME`/`INITIAL_ADMIN_PASSWORD` (انظر [installation.md](installation.md) — قسم «الأدمن الأولي»):
- في الإنتاج **بدون** `INITIAL_ADMIN_PASSWORD`: تُولَّد كلمة مرور عشوائية **تُطبع في السجل مرة واحدة** عند أول إقلاع — انسخها من سجلات Vercel فوراً (لا تُخزَّن ولا يمكن استرجاعها لاحقاً).
- مساواة `admin`/`admin` تعمل فقط في وضع `DEBUG=true` (التطوير المحلي).
- لا يعاد الزرع أبداً إن وُجد مستخدمون (الإقلاعات اللاحقة لا تلمس كلمة المرور).

`POST /api/repair` (أدمن منصة) يبقى أداة الإصلاح اليدوي: ينشئ الجداول ويشغّل زرع الأدمن نفسه (`seed_admin` — نفس المتغيرين أعلاه).

بعد الدخول: **غيّر كلمة المرور** واضبط بيانات البنك عبر `POST /api/admin/config`.

## العمليات المستمرة

| العملية | الآلية |
|---------|--------|
| دورة البوت (حين لا يوجد webhook) | `GET /api/cron/bot-cycle` بمشاركة shard عبر cron-job.org أو Vercel Cron |
| تنظيف السجلات وrate-limit المنتهي | cron يومي 03:00 UTC (معرّف في vercel.json) |
| مراقبة الجاهزية | `/api/health/ready` (فحص DB) و `/api/health` (liveness) |
| Speed Insights / Analytics | مفعّلة في layout.tsx |

## التنبيهات والمراقبة (v12 — محدَّثة في v13)

> البنية موجودة ومهيّأة بالكامل في الكود؛ البنود المميزة بعلامة 🔑 **إجراء مالك** (لا يُغلق برمجيًا) — التفاصيل والمحفزات في [decisions-ledger.md](decisions-ledger.md) (`dec-owner-rotations` — عاجل، مُعاد تصعيده 2026-09-07 · `dec-uptime-monitor`).

### (أ) مسارات الفحص — كلها ترجّع حالة HTTP صادقة

| المسار | ما يفحص | سلوك الفشل |
|--------|---------|-------------|
| `GET /healthz` | اتصال DB + عدد الباقات | **503** عند فشل القاعدة (لا 200-ok كاذبة) |
| `GET /api/health/ready` | اتصال + جدول محوري + `latency_ms` | 503 عند عدم الجاهزية |
| `GET /api/cron/heartbeat` | مسح كامل: منشورات مجدولة + تحديث عدّادات + دورة بوت | **503 عند فشل المسح منذ v12** → cron-job.org يعدّها فشلًا وينذر (يسد فجوة «انقطاع DB غير مرئي») |

### (ب) القنوات الموجودة وتعمل

- **جسر تلغرام للـ500:** كل خطأ غير معالج يصل الأدمن فورًا مع معرف الطلب — تهدئة بصمة الخطأ 300 ثانية (تنبيه واحد لكل عاصفة أخطاء، لا مئات).
- **نبض cron-job.org كل 5 دقائق** على `/api/cron/heartbeat` — الفشل يُنذَر (انظر الجدول أعلاه).
- **Vercel Cron يومي 04:00 UTC** على المسار نفسه — قناة كشف مستقلة: إن غاب نبض cron-job.org >15 دقيقة يرصدها الكرون اليومي وينذر تلغرام.

### (ج) المطلوب من المالك 🔑

1. 🔴 **تدوير الاعتمادات المسربة تاريخيًا (إعادة تصعيد 2026-09-07 — `dec-owner-rotations`):** كتلة `fb_dashboard/.env` التاريخية (كلمة مرور Neon + قيمة `SECRET_KEY` القديمة) لا تزال قابلة للوصول من `origin/main` العام — أعاد D10 تأكيدها في جولة v13. باب أحادي الاتجاه بثلاث دورات (Neon · `SECRET_KEY` · `FERNET_KEY`) يتطلب **تأكيدًا مطبوعًا من المالك** — الأثر الثلاثي والتفاصيل في [decisions-ledger.md](decisions-ledger.md).
2. ~~قاعدة تنبيه Sentry لكل مشروع~~ — ✅ أُنجزت في v12 عبر API: `smartbot-api` (id=776237) و`smartbot-web` (id=776238) — production، new-issue، بريد، تهدئة 30د. الدليل الحي: `docs/evidence/v12/sentry-canary-and-alerts.txt`؛ أُغلق بند `dec-sentry-alerts` في السجل (جولة v13 — إغلاق كتابي).
3. **مراقب uptime خارجي** (UptimeRobot/Checkly) على المسارين `/healthz` و`/api/health/ready` — بريد عند 503 متتاليتين.
4. **متغيرات Vercel:**
   - `NEXT_PUBLIC_SENTRY_RELEASE` — **اختياري**: يُحقن تلقائيًا من build script منذ v12 (`SENTRY_RELEASE=$(git rev-parse --short HEAD)`)؛ يضبط يدويًا فقط عند تجاوز آلية الحقن.
   - `SENTRY_AUTH_TOKEN` — لرفع خرائط المصدر (org/project مضبوطان افتراضيًا في الإعداد).

### (د) مسار التصعيد عند حادثة

```
خطأ/شكوى مستخدم
  → تلغرام (فوري، مع بصمة الطلب) أو لوحة Sentry
  → فحص نبض الكرون: GET /api/cron/status (أدمن — العمر/التقادم لآخر نبض)
  → سجلات Vercel (المشروعان) — ابحث بـ rid=<request_id>
```

**الخيط الرابط:** كل استجابة تحمل ترويسة `X-Request-Id` (ومنذ v12 يُربط الـ rid في إنذارات تلغرام وأحداث Sentry وtraceback الأخطاء) — شكوى مستخدم واحدة = سجل واحد قابل للإيجاد في كل القنوات.

## المشاكل الشائعة

| المشكلة | الحل |
|---------|------|
| cold-start بطيء على Neon | استخدم `DATABASE_POOLED_URL` (pgbouncer) كما في الإعدادات أعلاه |
| webhook يرجع 401 | تأكد `FACEBOOK_APP_SECRET` مطابق لتطبيق Meta |
| ترحيل لا يكتمل | راجع سجلات الإقلاع؛ السلسلة idempotent — أعد النشر. منذ v13: 003 مطابق للشكل (shape-adaptive) و012 فريد جزئي — انظر «سلسلة الترحيلات» أعلاه |
| رفع الإيصال يرجع data: URL | متوقع على Vercel (نظام ملفات للقراءة فقط) |
