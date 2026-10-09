# الأمان | Security Policy

> سياسة إفصاح مسؤول واحدة لكل مشاريع منظومة مدارك.
> One responsible-disclosure policy for the whole Madarek ecosystem.

## النسخ المدعومة | Supported Versions

| الفرع | Branch | الحالة | Status |
|---|---|---|---|
| `main` | `main` | ✅ مدعوم | supported |

## الإبلاغ عن ثغرة | Reporting a Vulnerability

**عربي —** لا تفتح Issue عامًا للثغرات الأمنية أبدًا. أرسل التفاصيل **بشكل خاص** إلى
`ahmadmedo1012@gmail.com` (المشرف: أحمد مدو)، أو عبر خاصية «الإبلاغ الخاص عن الثغرات»
(Private vulnerability reporting) في إعدادات المستودع فور تفعيلها. أرفق وصفًا للثغرة،
خطوات إعادة الإنتاج، والأثر المتوقع. زمن الرد المستهدف: ٧٢ ساعة.

**English —** Never open a public issue for a security vulnerability. Report
**privately** to `ahmadmedo1012@gmail.com` (maintainer: Ahmad Medo), or via the
repository's Private vulnerability reporting once enabled in settings. Include
a description, reproduction steps, and expected impact. Target response: 72h.

## النطاق | Scope

**داخل النطاق | In scope** — التطبيقات الخمسة للمنظومة (مدارك، سمارت لينك،
سمارت منيو، سمارت بوت، سمارت أوردر) وجميع مساراتها: كل واجهات `/api`، المصادقة
والجلسات، المدفوعات وخطوط المال، الـ Webhooks (ماسنجر/تيليجرام)، عزل المستأجرين
(tenant isolation)، وقواعد البيانات ومعالجة البيانات الشخصية.

The five ecosystem apps (madarek, Smart-Link, Smart-Menu, SmartBot,
Smart-Order): all `/api` routes, auth & sessions, payments & money paths,
Messenger/Telegram webhooks, tenant isolation, data storage & PII handling.

**خارج النطاق | Out of scope** — هجمات حجب الخدمة، الهندسة الاجتماعية، التقارير
الآلية بلا إثبات عملي، والثغرات في نسخ معدَّلة غير منشورة. | DoS, social
engineering, automated scanner reports without a working PoC, and modified
deployments.

## وضع الأمان الحالي | Current posture

| المستودع / Repo | CSP | تحديد المعدل / Rate limit | فحص الأسرار / Secret scan |
|---|---|---|---|
| مدارك / madarek | ✓ helmet + فحص هاش | ✓ وسيط الخلفية | — |
| سمارت منيو / Smart-Menu | — | ✓ قاعدي (DB) | ✓ CI |
| سمارت لينك / Smart-Link | ✓ قائمة سماح | ✓ مسار الاتصال | — |
| سمارت بوت / SmartBot | ✓ middleware | ✓ FastAPI | ✓ CI |
| سمارت أوردر / Smart-Order | — | ✓ (+ e2e) | — |

ملفات `.env` غير متتبَّعة في كل المستودعات الخمسة. | `.env` files are untracked
in all five repositories.

## الإفصاح | Disclosure

إفصاح منسق بعد الإصلاح والتحقق — لا يُنشر شيء قبل الترقيع. | Coordinated
disclosure after the fix is verified — nothing goes public before the patch.
المبلّغون الجديّرون يُذكرون في `CHANGELOG.md`. | Creditable reporters are
acknowledged in `CHANGELOG.md`.
