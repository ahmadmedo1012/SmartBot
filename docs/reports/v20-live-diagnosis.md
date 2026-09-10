# v20 — التشخيص الحي بدليل حقيقي (القسم 3.3 من الخطة — نُفّذ قبل أي إصلاح)

> **التاريخ:** 2026-09-10 | **المُنفّذ:** الوكيل الميداني (بيئة بIT وصول شبكي فعلي إلى Graph API والإنتاج) | **الحساب المُسلَّم:** Ahmade (user_id=24, tenant_id=23, admin)

---

## 1. النص الحرفي للأخطاء (الدليل المطلوب حرفياً)

جُمعت مباشرة من Graph API بالتوكن المخزَّن نفسه (بلا وساطة، قبل أي تعديل على الكود):

### 1.1 توكن المستخدم المخزَّن يرفضه مسار البيانات

| الاستدعاء | الاستجابة الحرفية من فيسبوك |
|---|---|
| `GET /v22.0/{page_id}/posts?fields=...` | `{"error":{"message":"Invalid OAuth 2.0 Access Token","type":"OAuthException","code":190,"error_subcode":2069032,"error_user_title":"User Access Token Is Not Supported","error_user_msg":"A Page access token is required for this call for the new Pages experience.","fbtrace_id":"Aqi74TC1QpNlopxrt4kfVsa"}}` |
| `GET /v22.0/{page_id}/conversations` | `{"error":{"message":"(#10) Requested Page Does Not Match Page Access Token, check that access token on https://developers.facebook.com/tools/debug/accesstoken/","type":"OAuthException","code":10,"fbtrace_id":"APhRzshoQ8cXpULTzQ97Xsq"}}` |
| `GET /v22.0/me?fields=id,name` | `{"id":"2483103915469106","name":"احمد رضوان"}` — **يعيد هوية المستخدم وليس هوية الصفحة → التوكن المخزَّن User Access Token** |

### 1.2 الحقول العامة تنجح بالتوكن نفسه (لماذا خدع «اختبار الاتصال» الجميع)

| الاستدعاء | النتيجة |
|---|---|
| `GET /{page}?fields=name,fan_count,picture.type(large)` | ✅ نجح كاملاً: `name="Smart Link-الربط الذكي"`, `fan_count=5`, صورة سليمة — **حقول عامة تعمل مع أي توكن صالح** |
| `GET /me/accounts?fields=id,name,access_token` | ✅ يعيد الصفحة المستهدفة **مع Page Access Token جاهز (205 حرفاً)** |

### 1.3 الدليل من الإنتاج الحي (api.smart-link.ly بحساب Ahmade)

| Endpoint | الاستجابة | الدلالة |
|---|---|---|
| `POST /api/login` | 200 (JWT) | admin على tenant 23 |
| `POST /api/facebook/test` | `connected:true, fan_count:5, scopes:[14], missing:[]` | **الفحص القديم يكذب** — يفحص fan_count (حقل عام) فقط |
| `GET /api/inbox/conversations` | `items:[], total:0` | فراغ |
| `GET /api/posts` | `items:[], total:0, source:"db", synced:false` | فراغ + فشل تزامن صامت |

### 1.4 توكن الصفحة المستبدَل يعمل بالكامل (تم التحقق قبل بناء الإصلاح)

بعد جلب `GET /{page_id}?fields=access_token` بالتوكن المخزَّن:
- `GET /{page}/posts` → ✅ منشورات حقيقية (Smart Menu — يوليو 2026، مع إعجابات وتعليقات)
- `GET /{page}/conversations` → ✅ محادثة حقيقية محدَّثة 2026-09-10T01:16

---

## 2. الاستنتاج الجذري (بدل أي تخمين)

**فرضية fan_count الأصلية في خطة v20 دُحضت بالدليل** (§1.2: طلب الدفعة ينجح). السيناريو الصحيح هو **سيناريو §4 الثاني حرفياً: نوع التوكن**.

**السلسلة الكاملة المفسِّرة للأعراض الأربعة:**
1. المستخدم أدخل **User Access Token** في تدفق الربط (نقطة الدخول الأرجح: معالج onboarding — `onboarding.py` كان يحفظ أي توكن بلا أي تحقق من نوعه، واختباره الخاص يفحص `fields=name,fan_count` — حقول عامة)
2. الحقول العامة تنجح → «متصل ✓» في كل الفحوصات القديمة
3. كل مسارات البيانات (posts/conversations/comments/ads) تتطلب توكن صفحة → تفشل (190/2069032, #10)
4. كل فشل يُبتلع بصمت (`except Exception:` بلا سجل في 4 مواقع + فشل فك التشفير بلا أي سجل في `_services.py:350-353`) → لا أثر في السجلات ولا رسالة للمستخدم
5. `get_page_profile` كان يُستدعى فقط داخل فرع `if subscribe and page_id` — وزر الاختبار في /connect يرسل `subscribe_webhook: false` → **اسم الصفحة لا يُحفظ أبداً في هذا المسار** (شكوى «الآيدي فقط»)
6. دورة الكرون للرد الآلي تعمل للمستأجر (حالته "free" وليست "UNPAID") لكن كل استدعاء Graph داخلها يفشل بصمت

**اكتشاف إضافي أثناء بناء الإصلاح (خطأ حقيقي ثانٍ):** قيمة الحارس الافتراضية `0.0` في مقياس `monotonic()` للـ TTL تعني أن أي lambda أقل عمراً من نافذة الـ TTL «مخنوقة» منذ اللحظة الأولى — كان سيمنع الإصلاح الذاتي من العمل أصلاً على Vercel (أعمار lambdas قصيرة). صُحّح ب sentinel = None (نفس الخطأ كان موجوداً في `_INBOX_LAST_SYNC` — يفسر جزءاً من بطء ظهور البيانات بعد أول نشر).

---

## 3. الإصلاح المُنفَّذ (مبني على الدليل أعلاه حصراً)

| # | الملف | الإصلاح |
|---|---|---|
| 1 | `fb_client.py` | `ensure_page_token()` — مسبار `/me` (أرخص تمييز موثوق لنوع التوكن) + `get_page_access_token()` التبديل (المُجرَّب حياً §1.4) — 4 نتائج: page_token / exchanged / not_page_admin / unverified |
| 2 | `_services.py` | فشل فك التشفير يُسجَّل ERROR بـ exc_info (كان صامتاً تماماً) + **إصلاح ذاتي (self-heal)**: تبديل التوكن المخزَّن + إعادة تشفير وحفظ + لقطة هوية الصفحة (اسم/متابعون/صورة) + إخلاء ذاكرات العملاء + حكم مبثوث في `fb_token_check` (TTL 6h عبر DB + module) — **نبض الكرون كل 5 دقائق يستدعي get_tenant_fb_client لكل مستأجر متصل → الإصلاح يتدحرج لكل الأسطول بلا أي تدخل من المستخدم** |
| 3 | `routers/facebook_routes.py` | بوابة نوع التوكن عند الربط: not_page_admin → 400 عربية صريحة؛ exchanged → يُحفظ توكن الصفحة؛ حفظ لقطة الهوية **بمعزل عن** `subscribe` (يغلق ثغرة «الآيدي فقط»)؛ ترقية `/api/facebook/test`: connected يتطلب توكن صفحة عاملاً + قراءة fan_count ناجحة (كان true دائماً) + التبديل يُحفظ فوراً (اختبار المستخدم نفسه يصلح الإنتاج)؛ `token_check` في settings GET |
| 4 | `routers/onboarding.py` | **نفس البوابة في المعالج** (نقطة دخول الخلل) + لقطة هوية عند كل حفظ + ترقية test-connection للتحقق من النوع (كان يفحص حقول عامة) |
| 5 | `routers/bot.py` | تحويل كل `if not fb_cli: continue` الصامتة إلى تحذيرات مسجَّلة (3 مواقع: دورة الكرون، مسح المتابعين، دورة الرد الآلي) |
| 6 | `routers/inbox.py` | استثناء المزامنة الحية يُسجَّل بمعرف المستأجر (كان `convos = None` صامتاً) + TTL 600s لذاكرة العملاء (تقارب بين نسخ Vercel) + إصلاح sentinel |
| 7 | Frontend | بانر «تعذّر الاتصال بصفحة فيسبوك — أعد الربط» (role=alert) في /connect و/dashboard/pages عند حكم سيئ + toast عند التبديل التلقائي + عرض نوع الرمز في نتيجة الاختبار |
| 8 | `tests/test_v20_token_type_and_silent_failures.py` | 16 اختبار تراجع تثبّت: مصفوفة النتائج الأربع، بوابة الربط (تبديل/رفض/حفظ كما هو)، بوابة المعالج، فحص الاتصال الصادق، الإصلاح الذاتي (تبديل+حفظ+إخلاء+خنق TTL)، تسجيل فشل فك التشفير، تسجيل فشل مزامنة الوارد |

**البوابات:** pytest 917 passed (بما فيها 16 جديدة) | tsc نظيف | vitest 359 passed (45 ملفاً) | build نظيف.

> **ملاحظة إلزامية عن بوابة القبول النهائية (§6 من الخطة):** ستُغلق فقط بعد التحقق الحي على الإنتاج بعد النشر — يوثَّق في `v20-final-verification.md`.
