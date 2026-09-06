# فهرس التوثيق — SmartBot

> خريطة كل مستند في المستودع. الترتيب: الحالي أولًا ثم التاريخي. (v5 §8 — بُعد إعادة تنظيم docs/)

## ابدأ من هنا

| المستند | ماذا يعطيك |
|---|---|
| `../README.md` | نظرة سريعة + تشغيل محلي + البوابات |
| `ARCHITECTURE.md` | المعمارية كما هي في الكود فعليًا + القرارات الكبرى وسببها |
| `getting-started.md` | دليل البدء خطوة بخطوة |
| `installation.md` | التثبيت التفصيلي ومتغيرات البيئة |
| `deployment.md` | النشر على Vercel + Neon |
| `user-guide-ar.md` | دليل المستخدم العربي (لوحة التحكم) |
| `design-system.md` | نظام التصميم (توكنز Smart-Menu، الألوان، الخطوط) |
| `z-index-scale.md` | سلّم z-index المعتمد (منع التراكب) |
| `branch-protection.md` | حماية main على GitHub (للمالك) |

## الخطط (docs/plans/) — أحدثها أولًا

| الخطة | التاريخ | الحالة |
|---|---|---|
| `../../smartbot-world-class-polish-plan-v6-2026-09-06.md` (رفعها المالك) | 2026-09-06 | **الجارية — المستوى العالمي بالقياس** (i18n موحد/إتاحة مقاسة/مراقبة/أداء بنيوي/موثوقية الكرون) |
| `smartbot-world-class-v5-plan-2026-09-06.md` | 2026-09-06 | منفّذة بالكامل (اختبارات محكمّة/تنظيم/بوابات/تغطية/أداء/مراقبة/توثيق) |
| `smartbot-radical-plan-v4-2026-09-05.md` + `smartbot-v4-functional-audit-plan-2026-09-05.md` | 2026-09-05 | منفَّذة بالكامل — انظر تقريرها |
| `world-class-launch-plan-v3-2026-09-06.md` / `smartbot-final-launch-plan-v3-2026-09-05.md` | 2026-09-05 | منفَّذة بالكامل |
| `smartbot-parity-plan-v2-2026-09-05.md` | 2026-09-05 | منفَّذة (parity v2) |
| `latest_plan.md` | 2026-09-03 | تاريخية (الخطة الأم للمسارات الثمانية) |
| `remediation-plan.md` | يوليو | تاريخية — 197 ملاحظة، جزئيًا قديمة |
| `PLAN-REBUILD-V2.md`, `smartbot-incident-recovery-roadmap.md` | أقدم | تاريخية |

## التقارير (docs/reports/) — سلسلة الأدلة

| التقرير | يغطي |
|---|---|
| `v6plus-final-report.md` | جولة v6+ (المرحلة السادسة الموسّعة): اصطياد 4 عيوب حقيقية بعد v6 — h1 فارغ في /pricing، framer ~190KB في كل صفحة عامة، recharts فوري في /demo، انفصال نسخ API — كلها مُصلحة ومقاسة قبل/بعد |
| `v6-final-report.md` | جولة v6: i18n موحد + إتاحة مقاسة + Sentry/GlitchTip + تنبيهات تليجرام + كشف الكرون + أداء بنيوي (h1 الفارغ/البطل المخفي) — جدول القبول السباعي |
| `v5-final-report.md` | جولة v5: حتمية الاختبارات + تنظيم + ruff/CI + تغطية + N+1 + المراقبة الخلفية |
| `../accessibility-audit-v6.md` + `../lighthouse-baseline-v6.md` | أدلة v6 الكاملة: تباين AA مقاس + لوحة مفاتيح + خط أساس الأداء قبل/بعد |
| `v4-final-report.md` + `v4-coordination-log.md` | جولة v4: جذور «الأصفار» الثمانية + منطق البوت + جدول الحسم بأدلة حية |
| `v3-final-launch-report.md` + `world-class-v3-delivery-report.md` | جولة v3: مطابقة Smart-Menu حرفيًا + تشغيل خط الماسنجر |
| `parity-v2-delivery-report.md` | مطابقة الواجهة v2 |
| `master-plan-2026-09-03-delivery-report.md` | الخطة الأم (المسارات الثمانية) |
| `delivery-report-smartbot-restoration.md` | استعادة المستودع |

## التدقيق (docs/audit/)

- `full-parity-audit.md` — جرد صفحة-بصفحة للمطابقة البصرية (60 مسارًا)
- `2026-07-19-live-comparison.md` — مقارنة حية مبكرة

## اللقطات المرجعية (docs/snapshots/، docs/screenshots/)

لقطات Smart-Menu المرجعية ونتائج التحقق الحي لكل جولة (HTML + PNG + نصوص).

## التاريخ (docs/history/)

خطط المراحل القديمة (تحويل/تنفيذ/مرحلة تالية…) — محفوظة للأثر فقط.
