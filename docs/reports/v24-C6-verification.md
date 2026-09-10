# v24-C6 — A11y Contrast Fixes (Implementation Verification)

- **Task ID:** v24-C6 · **Agent:** c6-a11y (Implementation Agent C6-A11Y)
- **Scope:** the 5 contrast/orientation findings from `docs/reports/v24-B4-a11y-rtl.md` (§5 findings 1-3 + §7 orientation + §8 systemic rec) + CI regression pins
- **Method:** every ratio below computed with the repo's canonical math (oklch → linear sRGB → gamma sRGB → WCAG 2.1 relative luminance — identical to `scripts/check_contrast.mjs`), before AND after each change, in BOTH themes.

---

## 1. Before → After contrast table (all measured)

| # | Pair (WCAG criterion) | Theme | Before | After | Verdict |
|---|---|---|---|---|---|
| 1 | `--input` border / card — field boundary (1.4.11, ≥3:1) | light | **1.53:1** ❌ | **3.36:1** | ✅ |
| 1b | `--input` border / background (1.4.11) | light | 1.47:1 ❌ | 3.22:1 | ✅ |
| 1c | `--input` border / card · background (1.4.11, v10-I3 held) | dark | 3.11 · 3.20 | 3.11 · 3.20 (untouched) | ✅ |
| 2 | espresso text / **ember** end of flame gradient (1.4.3, ≥4.5:1) | dark | **2.24:1** ❌ | **4.77:1** | ✅ |
| 2b | espresso / ember end | light | **2.91:1** ❌ | **4.79:1** | ✅ |
| 2c | espresso / **saffron** end (1.4.3) | both | 8.97:1 | 8.97:1 (untouched) | ✅ |
| 2d | espresso / gradient midpoint | dark | ~4.6:1 ⚠ | 6.56:1 | ✅ |
| 3 | landing metric badge: accent-foreground text over its /10 tint over card (1.4.3, 10px bold) | dark | **4.28:1** ❌ (B4: 4.35) | **5.02:1** | ✅ |
| 3b | landing metric badge | light | 4.73:1 | 5.48:1 | ✅ |
| 4 | PWA manifest orientation (1.3.4) | — | `"portrait"` lock | key removed | ✅ (verified in built `.next/server/app/manifest.webmanifest.body`) |

All 43 previously-passing B4 pairs remain passing (38-pair gate output below; nothing but the 5 target values changed).

---

## 2. Changes per file (5 files, all in C6 ownership)

### `fb_dashboard/frontend/src/app/globals.css` — 3 token values, color-only
- **`.light --input`: `oklch(0.86 0.008 70)` → `oklch(0.64 0.008 70)`** — 1.53:1 → 3.36:1 vs card / 3.22:1 vs background (light fields are `bg-transparent`, so card+background are the real adjacent surfaces; `disabled:bg-muted` fields are WCAG-exempt). The light counterpart of v10-I3's dark raise; `--border` stays 0.86 (decorative dividers ≠ field boundaries — same split as dark mode). *Note: B4's suggested 0.70 measures only 2.67:1 — computed, rejected; 0.64 is the minimal 2-decimal L passing both surfaces with ≥0.22 headroom.*
- **`:root --c-ember`: `oklch(0.44 0.17 52)` → `oklch(0.62 0.17 52)`** and **`.light --c-ember`: `oklch(0.5 0.15 52)` → `oklch(0.62 0.15 52)`** — the flame gradient's dark stop was the only failing surface. **Text-side fix is mathematically impossible:** espresso `#1a130b` is near-black; even pure `#000` caps at 2.55:1 on old dark ember — so the stop was lightened to the 4.5:1 floor (L 0.61 minimum; 0.62 chosen for headroom). Hue/chroma unchanged, saffron end untouched, gradient luminance stays monotonic ⇒ every mid-stop ≥ the ember-end ratio; `hover:brightness-110` only lightens further (dark text → contrast increases). Espresso token unchanged (brand coffee color; also used on saffron payment headers at 5.9:1+). Because all 3 affected components read `var(--c-ember)`, **zero component edits were needed for task 3** (minimum-token principle); the decorative ember→saffron hairline (PlanSelector wide card) rides along and stays consistent with the badge on the same card.
- Each change carries an inline `/* v24-C6: before → after (criterion) */` comment with the math.

### `fb_dashboard/frontend/src/app/manifest.ts`
- Removed `orientation: "portrait"` (WCAG 1.3.4 — landscape users of the installed PWA were locked out). Verified absent in the production build output.

### `fb_dashboard/frontend/src/components/landing/LandingIslands.tsx` (exact path: `src/components/landing/`, line 107)
- Testimonial metric badge: `text-accent-foreground/90` → `text-accent-foreground` (full-opacity token — the v15-E6 `/80→full` pattern). One class; bg tint, border, size, position untouched. The hero-trust/eyebrow `/90` usages (lines 32/83) were verified passing (4.63:1 dark / 5.28:1 light over plain background) and left alone.

### `scripts/check_contrast.mjs` (repo-root scripts/, already wired in `gate_all.sh:291`)
- **10 new pinned pairs** (5 per theme) as CI assertions — the B4 systemic recommendation:
  `input/card ≥3` · `input/background ≥3` (pins v10-I3 dark AND the new light fix) · `espresso/ember ≥4.5` · `espresso/saffron ≥4.5` · `accent-foreground over __tint10-over-card ≥4.5` (landing-badge composite).
- Script upgrades to support them: hex token parsing (`--c-espresso #1a130b`), `.light`→`:root` cascade merge (light inherits tokens it doesn't override — correct CSS custom-property semantics), per-pair minimum (5th tuple element; default 4.5, 3.0 for the 1.4.11 non-text pairs), fixed run-path doc. **No package.json change needed — the gate is already invoked by `scripts/gate_all.sh` (5e).**

### `fb_dashboard/frontend/src/test/ContrastTokens.test.tsx` — NEW (6 vitest pins)
- Vitest twins of the CI gate (same oklch→sRGB→WCAG math): the 4 B4 pair families asserted in both themes, with regression headroom (>3.2 input, >4.7 flame ends so a 2-decimal drift fails); **plus** a manifest pin (`orientation` undefined) and a **behavioral** pin that renders `LandingTestimonials` (mocked `/api/public/testimonials`) and asserts the metric badge class is full-opacity `text-accent-foreground` — the one regression (`/90` re-add) that token math cannot see.

---

## 3. Task coverage vs assignment

| Task | Status |
|---|---|
| 1. P2 light `--input` 3:1 | ✅ 1.53 → 3.36/3.22 (dark untouched, verified) |
| 2. P2 manifest orientation | ✅ key removed, build-verified |
| 3. P2 flame gradient 4.5:1 both themes | ✅ 2.24/2.91 → 4.77/4.79 via 2 ember tokens; button.tsx / PlanSelector.tsx (:112) / StepIndicator.tsx (:71) all consume `var(--c-ember)` — no component edits needed |
| 4. P3 LandingIslands badge | ✅ 4.28 → 5.02 dark / 4.73 → 5.48 light |
| 5. P4 MobileBottomNav close 40px | ⛔ **SKIPPED per instructions** — file owned by another agent (their in-flight 46-line diff to `MobileBottomNav.tsx` was visible in the shared tree during this session) |
| 6. check_contrast.mjs assertions | ✅ 10 pins + per-pair minimums + hex/cascade parsing; already wired in gate_all.sh |
| 7. P4 PageHeader zoom-clip min-h | ⛔ **SKIPPED** — `components/ui/PageHeader.tsx` is a shared primitive whose consumers (dashboard pages) are owned by parallel agents → falls outside my ownership per the task's own rule; C1 also left "PageHeader px" explicitly in backlog. Recommend the layout agent applies `min-h` + wrap when it takes the A1 P2 backlog |
| messages/page.tsx aria-live | ⛔ untouched (C2 owns; already implemented per worklog) |

---

## 4. Verification gates (run in `fb_dashboard/frontend`)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — 0 errors |
| `npx vitest run` | **PASS — 49 files / 398 tests** (v24-00 baseline 386 → 392 after C2 → 398 with the 6 new C6 pins) |
| `node ../../scripts/check_contrast.mjs` | **PASS — 38 pairs** (14 core ×2 themes + 10 v24-C6 pins), every pair ≥ its minimum |
| `npx next build` | **PASS** — compiled + typechecked + prerendered, 41 routes, `/manifest.webmanifest` emitted without orientation |
| `npx tsx ../../scripts/check_a11y_labels.ts` | PASS — 0 unnamed icon-only controls (185 files) |
| `python3 scripts/check-css-token-duplication.py` (repo root) | OK — 116 unique custom properties (globals.css edit introduced no duplicates) |

**Parallel-agent note:** mid-session, `npx vitest`/`tsc`/`build` transiently failed in `src/lib/query-persist.ts` + `src/test/AuthGuard.test.tsx` — both files were being written *concurrently* by the C3 perf agent's `useMe` refactor (git timestamps + stack trace: `useMe.ts:58 → AuthGuard.tsx:64`, zero relation to C6 files). Re-runs after that agent's edit settled are fully green as tabled above; no C6 file ever appeared in any failure.

## 5. Constraints honored

- Color values + manifest only — zero changes to radii/spacing/sizes/layout; brand gradient hue/chroma and saffron stop unchanged (identity preserved).
- Light AND dark both pass (every changed pair measured in both themes; dark `--input` re-verified at 3.11/3.20).
- No commits, no new dependencies, no files outside ownership touched.

## 6. Follow-ups (out of ownership, for the orchestrator)

1. `README.md:63` still advertises "30/30 pairs" — now 38 (doc owner).
2. `docs/design-system.md` may document the ember lightness (0.44/0.5 → 0.62) — doc owner.
3. PageHeader `min-h` at 200% zoom (P4) + MobileBottomNav close 40px (P4) — layout/nav owners (task 5/7 skips above).
