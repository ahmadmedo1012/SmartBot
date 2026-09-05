# البدء السريع مع SmartBot — Getting Started

> هذا الدليل يوصلك من صفر إلى بوت يرد على تعليقات صفحتك في أقل من 10 دقائق.

## المتطلبات

| المتطلب | الحد الأدنى |
|---------|------------|
| Python | 3.12+ |
| Node.js | 20+ (مبني ومختبر على 24) |
| قاعدة البيانات | SQLite للتطوير المحلي / PostgreSQL (Neon) للإنتاج |
| فيسبوك | صفحة لديك صلاحية **إدارة** عليها |

## الخطوات

### 1. استنساخ المشروع وتثبيت التبعيات

```bash
git clone https://github.com/ahmadmedo1012/SmartBot.git
cd SmartBot

# الواجهة الخلفية (FastAPI)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# الواجهة الأمامية (Next.js 16)
cd fb_dashboard/frontend
npm install          # يعمل مباشرة — .npmrc يتكفل بتعارض react-joyride/React 19
```

### 2. إعداد متغيرات البيئة

```bash
cp .env.example .env
```

ثم املأ القيم الأساسية (الحد الأدنى للتشغيل المحلي):

```bash
# ولّد القيم:
python -c "import secrets; print(secrets.token_urlsafe(32))"          # → SECRET_KEY
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # → FERNET_KEY

SECRET_KEY=<القيمة>
FERNET_KEY=<القيمة>
CRON_SECRET=<أي نص عشوائي>
DEBUG=true
START_BOT=false          # للتطوير — شغّل البوت يدوياً عند الحاجة
```

> **ملاحظة:** إذا كان لديك متغير `DATABASE_URL` عام في بيئتك، أزله قبل التشغيل (`env -u DATABASE_URL`) — القيمة `file:...` غير مدعومة من SQLAlchemy.

### 3. تشغيل الخادم

```bash
cd fb_dashboard
../.venv/bin/python runner.py
```

عند أول تشغيل:
- تُنشأ الجداول تلقائياً (`Base.metadata.create_all`)
- تُطبَّق ترحيلات Alembic حتى `head` (001→006)
- تُزرع 5 باقات اشتراك + أدمن افتراضي (`admin`/`admin` — **غيّرها فوراً**)

الخادم يستمع على `http://localhost:8000`:
- لوحة التحكم: `http://localhost:8000/dashboard`
- توثيق API التفاعلي: `http://localhost:8000/api/docs`

### 4. بناء الواجهة الأمامية (اختياري للتطوير)

```bash
cd fb_dashboard/frontend
npm run build
```

ينتج `.next/` — يخدمه FastAPI عبر مسار catch-all.

### 5. ربط صفحة فيسبوك

1. سجّل حساباً من `/register`
2. من **الصفحات** في لوحة التحكم: أدخل `Page ID` و`Page Access Token`
   (من [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/) بصلاحيات `pages_manage_engage_posts, pages_read_engagement, pages_messaging`)
3. أنشئ أول **قاعدة رد** من صفحة الردود التلقائية

## تشغيل الاختبارات

```bash
env -u DATABASE_URL .venv/bin/python -m pytest -q          # الواجهة الخلفية
```

## الخطوة التالية

- [التثبيت التفصيلي](installation.md) — كل متغيرات البيئة شرحاً
- [النشر على Vercel + Neon](deployment.md)
- [دليل المستخدم](user-guide-ar.md)
