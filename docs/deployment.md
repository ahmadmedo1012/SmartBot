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
- `vercel-frontend.json` — مشروع الواجهة (Next.js)

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

> الترحيلات 001→006 تُطبَّق تلقائياً عند أول إقلاع (lifespan يدير Alembic بلا subprocess).

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
vercel link && vercel --prod    # يستخدم vercel-frontend.json
```

متغيراتها:

```
NEXT_PUBLIC_API_HOST=https://api.smart-link.ly
NEXT_PUBLIC_DOMAIN=https://bot.smart-link.ly
```

### 4. Webhook فيسبوك

في [developers.facebook.com](https://developers.facebook.com/) → تطبيقك → Webhooks:

- Callback URL: `https://api.smart-link.ly/webhook`
- Verify token: قيمة `FB_WEBHOOK_VERIFY_TOKEN`
- اشترك في حقل `feed`
- فعّل توقيع التطبيق (`FACEBOOK_APP_SECRET`) — الخادم **يرفض** الطلبات غير الموقعة

### 5. الزرع الأولي

بعد أول إقلاع: `/api/repair` (أدمن) ينشئ الجداول + يزرع الأدمن الافتراضي والباقات الخمس.
**غيّر كلمة مرور الأدمن فوراً** واضبط بيانات البنك عبر `POST /api/admin/config`.

## العمليات المستمرة

| العملية | الآلية |
|---------|--------|
| دورة البوت (حين لا يوجد webhook) | `GET /api/cron/bot-cycle` بمشاركة shard عبر cron-job.org أو Vercel Cron |
| تنظيف السجلات وrate-limit المنتهي | cron يومي 03:00 UTC (معرّف في vercel.json) |
| مراقبة الجاهزية | `/api/health/ready` (فحص DB) و `/api/health` (liveness) |
| Speed Insights / Analytics | مفعّلة في layout.tsx |

## التنبيهات والمراقبة (v12)

> البنية موجودة ومهيّأة بالكامل في الكود؛ البنود المميزة بعلامة 🔑 **إجراء مالك** (لا يُغلق برمجيًا) — التفاصيل والمحفزات في [decisions-ledger.md](decisions-ledger.md) (`dec-sentry-alerts`، `dec-uptime-monitor`).

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

1. **قاعدة تنبيه Sentry لكل مشروع** (`smartbot-api` و`smartbot-web` — كلاهما يستقبل أحداث من الإنتاج): «مشكلة جديدة في بيئة production → بريد/تريقام». تُنشأ من لوحة Sentry أو API.
2. **مراقب uptime خارجي** (UptimeRobot/Checkly) على المسارين `/healthz` و`/api/health/ready` — بريد عند 503 متتاليتين.
3. **متغيرات Vercel:**
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
| ترحيل لا يكتمل | راجع سجلات الإقلاع؛ السلسلة idempotent — أعد النشر |
| رفع الإيصال يرجع data: URL | متوقع على Vercel (نظام ملفات للقراءة فقط) |
