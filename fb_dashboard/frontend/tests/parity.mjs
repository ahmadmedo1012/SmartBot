#!/usr/bin/env node
/**
 * test(r125): Madarek parity snapshot — pin the canonical design tokens.
 * (Task 11-a completion by orchestrator; SSOT: madarek/frontend/src/styles/tokens.css
 * + /home/z/my-project/download/madarek-reference-digest.md — §1 dark · §2 light.)
 *
 * Run: `node tests/parity.mjs` from fb_dashboard/frontend (dependency-free;
 * exit 1 on any drift — CI-able). smart-bot's vocabulary maps 1:1 to the
 * Madarek family names (--c-*-bg/ink/deep) with a shadcn-style bridge
 * (--background/--foreground/--primary) per audit 7-d.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

function topLevelBlock(source, prelude) {
  let i = 0;
  while (i < source.length) {
    const open = source.indexOf('{', i);
    if (open === -1) break;
    let depth = 1, j = open + 1;
    while (j < source.length && depth > 0) {
      if (source[j] === '{') depth += 1;
      else if (source[j] === '}') depth -= 1;
      j += 1;
    }
    if (source.slice(i, open).trim() === prelude) return source.slice(open + 1, j - 1);
    i = j;
  }
  throw new Error(`top-level block not found: ${prelude}`);
}

const dark = topLevelBlock(css, ':root');
const light = topLevelBlock(css, '.light');

function resolve(scope, name, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const m = scope.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  if (!m) return null;
  const v = m[1].trim();
  const vm = v.match(/^var\(--([^)]+)\)$/);
  return vm ? resolve(scope, vm[1], seen) : v;
}
const norm = (v) => v?.toLowerCase().replace(/\s+/g, '').replace(/,/g, ',');

let pass = 0; const fails = [];
function pin(scope, label, name, expected) {
  const got = resolve(scope, name);
  if (got && norm(got) === norm(expected)) pass += 1;
  else fails.push(`${label} --${name}: expected ${expected}, got ${got ?? '<missing>'}`);
}

// ── §1 DARK (night) ──────────────────────────────────────────────────────────
pin(dark, 'dark', 'background', '#070B16');
pin(dark, 'dark', 'foreground', '#F2EFE6');
pin(dark, 'dark', 'primary', '#E9B44C');
pin(dark, 'dark', 'primary-foreground', '#05070F');
// 9 pastel families (§1.4)
const famDark = {
  peach: ['#2C1A16', '#F2A07F', '#FCD9C4'], mint: ['#0F241C', '#7FD39A', '#C9EAD3'],
  lavender: ['#221B3A', '#B7A0F4', '#DCD2F9'], sky: ['#14213A', '#8FBBF2', '#C9DCEE'],
  yellow: ['#2C2410', '#ECC97D', '#F8E5B5'], rose: ['#2C1620', '#F0938F', '#FACDD2'],
  sand: ['#241F14', '#D9C18C', '#EFE2C5'], grey: ['#161D33', '#A9B0C8', '#D5DAE8'],
  copper: ['#2C2312', '#E9B44C', '#F5D48A'],
};
for (const [fam, [bg, ink, deep]] of Object.entries(famDark)) {
  pin(dark, 'dark', `c-${fam}-bg`, bg);
  pin(dark, 'dark', `c-${fam}-ink`, ink);
  pin(dark, 'dark', `c-${fam}-deep`, deep);
}
// motion ladder (§4)
for (const [n, v] of [['t-micro', '80ms'], ['t-fast', '160ms'], ['t-base', '240ms'], ['t-slow', '380ms'], ['t-slower', '520ms'], ['t-cinema', '720ms']]) {
  pin(dark, 'dark', n, v);
}
// easing curves (§4) — v26-F4: --ease-spring is the canonical pop overshoot
// 1.36 (NOT the 1.56 bounce tier — that lives on --ease-spring-bounce);
// previously unpinned, which let the bounce fork survive r125's parity wave.
for (const [n, v] of [
  ['ease', 'cubic-bezier(0.4, 0, 0.2, 1)'],
  ['ease-out', 'cubic-bezier(0.16, 1, 0.3, 1)'],
  ['ease-in', 'cubic-bezier(0.7, 0, 0.84, 0)'],
  ['ease-soft', 'cubic-bezier(0.22, 1, 0.36, 1)'],
  ['ease-spring-soft', 'cubic-bezier(0.34, 1.18, 0.64, 1)'],
  ['ease-spring', 'cubic-bezier(0.34, 1.36, 0.64, 1)'],
  ['ease-spring-bounce', 'cubic-bezier(0.34, 1.56, 0.64, 1)'],
]) {
  // easings are theme-independent :root tokens (like the motion ladder —
  // .light does not redefine them); pin the :root scope only.
  pin(dark, 'dark', n, v);
}
// radius ladder (§1.2) — smart-bot carries it in the Tailwind @theme block
const themeBlock = topLevelBlock(css, '@theme');
for (const [n, v] of [['radius-xs', '6px'], ['radius-sm', '8px'], ['radius-md', '10px'], ['radius-lg', '12px'], ['radius-xl', '16px'], ['radius-2xl', '20px'], ['radius-3xl', '28px']]) {
  pin(themeBlock, 'theme', n, v);
}

// ── §2 LIGHT (paper) ─────────────────────────────────────────────────────────
pin(light, 'light', 'background', '#FBFAF9');
pin(light, 'light', 'foreground', '#191918');
pin(light, 'light', 'primary', '#B57438');
pin(light, 'light', 'primary-foreground', '#1A0F06');
const famLight = {
  peach: ['#FFE9DC', '#E07856', '#6B2D1A'], mint: ['#DCF1E2', '#4FA66D', '#1F4F30'],
  lavender: ['#ECE6FA', '#8A6FE0', '#3F2D7A'], sky: ['#DDEBF7', '#5C8FCE', '#1F3D63'],
  yellow: ['#FCF1CD', '#D6A330', '#6B4C0B'], rose: ['#FCE0E2', '#DD6E78', '#6B2128'],
  sand: ['#F1ECDF', '#B59868', '#5A4623'], grey: ['#EFECE7', '#6B665E', '#2D2A24'],
  copper: ['#F4E4D2', '#B57438', '#5C3416'],
};
for (const [fam, [bg, ink, deep]] of Object.entries(famLight)) {
  pin(light, 'light', `c-${fam}-bg`, bg);
  pin(light, 'light', `c-${fam}-ink`, ink);
  pin(light, 'light', `c-${fam}-deep`, deep);
}

console.log(fails.length === 0
  ? `✓ Madarek parity snapshot: ${pass} assertions passed (src/app/globals.css == canonical tokens.css values)`
  : `✗ Madarek parity DRIFT: ${fails.length} failure(s) of ${pass + fails.length}:\n  - ` + fails.join('\n  - '));
process.exit(fails.length === 0 ? 0 : 1);
