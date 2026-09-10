# v24-A1 — Mobile Layout Diagnostic Audit (READ-ONLY)

**Agent:** MOBILE-LAYOUT (v24-A1) · **Date:** 2026-09-10 · **Method:** static code audit @ 375px (iPhone SE/mini class)
**Scope:** `fb_dashboard/frontend` — Next.js 16 / React 19 / Tailwind CSS 4 / RTL Arabic UI
**Directive:** «التركيز على نسخة الهاتف» — mobile version is the priority.

---

## 1. Executive Summary

| Metric | Count |
|---|---|
| Dashboard pages audited (incl. index + catch-all) | 24 |
| Admin pages audited (`/admin`, settings, support, telegram) | 4 |
| Public/auth flows audited (login, register, pricing, connect, onboarding, subscribe, demo, landing) | 8 |
| Shared components audited (shell, nav, charts, dialogs, payment, primitives) | 22 |
| **Total issues found** | **43** |
| P0 — broken/unusable at 375px | 1 |
| P1 — degraded UX (clipped rows, iOS zoom, sub-44px targets) | 22 |
| P2 — polish (tiny text, missing truncation, dense charts) | 20 |

**Overall verdict:** the mobile foundation is **strong** — a proper bottom-nav + "more" sheet pattern, viewport `viewport-fit=cover` paired with `env(safe-area-inset-*)` paddings, dialogs capped to `calc(100%-2rem)`, a `Button` base with global `min-h-11 min-w-11`, 16px shared form fields (iOS no-zoom), and fully fluid `ResponsiveContainer` charts. The remaining defects cluster in **three systemic families**:

1. **Inline confirm-delete action rows** that don't wrap → horizontal clipping at 375px (team, sequences, reports PDF controls).
2. **11 raw `<input>/<textarea>/<select>` elements** with `text-sm`/`text-xs` (12–14px) that bypass the shared 16px components → **iOS auto-zoom on every focus** in the reply/compose flows that matter most on phones.
3. **Raw icon-only buttons/selects/radios** at `size-7`/`h-8` (28–32px) that bypass the `Button` 44px guarantee → sub-44px touch targets.

---

## 2. Mobile Architecture (checklist items 10, 12)

**Verified good — no action needed:**

- **Root viewport** (`src/app/layout.tsx:46-62`): `width=device-width`, `initialScale:1`, `viewportFit:"cover"` — the paired change that makes every `env(safe-area-inset-*)` in the app resolve to real values.
- **Dashboard navigation** (`src/components/layout/MobileBottomNav.tsx`): below `md` the fixed right sidebar (`w-60 hidden md:block`, `DashboardShell.tsx:57`) is replaced by a fixed bottom bar (5 slots: لوحة التحكم / الرسائل / التحليلات / الإشعارات / المزيد, `grid-cols-5`, `py-2`, `size-5` icons, active underline) + a **"المزيد" bottom sheet** holding all 23 sections in `grid-cols-4` tiles (`max-h-[78vh]` scroll, focus trap, Escape, aria-modal, theme toggle + logout rows). Every section reachable in ≤2 taps. `safe-area-pb` on the bar.
- **Content clearance** (`DashboardShell.tsx:75`): `pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0` — bottom bar never covers content.
- **Admin mobile nav** (`src/app/admin/layout.tsx:44`, `AdminMobileNav.tsx`): 4-section bottom bar + same pb calc — platform admins are not stranded on mobile.
- **Public header** (`components/layout/Header.tsx:23,39,181`): `lg:hidden` hamburger `size-11` + full keyboard-trapped MobileMenu.
- **FloatingWhatsApp**: `bottom-[calc(env(safe-area-inset-bottom)+1rem)]`, raised above the demo's bottom nav (`demo/page.tsx:587`).
- **Sticky header conflicts (item 8):** `PageHeader` is `sticky top-0 z-30`, but the scroll container is a sibling below it — the header never competes with the more-sheet (`z-40/50`) or the bottom nav.
- **Double scrollbars (item 9):** each page mounts ONE inner `flex-1 overflow-y-auto` scroller inside a bounded flex chain — the window itself doesn't scroll. No nested/competing scrollbars found (messages page swaps list/thread panes at mobile, only one visible).

---

## 3. Per-Page Findings

Severity: **P0** broken · **P1** degraded · **P2** polish. All paths relative to `fb_dashboard/frontend/src`.

### 3.1 Dashboard pages

| Page | Issue | Location | Sev | Fix |
|---|---|---|---|---|
| **messages** | Filter chips `px-3 py-1.5 text-xs` ≈30px tall — below 44px touch target | `app/dashboard/messages/page.tsx:362-377` | P2 | `py-2.5` (≈38px) or `min-h-11` with `items-center`; chips already `whitespace-nowrap` + `overflow-x-auto` rail ✓ |
| **messages** | "تحديث" button override `h-8` — safe (Button base `min-h-11` wins) — informational only | `page.tsx:415` | — | No change needed; avoid `h-8` overrides for clarity |
| messages | ✅ Master-detail (`w-full md:w-96`, `hidden md:flex` swap + `md:hidden` back button), 16px Textarea `min-h-[44px]` (no iOS zoom), Enter-send/Shift+Enter, thread `overflow-y-auto`, bubbles `max-w-[70%]`, images `max-w-full`, input bar above bottom nav | `page.tsx:327-334, 447, 462-466, 596-604` | ✅ | — |
| **reports** | **PDF controls row clipped at 375px**: inner `flex items-center gap-2` (2 selects + "تنزيل تقرير PDF" button ≈ 380px) cannot wrap; card content ≈295px → button clipped by `overflow-x-clip` body → **primary download action partially unreachable** | `app/dashboard/reports/page.tsx:190-220` | **P0** | Make the group wrap internally: `<div className="flex flex-wrap items-center gap-2">` + give selects `flex-1 min-w-24 basis-32 sm:flex-none`; or stack: `flex-col sm:flex-row w-full sm:w-auto` |
| reports | Top-commenter rows: `c.name` not truncated, no `min-w-0` — long FB names widen rows | `page.tsx:261-268` | P2 | `<div className="flex items-center gap-3 min-w-0">` + `truncate` on the name span |
| reports | KPI cards `grid-cols-2` at ~160px with `text-xl` values — 6-digit Arabic numerals (`١٢٣٬٤٥٦`) can overflow without `min-w-0` | `page.tsx:128-169` | P2 | Wrap value+label in `min-w-0` + `truncate tabular-nums` on the value |
| **team** | **Inline confirm-delete overflow**: avatar + name + role `select` + "تأكيد الحذف" + "إلغاء" in one non-wrapping row ≈352px needed vs ≈295px available → username crushed to 0, cancel button clipped | `app/dashboard/team/page.tsx:201-269` | **P1** | Restructure: row 1 = avatar+name (+`truncate`), row 2 = `<div className="flex flex-wrap items-center gap-2 justify-end">` with select + confirm/cancel; or move confirm into a second line `w-full` |
| team | Role `select` raw: `h-8 text-xs` → 32px target + 12px font (iOS zoom family) | `page.tsx:227-237` | P1 | `h-11 text-base md:text-sm` (matches the form selects at `page.tsx:152`) |
| team | Username/email rows lack `truncate` (`m.username` line 206) | `page.tsx:205-210` | P2 | `truncate` on both `<p>` |
| **sequences** | **Same confirm-delete overflow**: actions cluster "تحرير + إيقاف/تفعيل + تأكيد الحذف + إلغاء" ≈368px > ≈295px; container is `shrink-0 flex-wrap` — but `shrink-0` prevents the width constraint from forcing the wrap at 375px | `app/dashboard/sequences/page.tsx:702-765` | **P1** | Drop `shrink-0`, add `min-w-0` on the name column and let the actions container be `flex flex-wrap justify-end gap-1.5` (wrap then engages); or stack actions under the meta like broadcast does |
| sequences | ✅ Step editor: shared `Textarea`/`Input` (16px), `grid-cols-2` delays, `size-10` move/delete buttons (min 44 via base) | `page.tsx:377-447` | ✅ | — |
| **comments** | Quick-reply raw `input`: `h-8 text-sm` → 32px target + 14px → **iOS zoom on every reply focus** | `app/dashboard/comments/page.tsx:198-210` | **P1** | Replace with shared `<Input>` (h-12, `text-base md:text-sm`) or add `h-11 text-base md:text-sm`; keep `min-w-[10rem] flex-1` |
| comments | Commenter name row (`from_name` + timeAgo + badge) has no `truncate`/`min-w-0` on the name | `page.tsx:175-183` | P2 | `truncate` on the name span |
| **scheduled** | Raw composer `textarea` `text-sm` (14px) → iOS zoom | `app/dashboard/scheduled/page.tsx:97-106` | P1 | Use shared `<Textarea>` (as messages page does) or `text-base md:text-sm` |
| scheduled | `flex gap-3 items-end`: datetime-local input squeezed to ≈160px next to the button ("جارٍ الجدولة…" widens it) — cramped native picker on iOS | `page.tsx:107-124` | P1 | Stack on mobile: `flex flex-col sm:flex-row` + button `w-full sm:w-auto`; or shorten loading label to "…" |
| scheduled | Publish/delete icon buttons `size-3` icons with `gap-1` (4px) — min target OK (Button base), spacing tight | `page.tsx:161-168` | P2 | `gap-2` |
| **posts** | Raw composer `textarea` `text-sm` → iOS zoom | `app/dashboard/posts/page.tsx:106-115` | P1 | Shared `<Textarea>` |
| posts | Draft meta row (badge + date) lacks `min-w-0`/`truncate` — long dates push the action buttons | `page.tsx:238-256` | P2 | `min-w-0 truncate` on the date span |
| **marketing** | Raw campaign `textarea` `text-sm` → iOS zoom | `app/dashboard/marketing/page.tsx:172-182` | P1 | Shared `<Textarea>` |
| marketing | Sent-campaign stats row: 4 metrics in non-wrapping `flex gap-4 text-2xs` — overflows with 4-digit counts (`أُرسلت إلى 1٬250…`) | `page.tsx:311-322` | P1 | `flex flex-wrap gap-x-4 gap-y-1` |
| marketing | `h-7` button overrides — safe (min-h-11 base wins) | `page.tsx:288,301` | — | No change needed |
| **support** | New-ticket `textarea` raw `text-sm` → iOS zoom | `app/dashboard/support/page.tsx:327-339` | P1 | Shared `<Textarea>` |
| support | Ticket reply raw `input`: `flex-1 h-9 … text-xs` (12px!) → iOS zoom + 36px target | `page.tsx:502-512` | **P1** | `h-11 text-base md:text-sm` |
| support | Priority radiogroup: raw `h-8` radio buttons (32px targets, 4-across) | `page.tsx:302-317` | P1 | `min-h-11` (or `h-11`) on each radio button |
| **autoreply** | AI-tone raw `input`: `h-9 text-sm` → iOS zoom + 36px target | `app/dashboard/autoreply/page.tsx:310-322` | P1 | `h-11 text-base md:text-sm` |
| autoreply | ✅ Rule form raw inputs all `h-11 text-base md:text-sm`; rule rows use `flex-wrap` keywords + `line-clamp-2` + `size-8`→44px action buttons | `page.tsx:350-394, 434-455` | ✅ | — |
| **billing** | Upgrade dialog provider tabs: raw radio `h-8` (32px targets) | `app/dashboard/billing/page.tsx:336-353` | P1 | `h-11` (matches PaymentDialog's `h-14` tabs — `payment/payment-methods.tsx:62`) |
| billing | Bank-amount raw `input`: `w-32 h-10 text-sm` → iOS zoom | `page.tsx:376-384` | P1 | `h-11 text-base md:text-sm` (keep `w-32`) |
| billing | History rows: left block no `min-w-0`, provider·phone line no truncate; status badge not `shrink-0` | `page.tsx:281-293` | P2 | `min-w-0` on the div, `truncate` on the meta `<p>`, `shrink-0` on the badge |
| **pages** | Shared `Input` with `h-9 text-sm` overrides — currently resolves to h-12/16px because Tailwind orders `h-12`/`text-base` after the overrides, but this is cascade-fragile | `app/dashboard/pages/page.tsx:189,193` | P2 | Remove the `h-9 text-sm` overrides (base is already correct) |
| pages | ✅ Scopes badges `flex-wrap`; save button `w-full` on mobile | `page.tsx:163-168, 195` | ✅ | — |
| **tools** | Offer `Switch` (shared) hit area ≈56×34px (`after:-inset-y-2`) — below 44px height next to a destructive delete button | `components/ui/switch.tsx:29,32` used at `tools/page.tsx:326-331` | P1 | Expand pseudo hit area: `after:-inset-y-3` (→50px) or wrap the switch in a `p-2 -m-2` hit-slop button |
| tools | Template name row: `t.name` + category chip, no `truncate` on name | `app/dashboard/tools/page.tsx:184-186` | P2 | `truncate` + `min-w-0` on the flex row |
| **ads** | Account row: `text-sm font-bold` name vs long status badge ("معلّقة (مبالغ مستحقة)") — neither truncates/silences | `app/dashboard/ads/page.tsx:98-114` | P2 | `truncate` on name, `shrink-0` on badge (already implicit) — or shorten badge label |
| **audience** | ✅ `grid-cols-1 lg:grid-cols-3`; subscriber rows fully truncated (`truncate` name + meta, `shrink-0` badge) | `page.tsx:53, 168-190` | ✅ | — |
| **notifications** | ✅ Preference rows are full-width `button p-4` toggles (≥44px); feed cards truncate + `line-clamp-2` | `page.tsx:356-384, 285-298` | ✅ | — |
| **analytics** | Heatmap: 24 columns + 3.25rem label = **≈10px cells at 375px** (295px card content − 52px label) — renders, but unreadable/tap-inert | `components/charts/ActivityHeatmap.tsx:82,98` | P2 | Below `sm`: render 12 columns (12h buckets) OR wrap the grid in `overflow-x-auto` with `min-w-[420px]` |
| analytics | ✅ Advanced top-rules list: `truncate` + `hidden sm:block` share bar + `w-28` counts; period comparison `grid-cols-1 sm:grid-cols-3`; all recharts `ResponsiveContainer width="100%"` fixed heights (128–180px) | `page.tsx:256-283, 323, 432-436` | ✅ | — |
| **dashboard (index)** | ✅ KPI `grid-cols-2 sm:grid-cols-4`; rules table wrapped in `overflow-x-auto` (2 cols, safe); BotHealthCard `flex-wrap` | `page.tsx:299, 318, 386-408, 191, 223` | ✅ | — |
| dashboard (index) | KpiCard `text-3xl` value + non-truncating subtitle in ~160px card — 6-digit counts can wrap awkwardly | `components/shared/KpiCard.tsx:91-94` | P2 | `tabular-nums` + `min-w-0`/`truncate` on value+subtitle |
| **activity / leads / calendar / broadcast / settings** | ✅ Card-based, `grid-cols-1 lg:grid-cols-3` collapse, shared 16px inputs, `truncate` where needed. Calendar nav uses `size-8`→44px (base) with `gap-1` (tight: P2 `gap-2`) | `calendar/page.tsx:73-85` | P2 | `gap-2` between month-nav buttons |
| **[...slug] catch-all** | ✅ Centered `max-w-md` not-found card | `app/dashboard/[...slug]/page.tsx` | ✅ | — |

### 3.2 Admin pages

| Page | Issue | Location | Sev | Fix |
|---|---|---|---|---|
| admin (payments) | 7-column table wrapped in `overflow-x-auto` ✓ but remains a ~700px horizontal scroll on 375px; `data-label` attrs exist — a mobile card transform is not wired | `app/admin/page.tsx:252-300` | P2 | Acceptable scroll pattern; optional: `hidden md:table` + mobile card list using the existing `data-label` |
| admin/support | 8-column table, same as above (wrapped ✓, expandable thread rows) | `app/admin/support/page.tsx:265-300` | P2 | Same |
| admin/settings | `min-w-[220px]` helper text sits inside `flex-wrap` — safe (wraps) | `page.tsx:401` | — | No change |
| admin/telegram | Password-eye raw button `size-7` (28px) | `admin/telegram/TelegramConfigSection.tsx:67` | P1 | `size-11` or `min-h-11 min-w-11` hit-slop |
| admin/* | ✅ `lg:grid-cols-2` collapse, textareas `text-base md:text-sm`, AdminMobileNav bottom bar + safe-area pb | `admin/layout.tsx:44` | ✅ | — |

### 3.3 Public / auth flows

| Page | Issue | Location | Sev | Fix |
|---|---|---|---|---|
| login | Password-reveal toggle raw `size-7` (28×28) | `app/login/page.tsx:231-247` | P1 | `size-11` + keep centered icon |
| register | Password + confirm-reveal toggles raw `size-7` ×2 | `app/register/RegisterForm.tsx:209,239` | P1 | Same |
| onboarding | Raw `textarea` `text-sm` (page-config textarea) | `app/onboarding/OnboardingWizard.tsx:778` | P1 | `text-base md:text-sm` |
| onboarding | ✅ Bottom-sheet-like wizard with safe-area footer (`pb-[calc(1.25rem+env(safe-area-inset-bottom))]`), `grid-cols-1 md:grid-cols-3` plan cards, `min-h-8` chip buttons | `OnboardingWizard.tsx:884, 805, 768` | ✅ | — |
| demo | Rules table (4 cols) **NOT** wrapped in `overflow-x-auto` (only table in the app missing it) | `app/demo/page.tsx:264` | P2 | Wrap: `<div className="overflow-x-auto"><table …>` (matches dashboard/admin pattern) |
| demo | Chat-input raw `input` `text-sm` | `app/demo/page.tsx:343` | P1 | `text-base md:text-sm` |
| pricing / subscribe / connect / landing | ✅ Grids collapse (`grid-cols-1 sm:grid-cols-2 md:grid-cols-6…`), orphan-card handling, `StepIndicator` `min-w-11` steps, connect `h-11` inputs, PaymentDialog `max-w-sm sm:max-w-md` with `max-h-[90dvh]` scroll | `pricing/page.tsx:198-222`, `subscribe/PlanSelector.tsx:185`, `subscribe/StepIndicator.tsx:59`, `connect/page.tsx:317,341` | ✅ | — |
| subscribe | ✅ Payment tabs `h-14` (56px), copy buttons `size-10`, USSD `inputMode` | `payment/payment-methods.tsx:62`, `copy-field.tsx:26` | ✅ | — |

### 3.4 Shared components / primitives

| Component | Issue | Location | Sev | Fix |
|---|---|---|---|---|
| **SetupWarnings** (top of EVERY dashboard page) | Dismiss "X" raw button `size-7` (28×28) — the most-seen small target in the app | `components/shared/SetupWarnings.tsx:126-134` | P1 | `size-11 rounded-lg` (icon stays `size-4`) |
| **Switch** | Track 32×18.4px; pseudo hit area 56×34px — under 44px height | `components/ui/switch.tsx:29,32` | P1 | `after:-inset-y-3` (or `p-1.5 -m-1.5` wrapper) → ≥44px |
| PageHeader | Fixed `px-6` (24px per side = 48px of 375px) — heavier than the 16px mobile standard; `subtitle` already `hidden sm:inline` ✓ | `components/ui/PageHeader.tsx:50,115` | P2 | `px-4 sm:px-6` |
| Design tokens | `text-3xs` = 10px / `text-2xs` = 11px used for metadata across pages — below comfortable mobile minimum (12px) | `app/globals.css:90-93` | P2 | Bump `--text-3xs` to 0.6875rem (11px) and reserve 3xs for sr-adjacent chrome, or audit per-use |
| Dialog / Button / Input / Textarea / KpiCard / charts | ✅ `max-w-[calc(100%-2rem)]`+`min-h-[48px]` close; `min-h-11 min-w-11` global; `h-12`/16px fields; fluid cards; `ResponsiveContainer` | `ui/dialog.tsx:58,72`, `ui/button.tsx:11`, `ui/input.tsx:51`, `ui/textarea.tsx:21` | ✅ | — |

---

## 4. Systemic Patterns

### S1 — "Inline confirm-delete" row overflow (P0/P1 family) — 3 instances
Pattern: list-card action cluster (`shrink-0` + sometimes `flex-wrap`) co-located with an expanding 2-button confirm state in a single row with `min-w-0` text.
The `shrink-0` on the action cluster prevents flex from imposing a width, so `flex-wrap` never engages and the row overflows the card (body is `overflow-x-clip`, so the tail is **clipped, not scrollable**).
Instances: `reports:190-220` (P0 — clips the primary download button), `team:201-269`, `sequences:702-765`.
**Fix pattern:** drop `shrink-0`, add `min-w-0` to the text column, let the cluster wrap; on mobile stack actions on their own row:
```tsx
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
  <div className="min-w-0">…title/meta…</div>
  <div className="flex flex-wrap items-center gap-2 justify-end">…actions…</div>
</div>
```

### S2 — Raw form controls < 16px → iOS focus-zoom (P1 family) — 11 instances
The shared `Input`/`Textarea` correctly ship `text-base md:text-sm` (the v17-D7 fix), but 11 raw controls still carry `text-sm`/`text-xs`. Every focus on iPhone Safari zooms the viewport (~1.14×) and the page never fully un-zooms — worst exactly in the money/reply paths (support reply, comments quick-reply, marketing message, scheduled post).
Instances: `comments:198`, `scheduled:97`, `posts:106`, `marketing:172`, `support:327`, `support:502`, `autoreply:310`, `billing:376`, `team:227`, `onboarding/OnboardingWizard:778`, `demo:343`.
**Fix pattern:** replace with the shared components (gains `h-12`/`field-sizing-content`/dir-auto for free) or minimally:
```tsx
className="… h-11 text-base md:text-sm …"
```

### S3 — Raw controls bypassing the 44px Button guarantee (P1 family) — 8 instances
`Button` bakes `min-h-11 min-w-11` into its base, so every `<Button size="sm" className="h-7/h-8/size-8">` in the codebase is **already safe** (verified: messages:415, marketing:288/301, calendar:74/82, autoreply:466-482, team:262, scheduled:162-167). The violations are all raw elements: `size-7` icon buttons (SetupWarnings:133, login:231, register:209/239, telegram:67), `h-8` radios/selects (support:309, team:232, billing:345), and the Switch track (34px hit height).
**Fix pattern:** `size-11 min-h-11 min-w-11` on icon-only buttons; `h-11` on radios/selects/tabs.

### S4 — Truncation debt on live-value rows (P2 family) — 7 instances
`min-w-0`+`truncate` is applied inconsistently on data rows that render live Facebook/CRM strings: `team:206`, `tools:185`, `ads:98`, `comments:178`, `reports:264`, `billing:283`, `posts:245`. RTL Arabic + Latin names make overflow likely.

### S5 — Horizontal-scroll tables without mobile card fallback (P2 family)
All 4 `<table>`s except demo's are wrapped in `overflow-x-auto` (no checklist-2 violations besides demo). Admin tables (7–8 cols) degrade to a long horizontal scroll; `data-label` attributes are already present, so a `hidden md:table` + mobile card-list swap is cheap.

---

## 5. Top-10 Fix Priority List

| # | Issue | Files | Sev | Effort |
|---|---|---|---|---|
| 1 | Reports PDF controls clipped (unreachable download button @375px) | `dashboard/reports/page.tsx:190-220` | P0 | S |
| 2 | Team confirm-delete row overflow (destructive confirm clipped) | `dashboard/team/page.tsx:201-269` | P1 | S |
| 3 | Sequences confirm-delete row overflow | `dashboard/sequences/page.tsx:702-765` | P1 | S |
| 4 | iOS zoom family: 11 raw inputs/textareas/selects <16px | see §4 S2 list | P1 | M |
| 5 | Comments quick-reply input `h-8 text-sm` (zoom + 32px) | `dashboard/comments/page.tsx:198-210` | P1 | XS |
| 6 | Support ticket reply `h-9 text-xs` + priority radios `h-8` | `dashboard/support/page.tsx:302-317, 502-512` | P1 | XS |
| 7 | Team role `select h-8 text-xs` + billing provider tabs `h-8` | `team:227`, `billing:336-353` | P1 | XS |
| 8 | SetupWarnings dismiss X `size-7` (on every dashboard page) | `components/shared/SetupWarnings.tsx:126-134` | P1 | XS |
| 9 | Password-eye toggles `size-7` (login/register/admin-telegram) | `login:231`, `RegisterForm:209/239`, `TelegramConfigSection:67` | P1 | XS |
| 10 | Switch hit-area 34px + scheduled datetime squeeze | `ui/switch.tsx:29`, `scheduled:107-124` | P1 | XS |

**Backlog (P2):** demo table scroll wrapper, analytics heatmap mobile density (12-col or scroll), truncation family (S4), admin table card fallback, PageHeader `px-4 sm:px-6`, `text-3xs` 10px bump, messages filter chips `py-2.5`, calendar nav `gap-2`, marketing stats `flex-wrap`, KpiCard value `truncate`.

---

## 6. Regression guards (recommended)

1. **E2E:** extend `e2e/mobile-nav.spec.ts` with a 375px pass asserting `document.documentElement.scrollWidth <= 375` on team, sequences, reports (catches every S1 regression).
2. **Unit:** a `rg`-style script gate (like `check_a11y_labels.ts`) rejecting raw `<input|textarea|select … text-(sm|xs)` without `text-base` outside `md:` variants.
3. **Visual:** pin the reports PDF row + team confirm row at 375px in `viewport-sweep.mjs`.

*Audit was READ-ONLY — no source files were modified. Screenshots of prior rounds (docs/screenshots/mobile-screenshot.png, v6plus-*-mobile.png) corroborate the shell pattern; all findings above are code-verified.*
