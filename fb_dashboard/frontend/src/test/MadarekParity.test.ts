/**
 * Vitest twin of tests/parity.mjs (same pin machinery, same scopes).
 *
 * PHASE 5 (r152 — Circuit Petrol): all pinned VALUES re-anchored to the
 * petrol contract (ground #050506, signal teal #56E2F2 primary, re-graded
 * families/neutrals/status; lime --c-lime-* is the new AI-only signal).
 * Names, pin count and consumption structure unchanged. The file keeps
 * its historical name (MadarekParity) as the load-bearing import path —
 * the contract it enforces is now the SmartBot petrol constitution.
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
  "--background": "#050506", // Madarek --bg (neutral-50 night)
  "--card": "#0A0B0E", // Madarek --surface (neutral-0)
  "--secondary": "#101115", // Madarek --bg-soft / --surface-2 (neutral-100)
  "--foreground": "#F4F4F6", // Madarek --text (neutral-900 sand)
  "--muted-foreground": "#A7A8B0", // Madarek --text-secondary
  "--placeholder-text": "#777983", // Madarek --text-muted (neutral-500)
  "--border": "#292A30", // Madarek hairline (neutral-200)
}
const GROUNDS_LIGHT = {
  "--background": "#F2F2F0",
  "--card": "#FFFFFF",
  "--secondary": "#E9E9E6",
  "--foreground": "#101115",
  "--muted-foreground": "#41434B",
  "--placeholder-text": "#55585F", // Madarek --text-muted light (WCAG literal)
  "--border": "#D5D5D2",
}
const ACCENT_DARK = {
  "--primary": "#56E2F2", // Madarek --accent (their --accent is the 15% wash twin)
  "--primary-foreground": "#05171B", // Madarek --accent-fg
  // Madarek --accent-ink #56E2F2, oklch spelling (parsed by the contrast gate)
  "--accent-foreground": "oklch(0.8437 0.1205 205.8)",
  "--c-copper-bg": "#0D1E24", // Madarek --accent-soft (family copper ground)
}
const ACCENT_LIGHT = {
  "--primary": "#0E7A8A",
  "--primary-foreground": "#F2F2F0",
  // Madarek --accent-ink #0B5A68 (copper-deep), oklch spelling
  "--accent-foreground": "oklch(0.4661 0.0782 211.8)",
  "--c-copper-bg": "#DCF1F4",
}
// r127-F5b: status bases = the canonical family inks in BOTH themes (dark
// luminous / light vivid — the fleet standard); fill foregrounds = the
// Madarek fg values (--danger-fg pattern: #191918 light / #05070F dark).
const STATUS_DARK = {
  "--success": "#5FE3A1", "--success-soft": "#0D241B", "--success-foreground": "#05171B",
  "--warning": "#F8CF6E", "--warning-soft": "#332A10",
  "--info": "#8FC9D8", "--info-soft": "#102530",
  "--destructive": "#F2919B", "--destructive-soft": "#331821", "--destructive-foreground": "#05171B",
}
const STATUS_LIGHT = {
  // r148 (19-AUDIT-CROSS R1, authorized pin edit — mirrors tests/parity.mjs
  // STATUS_LIGHT): the light BASE hues move to the resolved fleet set the
  // r127 comment always claimed (Menu/Link/Order ship these verbatim):
  // success #2F7D4F→#4FA66D · warning #8C6A1D→#D6A330 · info #3B6FB5→#5C8FCE
  // · destructive #C2414D→#DD6E78. Count unchanged.
  "--success": "#2E9E6F", "--success-soft": "#D9F3E6", "--success-foreground": "#05171B", // mint-ink / mint-bg / danger-fg
  "--warning": "#B08210", "--warning-soft": "#FBF1CF", // yellow-ink / yellow-bg (phase8: حشوة 3.47:1)
  "--info": "#3E96BC", "--info-soft": "#DDF0F7", // sky-ink / sky-bg
  "--destructive": "#D95F6C", "--destructive-soft": "#FCE3E6", "--destructive-foreground": "#05171B", // rose-ink / rose-bg / danger-fg
}
const FAMILIES_DARK: Record<string, [string, string, string]> = {
  peach: ["#2A1F1C", "#FFB08C", "#FFE2D1"],
  mint: ["#0D241B", "#5FE3A1", "#CFEDE1"],
  lavender: ["#1E2233", "#A9B4F0", "#D8DDF9"],
  sky: ["#102530", "#8FC9D8", "#CFE8F0"],
  yellow: ["#332A10", "#F8CF6E", "#F9E6BC"],
  rose: ["#331821", "#F2919B", "#FAD3D7"],
  sand: ["#1A1D1C", "#C4C9C4", "#DEE3E0"],
  grey: ["#141519", "#A7A8B0", "#D6D7DB"],
  copper: ["#0D1E24", "#56E2F2", "#C9F6FC"],
}
const FAMILIES_LIGHT: Record<string, [string, string, string]> = {
  peach: ["#FFEDE3", "#E0825C", "#74301C"],
  mint: ["#D9F3E6", "#2E9E6F", "#0F4A33"],
  lavender: ["#E9E8F7", "#7B86DC", "#32387E"],
  sky: ["#DDF0F7", "#3E96BC", "#0F3D52"],
  yellow: ["#FBF1CF", "#C29217", "#6B4C0B"],
  rose: ["#FCE3E6", "#D95F6C", "#6B2128"],
  sand: ["#EDEFEA", "#849489", "#385241"],
  grey: ["#EAEEF0", "#62696C", "#2E3A40"],
  copper: ["#DCF1F4", "#12748A", "#0C4753"],
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
  it("dark: signal-teal #56E2F2 set (phase5 Circuit Petrol --accent; accent-ink in oklch spelling — was the gold #E9B44C Madarek heritage)", () => {
    pinAll(dark, "dark", ACCENT_DARK)
  })
  it("light: deep petrol #0E7A8A set (phase5 Circuit Petrol --accent; accent-ink in oklch spelling — was the copper #B57438 Madarek heritage)", () => {
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
  it("dark rgba(10,11,14,0.78) · light rgba(242,242,240,0.78)", () => {
    pin(dark, "glass-dark", "--glass-bg", "rgba(10, 11, 14, 0.78)")
    pin(light, "glass-light", "--glass-bg", "rgba(242, 242, 240, 0.78)")
  })
})

// ── r127-F5b pin groups (mirrors tests/parity.mjs 82 → 185) ─────────────────

describe("r127-F5b Madarek parity — focus contract (A6 P1)", () => {
  it("dark: --ring #56E2F2 + --state-focus-ring-color #56E2F2 (r130 FLEET-1 true parity: the canonical cascade resolves dark ring through the SOLID gold — tokens.css:543; #C9962F painted night focus one shade darker than madarek's own UI)", () => {
    pin(dark, "focus-dark", "--ring", "#56E2F2")
    pin(dark, "focus-dark", "--state-focus-ring-color", "#56E2F2")
  })
  it("light: --ring #0B5A68 + --state-focus-ring-color #0B5A68 (10.29:1 — NOT raw copper 3.65:1)", () => {
    pin(light, "focus-light", "--ring", "#0B5A68")
    pin(light, "focus-light", "--state-focus-ring-color", "#0B5A68")
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
      "--glass-bg": "#0A0B0E", // var(--card) → the dark surface
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
  it("dark: signal-teal #56E2F2 / hover #7CEFF9 / soft #0D1E24 / strong #2AC5D8 / ink #56E2F2 / fg #05171B (phase5 petrol — was the gold-era names)", () => {
    pinAll(dark, "accent-family-dark", {
      "--accent-solid": "#56E2F2",
      "--accent-hover": "#7CEFF9",
      "--accent-soft": "#0D1E24",
      "--accent-strong": "#2AC5D8",
      "--accent-ink": "#56E2F2",
      "--accent-fg": "#05171B",
    })
  })
  it("light: deep petrol #0E7A8A / hover #0B6573 / soft #DCF1F4 (phase5 petrol — was the copper-era names)", () => {
    pinAll(light, "accent-family-light", {
      "--accent-solid": "#0E7A8A",
      "--accent-hover": "#0B6573",
      "--accent-soft": "#DCF1F4",
      "--accent-strong": "#0B5A68",
      "--accent-ink": "#0B5A68",
      "--accent-fg": "#F2F2F0",
    })
  })
  it("the repointed consumers resolve to the same values (--primary/--primary-foreground chain to the family)", () => {
    pin(dark, "accent-consumers", "--primary", "#56E2F2")
    pin(dark, "accent-consumers", "--primary-foreground", "#05171B")
    pin(light, "accent-consumers", "--primary", "#0E7A8A")
    pin(light, "accent-consumers", "--primary-foreground", "#F2F2F0")
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
    pin(dark, "brand-aliases", "--gold", "#56E2F2")
    pin(light, "brand-aliases", "--gold", "#12748A")
    pin(dark, "brand-aliases", "--gold-soft", "#0D1E24")
    pin(light, "brand-aliases", "--gold-soft", "#DCF1F4")
    pin(dark, "brand-aliases", "--brand-purple", "#A9B4F0")
    pin(light, "brand-aliases", "--brand-purple", "#7B86DC")
    pin(dark, "brand-aliases", "--text-on-accent", "#05171B")
    pin(light, "brand-aliases", "--text-on-accent", "#F2F2F0")
  })
  it("the canonical neutral ramp under Madarek's own names, both themes", () => {
    pinAll(dark, "neutral-ramp-dark", {
      "--neutral-0": "#0A0B0E", "--neutral-50": "#050506", "--neutral-100": "#101115",
      "--neutral-150": "#17181D", "--neutral-200": "#292A30", "--neutral-300": "#41434B",
      "--neutral-400": "#898B90", "--neutral-500": "#777983", "--neutral-700": "#A7A8B0",
      "--neutral-800": "#D6D7DB", "--neutral-900": "#F4F4F6",
    })
    pinAll(light, "neutral-ramp-light", {
      "--neutral-0": "#FFFFFF", "--neutral-50": "#F2F2F0", "--neutral-100": "#E9E9E6",
      "--neutral-150": "#E1E1DE", "--neutral-200": "#D5D5D2", "--neutral-300": "#C2C2BE",
      "--neutral-400": "#62656C", "--neutral-500": "#55585F", "--neutral-700": "#41434B",
      "--neutral-800": "#2A2B31", "--neutral-900": "#101115",
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
    pin(dark, "state", "--state-input-focus-halo", "0 0 0 3px color-mix(in srgb, #56E2F2 22%, transparent)")
    pin(dark, "topbar", "--topbar-bg", "rgba(5, 5, 6, 0.86)")
    pin(light, "topbar", "--topbar-bg", "rgba(242, 242, 240, 0.86)")
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

describe("p10a parity — chart ink contract: recharts text/cursor = the TEXT token, not the surface token", () => {
  const nc = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, " ")
  const read = (p: string) => nc(readFileSync(p, "utf8"))

  // P10-1a (route audit): tick fill/cursor bound to var(--muted) — the
  // SURFACE-2 fill (#101115 dark / #E1E1DE light) — painted 1.11:1 / 1.24:1
  // on card in both stages: the analytics daily-trend axis labels were
  // invisible. The secondary-TEXT token --muted-foreground measures
  // 8.07:1 (dark) / 8.19:1 (light) on card.
  it("TrendLineChart + ActivityBarChart bind tick text and tooltip cursors to var(--muted-foreground)", () => {
    for (const f of ["src/components/charts/TrendLineChart.tsx", "src/components/charts/index.tsx"]) {
      const raw = read(f)
      expect(raw, f).toContain('const MUTED = "var(--muted-foreground)"')
      expect(raw, f).toContain("tick={{ fontSize: 10, fill: MUTED }}")
      expect(raw, f).not.toContain('"var(--muted)"')
    }
    expect(read("src/components/charts/TrendLineChart.tsx")).toContain(
      'cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}',
    )
    expect(read("src/components/charts/index.tsx")).toContain("cursor={{ fill: MUTED, opacity: 0.4 }}")
  })

  it("ActivityHeatmap zero-cell KEEPS var(--muted) as backgroundColor (surface semantics — the ink fix must not leak)", () => {
    const raw = read("src/components/charts/ActivityHeatmap.tsx")
    expect(raw).toContain('backgroundColor: count === 0 ? "var(--muted)" : cellMix(count, max)')
    expect(raw).not.toContain('fill: "var(--muted)"')
  })

  it("the ink tier resolves AA on card in both stages (dark #A7A8B0 / light #41434B on their card grounds)", () => {
    expect(resolve(dark, dark["--muted-foreground"]!)).toBe("#A7A8B0")
    expect(resolve(light, light["--muted-foreground"]!)).toBe("#41434B")
  })
})

describe("P15→P16-A concept A parity — the character-led cinematic hero", () => {
  /* The vitest twin of parity.mjs's §P15→§P16-A block (same contracts, the
     compact mirror): the owner rejected the P12-2c hero; concept A
     re-composed the hero around ONE protagonist (P15: the primitives
     robot), and P16-A re-anchors on the AUTHORED GLB character — the
     full-figure machine on a visible stage inside the first viewport,
     the console/status island under the transparent canvas, the Arabic
     display headline bottom-anchored, the sink-and-fade scroll exit, the
     heroBus beat channel. The retired files (BotChatSimulator /
     HeroCompanion / OrbitScene / HeroDepthLayer / the primitives
     RobotScene) are deleted in the same commit. Honesty pins (ticker
     digits, DEMO badge, sr-only announcer) are UNCHANGED. */
  const read = (p: string) => readFileSync(p, "utf8")
  const exists = (p: string) => {
    try { readFileSync(p, "utf8"); return true } catch { return false }
  }
  const rawLanding = read("src/app/landing.css").replace(/\/\*[\s\S]*?\*\//g, " ")

  it("the retired hero layer is DELETED (BotChatSimulator, HeroCompanion, OrbitScene, HeroDepthLayer, the primitives RobotScene)", () => {
    for (const f of [
      "src/components/landing/BotChatSimulator.tsx",
      "src/components/landing/HeroCompanion.tsx",
      "src/components/landing/OrbitScene.tsx",
      "src/components/landing/HeroDepthLayer.tsx",
      "src/components/landing/RobotScene.tsx",
    ]) {
      expect(exists(f), `${f} must be deleted (P15/P16-A retirement)`).toBe(false)
    }
  })

  it("the composition tokens (P17): --sb-fig 0.76 / --sb-floor 0.84 desktop + the mobile bust re-pose 1.3/1.35", () => {
    expect(rawLanding).toMatch(/--sb-fig:\s*0\.76;/)
    expect(rawLanding).toMatch(/--sb-floor:\s*0\.84;/)
    expect(rawLanding).toMatch(/@media \(max-width: 1024px\)[^@]*?--sb-fig:\s*1\.3;[^@]*?--sb-floor:\s*1\.35;/)
  })

  it("ONE composed viewport: ≥1025px hero = calc(100svh - 74px) with the 620px floor + the 70vw display measure", () => {
    const desk = rawLanding.match(/@media \(min-width: 1025px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""
    expect(desk).toMatch(/\.ln-hero-robot\s*\{[^}]*block-size:\s*calc\(100svh - 74px\)/)
    expect(desk).toMatch(/\.ln-hero-robot\s*\{[^}]*min-block-size:\s*620px/)
    expect(desk).toMatch(/\.ln-ticker-island\s*\{[^}]*z-index:\s*0/)
    expect(desk).toMatch(/\.ln-hero-copy\s*\{[^}]*z-index:\s*3/)
    expect(desk).toMatch(/\.ln-hero-copy\s*\{[^}]*max-inline-size:\s*70vw/)
  })

  it("the Arabic display headline: IBM Plex Sans Arabic FIRST (var(--font-arabic)) at the concept scale — Space Grotesk never renders the h1", () => {
    const title = rawLanding.match(/\.landing \.ln-hero-robot \.ln-hero-title\s*\{([^}]*)\}/)?.[1] ?? ""
    expect(title).toContain("font-family: var(--font-arabic)")
    expect(title).toMatch(/font-size:\s*clamp\(3\.2rem,\s*7vw,\s*5\.5rem\)/)
    expect(title).toMatch(/line-height:\s*1\.14;/)
    expect(title).toMatch(/font-weight:\s*var\(--fw-bold\)/)
    expect(title).not.toMatch(/grotesk/i) // Space Grotesk carries no Arabic glyphs — the silent body-grade fallback was the P1 defect
  })

  it("the ticker box grammar: hairline + outside bracket corners + height-stable beat body", () => {
    expect(rawLanding).toMatch(/\.ln-ticker\s*\{[^}]*border:\s*1px solid var\(--ln-line\)/)
    expect(rawLanding).toMatch(/\.ln-ticker-beat\s*\{[^}]*min-block-size:\s*5\.4em/)
    expect(rawLanding).toMatch(/\.ln-ticker-corner\.c-a\s*\{[^}]*inset-block-start:\s*-5px;[^}]*inset-inline-start:\s*-5px/)
  })

  it("the status panel: hairline spine, synced active row, dim rows ≥4.5:1 (0.55 alpha)", () => {
    expect(rawLanding).toMatch(/\.ln-status\s*\{[^}]*border-inline-start:\s*1px solid var\(--ln-line\)/)
    expect(rawLanding).toMatch(/\.ln-status li\s*\{[^}]*color:\s*rgb\(244 244 246 \/ 0\.55\)/)
    expect(rawLanding).toMatch(/\.ln-status li\[data-active='true'\]\s*\{[^}]*color:\s*var\(--ln-cream\)/)
  })

  it("the ticker island (HeroTicker, 2-e: B's scenario engine): honest demo cycle, aria-live polite, one stage machine, IO + hidden-tab pause", () => {
    const rawTicker = read("src/components/landing/HeroTicker.tsx")
    const scenarios = rawTicker.slice(rawTicker.indexOf("const SCENARIOS"), rawTicker.indexOf("/* ── the stage script"))
    // honesty: the only digits are the product's own published plan terms — never fabricated metrics
    expect(scenarios).toContain("100 رد")
    expect(scenarios).toContain("19 د.ل")
    expect(scenarios).not.toMatch(/\d+\s*(%|k|ألف|مليون)/)
    expect(rawTicker).toContain("عرض توضيحي") // the DEMO badge (the honesty law, visible)
    expect(rawTicker).toContain("STAGE_MS")
    expect(rawTicker).toContain("RESET_MS")
    expect(rawTicker).toContain("REPLY_WORD_MS")
    expect(rawTicker).toContain("useMemo") // the memoized stage script (never re-arms mid-beat)
    expect(rawTicker).toContain('aria-live="polite"')
    expect(rawTicker).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')")
    expect(rawTicker).toContain("IntersectionObserver")
    expect(rawTicker).toContain("document.hidden")
    expect(rawTicker).toContain("كم سعر الاشتراك عندكم؟")
    expect(rawTicker).toContain("النية:")
    expect(rawTicker).toContain("تم تحويل المحادثة إلى الفريق البشري")
    expect(rawTicker).toContain("ليست بيانات عملاء حقيقيين") // the sr-only honesty line
    expect(rawTicker).toContain('className="sr-only"') // the one-per-beat announcer
  })

  it("the sink-and-fade exit (HeroExit): compositor verbs, rAF-gated passive scroll, RM never arms", () => {
    const rawExit = read("src/components/landing/HeroExit.tsx")
    expect(rawExit).toContain("EXIT_SPAN_VH = 0.72")
    expect(rawExit).toContain("EXIT_SINK_PX = 96")
    expect(rawExit).toContain("passive: true")
    expect(rawExit).toContain("cancelAnimationFrame")
    expect(rawExit).toContain("window.removeEventListener")
    expect(rawExit).toContain("matchMedia('(prefers-reduced-motion: reduce)').matches")
  })

  it("the character scene (P16-A CharacterScene): solver + pauses + disposal + RM static pose + DPR 2 + the GLB/fallback contract", () => {
    const rawRobot = read("src/components/landing/CharacterScene.tsx")
    expect(rawRobot).toContain("getPropertyValue('--sb-fig'")
    expect(rawRobot).toContain("getPropertyValue('--sb-floor'")
    expect(rawRobot).toMatch(/Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/)
    expect(rawRobot).toContain("IntersectionObserver")
    expect(rawRobot).toContain("visibilitychange")
    expect(rawRobot).toContain("renderer.dispose()")
    expect(rawRobot).toContain("for (const g of geometries) g.dispose()")
    expect(rawRobot).toContain("for (const m of materials) m.dispose()")
    expect(rawRobot).toContain("one static posed frame")
    expect(rawRobot).toContain("matchMedia('(pointer: fine)')")
    expect(rawRobot).toContain("degToRad(25)")
    expect(rawRobot).toContain("degToRad(12)")
    // the P16-A additions: the GLB contract + the art-directed fallback
    expect(rawRobot).toContain("'/models/smartbot-character.glb'")
    expect(rawRobot).toContain("import('three/examples/jsm/loaders/GLTFLoader.js')")
    expect(rawRobot).toContain("setFailed(true)")
  })

  it("the heroBus beat channel (P16-A): the honest engine dispatches, the character subscribes", () => {
    const rawBus = read("src/components/landing/heroBus.ts")
    const rawTicker = read("src/components/landing/HeroTicker.tsx")
    const rawChar = read("src/components/landing/CharacterScene.tsx")
    expect(rawBus).toContain("export const HERO_BEAT_EVENT = 'smartbot:hero-beat'")
    expect(rawTicker).toContain("import { dispatchHeroBeat } from './heroBus'")
    expect(rawTicker).toContain("dispatchHeroBeat({ beat, scenarioId: scenario.id })")
    expect(rawChar).toContain("import { subscribeHeroBeat, lastHeroBeat, type HeroBeat, type HeroBeatDetail } from './heroBus'")
    expect(exists("public/models/smartbot-character.glb")).toBe(true)
  })

  it("the page composes the scene: exit-wrapped character layer + glow/vignette + canvas mount + ticker + honest CTAs", () => {
    const rawPage = read("src/app/page.tsx")
    expect(rawPage).toContain("<HeroTicker />")
    expect(rawPage).toContain("<HeroExit>")
    expect(rawPage).toContain('className="ln-robot-glow"')
    expect(rawPage).toContain('className="ln-robot-vignette"')
    expect(rawPage).toContain('className="ln-robot-canvas"')
    expect(rawPage).toContain('<MagneticGoldLink href="/subscribe" xl withArrow')
    expect(rawPage).toContain('<Link href="/demo" className="ln-btn-ghost">')
    expect(rawPage).toContain("تعرّف على")
  })

  it("the mobile stack (P17: ≤1024px character-first): 41svh BUST stage (the CTA returns to the fold), island display:contents, compact status ON, ONE-line console", () => {
    const raw = read("src/app/landing.css")
    const mob = raw.match(/@media \(max-width: 1024px\)\s*\{([\s\S]*)\}\s*$/)?.[1]
      ?? raw.slice(raw.lastIndexOf("@media (max-width: 1024px)"))
    expect(mob).toMatch(/\.ln-robot-stage\s*\{[^}]*block-size:\s*41svh/) /* P17: 56→41 + bust crop — parity.mjs re-anchored in lockstep */
    expect(mob).toMatch(/\.ln-ticker-island\s*\{[^}]*display:\s*contents/)
    expect(mob).toMatch(/\.ln-ticker-status\s*\{[^}]*display:\s*flex/)
    expect(mob).toMatch(/\.ln-status\s*\{[^}]*display:\s*none/)
    expect(mob).toMatch(/\.ln-ticker-msg\s*\{[^}]*white-space:\s*nowrap/) // the ONE-line console
  })
})
