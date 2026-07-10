# SmartBot — Premium Dashboard Redesign

**Date:** 2026-07-10
**Scope:** UI/UX visual transformation only — no backend, no bot logic, no automation engine

## Design Principles

1. **Calm hierarchy** — every page has one primary action, clear reading order, no visual shouting
2. **Systematic, not decorative** — every gradient, shadow, and animation serves a structural purpose
3. **Arabic-first RTL** — the rhythm respects right-to-left reading, not a mirrored left-to-right design
4. **Depth through layering** — surfaces use subtle backdrop blur, border transparency, and multi-stop shadows (not heavy drop shadows)
5. **Consistent pacing** — 4px grid spacing, unified transition curves, single animation language

## Typography

| Level | Size | Weight | Line Height | Letter Spacing | Use |
|-------|------|--------|-------------|----------------|-----|
| h1 | 24px | 700 | 1.25 | -0.03em | Page titles |
| h2 | 18px | 650 | 1.3 | -0.02em | Section headers |
| h3 | 15px | 600 | 1.35 | -0.01em | Card titles |
| h4 | 13px | 600 | 1.4 | 0 | Card subtitles |
| Body | 14px | 400 | 1.6 | 0 | Default text |
| Small | 12px | 400 | 1.5 | 0 | Labels, meta |
| Micro | 11px | 500 | 1.4 | 0.02em | Badges, table headers |
| Mono | 13px | 400 | 1.5 | -0.01em | Metrics, timestamps |

- **Font stack:** Cairo (sans), Cairo (heading), JetBrains Mono (mono) — no changes needed
- **Responsive:** single breakpoint at 768px for font scaling; no jump at 640px or 1024px

## Color Tokens (revised)

Retain HSL variable system. Key adjustments:
- **Dark mode backgrounds:** deepen `--background` to 225 30% 3%, `--card` to 228 28% 7%
- **Light mode:** warm the background to 40 20% 97%, cards remain white
- **Accent hierarchy:** green (`--accent`) as primary accent for active states, purple-blue (`--primary`) for brand identity
- **Borders:** thinner, more transparent (0.3 alpha on dark, 0.5 on light)
- **Muted foreground:** slightly higher contrast (58% on dark → 62%)
- **Ring/focus:** accent-consistent across both modes

## Spacing System

- Base unit: 4px (0.25rem)
- Card padding: 5 units (20px)
- Section gap: 8 units (32px)
- Content max-width: 1280px
- Grid gaps: 4 units (16px) between cards
- Table cell padding: 12px horizontal, 10px vertical

## Component Architecture

### Card System (unified)

One base Card with two interactive variants:
- **Card** — glass backdrop, subtle border, layered shadow
- **CardInteractive** — inherits Card + hover lift (translateY -2px) + accent border
- **CardHighlight** — CardInteractive + top accent stripe (colored)

No more `CardBordered`, `glass-card`, `card-premium`, `card-deep` as distinct abstractions. All premium effects are variants of the same Card.

### Button System

Keep current CVA structure. Enhancements:
- Remove `pill` sizes (adds complexity without value)
- Add `ghost-accent` variant for secondary icon buttons
- All buttons: consistent 200ms transition, 0.98 scale on press

### Form Inputs

- Input, Select, Textarea: unified 40px height, same border/focus treatment
- Focus ring: offset-1px (tighter), 2px ring at 0.4 alpha
- Error state: red border + icon + helper text (keep current pattern)

### Tables

- Remove `.data-table` CSS class — use `<Table>` component everywhere
- Header: sticky, uppercase tracking, 11px
- Rows: 48px height, subtle divider, hover tint
- Striped optional

### Navigation (Sidebar)

- Current glass-sidebar pattern is good → keep
- Collapse: CSS width transition (180px ↔ 56px) instead of translateX hack
- Active state: accent glow pill (keep current pattern)
- Section labels: hidden when collapsed

### Notifications

- Keep Sonner-based ToastBridge
- Custom styling via `.notif-toast` classes already present
- Add slide-in animation from the right (not left — RTL)

### Empty States

- Illustrated (centered icon in glass container)
- Title + description + optional CTA
- Animation: fade-in + subtle scale

### Loading States

- Skeleton: content-matching shapes (not generic bars)
- Shimmer speed: 2.5s (consistent)
- Metric loading: pulse glass card (keep current)

## Animation Language

- **Transition curve:** `cubic-bezier(0.16, 1, 0.3, 1)` everywhere
- **Duration:** 200ms default, 300ms for enter, 150ms for exit
- **Page transitions:** 280ms, y-offset 12px, scale 0.98
- **Metric counter:** spring physics (stiffness 40, damping 12)
- **Hover lift:** translateY -2px, 200ms
- **Press:** scale 0.98, 100ms
- **Reduced motion:** respect `prefers-reduced-motion` (already implemented)

## Page Layout

```
┌──────────────────────────────────────────────────┐
│                     Topbar                         │
│ [Logo] [Page Title]          [Search] [Theme] [Avatar] │
├──────┬─────────────────────────────────────────────┤
│      │                                             │
│ Side │         Content Area                        │
│ bar  │   ┌──────┬──────┬──────┬──────┐             │
│(coll │   │Metric│Metric│Metric│Metric│             │
│ or   │   │Card  │Card  │Card  │Card  │             │
│exp)  │   └──────┴──────┴──────┴──────┘             │
│      │   ┌─────────────────┬──────────────┐        │
│      │   │     Chart       │   Activity   │        │
│      │   │                 │   Timeline   │        │
│      │   └─────────────────┴──────────────┘        │
│      │   ┌─────────────────────────────────────┐   │
│      │   │        Data Table                    │   │
│      │   └─────────────────────────────────────┘   │
└──────┴─────────────────────────────────────────────┘
```

## Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| < 640px | Single column, bottom nav |
| 640-1023 | 2-column metrics, stacked content |
| 1024-1439 | 4-column metrics, sidebar + content |
| 1440+ | Max 1280px centered content |

## Implementation Order

### Phase A: Foundation (CSS tokens + layout)
1. Refactor `index.css` — consolidate token system, remove duplicate utility classes
2. Unify card system — reduce 3+ variants to 1 base + 2 interactive
3. Fix sidebar collapse — CSS width transition instead of translateX
4. Enforce consistent spacing rhythm

### Phase B: Component sweep
5. Update button CVA — remove unused variants, add ghost-accent
6. Update form inputs — unified height, tighter focus ring
7. Update tables — apply new Table component everywhere
8. Update badges, skeleton, dialog, dropdown

### Phase C: Page polish
9. Dashboard — enhanced metric cards, tighter chart, better empty states
10. Login page — refined glass effect, cleaner form
11. Settings, Users, Messages pages — consistent card layout
12. All 28 pages — responsive pass, overflow checks

### Phase D: Polish & QA
13. Animation consistency pass
14. Focus ring audit (accessibility)
15. Dark/light mode contrast verification
16. Mobile responsive QA

## Files to Modify

- `src/index.css` — major refactor (design tokens, utility consolidation)
- `src/components/ui/card.jsx` — unify variants
- `src/components/ui/button.jsx` — clean up CVA
- `src/components/ui/input.jsx` — focus ring update
- `src/components/ui/select.jsx` — focus ring update
- `src/components/ui/table.jsx` — spacing refinement
- `src/components/ui/badge.jsx` — variant cleanup
- `src/components/ui/dialog.jsx` — animation polish
- `src/components/topbar.jsx` — sidebar collapse fix
- `src/pages/dashboard.jsx` — metric cards, spacing, empty states

## Non-Goals

- No backend logic changes
- No bot/rules engine changes
- No new features
- No dependency additions
- No font changes (Cairo stays)
- No restructuring of React component tree
