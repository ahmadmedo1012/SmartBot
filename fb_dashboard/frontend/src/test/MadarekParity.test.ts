/**
 * test(r125) — Madarek parity snapshot: pin the canonical design tokens.
 * (Task 11-a, Wave B; source of truth: madarek/frontend/src/styles/tokens.css
 * + download/madarek-reference-digest.md — §1 dark · §2 light · §3 radius ·
 * §4 motion · §5 elevation.)
 *
 * WHAT THIS FILE IS
 * ─────────────────
 * The vitest twin of the ecosystem parity matrix (scripts/parity_matrix.py →
 * download/madarek-parity-matrix.md): a CI-able snapshot of the Madarek
 * canonical values asserted against src/app/globals.css. Madarek carries its
 * own snapshot suite; the siblings did not — this closes that gap so any
 * future token edit that drifts from the SSOT fails `npm run test:unit`
 * immediately, with a message naming the exact token and both values.
 *
 * HOW IT READS THE CSS
 * ─────────────────────
 * - Only the theme blocks matter: :root (night, the default) and .light
 *   (paper) — extracted brace-matched from the TOP LEVEL so @media
 *   (prefers-contrast / reduced-motion) overrides can never mask the resting
 *   values. The radius ladder lives in the Tailwind `@theme inline` block.
 * - The light scope is the real cascade: {.light} overlays {:root}; tokens
 *   .light does not redefine (radius, motion, families, elev…) inherit :root.
 * - var() chains are resolved inside the final scope; comparisons are
 *   normalization-tolerant (whitespace, `a,b` vs `a, b`, hex case).
 *
 * DOCUMENTED smart-bot split (NOT drift — pinned deliberately): smart-bot's
 * shadcn status bases in LIGHT mode carry the text-safe family DEEPS
 * (--success #1F4F30 = mint-deep, --warning #6B4C0B = yellow-deep,
 * --info #1F3D63 = sky-deep, --destructive #6B2128 = rose-deep; in-file
 * banner: "Light-mode status — Madarek light -ink (text-safe deep) variants
 * (§1.6)"), because its tokens serve text duty directly. The canonical base
 * hues live on the family tokens (--c-mint-ink #4FA66D etc.), pinned in the
 * families block below — every pinned value below IS a canonical Madarek hex.
 *
 * Token-name bridge (smart-bot keeps its own shadcn/utility vocabulary):
 *   ground --bg → --background · surface --surface → --card
 *   bg-soft/surface-2 → --secondary · ink --text → --foreground
 *   ink-secondary → --muted-foreground · ink-muted → --placeholder-text
 *   accent --accent → --primary · accent-fg → --primary-foreground
 *   accent-ink → --accent-foreground (oklch spelling of the canonical hex)
 *   accent-soft → --c-copper-bg · danger --danger → --destructive
 *   radius --r-* → --radius-* (Tailwind @theme, same 6/8/10/12/16/20/28)
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// ── token file → theme scopes ────────────────────────────────────────────────

const css = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, " ")

function topLevelBlocks(source: string): { prelude: string; body: string }[] {
  const blocks: { prelude: string; body: string }[] = []
  let i = 0
  while (i < source.length) {
    const open = source.indexOf("{", i)
    if (open === -1) break
    let depth = 1
    let j = open + 1
    while (j < source.length && depth > 0) {
      if (source[j] === "{") depth += 1
      else if (source[j] === "}") depth -= 1
      j += 1
    }
    blocks.push({ prelude: source.slice(i, open).trim(), body: source.slice(open + 1, j - 1) })
    i = j
  }
  return blocks
}

const blocks = topLevelBlocks(css)
function block(prelude: string): string {
  const b = blocks.find((x) => x.prelude === prelude)
  if (!b) throw new Error(`top-level block not found: ${prelude}`)
  return b.body
}
// the radius ladder lives in the Tailwind theme blocks — smart-bot carries
// TWO of them (@theme inline for fonts/colors + a plain @theme for radius);
// merge every @theme block, outermost declarations win (document order)
function themeDecls(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const b of blocks) {
    if (/@theme(?:\s+inline)?\s*$/.test(b.prelude)) Object.assign(out, parseDecls(b.body))
  }
  if (Object.keys(out).length === 0) throw new Error("Tailwind @theme block not found")
  return out
}

function parseDecls(blockText: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of blockText.matchAll(/--([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
    out[`--${m[1]}`] = m[2].trim()
  }
  return out
}

const dark = parseDecls(block(":root"))
const theme = themeDecls()
// real cascade: .light overlays :root; everything else inherits
const light: Record<string, string> = { ...dark, ...parseDecls(block(".light")) }

function resolve(scope: Record<string, string>, value: string, depth = 0): string {
  if (depth > 10) return value
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*)\s*)?\)/g, (_m, name: string, fb?: string) => {
    if (scope[name] !== undefined) return resolve(scope, scope[name]!, depth + 1)
    return fb ?? `var(${name})`
  })
}

function norm(v: string): string {
  return v
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/#[0-9a-f]{3,8}/gi, (h) => h.toUpperCase())
    .trim()
}

function pin(scope: Record<string, string>, mode: string, token: string, expected: string) {
  const raw = scope[token]
  expect(raw, `${mode} ${token} is missing from globals.css`).toBeDefined()
  const actual = norm(resolve(scope, raw as string))
  expect(actual, `${mode} ${token} drifted from the Madarek canonical value`).toBe(norm(expected))
}

function pinAll(scope: Record<string, string>, mode: string, table: Record<string, string>) {
  for (const [token, value] of Object.entries(table)) pin(scope, mode, token, value)
}

// ── canonical snapshot (madarek tokens.css, live-verified) ──────────────────

const GROUNDS_DARK = {
  "--background": "#070B16", // Madarek --bg (neutral-50 night)
  "--card": "#0D1428", // Madarek --surface (neutral-0)
  "--secondary": "#121A36", // Madarek --bg-soft / --surface-2 (neutral-100)
  "--foreground": "#F2EFE6", // Madarek --text (neutral-900 sand)
  "--muted-foreground": "#C3C8DC", // Madarek --text-secondary
  "--placeholder-text": "#8E97B8", // Madarek --text-muted (neutral-500)
  "--border": "#1B2444", // Madarek hairline (neutral-200)
}
const GROUNDS_LIGHT = {
  "--background": "#FBFAF9",
  "--card": "#FFFFFF",
  "--secondary": "#F7F6F3",
  "--foreground": "#191918",
  "--muted-foreground": "#4F4D48",
  "--placeholder-text": "#6E6C65", // Madarek --text-muted light (WCAG literal)
  "--border": "#E9E7E2",
}
const ACCENT_DARK = {
  "--primary": "#E9B44C", // Madarek --accent (their --accent is the 15% wash twin)
  "--primary-foreground": "#05070F", // Madarek --accent-fg
  // Madarek --accent-ink #E9B44C, oklch spelling (parsed by the contrast gate)
  "--accent-foreground": "oklch(0.7995 0.134 81.4)",
  "--c-copper-bg": "#2C2312", // Madarek --accent-soft (family copper ground)
}
const ACCENT_LIGHT = {
  "--primary": "#B57438",
  "--primary-foreground": "#1A0F06",
  // Madarek --accent-ink #5C3416 (copper-deep), oklch spelling
  "--accent-foreground": "oklch(0.3688 0.0718 55)",
  "--c-copper-bg": "#F4E4D2",
}
// documented smart-bot split: dark bases = luminous family inks (canonical);
// light bases = the text-safe family deeps (see file banner for rationale)
const STATUS_DARK = {
  "--success": "#7FD39A", "--success-soft": "#0F241C",
  "--warning": "#ECC97D", "--warning-soft": "#2C2410",
  "--info": "#8FBBF2", "--info-soft": "#14213A",
  "--destructive": "#F0938F", "--destructive-soft": "#2C1620",
}
const STATUS_LIGHT = {
  "--success": "#1F4F30", "--success-soft": "#DCF1E2", // mint-deep / mint-bg
  "--warning": "#6B4C0B", "--warning-soft": "#FCF1CD", // yellow-deep / yellow-bg
  "--info": "#1F3D63", "--info-soft": "#DDEBF7", // sky-deep / sky-bg
  "--destructive": "#6B2128", "--destructive-soft": "#FCE0E2", // rose-deep / rose-bg
}
const FAMILIES_DARK: Record<string, [string, string, string]> = {
  peach: ["#2C1A16", "#F2A07F", "#FCD9C4"],
  mint: ["#0F241C", "#7FD39A", "#C9EAD3"],
  lavender: ["#221B3A", "#B7A0F4", "#DCD2F9"],
  sky: ["#14213A", "#8FBBF2", "#C9DCEE"],
  yellow: ["#2C2410", "#ECC97D", "#F8E5B5"],
  rose: ["#2C1620", "#F0938F", "#FACDD2"],
  sand: ["#241F14", "#D9C18C", "#EFE2C5"],
  grey: ["#161D33", "#A9B0C8", "#D5DAE8"],
  copper: ["#2C2312", "#E9B44C", "#F5D48A"],
}
const FAMILIES_LIGHT: Record<string, [string, string, string]> = {
  peach: ["#FFE9DC", "#E07856", "#6B2D1A"],
  mint: ["#DCF1E2", "#4FA66D", "#1F4F30"],
  lavender: ["#ECE6FA", "#8A6FE0", "#3F2D7A"],
  sky: ["#DDEBF7", "#5C8FCE", "#1F3D63"],
  yellow: ["#FCF1CD", "#D6A330", "#6B4C0B"],
  rose: ["#FCE0E2", "#DD6E78", "#6B2128"],
  sand: ["#F1ECDF", "#B59868", "#5A4623"],
  grey: ["#EFECE7", "#6B665E", "#2D2A24"],
  copper: ["#F4E4D2", "#B57438", "#5C3416"],
}
// Tailwind @theme spellings (Madarek --r-* ladder, same values; no --r-full
// token — rounded-full uses the Tailwind default)
const RADIUS = {
  "--radius-xs": "6px", "--radius-sm": "8px", "--radius-md": "10px", "--radius-lg": "12px",
  "--radius-xl": "16px", "--radius-2xl": "20px", "--radius-3xl": "28px",
}
const MOTION = {
  "--t-micro": "80ms", "--t-fast": "160ms", "--t-base": "240ms",
  "--t-slow": "380ms", "--t-slower": "520ms", "--t-cinema": "720ms",
}
// v26-F4: easing curves pinned — the r125 wave pinned durations only, which
// let --ease-spring carry the bounce value 1.56 for a whole round. Canonical
// pop overshoot is 1.36 (P4-A6 assertion 6); 1.56 is the bounce tier.
const EASINGS = {
  "--ease": "cubic-bezier(0.4, 0, 0.2, 1)",
  "--ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
  "--ease-in": "cubic-bezier(0.7, 0, 0.84, 0)",
  "--ease-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
  "--ease-spring-soft": "cubic-bezier(0.34, 1.18, 0.64, 1)",
  "--ease-spring": "cubic-bezier(0.34, 1.36, 0.64, 1)",
  "--ease-spring-bounce": "cubic-bezier(0.34, 1.56, 0.64, 1)",
}
const ELEV_DARK = {
  "--elev-1": "0 1px 2px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
  "--elev-2": "0 4px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
  "--elev-3": "0 8px 16px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.06)",
  "--elev-4": "0 16px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)",
  "--elev-5": "0 32px 64px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.08)",
}
const ELEV_LIGHT = {
  "--elev-1": "0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.06)",
  "--elev-2": "0 4px 8px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)",
  "--elev-3": "0 8px 16px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.05)",
  "--elev-4": "0 16px 32px rgba(0,0,0,0.10), 0 8px 16px rgba(0,0,0,0.06)",
  "--elev-5": "0 32px 64px rgba(0,0,0,0.12), 0 16px 32px rgba(0,0,0,0.08)",
}

// ── assertions ───────────────────────────────────────────────────────────────

describe("r125 Madarek parity — grounds, inks & neutrals", () => {
  it("dark (:root night) matches the canonical dark block", () => {
    pinAll(dark, "dark", GROUNDS_DARK)
  })
  it("light (.light paper) matches the canonical light block", () => {
    pinAll(light, "light", GROUNDS_LIGHT)
  })
})

describe("r125 Madarek parity — accent family", () => {
  it("dark: gold #E9B44C set (Madarek --accent; accent-ink in oklch spelling)", () => {
    pinAll(dark, "dark", ACCENT_DARK)
  })
  it("light: copper #B57438 set (Madarek --accent; accent-ink in oklch spelling)", () => {
    pinAll(light, "light", ACCENT_LIGHT)
  })
})

describe("r125 Madarek parity — status tokens (documented smart-bot split)", () => {
  it("dark: luminous family-ink bases + deep-space softs", () => {
    pinAll(dark, "dark", STATUS_DARK)
  })
  it("light: text-safe family-deep bases + pastel softs (see file banner — NOT drift)", () => {
    pinAll(light, "light", STATUS_LIGHT)
  })
})

describe("r125 Madarek parity — the nine pastel section families", () => {
  it.each(Object.keys(FAMILIES_DARK))("dark family %s bg/ink/deep", (family) => {
    const [bg, ink, deep] = FAMILIES_DARK[family]!
    pin(dark, "dark", `--c-${family}-bg`, bg)
    pin(dark, "dark", `--c-${family}-ink`, ink)
    pin(dark, "dark", `--c-${family}-deep`, deep)
  })
  it.each(Object.keys(FAMILIES_LIGHT))("light family %s bg/ink/deep", (family) => {
    const [bg, ink, deep] = FAMILIES_LIGHT[family]!
    pin(light, "light", `--c-${family}-bg`, bg)
    pin(light, "light", `--c-${family}-ink`, ink)
    pin(light, "light", `--c-${family}-deep`, deep)
  })
})

describe("r125 Madarek parity — radius ladder (Tailwind @theme)", () => {
  it("6/8/10/12/16/20/28 match tokens.css §3", () => {
    pinAll(theme, "radius(@theme)", RADIUS)
  })
})

describe("r125 Madarek parity — motion ladder (theme-independent :root)", () => {
  it("raw 80–720ms match tokens.css §4", () => {
    pinAll(dark, "motion", MOTION)
    pinAll(light, "motion", MOTION)
  })
})

describe("r126 Madarek parity — easing curves (§4; v26-F4 bounce-fork fix)", () => {
  it("spring = 1.36 pop tier, bounce = 1.56 (both modes)", () => {
    pinAll(dark, "easing", EASINGS)
    pinAll(light, "easing", EASINGS)
  })
})

describe("r125 Madarek parity — elevation ladder (§5)", () => {
  it("dark: fill-led + inset top-light", () => {
    pinAll(dark, "elev-dark", ELEV_DARK)
  })
  it("light: soft two-layer", () => {
    pinAll(light, "elev-light", ELEV_LIGHT)
  })
})

describe("r125 Madarek parity — glass ground (§1.8)", () => {
  it("dark rgba(11,16,32,0.78) · light rgba(251,250,249,0.78)", () => {
    pin(dark, "glass-dark", "--glass-bg", "rgba(11, 16, 32, 0.78)")
    pin(light, "glass-light", "--glass-bg", "rgba(251, 250, 249, 0.78)")
  })
})
