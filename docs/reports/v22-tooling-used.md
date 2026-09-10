# v22 — الأدوات المستخدمة/المدروسة (GitHub OSS Research)

> ملف مشترك لكل المجالات (خطة v22 §3): كل وكيل يوثّق أدوات/مستودعات OSS ناضجة دَرسها أو تبنّاها لمجاله عبر GitHub Search API.
> الصيغة: المجال | الاستعلام | المستودع | النجوم | القرار (تبنّي/رفض/مؤجل) والسبب.

| المجال | استعلام البحث | المستودع | ★ | القرار |
|--------|----------------|----------|---|--------|
| D1 auth (FIX-A) | `fastapi jwt blacklist`, `jwt token blacklist revocation`, `fastapi jti blacklist redis` | نتائج البحث السائدة (كل النتائج العليا: revocation عبر jti + Redis) | — | **دُرس/مطابق للتصميم**: قائمتنا السوداء jti+PG تتبع نفس النمط الوظيفي؛ لا Redis في المنظومة serverless — الجدول كافٍ للحجم الحالي (تنظيف عند exp موصى به تشغيليًا) |
| D1 auth (FIX-A) | `asyncpg aware datetime timestamp without time zone` (issue search) | نمط إصلاح PRs مثل `google/adk-python#4388` (TIMESTAMP WITH TIME ZONE لـPG) وPRs «BUG-TZ-NAIVE» | — | **رُفض**: عقد المستودع naive-UTC في كل الأعمدة (`_utils.utcnow`, `_parse_fb_time` v21) — ترحيل عمود واحد يكسر الاتساق؛ التطبيع في الكود (`.replace(tzinfo=None)`) هو النمط المتّبع والمُختبر |
| D1 auth (FIX-A) | `fastapi limiter rate` | `laurentS/slowapi` / `long2ice/fastapi-limiter` | 2056 / 790 | **مؤجل**: مرتبط بتوصية S-3 (تقوية حد الدخول 5/15د لكل IP + قفل لكل حساب) — خارج نطاق FIX-A، مرشّحان لموجة تحسين لاحقة |
