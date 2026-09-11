# SmartBot Mobile — Progress Tracker (الذاكرة الرسمية للحالة)

> يُحدَّث بعد كل مرحلة. المصدر الوحيد للحقيقة عن حالة التنفيذ.
> الخطة الكاملة: `docs/web-to-mobile/smartbot-mobile-plan.md`

## Status Snapshot

| المرحلة | الحالة | ملاحظات |
|---|---|---|
| Audit (Full + Security) | ✅ مكتملة | evidence حقيقي في الخطة §Audit Findings |
| Migration Plan | ✅ مكتملة | docs/web-to-mobile/smartbot-mobile-plan.md |
| P0 Backend additive (Bearer + /api/auth/token) | ✅ مكتملة | pytest أمامي 1045/1045 · عكسي بلا إخفاقات جديدة · ruff نظيف |
| P1 هيكل Expo + API client + auth | ✅ مكتملة | tsc 0 أخطاء · 28/28 اختبار وحدة |
| P2 التابات الأساسية | ✅ مكتملة | Dashboard/Messages+رد/Comments+رد+إخفاء/Analytics |
| P3 شاشات Stack | ✅ مكتملة | 16 شاشة كاملة (audience…calendar) |
| P4 حالات الشاشات | ✅ مكتملة | مكونات مركزية في كل شاشة |
| P5 QA | ✅ مكتملة | expo-doctor 21/21 · vitest 28/28 · export bundle نجح |
| P6 Git & Vercel | ⬜ لم تبدأ | — |
| P7 EAS/Build | ⬜ لم تبدأ | — |
| P8 التقارير النهائية | ⬜ لم تبدأ | — |

## Completed Tasks

- Full Audit: قراءة فعلية للكود (runner, auth, middleware CSRF/CORS, config, models, routers 243 مسارًا, frontend pages/design tokens/PAGE_API_MAP).
- Security Audit: جرد env vars (server-only: SECRET_KEY/FERNET_KEY/CRON_SECRET/DB/Telegram/AI keys…) vs public (Sentry DSN by-design). لا secrets في Mobile bundle إطلاقًا.
- Live probing: API الإنتاج حي v2.2.0 (health/ready/plans/config/401/login-POST) — قِيس فعليًا.
- فحص web-to-mobile-magic-plugin: قراءة SKILL.md للأوركستراتور + audit + plan + build + parity + qa-release + scripts. سير العمل المُعتمد: Audit → Plan → (Approval ممنوح مسبقًا من المستخدم) → Build → Parity → QA/Release.

## Discovered Features (Business Logic Core)

- محرك بوت متعدد المستأجرين: ردود تلقائية على تعليقات+رسائل، قواعد priority، DM-on-comment، ذكاء اصطناعي fallback.
- Inbox محادثات ماسنجر + ردود يدوية.
- بث جماعي + حملات تسويقية + تسلسلية (claim-pattern queues).
- مجدول منشورات + تقويم محتوى.
- مدفوعات ليبية (ليبيانا/مدار/تحويل بنكي) مع موافقات Telegram + wallet + خطط 5 (Free..Enterprise 299 LYD).
- CRM/leads + مشتركون + tags + عروض + قوالب ردود.
- تقارير PDF + تحليلات (overview/daily/hourly/sentiment/top).

## Remaining Tasks

- P0..P8 كاملة (انظر الخطة §14).

## Blockers

- لا Android SDK محليًا → البناء المحلي APK غير ممكن؛ المسار: EAS Cloud (يتطلب توكن Expo صالحًا — لم يُتحقق بعد).
- لا أجهزة حقيقية في البيئة → Real-device QA على المستخدم.

## Known Limitations

- (يُملأ مع التقدم)

## Test Results

- Backend P0 (تشغيل فعلي 2026-09-11):
  - `pytest -q` (أمامي): **1045 passed, 0 failed** (خط الأساس 1038 + 7 جديدة)
  - عكسي: إخفاقاته التسعة موجودة أصلًا في main (فئة flake موثقة في CI) — اختبارات الموبايل السبعة تمر في الاتجاهين
  - `ruff check fb_dashboard api tests scripts`: All checks passed
  - ملف الاختبار الجديد: tests/test_mobile_auth_api.py (7 اختبارات: token endpoint، Bearer auth، بقاء الكوكي، أولوية الكوكي، رفض garbage، logout بالـ Bearer)

## Next Actions

1. P0: تعديلات الباكند (Bearer + /api/auth/token + logout Bearer) + اختبارات + بوابة.
2. إنشاء venv للباكند وتشغيل pytest للتأكد من web regression.
3. P1: هيكل Expo.
