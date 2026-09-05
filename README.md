# SmartBot — منصة بوت فيسبوك ميسنجر للسوق الليبي

> لوحة تحكم + محرك بوت لصفحات فيسبوك: ردود تلقائية على التعليقات والرسائل، بث جماعي، تسويق، ودفع ليبي (ليبيانا/مدار + تحويل بنكي) مع موافقات تيليجرام.

**المكدّس التقني:** FastAPI (Python 3.12) + Next.js 16 (App Router) + SQLAlchemy/Alembic + Neon PostgreSQL (إنتاج) / SQLite (تطوير) + Vercel.

## البنية

```
api/index.py                ← نقطة دخول Vercel للـ API (serverless)
fb_dashboard/               ← التطبيق الكامل (خلفية + واجهة)
├── runner.py               ← تطبيق FastAPI الرئيسي
├── bot.py                  ← محرك البوت (عزل لكل مستأجر tenant)
├── frontend/               ← واجهة Next.js 16 (App Router, RTL عربية)
├── routers/                ← مسارات API (support, notifications, marketing…)
├── static/                 ← بناء Next.js المُصدَّر (يخدمه FastAPI محليًا)
├── models.py               ← نماذج SQLAlchemy
└── test_*.py               ← 160+ اختبار pytest
public/                     ← بناء SPA القديم (يخدمه مشروع Vercel API)
alembic/                    ← ترحيلات قاعدة البيانات (حتى 006)
docs/                       ← التوثيق المنظَّم
├── plans/                  ← الخطط (PLAN-REBUILD-V2, خطة الاسترداد)
├── reports/                ← تقارير التسليم والتفتيش
├── history/                ← خطط ومراحل تاريخية
├── snapshots/              ← لقطات مرجعية (أسعار/صفحات)
├── screenshots/            ← لقطات شاشة التحقق
├── branch-protection.md    ← حماية الفرع الرئيسي (للمالك)
├── deployment.md           ← النشر (Vercel + Neon)
└── getting-started.md      ← دليل البدء السريع
```

## التشغيل محليًا

```bash
pip install -r requirements.txt
cp .env.example .env                          # ثم عدّل القيم
python -m fb_dashboard.runner                # الخلفية على :8000

cd fb_dashboard/frontend
npm install && npm run dev                    # الواجهة على :3000 (توكيل /api)
```

## الاختبارات

```bash
python -m pytest -q                           # 160 اختبارًا (يُشغَّل بدون DATABASE_URL محليًا)
```

## النشر

مشروعا Vercel (انظر `docs/deployment.md` للتفاصيل):
- **API** (`vercel.json`): FastAPI serverless — نقطة الدخول `api/index.py`
- **Frontend** (`vercel-frontend.json`): Next.js — `fb_dashboard/frontend`

## قواعد العمل (مقتطف من CLAUDE.md)

1. تحليل عميق قبل أي كود — 2. خطة قبل التنفيذ — 3. تحقق 100% بعد كل خطوة — 4. بوابة خروج بأدلة حقيقية لكل مرحلة (لا يُقبل التقرير الذاتي).

## سياسة الفروع

- `main` ← الإنتاج (يُحمى بقواعد GitHub — انظر `docs/branch-protection.md`)
- `develop` ← التطوير، دمج `--no-ff` بعد إغلاق بوابات الخروج
