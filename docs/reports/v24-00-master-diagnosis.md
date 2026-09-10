# SmartBot v24 — التشخيص الشامل الضخم (Master Diagnosis)

> **التاريخ:** 2026-09-11 | **الحالة:** بيئة استعادة كاملة @ commit `3a575a77` (v23) | **الوضع:** فحص ساكن كامل — لا اختبار حي (بطلب المالك)
> **التركيز المُعلن:** نسخة الهاتف (Mobile-First) + تغطية كل الجوانب بلا استثناء

---

## 1. خط الأساس (Baseline) — كلها خضراء ✅

| البوابة | النتيجة |
|---|---|
| Backend pytest | **1009 passed** (29 live deselected بطلب "لا اختبار حي") |
| Frontend vitest | **386 passed / 48 files** |
| TypeScript (`tsc --noEmit`) | **clean** |
| Ruff (backend lint) | **All checks passed** |
| Production build (Next 16) | **succeeds** — 41 routes، أكبر chunk خام 568KB (gz أقل بكثير) |

## 2. موجة الفحص — 7 وكلاء متوازيين، 7 تقارير مستقلة

| التقرير | المجال | الحصيلة |
|---|---|---|
| `v24-A1-mobile-layout.md` | تخطيط الجوال @375px (24 صفحة + مكونات) | **43 مشكلة** (1 P0 / 22 P1 / 20 P2) |
| `v24-A2-mobile-perf.md` | أداء الجوال (bundle + data-layer) | **10 مكاسب مرتبة** — الوزن سليم، المشكلة معمارية (شلالات طلبات) |
| `v24-A3-mobile-flows.md` | تدفقات UX للجوال | **24 بند إصلاح** — قشرة ممتازة، أسلاك تفاعلية ناقصة |
| `v24-B1-backend.md` | 38 راوتر + محركات | 0 critical بنائي، **3 High / 11 Medium** |
| `v24-B2-security.md` | أمن شامل | 1 Critical (تدوير مفاتيح معلّق على المالك) / 1 High / 4 Medium |
| `v24-B3-datalayer.md` | قاعدة البيانات + السباقات | **P0 تسميم جلسة** / 2 P1 / 14 فهرس ناقص |
| `v24-B4-a11y-rtl.md` | RTL + إتاحة | **الانحدار RTL محسوم 10/10** ✅ / 5 فجوات + 3 تباينات فاشلة |

## 3. الأخبار الجيدة (الأساس المتين)

- **عزل المستأجرين محكم**: فحص آلي لكل 236 موقع استعلام عبر 44 ملف راوتر — نظيف.
- **المعاملات المالية آمنة**: القِرَان الذري `UPDATE…WHERE status RETURNING` يمنع الإرسال المزدوج والحَمْل المزدوج.
- **البنية الصدَفية للجوال ممتازة أصلاً**: BottomNav + Sheet بعمق نقرتين، safe-areas، حوارات محدودة بـ`calc(100%-2rem)`، زر أساسي ≥44px.
- **Weight الـbundle سليم**: recharts/joyride مؤجلة صح، خطوط عربية self-hosted مع preload.
- **قواعد RTL v1-v15 كلها صامدة** — لا انحدار واحد.

## 4. الأخبار السيئة — قائمة العيوب المُصنّفة (المُدمجة)

### 🔴 P0 — يعطّل الوظيفة فعلياً
1. **تسميم الجلسة في دورة البوت** (`facebook_engine/pipeline.py:746-773`): سباق check-then-insert على CRM يُلتقط بلا `rollback()` → كل تعليق لاحق يفشل صامتة → **فقدان ردود**.
2. **أزرار تقرير PDF مقطوعة** (`dashboard/reports/page.tsx:190-220`): الزر الأساسي غير قابل للوصول على 375px.

### 🟠 P1 — يفسد تجربة الجوال أو يخاطر بالبيانات
3. **شلال المصادقة التسلسلي** (`AuthGuard.tsx:56-132`): كل تنقّل ينتظر spinner ثم يطلق الاستعلامات → 1-2 RTT ضائعة على 3G الليبي.
4. **زر بث بلا تأكيد** (`broadcast/page.tsx:188-197`): لمسة واحدة خاطئة = رسالة جماعية لكل المشتركين.
5. **محادثة الرسائل ليست في URL** (`messages/page.tsx:127`): التحديث يفقد الخيط، وزر رجوع أندرويد يخرج من الصفحة.
6. **عائلة zoom iOS**: 11 حقل خام <16px (تعليقات/دعم/جدولة/فواتير…) — كل تركيز = تكبير مفاجئ.
7. **صفوف حذف تفيض** (team `201-269` / sequences `702-765`): اسم مسحوق + زر إلغاء مقطوع.
8. **جولة Onboarding معطلة على الجوال** (`OnboardingTour.tsx:16-48`): كل الأهداف داخل `hidden md:block` — أوفرلاي عالق للمستأجر الجديد.
9. **خُدع عرض الرد آلي/منشورات**: حذف بلمسة أيقونة 32px واحدة بلا تأكيد.
10. **no live-region لخيط الرسائل** (`messages/page.tsx:467`): رسائل واردة لا يُعلن عنها لقارئ الشاشة.
11. **publisher tz-aware** (`publisher_routes.py:65`): تاريخ واعٍ يُخزَّن في عمود naive → DataError على Neon (نفس فئة v21).
12. **dedup العروض بالذاكرة فقط**: `OfferClaim` جدول موجود ولا يستخدمه أحد → إعادة إرسال عبر نسخ Vercel.

### 🟡 P2 — تحسينات جوهرية (الأثر المتراكم كبير)
13. التنقل بالبرمجة بدل `<Link>` في BottomNav (لا prefetch) · 14. عدم استمرار كاش react-query · 15. Sentry 178KB gz دائم التحميل · 16. `window.location.href` reloads كاملة (4 مواقع) · 17. اقتراحات AI مفتوحة لـ viewer بلا سقف تكلفة · 18. raw-body 500s (sequences/flows/calendar) · 19. 5 فهارس ساخنة ناقصة (cron claims + analytics) · 20. O(2N+1) في due-scan التتابعات · 21. 14 صفحة polling بدل bundle واحد (analytics = 6 استعلامات دورية) · 22. تحميلات static مكشوفة بدون مصادقة (H-1 أمني) · 23. تباينات فاشلة (input فاتح 1.53:1، نص التدرج 2.24:1) · 24. lock اتجاه portrait في manifest · 25. X-Forwarded-For غير معالج في 7 مواقع rate-limit · 26. رسائل غير مُجدولة الحفظ (مسودات تفقد عند التحديث) · 27. بلا virtualization لقائمة الرسائل.

### ⚪ معلّق على المالك (خارج نطاق الكود)
- **C-1 أمني**: تدوير مفاتيح Neon/SECRET_KEY/FERNET + تطهير git history — **طلب صريح سابق: "سأدوّرها لاحقاً"** → مُوثّق فقط هنا + بوابة CI جاهزة في `scripts/secret_scan.py`.

---

## 5. خطة الإصلاح الموحدة (v24-C) — 6 فرق تنفيذ متوازية

| الفريق | الملف المستهدف | النطاق (من التقاير) |
|---|---|---|
| **C1 layout-fix** | صفحات reports/team/sequences/scheduled + حقول خام | P0#2، P1#6،#7،#27 + أهداف <44px + تباينات |
| **C2 flows-fix** | messages/broadcast/autoreply/posts/onboarding | P1#4،#5،#8،#9،#26 + إخفاء BottomNav داخل خيط + منطق تقسيم الرسائل |
| **C3 perf-fix** | AuthGuard/BottomNav/QueryProvider/4 صفحات | P1#3 + P2#13،#14،#16 + placeholderData + ربط me بـreact-query |
| **C4 backend-fix** | pipeline.py/publisher_routes/sequences/users/ai | P0#1 + P1#11،#17 + P2#18 + rate-limit XFF |
| **C5 datalayer-fix** | هجرة 017 + offer_engine + sequence due-scan | P1#12 + P2#19،#20 |
| **C6 a11y-fix** | messages/globals.css/manifest/AdminSidebar/button | P1#10 + P2#23،#24 + role fixes |

**بوابة القبول لكل فريق:** الاختبارات لا تنكسر (pytest 1009 / vitest 386) + `tsc` clean + `next build` ناجح + `ruff` clean — والفحص البصري يُستبدل هنا بفحص كود + تأكيدات اختبار جديدة حيث يمكن.

**الحلقة:** جولة إصلاح → تشغيل البوابات كاملة → تقرير تحقق لكل فريق → جولة فحص ثانية للتأكد من عدم الانحدار (v24-round2) حتى اكتمال القائمة أعلاه.
