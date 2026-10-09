/**
 * test(r127) — Madarek parity snapshot: pin the canonical design tokens.
 * (Task 11-a, Wave B; source of truth: madarek/frontend/src/styles/tokens.css
 * — §1 dark · §2 light · §3 radius · §4 motion · §5 elevation.)
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
 * DOCUMENTED smart-bot split (r127-F5b): the light status bases now carry the
 * canonical vivid family inks — same vocabulary as the fleet (Menu/Link/
 * Order) — and --destructive-foreground is Madarek --danger-fg #191918. The
 * r125-r126 "light bases = the text-safe family deeps" split was dissolved:
 * it was the A6 P1 deep-collapse drift (light badges/dots rendered visibly
 * darker than the fleet) and is now pinned to the canonical values. The
 * text-safe deeps keep their roles on the family slots (--c-mint-deep
 * #1F4F30 …), pinned in the families block below.
 *
 * Token-name bridge (smart-bot keeps its own shadcn/utility vocabulary):
 *   ground --bg → --background · surface --surface → --card
 *   bg-soft/surface-2 → --secondary · ink --text → --foreground
 *   ink-secondary → --muted-foreground · ink-muted → --placeholder-text
 *   accent --accent → --primary · accent-fg → --primary-foreground
 *   accent-ink → --accent-foreground (oklch spelling of the canonical hex)
 *   accent-soft → --c-copper-bg · danger --danger → --destructive
 *   radius --r-* → --radius-* (Tailwind @theme, same 6/8/10/12/16/20/28)
 *
 * r127-F5b — mirrors the parity.mjs expansion (82 → 185): focus contract
 * (--ring + --state-focus-ring-color, both themes), z-ladder 0-600,
 * --ease-smooth at both definition sites, prefers-contrast port, and the
 * reduced-motion token zeroing are pinned here too.
 */
import { readFileSync, readdirSync } from "node:fs"
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
// r127-F5b helpers: nested rule inside a media block (first match) + every
// block carrying a given prelude — the prefers-contrast / reduced-motion
// ports live inside @media blocks, so their nested :root/.light rules are
// parsed separately from the resting theme scopes.
function nestedBlock(outer: string, prelude: string): string | null {
  const re = new RegExp(`${prelude.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`)
  const m = outer.match(re)
  if (!m) return null
  const start = m.index! + m[0].length - 1
  let depth = 1
  let j = start + 1
  while (j < outer.length && depth > 0) {
    if (outer[j] === "{") depth += 1
    else if (outer[j] === "}") depth -= 1
    j += 1
  }
  return outer.slice(start + 1, j - 1)
}
function blocksNamed(prelude: string): string[] {
  return blocks.filter((x) => x.prelude === prelude).map((x) => x.body)
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
// r127-F5b: status bases = the canonical family inks in BOTH themes (dark
// luminous / light vivid — the fleet standard); fill foregrounds = the
// Madarek fg values (--danger-fg pattern: #191918 light / #05070F dark).
const STATUS_DARK = {
  "--success": "#7FD39A", "--success-soft": "#0F241C", "--success-foreground": "#191918",
  "--warning": "#ECC97D", "--warning-soft": "#2C2410",
  "--info": "#8FBBF2", "--info-soft": "#14213A",
  "--destructive": "#F0938F", "--destructive-soft": "#2C1620", "--destructive-foreground": "#05070F",
}
const STATUS_LIGHT = {
  "--success": "#4FA66D", "--success-soft": "#DCF1E2", "--success-foreground": "#191918", // mint-ink / mint-bg / danger-fg
  "--warning": "#D6A330", "--warning-soft": "#FCF1CD", // yellow-ink / yellow-bg
  "--info": "#5C8FCE", "--info-soft": "#DDEBF7", // sky-ink / sky-bg
  "--destructive": "#DD6E78", "--destructive-soft": "#FCE0E2", "--destructive-foreground": "#191918", // rose-ink / rose-bg / danger-fg
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
// v26-F4 easing curves + r127-F5b --ease-smooth: the canonical settle curve
// (0.16, 1, 0.3, 1) — the (0.16, 1, 0.2, 1) fork is dead; both definition
// sites are pinned (the :root table below + the @theme bridge in its own
// describe).
const EASINGS = {
  "--ease": "cubic-bezier(0.4, 0, 0.2, 1)",
  "--ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
  "--ease-in": "cubic-bezier(0.7, 0, 0.84, 0)",
  "--ease-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
  "--ease-spring-soft": "cubic-bezier(0.34, 1.18, 0.64, 1)",
  "--ease-spring": "cubic-bezier(0.34, 1.36, 0.64, 1)",
  "--ease-spring-bounce": "cubic-bezier(0.34, 1.56, 0.64, 1)",
  "--ease-smooth": "cubic-bezier(0.16, 1, 0.3, 1)",
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

describe("r127-F5b Madarek parity — status tokens (canonical family inks)", () => {
  it("dark: luminous family-ink bases + deep-space softs + void foregrounds", () => {
    pinAll(dark, "dark", STATUS_DARK)
  })
  it("light: vivid family-ink bases + pastel softs + danger-fg foregrounds (fleet parity)", () => {
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
  it("spring = 1.36 pop tier, bounce = 1.56, smooth = the canonical settle (both modes)", () => {
    pinAll(dark, "easing", EASINGS)
    pinAll(light, "easing", EASINGS)
  })
})

describe("r127-F5b Madarek parity — --ease-smooth @theme bridge (A6 P2 fork fix)", () => {
  it("@theme --ease-smooth = cubic-bezier(0.16, 1, 0.3, 1) (the utility class)", () => {
    pin(theme, "ease-smooth(@theme)", "--ease-smooth", "cubic-bezier(0.16, 1, 0.3, 1)")
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

// ── r127-F5b pin groups (mirrors tests/parity.mjs 82 → 185) ─────────────────

describe("r127-F5b Madarek parity — focus contract (A6 P1)", () => {
  it("dark: --ring #E9B44C + --state-focus-ring-color #E9B44C (r130 FLEET-1 true parity: the canonical cascade resolves dark ring through the SOLID gold — tokens.css:543; #C9962F painted night focus one shade darker than madarek's own UI)", () => {
    pin(dark, "focus-dark", "--ring", "#E9B44C")
    pin(dark, "focus-dark", "--state-focus-ring-color", "#E9B44C")
  })
  it("light: --ring #5C3416 + --state-focus-ring-color #5C3416 (10.29:1 — NOT raw copper 3.65:1)", () => {
    pin(light, "focus-light", "--ring", "#5C3416")
    pin(light, "focus-light", "--state-focus-ring-color", "#5C3416")
  })
  it("shape-mutation ban: :focus-visible paints an outline only (never border-radius)", () => {
    const focusRule = block(":focus-visible")
    expect(focusRule, "the :focus-visible rule exists").toBeTruthy()
    expect(focusRule).not.toContain("border-radius")
    expect(focusRule).toContain("outline: 2px solid var(--state-focus-ring-color)")
    expect(focusRule).toContain("outline-offset: 2px")
  })
})

describe("r127-F5b Madarek parity — z-order ladder (tokens.css §3a)", () => {
  it("canonical rungs 0/100/200/250/300/400/500/600 in both cascade scopes", () => {
    const Z_LADDER = {
      "--z-base": "0",
      "--z-dropdown": "100",
      "--z-popover": "200",
      "--z-tooltip": "250",
      "--z-sheet": "300",
      "--z-modal": "400",
      "--z-toast": "500",
      "--z-lightbox": "600",
    }
    pinAll(dark, "z-ladder", Z_LADDER)
    pinAll(light, "z-ladder", Z_LADDER)
  })
})

describe("r127-F5b Madarek parity — prefers-contrast: more port (A6 e)", () => {
  it("dark: elevation collapses to solid white rings; glass goes solid; hairline strengthens", () => {
    const media = blocks.find((x) => x.prelude === "@media (prefers-contrast: more)")
    expect(media, "the prefers-contrast block exists").toBeTruthy()
    const contrastDark: Record<string, string> = {
      ...dark,
      ...parseDecls(nestedBlock(media!.body, ":root") ?? ""),
    }
    pinAll(contrastDark, "contrast-dark", {
      "--elev-1": "0 0 0 1px rgba(255, 255, 255, 0.36)",
      "--elev-5": "0 0 0 3px rgba(255, 255, 255, 0.68)",
      "--glass-bg": "#0D1428", // var(--card) → the dark surface
      "--border": "rgba(255, 255, 255, 0.48)",
    })
  })
  it("light: solid black rings + solid glass (the .light block wins the cascade)", () => {
    const media = blocks.find((x) => x.prelude === "@media (prefers-contrast: more)")
    expect(media, "the prefers-contrast block exists").toBeTruthy()
    const contrastLight: Record<string, string> = {
      ...light,
      ...parseDecls(nestedBlock(media!.body, ".light") ?? ""),
    }
    pinAll(contrastLight, "contrast-light", {
      "--elev-1": "0 0 0 1px rgba(0, 0, 0, 0.32)",
      "--elev-5": "0 0 0 3px rgba(0, 0, 0, 0.64)",
      "--glass-bg": "#FFFFFF", // var(--card) → the light surface
      "--border": "rgba(0, 0, 0, 0.42)",
    })
  })
})

describe("r127-F5b Madarek parity — reduced-motion token zeroing (A6 f)", () => {
  it("the --t-* and --duration-* ladders collapse to 0ms under prefers-reduced-motion", () => {
    const rmBody = blocksNamed("@media (prefers-reduced-motion: reduce)").find((b) =>
      b.includes("--t-micro: 0ms")
    )
    expect(rmBody, "the RM :root zeroing block exists").toBeTruthy()
    const rmScope = parseDecls(nestedBlock(rmBody!, ":root") ?? "")
    pinAll(rmScope, "rm-zeroing", {
      "--t-micro": "0ms", "--t-fast": "0ms", "--t-base": "0ms",
      "--t-slow": "0ms", "--t-slower": "0ms", "--t-cinema": "0ms",
      "--duration-fast": "0ms", "--duration-base": "0ms", "--duration-slow": "0ms",
    })
  })
  it("the universal 0.01ms belt is present (every animation/transition)", () => {
    const raw = readFileSync("src/app/globals.css", "utf8").replace(/\s+/g, " ")
    expect(raw).toContain("animation-duration: 0.01ms !important")
    expect(raw).toContain("transition-duration: 0.01ms !important")
  })
})

// ── r129-F3 pin groups (mirrors tests/parity.mjs 224 → 329) ──────────────────

describe("r129 Madarek parity — the --accent-solid family (fleet six-token standard)", () => {
  it("dark: gold #E9B44C / hover #F5D48A / soft #2C2312 / strong #C9962F / ink #E9B44C / fg #05070F", () => {
    pinAll(dark, "accent-family-dark", {
      "--accent-solid": "#E9B44C",
      "--accent-hover": "#F5D48A",
      "--accent-soft": "#2C2312",
      "--accent-strong": "#C9962F",
      "--accent-ink": "#E9B44C",
      "--accent-fg": "#05070F",
    })
  })
  it("light: copper #B57438 / hover #9A5F25 / soft #F4E4D2 / strong #5C3416 / ink #5C3416 / fg #1A0F06", () => {
    pinAll(light, "accent-family-light", {
      "--accent-solid": "#B57438",
      "--accent-hover": "#9A5F25",
      "--accent-soft": "#F4E4D2",
      "--accent-strong": "#5C3416",
      "--accent-ink": "#5C3416",
      "--accent-fg": "#1A0F06",
    })
  })
  it("the repointed consumers resolve to the same values (--primary/--primary-foreground chain to the family)", () => {
    pin(dark, "accent-consumers", "--primary", "#E9B44C")
    pin(dark, "accent-consumers", "--primary-foreground", "#05070F")
    pin(light, "accent-consumers", "--primary", "#B57438")
    pin(light, "accent-consumers", "--primary-foreground", "#1A0F06")
  })
})

describe("r129 Madarek parity — token-matrix SB fixes (canonical names)", () => {
  it("the canonical --r-* radius ladder exists globally (Tailwind --radius-* stays)", () => {
    const R_LADDER = {
      "--r-xs": "6px", "--r-sm": "8px", "--r-md": "10px", "--r-lg": "12px",
      "--r-xl": "16px", "--r-2xl": "20px", "--r-3xl": "28px", "--r-full": "9999px",
    }
    pinAll(dark, "r-ladder", R_LADDER)
    pinAll(light, "r-ladder", R_LADDER)
  })
  it("press register + hover-lift + the two canonical easing names", () => {
    for (const scope of [dark, light]) {
      pin(scope, "press-register", "--press-scale", "0.97")
      pin(scope, "press-register", "--hover-lift", "-1px")
      pin(scope, "easing-r129", "--ease-bounce", "cubic-bezier(0.34, 1.56, 0.64, 1)")
      pin(scope, "easing-r129", "--ease-spring-snappy", "cubic-bezier(0.5, 1.6, 0.4, 1)")
    }
  })
  it("brand aliases: --gold / --gold-soft / --brand-purple / --text-on-accent (canonical values)", () => {
    pin(dark, "brand-aliases", "--gold", "#E9B44C")
    pin(light, "brand-aliases", "--gold", "#D6A330")
    pin(dark, "brand-aliases", "--gold-soft", "#2C2410")
    pin(light, "brand-aliases", "--gold-soft", "#FCF1CD")
    pin(dark, "brand-aliases", "--brand-purple", "#B7A0F4")
    pin(light, "brand-aliases", "--brand-purple", "#8A6FE0")
    pin(dark, "brand-aliases", "--text-on-accent", "#05070F")
    pin(light, "brand-aliases", "--text-on-accent", "#1A0F06")
  })
  it("the canonical neutral ramp under Madarek's own names, both themes", () => {
    pinAll(dark, "neutral-ramp-dark", {
      "--neutral-0": "#0D1428", "--neutral-50": "#070B16", "--neutral-100": "#121A36",
      "--neutral-150": "#182142", "--neutral-200": "#1B2444", "--neutral-300": "#263052",
      "--neutral-400": "#7A83A0", "--neutral-500": "#8E97B8", "--neutral-700": "#C3C8DC",
      "--neutral-800": "#DDE1EE", "--neutral-900": "#F2EFE6",
    })
    pinAll(light, "neutral-ramp-light", {
      "--neutral-0": "#FFFFFF", "--neutral-50": "#FBFAF9", "--neutral-100": "#F7F6F3",
      "--neutral-150": "#F1EFEC", "--neutral-200": "#E9E7E2", "--neutral-300": "#D9D6D0",
      "--neutral-400": "#8E8A82", "--neutral-500": "#6F6C66", "--neutral-700": "#4F4D48",
      "--neutral-800": "#322F2A", "--neutral-900": "#191918",
    })
  })
})

// ── r130 pin groups (W2-5: type-scale port, semantic motion, de-glow) ───────

describe("r130 Madarek parity — type scale (tokens.css §2.2 + §6a roles)", () => {
  it("the --fs-* rungs live in the product layer (page-title clamp 20-28 @ 700)", () => {
    pinAll(dark, "type-scale", {
      "--fs-h1": "30px", "--fs-h2": "22px", "--fs-h3": "18px",
      "--fs-body-lg": "17px", "--fs-body": "15px", "--fs-sm": "13px",
      "--fs-xs": "12px", "--fs-xxs": "11px",
      "--fs-page-title": "clamp(20px, 3.4vw, 28px)",
      "--fs-section-title": "17px",
      "--lh-tight": "1.05", "--lh-snug": "1.20", "--lh-base": "1.65", "--lh-loose": "1.85",
      "--ls-normal": "0", "--fw-bold": "700",
    })
    pinAll(light, "type-scale", {
      "--fs-body": "15px", "--fs-page-title": "clamp(20px, 3.4vw, 28px)", "--lh-base": "1.65",
    })
  })
  it("the --type-* roles compose the rungs (page-title 700 · section 600 · body 1.65 · table 13 — RESOLVED values)", () => {
    pinAll(dark, "type-roles", {
      "--type-page-title-size": "clamp(20px, 3.4vw, 28px)",
      "--type-page-title-weight": "700",
      "--type-section-title-size": "17px",
      "--type-section-title-weight": "600",
      "--type-body-size": "15px",
      "--type-body-line-height": "1.65",
      "--type-table-size": "13px",
    })
  })
  it("--fw-black resolves to 700 (Plex ships no 800 — the wave 2-a honesty fix)", () => {
    pin(dark, "fw-black", "--fw-black", "700")
    const raw = readFileSync("src/app/globals.css", "utf8").replace(/\s+/g, " ")
    expect(raw).toMatch(/--fw-black:\s*var\(--fw-bold\)/)
  })
  it("body base = 15px / 1.65 and p/li ride the same leading (the MASTER §3 claim is finally real)", () => {
    const raw = readFileSync("src/app/globals.css", "utf8").replace(/\s+/g, " ")
    expect(raw).toMatch(/body\s*\{[^}]*font-size:\s*var\(--fs-body\)[^}]*line-height:\s*var\(--lh-base\)/)
    expect(raw).toMatch(/p, li, \.body-text\s*\{[^}]*line-height:\s*var\(--lh-base\)/)
    expect(raw).not.toMatch(/p, li, \.body-text\s*\{[^}]*line-height:\s*1\.75/)
  })
  it("heading tracking is ZERO in both directions (21-c law — the -0.02/-0.01/-0.026em values are gone)", () => {
    const raw = readFileSync("src/app/globals.css", "utf8").replace(/\s+/g, " ")
    expect(raw).not.toMatch(/h1, h2\s*\{[^}]*letter-spacing:\s*-0\.0/)
    expect(raw).not.toContain("[dir=\"ltr\"] h1, [dir=\"ltr\"] h2, [dir=\"ltr\"] h3 { letter-spacing: -0.026em; }")
  })
})

describe("r130 Madarek parity — semantic motion layer + layout/state/topbar tokens", () => {
  it("page 320 / reveal 360 / stat 700 / skeleton 1200 + the 60ms stagger grammar", () => {
    pinAll(dark, "motion-semantic", {
      "--motion-duration-page": "320ms",
      "--motion-duration-reveal": "360ms",
      "--motion-duration-stat": "700ms",
      "--motion-duration-skeleton": "1200ms",
      "--motion-stagger-step": "60ms",
      "--motion-stagger-cap": "6",
      "--motion-ease-decelerate": "cubic-bezier(0.16, 1, 0.3, 1)",
    })
    pinAll(light, "motion-semantic", {
      "--motion-duration-stat": "700ms",
      "--motion-duration-reveal": "360ms",
    })
  })
  it("content/marketing columns + the input-focus halo + the 86% topbar", () => {
    pin(dark, "layout", "--content-max-w", "1280px")
    pin(dark, "layout", "--marketing-max-w", "1200px")
    pin(dark, "state", "--state-input-focus-halo", "0 0 0 3px color-mix(in srgb, #E9B44C 22%, transparent)")
    pin(dark, "topbar", "--topbar-bg", "rgba(7, 11, 22, 0.86)")
    pin(light, "topbar", "--topbar-bg", "rgba(251, 250, 249, 0.86)")
  })
  it("the RM belt resets animation/transition DELAYS (SB-P1-1: `both`-filled staggers stayed invisible up to 400ms)", () => {
    const raw = readFileSync("src/app/globals.css", "utf8").replace(/\s+/g, " ")
    expect(raw).toContain("animation-delay: 0s !important")
    expect(raw).toContain("transition-delay: 0s !important")
  })
  it(".reveal defaults to the 360ms reveal duration on the decelerate curve (was 520ms ease-out-quart)", () => {
    const raw = readFileSync("src/app/globals.css", "utf8").replace(/\s+/g, " ")
    expect(raw).toMatch(/\.reveal\s*\{[^}]*var\(--rv-dur, var\(--motion-duration-reveal\)\)\s*var\(--motion-ease-decelerate\)/)
  })
})

describe("r130 Madarek parity — recipe pins (inner radius 16 · page-title resize · de-glow)", () => {
  it("inner cards + dialogs ride rounded-xl (16px = --r-xl); landing cards keep 20", () => {
    const rawCard = readFileSync("src/components/ui/card.tsx", "utf8")
    expect(rawCard).toContain("overflow-hidden rounded-xl bg-card")
    expect(rawCard).not.toContain("rounded-2xl")
    const rawDialog = readFileSync("src/components/ui/dialog.tsx", "utf8")
    expect(rawDialog).toContain("gap-4 rounded-xl bg-popover")
    expect(rawDialog).not.toContain("rounded-2xl")
  })
  it("PageHeader h1 + SectionHeader h2 consume the page-title clamp token at 700, tracking 0", () => {
    const rawPageHeader = readFileSync("src/components/ui/PageHeader.tsx", "utf8")
    expect(rawPageHeader).toContain("text-(length:--fs-page-title)")
    expect(rawPageHeader).not.toContain("tracking-tight")
    const rawSectionHeader = readFileSync("src/components/ui/SectionHeader.tsx", "utf8")
    expect(rawSectionHeader).toContain("text-(length:--fs-page-title)")
    expect(rawSectionHeader).not.toContain("font-semibold")
    expect(rawSectionHeader).not.toContain("tracking-tight")
  })
  it("zero font-extrabold / blur-3xl / glow-pool in the product source (Plex has no 800; ground is flat)", () => {
    const walk = (dir: string): string[] => {
      const entries = readdirSync(dir, { withFileTypes: true })
      const out: string[] = []
      for (const e of entries) {
        const p = `${dir}/${e.name}`
        // src/test is skipped: the pin suites legitimately SPELL the banned
        // tokens inside their own assertions.
        if (e.isDirectory()) {
          if (!/\/test$|\/__test__$/.test(p)) out.push(...walk(p))
        } else if (/\.(tsx|ts|css)$/.test(e.name)) out.push(p)
      }
      return out
    }
    const offenders: string[] = []
    for (const f of walk("src")) {
      const s = readFileSync(f, "utf8")
      if (/font-extrabold/.test(s)) offenders.push(`font-extrabold → ${f}`)
      if (/blur-3xl/.test(s)) offenders.push(`blur-3xl → ${f}`)
      if (/GlowPool/.test(s)) offenders.push(`glow-pool component → ${f}`)
    }
    expect(offenders, `de-glow offenders found:\n  ${offenders.join("\n  ")}`).toEqual([])
  })
})

describe("r134 parity — تعذّر policy · lg rung 48px canon · og alt family form · RTL docks · stale docs", () => {
  const nc = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, " ")
  const read = (p: string) => nc(readFileSync(p, "utf8"))

  it("تعذّر copy policy: broadcast/billing/posts = تعذّر, marketing = تعذّرت, zero فاشل/فشل user-facing", () => {
    const rawBcast = read("src/app/dashboard/broadcast/page.tsx")
    const rawBill = read("src/app/dashboard/billing/page.tsx")
    const rawPosts = read("src/app/dashboard/posts/page.tsx")
    const rawMrkt = read("src/app/dashboard/marketing/page.tsx")
    expect(rawBcast).toContain('failed: "تعذّر"')
    expect(rawBill).toContain('failed: "تعذّر"')
    expect(rawPosts).toContain('failed: "تعذّر"')
    expect(rawMrkt).toContain('failed: "تعذّرت"')
    expect(rawBcast).not.toContain("فاشل")
    expect(rawBill).not.toContain("فاشل")
    expect(rawPosts).not.toContain("فاشل")
    expect(rawMrkt).not.toContain("فشل")
  })

  it("button lg rung = h-12 (48px, madarek components.css:474 canon) — never h-11", () => {
    const rawBtn = read("src/components/ui/button.tsx")
    expect(rawBtn).toContain('lg: "h-12 gap-2.5 px-6 text-sm"')
    expect(rawBtn).not.toContain('lg: "h-11')
  })

  it("og:image alt rides the family form «الربط الذكي — SmartBot» (root + 6 routes)", () => {
    const ogFiles = [
      "src/app/layout.tsx", "src/app/privacy/page.tsx", "src/app/terms/page.tsx",
      "src/app/subscribe/layout.tsx", "src/app/pricing/layout.tsx",
      "src/app/demo/layout.tsx", "src/app/register/layout.tsx",
    ]
    for (const f of ogFiles) {
      expect(read(f), f).toContain('alt: "الربط الذكي — SmartBot"')
      expect(read(f), f).not.toContain('alt: "SmartBot —')
    }
  })

  it("RTL docks: all three sidebar rails ride top-0 start-0 (logical), zero right-0", () => {
    const dockFiles = [
      "src/app/dashboard/DashboardShell.tsx",
      "src/components/layout/AdminShell.tsx",
      "src/app/demo/page.tsx",
    ]
    for (const f of dockFiles) {
      expect(read(f), f).toContain("fixed top-0 start-0 z-(--z-dropdown)")
      expect(read(f), f).not.toContain("top-0 right-0")
    }
  })

  it("stale docs repaired: input.tsx documents h-11/rounded-md; dialog.tsx documents ease-smooth @ 240ms", () => {
    const rawInput = readFileSync("src/components/ui/input.tsx", "utf8")
    const rawDialog = readFileSync("src/components/ui/dialog.tsx", "utf8")
    expect(rawInput).not.toContain("h-12 touch height, rounded-lg")
    expect(rawInput).toContain("h-11 touch height, rounded-md")
    expect(rawDialog).not.toContain("spring-eased scale-in")
    expect(rawDialog).toContain("ease-smooth @ 240ms")
  })
})
