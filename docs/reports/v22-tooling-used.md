# v22 — الأدوات المستخدمة/المدروسة (GitHub OSS Research)

> ملف مشترك لكل المجالات (خطة v22 §3): كل وكيل يوثّق أدوات/مستودعات OSS ناضجة دَرسها أو تبنّاها لمجاله عبر GitHub Search API.
> الصيغة: المجال | الاستعلام | المستودع | النجوم | القرار (تبنّي/رفض/مؤجل) والسبب.

| المجال | استعلام البحث | المستودع | ★ | القرار |
|--------|----------------|----------|---|--------|
| D1 auth (FIX-A) | `fastapi jwt blacklist`, `jwt token blacklist revocation`, `fastapi jti blacklist redis` | نتائج البحث السائدة (كل النتائج العليا: revocation عبر jti + Redis) | — | **دُرس/مطابق للتصميم**: قائمتنا السوداء jti+PG تتبع نفس النمط الوظيفي؛ لا Redis في المنظومة serverless — الجدول كافٍ للحجم الحالي (تنظيف عند exp موصى به تشغيليًا) |
| D1 auth (FIX-A) | `asyncpg aware datetime timestamp without time zone` (issue search) | نمط إصلاح PRs مثل `google/adk-python#4388` (TIMESTAMP WITH TIME ZONE لـPG) وPRs «BUG-TZ-NAIVE» | — | **رُفض**: عقد المستودع naive-UTC في كل الأعمدة (`_utils.utcnow`, `_parse_fb_time` v21) — ترحيل عمود واحد يكسر الاتساق؛ التطبيع في الكود (`.replace(tzinfo=None)`) هو النمط المتّبع والمُختبر |
| D1 auth (FIX-A) | `fastapi limiter rate` | `laurentS/slowapi` / `long2ice/fastapi-limiter` | 2056 / 790 | **مؤجل**: مرتبط بتوصية S-3 (تقوية حد الدخول 5/15د لكل IP + قفل لكل حساب) — خارج نطاق FIX-A، مرشّحان لموجة تحسين لاحقة |
| D2 facebook (W2-FIN) | `facebook graph api sdk python` | `mobolic/facebook-sdk` | 2798 | **مُدرَس/مرفوض للاستبدال**: أنماط edge/تحليل أخطاء Graph — بقي `fb_client.py` الداخلي (تدهور صادق + `_last_get_error` للتصنيف الصحي، تكامل مباشر مع عقد الأخطاء الصادقة) |
| D2 inbox (W2-FIN) | incremental thread sync / cursor patterns (مجال Messenger) | الأنماط السائدة في sync daemons (updated-marker + dedup key) | — | **مُطابَق للتصميم**: إعادة مزامنة الخيط المتقادم تعتمد علامة `updated_time`/`message_count` (فحص رخيص) + dedup بـ(tenant, fb_message_id) — نفس نمط v21 المُختبر؛ لا اعتماد خارجي |
| D7 telegram (FIX-B/W2-FIN) | `telegram bot framework escape html` | aiogram (`HtmlDecoration.quote`) + python-telegram-bot | ~9k / ~27k | **تُبنّى فكرتها**: `escape_user_text` (html.escape, quote=False) — النمط المعتمد في الإصلاح؛ البقاء على عميلنا الداخلي (webhook serverless أقل اعتمادًا) |
| D10 support (FIX-G/W2-FIN) | `customer support helpdesk open source` | `uvdesk/community-skeleton` · `zammad/zammad` · `abhinav/libredesk` | 19588 / 5904 / 2904 | **مُدرَسة/مرفوضة للاستبدال**: أنماط طابور الدعم باتجاهين + الإشعارات — التنفيذ الداخلي (route منصة + UI عربية RTL + تيليغرام + إشعارات التطبيق) متكامل مع منظومتنا |
| D9 analytics (FIX-E) | PDF engines on serverless | weasyprint / fpdf2 / (reportlab كمرشح) | — | **جزئيًا**: فحص التوفر الواسع (Exception) — نمط availability-probe المتّبع في serverless؛ reportlab مؤجّل (الحالة الصادقة + المسار المتدهور يكفيان) |
