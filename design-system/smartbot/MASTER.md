# Design System Master File — SmartBot (Madarek Truth)

> **STATUS:** This file was rewritten (Task 8-e, Madarek completion) — the
> previous 2026-09-04 edition described a retired teal/orange system
> (#0D9488 / #EA580C / Plus Jakarta Sans / flat 200ms) that never matched
> the shipped product. It is now a **Madarek-truth document**: every value
> below mirrors the canonical Madarek tokens.
>
> **RULE OF RULES:** When building a specific page, first check
> `docs/design-system.md` (the Arabic operational guide) and
> `design-system/pages/[page-name].md` if present — page rules override this
> Master file. If nothing more specific exists, strictly follow the rules
> below. If any file in this repo contradicts Madarek, Madarek wins and the
> file is wrong.

---

**Project:** SmartBot (fb_dashboard — web app + PWA)
**Category:** Productivity Tool (Facebook/Messenger automation dashboard)
**Design language:** Madarek (مدارك) — matte night-and-gold / cream-and-copper

---

## 1. Source of Truth Chain (SSOT)

| Layer | File | Role |
|---|---|---|
| **Upstream SSOT** | `repos/madarek/frontend/src/styles/tokens.css` | The canonical Madarek token sheet. SmartBot does NOT invent values — every color, radius, duration and elevation below is mirrored from it. |
| **Reference digest** | `download/madarek-reference-digest.md` | Extracted read-only snapshot of tokens.css for sibling projects (values + section numbers cited below as §). |
| **Local bridge (this repo)** | `fb_dashboard/frontend/src/app/globals.css` | The ONLY file in SmartBot that defines design tokens. Dark block `:root` + light block `.light`, Tailwind v4 `@theme inline` bridge to utility classes. |
| Fonts | `fb_dashboard/frontend/public/fonts/fonts.css` | Self-hosted 12-file IBM Plex woff2 set; `--font-cairo` shim name resolves to "IBM Plex Sans Arabic". |
| Operational guide (Arabic) | `docs/design-system.md` | Semantic usage rules (which token for which role) in Arabic. |

**Forbidden:** introducing a raw hex, font, shadow, duration or radius in a
component. Everything is a token from `globals.css`. A component with a
hard-coded `#…`, `font-family:`, `box-shadow:` or `transition: 300ms` is a
bug.

---

## 2. Color Systems

### 2.1 Dark — مدارك night (the flagship, default mode)

| Role | Token (`globals.css`) | Value |
|---|---|---|
| Page ground (night) | `--background` | `#070B16` |
| Surface (raised card) | `--card` / `--popover` | `#0D1428` |
| Surface-2 / soft bg | `--secondary` / `--muted` | `#121A36` |
| Primary ink (warm sand) | `--foreground` | `#F2EFE6` |
| Secondary text | `--muted-foreground` | `#C3C8DC` |
| Muted text / placeholder | `--placeholder-text` | `#8E97B8` |
| **Brand solid — gold** | `--primary` | `#E9B44C` |
| Text on gold | `--primary-foreground` | `#05070F` |
| Strong gold (gradient partner, focus ring) | `--state-focus-ring-color`, `--c-ember` | `#C9962F` |
| Accent hint (soft hover tint only) | `--accent` | gold @ 15% (oklch) |
| Accent-as-text (AA) | `--accent-foreground` | gold `#E9B44C` (oklch form) |
| Hairline border | `--border` | `#1B2444` |
| Field border (WCAG 1.4.11) | `--input` | `#7A83A0` |
| Danger (rose-ink) | `--destructive` | `#F0938F` |

Brand gradient (buttons/CTA metal): `linear-gradient(135deg, #C9962F, #E9B44C)`
(`--c-ember → --c-saffron`). Text on it: `#05070F` (espresso).

### 2.2 Light — مدارك cream (paper mode)

| Role | Token | Value |
|---|---|---|
| Page ground (cream) | `--background` | `#FBFAF9` |
| Surface (white card) | `--card` / `--popover` | `#FFFFFF` |
| Surface-2 / soft bg | `--secondary` / `--muted` | `#F7F6F3` / `#F1EFEC` |
| Primary ink | `--foreground` | `#191918` |
| Secondary text | `--muted-foreground` | `#4F4D48` |
| Muted text / placeholder | `--placeholder-text` | `#6E6C65` |
| **Brand solid — copper** | `--primary` | `#B57438` |
| Text on copper | `--primary-foreground` | `#1A0F06` |
| Copper-deep (accent-as-text, focus ring) | `--accent-foreground`, `--state-focus-ring-color` | `#5C3416` |
| Hairline border | `--border` | `#E9E7E2` |
| Field border | `--input` | `#6E6C65` |
| Danger (rose-deep) | `--destructive` | `#6B2128` |

Brand gradient light: `linear-gradient(135deg, #B57438, #D6A330)`.

### 2.3 Status colors (both modes)

| Status | Dark (`--success`…) | Dark soft (`-soft`) | Light | Light soft |
|---|---|---|---|---|
| success (mint) | `#7FD39A` | `#0F241C` | `#1F4F30` | `#DCF1E2` |
| warning (yellow) | `#ECC97D` | `#2C2410` | `#6B4C0B` | `#FCF1CD` |
| danger (rose) | `#F0938F` | `#2C1620` | `#6B2128` | `#FCE0E2` |
| info (sky) | `#8FBBF2` | `#14213A` | `#1F3D63` | `#DDEBF7` |

### 2.4 The 9 pastel section families (`--c-{family}-bg / -ink / -deep`)

Canonical triads (digest §1.4 dark / §2.4 light) — all nine are tokenized in
`globals.css` (both theme blocks):

| Family | Dark bg / ink / deep | Light bg / ink / deep |
|---|---|---|
| peach | `#2C1A16` `#F2A07F` `#FCD9C4` | `#FFE9DC` `#E07856` `#6B2D1A` |
| mint | `#0F241C` `#7FD39A` `#C9EAD3` | `#DCF1E2` `#4FA66D` `#1F4F30` |
| lavender | `#221B3A` `#B7A0F4` `#DCD2F9` | `#ECE6FA` `#8A6FE0` `#3F2D7A` |
| sky | `#14213A` `#8FBBF2` `#C9DCEE` | `#DDEBF7` `#5C8FCE` `#1F3D63` |
| yellow | `#2C2410` `#ECC97D` `#F8E5B5` | `#FCF1CD` `#D6A330` `#6B4C0B` |
| rose | `#2C1620` `#F0938F` `#FACDD2` | `#FCE0E2` `#DD6E78` `#6B2128` |
| sand | `#241F14` `#D9C18C` `#EFE2C5` | `#F1ECDF` `#B59868` `#5A4623` |
| grey | `#161D33` `#A9B0C8` `#D5DAE8` | `#EFECE7` `#6B665E` `#2D2A24` |
| copper | `#2C2312` `#E9B44C` `#F5D48A` | `#F4E4D2` `#B57438` `#5C3416` |

Legacy family aliases (`--c-ember/-flame/-saffron/-basil/-bloom/-ash…`) are
retained as load-bearing names but resolve to Madarek gold/copper/status
values. Never introduce a non-family color (e.g. indigo `#6366f1`) —
defaults must come from a family triad (tag default = lavender-ink
`#8A6FE0`).

---

## 3. Typography

- **Family:** IBM Plex Sans Arabic (self-hosted, `public/fonts/`, 12 woff2 ≈
  329 KB) for sans + display + Arabic; IBM Plex Mono for Latin
  digits/code; IBM Plex Serif italic for sanctioned Latin runs only.
  **No Google Fonts imports. No Cairo/Readex/Tajawal** (Tajawal survives
  only as an inert fallback name).
- **Weights:** 400 / 500 / 600 / 700. **Plex Sans Arabic ships no 800** —
  display weight is the true 700 cut.
- **Arabic cursive rule (non-negotiable):** `letter-spacing: 0` on all
  Arabic text; the global guard
  `html[dir="rtl"] [class*="tracking-"]:not([class*="font-mono"])` zeroes
  every tracking utility. Mono + LTR is the only sanctioned tracking pair.
- Body 15px / lh 1.65-1.75; h1 30px, h2 22px, h3 18px at lh 1.2-1.3;
  headings weight 700.

## 4. Shape & Elevation

- **Radius ladder (§3):** 6 / 8 / 10 / 12 / 16 / 20 / 28 / 9999 px
  (`--radius-xs…3xl`, `rounded-full`). Buttons/inputs on `rounded-md` (10);
  cards/dialogs/sheets on `rounded-2xl` (20). No other radii.
- **Elevation `--elev-1..5` (§5):** dark = fill-led
  `0 Npx… rgba(0,0,0,.30→.50), inset 0 1px 0 rgba(255,255,255,.04→.08)`;
  light = soft two-layer `rgba(0,0,0,.04→.12)`. Shadows are token recipes
  (`--shadow-card/-h/-pop/-modal`) — never hand-rolled.
- **Ground is FLAT (de-glow doctrine):** no body radials, no grain, no grid
  overlays, no shine-sweep button pseudo-layers, no radial hover sheens.
  The only painted sky is the sidebar `.mdrk-night-sky` wash. Hover states
  are matte: fill/border shifts, 1px lift, `scale(0.97)` press.

## 5. Motion

- **Duration ladder (§4):** 80 / 160 / 240 / 380 / 520 / 720 ms
  (`--t-micro…--t-cinema`). No 200/300/500ms leftovers.
- **Easings:** standard `(0.4,0,0.2,1)`, out `(0.16,1,0.3,1)`, soft
  `(0.22,1,0.36,1)`; springs `(0.34,1.18|1.36|1.56,0.64,1)`.
- Press `scale(0.97)` @ 80ms; hover lift −1px; RTL flips via
  `--motion-direction: -1`.
- `prefers-reduced-motion`: the whole ladder collapses to 0ms.
- `prefers-contrast: more`: elevations become solid rings, borders
  strengthen, glass goes solid (ported from tokens.css §L964-1005 into
  `globals.css`).

## 6. Icon & Brand Assets (PWA/favicon/OG)

Generated by `scripts/gen_icon_set.py` — Madarek palette only:
gold `#E9B44C` art on night `#070B16` base (maskable/apple-touch/favicon
tiles) or transparent (plain "any" icons); cream `#FBFAF9` never used as an
icon ground. Regenerate after any art change; the script verifies **zero
flame pixels** (the pre-Madarek orange palette) in every output. Manifest:
`background_color #070B16`, `theme_color` dark `#191918` / light `#FBFAF9`.

## 7. Accessibility Contracts

- Text contrast ≥ 4.5:1; non-text (borders/fields) ≥ 3:1 (WCAG 1.4.11) —
  the token values above are pre-measured; do not "fix" them by eye.
- Focus: 2px `--state-focus-ring-color` (strong gold dark / copper-deep
  light) + 2px offset, visible on every interactive element.
- Touch targets ≥ 44px (`min-h-11 min-w-11`).
- Full RTL: `dir="rtl"` root, logical properties everywhere.

## 8. Anti-Patterns (Do NOT Use)

- ❌ Raw hex/oklch values, non-Madarek colors (teal `#0D9488`, slate
  `#1e293b`, indigo `#6366f1`, flame `#bc4700/#c53c00` …)
- ❌ Google Fonts imports / Plus Jakarta Sans / Cairo / Readex Pro
- ❌ Glow: grid overlays, grain, radial sheens, shine sweeps, colored
  outer glows
- ❌ tracking-* on Arabic; font-weight 800+; letter-spacing on headings
- ❌ Radii outside the 6-28 ladder; ad-hoc shadows; 200/300ms transitions
- ❌ Emojis as icons (Lucide only); invisible focus states
- ❌ New token definitions outside `globals.css`

## 9. Pre-Delivery Checklist

- [ ] No raw color/shadow/font literals in the component (tokens only)
- [ ] Both themes checked (night default + cream light)
- [ ] RTL rendered correctly; no tracking on Arabic
- [ ] Hover/press = matte states, no added glow
- [ ] Focus ring visible; targets ≥ 44px
- [ ] `prefers-reduced-motion` and `prefers-contrast` respected
- [ ] Responsive at 375 / 768 / 1024 / 1440 px; no horizontal scroll
- [ ] New icons/OG art regenerated via `scripts/gen_icon_set.py` /
      `recolor_madarek.py` (never hand-edited binaries)
