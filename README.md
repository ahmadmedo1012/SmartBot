# SmartBot — منصة بوت فيسبوك ميسنجر للسوق الليبي

> لوحة تحكم + محرك بوت لصفحات فيسبوك: ردود تلقائية على التعليقات والرسائل، بث جماعي، تسويق، ودفع ليبي (ليبيانا/مدار + تحويل بنكي) مع موافقات تيليجرام.

**المكدّس التقني:** FastAPI (Python 3.12) + Next.js 16 (App Router) + SQLAlchemy/Alembic + Neon PostgreSQL (إنتاج) / SQLite (تطوير) + Vercel.

**English one-liner:** Multi-tenant Facebook Messenger bot platform for the Libyan market — auto-replies (comments + DMs), broadcasts, CRM, Libyan payments with Telegram approvals. FastAPI + Next.js 16, 297 hermetic tests, CI gates on every push (incl. i18n/a11y/contrast static gates + Sentry/GlitchTip-ready observability).

---

## البنية

```
api/index.py                ← نقطة دخول Vercel للـ API (serverless)
fb_dashboard/               ← كود الإنتاج (خلفية)
├── runner.py               ← تطبيق FastAPI (routers + middleware + lifespan)
├── bot.py                  ← محرك البوت (عزل لكل مستأجر tenant)
├── messenger_service.py    ← خط رسائل الماسنجر (webhook → تخزين → رد)
├── engines (analytics/inbox/subscriber/…)  ← منطق الأعمال
├── routers/                ← مسارات API (كل مسار يرجع {success, data})
├── frontend/               ← واجهة Next.js 16 (App Router, RTL عربية)
├── static/                 ← بناء Next.js المُصدَّر (وضع الخادم الواحد محليًا فقط)
├── models.py               ← نماذج SQLAlchemy
└── migrations/             ← ترحيلات SQL التاريخية (001–002)
tests/                      ← 297 اختبار pytest (منقولون من جذر الحزمة — v5 §1)
alembic/versions/           ← ترحيلات Alembic (حتى 010: فهارات المسارات الساخنة)
scripts/                    ← بوابات وفحوص (gate_all.sh, فحص توكنز CSS…)
e2e/  (frontend/e2e/)       ← مسح viewport/a11y/انحدار بصري (Playwright)
docs/                       ← التوثيق المنظَّم — انظر docs/INDEX.md
```

## التشغيل محليًا

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                          # ثم عدّل القيم
.venv/bin/python -m fb_dashboard.runner       # الخلفية على :8000

cd fb_dashboard/frontend
npm install && npm run dev                    # الواجهة على :3000 (توكيل /api)
```

## بوابات الجودة (v5 + v6 — تعمل آليًا على كل push/PR عبر GitHub Actions)

```bash
bash scripts/gate_all.sh        # ruff + pytest (بأي ترتيب) + tsc + next build + عقود ثابتة + بوابات v6
```

| البوابة | الأمر | الحالة الحالية |
|---|---|---|
| Lint | `ruff check fb_dashboard api tests scripts` | 0 ملاحظة |
| الاختبارات | `.venv/bin/python -m pytest -q` | **297 passed** (محكمّة: أمامي/عكسي/عشوائي أخضر) |
| TypeScript | `cd fb_dashboard/frontend && npm run typecheck` | 0 خطأ |
| بناء الإنتاج | `npm run build` | 41 مسارًا |
| فحص الوصولية | `node e2e/a11y-sweep.mjs` | 7/7 صفحات نظيفة |
| صفر تمدد أفقي | `node e2e/viewport-sweep.mjs` | 21/21 (375/768/1440) |
| i18n موحد (v6 §أ) | `python scripts/check_i18n_calls.py` | صفر استدعاء toLocale خارج format.ts |
| تسميات وصولية (v6 §ب) | `node scripts/check_a11y_labels.ts` | صفر عنصر أيقونة-فقط بلا اسم |
| تباين AA (v6 §ب) | `node scripts/check_contrast.mjs` | 30/30 توليفة ≥ 4.5:1 (مقاسة رياضيًا) |

> ملاحظة حتمية الاختبارات: `conftest.py` في الجذر **يفرض** قاعدة SQLite مؤقتة معزولة — لا ترث `DATABASE_URL` من الجهاز أبدًا (v5 §0: تلوث البيئة تسبب فشلات صامتة سابقًا).

## المراقبة وتتبع الأخطاء (v6 §ج/§هـ)

- **Sentry/GlitchTip مُفعَّل افتراضيًا:** DSN عام مضمّن في الكود (مفتاح إرسال فقط — لا يقرأ شيئًا). الخلفية → مشروع `smartbot-api`، الواجهة → `smartbot-web` (مؤسسة `subnation`). للتبديل إلى GlitchTip: `SENTRY_DSN` في الخلفية و`NEXT_PUBLIC_SENTRY_DSN` في الواجهة. للتعطيل: `SENTRY_DSN=off`. خرائط المصدر: أضف `SENTRY_AUTH_TOKEN` في Vercel فقط (org/project مضبوطان افتراضيًا).
- **تنبيهات تليجرام الحرجة:** كل 500 غير معالج يصل الأدمن فورًا (مع معرف الطلب) مع تبريد 5 دقائق لكل بصمة خطأ.
- **كشف توقف الكرون:** كل نبض يُسجّل؛ إن غاب >15 دقيقة يصل تنبيه (الكرون اليومي الأصلي من Vercel = قناة الكشف المستقلة). اختبار ذاتي: `POST /api/cron/alert-test`.

## النشر

مشروعا Vercel (انظر `docs/deployment.md`):
- **API** (`vercel.json`): FastAPI serverless — نقطة الدخول `api/index.py` → `api.smart-link.ly`
- **Frontend** (`vercel-frontend.json`): Next.js → `bot.smart-link.ly`
- **الترحيلات**: `alembic upgrade head` عند تغيّر المخطط (ترحيل 010 = فهارات القوائم الساخنة)

## المراقبة

- `GET /api/health` — liveness (لا يلمس القاعدة)
- `GET /api/health/ready` — readiness: اتصال + جدول محوري + `latency_ms`
- كل استجابة تحمل `X-Request-Id` يظهر في سطر السجل (`rid=…`) — لربط شكوى مستخدم بسجل واحد

## قواعد العمل (مقتطف من CLAUDE.md)

1. تحليل عميق قبل أي كود — 2. خطة قبل التنفيذ — 3. تحقق 100% بعد كل خطوة — 4. بوابة خروج بأدلة حقيقية لكل مرحلة (لا يُقبل التقرير الذاتي).

## سياسة الفروع

- `main` ← الإنتاج (يُحمى بقواعد GitHub — انظر `docs/branch-protection.md`)
- `develop` ← التطوير، دمج `--no-ff` بعد إغلاق بوابات الخروج
- CI (`.github/workflows/ci.yml`) يعمل على كل push/PR إلى main/develop

## فهرس التوثيق

انظر **`docs/INDEX.md`** — خريطة كاملة للخطط والتقارير والأدلة.
