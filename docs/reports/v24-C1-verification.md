# v24-C1 — Mobile Layout / Touch / iOS-Zoom Implementation Verification

- **Task ID:** v24-C1 · **Agent:** c1-layout (Implementation)
- **Scope:** `fb_dashboard/frontend/src` — mobile-first layout fixes from the v24-A1 diagnostic (P0 + P1 families) in the C1 ownership list
- **Method:** direct code edits per the A1 fix recipes; verified with `tsc --noEmit`, scoped + full `vitest`, and the repo a11y label gate
- **Directive source:** `docs/reports/v24-A1-mobile-layout.md` (file:line recipes) + cross-checks from `docs/reports/v24-B4-a11y-rtl.md` (§7 touch family)

---

## 1. Per-task change table

| # | Task (A1 ref) | File | Change summary | How verified |
|---|---|---|---|---|
| 1 | **P0** PDF controls row clips at 375px (reports:190-220) | `src/app/dashboard/reports/page.tsx` | Controls group `flex items-center gap-2` → `flex flex-wrap items-center gap-2 w-full sm:w-auto`; both selects gained `flex-1 min-w-0 sm:flex-none` (were already `h-11 text-base`); download Button → `w-full sm:w-auto shrink-0` | tsc; layout math: selects share the row (flex-basis 0), button gets its own full-width ≥44px row — no clipping of «تنزيل تقرير PDF» at 375px |
| 2 | Team confirm-delete row overflow (~352px, team:201-269) | `src/app/dashboard/team/page.tsx` | Card restructured to stacked: `flex flex-col sm:flex-row sm:items-center gap-3`; row 1 = avatar + `truncate` name/email (`min-w-0`); row 2 = actions `flex flex-wrap items-center gap-2 justify-end sm:shrink-0` (owner-badge branch got the same wrap). All buttons remain shared `<Button>` (min-h-11) | tsc; SequencesPage-style restructure — actions wrap at 375px instead of clipping |
| 3 | Team role select `h-8 text-xs` (team:227) | `src/app/dashboard/team/page.tsx` | → `h-11 text-base md:text-sm px-3` (matches the form select at team:152) | tsc; 44px + 16px on mobile |
| 4 | Sequences confirm-delete overflow (~368px, sequences:702-765) | `src/app/dashboard/sequences/page.tsx` | Row `flex items-center justify-between` → `flex flex-col sm:flex-row sm:items-center justify-between gap-3`; actions cluster dropped `shrink-0` → `flex flex-wrap items-center gap-1.5 justify-end` (wrap can now engage) | tsc + `SequencesPage.test.tsx` 5/5 (incl. the two-step Arabic confirm-delete test) |
| 5 | Step-count tolerance (backend may add `step_count`) | `src/app/dashboard/sequences/page.tsx` | `SequenceCardRow.step_count` → optional + optional `steps?: SequenceStepRow[]`; new `stepCountOf(s) = s.step_count ?? s.steps?.length ?? 0`; render `stepCountOf(s) >= 0` keeps the `-1` → «—» failure sentinel | tsc + SequencesPage tests («خطوتين» still renders from the enrichment path) |
| 6 | Comments quick-reply iOS zoom + 32px (comments:198-210) | `src/app/dashboard/comments/page.tsx` | `flex-1 min-w-[10rem] h-8 text-sm` → `… h-11 text-base md:text-sm` | tsc + `comments/page.test.tsx` 5/5 |
| 7 | Support reply input `h-9 text-xs` (support:502-512) | `src/app/dashboard/support/page.tsx` | → `flex-1 h-11 text-base md:text-sm` | tsc |
| 8 | Support priority radios `h-8` (support:302-317) | `src/app/dashboard/support/page.tsx` | Each radio `h-8` → `h-11` (44px; radiogroup keyboard contract + `data-priority` focus logic untouched) | tsc |
| 9 | Support new-ticket textarea `text-sm` (support:327-339) | `src/app/dashboard/support/page.tsx` | → `text-base md:text-sm` | tsc |
| 10 | Billing provider tabs `h-8` (billing:336-353) | `src/app/dashboard/billing/page.tsx` | Each tab `h-8` → `h-11` | tsc |
| 11 | Billing bank amount `h-10 text-sm` (billing:376-384) | `src/app/dashboard/billing/page.tsx` | → `w-32 h-11 text-base md:text-sm` | tsc |
| 12 | Scheduled datetime crushed (~160px, scheduled:107-124) | `src/app/dashboard/scheduled/page.tsx` | Row → `flex flex-col sm:flex-row sm:items-end gap-3`; Button → `w-full sm:w-auto`; datetime input full-width on mobile; dropped the `text-sm` className override on the shared `Input` (base ships `text-base md:text-sm`) | tsc |
| 13 | Scheduled composer textarea `text-sm` (scheduled:97-106) | `src/app/dashboard/scheduled/page.tsx` | → `text-base md:text-sm` | tsc |
| 14 | SetupWarnings dismiss X `size-7` (SetupWarnings:126-134) | `src/components/shared/SetupWarnings.tsx` | → `size-11` (44px); `aria-label="إخفاء التنبيهات لهذه الجلسة"` preserved | a11y label gate: 0 unnamed icon-only controls |
| 15 | Password eye `size-7` (login:231) | `src/app/login/page.tsx` | → `size-11`; input `pe-10` → `pe-14` so typed text clears the wider button; dynamic aria-label preserved | tsc + `RegisterForm`-style label checks |
| 16 | Password/confirm eyes `size-7` ×2 (RegisterForm:209/239) | `src/app/register/RegisterForm.tsx` | Both → `size-11`; validity glyphs `end-8` → `end-14` (would otherwise be covered by the 44px eye); inputs gained `pe-[4.5rem]` | tsc + `RegisterForm.test.tsx` 14/14 (uses getByRole/name — labels intact) |
| 17 | TelegramConfigSection token eye `size-7` | `src/app/admin/telegram/TelegramConfigSection.tsx` | → `size-11`; input `pl-10` → `pl-14` (physical left padding inside the documented LTR island where the `end-3` button sits) | tsc + `TelegramSettingsToken.test.tsx` 9/9 |
| 18 | Switch hit area 34px (ui/switch.tsx:29) | `src/components/ui/switch.tsx` | Restructured: the button itself is now a real **44×44 box** (`h-11 min-w-11`, transparent bg, focus ring) with the painted track + thumb moved to an inner span — sizes (18.4×32 / 14×24) and the v7 RTL thumb-flip translate math unchanged. Removed the `after:-inset-x-3 after:-inset-y-2` pseudo hit-slop (peaked at 34px tall and bled over neighbouring controls). `disabled` is now destructured and forwarded natively + track `bg-muted` | tsc + full suite (all 4 Switch consumers render in passing tests: TelegramSettingsToken, AutoReplyBehavior, admin telegram, tools) |

### Location notes (task-4 reconnaissance)

- `src/components/auth` and `src/components/settings` **do not exist** in this codebase; `RegisterForm` lives at `src/app/register/RegisterForm.tsx` (fixed there).
- `TelegramConfigSection` lives at `src/app/admin/telegram/TelegramConfigSection.tsx` — **not** in `dashboard/settings` or `components/settings` (fixed there, per "wherever it lives").
- `src/app/dashboard/settings/page.tsx` has **no password-eye toggles** (plain `type="password"` shared `Input`s) — nothing to change.
- `sequences/page.tsx` has **no raw `<input>/<textarea>/<select>`** (step editor already uses shared `Input`/`Textarea`) — nothing for the iOS-zoom family there.
- Reports selects were already `h-11 text-base md:text-sm` — only the wrap fix (task 1) was needed.

---

## 2. Verification results

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (fb_dashboard/frontend) | **PASS** — exit 0, no errors |
| Scoped vitest: MessagesPage, SequencesPage, comments page, RegisterForm, TelegramSettingsToken | **PASS** — 5 files / 42 tests |
| Full `npx vitest run` | **PASS** — 48 files / 386 tests (matches v24-00 baseline exactly) |
| `scripts/check_a11y_labels.ts` (run from frontend cwd) | **PASS** — 0 unnamed icon-only controls (184 files) |
| `git status` | exactly the 12 intended files modified; **no commits made** (per directive) |

## 3. Constraints honored

- **No functionality changed** — only classNames/layout structure, plus the tolerant step-count read. All `onChange`/`aria-*`/`role`/keyboard contracts preserved verbatim.
- **Button guarantees intact** — no `min-h-11` overrides added or removed; the pre-existing `h-9`/`size-8` Button overrides were left alone (base `min-h-11` wins, per A1's verified Tailwind ordering).
- **RTL correctness** — only logical utilities used (`pe-`, `end-`, `justify-end`, `flex-col`); the one physical `pl-14` sits inside the documented LTR island (`dir="ltr"` token input) alongside the existing physical `text-left`.
- **Comment style** — English comments tagged `v24-C1` at every change site, mirroring the existing fix-lineage convention.
- **No new dependencies, no files outside ownership** (TelegramConfigSection was explicitly named in the task as "find it wherever it lives").

## 4. Not fixed (out of scope / other agents)

- **A1 P2 backlog** not in the C1 task list: truncation debt on reports top-commenter rows, billing history rows, KPI `tabular-nums`, messages filter chips, analytics heatmap 375px density, PageHeader `px-4 sm:px-6`, admin table mobile-card fallback, `text-3xs` token bump.
- **Same-family raw inputs in OTHER agents' files** (posts:106, marketing:172, autoreply:310, onboarding:778, demo:343, admin/support:407, messages search override) — outside my ownership list.
- **B4 P1 live-region for the messages thread** (role="log") — a11y scope, other agent.

*All 18 rows above correspond to the 9 numbered C1 tasks (task 4 spans rows 6-13). Report generated by Agent C1-LAYOUT, v24-C1.*
