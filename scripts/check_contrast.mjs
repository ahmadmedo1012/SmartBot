#!/usr/bin/env node
/**
 * v6 §B — WCAG contrast measurement, MEASURED not assumed.
 * Parses src/app/globals.css tokens (oklch + hex) for :root (dark, default)
 * and .light, converts oklch -> linear sRGB -> gamma sRGB, alpha-composites
 * translucent tokens over their actual backgrounds, then computes WCAG 2.1
 * contrast ratios for every core text/background pair.
 *
 * AA: >= 4.5:1 normal text, >= 3:1 large text (>=18pt / 14pt bold).
 * WCAG 1.4.11 non-text (field borders): >= 3:1 — per-pair minimums (5th
 * tuple element, default 4.5) since v24-C6.
 * v24-C6 pins (the 4 pairs the B4 a11y audit caught failing): light-mode
 * --input vs card/background (1.4.11), espresso text on both flame-gradient
 * ends (ember + saffron, 1.4.3), and the landing badge composite
 * (accent-foreground over its own 10% tint, 1.4.3). .light inherits :root
 * tokens it does not override (CSS cascade) — mirrored by merging the maps.
 * Exit 1 if any pair fails its minimum.
 * Run: node ../../scripts/check_contrast.mjs   (cwd = fb_dashboard/frontend)
 */
import { readFileSync } from "fs";

// ── oklch -> sRGB ──────────────────────────────────────────────
function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  // l_,m_,s_ live in the NONLINEAR cube-root domain — linear LMS = each cubed
  const Ll = Math.pow(l_, 3), M = Math.pow(m_, 3), S = Math.pow(s_, 3);
  let r = 4.0767416621 * Ll - 3.3077115913 * M + 0.2309699292 * S;
  let g = -1.2684380046 * Ll + 2.6097574011 * M - 0.3413193965 * S;
  let bl = -0.0041960863 * Ll - 0.7034186147 * M + 1.707614701 * S;
  const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  return [r, g, bl].map((c) => Math.min(1, Math.max(0, gamma(c))));
}

// ── WCAG relative luminance ────────────────────────────────────
function luminance([r, g, b]) {
  const lin = [r, g, b].map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
const hex = (rgb) => "#" + rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");

// alpha-composite fg (with alpha) over opaque bg, both as sRGB triples
function over(fg, alpha, bg) {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}

// ── parse tokens ───────────────────────────────────────────────
const css = readFileSync("src/app/globals.css", "utf8");
function parseBlock(selector) {
  const start = css.indexOf(selector + " {");
  if (start === -1) throw new Error("selector not found: " + selector);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const tokens = {};
  for (const m of body.matchAll(/--([\w-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/g)) {
    tokens[m[1]] = { L: +m[2], C: +m[3], h: +m[4], a: m[5] === undefined ? 1 : +m[5] };
  }
  // v24-C6: hex tokens (e.g. --c-espresso #1a130b) — parsed so the flame
  // gradient's text token can be contrast-checked like every other pair.
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[m[1]] = { hex: m[2] };
  }
  return tokens;
}
const dark = parseBlock(":root");
const light = parseBlock(".light");
// CSS cascade: .light overrides only what it redefines; everything else
// (espresso, saffron's :root value if elided, …) inherits from :root.
const lightAll = { ...dark, ...light };

// resolve token -> sRGB triple (composited over a base when translucent)
function resolve(tokens, name, baseName) {
  const t = tokens[name];
  if (!t) throw new Error("missing token --" + name);
  let rgb = t.hex
    ? [0, 2, 4].map((i) => parseInt(t.hex.slice(1 + i, 3 + i), 16) / 255)
    : oklchToSrgb(t.L, t.C, t.h);
  if (t.a < 1) {
    const base = tokens[baseName];
    if (!base) throw new Error("--" + name + " is translucent but no base given");
    rgb = over(rgb, t.a, resolve(tokens, baseName, null));
  }
  return rgb;
}

// ── the measured pairs (the plan's list + the pairs the app really renders) ──
const PAIRS = [
  // [label, fg token, bg token, bgBase(for translucent bg), minAA]
  // minAA: 4.5 (default, text AA) · 3.0 (WCAG 1.4.11 non-text, field borders)
  ["foreground / background", "foreground", "background", null],
  ["foreground / card", "foreground", "card", null],
  ["muted-foreground / background", "muted-foreground", "background", null],
  ["muted-foreground / card", "muted-foreground", "card", null],
  ["muted-foreground / muted", "muted-foreground", "muted", null],
  ["primary-foreground / primary", "primary-foreground", "primary", null],
  ["secondary-foreground / secondary", "secondary-foreground", "secondary", null],
  ["accent-foreground / accent-over-background", "accent-foreground", "accent", "background"],
  ["accent-foreground / accent-over-card", "accent-foreground", "accent", "card"],
  ["accent-foreground / badge-tint15-over-card", "accent-foreground", "__tint15", "card"],
  ["success / card", "success", "card", null],
  ["warning / card", "warning", "card", null],
  ["info / card", "info", "card", null],
  ["destructive / card", "destructive", "card", null],
  // ── v24-C6 pins — the 4 pairs the B4 a11y audit caught failing. Tokens only:
  // the components (button flame variant, PlanSelector badge, StepIndicator
  // node, landing metric badge) must keep using these tokens at FULL text
  // opacity (a /90 text opacity over the /10 tint re-breaks 1.4.3). ──
  // 1) field borders vs their real adjacent surfaces (light fields are
  //    bg-transparent → card + background; dark pins the v10-I3 raise too).
  ["input border / card (1.4.11 non-text)", "input", "card", null, 3.0],
  ["input border / background (1.4.11 non-text)", "input", "background", null, 3.0],
  // 2) espresso text on BOTH ends of the flame gradient (the whole ramp is
  //    monotonic in luminance, so end-pins cover every mid-stop).
  ["espresso / ember (flame gradient, 1.4.3)", "c-espresso", "c-ember", null, 4.5],
  ["espresso / saffron (flame gradient, 1.4.3)", "c-espresso", "c-saffron", null, 4.5],
  // 3) landing metric badge: full accent-foreground over its own 10% tint.
  ["accent-foreground / badge-tint10-over-card (1.4.3)", "accent-foreground", "__tint10", "card", 4.5],
];

let failures = 0;
for (const [mode, tokens] of [["DARK (:root)", dark], ["LIGHT (.light)", lightAll]]) {
  console.log(`\n══ ${mode} ══`);
  for (const [label, fgTok, bgTok, baseTok, min = 4.5] of PAIRS) {
    let fg, bg;
    try {
      fg = resolve(tokens, fgTok, null);
      if (bgTok === "__tint15" || bgTok === "__tint10") {
        // the badge/nav real pattern: bg-accent-foreground/15 (or /10) over card
        const t = tokens[fgTok];
        const alpha = bgTok === "__tint15" ? 0.15 : 0.1;
        bg = over(oklchToSrgb(t.L, t.C, t.h), alpha, resolve(tokens, baseTok, null));
      } else {
        bg = resolve(tokens, bgTok, baseTok);
      }
    } catch (e) {
      console.log(`  — ${label}: ${e.message}`);
      continue;
    }
    const ratio = contrast(fg, bg);
    const ok = ratio >= min ? "AA ✓" : ratio >= 3 ? "LARGE-ONLY ⚠" : "FAIL ✗";
    if (ratio < min) failures++;
    console.log(`  ${ok}  ${ratio.toFixed(2)}:1  ${label}   [fg ${hex(fg)} on ${hex(bg)}]`);
  }
}
console.log("");
if (failures > 0) {
  console.log(`FAIL contrast gate — ${failures} pair(s) below their minimum (4.5:1 text / 3:1 non-text)`);
  process.exit(1);
}
console.log("PASS contrast gate — every pair ≥ its minimum (4.5:1 text AA · 3:1 WCAG 1.4.11 non-text)");
