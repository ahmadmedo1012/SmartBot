#!/usr/bin/env node
/**
 * test(r127): Madarek parity snapshot — pin the canonical design tokens.
 * (Wave 11-a completion by orchestrator; SSOT: madarek/frontend/src/styles/tokens.css
 * — §1 dark · §2 light · §3 radius · §4 motion · §5 elevation. The old
 * download/madarek-reference-digest.md citations were retired in r126 with
 * the junk download/ dir; the tokens.css SSOT stands alone.)
 *
 * Run: `npm run test:parity` (dependency-free node script; exit 1 on any
 * drift — CI-able via Gate 3.6). smart-bot's vocabulary maps 1:1 to the
 * Madarek family names (--c-*-bg/ink/deep) with a shadcn-style bridge
 * (--background/--foreground/--primary) per audit 7-d.
 *
 * r127-F5b — WHY THIS REWRITE (audit r127-A6: "every P1/P2 Bot drift is
 * invisible to the 82-pin harness"). The harness pinned grounds/families/
 * motion/radius ONLY, so four real drifts survived green rounds:
 *   P1 light --ring #B57438 (3.65:1, fails the ≥4.5:1 focus-ring contract)
 *   P1 light status deep-collapse (--success #1F4F30 … in the BASE slots)
 *   P2 legacy z-scale 10-70 + zero pins  → canonical 0-600 ladder now pinned
 *   P2 --ease-smooth fork (0.16,1,0.2,1) → canonical settle (0.16,1,0.3,1)
 * This wave raises the pin count 82 → 180+ by mirroring Smart-Order's r126
 * harness shape (smart-order/tests/parity.mjs) and adding the coverage
 * classes it lacks (prefers-contrast port, reduced-motion token zeroing):
 *   (a) status bases + foregrounds + softs, both themes
 *   (b) elevation elev-1..5, both themes
 *   (c) focus contract (--ring + --state-focus-ring-color, both themes) +
 *       the shape-mutation ban (:focus-visible must not touch border-radius)
 *   (d) the canonical z-ladder 0/100/200/250/300/400/500/600, both scopes
 *   (e) the prefers-contrast: more port (elev→solid-ring collapse, glass
 *       solid, hairline strengthen — dark AND light blocks)
 *   (f) reduced-motion token zeroing (the --t-* and --duration-* ladders → 0ms)
 *   (g) --ease-smooth = the canonical settle curve, BOTH definition sites
 *       (:root utility value + the @theme bridge)
 * plus raw consumption gates so pinned tokens can never go dead again.
 *
 * HOW IT READS THE CSS
 * ─────────────────────
 * - Top-level blocks are brace-matched; :root (night, the default) and
 *   .light (paper) are the theme scopes. The @media (prefers-contrast) /
 *   (prefers-reduced-motion) blocks are located the same way and their
 *   nested :root/.light rules parsed for the (e)/(f) pin groups — the
 *   resting values are still asserted from the TOP LEVEL only, so a media
 *   override can never mask a pin.
 * - The light scope is the real cascade: {.light} overlays {:root}; tokens
 *   .light does not redefine (radius, motion, families, elev…) inherit :root.
 * - var() chains are resolved inside the final scope; comparisons are
 *   normalization-tolerant (whitespace, `a,b` vs `a, b`, hex case) so the
 *   pins are about VALUES, not formatting.
 */
import { readFileSync, readdirSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

// ── token file → theme scopes ────────────────────────────────────────────────

function topLevelBlocks(source) {
  const blocks = [];
  let i = 0;
  while (i < source.length) {
    const open = source.indexOf('{', i);
    if (open === -1) break;
    let depth = 1;
    let j = open + 1;
    while (j < source.length && depth > 0) {
      if (source[j] === '{') depth += 1;
      else if (source[j] === '}') depth -= 1;
      j += 1;
    }
    blocks.push({ prelude: source.slice(i, open).trim(), body: source.slice(open + 1, j - 1) });
    i = j;
  }
  return blocks;
}

const blocks = topLevelBlocks(css);
function block(prelude) {
  const b = blocks.find((x) => x.prelude === prelude);
  if (!b) throw new Error(`top-level block not found: ${prelude}`);
  return b.body;
}
function blocksNamed(prelude) {
  return blocks.filter((x) => x.prelude === prelude).map((x) => x.body);
}
// nested rule inside a media block (first match, brace-matched)
function nestedBlock(outer, prelude) {
  const re = new RegExp(`${prelude.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`);
  const m = outer.match(re);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 1;
  let j = start + 1;
  while (j < outer.length && depth > 0) {
    if (outer[j] === '{') depth += 1;
    else if (outer[j] === '}') depth -= 1;
    j += 1;
  }
  return outer.slice(start + 1, j - 1);
}
// merge every @theme / @theme inline block (document order, outermost wins)
function themeDecls() {
  const out = {};
  for (const b of blocks) {
    if (/@theme(?:\s+inline)?\s*$/.test(b.prelude)) Object.assign(out, parseDecls(b.body));
  }
  if (Object.keys(out).length === 0) throw new Error('Tailwind @theme block not found');
  return out;
}

function parseDecls(blockText) {
  const out = {};
  for (const m of blockText.matchAll(/--([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
    out[`--${m[1]}`] = m[2].trim();
  }
  return out;
}

const dark = parseDecls(block(':root'));
const theme = themeDecls();
// real cascade: .light overlays :root; everything else inherits
const light = { ...dark, ...parseDecls(block('.light')) };

function resolve(scope, value, depth = 0) {
  if (depth > 10) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*)\s*)?\)/g, (_m, name, fb) => {
    if (scope[name] !== undefined) return resolve(scope, scope[name], depth + 1);
    return fb ?? `var(${name})`;
  });
}

function norm(v) {
  return v
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/#[0-9a-f]{3,8}/gi, (h) => h.toUpperCase())
    .trim();
}

// ── assertion harness ────────────────────────────────────────────────────────

let pass = 0;
const fails = [];
function pin(scope, label, name, expected) {
  const raw = scope[name];
  if (raw === undefined) {
    fails.push(`${label} --${name}: expected ${expected}, got <missing>`);
    return;
  }
  const got = norm(resolve(scope, raw));
  if (got === norm(expected)) pass += 1;
  else fails.push(`${label} --${name}: expected ${expected}, got ${got}`);
}
function pinAll(scope, label, table) {
  for (const [name, value] of Object.entries(table)) pin(scope, label, name, value);
}

// ── §1 DARK (night) ──────────────────────────────────────────────────────────
pin(dark, 'dark', '--background', '#070B16');
pin(dark, 'dark', '--foreground', '#F2EFE6');
pin(dark, 'dark', '--primary', '#E9B44C');
pin(dark, 'dark', '--primary-foreground', '#05070F');
// 9 pastel families (§1.4)
const famDark = {
  peach: ['#2C1A16', '#F2A07F', '#FCD9C4'], mint: ['#0F241C', '#7FD39A', '#C9EAD3'],
  lavender: ['#221B3A', '#B7A0F4', '#DCD2F9'], sky: ['#14213A', '#8FBBF2', '#C9DCEE'],
  yellow: ['#2C2410', '#ECC97D', '#F8E5B5'], rose: ['#2C1620', '#F0938F', '#FACDD2'],
  sand: ['#241F14', '#D9C18C', '#EFE2C5'], grey: ['#161D33', '#A9B0C8', '#D5DAE8'],
  copper: ['#2C2312', '#E9B44C', '#F5D48A'],
};
for (const [fam, [bg, ink, deep]] of Object.entries(famDark)) {
  pin(dark, 'dark', `--c-${fam}-bg`, bg);
  pin(dark, 'dark', `--c-${fam}-ink`, ink);
  pin(dark, 'dark', `--c-${fam}-deep`, deep);
}
// motion ladder (§4) — theme-independent :root tokens; the light scope is the
// real cascade (inherits :root), so pin BOTH scopes like Smart-Order r126.
const MOTION = {
  '--t-micro': '80ms', '--t-fast': '160ms', '--t-base': '240ms',
  '--t-slow': '380ms', '--t-slower': '520ms', '--t-cinema': '720ms',
};
for (const scope of [dark, light]) pinAll(scope, 'motion', MOTION);
// easing curves (§4) — v26-F4: --ease-spring is the canonical pop overshoot
// 1.36 (NOT the 1.56 bounce tier — that lives on --ease-spring-bounce).
const EASINGS = {
  '--ease': 'cubic-bezier(0.4, 0, 0.2, 1)',
  '--ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  '--ease-in': 'cubic-bezier(0.7, 0, 0.84, 0)',
  '--ease-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
  '--ease-spring-soft': 'cubic-bezier(0.34, 1.18, 0.64, 1)',
  '--ease-spring': 'cubic-bezier(0.34, 1.36, 0.64, 1)',
  '--ease-spring-bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};
for (const scope of [dark, light]) pinAll(scope, 'easing', EASINGS);
// r127-F5b (g): --ease-smooth = the canonical settle curve at BOTH
// definition sites — :root (runtime utilities) and the @theme bridge (the
// Tailwind `ease-smooth` class). The 82-pin era let (0.16,1,0.2,1) fork
// survive here invisibly; both sites are pinned now.
pin(dark, 'ease-smooth(:root)', '--ease-smooth', 'cubic-bezier(0.16, 1, 0.3, 1)');
pin(theme, 'ease-smooth(@theme)', '--ease-smooth', 'cubic-bezier(0.16, 1, 0.3, 1)');
// radius ladder (§1.2) — smart-bot carries it in the Tailwind @theme block
const RADIUS = {
  '--radius-xs': '6px', '--radius-sm': '8px', '--radius-md': '10px', '--radius-lg': '12px',
  '--radius-xl': '16px', '--radius-2xl': '20px', '--radius-3xl': '28px',
};
pinAll(theme, 'theme', RADIUS);

// ── §2 LIGHT (paper) ─────────────────────────────────────────────────────────
pin(light, 'light', '--background', '#FBFAF9');
pin(light, 'light', '--foreground', '#191918');
pin(light, 'light', '--primary', '#B57438');
pin(light, 'light', '--primary-foreground', '#1A0F06');
const famLight = {
  peach: ['#FFE9DC', '#E07856', '#6B2D1A'], mint: ['#DCF1E2', '#4FA66D', '#1F4F30'],
  lavender: ['#ECE6FA', '#8A6FE0', '#3F2D7A'], sky: ['#DDEBF7', '#5C8FCE', '#1F3D63'],
  yellow: ['#FCF1CD', '#D6A330', '#6B4C0B'], rose: ['#FCE0E2', '#DD6E78', '#6B2128'],
  sand: ['#F1ECDF', '#B59868', '#5A4623'], grey: ['#EFECE7', '#6B665E', '#2D2A24'],
  copper: ['#F4E4D2', '#B57438', '#5C3416'],
};
for (const [fam, [bg, ink, deep]] of Object.entries(famLight)) {
  pin(light, 'light', `--c-${fam}-bg`, bg);
  pin(light, 'light', `--c-${fam}-ink`, ink);
  pin(light, 'light', `--c-${fam}-deep`, deep);
}

// ── r127-F5b (a): status bases + foregrounds + soft grounds, both themes ────
// Canonical (madarek tokens.css §1.6 + §2): dark bases = the luminous family
// inks with the void/dark fg; light bases = the vivid family inks (the fleet
// standard — NOT the text-safe deeps, which keep their roles on --c-*-deep),
// with Madarek --danger-fg #191918 as the fill foreground. This is the pin
// set that would have caught the light deep-collapse drift.
const STATUS_DARK = {
  '--success': '#7FD39A', '--success-foreground': '#191918',
  '--success-soft': '#0F241C',
  '--warning': '#ECC97D', '--warning-soft': '#2C2410',
  '--info': '#8FBBF2', '--info-soft': '#14213A',
  '--destructive': '#F0938F', '--destructive-foreground': '#05070F',
  '--destructive-soft': '#2C1620',
};
const STATUS_LIGHT = {
  '--success': '#4FA66D', '--success-foreground': '#191918',
  '--success-soft': '#DCF1E2',
  '--warning': '#D6A330', '--warning-soft': '#FCF1CD',
  '--info': '#5C8FCE', '--info-soft': '#DDEBF7',
  '--destructive': '#DD6E78', '--destructive-foreground': '#191918',
  '--destructive-soft': '#FCE0E2',
};
pinAll(dark, 'status-dark', STATUS_DARK);
pinAll(light, 'status-light', STATUS_LIGHT);

// ── r127-F5b (b): elevation ladder, both themes (§1.9) ──────────────────────
const ELEV_DARK = {
  '--elev-1': '0 1px 2px rgba(0, 0, 0, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  '--elev-2': '0 4px 8px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  '--elev-3': '0 8px 16px rgba(0, 0, 0, 0.40), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  '--elev-4': '0 16px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
  '--elev-5': '0 32px 64px rgba(0, 0, 0, 0.50), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
};
const ELEV_LIGHT = {
  '--elev-1': '0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 1px rgba(0, 0, 0, 0.06)',
  '--elev-2': '0 4px 8px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04)',
  '--elev-3': '0 8px 16px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.05)',
  '--elev-4': '0 16px 32px rgba(0, 0, 0, 0.10), 0 8px 16px rgba(0, 0, 0, 0.06)',
  '--elev-5': '0 32px 64px rgba(0, 0, 0, 0.12), 0 16px 32px rgba(0, 0, 0, 0.08)',
};
pinAll(dark, 'elev-dark', ELEV_DARK);
pinAll(light, 'elev-light', ELEV_LIGHT);

// glass grounds (§1.8) — the base-layer transparency both themes build on
pin(dark, 'glass-dark', '--glass-bg', 'rgba(11, 16, 32, 0.78)');
pin(light, 'glass-light', '--glass-bg', 'rgba(251, 250, 249, 0.78)');

// ── r127-F5b (c): focus contract, both themes ───────────────────────────────
// The light --ring was raw copper #B57438 = 3.65:1 on cream (FAIL vs the
// ≥4.5:1 canonical ring contract); canonical = copper-deep #5C3416 (10.29:1)
// in light.
const FOCUS_DARK = {
  // r130 (W1-H FLEET-1, true-parity option): dark --ring = the canonical
  // cascade #E9B44C — madarek's dark --state-focus-ring-color resolves
  // through var(--accent) = the SOLID gold (tokens.css:543). The r129
  // "#C9962F strong gold" fork painted night focus outlines one shade
  // darker than madarek's own UI; both tokens now chain to --accent-solid.
  '--ring': '#E9B44C',
  '--state-focus-ring-color': '#E9B44C',
};
const FOCUS_LIGHT = {
  '--ring': '#5C3416',
  '--state-focus-ring-color': '#5C3416',
};
pinAll(dark, 'focus-dark', FOCUS_DARK);
pinAll(light, 'focus-light', FOCUS_LIGHT);

// ── r127-F5b (d): z-order ladder (Madarek tokens.css §3a), both scopes ──────
// SmartBot shipped the legacy 10-70 band registry until this wave; the
// canonical rungs are pinned in BOTH cascade scopes (theme-independent :root).
const Z_LADDER = {
  '--z-base': '0',
  '--z-dropdown': '100',
  '--z-popover': '200',
  '--z-tooltip': '250',
  '--z-sheet': '300',
  '--z-modal': '400',
  '--z-toast': '500',
  '--z-lightbox': '600',
};
for (const scope of [dark, light]) pinAll(scope, 'z-ladder', Z_LADDER);

// ── r127-F5b (e): prefers-contrast: more port (tokens.css L964-1005) ────────
// OS increased-contrast users get solid elevation rings instead of soft
// shadows, glass goes solid, hairlines strengthen. Both theme blocks are
// pinned (dark :root white rings / light .light black rings).
const contrastMedia = blocks.find((x) => x.prelude === '@media (prefers-contrast: more)');
if (!contrastMedia) throw new Error('prefers-contrast block not found');
const contrastDark = { ...dark, ...parseDecls(nestedBlock(contrastMedia.body, ':root') ?? '') };
const contrastLight = { ...light, ...parseDecls(nestedBlock(contrastMedia.body, '.light') ?? '') };
pinAll(contrastDark, 'contrast-dark', {
  '--elev-1': '0 0 0 1px rgba(255, 255, 255, 0.36)',
  '--elev-2': '0 0 0 1.5px rgba(255, 255, 255, 0.44)',
  '--elev-3': '0 0 0 2px rgba(255, 255, 255, 0.52)',
  '--elev-4': '0 0 0 2.5px rgba(255, 255, 255, 0.60)',
  '--elev-5': '0 0 0 3px rgba(255, 255, 255, 0.68)',
  // glass goes solid: var(--card) resolves to the dark surface
  '--glass-bg': '#0D1428',
  '--glass-bg-strong': '#0D1428',
  '--border': 'rgba(255, 255, 255, 0.48)',
});
pinAll(contrastLight, 'contrast-light', {
  '--elev-1': '0 0 0 1px rgba(0, 0, 0, 0.32)',
  '--elev-2': '0 0 0 1.5px rgba(0, 0, 0, 0.40)',
  '--elev-3': '0 0 0 2px rgba(0, 0, 0, 0.48)',
  '--elev-4': '0 0 0 2.5px rgba(0, 0, 0, 0.56)',
  '--elev-5': '0 0 0 3px rgba(0, 0, 0, 0.64)',
  // glass goes solid: var(--card) resolves to the light surface
  '--glass-bg': '#FFFFFF',
  '--glass-bg-strong': '#FFFFFF',
  '--border': 'rgba(0, 0, 0, 0.42)',
});

// ── r127-F5b (f): reduced-motion token zeroing (tokens.css §4.5 layer 1) ────
// The --t-* ladder AND the --duration-* aliases collapse to 0ms for
// prefers-reduced-motion users (the universal 0.01ms belt is gated below).
const rmRootBody = blocksNamed('@media (prefers-reduced-motion: reduce)')
  .find((b) => b.includes('--t-micro: 0ms'));
if (!rmRootBody) throw new Error('reduced-motion :root zeroing block not found');
const rmScope = parseDecls(nestedBlock(rmRootBody, ':root') ?? '');
pinAll(rmScope, 'rm-zeroing', {
  '--t-micro': '0ms', '--t-fast': '0ms', '--t-base': '0ms',
  '--t-slow': '0ms', '--t-slower': '0ms', '--t-cinema': '0ms',
  '--duration-fast': '0ms', '--duration-base': '0ms', '--duration-slow': '0ms',
});

// ── r127-F5b: raw consumption gates — existence pins cannot catch dead ──────
// tokens or regressions the value pins cannot see (shape bans, wiring).
const rawCss = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
  .replace(/\s+/g, ' ');
const rawDialog = readFileSync(new URL('../src/components/ui/dialog.tsx', import.meta.url), 'utf8');
const rawButton = readFileSync(new URL('../src/components/ui/button.tsx', import.meta.url), 'utf8');
const rawNav = readFileSync(new URL('../src/components/layout/MobileBottomNav.tsx', import.meta.url), 'utf8');
const rawLayout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');
const rawFab = readFileSync(new URL('../src/components/shared/FloatingWhatsApp.tsx', import.meta.url), 'utf8');
const rawFabTest = readFileSync(new URL('../src/components/shared/FloatingWhatsApp.test.tsx', import.meta.url), 'utf8');
const focusRule = block(':focus-visible');
function occurrences(text, needle) {
  return text.split(needle).length - 1;
}
const GATES = [
  ['focus shape-mutation ban: :focus-visible never touches border-radius (A6 P3)',
    !focusRule.includes('border-radius')],
  ['focus geometry: :focus-visible = 2px outline on --state-focus-ring-color + 2px offset',
    focusRule.includes('outline: 2px solid var(--state-focus-ring-color)') &&
    focusRule.includes('outline-offset: 2px')],
  ['sonner toaster pinned to the --z-toast rung (fleet CSS recipe)',
    rawCss.includes('[data-sonner-toaster]') && rawCss.includes('z-index: var(--z-toast) !important')],
  ['dialog rides the modal rung on BOTH backdrop and surface (z-(--z-modal) ×2)',
    occurrences(rawDialog, 'z-(--z-modal)') >= 2],
  ['mobile bottom-nav sheet rides --z-sheet on backdrop AND panel (z-(--z-sheet) ×2)',
    occurrences(rawNav, 'z-(--z-sheet)') >= 2],
  ['mobile bottom-nav bar rides the chrome rung z-(--z-dropdown)',
    rawNav.includes('z-(--z-dropdown)')],
  ['skip link reveals on the toast rung z-(--z-toast) (fleet a11y recipe)',
    rawLayout.includes('focus:z-(--z-toast)')],
  ['WhatsApp FAB rides the toast rung z-(--z-toast) (component + contract test)',
    rawFab.includes('z-(--z-toast)') && rawFabTest.includes('z-(--z-toast)') &&
    !rawFab.includes('z-[60]')],
  ['reduced-motion universal belt (0.01ms !important) present',
    /animation-duration:\s*0\.01ms !important/.test(rawCss) &&
    /transition-duration:\s*0\.01ms !important/.test(rawCss)],
  ['prefers-contrast flattens the painted night sky (mdrk-night-sky → var(--background))',
    contrastMedia.body.includes('mdrk-night-sky') &&
    contrastMedia.body.includes('background: var(--background)') &&
    contrastMedia.body.includes('content: none')],
  ['ease-smooth utility has real consumers (button + dialog)',
    rawButton.includes('ease-smooth') && rawDialog.includes('ease-smooth')],
  /* ── r131-F7 gates — skeleton RM kill + spinner register + toast canon ── */
  ['r131 skeleton: .skeleton binds the semantic token (was raw 1.2s)',
    /\.skeleton\s*\{[^}]*animation:\s*shimmer var\(--motion-duration-skeleton, 1200ms\) linear infinite/.test(rawCss)],
  ['r131 skeleton: the RM token block zeroes --motion-duration-skeleton',
    /--motion-duration-skeleton:\s*0ms/.test(rawCss)],
  ['r131 spinner: .animate-spin rides var(--motion-duration-stat) (700ms register)',
    /\.animate-spin\s*\{[^}]*animation-duration:\s*var\(--motion-duration-stat, 700ms\)\s*;/.test(rawCss)],
  ['r131 toast: slide-up entrance = the canonical 12px slide+fade',
    /@keyframes slide-up\s*\{[^}]*translateY\(12px\)/.test(rawCss)],
  ['r131 hygiene: html/body overflow-x clip (no 100vw scrollbar-overflow math)',
    rawCss.includes('overflow-x: clip') && !rawCss.includes('max-width: 100vw')],
];
for (const [name, okFlag] of GATES) {
  if (okFlag) pass += 1;
  else fails.push(`consumption gate FAILED: ${name}`);
}

// ── r128-F7: landing-layer pins (src/app/landing.css, `.landing`-scoped) ────
// The Madarek-journey landing (r128-F3a foundation + F3b assembly) carries
// its own Orbit-Ink sheet scoped under `.landing` (PORT-KIT §0 R4): the
// product pins above stay untouched, this block pins the landing world —
// the §1 palette, the --ln-t-*/--ln-ease-* alias chain onto the product
// ladder (R1/R8), the marquee anatomy, the --sp scrub consumers, the
// chrome spy/grain, and scope isolation both ways. All values are the
// canonical Madarek landing.css values (madarek@cf7ffca) as ported.
const landingCss = readFileSync(new URL('../src/app/landing.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');
const landingBlocks = topLevelBlocks(landingCss);
// document-order merge of every top-level `.landing` token block
// (F3a §0 bridge + §1 sheet + F3b bridge extension)
const landingScope = {};
for (const b of landingBlocks) {
  if (b.prelude === '.landing') Object.assign(landingScope, parseDecls(b.body));
}
if (Object.keys(landingScope).length === 0) throw new Error('.landing token blocks not found in landing.css');
// the real cascade for the alias pins: product :root tokens + landing overlay
const landingCascade = { ...dark, ...landingScope };
// raw-declaration reader (parseDecls only sees --* props; consumers like
// stroke-dashoffset/gap are ordinary declarations and are pinned verbatim —
// var() fallbacks must NOT be resolved here, the expression IS the contract)
function declOf(body, prop) {
  const m = body.match(new RegExp(`(?:^|[;{\\s])${prop}(?![\\w-])\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : undefined;
}
function pinDecl(label, prelude, prop, expected) {
  const b = landingBlocks.find((x) => x.prelude === prelude);
  if (!b) { fails.push(`${label}: rule ${prelude} not found`); return; }
  const raw = declOf(b.body, prop);
  if (raw === undefined) { fails.push(`${label} ${prop}: expected ${expected}, got <missing>`); return; }
  if (norm(raw) === norm(expected)) pass += 1;
  else fails.push(`${label} ${prop}: expected ${expected}, got ${raw}`);
}

// (a) §1 Orbit-Ink palette — flat grounds, cream/lime/violet pairings,
//     hairlines, grain opacity, pill radius (resolves via --r-full bridge)
//     and the h1 clamp. All canonical tokens.css:377-427 values.
pinAll(landingCascade, 'landing', {
  '--ln-ink': '#252A3E',
  '--ln-ink-2': '#1C2032',
  '--ln-cream': '#F5F3E7',
  '--ln-cream-dim': '#C9C6B4',
  '--ln-lime': '#DFEDB2',
  '--ln-lime-deep': '#B9D778',
  '--ln-violet': '#7A6BF2',
  '--ln-violet-deep': '#4E2FB8',
  '--ln-line': 'rgba(245, 243, 231, 0.14)',
  '--ln-line-soft': 'rgba(245, 243, 231, 0.07)',
  // r129 (P3-22, canonical landing.css:58 local override): 0.075 — the
  // r128 pin locked the tokens.css base 0.05, missing the landing's own
  // lift. Repinned + negative-tested below.
  '--ln-grain-op': '0.075',
  '--ln-radius-pill': '9999px',
  '--ln-h1': 'clamp(2.75rem, 8.2vw, 6.75rem)',
});

// (b) alias chain — the landing NEVER forks the ladder: --ln-t-*/--ln-ease-*
//     resolve onto the product tokens (160/240/380/720ms + canonical curves
//     + 360ms reveal bridge) and the marquee duration stays 42s.
pinAll(landingCascade, 'landing-alias', {
  '--ln-t-fast': '160ms',
  '--ln-t-base': '240ms',
  '--ln-t-slow': '380ms',
  '--ln-t-cinema': '720ms',
  '--ln-t-reveal': '360ms',
  '--ln-ease': 'cubic-bezier(0.4, 0, 0.2, 1)',
  '--ln-ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  '--ln-ease-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
  '--ln-ease-spring': 'cubic-bezier(0.34, 1.36, 0.64, 1)',
  '--ln-ease-linear': 'linear',
  '--ln-dur-marquee': '42s',
});

// (c) marquee anatomy — the seamless RTL loop: unprefixed keyframes, the
//     +24px seam correction (HALF the 48px track gap), and the RM off-switch
//     (token zeroing cannot stop a raw-duration loop — animation: none).
const marqueeKf = landingBlocks.find((x) => x.prelude === '@keyframes ln-marquee');
if (!marqueeKf) throw new Error('@keyframes ln-marquee not found');
// keyframe steps are nested rules — extract from/to bodies, then read transform
const kfFromT = declOf(nestedBlock(marqueeKf.body, 'from') ?? '', 'transform');
const kfToT = declOf(nestedBlock(marqueeKf.body, 'to') ?? '', 'transform');
if (kfFromT !== undefined && norm(kfFromT) === 'translateX(0)') pass += 1;
else fails.push(`marquee keyframe from: expected transform translateX(0), got ${kfFromT ?? '<missing>'}`);
if (kfToT !== undefined && norm(kfToT) === 'translateX(calc(50% + 24px))') pass += 1;
else fails.push(`marquee keyframe to: expected translateX(calc(50% + 24px)) (the +24px seam = half the 48px gap), got ${kfToT ?? '<missing>'}`);
pinDecl('marquee', '.landing .ln-marquee-track', 'gap', '48px');
const marqueeRmOff = landingBlocks
  .filter((x) => x.prelude === '@media (prefers-reduced-motion: reduce)')
  .some((m) => {
    const rule = nestedBlock(m.body, '.landing .ln-marquee-track');
    return rule !== null && /animation\s*:\s*none/.test(rule);
  });
if (marqueeRmOff) pass += 1;
else fails.push('marquee RM off-switch: @media (prefers-reduced-motion) .landing .ln-marquee-track { animation: none } not found');

// (d) --sp scrub consumers — the imperative section-progress variable
//     drives the journey light path, the progress ring system and the
//     chapter veil (raw expressions: the fallbacks are part of the contract)
pinDecl('sp-consumer', '.landing .ln-journey-path-light', 'stroke-dashoffset', 'calc(1 - var(--sp, 0))');
pinDecl('sp-consumer', '.landing .ln-progress-orbits', 'transform', 'scale(calc(0.86 + var(--sp, 0.65) * 0.3))');
pinDecl('sp-consumer', '.landing .ln-chapter::before', 'opacity', 'calc(var(--sp, 0) * 0.5)');

// (e) scroll-spy selectors — all six section ids keep their R2-form active
//     rules (header[data-active-section=X] .landing-nav-link[href="#X"] —
//     the attribute-selector form; naive text dumps render it deceptively
//     as ".landing-nav-link ref=")
const SPY_SECTIONS = ['trust', 'features', 'journey', 'progress', 'plate', 'roles'];
const spyMissing = SPY_SECTIONS.filter(
  (s) => !landingCss.includes(`header[data-active-section="${s}"] .landing-nav-link[href="#${s}"]`),
);
if (spyMissing.length === 0) pass += 1;
else fails.push(`scroll-spy: missing active rules for ${spyMissing.join(', ')}`);

// (f) .ln-grain veil — fixed, inert, 7.5% opacity (resolved, P3-22),
//     Madarek's z-2000 rung (below native dialogs, above the whole landing)
pinDecl('grain', '.landing .ln-grain', 'z-index', '2000');
pinDecl('grain', '.landing .ln-grain', 'pointer-events', 'none');
{
  const grainBlock = landingBlocks.find((x) => x.prelude === '.landing .ln-grain');
  const grainOp = grainBlock ? resolve(landingCascade, declOf(grainBlock.body, 'opacity') ?? '') : '';
  if (norm(grainOp) === '0.075') pass += 1;
  else fails.push(`grain opacity: expected var(--ln-grain-op) → 0.075 (canonical P3-22 lift), got ${grainOp || '<missing>'}`);
  // the veil must RIDE the token (not a literal) so the token pin governs
  const grainRidesToken = grainBlock ? declOf(grainBlock.body, 'opacity') === 'var(--ln-grain-op)' : false;
  if (grainRidesToken) pass += 1;
  else fails.push('grain opacity: expected the veil to consume var(--ln-grain-op), got a literal');
  // negative: the retired 0.05 must be gone from the sheet
  if (!/--ln-grain-op:\s*0\.05\b/.test(landingCss)) pass += 1;
  else fails.push('grain negative: the retired --ln-grain-op: 0.05 declaration is still present');
}

// (g) flat header chrome — .scrolled is solid ink-2 @92%, never glass
pinDecl('landing-header', '.landing .landing-header.scrolled', 'background', 'rgb(28 32 50 / 0.92)');

// (h) NEGATIVE — .landing scope isolation, both directions:
//     1. the landing sheet never leaks into the product scopes
//     2. every top-level selector in landing.css is .landing-scoped
//        (or an at-rule wrapping .landing rules) — no bare element/global
//        selectors that would style product surfaces
const lnLeak = Object.keys(dark).filter((k) => k.startsWith('--ln-'));
if (lnLeak.length === 0) pass += 1;
else fails.push(`scope isolation: --ln-* tokens leaked into globals.css :root: ${lnLeak.join(', ')}`);
const unscoped = landingBlocks.filter((x) => !x.prelude.startsWith('.') && !x.prelude.startsWith('@'));
if (unscoped.length === 0) pass += 1;
else fails.push(`scope isolation: unscoped top-level selectors in landing.css: ${unscoped.map((x) => x.prelude).join(' | ')}`);

// (i) NEGATIVE SELF-TEST — inject drift into a copy and prove this block's
//     machinery SEES it (guards against silent-pass parser rot: if the
//     poison substitution stops matching, or the re-parse stops resolving,
//     the harness itself must fail loudly, not stay green)
const poisonedLanding = landingCss.replace(/(--ln-ink:\s*)#252A3E/, '$1#000000');
if (poisonedLanding === landingCss) {
  fails.push('negative self-test: drift injection found no --ln-ink target (selector rot)');
} else {
  const pScope = {};
  for (const b of topLevelBlocks(poisonedLanding)) {
    if (b.prelude === '.landing') Object.assign(pScope, parseDecls(b.body));
  }
  const probe = norm(resolve({ ...dark, ...pScope }, pScope['--ln-ink'] ?? ''));
  if (probe === '#000000') pass += 1;
  else fails.push(`negative self-test: poisoned --ln-ink read as ${probe || '<missing>'}, expected #000000`);
}

// ── r129-F3 — the --accent-solid family (audit §4, the r128 open item) ──────
// SmartBot was the only Smart repo without the fleet six-token standard;
// --accent-solid is now the authoritative solid brand token and the
// scattered consumers (--primary/--primary-foreground/--ring/
// --state-focus-ring-color) chain to it. 12 pins.
pinAll(dark, 'accent-family-dark', {
  '--accent-solid': '#E9B44C',
  '--accent-hover': '#F5D48A',
  '--accent-soft': '#2C2312',
  '--accent-strong': '#C9962F',
  '--accent-ink': '#E9B44C',
  '--accent-fg': '#05070F',
});
pinAll(light, 'accent-family-light', {
  '--accent-solid': '#B57438',
  '--accent-hover': '#9A5F25',
  '--accent-soft': '#F4E4D2',
  '--accent-strong': '#5C3416',
  '--accent-ink': '#5C3416',
  '--accent-fg': '#1A0F06',
});

// ── r129-F3 — token-matrix SB fixes (canonical names, Madarek values) ───────
// The canonical --r-* radius ladder under SL/SM names (the Tailwind
// --radius-* bridge in @theme keeps serving utilities with the same values;
// --r-full was landing-scoped only before this wave).
const R_LADDER = {
  '--r-xs': '6px', '--r-sm': '8px', '--r-md': '10px', '--r-lg': '12px',
  '--r-xl': '16px', '--r-2xl': '20px', '--r-3xl': '28px', '--r-full': '9999px',
};
for (const scope of [dark, light]) pinAll(scope, 'r-ladder', R_LADDER);
// The Madarek press register + hover-lift micro-interaction values.
for (const scope of [dark, light]) {
  pin(scope, 'press-register', '--press-scale', '0.97');
  pin(scope, 'press-register', '--hover-lift', '-1px');
}
// The two canonical easing names the sheet lacked (spring-snappy was absent
// fleet-wide; bounce is Madarek's own name for the 1.56 tier).
for (const scope of [dark, light]) {
  pin(scope, 'easing-r129', '--ease-bounce', 'cubic-bezier(0.34, 1.56, 0.64, 1)');
  pin(scope, 'easing-r129', '--ease-spring-snappy', 'cubic-bezier(0.5, 1.6, 0.4, 1)');
}
// Canonical brand aliases: --gold (dark = the accent-solid gold, light = the
// yellow-ink gold #D6A330 — Madarek's own light rung), --gold-soft (the
// yellow family ground), --brand-purple (the lavender-ink chain), and
// --text-on-accent bridged to --accent-fg (the documented product semantic:
// the products' light primary is copper, so text on it is the deep fg).
pin(dark, 'brand-aliases-dark', '--gold', '#E9B44C');
pin(light, 'brand-aliases-light', '--gold', '#D6A330');
pin(dark, 'brand-aliases-dark', '--gold-soft', '#2C2410');
pin(light, 'brand-aliases-light', '--gold-soft', '#FCF1CD');
pin(dark, 'brand-aliases-dark', '--brand-purple', '#B7A0F4');
pin(light, 'brand-aliases-light', '--brand-purple', '#8A6FE0');
pin(dark, 'brand-aliases-dark', '--text-on-accent', '#05070F');
pin(light, 'brand-aliases-light', '--text-on-accent', '#1A0F06');
// The canonical neutral ramp under Madarek's own names (the five rungs the
// token matrix flagged — 150/300/400/500/800 — plus their neighbors).
const NEUTRALS_DARK = {
  '--neutral-0': '#0D1428', '--neutral-50': '#070B16', '--neutral-100': '#121A36',
  '--neutral-150': '#182142', '--neutral-200': '#1B2444', '--neutral-300': '#263052',
  '--neutral-400': '#7A83A0', '--neutral-500': '#8E97B8', '--neutral-700': '#C3C8DC',
  '--neutral-800': '#DDE1EE', '--neutral-900': '#F2EFE6',
};
const NEUTRALS_LIGHT = {
  '--neutral-0': '#FFFFFF', '--neutral-50': '#FBFAF9', '--neutral-100': '#F7F6F3',
  '--neutral-150': '#F1EFEC', '--neutral-200': '#E9E7E2', '--neutral-300': '#D9D6D0',
  '--neutral-400': '#8E8A82', '--neutral-500': '#6F6C66', '--neutral-700': '#4F4D48',
  '--neutral-800': '#322F2A', '--neutral-900': '#191918',
};
pinAll(dark, 'neutral-ramp-dark', NEUTRALS_DARK);
pinAll(light, 'neutral-ramp-light', NEUTRALS_LIGHT);

// ── r129-F3 — the P3/P4 premium-polish landing layer (audit §3 fix rows) ────

// declLast — last-declaration-wins reader: the RESOLVED value for
// same-specificity top-level rules (the P4 tail overrides the bases
// further up the sheet — canonical ships it the same way).
function declLast(prelude, prop) {
  let val;
  for (const b of landingBlocks) {
    if (b.prelude !== prelude) continue;
    const v = declOf(b.body, prop);
    if (v !== undefined) val = v;
  }
  return val;
}
function pinDeclLast(label, prelude, prop, expected) {
  const raw = declLast(prelude, prop);
  if (raw !== undefined && norm(raw) === norm(expected)) pass += 1;
  else fails.push(`${label} ${prop}: expected ${expected} (resolved), got ${raw ?? '<missing>'}`);
}

// P4-18 label halo: the lime mono label carries a faint radial halo on an
// ::before pseudo + the position:relative anchor.
{
  const halo = landingBlocks.find((x) => x.prelude === '.landing .ln-label::before');
  if (halo) {
    const bg = declOf(halo.body, 'background');
    if (bg !== undefined && norm(bg) === norm('radial-gradient(ellipse at center, var(--ln-lime) 0%, transparent 70%)')) pass += 1;
    else fails.push(`label halo: background expected the lime radial, got ${bg ?? '<missing>'}`);
    const op = declOf(halo.body, 'opacity');
    if (op === '0.12') pass += 1;
    else fails.push(`label halo: opacity expected 0.12, got ${op ?? '<missing>'}`);
    const blur = declOf(halo.body, 'filter');
    if (blur === 'blur(6px)') pass += 1;
    else fails.push(`label halo: filter expected blur(6px), got ${blur ?? '<missing>'}`);
  } else {
    fails.push('label halo: .landing .ln-label::before rule not found');
  }
  const labelAnchored = landingBlocks
    .filter((x) => x.prelude === '.landing .ln-label')
    .some((b) => declOf(b.body, 'position') === 'relative');
  if (labelAnchored) pass += 1;
  else fails.push('label halo: .ln-label { position: relative } anchor not found');
}

// P4-10 type measures — the RESOLVED measure for the hero title/sub,
// chapter lede and CTA lede (the tail overrides the bases).
pinDeclLast('measure', '.landing .ln-hero-title', 'max-inline-size', '20ch');
pinDeclLast('measure', '.landing .ln-hero-sub', 'max-inline-size', '72ch');
pinDeclLast('measure', '.landing .ln-chapter-lede', 'max-inline-size', '72ch');
pinDeclLast('measure', '.landing .ln-cta-lede', 'max-inline-size', '72ch');

// P4-01 press register — both pill types press at --press-scale (0.97) with
// the 80ms micro snap-back; the magnetic gold PRESERVES its translate.
pinDecl('press', '.landing .ln-btn-gold:active', 'transform', 'translate(var(--mag-x, 0), var(--mag-y, 0)) scale(var(--press-scale, 0.97))');
pinDecl('press', '.landing .ln-btn-gold:active', 'transition-duration', 'var(--t-micro)');
pinDecl('press', '.landing .ln-btn-ghost:active', 'transform', 'scale(var(--press-scale, 0.97))');
pinDecl('press', '.landing .ln-btn-ghost:active', 'transition-duration', 'var(--t-micro)');

// P3-28/29/30/35 card depth recipes — resting station/stat shadows, the
// role-row hover shadow, the progress-visual inset top-edge highlight.
pinDeclLast('depth', '.landing .ln-station-card', 'box-shadow', '0 1px 2px rgba(0,0,0,0.06)');
pinDeclLast('depth', '.landing .ln-stat', 'box-shadow', '0 1px 2px rgba(0,0,0,0.06)');
pinDeclLast('depth', '.landing .ln-role-row:hover', 'box-shadow', '0 1px 2px rgba(0,0,0,0.06)');
pinDeclLast('depth', '.landing .ln-progress-visual', 'box-shadow', 'inset 0 1px 0 rgba(245,243,231,0.04)');

// P1-2 universal cream focus ring on the ink stage (canonical
// landing.css:1783-1794) — the product gold --state-focus-ring-color must
// never leak into the Orbit-Ink world.
pinDecl('focus-ring', '.landing :focus-visible', 'outline', '2px solid var(--ln-cream)');
pinDecl('focus-ring', '.landing :focus-visible', 'outline-offset', '3px');
{
  const btnCreamRing = /\.landing \.ln-btn-gold:focus-visible,\s*\.landing \.ln-btn-ghost:focus-visible\s*\{[^}]*outline-color:\s*var\(--ln-cream\)/.test(landingCss);
  if (btnCreamRing) pass += 1;
  else fails.push('focus-ring: .ln-btn-gold/:focus-visible + .ln-btn-ghost:focus-visible cream outline-color rule not found');
}

// P4-13 footer link underline affordance (color alone is not enough).
pinDecl('footer-underline', '.landing .landing-footer-link:hover', 'text-decoration', 'underline');
pinDecl('footer-underline', '.landing .landing-footer-link:hover', 'text-decoration-thickness', '2px');
pinDecl('footer-underline', '.landing .landing-footer-link:hover', 'text-underline-offset', '4px');

// P4-12 scroll-invite micro-interaction.
pinDecl('scroll-hover', '.landing .ln-hero-scroll:hover .ln-hero-scroll-line', 'transform', 'scaleY(1.3)');

// P2-1 burger breakpoint = the canonical 1080 (+ the min-width:1081 guard).
{
  const burger1080 = landingCss.includes('@media (max-width: 1080px)')
    && landingCss.includes('@media (min-width: 1081px)')
    && !/@media \(max-width: 1024px\)\s*\{[^}]*landing-nav-links/.test(landingCss);
  if (burger1080) pass += 1;
  else fails.push('burger breakpoint: expected the canonical @media (max-width: 1080px) collapse + min-width:1081 guard');
}

// P2-9 landscape-phone hero fold block + the 390px trust wrap.
{
  const landscape = landingCss.includes('@media (max-height: 560px) and (orientation: landscape)');
  if (landscape) pass += 1;
  else fails.push('landscape hero block: @media (max-height: 560px) and (orientation: landscape) not found');
  const tinyTrust = /@media \(max-width: 390px\)\s*\{\s*\.landing \.ln-trust-inner\s*\{[^}]*gap:\s*var\(--sp-3\)[^}]*font-size:\s*12\.5px/.test(landingCss);
  if (tinyTrust) pass += 1;
  else fails.push('tiny-phone trust wrap: @media (max-width: 390px) .ln-trust-inner rule not found');
}

// ── r129-F3 — structural negatives (audit §5/§8) ────────────────────────────
const rawPage = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const rawLandingStage = readFileSync(new URL('../src/components/landing/LandingStage.tsx', import.meta.url), 'utf8');
const rawOrbitScene = readFileSync(new URL('../src/components/landing/OrbitScene.tsx', import.meta.url), 'utf8');
const rawFeatures = readFileSync(new URL('../src/components/landing/FeaturesSection.tsx', import.meta.url), 'utf8');

// P0: exactly ONE id="main-content" in the rendered page — the layout owns
// it; the landing wrapper must not re-render it (duplicate id + nested
// landmark = invalid HTML).
{
  const pageClean = !rawPage.includes('id="main-content"');
  const layoutCount = rawLayout.split('id="main-content"').length - 1;
  if (pageClean && layoutCount === 1) pass += 1;
  else fails.push(`main-landmark: page.tsx must not re-render id="main-content" (layout renders it exactly once; layout occurrences = ${layoutCount})`);
}
// P2-10: the dead .ln-btn-text classes stay deleted (zero consumers).
// r130 (W1-E L-6): .ln-stat-unit is BACK and CONSUMED — the ProgressSection
// uptime cell renders a dimmed unit span; the pin asserts both the rule and
// the consumer now (was a dead-class delete in r129).
{
  const deadGone = !/\.ln-btn-text\b/.test(landingCss);
  if (deadGone) pass += 1;
  else fails.push('dead classes: .ln-btn-text still present in landing.css with zero consumers');
  const rawProgress = readFileSync(new URL('../src/components/landing/ProgressSection.tsx', import.meta.url), 'utf8');
  const unitBack = /\.landing \.ln-stat-unit\s*\{[^}]*color:\s*var\(--ln-cream-dim\)[^}]*font-size:\s*24px/.test(landingCss)
    && rawProgress.includes('ln-stat-unit');
  if (unitBack) pass += 1;
  else fails.push('stat-unit: the canonical .ln-stat-unit rule + its ProgressSection consumer not found (dimmed 24px unit span)');
}
// P2-5 mitigation: the constellation chips strip is derived from the SAME
// registry that feeds the sky pins (all 8 names accessibly) — r130 (L-7):
// the pins are now FOCUSABLE <button aria-label> elements (canonical
// CollegeConstellation grammar), not aria-hidden spans.
{
  const chipsFromRegistry = rawFeatures.includes('const CHIPS = FEATURES.map')
    && rawFeatures.includes('ln-constellation-strip');
  if (chipsFromRegistry) pass += 1;
  else fails.push('constellation a11y: the chips strip must be derived from the FEATURES registry (all 8 names accessible)');
  const pinsFocusable = rawFeatures.includes('<button') && rawFeatures.includes('ln-constellation-dot')
    && !/ln-constellation-dot[^>]*aria-hidden/.test(rawFeatures);
  if (pinsFocusable) pass += 1;
  else fails.push('constellation a11y: pins must be focusable <button> elements with aria-labels (no aria-hidden)');
}
// P2-4 (documented override): the skip target #page-content exists inside
// the landing (the app-level chip in layout.tsx remains the single skip
// link — the fleet a11y recipe pinned by the consumption gates).
if (rawPage.includes('id="page-content"')) pass += 1;
else fails.push('skip link: #page-content target not found inside the landing page');

// ── r129-F3 — OrbitScene port pins (the palette triplets are the canvas-side
// of the --ln-* tokens; a future token change must mirror them in lockstep). ──
for (const triplet of ['245, 243, 231', '223, 237, 178', '122, 107, 242']) {
  if (rawOrbitScene.includes(triplet)) pass += 1;
  else fails.push(`OrbitScene: palette triplet ${triplet} (cream/lime/violet ink) not found — canvas-side of the --ln-* tokens`);
}
// omega stays RADIANS PER MILLISECOND (do not "convert" without rescaling dt).
if (rawOrbitScene.includes('omega: 0.00016')) pass += 1;
else fails.push('OrbitScene: the inner-ring omega 0.00016 (rad/ms) constant not found');
// the hero mounts the engine with the canonical RTL-opposite bias.
if (rawPage.includes('biasX={-0.35}')) pass += 1;
else fails.push('OrbitScene mount: biasX={-0.35} not found in page.tsx');
// the intro-seen calm is product-scoped (never share keys across products).
if (rawLandingStage.includes("'smartbot.intro.seen'") || rawLandingStage.includes('"smartbot.intro.seen"')) pass += 1;
else fails.push("OrbitScene calm: the product-scoped sessionStorage key 'smartbot.intro.seen' not found in LandingStage");
// the DPR hard cap 1.5 (retina paints ≤2.25× CSS pixels, never 4×).
if (rawOrbitScene.includes('Math.min(window.devicePixelRatio || 1, 1.5)')) pass += 1;
else fails.push('OrbitScene: the DPR 1.5 hard-cap guard not found');

// ── r130 — W2-5 typography/motion/de-glow pins (the round-130 fix wave) ────

// (a) TYPE SCALE — the canonical --fs-*/--lh-*/--fw-* rungs + roles now live
// in the product layer (they were landing-scoped only; the dashboard rode
// raw Tailwind text-* — W1-E D-1/D-2 root cause).
pinAll(dark, 'type-scale', {
  '--fs-h1': '30px', '--fs-h2': '22px', '--fs-h3': '18px',
  '--fs-body-lg': '17px', '--fs-body': '15px', '--fs-sm': '13px',
  '--fs-xs': '12px', '--fs-xxs': '11px',
  '--fs-page-title': 'clamp(20px, 3.4vw, 28px)',
  '--fs-section-title': '17px',
  '--lh-base': '1.65', '--lh-snug': '1.20',
  '--fw-bold': '700',
});
pinAll(light, 'type-scale', {
  '--fs-body': '15px', '--fs-page-title': 'clamp(20px, 3.4vw, 28px)',
});
// (roles pin their RESOLVED values — pin() resolves var() chains)
pin(dark, 'type-roles', '--type-page-title-size', 'clamp(20px, 3.4vw, 28px)');
pin(dark, 'type-roles', '--type-page-title-weight', '700');
pin(dark, 'type-roles', '--type-section-title-weight', '600');
pin(dark, 'type-roles', '--type-body-line-height', '1.65');
pin(dark, 'type-roles', '--type-table-size', '13px');

// (b) BODY 15/1.65 — the actual body rule (was: no font-size at all, the UA
// 16px default — MASTER §3 claimed 15). Checked on the raw sheet (the rule
// lives inside @layer base).
{
  const rawSheet = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const body15 = /body\s*\{[^}]*font-size:\s*var\(--fs-body\)[^}]*line-height:\s*var\(--lh-base\)/.test(rawSheet);
  if (body15) pass += 1;
  else fails.push('body-15: the body rule must set font-size: var(--fs-body) + line-height: var(--lh-base) (15px/1.65)');
  const pLh = /p, li, \.body-text\s*\{[^}]*line-height:\s*var\(--lh-base\)/.test(rawSheet);
  if (pLh) pass += 1;
  else fails.push('body-15: p/li/.body-text line-height must be var(--lh-base) (1.65, was 1.75)');
  const headingsZero = !/h1, h2\s*\{[^}]*letter-spacing:\s*-(?:0\.0\d)em/.test(rawSheet)
    && !/\[dir="ltr"\] h1[^}]*letter-spacing:\s*-0\.026em/.test(rawSheet);
  if (headingsZero) pass += 1;
  else fails.push('tracking-law: heading letter-spacing must be 0 in both directions (21-c law; the -0.02/-0.01/-0.026em LTR values are retired)');
  const beltDelays = /animation-delay:\s*0s !important/.test(rawSheet) && /transition-delay:\s*0s !important/.test(rawSheet);
  if (beltDelays) pass += 1;
  else fails.push('rm-belt: the reduced-motion belt must reset animation-delay + transition-delay to 0s (SB-P1-1: content invisible up to 400ms otherwise)');
  const reveal360 = /\.reveal\s*\{[^}]*var\(--rv-dur, var\(--motion-duration-reveal\)\)\s*var\(--motion-ease-decelerate\)/.test(rawSheet);
  if (reveal360) pass += 1;
  else fails.push('reveal-360: .reveal default must be var(--motion-duration-reveal) (360ms) on the decelerate curve (was 520ms ease-out-quart)');
}

// (c) SEMANTIC MOTION LAYER + layout/state/topbar tokens (W1-G F-2 gap).
pinAll(dark, 'motion-semantic', {
  '--motion-duration-page': '320ms',
  '--motion-duration-reveal': '360ms',
  '--motion-duration-stat': '700ms',
  '--motion-duration-skeleton': '1200ms',
  '--motion-stagger-step': '60ms',
  '--motion-stagger-cap': '6',
});
pinAll(light, 'motion-semantic', {
  '--motion-duration-stat': '700ms',
  '--motion-duration-reveal': '360ms',
});
pin(dark, 'layout-tokens', '--content-max-w', '1280px');
pin(dark, 'layout-tokens', '--marketing-max-w', '1200px');
pin(dark, 'state-tokens', '--state-input-focus-halo', '0 0 0 3px color-mix(in srgb, #E9B44C 22%, transparent)');
pin(dark, 'topbar', '--topbar-bg', 'rgba(7, 11, 22, 0.86)');
pin(light, 'topbar', '--topbar-bg', 'rgba(251, 250, 249, 0.86)');

/* ── r131-F7 pins — the round-131 primitive canon ──────────────────────────
   (a) --shadow-card-h: the button-ladder premium hover shadow (A9 #37 gap;
       SM/SO family values verbatim, both themes).
   (b) status -ink TEXT tier (A7 Cluster B): dark = the luminous bases
       (aliases resolve through var() chains); light = the pastel -deep
       values via --c-*-deep — the 9-site light 1.4.3 failure's fix. */
pin(dark, 'r131-shadow-card-h', '--shadow-card-h', '0 1px 2px rgba(2, 4, 12, 0.50), 0 8px 22px rgba(2, 4, 12, 0.55), 0 0 0 1px rgba(142, 151, 184, 0.08)');
pin(light, 'r131-shadow-card-h', '--shadow-card-h', '0 1px 2px rgba(15, 15, 15, 0.04), 0 6px 18px rgba(15, 15, 15, 0.06)');
pin(dark, 'r131-status-ink', '--success-ink', '#7FD39A');
pin(dark, 'r131-status-ink', '--warning-ink', '#ECC97D');
pin(dark, 'r131-status-ink', '--info-ink', '#8FBBF2');
pin(dark, 'r131-status-ink', '--destructive-ink', '#F0938F');
pin(light, 'r131-status-ink', '--success-ink', '#1F4F30');
pin(light, 'r131-status-ink', '--warning-ink', '#6B4C0B');
pin(light, 'r131-status-ink', '--info-ink', '#1F3D63');
pin(light, 'r131-status-ink', '--destructive-ink', '#6B2128');

// (d) COMPONENT SOURCE PINS — the recipe fixes of the wave (grep-level).
{
  const rawCard = readFileSync(new URL('../src/components/ui/card.tsx', import.meta.url), 'utf8');
  const rawDialog = readFileSync(new URL('../src/components/ui/dialog.tsx', import.meta.url), 'utf8');
  const rawPageHeader = readFileSync(new URL('../src/components/ui/PageHeader.tsx', import.meta.url), 'utf8');
  const rawSectionHeader = readFileSync(new URL('../src/components/ui/SectionHeader.tsx', import.meta.url), 'utf8');
  const rawEnterMotion = readFileSync(new URL('../src/components/shared/enter-motion.css', import.meta.url), 'utf8');

  // inner cards + dialogs: 16px (rounded-xl), NOT 20px — landing keeps 20.
  const card16 = rawCard.includes('overflow-hidden rounded-xl bg-card') && !rawCard.includes('rounded-2xl');
  if (card16) pass += 1;
  else fails.push('radius-16: card.tsx must ride rounded-xl (16px) with zero rounded-2xl (inner-page card grammar)');
  const dialog16 = rawDialog.includes('gap-4 rounded-xl bg-popover') && !rawDialog.includes('rounded-2xl');
  if (dialog16) pass += 1;
  else fails.push('radius-16: dialog.tsx must ride rounded-xl (16px) with zero rounded-2xl');

  // page-title resize: both heads consume the clamp token at weight 700.
  const phTitle = rawPageHeader.includes('text-(length:--fs-page-title)') && !rawPageHeader.includes('tracking-tight');
  if (phTitle) pass += 1;
  else fails.push('page-title: PageHeader h1 must be text-(length:--fs-page-title) @ font-bold, tracking 0 (was text-sm/base + tracking-tight)');
  const shTitle = rawSectionHeader.includes('text-(length:--fs-page-title)') && !rawSectionHeader.includes('font-semibold') && !rawSectionHeader.includes('tracking-tight');
  if (shTitle) pass += 1;
  else fails.push('page-title: SectionHeader h2 must be text-(length:--fs-page-title) @ font-bold (canonical page-head rung)');

  // enter-motion distances: 4px page/KPI + 6px rise; sparkline on the stat
  // duration (700ms) + ladder fade (520ms).
  const dist4 = /sb-page-enter\s*\{[^}]*\}/.test(rawEnterMotion) && rawEnterMotion.includes('translateY(4px)') && !rawEnterMotion.includes('translateY(12px)');
  if (dist4) pass += 1;
  else fails.push('enter-distances: page/KPI enter lift must be 4px (was 12px)');
  const dist6 = rawEnterMotion.includes('translateY(6px)') && !rawEnterMotion.includes('translateY(24px)');
  if (dist6) pass += 1;
  else fails.push('enter-distances: fade-up lift must be 6px (was 24px)');
  const spark = rawEnterMotion.includes('sb-spark-draw var(--motion-duration-stat)') && rawEnterMotion.includes('sb-spark-fade var(--t-slower)');
  if (spark) pass += 1;
  else fails.push('sparkline: draw must ride var(--motion-duration-stat) (700ms) + fade var(--t-slower) (520ms) — was raw 0.8s/0.5s');

  // de-glow: zero font-extrabold and zero blur-3xl in the product source.
  const walk = (dir) => {
    let out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      // src/test is skipped: the pin suites legitimately SPELL the banned
      // tokens inside their own assertions.
      if (e.isDirectory()) { if (!/\/test$|\/__test__$/.test(p)) out = out.concat(walk(p)); }
      else if (/\.(tsx|ts|css)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const srcFiles = walk(new URL('../src', import.meta.url).pathname);
  const offenders = [];
  for (const f of srcFiles) {
    const s = readFileSync(f, 'utf8');
    if (/font-extrabold/.test(s)) offenders.push(`font-extrabold: ${f}`);
    if (/blur-3xl/.test(s)) offenders.push(`blur-3xl: ${f}`);
    if (/GlowPool/.test(s)) offenders.push(`GlowPool: ${f}`);
  }
  if (offenders.length === 0) pass += 3;
  else fails.push(...offenders.map((o) => `de-glow: ${o} (font-extrabold/blur-3xl/GlowPool must be zero-occurrence)`));
}

// ── (e) r131-F7 COMPONENT SOURCE PINS — the primitive-canon wave ──────────────
{
  /* comment-stripped reads — the r131 primitives document their OWN retired
     idioms in block comments ("was min-h-11", "enableSystem REMOVED"…), so
     the negative pins must test code, not commentary. */
  const nc = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rawButton131 = nc(readFileSync(new URL('../src/components/ui/button.tsx', import.meta.url), 'utf8'));
  const rawTextarea131 = nc(readFileSync(new URL('../src/components/ui/textarea.tsx', import.meta.url), 'utf8'));
  const rawSelect131 = nc(readFileSync(new URL('../src/components/ui/select.tsx', import.meta.url), 'utf8'));
  const rawToaster131 = nc(readFileSync(new URL('../src/components/ui/app-toaster.tsx', import.meta.url), 'utf8'));
  const rawToast131 = nc(readFileSync(new URL('../src/lib/premium-toast.tsx', import.meta.url), 'utf8'));
  const rawProviders131 = nc(readFileSync(new URL('../src/app/providers.tsx', import.meta.url), 'utf8'));

  // button ladder (fleet ruling 40/13/600, sm 32/12, lg 44/14, no base floor)
  const btnLadder = rawButton131.includes('text-[13px] font-semibold')
    && rawButton131.includes('sm: "h-8 gap-1.5 px-3 text-xs"')
    && rawButton131.includes('default: "h-10 gap-2 px-5"')
    && rawButton131.includes('lg: "h-11 gap-2.5 px-6 text-sm"')
    && rawButton131.includes('icon: "size-10"')
    && !rawButton131.includes('min-h-11');
  if (btnLadder) pass += 1;
  else fails.push('r131 button: ladder must be 40/13/600 (sm h-8/12, lg h-11/14, icon size-10) with NO base min-h-11 floor');
  const btnHover = rawButton131.includes('hover:-translate-y-[2px]') && rawButton131.includes('hover:shadow-(--shadow-card-h)');
  if (btnHover) pass += 1;
  else fails.push('r131 button: filled-CTA hover must be -2px lift + the premium --shadow-card-h (was -1px + shadow-md)');
  const btnBusy = rawButton131.includes('aria-busy={loading || undefined}');
  if (btnBusy) pass += 1;
  else fails.push('r131 button: loading must set aria-busy (A11 SB-6)');

  // textarea on the input recipe (the missed r130 wave)
  const taOk = rawTextarea131.includes('min-h-24')
    && rawTextarea131.includes('rounded-md')
    && rawTextarea131.includes('focus-visible:shadow-(--state-input-focus-halo)')
    && !rawTextarea131.includes('md:text-sm')
    && !rawTextarea131.includes('rounded-lg');
  if (taOk) pass += 1;
  else fails.push('r131 textarea: must ride the input recipe (min-h-24/rounded-md/halo token, no md:text-sm)');

  // the shared select primitive exists on the recipe
  const selOk = rawSelect131.includes('h-11') && rawSelect131.includes('appearance-none')
    && rawSelect131.includes('focus-visible:shadow-(--state-input-focus-halo)');
  if (selOk) pass += 1;
  else fails.push('r131 select: the shared native select must exist (h-11/16px floor/halo token)');

  // dialog canon: 560px cap + 18/600 title + canonical pop entrance
  const dlgOk = rawDialog.includes('sm:max-w-[560px]')
    && rawDialog.includes('text-lg leading-none font-semibold')
    && rawDialog.includes('data-starting-style:scale-[0.98]')
    && rawDialog.includes('data-starting-style:translate-y-2')
    && !rawDialog.includes('sm:max-w-sm');
  if (dlgOk) pass += 1;
  else fails.push('r131 dialog: 560px cap + title 18/600 + madarek-pop entrance (scale .98 / y 8px)');

  // toaster canon: bottom-end + canonical entrance + manual-dismiss errors
  const tOk = rawToaster131.includes('position="bottom-left"')
    && rawToaster131.includes('var(--motion-duration-medium, 240ms)')
    && rawToast131.includes('borderInlineStartColor')
    && rawToast131.includes('size-7 rounded-md')
    && rawToast131.includes('Infinity');
  if (tOk) pass += 1;
  else fails.push('r131 toaster: bottom-end stack + 1px status hairline + 28px well + error manual-dismiss');

  // providers canon: one resolution path (enableSystem OFF)
  const pOk = !rawProviders131.includes('enableSystem');
  if (pOk) pass += 1;
  else fails.push('r131 providers: enableSystem must be OFF (SO r130 ruling — one resolution path)');

  /* ── (f) r131-F7b COMPLETION PINS — the carry-over wave ────────────────────
   * (badge re-base, tbl-stack CSS, de-glow tail, admin table canon, -ink
   * sweep completion). Same comment-stripped reads as (e). */
  const rawBadge = nc(readFileSync(new URL('../src/components/ui/badge.tsx', import.meta.url), 'utf8'));
  // badge canon: SOLID pastel status pairs + 11/600/tnum rung (fleet ruling
  // "status = solid pastel 11/600 tnum") — the Smart-Menu washed idiom
  // (bg-success/15 + border-success/25 + base text) is retired.
  const badgeOk = rawBadge.includes('text-[11px] font-semibold tabular-nums')
    && rawBadge.includes('success: "bg-success-soft text-success-ink"')
    && rawBadge.includes('warning: "bg-warning-soft text-warning-ink"')
    && rawBadge.includes('info: "bg-info-soft text-info-ink"')
    && rawBadge.includes('gold: "bg-(--c-copper-bg) text-(--accent-ink)"')
    && !rawBadge.includes('bg-success/15')
    && !rawBadge.includes('border-success/25');
  if (badgeOk) pass += 1;
  else fails.push('r131-F7b badge: SOLID pastel status pairs (bg = --*-soft, text = -ink) on the 11/600/tnum rung — no washed /15 grounds');

  // tbl-stack canon: F8 tagged dashboard/demo tables with the class but the
  // mobile-collapse CSS never landed (dead code — "data-label set, no CSS
  // consumes it"). The F7b port ships the madarek polish.css:2103 recipe.
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const tblOk = css.includes('.tbl-stack td::before')
    && css.includes('content: attr(data-label)')
    && css.includes('.tbl-stack thead { display: none; }')
    && /@media \(max-width: 640px\)[\s\S]*?\.tbl-stack \{ display: block; \}/.test(css);
  if (tblOk) pass += 1;
  else fails.push('r131-F7b tbl-stack: the mobile table→cards CSS must exist (data-label ::before labels, <640px)');

  // de-glow tail: the gold-tinted shadow-accent-foreground modifier is
  // retired from the product surfaces (the FAB keeps its documented
  // lowest-severity exception — A4 P3-7; comments never counted, nc() strips).
  const glowFiles = [
    '../src/app/pricing/page.tsx',
    '../src/app/connect/page.tsx',
    '../src/app/login/page.tsx',
    '../src/app/register/RegisterForm.tsx',
    '../src/app/onboarding/OnboardingWizard.tsx',
    '../src/app/subscribe/PlanSelector.tsx',
    '../src/app/subscribe/StepIndicator.tsx',
    '../src/components/ui/card.tsx',
    '../src/components/ui/EmptyState.tsx',
    '../src/components/shared/payment/payment-status.tsx',
    '../src/components/shared/payment/index.tsx',
  ];
  const glowFree = glowFiles.every((f) =>
    !nc(readFileSync(new URL(f, import.meta.url), 'utf8')).includes('shadow-accent-foreground'));
  if (glowFree) pass += 1;
  else fails.push('r131-F7b de-glow: shadow-accent-foreground modifiers must be gone from the swept surfaces (neutral elev only)');

  // admin table canon: the payments + tickets tables ride the fleet recipe
  // (13px cells, 11/600 surface-2 band, zebra-on-hover, first-cell dot) and
  // the tickets queue ships the numbered pagination footer on an exact
  // page-window contract.
  const rawAdmin = nc(readFileSync(new URL('../src/app/admin/page.tsx', import.meta.url), 'utf8'));
  const rawAdminSupport = nc(readFileSync(new URL('../src/app/admin/support/page.tsx', import.meta.url), 'utf8'));
  const adminTblOk = rawAdmin.includes('tbl-stack w-full text-(length:--fs-sm)')
    && rawAdmin.includes('text-[11px] font-semibold uppercase')
    && rawAdmin.includes('hover:bg-muted/40')
    && rawAdminSupport.includes('text-(length:--fs-sm)')
    && rawAdminSupport.includes('text-[11px] font-semibold uppercase')
    && rawAdminSupport.includes('<TablePagination')
    && rawAdminSupport.includes('limit=${TICKETS_PER_PAGE}')
    && !rawAdminSupport.includes('hasNextPage');
  if (adminTblOk) pass += 1;
  else fails.push('r131-F7b admin tables: fleet canon (13px/11up band/zebra/dot) + numbered TablePagination on the explicit limit contract');

  // -ink sweep completion: the shared status-as-text seams ride the AA -ink
  // tier in both themes (A7 Cluster B — raw bases measured 2.2-3.0:1 on the
  // soft grounds in light).
  const rawPageHeader = nc(readFileSync(new URL('../src/components/ui/PageHeader.tsx', import.meta.url), 'utf8'));
  const rawInput = nc(readFileSync(new URL('../src/components/ui/input.tsx', import.meta.url), 'utf8'));
  const inkOk = rawPageHeader.includes('bg-success-soft text-success-ink')
    && rawPageHeader.includes('bg-destructive-soft text-destructive-ink')
    && rawInput.includes('text-destructive-ink')
    && !rawInput.includes('text-destructive"');
  if (inkOk) pass += 1;
  else fails.push('r131-F7b -ink: PageHeader status chips + Input state icons/error text ride the AA -ink tier');

  // ── §r133 — the Finest Details wave (A5 S1-S6 + A9/A10/A12/A13 + F4/G4) ──
  // Money-path de-glow tail (A5 S1): the PlanSelector port flattened to the
  // SM r128-F5 twins — hairline border + border-color-only hover (no
  // border-2/shadow-xl), flat saffron badge, flat pastel icon chips, and
  // the pricing ribbon is a flat bg-primary pill (no gradient/shadow-lg).
  const rawPlanSel = nc(readFileSync(new URL('../src/app/subscribe/PlanSelector.tsx', import.meta.url), 'utf8'));
  const rawPricing = nc(readFileSync(new URL('../src/app/pricing/page.tsx', import.meta.url), 'utf8'));
  const planFlatOk = rawPlanSel.includes('rounded-2xl border p-5')
    && rawPlanSel.includes('transition-[border-color] duration-(--t-base) hover:border-accent-foreground/30')
    && rawPlanSel.includes('rounded-full bg-[var(--c-saffron)] px-2.5 py-0.5 text-3xs font-bold text-espresso')
    && rawPlanSel.includes('size-10 rounded-xl flex items-center justify-center mb-3 shrink-0')
    && rawPlanSel.includes('bg-[var(--c-saffron)]') // wide hairline = flat saffron rule
    && !rawPlanSel.includes('bg-gradient-to-br')
    && !rawPlanSel.includes('hover:shadow-xl')
    && rawPricing.includes('"bg-primary text-primary-foreground text-3xs font-bold px-4 py-1.5 rounded-b-xl')
    && !rawPricing.includes('from-primary to-primary/80 text-primary-foreground text-3xs');
  if (planFlatOk) pass += 1;
  else fails.push('r133 A5-S1: money-path plan surfaces ride the SM flat twins (hairline card / flat saffron badge / flat chips / flat pricing ribbon)');

  // Raw-<a> closure (A5 S4 + A13 S-04): the landing hero secondary CTA is a
  // next/link; the ONLY raw internal <a> left in src is global-error's
  // documented self-contained boundary (guarded by its own eslint-disable).
  const rawLanding = nc(readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8'));
  /* global-error is read RAW (no comment stripping) — the eslint-disable
     directive that guards the deliberate raw <a> lives inside a JSX comment
     and must survive the pin. */
  const rawGlobalErr = readFileSync(new URL('../src/app/global-error.tsx', import.meta.url), 'utf8');
  const linkOk = rawLanding.includes('<Link href="/demo" className="ln-btn-ghost">')
    && (nc(rawGlobalErr).match(/<a href="\/">/g) || []).length === 1
    && rawGlobalErr.includes('eslint-disable-next-line @next/next/no-html-link-for-pages');
  if (linkOk) pass += 1;
  else fails.push('r133 A5-S4: hero CTA = Link; global-error keeps exactly the one documented raw <a>');

  // Error-state family last mile (A5 S5): messages' conversations column and
  // the sequences subscribers drawer ride .state state-danger + role=alert.
  const rawMessages = nc(readFileSync(new URL('../src/app/dashboard/messages/page.tsx', import.meta.url), 'utf8'));
  const rawSeq2 = nc(readFileSync(new URL('../src/app/dashboard/sequences/page.tsx', import.meta.url), 'utf8'));
  const errFamilyOk = rawMessages.includes('state state-danger py-8" role="alert"')
    && rawSeq2.includes('state state-danger py-16" role="alert"');
  if (errFamilyOk) pass += 1;
  else fails.push('r133 A5-S5: messages:845 + sequences drawer ride the canonical .state state-danger error family');

  // Editable-list key hygiene (A13 S-01): the sequences step editor keys on
  // the local stable draft key (st.key), never the index.
  if (rawSeq2.includes('<div key={st.key}') && rawSeq2.includes('key: `step-${++stepKeySeq}`')) pass += 1;
  else fails.push('r133 A13-S01: sequence steps key on the stable draft key (minted in stepDraft/load), not the index');

  // Microcopy canon (A9 V1/V2 + R5/R6): تعذّر (shadda) everywhere user-facing
  // on the money path; فشل banned; the wizard hint rides «…» guillemets.
  const rawBill2 = nc(readFileSync(new URL('../src/app/dashboard/billing/page.tsx', import.meta.url), 'utf8'));
  const rawPayIdx = nc(readFileSync(new URL('../src/components/shared/payment/index.tsx', import.meta.url), 'utf8'));
  const rawCsrf = nc(readFileSync(new URL('../src/lib/csrf-client.ts', import.meta.url), 'utf8'));
  const rawWizard = nc(readFileSync(new URL('../src/app/onboarding/OnboardingWizard.tsx', import.meta.url), 'utf8'));
  const verbOk = rawBill2.includes('تعذّر تحميل الرصيد') && rawBill2.includes('تعذّر إرسال طلب الترقية')
    && rawPayIdx.includes('تعذّر إرسال طلب الدفع') && rawCsrf.includes('تعذّر الطلب (')
    && rawWizard.includes('«اقترح رداً»')
    && !rawBill2.includes('فشل') && !rawPayIdx.includes('فشل') && !rawCsrf.includes('فشل');
  if (verbOk) pass += 1;
  else fails.push('r133 A9: money-path copy rides تعذّر (shadda), zero فشل, «…» guillemets in the wizard hint');

  // Phone normalization twin (A12 S10/R10/R12): the SO normalizeLibyanPhone
  // twin exists and the two payment paths normalize before submit.
  const rawPhone = nc(readFileSync(new URL('../src/lib/phone.ts', import.meta.url), 'utf8'));
  const phoneOk = rawPhone.includes('export function normalizeLibyanPhone')
    && rawPayIdx.includes('normalizeLibyanPhone(phone)') && !rawPayIdx.includes('/^09\\d{8}$/')
    && rawBill2.includes('normalizeLibyanPhone(phone)') && !rawBill2.includes('/^09\\d{8}$/');
  if (phoneOk) pass += 1;
  else fails.push('r133 A12-S10: +218/00218/Eastern-digit input normalizes to 09XXXXXXXX on both payment paths (regex guards retired)');

  // og:locale = ar_AR (A12 S13/R11) — Facebook only recognizes ar_AR.
  const rawLayout2 = nc(readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8'));
  if (rawLayout2.includes('locale: "ar_AR"')) pass += 1;
  else fails.push('r133 A12-S13/R11: og:locale must be ar_AR (ar_LY is dropped by FB scrapers)');

  // Billing upgrade validation (A5 S2) + useMe doctrine (N2): inline
  // per-field errors + focus-first-invalid on the money dialog; the inline
  // /api/me rider is retired onto the shared hook.
  const s2Ok = rawBill2.includes('focusFirstInvalidField') && rawBill2.includes('error={fieldErrors.phone}')
    && rawBill2.includes('const { data: me } = useMe()') && !rawBill2.includes('"/api/me"');
  if (s2Ok) pass += 1;
  else fails.push('r133 A5-S2/N2: billing upgrade dialog = support/wizard validation recipe; me query rides useMe()');

  // 12px readability floor, worst sites (A5 S3): the money-history timestamp
  // and the leads first-seen/last-contact dates ride text-xs (content tier).
  const rawLeads = nc(readFileSync(new URL('../src/app/dashboard/leads/page.tsx', import.meta.url), 'utf8'));
  const floorOk = rawBill2.includes('text-xs text-muted-foreground">{formatDate(p.created_at)}')
    && rawLeads.includes('text-xs">أول ظهور:') && rawLeads.includes('text-xs">آخر تواصل:')
    && !rawLeads.includes('text-3xs');
  if (floorOk) pass += 1;
  else fails.push('r133 A5-S3: content-bearing micro text rides the 12px floor (billing history dates, leads dates)');

  // Micro-interaction canon (A10): autofill/caret theming ported, the
  // default-easing bridge, off-register presses retired, input hover border.
  const rawGlobals = nc(readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8'));
  const rawStepInd = nc(readFileSync(new URL('../src/app/subscribe/StepIndicator.tsx', import.meta.url), 'utf8'));
  const rawTgCfg = nc(readFileSync(new URL('../src/app/admin/telegram/TelegramConfigSection.tsx', import.meta.url), 'utf8'));
  const microOk = rawGlobals.includes('input:-webkit-autofill') && rawGlobals.includes('caret-color: var(--primary)')
    && rawGlobals.includes('--default-transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1)')
    && rawInput.includes('hover:not-aria-invalid:border-foreground/25')
    && rawStepInd.includes('active:scale-[0.97]') && rawTgCfg.includes('active:scale-[0.97]')
    && !rawStepInd.includes('active:scale-[0.94]') && !rawTgCfg.includes('active:scale-90');
  if (microOk) pass += 1;
  else fails.push('r133 A10: autofill/caret + easing bridge + input hover + canonical 0.97 presses (0.94/0.90 retired)');
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(fails.length === 0
  ? `✓ Madarek parity snapshot: ${pass} assertions passed (globals.css product tokens + landing.css Orbit-Ink layer == canonical values)`
  : `✗ Madarek parity DRIFT: ${fails.length} failure(s) of ${pass + fails.length}:\n  - ` + fails.join('\n  - '));
process.exit(fails.length === 0 ? 0 : 1);
