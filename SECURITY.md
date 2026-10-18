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

## سجل الحوادث | Incident log

### P21-W5 (2026-10) — بيانات اعتماد تاريخية في `fb_dashboard/.env` | Historical credentials in `fb_dashboard/.env`

**الواقع | The fact.** التاريخ العام للمستودع يحمل ملف `fb_dashboard/.env`
(blob `2e6a618a`) أُدخل في الالتزام `d7e5d8db` وأُزيل من الشجرة في
`c1eb1d78` (تنظيف 822MB→46MB) — لكنه يبقى قابلًا للاسترجاع من أي استنساخ.
المفاتيح المكشوفة: `DATABASE_URL` (Neon)، `SECRET_KEY`،
`FACEBOOK_ACCESS_TOKEN` (+ إعدادات غير حساسة). الشجرة الحالية نظيفة:
مسح Worktree أخضر في CI و`.env` مُتجاهَل عبر `.gitignore`.

Public history carries `fb_dashboard/.env` (blob `2e6a618a`), introduced in
`d7e5d8db` and removed from the tree in `c1eb1d78` — still recoverable from
any clone. Exposed keys: `DATABASE_URL` (Neon), `SECRET_KEY`,
`FACEBOOK_ACCESS_TOKEN` (+ non-sensitive settings). The current tree is
clean: CI worktree scan green, `.env` gitignored.

**إجراء المالك (مطلوب) | Owner action (required).** تدوير كل مفتاح مكشوف
عند مزوّده: كلمة مرور Neon داخل `DATABASE_URL`، و`SECRET_KEY`،
و`FACEBOOK_ACCESS_TOKEN`. تنقية الجِرم من التاريخ نفسه تتطلب
`git filter-repo` + force-push — قرار مالك مقصود (يكسر الاستنساخات
والفروع) وليس شرطًا للسلامة متى دُوِّرت المفاتيح.

Rotate every exposed credential at its provider: the Neon password inside
`DATABASE_URL`, `SECRET_KEY`, and `FACEBOOK_ACCESS_TOKEN`. Purging the
blob from history requires `git filter-repo` + force-push — a deliberate
owner decision (breaks clones/forks), not a safety requirement once
secrets are rotated.

**الأداة | The tool.** `python scripts/secret_scan.py --history` يفحص صنف
D6-H1 (أي ملف `.env*` أُضيف للتاريخ قط) — يُبلغ حاليًا عن الحالتين
المعروفتين: `fb_dashboard/.env` (السرّ أعلاه) و`scripts/round.env`
(التزام `08770906` — صنف بلا سرّ: عدّاد جولات علني متتبَّع في الشجرة).
خروج نظيف بعد أي تنقية = لا بقايا.

`python scripts/secret_scan.py --history` scans the D6-H1 class (any
`.env*` file ever added to history) — it currently reports the two known
instances: `fb_dashboard/.env` (the secret above) and `scripts/round.env`
(commit `08770906` — benign: a tracked public round counter). Clean exit
after any purge = no residue.

## الإفصاح | Disclosure

إفصاح منسق بعد الإصلاح والتحقق — لا يُنشر شيء قبل الترقيع. | Coordinated
disclosure after the fix is verified — nothing goes public before the patch.
المبلّغون الجديّرون يُذكرون في `CHANGELOG.md`. | Creditable reporters are
acknowledged in `CHANGELOG.md`.
