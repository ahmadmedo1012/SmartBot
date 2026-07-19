# مراجعة المواقع الحية — مقارنة SmartBot vs Smart-Menu

## النتائج (11 وكيل، موقعين مباشرين)

### ✅ متطابق (6 نقاط)
| النقطة | الحالة |
|--------|--------|
| Header/Nav | ✅ SmartBot = Smart-Menu |
| Hero section | ✅ نفس الهيكل |
| Landing sections | ✅ Features, HowItWorks, FAQ موجودة |
| التصميم العام | ✅ glass effects، orange accent، RTL |
| /api/config | ✅ wrapped format |
| /healthz | ✅ success/data + version |

### ❌ مشاكل (6 نقاط)

| # | المشكلة | الخطورة | الوصف |
|---|--------|---------|-------|
| 1 | **/register → يعيد توجيه لـ /login** | **CRITICAL** | URL يروح لـ `/login` ويعرض landing page — لا يوجد نموذج تسجيل |
| 2 | **/subscribe → يعرض landing page** | **CRITICAL** | مسار الاشتراك ما يشتغل — يعرض الصفحة الرئيسية بدلاً من تدفق الاشتراك |
| 3 | **Pricing: 3 خطط فقط (يجب 5)** | **IMPORTANT** | SmartMenu 5 plans (Free, Basic, Premium, Pro, Enterprise). SmartBot يعرض 3 بس |
| 4 | **Login inputs بدون dir="auto"** | **MINOR** | الحقول ما فيها dir="auto" — قد يسبب مشاكل RTL للأرقام |
| 5 | **405 Console error على /** | **MINOR** | خطأ في وحدة التحكم — لا يؤثر على المستخدم |
| 6 | **/api/me حقول ناقصة** | **MINOR** | بعض الحقول可能在 Smart-Menu format لكن مو كلها |

### 🔧 الإصلاح

| المشكلة | الإصلاح |
|---------|---------|
| #1 /register redirect | SPA catch-all يعيد index.html بدلاً من صفحة register — يحتاج `register` في قائمة المسارات المقبولة بالـ catch-all |
| #2 /subscribe redirect | نفس المشكلة — catch-all يلتقط `/subscribe` ويعيد index.html |
| #3 Pricing خطط | قاعدة البيانات فيها 4 خطط فقط — يحتاج إضافة الخطة الخامسة (Pro بسعر 129) |
| #4 dir="auto" | إضافة dir="auto" لحقول login |
| #6 /api/me | إضافة حقول إضافية |
