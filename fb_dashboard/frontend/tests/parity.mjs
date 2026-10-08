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
import { readFileSync } from 'node:fs';

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
// in light and --accent-strong #C9962F (7.87:1) for the dark focus state.
const FOCUS_DARK = {
  '--ring': '#E9B44C',
  '--state-focus-ring-color': '#C9962F',
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
  '--ln-grain-op': '0.05',
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

// (f) .ln-grain veil — fixed, inert, 5% opacity (resolved), Madarek's
//     z-2000 rung (below native dialogs, above the whole landing)
pinDecl('grain', '.landing .ln-grain', 'z-index', '2000');
pinDecl('grain', '.landing .ln-grain', 'pointer-events', 'none');
{
  const grainBlock = landingBlocks.find((x) => x.prelude === '.landing .ln-grain');
  const grainOp = grainBlock ? resolve(landingCascade, declOf(grainBlock.body, 'opacity') ?? '') : '';
  if (norm(grainOp) === '0.05') pass += 1;
  else fails.push(`grain opacity: expected var(--ln-grain-op) → 0.05, got ${grainOp || '<missing>'}`);
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

// ── report ───────────────────────────────────────────────────────────────────
console.log(fails.length === 0
  ? `✓ Madarek parity snapshot: ${pass} assertions passed (globals.css product tokens + landing.css Orbit-Ink layer == canonical values)`
  : `✗ Madarek parity DRIFT: ${fails.length} failure(s) of ${pass + fails.length}:\n  - ` + fails.join('\n  - '));
process.exit(fails.length === 0 ? 0 : 1);
