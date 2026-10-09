# المساهمة | Contributing

> مساهمات منظومة مدارك تمر عبر جولات عمل منسقة — هذا المستند يوثّق القواعد
> القائمة فعلًا. | Madarek-ecosystem contributions flow through coordinated
> work rounds — this documents the rules the fleet already follows.

## الإعداد | Setup

انسخ `.env.example` إلى `.env` ثم اتبع خطوات التشغيل في `README.md` (Quickstart).
مدير الحزم لكل مستودع: madarek **npm** (workspaces) · Smart-Menu **pnpm** ·
Smart-Link **npm** · SmartBot **pip + npm** (fb_dashboard) · Smart-Order **bun**.
لا ترفع `.env` أو أي سر حقيقي أبدًا.

Copy `.env.example` → `.env`, then follow the README quickstart. Node 22+.
Never commit `.env` or real secrets.

## بوابات الجودة | Quality gates (لكل مستودع | per repo)

| المستودع | lint | typecheck | tests | parity | build |
|---|---|---|---|---|---|
| madarek | — | `npm run typecheck` | `npm test` | `npm run validate:colleges` | `npm run build -w backend && npm run build -w frontend` |
| Smart-Menu | `pnpm lint` + `lint:idioms` | `pnpm typecheck` | `pnpm test` | `cd mobile && pnpm test:parity` | `pnpm build` |
| Smart-Link | `npm run lint` | في build | `npm run test:e2e` | `npm run test:parity` | `npm run build` |
| SmartBot | `ruff check .` | `cd fb_dashboard/frontend && npx tsc --noEmit` | `pytest -q` + frontend `vitest` | frontend `npm run test:parity` | frontend `next build` |
| Smart-Order | `npm run lint` | في build | `npm run test:e2e` | `npm run test:parity` | `npm run build` |

البوابات خضراء قبل كل دفعة، والـ CI يفرضها على كل PR. | All gates green
before every push; CI enforces them on every PR.

## عرف الالتزام | Commit convention

`نوع(نطاق): موضوع` — النوع من: `feat` `fix` `polish` `docs` `test` `chore`
`merge`، مع وسم الجولة `rNNN` لعمل جولات البرنامج. أمثلة حقيقية من التاريخ:

```
fix(r131): family re-alignment — input 44/r10/16-floor …
feat(r129): Smart-Menu canonical differential fixes + pins 110→153
docs(r126): docs-truth — README real test counts
```

الموضوع إنجليزي موجز؛ نصوص الواجهة **عربية أولًا** (RTL). | Concise English
subject; UI copy stays Arabic-first and RTL-correct.

## الفروع والـ PR | Branch & PR flow

1. فرع لكل عمل (`feat/…`, `fix/…`) يفتح PR إلى `main` — لا دفع مباشر إلى
   `main` إلا بتكليف منسق (جولات المنظومة).
2. املأ قائمة تدقيق الـ PR: البوابات، المظهران (ليلي/نهاري)، RTL، لقطات الشاشة
   لتغييرات الواجهة.
3. أي تغيير يستحق سطرًا في `CHANGELOG.md` يُحدَّث في نفس الـ PR.

Work happens on feature branches (`feat/…`, `fix/…`) opening PRs into
`main`. Direct pushes to `main` are reserved for the coordinated program
rounds. Fill the PR checklist; keep `CHANGELOG.md` current.

## اللغة والنسخ | Language & copy

الواجهة عربية أولًا والمصطلحات من معجم منظومة مدارك (راجع `README.md`).
| UI copy is Arabic-first; terminology follows the ecosystem glossary.
