# التثبيت التفصيلي — Installation

> كل متغيرات البيئة ومكونات المشروع موثقة هنا. للتشغيل السريع راجع [البدء السريع](getting-started.md).

## بنية المشروع

```
SmartBot/
├── api/                    # نقطة دخول Vercel (الخادم الخلفي serverless)
├── alembic/                # ترحيلات قاعدة البيانات (001 → 013)
├── fb_dashboard/           # التطبيق الكامل (FastAPI + Next.js)
│   ├── runner.py           # التطبيق الرئيسي: lifespan، middleware، مسارات WS/webhook/SPA
│   ├── bot.py              # محرك الردود التلقائية (BotEngine) لكل مستأجر
│   ├── models.py           # نماذج SQLAlchemy (45+ جدولاً)
│   ├── config.py           # الإعدادات (pydantic-settings)
│   ├── routers/            # 40+ موجّه API (حزمة payments/ منذ v13)
│   ├── static/             # بناء Next.js المُصدَّر لوضع الخادم الواحد (إيصالات الرفع بيانات تشغيل غير متتبعة في git)
│   └── frontend/           # Next.js 16 (App Router, RTL, Tailwind 4) — اختباراته في frontend/src/test وfrontend/e2e
├── tests/                  # اختبارات pytest (بوابات خروج المراحل — في جذر المستودع، لا داخل fb_dashboard)
│   └── e2e/                # مسح مبرمج بلا خادم (mjs)
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
| `DB_SSL_VERIFY` | `true` (الافتراضي) — تحقق كامل من شهادة SSL (فرض أمني منذ 2026-09-05). `false` مخرج طوارئ فقط (يعيد السلوك القديم بلا تحقق — خطر MITM) |

> الترحيلات تعمل تلقائياً عند الإقلاع (lifespan) — السلسلة 001→013 محصَّنة idempotent على SQLite وPostgreSQL.

### البوت والواجهة

| المتغير | الافتراضي | الوصف |
|---------|-----------|-------|
| `START_BOT` | `true` | تشغيل حلقة البوت الخلفية عند الإقلاع (اجعلها `false` محلياً) |
| `BOT_INTERVAL_SECONDS` | `10` | فاصل دورة البوت |
| `DEBUG` | `false` | `true` يرخي حراس الإنتاج (لا تستخدمه في الإنتاج) |

> `LOG_LEVEL` كان موثقاً هنا سابقاً — **محذوف من الإعدادات منذ v12** (صفر قرّاء في الكود — راجع `config.py`)؛ ضبطه لا يغيّر مستوى السجلات.

### الأدمن الأولي (الزرع التمهيدي)

| المتغير | الافتراضي | الوصف |
|---------|-----------|-------|
| `INITIAL_ADMIN_USERNAME` | `admin` | اسم مستخدم أدمن المنصة المزروع عند أول إقلاع (إن لم يوجد مستخدمون) |
| `INITIAL_ADMIN_PASSWORD` | *(فارغ)* | كلمة مرور الأدمن الأولي |

> ⚠️ **تحذير الإنتاج:** بدون `INITIAL_ADMIN_PASSWORD` وفي وضع غير `DEBUG` تُولَّد كلمة مرور **عشوائية تُطبع في السجل مرة واحدة** عند أول إقلاع (سطر `INITIAL_ADMIN_PASSWORD not set — bootstrap admin … RANDOM password`) — انسخها من سجلات الخادم فوراً؛ لا تُخزَّن ولا يمكن استرجاعها بعدها. القيمة `admin`/`admin` تعمل **فقط** مع `DEBUG=true` (تطوير محلي). لا يُعاد الزرع أبداً بعد وجود أول مستخدم.

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
| `TELEGRAM_WEBHOOK_SECRET` | سر التحقق من ويبهوك تيليجرام: يقارنه الخادم ثابت الزمن مع ترويسة `x-telegram-bot-api-secret-token` — **بدونه يُرفض الويبهوك بـ403** (اضبطه في setWebhook عند تفعيل إشعارات الموافقات) |
| `TELEGRAM_WEBHOOK_ALLOW_UNVERIFIED` | `true` **للاختبار المحلي فقط** — يتخطى فحص السر السابق |
| `TELEGRAM_CHAT_ID` | معرف محادثة تلغرام بديل لإرسال الإشعارات (fallback لقاعدة البيانات — راجع `routers/telegram_config.py`) |
| `SUPPORT_EMAIL` / `SUPPORT_PHONE` / `SUPPORT_WHATSAPP` | بيانات الدعم المعروضة في `/api/support/info` |
| `SUPPORT_WORKING_HOURS` | ساعات العمل المعروضة في `/api/support/info` (الافتراضي `24/7`) |

### الويبهوك والنطاق العام

| المتغير | الوصف |
|---------|-------|
| `API_PUBLIC_URL` | نطاق الـ API العام المستخدم في **URL اشتراك الويبهوك** وفحص صحته (`/api/webhook/check`): يُضبط عادة إلى `api.smart-link.ly` — النطاق المستقر المسجّل عند Meta، لا رابط النشر المؤقت `.vercel.app` (يُتجاهَل تلقائياً لصالح النطاق المستقر). الافتراضي: `api.smart-link.ly` |

### الرصد وتتبع الأخطاء — الخلفية (Sentry/GlitchTip)

> DSN عام مضمّن في الكود (مفتاح إرسال فقط) — كل ما يلي اختياري لضبط/تبديل/تعطيل السلوك. للتعطيل الكامل: `SENTRY_DSN=off`.

| المتغير | الوصف |
|---------|-------|
| `SENTRY_DSN` | وجهة الأخطاء — Sentry أو GlitchTip (صيغة DSN نفسها). `off` = تعطيل تتبع الأخطاء |
| `SENTRY_BOOT_CANARY` | `off` يوقف حدث «SmartBot API booted» الذي يُرسل مرة واحدة عند كل إقلاع بارد (إشارة ربط تعمل — داخل الحصة المجانية) |
| `SENTRY_ENVIRONMENT` | وسم البيئة (`production`/`preview`/…) — fallback تلقائي: `ENV` ثم `VERCEL_ENV` ثم `local` |
| `SENTRY_RELEASE` | وسم الإصدار (الافتراضي: إصدار التطبيق من `_utils.app_version()`) |
| `SENTRY_TRACES_SAMPLE_RATE` | نسبة معاينة الأداء (الافتراضي `0.05`) |

### الرصد وتتبع الأخطاء — الواجهة (Sentry)

> الواجهة مشروعان مستقلان في Sentry: `smartbot-web` (الواجهة) و`smartbot-api` (الخلفية) تحت المؤسسة `subnation`.

| المتغير | الجهة | الوصف |
|---------|-------|-------|
| `NEXT_PUBLIC_SENTRY_DSN` | متصفح | وجهة أخطاء جانب العميل (`off` = تعطيل). DSN افتراضي مضمّن |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | متصفح | وسم البيئة (fallback: `NODE_ENV`) |
| `NEXT_PUBLIC_SENTRY_RELEASE` | متصفح | وسم الإصدار — يُحقن تلقائياً من سكربت البناء (`SENTRY_RELEASE=$(git rev-parse --short HEAD)` منذ v12) |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | متصفح | نسبة معاينة الأداء (الافتراضي `0.05`) |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` / `SENTRY_RELEASE` / `SENTRY_TRACES_SAMPLE_RATE` | خادم SSR | نفس الدور لجانب الخادم في `next start`/Vercel (release يقرأ `NEXT_PUBLIC_SENTRY_RELEASE` كـfallback) |
| `SENTRY_AUTH_TOKEN` | البناء | رفع خرائط المصدر — أضفه في Vercel فقط لتفعيل التتبعات الرمزية (بدونه يتخطى الرفع بصمت) |
| `SENTRY_ORG` / `SENTRY_PROJECT` | البناء | مضمّنان افتراضياً إلى `subnation`/`smartbot-web` — لا تضبطهما إلا لوجهة بديلة |

### الذكاء الاصطناعي (اختياري)

| المتغير | الوصف |
|---------|-------|
| `OPENAI_API_KEY` | مزوّد OpenAI أو أي متوافق |
| `OPENAI_BASE_URL` | عنوان قاعدة بديل للمتوافقين |
| `OPENAI_MODEL` | موديل OpenAI (الافتراضي `gpt-4o-mini`) |
| `GEMINI_API_KEY` | مزوّد Google Gemini |
| `AI_MODEL` | موديل Gemini (الافتراضي `gemini-1.5-flash`) |

> عند غياب المفاتيح تتعطل ميزات AI بأمان (لا يُرفض أي طلب).

### التشغيل والحدود

| المتغير | الافتراضي | الوصف |
|---------|-----------|-------|
| `REDIS_URL` | *(فارغ)* | Redis اختياري للكاش — بدله كاش داخل الذاكرة (fallback صامت) |
| `SMARTBOT_MUTATE_RATE_LIMIT` | `30` | سقف الطلبات المُغيّرة (POST/PUT/PATCH/DELETE) لكل IP — زِده خلف proxy موثوق يشارك المستخدمون IP واحد |
| `SMARTBOT_MUTATE_RATE_LIMIT_WINDOW` | `60` | نافذة الحد السابق بالثواني |

### الواجهة الأمامية (تطوير محلي — `fb_dashboard/frontend/.env.local`)

| المتغير | الوصف |
|---------|-------|
| `LOCAL_API_PROXY` | `http://127.0.0.1:8000` — **إلزامي لتوكيل `/api` في `npm run dev`** (يعكس rewrites vercel.json في الإنتاج — بدنه ترد نداءات الواجهة 404) |
| `NEXT_PUBLIC_DOMAIN` | نطاق الموقع العام (`https://bot.smart-link.ly`) — يُستخدم في metadata/sitemap/robots |

> `NEXT_PUBLIC_API_HOST` و`NEXT_PUBLIC_SITE_URL` كانا موثقين سابقاً **ولا يقرؤهما الكود إطلاقاً** (التوكيل من نفس الأصل عبر rewrites) — حُذفا من التوثيق في v14. أي متغير «مضيف API» في الواجهة غير ضروري أصلاً.

### متغيرات تلقائية / داخلية (لا تضبطها يدوياً)

- `VERCEL` · `VERCEL_ENV` — يضبطهما Vercel تلقائياً (يُستخدمان لاكتشاف بيئة الإنتاج/المعاينة).
- `NEON_PROJECT_ID` — تلقائي من Vercel (وسيلة اكتشاف Neon لفرض SSL).
- `ENV` — fallback عام لوسم البيئة في الرصد عند غياب `SENTRY_ENVIRONMENT`/`VERCEL_ENV`.
- `SMARTBOT_TEST_POOL` — **داخلي للاختبارات فقط** (جسر SQLite المشترك) — لا معنى له في التشغيل.

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
