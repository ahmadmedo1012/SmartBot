# تقرير عزل المستأجرين وإسناد البيانات (Tenancy) — v22 (FIX-D 2218ec70 + الأدلة الحية)

- **Task ID:** FIX-D (إصلاح موجات الإصلاح) → W2-FIN (تجميع التقرير + تحقق حي)
- **التشخيص المصدر:** W1-D2 §5.1 (BotLog بلا tenant: 302/304 صفًا في t0) + W1-D9 F3/F4 (analytics_events بلا tenant + نشاط فارغ لكل مستأجر)
- **الإصلاح:** commit **`2218ec70`** — `fix(v22-D9/F4): tenant attribution — BotLog TenantBoundLogger + bot_engine plumbing + analytics_events tenant` — **مُنشر على الإنتاج**
- **الاختبارات:** `tests/test_v22_tenancy_attribution.py`
- **التحقق الحي (W2-FIN، SELECT 2026-09-10 ~14:40 UTC):** أدلة §3.

---

## 1) المشكلة (قبل الإصلاح)

قاعدة متعددة المستأجرين (16+ مستأجرًا حيًا) كانت تخزن بيانات **مملوكة للمستأجر** بلا إسناد:
- `monitor.py` (كاتب دفعة BotLog) يبني الصفوف `{level, message}` فقط → `BotLog.tenant_id` = 0 افتراضيًا → **«النشاط الأخير» في لوحة كل مستأجر فارغ للأبد** بينما الدورة تعمل وتسجل مئات الأحداث يوميًا؛ `engine._add_log` نفس الفئة؛
- مواقع `publisher_routes.py` (3) و`app/webhooks.py` تستدعي `_track_event` بلا `tenant_id` (الويبهوك يضعه في metadata لا العمود) → أحداث analytics_events كاملة في t0 → أي تحليل لاحق لكل مستأجر ناقص.

## 2) الإصلاح (2218ec70)

- `monitor.py`: `bind_tenant()` + غلاف **`TenantBoundLogger`** — كل صف BotLog يحمل مستأجر المحرك الذي أصدره؛
- **bot_engine plumbing**: معرّف المستأجر يُحمل عبر deps → engine → pipeline (لا استنتاج لاحق من الرسائل)؛
- `publisher_routes` (3 مواقع) + `app/webhooks` تمرر `tenant_id` صريحًا إلى `_track_event` (كما تفعل المواقع العشرة الأخرى الموجودة أصلًا).

## 3) الأدلة الحية (SELECT، آخر 6 ساعات قبل 14:40 UTC)

```
bot_logs:         tenant_id=23 → 21 صفًا · tenant_id=25 → 9 صفوف          ← عزو يعمل (دورة t23 + دورة t25)
                 tenant_id=0  → 80 صفًا (تراث ما قبل النشر + أحداث غير مملوكة)
analytics_events: tenant_id=23 → 2 صفوف مُعزولة · tenant_id=0 → 1
```
(مقابل الحالة قبل الإصلاح: t23 = **صفر** صفوف من 302.) لوحة «النشاط الأخير» تُعرض الآن من صفوف المستأجر الحقيقي.

**النتيجة:** **PASS** — الإسناد منصرف في الإنتاج؛ حد الفصل (العزل) نفسه لم يتغير (كل استعلامات القراءة كانت تحصر tenant_id من قبل — العلة كانت في الكُتّاب لا القرّاء).

## 4) عزل المستأجرين عبر المجالات (خلاصة الحدود الحية من موجة التشخيص)

| الحد | الدليل | النتيجة |
|---|---|---|
| عزل قواعد الرد (قاعدة مستأجر آخر → 404) | W1-D3 §2 #13 | PASS |
| عزل الدفعات (SSE/حالة/إيصال/قائمة أدمن بنطاق الطالب) | W1-D5 | PASS |
| عزل تذاكر الدعم + 404 لمسارات المنصة عبر مسارات المستأجر | W1-D10 | PASS |
| حصر fallback بيانات فيسبوك العامة بمساحة الإقلاع tenant 0 (كان يعرض صفحة المالك لكل مستأجر) | FIX-E c6d10816 (تقرير v22-analytics §2) | PASS |
| حصر طوابير المنصة بمسؤول المنصة (38×403) | W1-D6 | PASS |
| same-page double-binding: فهرس فريد جزئي uq_botstate_key_value + 409 عند الربط | W1-D2 §6 | PASS (t22 نصف ربط خامل — مرشح تنظيف عبر مسار فصل الربط) |

## 5) حدود الانحدار

- `tests/test_v22_tenancy_attribution.py` + `test_tenant_isolation` + كل سويتات المجال — خضراء؛ الكامل بعد W2-FIN: **1014 passed / 0 failed**.

## 6) أدوات OSS

- استُعرضت أنماط multi-tenant logging (contextvars/tenant-bound loggers كما في أنظمة SaaS مفتوحة) — التنفيذ الداخلي (TenantBoundLogger) يكفي ويحفظ الواجهة القائمة للكُتّاب.
- سجل: `docs/reports/v22-tooling-used.md`.
