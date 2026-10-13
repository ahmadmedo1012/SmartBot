# Design System Master File — SmartBot (Circuit Petrol)

> **STATUS:** Rewritten in Phase 6 (Task P6-2-d4). The previous edition
> declared a "Madarek night-and-gold" SSOT that no longer matches the
> shipped product: since phase5 r152 every token in
> `fb_dashboard/frontend/src/app/globals.css` carries the **Circuit
> Petrol** identity (petrol ground, SIGNAL teal, lime AI signal, Space
> Grotesk display), the PWA manifest is petrol, and the brand rasters
> (P6-2-d4) are petrol. This file is now the petrol constitution.
> Vocabulary heritage: the token NAMES (--c-\*, --accent-\*, radius/
> motion ladders) were ported from the Madarek sheet in r129–r140; the
> Madarek VALUES were re-anchored in r152. The vocabulary is load-bearing
> (hundreds of consumers) — the values are petrol and petrol wins.
>
> **RULE OF RULES:** When building a specific page, first check
> `docs/design-system.md` (the Arabic operational guide) — semantic usage
> rules override this Master file. There are NO per-page design docs in
> this repo. If nothing more specific exists, strictly follow the rules
> below. If any file in this repo contradicts the shipped
> `globals.css`, **globals.css wins and the file is wrong.**

---

**Project:** SmartBot (fb_dashboard — web app + PWA)
**Category:** Productivity Tool (Facebook/Messenger automation dashboard)
**Design language:** «Circuit Petrol» — matte petrol night + SIGNAL teal +
lime AI heartbeat; light mode = petrol mist + deep teal. The machine
grammar (RobotMark, CircuitTrace, mono stamps) is the product's voice.

---

## 1. Source of Truth Chain (SSOT)

| Layer | File | Role |
|---|---|---|
| **SSOT (this repo)** | `fb_dashboard/frontend/src/app/globals.css` | The ONLY file that defines design tokens. Dark block `:root` + light block `.light`, Tailwind v4 `@theme inline` bridge to utility classes. Every value below mirrors it. |
| Constitution (this file) | `design-system/smartbot/MASTER.md` | The petrol canon — read before building anything. |
| Operational guide (Arabic) | `docs/design-system.md` | Semantic usage rules (which token for which role) in Arabic. |
| Fonts | `fb_dashboard/frontend/public/fonts/fonts.css` | Self-hosted 11-woff2 set: IBM Plex Sans Arabic 400/500/600/700 (arabic+latin subsets ×8) + IBM Plex Mono 400/500 + **Space Grotesk variable** (the Latin display face, phase5 r152); `--font-cairo` shim name resolves to "IBM Plex Sans Arabic". |
| Brand rasters | `fb_dashboard/frontend/scripts/p6-regen-brand.mjs` | The ONE icon/OG generator (P6-2-d4): petrol ground + teal robot-head glyph + lime LED; verifies zero Madarek pixels in-script. The old `scripts/gen_icon_set.py` (Madarek gold) is retired — never run it. |
| Parity harness | `fb_dashboard/frontend/tests/parity.mjs` | The design-contract gate (477 pins at P6-2-d4) — run `npm run test:parity`. |

**Forbidden:** introducing a raw hex, font, shadow, duration or radius in a
component. Everything is a token from `globals.css`. A component with a
hard-coded `#…`, `font-family:`, `box-shadow:` or `transition: 300ms` is a
bug.

---

## 2. Color Systems

### 2.1 Dark — Circuit Petrol night (the flagship, default mode)

| Role | Token (`globals.css`) | Value |
|---|---|---|
| Page ground (petrol) | `--background`, `--c-night` | `#071A21` |
| Surface (raised card) | `--card` / `--popover` | `#0D2830` |
| Surface-2 / soft bg | `--secondary` / `--muted` | `#123039` |
| Primary ink (petrol mist) | `--foreground` | `#E9F5F0` |
| Secondary text | `--muted-foreground` | `#9FC3BC` |
| Muted text / placeholder | `--placeholder-text` | `#6E938E` |
| **Brand solid — SIGNAL teal** | `--primary`, `--accent-solid` | `#17C3A4` |
| Teal hover | `--accent-hover` | `#1FD6B4` |
| Teal-deep (focus metal, 7.87:1) | `--accent-strong`, `--c-ember` | `#12A386` |
| Text on teal (≈7.4:1) | `--primary-foreground`, `--accent-fg` | `#04231B` |
| Focus ring (canonical cascade, 10.39:1) | `--ring`, `--state-focus-ring-color` | `#17C3A4` |
| Accent hint (soft hover tint only) | `--accent` | teal @ 15% (oklch) |
| Accent-as-text (10.39:1) | `--accent-foreground`, `--accent-ink` | teal `#17C3A4` (oklch form) |
| Hairline border | `--border` | `#1D4450` |
| Field border (WCAG 1.4.11) | `--input` | `#64949E` |
| Danger (rose) | `--destructive` | `#F2919B` |
| **AI/automation signal — LIME (RESERVED)** | `--c-lime-ink` | `#C6F24E` (13.8:1 on petrol) |

There is **no brand gradient** — filled CTAs are SOLID teal with `#04231B`
ink (the `flame` Button variant resolves `--c-ember → --c-saffron`, both
teal rungs of the same metal; the old gold ramp names are load-bearing
aliases with petrol-era values).

The full neutral ramp (`--neutral-0…900`): `#0D2830 #071A21 #123039
#163842 #1D4450 #2A5766 #64949E #6E938E #9FC3BC #CFE5DF #E9F5F0`.

### 2.2 Light — petrol mist (paper mode)

| Role | Token | Value |
|---|---|---|
| Page ground (mist) | `--background` | `#EDF6F3` |
| Surface (white card) | `--card` / `--popover` | `#FFFFFF` |
| Surface-2 / soft bg | `--secondary` / `--muted` | `#E4F0ED` / `#DAEAE6` |
| Primary ink (deep petrol) | `--foreground` | `#0A242E` |
| Secondary text | `--muted-foreground` | `#3A5450` |
| Muted text / placeholder | `--placeholder-text` | `#51736E` |
| **Brand solid — deep teal** | `--primary`, `--accent-solid` | `#0C7563` |
| Teal-deep (accent-as-text, focus ring — 10.29:1) | `--accent-strong`, `--accent-ink`, `--state-focus-ring-color` | `#085B4C` |
| Text on deep teal | `--primary-foreground`, `--accent-fg` | `#F2FDFA` |
| Hairline border | `--border` | `#CCE0DB` |
| Field border | `--input` | `#51736E` |
| Danger (rose) | `--destructive` | `#D95F6C` |
| **LIME (AI signal, light tier)** | `--c-lime-ink` | `#5A7A16` (5.2:1 on mist) |

Light accent hint: teal @ 12% (`oklch(0.5041 0.0909 176.6 / 0.12)`).

### 2.3 Status colors (both modes)

| Status | Dark base | Dark soft | Light base | Light soft | As-text light (`-ink`) |
|---|---|---|---|---|---|
| success (mint) | `#45D6A0` | `#0C2E24` | `#2E9E6F` | `#D9F3E6` | `#0F4A33` |
| warning (yellow) | `#F5C46B` | `#332708` | `#C29217` | `#FBF1CF` | `#6B4C0B` |
| danger (rose) | `#F2919B` | `#331821` | `#D95F6C` | `#FCE3E6` | `#6B2128` |
| info (sky) | `#7CC4DE` | `#10303B` | `#3E96BC` | `#DDF0F7` | `#0F3D52` |

### 2.4 The 10 section families (`--c-{family}-bg / -ink / -deep`)

All ten are tokenized in `globals.css` (both theme blocks). Consume via
`--c-{family}-bg/-ink/-deep` for section washes, tags, stamps and
illustrations; never invent an 11th.

| Family | Dark bg / ink / deep | Light bg / ink / deep |
|---|---|---|
| peach | `#2A1E1A` `#F2A887` `#F8D9C8` | `#FFEDE2` `#DB7B57` `#6B2D1A` |
| mint | `#0C2E24` `#45D6A0` `#C9EDDB` | `#D9F3E6` `#2E9E6F` `#0F4A33` |
| lavender | `#1E2740` `#9FB2E8` `#D8DEF8` | `#E8ECF9` `#7086D6` `#2D3A7A` |
| sky | `#10303B` `#7CC4DE` `#CDE9F3` | `#DDF0F7` `#3E96BC` `#0F3D52` |
| yellow | `#332708` `#F5C46B` `#F8E7B8` | `#FBF1CF` `#C29217` `#6B4C0B` |
| rose | `#331821` `#F2919B` `#FAD3D7` | `#FCE3E6` `#D95F6C` `#6B2128` |
| sand | `#1B3230` `#B9D4C8` `#DDEBE1` | `#EBF2EC` `#7FA089` `#33523F` |
| grey | `#14262E` `#A3B8BF` `#D8E5E8` | `#EAF0F1` `#5F7377` `#2A3A3E` |
| copper | `#0A2E28` `#17C3A4` `#A9F0DF` | `#D7F3EA` `#0E8A75` `#0A4A3C` |
| **lime (RESERVED — AI only)** | `#1E3010` `#C6F24E` `#E4F79A` | `#EFF7D2` `#5A7A16` `#37490C` |

The copper family IS the teal brand family (name is heritage). The lime
family is **reserved for AI/automation moments only** (thinking dots, LED,
live beats, autoreply marks) — never a generic accent.

Legacy aliases (`--c-ember/-flame/-saffron/-basil/-bloom/-ash…`, `--gold`,
`--brand-purple`) are retained as load-bearing names but resolve to the
petrol/teal/status values above. Never introduce a non-family color (e.g.
indigo `#6366f1`) — defaults must come from a family triad (tag default =
lavender-ink `#9FB2E8`).

---

## 3. Typography

- **Display (phase5 r152):** `--font-display` / `--font-heading` =
  `"Space Grotesk", IBM Plex Sans Arabic…` — Latin display runs and
  latin-only display numerics ride Space Grotesk (`.sb-numerals` =
  Space Grotesk + `tabular-nums lining-nums`); any Arabic glyph falls
  through to Plex Sans Arabic (the web has no per-glyph split — mixed
  text renders whole-run in the Arabic face, by design).
- **Body/Arabic:** IBM Plex Sans Arabic (self-hosted, 8 woff2 ≈ 4 subsets ×
  4 weights) for all sans + Arabic text. **No Google Fonts imports. No
  Cairo/Readex/Tajawal** (Tajawal survives only as an inert fallback name).
- **Mono (machine grammar):** IBM Plex Mono 400/500 — HH:MM stamps,
  phones, money figures, IDs, code; `--font-mono` + tabular-nums. Mono +
  LTR is the only sanctioned tracking pair.
- **Weights:** 400 / 500 / 600 / 700. Plex Sans Arabic ships no 800 —
  display weight is the true 700 cut (`--fw-black` resolves 700).
- **Arabic cursive rule (non-negotiable):** `letter-spacing: 0` on all
  Arabic text; the global guard
  `html[dir="rtl"] [class*="tracking-"]:not([class*="font-mono"])` zeroes
  every tracking utility.
- Body 15px / lh 1.65; h1 30px, h2 22px, h3 18px at lh 1.2–1.3; headings
  700; the full `--fs-*` / `--lh-*` / `--fw-*` scale + `--type-*` roles
  (page-title `clamp(20px, 3.4vw, 28px)` @ 700, section-title 17px/600,
  label 13px/500, table 13px) live in `globals.css`; heading tracking is 0
  in BOTH directions.

## 4. Shape & Elevation

- **Radius ladder:** 6 / 8 / 10 / 12 / 16 / 20 / 28 / 9999 px
  (`--radius-xs…3xl`, `rounded-full`). Buttons/inputs on `rounded-md` (10);
  inner cards/dialogs on `rounded-xl` (16); 20 (`r-2xl`) is the
  landing-only rung — landing cards + mobile bottom-sheet panels. No
  other radii.
- **Elevation `--elev-1..5`:** dark = fill-led
  `0 Npx… rgba(0,0,0,.30→.50), inset 0 1px 0 rgba(255,255,255,.04→.08)`;
  light = soft two-layer `rgba(0,0,0,.04→.12)`. Shadows are token recipes
  (`--shadow-card/-h/-pop/-modal`) — never hand-rolled.
- **Ground is FLAT (de-glow doctrine):** no body radials, no grain, no
  grid overlays, no shine sweeps, no radial hover sheens. Hover states are
  matte: fill/border shifts, 1px lift, `scale(0.97)` press. The ONE
  sanctioned glow is the lime LED/nav halo (`--nav-active-halo`,
  `--trace-live`) — the AI heartbeat, nothing else.

## 5. Motion

- **Duration ladder:** 80 / 160 / 240 / 380 / 520 / 720 ms
  (`--t-micro…--t-cinema`). No 200/300/500ms leftovers.
- **Easings:** standard `(0.4,0,0.2,1)`, out `(0.16,1,0.3,1)`, soft
  `(0.22,1,0.36,1)`; springs `(0.34,1.18|1.36|1.56,0.64,1)`.
- Press `scale(0.97)` @ 80ms; hover lift −1px; RTL flips via
  `--motion-direction: -1`.
- **Robot verbs (`rb-*` in globals.css):** LED breathe 3.8s, visor scan
  1.6s, say stagger 1.1s, glitch 2.2s, wave pulse 2.4s — every loop
  carries its own `prefers-reduced-motion` off-switch.
- `prefers-reduced-motion`: the whole ladder collapses to 0ms.
- `prefers-contrast: more`: elevations become solid rings, borders
  strengthen, glass goes solid.

## 6. Icon & Brand Assets (PWA/favicon/OG)

Generated by `fb_dashboard/frontend/scripts/p6-regen-brand.mjs` — Circuit
Petrol only: petrol `#071A21` ground + the RobotMark-inspired robot-head
glyph (matte `#123039` shell, hairline `#1D4450` circuit strokes, teal
`#17C3A4` visor, lime `#C6F24E` LED). Same sizes/formats/paths as ever:
favicon 96 (rounded square) · brand-icon 160 / icon-192 / icon-512
(circular badges Ø80%, 512 palette-indexed) · icon-192/512-maskable +
apple-touch 180 (full-bleed, glyph in the safe zone) · favicon.ico
16/32/48 · opengraph-image 1200×630 (petrol stage rendered through
Chromium with the real local woff2 faces). The script pixel-verifies
every output: **zero Madarek night `#070B16`, zero gold-family pixels,
petrol/teal/lime present** — evidence prints and rides the commit.
Manifest: `background_color #EDF6F3`, `theme_color #071A21`. The retired
`scripts/gen_icon_set.py` (root, Madarek gold) must never be run again.

## 7. Signature Motifs (the machine grammar)

- **RobotMark** (`src/components/shared/RobotMark.tsx`): the robot — 5
  states (idle/greeting/thinking/responding/error), themes through
  semantic tokens, decorative by default (`aria-hidden` unless titled).
- **CircuitTrace** (`src/components/shared/CircuitTrace.tsx`): the
  dashed hairline divider with node dots — `divider` / `live` (lime end
  node) / `corner`. Page headers and section seams speak it.
- **TypingDots** (`.sb-typing`): three lime dots, 1.2s, 0.18s stagger —
  the "bot is thinking" register.
- **`.route-spine-segment`**: the dashed route spine (order timelines,
  onboarding progress).
- **`.sb-trace-field`**: machine-input fields (config forms) — trace
  chrome + mono intent.
- **`.sb-numerals` / `font-mono` stamps**: every figure that is a fact
  (money, counts, HH:MM, phones) renders tabular mono/Grotesk — never
  prose digits.

## 8. Accessibility Contracts

- Text contrast ≥ 4.5:1; non-text (borders/fields) ≥ 3:1 (WCAG 1.4.11) —
  the token values above are pre-measured; do not "fix" them by eye.
- Focus: 2px `--state-focus-ring-color` (solid teal `#17C3A4` dark /
  teal-deep `#085B4C` light) + 2px offset, visible on every interactive
  element. Input halo: 3px @ 22% `--accent-solid`.
- Touch targets ≥ 44px (`min-h-11 min-w-11`).
- Full RTL: `dir="rtl"` root, logical properties everywhere; every
  `<Input>` carries `dir="auto"`.

## 9. Anti-Patterns (Do NOT Use)

- ❌ Raw hex/oklch values, non-petrol colors (gold `#E9B44C`/`#C9962F`/
  `#D6A330`, Madarek night `#070B16`/`#0D1428`, cream `#FBFAF9`,
  flame `#bc4700`, indigo `#6366f1` …)
- ❌ Google Fonts imports / Plus Jakarta Sans / Cairo / Readex Pro
- ❌ Glow: grid overlays, grain, radial sheens, shine sweeps (the lime
  LED/nav/trace-live halo is the only sanctioned glow)
- ❌ LIME outside AI/automation semantics
- ❌ tracking-* on Arabic; font-weight 800+; letter-spacing on headings
- ❌ Radii outside the 6-28 ladder; ad-hoc shadows; 200/300ms transitions
- ❌ Emojis as icons (Lucide only); invisible focus states
- ❌ New token definitions outside `globals.css`
- ❌ Editing brand rasters by hand — regenerate via
  `scripts/p6-regen-brand.mjs` only

## 10. Pre-Delivery Checklist

- [ ] No raw color/shadow/font literals in the component (tokens only)
- [ ] Both themes checked (petrol night default + mist light)
- [ ] RTL rendered correctly; no tracking on Arabic
- [ ] Hover/press = matte states, no added glow
- [ ] Focus ring visible; targets ≥ 44px
- [ ] `prefers-reduced-motion` and `prefers-contrast` respected
- [ ] Responsive at 375 / 768 / 1024 / 1440 px; no horizontal scroll
- [ ] Figures render through `.sb-numerals` / `font-mono` stamps
- [ ] Icons/OG art regenerated via `scripts/p6-regen-brand.mjs`
      (never hand-edited binaries, never the retired gen_icon_set.py)
- [ ] `npm run test:parity` green (477 pins — extend the layer for any
      new grammar site)
