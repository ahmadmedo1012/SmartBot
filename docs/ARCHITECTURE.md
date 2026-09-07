# SmartBot — المعمارية (ARCHITECTURE)

> هذا المستند يصف الكود كما هو فعلًا (v5، 2026-09-06). كل ادعاء قابل للتحقق من الملفات المذكورة. للقراءة التمهيطية: `README.md`.

## 1. نظرة عامة

منصة SaaS متعددة المستأجرين (multi-tenant): كل مستأجر = حساب مالك مربوط بصفحة فيسبوك واحدة. الفصل بين المستأجرين يتم على مستوى **كل استعلام** (`tenant_id` في WHERE) — لا يوجد عزل على مستوى قاعدة بيانات.

```
Facebook Graph API ⇄ Webhook (POST /webhook)
                        │ توقيع HMAC (X-Hub-Signature-256) — السر من SystemConfig أو env
                        ▼
              توجيه حسب entry.id (معرّف الصفحة) → حلّ المستأجر من جدول BotState
                        │
        ┌───────────────┴────────────────┐
        ▼ feed (تعليقات)                 ▼ messaging (رسائل)
  fb_dashboard/bot.py (BotEngine)   messenger_service.py
  ردّ تلقائي على التعليقات + DM     تخزين Conversation/Message + رد بقواعد نفسها
        │                                   │
        └───────────────┬───────────────────┘
                        ▼
              PostgreSQL (Neon) — كل الجداول tenant-scoped
                        ▲
  Next.js 16 (bot.smart-link.ly) ← REST /api/* → FastAPI (api.smart-link.ly)
```

## 2. الوحدات الأساسية

| الوحدة | الدور | ملاحظات حتمية |
|---|---|---|
| `runner.py` | تطبيق FastAPI: middlewares (أمن/CSRF/تسجيل)، تسجيل 25+ router، lifespan (reconcile + seed) | كل router يُسجَّل **قبل** الـ SPA catch-all |
| `bot.py` | محرك الردود: قواعد بأولويات، نافذة 24 ساعة، تبريد، dedup | مثيل لكل مستأجر ( `_services._bot_engines`) |
| `messenger_service.py` | خط الماسنجر: webhook → Conversation/Message → مطابقة قواعد → رد | إعادة تسليم FB تُتخطى (dedup بـ mid) |
| `routers/*` | 25+ ملف مسارات | **العقد**: كل نقطة ترجع `{"success": bool, "data": …}` عبر `_responses.ok()/fail()` |
| `models.py` | ~40 نموذج SQLAlchemy، كلها تحمل `tenant_id` (عدا جداول المنصة) | الفهارات الساخنة: انظر migration 010 |
| `database.py` | المحرك: NullPool لـ Neon (serverless)، StaticPool للاختبار | TLS بتحقق كامل من الشهادة |
| `config.py` | pydantic-settings + fail-fast إنتاجي (SECRET_KEY/CRON_SECRET/FERNET_KEY) | `DEBUG=True` يرخي الفحوص للتطوير فقط |
| `frontend/` | Next.js 16 App Router، RTL عربية، توكنز Smart-Menu (Readex Pro) | اتصال عبر `apiFetch` يفكّ `data` تلقائيًا |

## 3. القرارات المعمارية الكبرى (ولماذا)

1. **DB-first للتعليقات/الرسائل** (v4 G1): الويبهوك يخزّن أولًا؛ الواجهة تقرأ من القاعدة. حذف التبعية على استدعاء Graph حي في كل طلب عرض.
2. **توكن المستأجر في BotState** (v3): كل عملية Graph تتم بعميل المستأجر — التوكن العالمي لا يظهر في أي مسار بيانات (أصل «كل شيء أصفار»).
3. **heartbeat cron واحد** (v4): `/api/cron/heartbeat?token=` ينفّذ: النشر المجدول المستحق + تحديث fan_count + دورة بوت واحدة — idempotent، آمن للتكرار (خطة Hobby: كرون يومي داخلي + نبض خارجي كل 5 دقائق).
4. **قاعدة اختبار محكمّة** (v5 §0): `conftest.py` **يفرض** قاعدة SQLite ملف مؤقت + StaticPool + يمسح حالة العملية العامة عند حدود الملفات — المجموعة خضراء بأي ترتيب.
5. **العزل على مستوى الاستعلام**: لا اعتماد على أي "فلتر تلقائي" — كل استعلام يذكر `tenant_id` صراحة، واختبارات `test_tenant_isolation` تغطي التسريب.
6. **عقود الاستجابة الموحّدة**: `{"success", "data"}` في كل مكان؛ `unwrapApi` في الواجهة يفكّها مرة واحدة (أصل 422s من Content-Type المزدوج).

## 4. تدفق الطلب (Request lifecycle)

```
Request → CORS (أصول إنتاج فقط) → GZip → rate-limit (mutate:IP، فشل متسامح)
        → security headers (CSP بلا unsafe-eval، HSTS…) → CSRF origin (مطابقة مضيف دقيقة)
        → request logging (rid=… ) → Router → get_current_user (JWT HS256)
        → tenant_id من current_user._tenant_id → الاستعلام (tenant WHERE) → ok()
```

الأخطاء: 422 عربي ودود (validation_handler)، 500 عام بلا تفاصيل (global_500_handler) مع traceback كامل في السجل.

## 5. النشر

- **API** (vercel.json): `api/index.py` → `app` — يشمل `fb_dashboard/**` ويستثني frontend/static/tests/docs.
- **Frontend** (`fb_dashboard/frontend/vercel.json` — التكوين الفعلي في دليل الواجهة): يبني Next ويحاكي `/api/*` إلى `api.smart-link.ly`. (v14: حُذف `vercel-frontend.json` الجذر — كان نسخة منحرفة بلا قارئ.)
- **الترحيلات**: `alembic/versions/` — كل ترحيل idempotent (حارس Inspector)، يعمل على SQLite وPostgreSQL معًا.

## 6. المخاطر المعروفة والمسارات المقصودة

- `fb_dashboard/static/` يُخدم محليًا فقط (وضع الخادم الواحد)؛ Vercel لا يستخدمه.
- خطة Hobby تمنع الكرون دون اليومي — النبض كل 5 دقائق خارجي (cron-job.org) بقرار المالك.
- `agent_*` / `facebook_engine/` وحدات متقدمة معزولة — لا يستوردها التطبيق الحي إلا كسولًا (اختبار `test_track_g` يحرس ذلك).
