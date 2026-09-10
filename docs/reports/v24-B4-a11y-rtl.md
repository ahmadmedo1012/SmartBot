# v24-B4 — Accessibility + RTL Correctness Audit (Static, Read-Only)

- **Task ID:** v24-B4 · **Agent:** a11y-rtl-auditor (A11Y-RTL)
- **Scope:** `/home/z/my-project/SmartBot/fb_dashboard/frontend` (Next.js 16 · React 19 · Tailwind 4 · next-themes · RTL Arabic-first, mobile-first audience)
- **Method:** static analysis — full reads of root layout / providers / globals.css / fonts.css / ui primitives (dialog, button, input, switch, textarea, label, card, toaster) / shell + nav / messages / comments / analytics pages; anti-pattern greps (physical props, translate-x, rtl: variants, rotate-180, directional icons); heuristic accessible-name scan of every `<button|Button>` (184 files); **computed WCAG contrast (oklch→sRGB→WCAG) for 47 token pairs in both themes**; regression re-run of the repo's own gate `scripts/check_a11y_labels.ts` (PASS: 0 unnamed icon-only controls).
- **No source files modified.**

---

## 1. Executive summary

The frontend is in **unusually good a11y shape for an Arabic RTL SaaS** — this is the measurable payoff of the v6→v23 remediation lineage. Document setup is correct (`<html lang="ar" dir="rtl">`, class-based theming with sound hydration, local-first subsetted Arabic fonts with `font-display: swap` + preload). Physical-property RTL debt is **near zero** (0 `ml/mr`, 0 `border-l/r`, `text-left` only on documented LTR islands). The v7 directional-icon regime **held with zero regressions**; icon-only buttons are 100% labeled (repo gate re-run: 0 violations across 184 files). Contrast passes AA on **43 of 47 computed pairs** in *both* themes, and focus management (traps, Escape, restore, skip-link, scroll-padding) is implemented consistently across all five overlay systems.

The residual risk is concentrated in **five gaps**, four of them new (post-v17 drift) rather than regressions:

| # | Finding | Sev |
|---|---|---|
| 1 | Messages thread has **no live region** — new messages (5s poll) and replies are never announced to screen readers on the app's most SR-critical page | **P1** |
| 2 | **Light-mode `--input` border = 1.53:1** (WCAG 1.4.11) — the v10-I3 3:1 fix was applied to dark mode only | **P2** |
| 3 | PWA manifest locks **`orientation: "portrait"`** (WCAG 1.3.4) | **P2** |
| 4 | **Flame-gradient espresso text** fails at the ember end (2.24:1 dark / 2.91:1 light) in 3 components | **P2** |
| 5 | Raw-input family: **<44px targets + <16px text** (iOS focus-zoom) on 8 fields | **P2** |

**RTL regression verdict: HELD.** All ten tracked v7/v8/v9/v10/v14/v16 fixes verified intact (§6). One asymmetry (light-mode input border) is a fix that stopped at dark mode, not a regression.

**Counts by category** (details below): RTL physical-property hits 12 (0 hard bugs, 3 low fragile-intent, 9–10 documented-intentional LTR islands) · ARIA: 0 unlabeled icon buttons, 145 aria-labels, 21 live regions, 5 substantive gaps · Contrast: 47 pairs computed → 43 PASS / 3 FAIL / 1 marginal · Touch: 9 sub-44px targets (all raw inputs/nav close) · Reduced motion: PASS (global override + 10 component guards + 3 JS clamps) · Orientation: 1 lock · Zoom: 2 minor clipping risks.

---

## 2. Document setup, theme, fonts — PASS

| Check | Evidence | Status |
|---|---|---|
| `dir="rtl" lang="ar"` | `src/app/layout.tsx:66` — `<html lang="ar" dir="rtl" suppressHydrationWarning>` | ✅ |
| Theme hydration | `providers.tsx` next-themes `attribute="class" defaultTheme="dark" enableSystem` + `suppressHydrationWarning`; `:root { color-scheme: dark }` / `.light { color-scheme: light }` (globals.css:137/276) re-tints UA controls pre-hydration; `@custom-variant dark (&:is(.dark *))` | ✅ no FOUC / no class-mismatch hydration warning |
| OG locale | `ar_LY` (layout.tsx:30) | ✅ |
| Arabic fonts | `public/fonts/fonts.css`: Cairo (arabic+latin subsets, 400–800), Readex Pro (2 subsets), Noto Naskh — all `font-display: swap`, `unicode-range` split; **preload** of `cairo-arabic.woff2` + `readex-pro.woff2` with `crossOrigin` (layout.tsx:73-74); `--font-cairo: "Cairo"` defined in fonts.css `:root` (v9-E1 invalid-at-computed-value fix held) | ✅ |
| Arabic typography guards | `html[dir="rtl"] { letter-spacing: 0 }` + tracking utility nuke `[class*="tracking-"]` (globals.css:386-389) — protects letter joins | ✅ |
| Bidi isolation | `dir="auto"` on all live user values (message bodies, sender names, comment text, replies, token fields) — messages:95/100/560, comments:187/208, Input:49, Textarea:19 | ✅ |
| Number convention | `lib/format.ts` — single seam, ar-LY Western digits + dot grouping, Arabic month names (CI-enforced by `check_i18n_calls.py`) | ✅ |

---

## 3. RTL correctness — physical-property findings

Grep sweep: `ml-/mr-/pl-/pr-` → **1 hit**; `left-/right-` → **12 hits**; `text-left` → **9 hits**; `border-l/r` → **0**; logical adoption: `text-start`×27, `ps-`×11, `start-`×17, `end-`×12, `ms-auto`×6, `border-s-`×6, `rounded-ss/se`×4.

| File:Line | Class | Verdict | Note / fix |
|---|---|---|---|
| `admin/telegram/TelegramConfigSection.tsx:66` | `text-left pl-10` (+ `dir="ltr"`) | ✅ **Intentional** — LTR island for bot-token input; physical left alignment is correct inside the island | none |
| `admin/telegram/{DiagnosticsSection:91, TelegramConfigSection:98,107, BroadcastTargetsSection:63}` | `text-left` + `dir="ltr"` | ✅ Intentional LTR islands (IDs, numeric targets) | none |
| `components/shared/payment/{payment-instructions:109,226, index:672, copy-field:53}` | `text-left font-mono` | ✅ Intentional — monospace LTR numerals (wallet/account numbers) | none |
| `dialog.tsx:58`, `GlowPool.tsx:13,24`, `pricing/page.tsx:101,235`, `page.tsx:120`, `FinalCTASection.tsx:27` | `left-1/2 -translate-x-1/2` | ✅ Symmetric centering — direction-neutral | none |
| `connect/page.tsx:294` | `left-4 right-4` | ✅ Symmetric | none |
| `DashboardShell.tsx:57`, `demo/page.tsx:532` | `fixed top-0 right-0` (sidebar) | 🟡 **Intentional-but-physical** — right = start edge in this RTL-only app (documented v14-E5: "App is RTL-only") | Swap to `start-0` for future-proofing (cosmetic today) |
| `AdminSidebar.tsx:170` | `hover:-translate-x-[3px]` | 🟡 Intentional-but-physical — nudge inward from right-pinned edge (documented) | `group-hover:-translate…` is fine RTL-only; would invert under LTR |
| `LandingIslands.tsx:107` | `absolute top-4 left-4` (testimonial metric badge) | 🟡 Cosmetic — badge pinned to end-side in RTL; no functional impact | optional `start-4` |
| `button.tsx:11` + 7 inlined copies (page.tsx:162/167, messages:411, billing:203, login:180, register:136, global-error:52, admin/telegram/error:36, FinalCTA:47/52) | `before:-translate-x-full → hover:before:translate-x-full` (sheen sweep) | 🟢 Decorative — sweep direction is physical (LTR-ish) in RTL; invisible to AT, purely cosmetic | none (or `rtl:` mirror if polish desired) |
| `switch.tsx:50` | `rtl:-translate-x-[calc(100%-2px)]` | ✅ **Correct** — RTL thumb flip (v7 fix held) | none |
| `messages/page.tsx:69-70`, `comments:190` | `border-s-[3px] border-s-primary` / `border-s-2` | ✅ Logical start-side indicator | none |
| `FloatingWhatsApp.tsx:77` | `end-[max(1rem,env(safe-area-inset-left…))]` | ✅ Logical end-anchoring with the matching physical safe-area side | none |

**Hard RTL bugs: 0.** `bg-gradient-to-l/to-r` gradients (ConvItem, filter chips, flame) are physical but decorative.

### Charts in RTL
- `charts/index.tsx`, `charts/TrendLineChart.tsx` — recharts `XAxis` renders LTR (no `reversed`); **YAxis hidden**; time axis left→right = the conventional treatment for time series in RTL products (Libyan users read chart time LTR). Tick labels are dates (`MM-DD` Western digits, ar-LY convention), tooltips are Arabic with `countPhrase` plurals, colors from tokens (`var(--primary)`, no raw hex), **sr-only text alternative** on every chart (v8-B14 held), `isAnimationActive` gated on `usePrefersReducedMotion` (7 hook instances). ✅ (document XAxis-LTR as a convention so nobody "fixes" it later).
- `ComparisonBars` — flex row + `w-16` label: in RTL the label renders at the right (start) and bars grow right→left. ✅ logical.

---

## 4. ARIA audit

### 4.1 Icon-only buttons (the #1 historical gap) — 0 violations
Repo gate re-run: `npx tsx scripts/check_a11y_labels.ts` → **"unnamed icon-only interactive controls: 0 · PASS (184 files scanned)"**. My independent heuristic (accessible-name scan of every `<button|Button>`) flagged 20 suspects — **all false positives** (Arabic text content my text-extraction regex mangled). Spot-verified: messages send `aria-label="إرسال الرد"` (messages:586), demo send `aria-label="إرسال"` (demo:352), dialog close `aria-label="إغلاق"` + 48px (dialog.tsx:74), login password eye dynamic label (login:233), theme toggle dynamic label (ThemeToggle:32), Switch callers labeled (BroadcastTargets:80), AI-suggest contextual labels (comments:229-233).

### 4.2 Coverage inventory
`aria-label`×145 · `aria-live`×21 (polite everywhere except toasts) · `role="status"`×20 sites (all `loading.tsx` + inline loaders) · `role="alert"`×15 (errors, toast errors, wizard) · `role="dialog"+aria-modal`×6 overlay systems · `sr-only`×74 · `htmlFor`×40 · `aria-current`×9 · `tabIndex` gated in every collapsed overlay · `aria-describedby` wired through the shared Input (label/hint/error ids, `aria-invalid`) · tables `th scope="col"` + `text-start` (admin/support, admin, demo).

### 4.3 Gaps (worst offenders)
1. **P1 — Messages thread is a dead zone for screen readers** (`messages/page.tsx:467-578`): the thread container is a plain `div`; new incoming messages (5s poll, v23) and optimistic replies land with **no `aria-live` / `role="log"`** — a screen-reader user never knows a customer replied. The page *elsewhere* does live regions right (search status, "مباشر" badge), which makes the omission stark. Fix: `role="log" aria-live="polite"` on the scroll container (or an sr-only announcer fed by the `messages.length` delta effect already present at lines 240-254).
2. **P3 — `role="listitem"` on `<button>`** (`messages/page.tsx:63-66` ConvItem, also notifications page): overriding the native button role means AT announces "list item", hiding the actionable affordance (and any pressed/selected state). Fix: wrap in `<li>` and keep the `<button>` unroled (parent keeps `role="list"`).
3. **P3 — demo chat** (`demo/page.tsx`): simulated bot replies also unannounced (no live region) — demo only.
4. **P4 — `aria-expanded` only 3 sites** (support disclosures ×2, MobileBottomNav "المزيد"): acceptable because FAQ uses native `<details>` (`group-open:`) — but the pattern is easy to forget on future disclosures; the support pages pair it correctly with `aria-controls`.
5. **P4 — no pagination `<nav aria-label>` pattern exists repo-wide** (list pages don't paginate yet; admin/support paginates via buttons — add `nav[aria-label="ترقيم الصفحات"]` when pagination lands).

### 4.4 Semantics
- **Single h1 per render**: every page (PageHeader h1, or sr-only h1 on admin/connect). The "double h1" files (admin:133/154, admin/settings:301/323, admin/telegram:240/259, connect:178/279) are **mutually exclusive branches** (loading/unauthorized vs main) — verified conditional. ✅
- Heading scale sane: h1 (PageHeader) → h2 (ChartCard, landing sections) → h3/h4 (cards). No skipped levels found on sampled pages.
- Message threads/comments/notifications/team/activity use `role="list"/"listitem"` ✅ (see 4.3.2 for the button-role caveat).
- `AdminSidebar.tsx:156-203` — nav items are `div role="link"` with tabIndex + Enter/Space + `aria-current`: fully keyboard-operable, but a native `<Link>` would restore context-menu / open-in-new-tab / hover-URL affordances (P3).
- `card.tsx:35-56` — interactive Card: `role="button"` + `tabIndex` + Enter/Space handler ✅.

---

## 5. Color contrast — computed (oklch→sRGB→WCAG, 47 pairs)

### Dark mode (`:root`)
| Pair | Ratio | Verdict |
|---|---|---|
| foreground / background · card | 17.04 · 16.58 | ✅ |
| muted-foreground / card · bg · muted | 5.59 · 5.74 · 5.46 | ✅ (v-0.62 calibration held) |
| primary-foreground / primary (buttons, bubbles) | 4.94 | ✅ |
| accent-foreground / card · over accent-tint 15% | 5.41 · 4.93 | ✅ (v6 §B held) |
| secondary-foreground / secondary | 8.02 | ✅ |
| placeholder-text / input-bg composite · card | 6.12 · 7.62 | ✅ (v14-E5 held) |
| destructive / card | 4.63 | ✅ (tight) |
| success · warning · info / card | 6.01 · 7.51 · 5.66 | ✅ |
| success · warning · info over their soft tints | 5.30 · 6.42 · 5.00 | ✅ (v8-D2 held) |
| ring (focus) / bg · card | 4.01 · 3.90 | ✅ >3:1 |
| input border / bg · card | 3.20 · 3.11 | ✅ (v10-I3 held) |
| white initials on avatar hsl(h,45%,32%) worst hue | 4.75 | ✅ (v15-E6 held) |
| **espresso / ember (flame gradient, ember end)** | **2.24** | ❌ (see below) |
| espresso / flame midpoint · saffron end | 4.58 · 8.97 | ⚠️ borderline / ✅ |

### Light mode (`.light`)
| Pair | Ratio | Verdict |
|---|---|---|
| foreground / card · bg | 20.27 · 19.44 | ✅ |
| muted-foreground / card · bg · muted | 6.54 · 6.27 · 5.49 | ✅ |
| primary-foreground / primary | 9.02 | ✅ |
| accent-foreground / card · tint 12% | 6.45 · 5.40 | ✅ |
| placeholder / card | 5.51 | ✅ |
| destructive · success · warning · info / card | 4.73 · 5.99 · 5.71 · 6.42 | ✅ (dual-lightness held) |
| ring (focus) / bg · card | 5.01 · 5.22 | ✅ |
| **`--input` (0.86) border / card** | **1.53** | ❌ WCAG 1.4.11 |
| **espresso / ember(light 0.5)** | **2.91** | ❌ |
| espresso / saffron | 8.97 | ✅ |

### Contrast findings
1. **P2 — Light-mode input borders fail 1.4.11.** globals.css:310 `--input: oklch(0.86 0.008 70)` vs card (1.0) = **1.53:1** (needs 3:1). The v10-I3 raise (dark 0.23→0.48, globals.css:215-223) was never mirrored to `.light`. Same family as the "unfocused fields visually disappear" complaint that motivated the dark fix. Fix: light `--input` ≈ `oklch(0.70 0.01 70)` (≈3.2:1 on white) while keeping `--border: 0.86` for decorative dividers — exactly the dark-mode split.
2. **P2 — Flame gradient (ember→saffron) + espresso text.** Worst-case **2.24:1 (dark) / 2.91:1 (light)** at the ember end; midpoint 4.58. Affected: `button.tsx:18` (flame variant — only consumer: PlanSelector:232 "اختيار الخطة", wide button, centered text ≈ midpoint = borderline), `PlanSelector.tsx:112` — "الأكثر شعبية" badge `text-3xs` (10px bold) on `from-ember to-saffron` where RTL text runs from the saffron (right) end toward the ember (left) end → trailing glyphs sit <4.5:1, and `StepIndicator.tsx:71` — active step number `font-extrabold` on the 135° gradient. Fix options: clamp the gradient (`from-[color-mix(…ember 35%, saffron)]`), add an inner `bg-saffron/80` text plate, or switch the small text to `text-primary-foreground` on a solid `--primary` chip.
3. **P3 — LandingIslands.tsx:107** testimonial metric badge: `text-accent-foreground/90` over `bg-accent-foreground/10` composite = **4.35:1 dark** (10px bold → needs 4.5). Light 4.79 ✅. Fix: full-opacity token (the v15-E6 `/80`→full pattern).
4. ✅ Everything else passes in **both** themes — including every status/soft-tint pair, focus rings, and the gradient payment header (`espresso` on saffron/80 = 8.5:1+).

---

## 6. Regression check vs previous fixes — **HELD (10/10)**

| Prior fix | Evidence now | Verdict |
|---|---|---|
| v7 §2.1 DirectionalIcon single mechanism (`rtl:-scale-x-100`) | Component intact + consumed (wizard footer 885/911, PageHeader breadcrumbs:85, messages back:464); all raw directional icons (Send×20, Reply, LogOut×3, ArrowUpRight) carry the same `rtl:-scale-x-100`; dashboard/support + admin/support ChevronLeft exceptions re-documented as disclosure-rotation (lines 300-305/438-442) | ✅ HELD |
| v7 rotate-180 BAN for icons | Only `rotate-180` left: FaqSection:30 `group-open:rotate-180` (disclosure chevron on native `<details>` — rotation, not direction flip) | ✅ HELD |
| v7 icon-only labeling 28/28 | Repo gate re-run: **0 violations / 184 files** | ✅ HELD |
| v8-B3 MobileBottomNav sheet focus trap | Full trap + Escape + restore + aria-modal + tabIndex gating (lines 47-83) | ✅ HELD |
| v8-B14 chart sr-only summaries | Present on all chart components | ✅ HELD |
| v9-B9/v16-E3 skip-link `fixed + start-4` + `#page-content` tabIndex -1 | layout.tsx:110-115 + DashboardShell.tsx:72-75 | ✅ HELD |
| v10-I3 `--input` 3:1 (dark) | 3.11-3.20 measured | ✅ HELD (light-mode gap is *missing counterpart*, not regression) |
| v14-E5 placeholder token AA | 6.12-7.62 measured | ✅ HELD |
| v12-E4.4 toaster `dir="rtl"` + Arabic container label | app-toaster.tsx:19,24 | ✅ HELD |
| v15-E6 avatar initials 32% lightness | 4.75 worst-hue | ✅ HELD |

---

## 7. Focus · keyboard · motion · touch · zoom

**Focus management — PASS.** Skip link (first focusable, in-`<main>`); base-ui Dialog (modal, trap/restore in primitive, `aria-modal`, 48px labeled close); MobileBottomNav sheet & Header MobileMenu & OnboardingWizard each implement trap + Escape + restore + first-focus; `scroll-padding-top: 5rem` (WCAG 2.4.11); FloatingWhatsApp hides itself while any modal is open (focus-not-obscured mitigation); wizard focuses step title + error nodes on change. RTL tab order follows DOM (skip-link fix v16-E3 confirmed at reading-start).

**Keyboard — PASS.** Native `<button>` everywhere except the two documented role workarounds (AdminSidebar `div role="link"`, Card `interactive`) which both carry tabIndex + Enter/Space. support page has RTL-correct arrow-key navigation (ArrowLeft=forward, documented at support:285-292).

**Reduced motion — PASS.** Global kill-switch `* { animation-duration: 0.01ms !important; … }` (globals.css:589-591) + 10 targeted guards (reveal, kinetic, sheet, tt-icon, icon-swap, motion-icon, ai-icon, price-swap) + `usePrefersReducedMotion` JS clamps in 6 components incl. `scrollIntoView` (messages:233-238, the one API CSS can't restrain) + recharts `isAnimationActive`. Joyride transitions inherit the global override.

**Touch — mostly PASS.** Button enforces `min-h-11 min-w-11` (44px) globally (button.tsx:11) — every Button incl. `size="sm"` and the dialog close (48px). Gaps: raw inputs bypass it — `comments:209` h-8 (32px, also `text-sm` <16px → iOS zoom), `support:510` h-9 `text-xs` (12px!), `team:232` h-8 `text-xs`, `autoreply:321` h-9, `messages:358` search `h-9 text-sm` (className override defeats the shared Input's `text-base md:text-sm`), `pages:189/193` h-9; MobileBottomNav close `size-10` (40px). Corroborates v24-A1's S2/S3 families.

**Zoom / orientation — 2 findings.** `manifest.ts:14` **`orientation: "portrait"`** — WCAG 1.3.4 violation for installed PWA users (fix: drop the key or `"natural"`); PageHeader fixed `h-12/h-14` + `truncate` risks clipping 200%-zoom titles (P3; consider `min-h` + `line-clamp`); `text-[9px]` ×4 (3 inside `aria-hidden` hero mockup — exempt; demo:316 unread badge is real but 4.94:1).

---

## 8. Priority fix list

| Pri | Fix | Where | Effort |
|---|---|---|---|
| **P1** | Announce new messages: `role="log" aria-live="polite"` on the thread container (or sr-only announcer on the existing `messages.length` delta effect) | `messages/page.tsx:467` | ~30 min |
| **P2** | Light-mode `--input` → ~`oklch(0.70 0.01 70)` (3:1 on white; keep `--border` 0.86 decorative) | `globals.css:310` | 1 line + measure |
| **P2** | Remove `orientation: "portrait"` from the manifest | `manifest.ts:14` | 1 line |
| **P2** | Flame-gradient text: raise the ember floor (color-mix 35% saffron) or solid `--primary` chip for the 10px badge + step circles | `button.tsx:18`, `PlanSelector.tsx:112`, `StepIndicator.tsx:71` | ~1 h + re-measure |
| **P2** | Raw-input family → shared `Input`/`Textarea` (16px + 44px): comments quick-reply, support reply, team select, autoreply tone, messages search (remove `h-9 text-sm` override), pages fields | 6 files | ~2 h (same recipe as v24-A1 S2/S3) |
| **P3** | Un-role ConvItem buttons: `<li>` wrapper, button keeps native role (also notifications listitems) | `messages/page.tsx:63`, notifications | ~1 h |
| **P3** | LandingIslands metric badge → full-opacity `text-accent-foreground` | `LandingIslands.tsx:107` | 1 line |
| **P3** | AdminSidebar items → native `<Link>` (drop `div role="link"`) | `AdminSidebar.tsx:156` | ~2 h (keeps tour ids) |
| **P3** | OnboardingTour: `placement: "right"` → `"left"`/`"auto"` for the right-pinned RTL sidebar targets | `OnboardingTour.tsx:22-38` | 5 min |
| **P4** | PageHeader `min-h` + wrap at 200%; MobileBottomNav close → `size-11`; demo `text-[9px]` → `text-3xs`; add `nav[aria-label]` when pagination lands | PageHeader, MobileBottomNav:126, demo:316 | backlog |

**Systemic recommendation:** add the 4 failing pairs to `scripts/check_contrast.mjs` as CI assertions (espresso/ember both modes, light `--input`/card, badge composite) so the measured-contrast discipline that got the other 43 pairs passing keeps protecting these too.

---

*Report generated by Agent A11Y-RTL (v24-B4). Static read-only audit — no source modified. Companion reports: v24-A1 (mobile layout — corroborates the raw-input family), v24-A2 (mobile perf).*
