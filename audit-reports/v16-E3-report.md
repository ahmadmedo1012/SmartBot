# v16-E3 — Frontend RTL/a11y Execution Report (2026-09-09)

Agent: E3 (FRONTEND-A11Y). Mandate: plan §1-E3 (6 tasks), diagnostics from `audit-reports/v16-D1-frontend-a11y.md`. Surgical-only; every change carries a `v16-E3` comment at the edit site.

## Task 1 — Skip link reveal (layout.tsx) — DONE
- `src/app/layout.tsx` skip link: `focus:absolute focus:end-4` → `focus:fixed focus:start-4` (kept `focus:top-4` and every other token). Reveals at top-RIGHT (RTL reading start) instead of the left edge, and stays in-viewport at any scrollY (fixed = viewport coords; D1 measured y=−784 with the old absolute reveal).
- Closes allowlist **p11-rtl-tab-order** (D1 LEAD A re-scoped root cause — DOM order was verified correct; the skip link was the x=16 first-stop defect).
- Tailwind validity: `focus:fixed` / `focus:top-4` / `focus:start-4` are the same utility families already used in the file (`focus:absolute focus:end-4`); `start-*`/`end-*` logical utilities are first-class in this Tailwind 4 setup.

## Task 2 — Wizard focus on back / skip-setup — DONE (+2 tests)
- `src/app/onboarding/OnboardingWizard.tsx`: added `focusStepTitle` (useCallback, rAF → `document.getElementById("onboarding-step-title")?.focus()`) — exact mirror of the v15 forward-path pattern (formerly inline at :252-258, now factored and reused by `handleNext` too, behavior-identical).
- Called in `handleBack` after `setStep` for the non-zero case, and in the step-3 «تخطي الإعداد» onClick after `setStep(total - 1)`. Escape-key path inherits the fix (it calls `handleBack`).
- Completes **p12-wizard-focus-advance**: focus now lands on the step title INSIDE `[role="dialog"]` on every transition, so the panel-scoped Tab trap (:289+) keeps intercepting.
- `src/test/OnboardingWizard.test.tsx` — new describe block "OnboardingWizard focus management (back / skip-setup)" following the file's stubFetch/renderWizard conventions:
  - «السابق» on step 1 → asserts `document.activeElement.id === "onboarding-step-title"` AND `getByRole("dialog").contains(active)`.
  - «تخطي الإعداد» on step 3 → same assertions on the done step.
  - Evidence: `npx vitest run src/test/OnboardingWizard.test.tsx` → **14 tests passed** (12 prior + 2 new).

## Task 3 — Header auto-hide removes tab stops — DONE
- `src/components/layout/Header.tsx` (actual path; D1 cited it as landing/Header): hidden branch `"-translate-y-full"` → `"-translate-y-full invisible"`.
- Transition property: **kept the existing `transition-all`** (the project's equivalent that already includes `visibility`) instead of narrowing to `transition-[transform,visibility]` — narrowing would have killed the `scrolled` bg/border/shadow fades. CSS visibility transitions discretely and stays "visible" for the whole 500ms slide-out, then flips to hidden → animation preserved, links leave the tab order after it. (Closes D1 C1, HIGH.)

## Task 4 — Un-nested the 8 Link>Button CTA sites (10 anchors) — DONE
Inner interactive element replaced with a styled `<span>` carrying the Button's visual classes (variant + size + sheen pseudos + svg rules verbatim from `buttonVariants`), minus interactive-only tokens (cursor-pointer, focus rings, active:scale, disabled states). The anchor is now the single focusable control per CTA; keyboard focus indication comes from the global `:focus-visible` outline fallback (globals.css) — same seam every plain link in the codebase uses.

| File | Site | Variant/Size carried |
|---|---|---|
| src/app/page.tsx (hero ×2) | :154→ /subscribe, :159→ /demo | orange lg (text-base h-12 px-7 + shadow-lg) / outline lg (text-base h-12 px-7) |
| components/landing/sections/FinalCTASection.tsx ×2 | :43→ /subscribe, :46→ /pricing | orange lg / outline lg |
| app/login/page.tsx | :174 back-to-home | ghost sm (gap-1) |
| app/register/RegisterForm.tsx | :130 back-to-home | ghost sm (gap-1) |
| app/dashboard/billing/page.tsx | :57 recharge | orange sm (shadow-sm) |
| app/dashboard/messages/page.tsx | :230 needs-setup | orange sm (h-9 px-5) |
| app/global-error.tsx | :49 home | outline lg (text-base px-8 h-12) |
| app/admin/telegram/error.tsx | :33 admin home | outline lg (text-base px-8 h-12) |

- Both error files were confirmed genuine `<a><Button>` nested pairs — minimal adaptation as instructed.
- `Button` import removed where it became unused (page.tsx, FinalCTASection.tsx — grep-verified only comments mention it now); kept everywhere it's still used (login/register submit, billing retries, error reset, messages actions).
- page.tsx is RSC — the replacement also drops the last client-component (Button island) from the landing hero.

## Task 5 — dir="auto" batch on cited raw fields — DONE (17 elements, superset of D1's 13)
Added `dir="auto"` (with `v16-E3 (D1 C3)` comments) to every cited raw input/textarea — shared Input/Textarea seams already bake it (input.tsx:49, textarea.tsx:12) and were NOT touched:
- autoreply: rule-name, rule-keywords, rule-reply, rule-priority (4)
- tools: tmplName, tmplCategory, tmplText (3)
- scheduled: post composer textarea
- marketing: campaign-message textarea
- comments: quick-reply input
- posts: new-post textarea
- messages: composer textarea
- support: ticket message textarea + thread reply input
- demo: disabled mock composer input
- payment-instructions: receipt file input (sr-only peer — filename is the live Latin value)
- OnboardingWizard: reply textarea (:477)

## Task 6 — NEW platform-admin support queue — DONE
`src/app/admin/support/page.tsx` (new route, ~260 lines), consuming the Wave-2 E2 contract `GET /api/admin/support/tickets?status=&page=` → `ok({items:[{id,subject,status,priority,tenant_name,created_at,email}], total, page})` via **apiFetch + unwrapApi only** (no dual-shape guards; apiFetch throws ApiError on non-2xx and unwrapApi throws on success:false — both land in useQuery's error state, which renders the honest role=alert + retry panel).
- Conventions mirrored from admin/page.tsx + admin/telegram/page.tsx: QueryProvider scope from admin/layout.tsx, robots noindex meta effect, SectionContainer/SectionHeader + sr-only h1, filter Buttons with aria-pressed, skeleton first load, dimmed refetch, EmptyState, aria-labelledby table with `data-label` cells, `sb-fade-up`, formatDateOnly/formatNumber seams, Badge status/priority chips, dir="auto" on live Latin cells (subject/tenant/email).
- Status values read from `fb_dashboard/routers/support.py` (open | pending | closed → مفتوحة / بانتظار العميل / مغلقة) + priorities (low/medium/high/urgent). Pagination: prev/next + page indicator; «التالي» stops on an empty page (contract exposes no per_page — documented in-code).
- Until E2 lands (Wave 2) the page renders its honest error state — it compiles and typechecks standalone.

## Gates (run from fb_dashboard/frontend)
```
$ npx tsc --noEmit                          → exit 0, zero output (0 errors)
$ npx vitest run                            → Test Files 30 passed (30)
                                               Tests      245 passed (245)   [baseline 243 + 2 new]
$ node ../../scripts/check_a11y_labels.ts   → PASS a11y gate — all icon-only
                                               interactive controls have accessible
                                               names (161 files scanned)
```
`npm run build` intentionally NOT run (E4/coordinator owns the build this wave). No commits made. Parallel-agent changes outside my ownership (fb_client.py, providers.tsx, admin layouts, plan-comparison, admin/telegram/page.tsx, test_v16_ssrf.py…) were left untouched and the gates above ran green WITH them in the tree.

## Flagged for the coordinator (outside E3 ownership)
1. **/admin/support is navigation-orphaned** — no link reaches it (admin/page.tsx header links + AdminSidebar.tsx are outside my file list; same defect class as v14-E4 D1-ع1 which fixed /admin/telegram being orphaned). Recommend adding a «تذاكر الدعم» link beside «إعدادات المنصة»/«إعدادات تليجرام» in admin/page.tsx at merge time.
2. Header fix intentionally kept `transition-all` (see Task 3) — the D1-sketched `transition-[transform,visibility]` would regress the scrolled-state fades.
3. The un-nested CTA anchors rely on the global `:focus-visible` outline (2px var(--ring)) rather than the Button's ring classes — visually consistent with every other link in the app; a dedicated "anchor-as-button" ring can be a follow-up if design wants the exact button ring on them.
