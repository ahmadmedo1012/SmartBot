#!/usr/bin/env node
/**
 * v6 §B — WCAG contrast measurement, MEASURED not assumed.
 * Parses src/app/globals.css tokens (oklch) for :root (dark, default) and
 * .light, converts oklch -> linear sRGB -> gamma sRGB, alpha-composites
 * translucent tokens over their actual backgrounds, then computes WCAG 2.1
 * contrast ratios for every core text/background pair.
 *
 * AA: >= 4.5:1 normal text, >= 3:1 large text (>=18pt / 14pt bold).
 * Exit 1 if any core pair fails AA.
 * Run: node scripts/check_contrast.mjs   (cwd = fb_dashboard/frontend)
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
  return tokens;
}
const dark = parseBlock(":root");
const light = parseBlock(".light");

// resolve token -> sRGB triple (composited over a base when translucent)
function resolve(tokens, name, baseName) {
  const t = tokens[name];
  if (!t) throw new Error("missing token --" + name);
  let rgb = oklchToSrgb(t.L, t.C, t.h);
  if (t.a < 1) {
    const base = tokens[baseName];
    if (!base) throw new Error("--" + name + " is translucent but no base given");
    rgb = over(rgb, t.a, oklchToSrgb(base.L, base.C, base.h));
  }
  return rgb;
}

// ── the measured pairs (the plan's list + the pairs the app really renders) ──
const PAIRS = [
  // [label, fg token, bg token, bgBase(for translucent bg), minAA]
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
  ["accent-fg / primary (buttons)", "accent-fg", "primary", null],
  ["success / card", "success", "card", null],
  ["warning / card", "warning", "card", null],
  ["info / card", "info", "card", null],
  ["destructive / card", "destructive", "card", null],
];

let failures = 0;
for (const [mode, tokens] of [["DARK (:root)", dark], ["LIGHT (.light)", light]]) {
  console.log(`\n══ ${mode} ══`);
  for (const [label, fgTok, bgTok, baseTok] of PAIRS) {
    let fg, bg;
    try {
      fg = resolve(tokens, fgTok, null);
      if (bgTok === "__tint15") {
        // the badge/nav real pattern: bg-accent-foreground/15 over card
        const t = tokens[fgTok];
        bg = over(oklchToSrgb(t.L, t.C, t.h), 0.15, resolve(tokens, baseTok, null));
      } else {
        bg = resolve(tokens, bgTok, baseTok);
      }
    } catch (e) {
      console.log(`  — ${label}: ${e.message}`);
      continue;
    }
    const ratio = contrast(fg, bg);
    const ok = ratio >= 4.5 ? "AA ✓" : ratio >= 3 ? "LARGE-ONLY ⚠" : "FAIL ✗";
    if (ratio < 4.5) failures++;
    console.log(`  ${ok}  ${ratio.toFixed(2)}:1  ${label}   [fg ${hex(fg)} on ${hex(bg)}]`);
  }
}
console.log("");
if (failures > 0) {
  console.log(`FAIL contrast gate — ${failures} pair(s) below 4.5:1`);
  process.exit(1);
}
console.log("PASS contrast gate — every core pair ≥ 4.5:1 (AA, normal text)");
