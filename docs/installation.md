# التثبيت التفصيلي — Installation

> كل متغيرات البيئة ومكونات المشروع موثقة هنا. للتشغيل السريع راجع [البدء السريع](getting-started.md).

## بنية المشروع

```
SmartBot/
├── api/                    # نقطة دخول Vercel (الخادم الخلفي serverless)
├── alembic/                # ترحيلات قاعدة البيانات (001 → 006)
├── fb_dashboard/           # التطبيق الكامل (FastAPI + Next.js)
│   ├── runner.py           # التطبيق الرئيسي: lifespan، middleware، مسارات WS/webhook/SPA
│   ├── bot.py              # محرك الردود التلقائية (BotEngine) لكل مستأجر
│   ├── models.py           # نماذج SQLAlchemy (45+ جدولاً)
│   ├── config.py           # الإعدادات (pydantic-settings)
│   ├── routers/            # 35+ موجّه API (auth, payments, support, marketing...)
│   ├── static/             # ملفات ثابتة + إيصالات الرفع
│   ├── tests → test_*.py   # اختبارات pytest (بوابات خروج المراحل)
│   └── frontend/           # Next.js 16 (App Router, RTL, Tailwind 4)
├── tests/e2e               # اختبارات Playwright للواجهة
└── docs/                   # هذه الوثائق
```

## متغيرات البيئة الكاملة

### الأساسيات (إلزامية في الإنتاج)

| المتغير | الوصف | التوليد |
|---------|-------|---------|
| `SECRET_KEY` | توقيع JWT | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `FERNET_KEY` | تشفير رموز فيسبوك وأسرار 2FA | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `CRON_SECRET` | حماية مسارات cron | أي نص عشوائي طويل |
| `FB_WEBHOOK_VERIFY_TOKEN` | تحقق webhook فيسبوك (GET) | أي نص عشوائي |
| `FACEBOOK_APP_SECRET` | تحقق توقيع X-Hub-Signature-256 للـ webhook | من إعدادات تطبيق Meta |

### قاعدة البيانات

| المتغير | الوصف |
|---------|-------|
| `DATABASE_URL` | اتركها فارغة للـ SQLite المحلي، أو `postgresql://...` للإنتاج |
| `DATABASE_POOLED_URL` | رابط pgbouncer (مستحسن مع Neon) — يستخدم إن وُجد |
| `DATABASE_REQUIRE_SSL` | `true` للإنتاج على Neon |

> الترحيلات تعمل تلقائياً عند الإقلاع (lifespan) — السلسلة 001→006 محصَّنة idempotent على SQLite وPostgreSQL.

### البوت والواجهة

| المتغير | الافتراضي | الوصف |
|---------|-----------|-------|
| `START_BOT` | `true` | تشغيل حلقة البوت الخلفية عند الإقلاع (اجعلها `false` محلياً) |
| `BOT_INTERVAL_SECONDS` | `10` | فاصل دورة البوت |
| `DEBUG` | `false` | `true` يرخي حراس الإنتاج (لا تستخدمه في الإنتاج) |
| `LOG_LEVEL` | `INFO` | مستوى السجلات |

### الدفع (الخطة §2)

| المتغير | الوصف |
|---------|-------|
| `LIBYANA_WALLET_PHONE` | رقم محفظة ليبيانا لاستقبال الدفع (fallback لـ `/api/config`) |
| `MADAR_WALLET_PHONE` | رقم محفظة مدار |
| `MOBILE_WALLET_CAP` | `99` — فوقه التحويل البنكي إجباري (مفروض على الخادم) |
| `BANK_TRANSFER_BANK_NAME` | اسم المصرف (fallback) |
| `BANK_TRANSFER_ACCOUNT_NUMBER` | رقم الحساب (fallback) |
| `BANK_TRANSFER_IBAN` | الـ IBAN (fallback) |

> القيم في `SystemConfig` (عبر `POST /api/admin/config`) **تتغلب** على متغيرات البيئة.

### الدعم والتيليجرام

| المتغير | الوصف |
|---------|-------|
| `TELEGRAM_BOT_TOKEN` | بوت إشعارات الأدمن (موافقات الدفع/التذاكر) |
| `TELEGRAM_ADMIN_IDS` | معرفات أدمن التيليجرام مفصولة بفواصل |
| `SUPPORT_EMAIL` / `SUPPORT_PHONE` / `SUPPORT_WHATSAPP` | بيانات الدعم المعروضة في `/api/support/info` |

### الذكاء الاصطناعي (اختياري)

`OPENAI_API_KEY` (+ `OPENAI_BASE_URL` للمتوافق) أو `GEMINI_API_KEY` — عند غيابهما تتعطل ميزات AI بأمان.

## التحقق من التثبيت

```bash
# 1) الاختبارات
env -u DATABASE_URL .venv/bin/python -m pytest -q

# 2) فحص صحة الخادم (بعد التشغيل)
curl http://localhost:8000/healthz          # → {"success": true, ...}
curl http://localhost:8000/api/health       # → liveness بدون DB

# 3) بناء الواجهة
cd fb_dashboard/frontend && npm run build   # → ✓ Compiled successfully
```
