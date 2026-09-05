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

## المشاكل الشائعة

| المشكلة | الحل |
|---------|------|
| cold-start بطيء على Neon | استخدم `DATABASE_POOLED_URL` (pgbouncer) كما في الإعدادات أعلاه |
| webhook يرجع 401 | تأكد `FACEBOOK_APP_SECRET` مطابق لتطبيق Meta |
| ترحيل لا يكتمل | راجع سجلات الإقلاع؛ السلسلة idempotent — أعد النشر |
| رفع الإيصال يرجع data: URL | متوقع على Vercel (نظام ملفات للقراءة فقط) |
