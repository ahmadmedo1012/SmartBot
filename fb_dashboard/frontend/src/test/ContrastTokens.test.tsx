/**
 * v24-C6 — a11y contrast pins (the 4 pairs the v24-B4 audit caught failing).
 *
 * These are the vitest twins of the CI gate `scripts/check_contrast.mjs`
 * (same oklch→sRGB→WCAG math): they fail `npx vitest run` directly whenever
 * a token edit regresses one of the previously-fixed pairs, so the fix
 * family is protected at BOTH gates:
 *
 *   1. light `--input` vs card/background ≥ 3:1 (WCAG 1.4.11 non-text)
 *      — was 1.53:1 (v10-I3 fixed dark only)
 *   2. `--input` (dark) vs card/background ≥ 3:1 — pins the v10-I3 raise
 *   3. espresso text on BOTH flame-gradient ends ≥ 4.5:1 (WCAG 1.4.3)
 *      — ember end was 2.24:1 (dark) / 2.91:1 (light)
 *   4. landing metric-badge composite: accent-foreground (full opacity)
 *      over its own 10% tint over card ≥ 4.5:1 — was 4.28:1 at /90 text
 *
 * Plus a manifest pin: no `orientation` lock (WCAG 1.3.4) and a behavioral
 * pin that the landing badge keeps the full-opacity class (a `/90` re-add
 * re-breaks 1.4.3 while every token pair still passes — the trap the math
 * cannot see).
 */
import { readFileSync } from "node:fs"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import manifest from "@/app/manifest"
import { LandingTestimonials } from "@/components/landing/LandingIslands"
import { apiFetch } from "@/lib/csrf-client"

vi.mock("@/lib/csrf-client", () => ({
  apiFetch: vi.fn(),
}))

// ── the same oklch→sRGB→WCAG math as scripts/check_contrast.mjs ──
function oklchToSrgb(L: number, C: number, hDeg: number): number[] {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const Ll = Math.pow(l_, 3), M = Math.pow(m_, 3), S = Math.pow(s_, 3)
  const r = 4.0767416621 * Ll - 3.3077115913 * M + 0.2309699292 * S
  const g = -1.2684380046 * Ll + 2.6097574011 * M - 0.3413193965 * S
  const bl = -0.0041960863 * Ll - 0.7034186147 * M + 1.707614701 * S
  const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
  return [r, g, bl].map((c) => Math.min(1, Math.max(0, gamma(c))))
}
function luminance([r, g, b]: number[]): number {
  const lin = [r, g, b].map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
}
function contrast(fg: number[], bg: number[]): number {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}
const over = (fg: number[], alpha: number, bg: number[]) => fg.map((c, i) => c * alpha + bg[i]! * (1 - alpha))
const hexToRgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i!, 3 + i!), 16) / 255)

type Tok = { rgb: number[] }
// vitest is always run from fb_dashboard/frontend (package.json root) — same
// cwd contract as scripts/check_contrast.mjs.
const css = readFileSync("src/app/globals.css", "utf8")
function parseBlock(selector: string): Record<string, Tok> {
  const start = css.indexOf(selector + " {")
  if (start === -1) throw new Error("selector not found: " + selector)
  const body = css.slice(start, css.indexOf("\n}", start))
  const tokens: Record<string, Tok> = {}
  for (const m of body.matchAll(/--([\w-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/g)) {
    tokens[m[1]!] = { rgb: oklchToSrgb(+m[2]!, +m[3]!, +m[4]!) }
  }
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[m[1]!] = { rgb: hexToRgb(m[2]!) }
  }
  return tokens
}
const dark = parseBlock(":root")
// CSS cascade: .light re-defines only some tokens; the rest inherit :root.
const light = { ...dark, ...parseBlock(".light") } as Record<string, Tok>

const min = (a: number, b: number) => Math.min(a, b)

describe("v24-C6 — globals.css contrast tokens (B4 failing pairs, pinned)", () => {
  it("light --input border ≥ 3:1 vs card AND background (WCAG 1.4.11; was 1.53/1.47)", () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const input = light["input"]!.rgb
    const vsCard = contrast(input, light["card"]!.rgb)
    const vsBg = contrast(input, light["background"]!.rgb)
    expect(vsCard).toBeGreaterThanOrEqual(3)
    expect(vsBg).toBeGreaterThanOrEqual(3)
    expect(min(vsCard, vsBg)).toBeGreaterThan(3.2) // regression headroom
  })

  it("dark --input border stays ≥ 3:1 vs card AND background (v10-I3 held)", () => {
    const input = dark["input"]!.rgb
    expect(contrast(input, dark["card"]!.rgb)).toBeGreaterThanOrEqual(3)
    expect(contrast(input, dark["background"]!.rgb)).toBeGreaterThanOrEqual(3)
  })

  it("espresso text ≥ 4.5:1 on BOTH flame-gradient ends, both themes (WCAG 1.4.3; ember was 2.24/2.91)", () => {
    for (const [mode, toks] of [["dark", dark], ["light", light]] as const) {
      const espresso = toks["c-espresso"]!.rgb
      const vsEmber = contrast(espresso, toks["c-ember"]!.rgb)
      const vsSaffron = contrast(espresso, toks["c-saffron"]!.rgb)
      // mid-stops are monotonic in luminance between the two ends → both
      // ends passing covers every glyph position on the gradient.
      expect(vsEmber).toBeGreaterThanOrEqual(4.5)
      expect(vsSaffron).toBeGreaterThanOrEqual(4.5)
      expect(min(vsEmber, vsSaffron)).toBeGreaterThan(4.7) // regression headroom
    }
  })

  it("landing badge composite ≥ 4.5:1 both themes (accent-foreground over its /10 tint over card; was 4.28 dark)", () => {
    for (const [mode, toks] of [["dark", dark], ["light", light]] as const) {
      const accFg = toks["accent-foreground"]!.rgb
      const badgeBg = over(accFg, 0.1, toks["card"]!.rgb)
      expect(contrast(accFg, badgeBg)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe("v24-C6 — PWA manifest orientation (WCAG 1.3.4)", () => {
  it("has no orientation lock (portrait lock removed)", () => {
    expect(manifest().orientation).toBeUndefined()
  })
})

describe("v24-C6 — LandingIslands metric badge renders full-opacity text", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue({
      json: async () => ({ success: true, data: [{ id: 1, metric: "٣× المبيعات", text: "رأي", name: "عميل", role: "مالك" }] }),
    } as unknown as Response)
  })

  it("badge class is text-accent-foreground (not /90 — the composite that measured 4.28:1 dark)", async () => {
    render(<LandingTestimonials />)
    const badge = await screen.findByText("٣× المبيعات")
    expect(badge.className).toContain("text-accent-foreground")
    expect(badge.className).not.toMatch(/text-accent-foreground\/\d+/)
  })
})
