# SmartBot v25 — التقرير الهندسي النهائي (Deep Audit → Fix → Verify → Harden)

> **التاريخ:** 2026-09-11 | **الجولة:** v25 (جولة التدقيق الشامل) | **المنهجية:** 5 وكلاء تدقيق متوازيين (Backend/API · Web · Mobile · Security · DB) + تنفيذ موجتين إصلاح + تحقق حي من الإنتاج.
> **الالتزام المنهجي:** لا اعتماد على تقارير الوكلاء السابقين — كل بند حُقق من المصدر (كود + اختبارات + بناء + سلوك حي). فصل صريح بين CODE COMPLETE / TEST COMPLETE / BUILD COMPLETE / DEPLOYMENT COMPLETE / REAL DEVICE VERIFIED.

---

## 1. EXECUTIVE SUMMARY

**الحالة السابقة (قبل الجولة):**
- آخر commit: `b1421091` «docs(mobile): final report — all phases complete» — تقرير سابق يعلن اكتمال الموبايل. **الحقيقة بعد التدقيق المباشر: 6 شاشات موبايل كانت ستنهار فور أول تحميل بيانات حقيقية** (انحراف عقد الاستجابة)، و4 تدفقات مالية/إنشاء كانت ميتة، وتسجيل الخروج لم يكن يُبطل التوكن فعليًا.
- الـBackend قوي بنيويًا (24 جولة تحصين سابقة صمدت) لكن بها ثغرة IDOR حقيقية عبر المستأجرين، وأصل عطل «AI multi-agent غير فعّال»، ونافذة فوترة مفقودة عند سباق التكرار.
- الويب جيد لكن به إرسال جماعي بلمسة واحدة (خطر مالي/سمعة) و5 صفحات بلا ترقيم.
- **سرّان حيّان تاريخيًا في git blob عام** (Neon URL + SECRET_KEY).

**المشاكل الرئيسية المكتشفة:** 60+ نتيجة موثقة بملف:سطر ودليل كود (B-* backend، W-* web، M-* mobile، S-* security، D-* database) — كاملة في `docs/reports/v25-deep-audit-diagnosis.md`.

**ما تم إصلاحه (موجتان):**
- **Mobile:** 6 شاشات الانهيار (unwrap العقد)، إبطال التوكن عند الخروج + مسح ذاكرة الاستعلامات، إعادة خرائط Analytics، إحياء 4 تدفقات (broadcast/subscribe/topup/scheduled)، 5 انحرافات حقول، UX (debounce/تمرير/لوحات مفاتيل/أهداف 44px)، EAS dev→localhost.
- **Web:** حوار تأكيد + معاينة جمهور للإرسال الجماعي، تأكيد بلمستين لكل حذف/نشر، ترقيم 5 صفحات، إنشاء sequences ينجو من الفشل الجزئي، أهداف لمس 44px، توحيد useMe، بوابة /connect.
- **Backend:** IDOR sequences، مسار مفاتيح AI (السبب الجذري)، حماية الدفع المزدوج عبر instances، إلغاء الدفع للمالك فقط، موافقة صادقة، 6 إخفاقات صامتة مرئية الآن، عدّاد reply_count وأحكام العروض، عدّادات ذرية، أحداث analytics بـtenant.
- **Security (تحقق حي):** المفتاح المسرب يوقّع توكن **يرفضه الإنتاج (401)**؛ كلمة مرور Neon المسربة **مرفوضة** — كلاهما غير فعّال الآن.

**الحالة الحالية:** Web + Backend منشورة في الإنتاج وتخدم commit الجديد (تحقق `/api/version` + heartbeat 200) — **كل بوابات الجودة خضراء**: 1112 اختبار pytest، tsc صفر أخطاء، 416+38 اختبار vitest (ويب+موبايل)، بناء إنتاج نظيف (43 صفحة)، حزمة 186.6KB≤190KB، a11y/i18n/contrast/secret-scan نظيفة، مسحا Playwright (a11y: كل الصفحات نظيفة؛ viewport: صفر تجاوز أفقي 375/768/1440).

---

## 2. ARCHITECTURE

| الطبقة | البنية | التقييم بعد الجولة |
|---|---|---|
| **Web** | Next.js 16 App Router (fb_dashboard/frontend) — RTL عربية، JWT cookie، React Query، shadcn-style | سليمة؛ كل الصفحات client-components عن قصد (JWT+FastAPI يمنعان RSC) مع تعويضات أداء موثقة |
| **Backend** | FastAPI (fb_dashboard) عبر api/index.py → Vercel serverless؛ 38 راوتر؛ غلاف {success,data}؛ عزل tenant_id | سليمة ومحصّنة؛ مسارات الأموال بمطالبات `UPDATE...WHERE RETURNING` ذرية |
| **Database** | SQLAlchemy 2 async، Neon PG (إنتاج) / SQLite (اختبار)، create_all+reconcile+alembic 001-017 عند الإقلاع | متقاربة جدًا مع النماذج؛ الفجوة المتبقية: FK CASCADE غير موجودة على القاعدة القديمة (D-05) |
| **Integration** | توكيل /api عبر rewrites؛ middleware مصادقة على الواجهتين؛ موبايل Bearer عبر /api/auth/token | متسقة — عقد الموبايل أُصلح ليطابق الـbackend حرفيًا (لا تغيير backend) |
| **Deployment** | مشروعان Vercel (smart-bot-api + smartbot-frontend)؛ push main → ترقية إنتاج تلقائية **مؤكدة حيًا** | خط النشر يعمل بمبدأ one-push مع بوابة تحقق إصدار |

---

## 3. ISSUES FOUND → FIXED (أهم النتائج)

| ID | Severity | المجال | المشكلة | الجذر | الإصلاح | التحقق |
|---|---|---|---|---|---|---|
| S-01 | CRITICAL | Git/Security | سرّان في blob عام `2e6a618a` | .env قديم لم يُنقَّ التاريخ | (تحقق حي) + توثيق بروتوكول التطهير | **توكن بالمفتاح القديم → 401؛ كلمة مرور Neon → مرفوضة. غير فعّالين.** |
| M-01..06 | CRITICAL | Mobile | 6 شاشات تنهار (تعليقات/إعلانات/جمهور/عملاء/تسويق/دعم) | توقّع مصفوفة؛ الـbackend يرجع `{items}` | `src/lib/envelope.ts` + إصلاح كل شاشة | typecheck + 38 vitest + إصلاح ميداني لكل شاشة |
| M-07 | HIGH | Mobile/Auth | الخروج لا يُبطل jti (بلا Bearer) | مسح التوكن قبل الاستدعاء | الاستدعاء أولًا ثم المسح | اختبار وحدة (api.test.ts pattern) |
| B-01 | HIGH | Backend/IDOR | subscribe/unsubscribe عبر المستأجرين | لا فحص ملكية | فحص المشترك+التسلسل قبل أي كتابة | **اختبار انحدار جديد (2)** |
| B-02 | HIGH | Backend/AI | مفاتيح DB لا تصل للوكيل متعدد العقول | singleton `agent_brain._ai` لا يُبطَل | refresh يُبطله + المسار يستدعيه + get_ai() | **اختبار انحدار جديد + حي: ai_available=true, provider=openai** |
| D-03 | HIGH | Backend/فوترة | عدّاد الاستخدام يُتراجع مع dedup | معاملة واحدة للعدّاد والرد | معاملة محاسبة مستقلة عبر درزة المحرك | 1112 pytest (شاملة اختبارات الأموال) |
| B-03/D-08 | HIGH | المدفوعات | دفع معلق مزدوج عبر instances → 500 | IntegrityError غير معالج | catch → 400 ودّية | كود + اختبارات القيود الموجودة |
| B-11 | HIGH | المدفوعات | viewer يُلغي دفعة المالك | عزل «أو نفس المستأجر» | المالك فقط | **اختبار انحدار جديد** |
| D-01 | HIGH | DB/منطق | reply_count لا يُكتب أبدًا | لا كاتب | UPDATE ذري لكل رد | **اختبار انحدار جديد** |
| D-02 | HIGH | DB/منطق | عروض منتهية/مستنفدة تُسلَّم للأبد | لا فلترة صلاحية/سعة | فلترة SQL + bump ذري | **اختبار انحدار جديد** |
| W-01/02 | HIGH | Web/سلامة | إرسال جماعي وحذف بلمسة واحدة | غياب معيار v24-C2 هنا | حوار تأكيد + معاينة جمهور | tsc + vitest (416) + بناء |
| M-09..14 | HIGH | Mobile | Analytics فارغة + 4 تدفقات ميتة | مفاتيح/معاملات خاطئة | إعادة خرائط + Form-encoded | typecheck + vitest |
| B-20 | MEDIUM | المدفوعات | verified دون تفعيل + إشعار كاذب | حراس صامتون | log.critical + إشعار صادق + علم activated | كود + اختبارات الموافقات |
| B-04/05/06/16 | MEDIUM | Backend | إخفاقات صامتة (`except:pass`) | نمط تاريخي | تسجيل + سطح خطأ | مراجعة كود + pytest |
| D-04/D-07 | MEDIUM | DB | عدّادات غير ذرية + أحداث بلا tenant | ORM attr-math | UPDATE ذري + tenant_id | pytest |
| B-09 | MEDIUM | Backend | PUT تفضيلات وهمي (لا يخزّن) | endpoint نائب | تخزين NotificationPreference | **اختبار انحدار جديد** |
| W-05..09 | MEDIUM | Web | لا ترقيم/أهداف<44px/إنشاء غير ذري | دَين تدريجي | pager + load-more + size-11 + تحرير بعد فشل جزئي | tsc/vitest/بناء |
| S-03 | MEDIUM | Git | 14 ملف e2e artifacts متتبعة | أنماط gitignore خاطئة | تصحيح المسار + إلغاء تتبع | `git ls-files` صفر |
| M-28 | MEDIUM | Mobile/Build | بناءات dev تشير للإنتاج | غياب فصل بيئات | EAS dev/preview→localhost | مراجعة eas.json |

**مُغلقة كليًا:** S-01(تحقق حي)، M-01..M-23(الجوهرية)، B-01..B-06، B-08*، B-09، B-11، B-16، B-20، D-01..D-08، W-01..W-12(الجوهرية). *انظر القسم 11.

---

## 4. WEB

- **Bugs أُصلحت:** إرسال تسويقي بلا تأكيد (W-01)، حذف/نشر بلمسة واحدة (W-02/03/04)، جمهور=10 فقط بلا pager (W-05)، تعليقات=30 فقط (W-06)، عملاء/إشعارات/منشورات بلا ترقيم (W-07)، إنشاء sequences غير ذري يُكرر الحملات عند إعادة المحاولة (W-08)، /api/me مكرر (W-10)، /connect غير محمي (W-12)، أولوية نص حر (W-13).
- **الانحدار:** صفر — 416 vitest ناجحة (ارتفعت من 304)، البناء نظيف، مسحا a11y/viewport نظيفة.
- **الأداء:** `usePollingWhenVisible` في 7 صفحات، keepPreviousData في الترقيم، محدد nav مستقر.

## 5. MOBILE

- **Bugs أُصلحت:** 6 شاشات crash، خروج بلا إبطال، ذاكرة استعلام غير ممسوحة (تسريب بين المستخدمين)، Analytics فارغة، broadcast/subscribe/topup/scheduled/calendar ميتة، تقارير PDF وهمية، مفاتيح خاطئة في activity/billing/tools/comments/dashboard، بحث بلا debounce، thread لا يتمرر للنهاية، 7 لوحات بلا KeyboardAvoidingView، onboarding redirect وهمي، `as never` casts.
- **UX:** 48px أهداف، خطوط Cairo/Readex محلية، RTL صحيح.
- **API/العقد:** كل نداء يطابق الـbackend (تحقق ملف-بملف من 38 راوتر).
- **Build status:** typecheck ✅ · vitest 38/38 ✅ · expo lint ✅ · **EAS build لم يُشغَّل في هذه البيئة** (يتطلب بناء سحابي/أجهزة).

## 6. WEB ↔ MOBILE PARITY

- **المشكلة الجذرية:** الموبايل بُني على «عقود مفترضة» لا العقود الفعلية — أصل كل الانهيارات. أُصلحت بتكييف الموبايل حرفيًا مع الـbackend (لم يُلمس الـbackend).
- **التوافق الآن:** نفس نقاط النهاية، نفس معاملاتها، نفس تفسيرها للحالات؛ سلوك الإرسال الجماعي الآن متطلب تأكيد على الويب (الموبايل يعرض الحملات ويلغيها — لا إرسال جماعي من الموبايل أصلًا).
- **متبقٍ مستندي:** تكرار منطق عرض/تحويل نصوص JS (format helpers) بين الواجهتين — مقبول مؤقتًا (مستويان مختلفان)، موثق.

## 7. SECURITY

- **أُصلحت:** IDOR sequences (B-01)، إلغاء دفع متعدد الصلاحيات (B-11)، صمت analyze-image (B-04).
- **تحقق حي (S-01):** التوكن الموقّع بالمفتاح المسرب → **401 من الإنتاج**؛ كلمة مرور Neon المسربة → **مرفوضة**. **كلا السرين غير فعّال.** التدوير موثق في `decisions-ledger.md` (dec-git-history-secrets).
- **المخاطر المتبقية (مقيّدة):** blob التاريخ عام (تطهير `git filter-repo` توصية نظافة — ليس ثغرة نشطة)؛ CSRF اختياري للعملاء بلا كوكي (B-18، موثق)؛ SSRF TOCTOU ضيق في جلب الإيصالات (B-08/S-08، حراسة DNS موجودة)؛ سياسة كلمات مرور طول-فقط (S-06).
- **ممنوع إضعافه:** لم يُضعف أي ضابط أمني — كل الإصلاحات تشدد.

## 8. PERFORMANCE

- **أُصلح:** عدّاد rate-limit لكل طلب تغيير (بقي — B-08 أدنى أولوية الآن بعد تحقق latency مقبول)، طلبات /api/me المكررة (W-10)، بحث الموبايل لكل ضغطة (M-20)، ترحيل polling (W-14)، معاملات المحاسبة المعزولة.
- **متبقٍ (موثق بلا انحدار):** N+1 tags (D-09)، broadcast fan-out 2N+1 (D-10)، inbox search بعد LIMIT (D-12)، N+1 sequences list (W-11).

## 9. TESTING

| البوابة | النتيجة |
|---|---|
| TypeScript (web) | **0 أخطاء** (tsc --noEmit) |
| TypeScript (mobile) | **0 أخطاء** |
| ESLint (mobile expo) | **0 أخطاء، 0 تحذيرات** |
| ruff (backend) | **نظيف** |
| pytest (backend) | **1112/1112 ناجحة** (1105 أساس + 7 انحدار v25) |
| vitest (web) | **416/416** (51 ملفًا) |
| vitest (mobile) | **38/38** (envelope 10 جديدة) |
| Build (Next.js) | **نجاح — 43/43 صفحة**؛ حزمة 186.6KB gz ≤ 190KB |
| Playwright a11y-sweep | **كل الصفحات نظيفة** (تشغيل محلي بعد تثبيت chromium) |
| Playwright viewport-sweep | **صفر تجاوز أفقي — 375/768/1440 × 7 صفحات** |
| secret-scan (NFKC) | **نظيف** |
| بوابات i18n/a11y-labels/contrast/css-tokens | **نظيفة** |
| gate_all.sh الكامل | **ALL GATES GREEN — READY** (خروج 0) |
| Expo Doctor | لم يُشغَّل (يتطلب بيئة EAS) |
| E2E (Playwright specs) | لم تُشغَّل بالكامل في هذه البيئة — المسحان الشاملان (a11y/viewport) شُغّلا بنجاح |

## 10. DEPLOYMENT

| السطح | الحالة |
|---|---|
| Backend (api.smart-link.ly) | **منشور وحي**: `/api/version` = `a6d60247` (آخر push)؛ heartbeat = **200** (3 دورات، صفر أخطاء، غير متقادم) |
| Web (bot.smart-link.ly) | **منشور وحي**: HTTP 200 |
| الترقية التلقائية | **مؤكدة**: push main → نشرتان بوجهة production تلقائيًا (تحقق مباشر من Vercel API) |
| Mobile (EAS) | الكود جاهز؛ **البناء السحابي لم يُشغَّل** — dev/preview أصبحت localhost (لا كتابة في إنتاج) |

## 11. REMAINING BLOCKERS (الحقيقية فقط)

1. **Mobile real-device verification** — التحقق على جهاز Android/iOS فعلي (إقلاع، لوحة مفاتيح، safe areas، أداء) لا يمكن محاكاته هنا.
2. **EAS production build** — بناء موقّع لم يُشغَّل (يتطلب طابور EAS/شهادات).
3. **D-05** — إنشاء FK CASCADE على قاعدة Neon القديمة (ترحيل NOT VALID→VALIDATE) — حتى ذلك الحين الحذف يترك أيتامًا في الإنتاج.
4. **B-08** — ضريبة اتصال DB لكل طلب تغيير في الـmiddleware (الأثر محدود، التوثيق قائم).
5. **تطهير تاريخ git** (توصية نظافة — السران غير فعّالين المتحقق حيًا).
6. **D-09/D-10/D-12/W-11** — N+1s مؤجلة (P3، لا كسر وظيفي).
7. **اختبار pytest واحد متذبذب تحت حمل CPU عالٍ** (`test_webhook_message_replay_does_not_reply_twice`) — فشل مغلق السلوك، مستقر عند التشغيل المستقل وفي التشغيلين الكاملين لهذه الجولة.

## 12. FINAL VERDICT

# **READY FOR REAL DEVICE TESTING**

**السبب:** Web + Backend + Database في **الإنتاج فعلًا ويخدمون الكود الجديد بتحقق حي كامل** (DEPLOYMENT COMPLETE + live-verified)؛ كل بوابات الجودة خضراء (TEST COMPLETE + BUILD COMPLETE). الوحدة الوحيدة التي تمنع «PRODUCTION READY» على مستوى **المنظومة الكاملة (Web+Mobile معًا)** هي الموبايل: **CODE COMPLETE + TEST COMPLETE (unit)** لكن **BUILD (EAS) و REAL DEVICE VERIFIED غير منجزين** — لا إعلان جاهزية متجر قبل جهاز حقيقي واحد على الأقل. بعد جولة جهاز حقيقية نظيفة + بناء EAS موقّع، يرقى الحكم إلى PRODUCTION READY دون تغيير كود متوقع.

---

## ملحق — تدرج الالتزامات (فصل صريح)

| الوحدة | CODE | TEST | BUILD | DEPLOY | LIVE-VERIFIED | DEVICE |
|---|---|---|---|---|---|---|
| Backend | ✅ | ✅ 1112 | ✅ (gate) | ✅ a6d60247 | ✅ version+heartbeat+FB-test | n/a |
| Web | ✅ | ✅ 416+sweeps | ✅ 43/43 | ✅ production | ✅ HTTP200+a11y+viewport | n/a (browser) |
| Mobile | ✅ | ✅ 38+lint | ⏳ EAS مطلوب | ⏳ | ⏳ API جاهز ومتحقق منه | ❌ مطلوب |
