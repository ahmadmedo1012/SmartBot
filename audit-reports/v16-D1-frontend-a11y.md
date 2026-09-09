# v16-D1 — Frontend RTL/a11y Deep Audit (2026-09-09)

Method: static analysis + live Playwright measurement of real Tab presses (activeElement + bounding boxes) on /, /pricing, /login, /register, /subscribe × mobile/desktop + contrast gate run.

## LEAD A — p11-rtl-tab-order: root cause re-scoped (CONFIRMED, MEDIUM)
DOM order matches RTL visual order everywhere (RTL flex/grid). The x=16 first-stop defect is the SKIP LINK:
- src/app/layout.tsx:97 — `focus:absolute focus:top-4 focus:end-4`: in RTL `end` = LEFT → revealed link appears at left edge, then Tab 2 jumps to right edge. Also `focus:absolute` = document coords → when scrolled, link renders off-viewport (measured y=−784).
- Fix (one line): `focus:absolute focus:end-4` → `focus:fixed focus:start-4`.

## LEAD B — p12-wizard-focus-advance: PARTIALLY FIXED
- FORWARD path FIXED: OnboardingWizard.tsx:252-258 — rAF focuses #onboarding-step-title (h2 tabIndex={-1} :354 with focus-visible ring).
- STILL BROKEN: handleBack (:266-272) and step-3 skip-setup button (:570-581) call setStep() with NO focus management; key={step} at :318 remounts the whole card incl. footer → focus falls to <body> outside role=dialog → first Tab escapes the modal (trap listener attached to panel :274-295 only intercepts when focus is inside).
- Fix: `focusStepTitle()` helper called in handleBack + skip-setup onClick; vitest asserting activeElement inside [role=dialog].

## LEAD C — fresh sweep
| # | Sev | Location | Finding | Fix |
|---|---|---|---|---|
| C1 | HIGH | Header.tsx:164-167 | auto-hide uses translate-y-full only → after scroll, first 6 tab stops invisible (measured y=−50) | add `invisible` to hidden branch + `transition-[transform,visibility]` |
| C2 | MED | 8 nested Link>Button CTAs: page.tsx:154,159; FinalCTASection.tsx:43,46; login/page.tsx:174-182; RegisterForm.tsx:130-138; billing/page.tsx:57; messages/page.tsx:230; global-error.tsx:49; admin/telegram/error.tsx:33 | two Tab presses per CTA; axe nested-interactive advisory | replace inner Button with styled span |
| C3 | MED | 13 raw inputs missing dir="auto": autoreply:93,104,114,125; tools:94-96; scheduled:99; marketing:172; comments:132; posts:82; messages:379; support:320,479; demo:341; payment-instructions:243; OnboardingWizard.tsx:477 | bidi garbling of auto-replies | add dir="auto" or migrate to shared Input/Textarea |
| C4 | LOW | login/page.tsx:214, RegisterForm.tsx:166 | autoFocus steals focus on late mount (3G) | optional: focus only if activeElement===body |

## Verified GREEN
Icon-only aria-labels 20+ spot-checked (zero generic «زر»); Input/Textarea seam bakes dir=auto (input.tsx:49, textarea.tsx:12); global :focus-visible fallback (globals.css:379-380); dialogs/sheets trap+Escape (5 surfaces); contrast gate 14/14 pairs ≥4.5:1 dark+light; prefers-reduced-motion global kill-switch + per-component guards incl. WIZARD_MOTION_CSS (:50-52).

## Top-5 actions for v16
1. Skip-link one-liner (closes p11). 2. Wizard back/skip focus + test (completes p12-t8). 3. Header invisible when hidden. 4. Un-nest 8 CTAs. 5. dir=auto batch.
