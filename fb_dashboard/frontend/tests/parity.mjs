#!/usr/bin/env node
/**
 * test(parity): design-token snapshot — pin the canonical design tokens.
 *
 * PHASE 5 DECISION (r152, Smart Link Ecosystem — total creative
 * reconstruction): SmartBot LEAVES the Madarek family monoculture and
 * ships its own visual constitution — "Circuit Petrol: The Friendly
 * Machine". Every pinned VALUE below was re-anchored from the Madarek
 * gold/indigo set to the petrol contract in the same commit (names,
 * machinery and consumption gates untouched):
 *
 *   ground #070B16→#050506 · surface #0D1428→#0A0B0E · soft #121A36→#101115
 *   ink #F2EFE6→#F4F4F6 · primary gold #E9B44C→SIGNAL TEAL #56E2F2
 *   (fg #05070F→#05171B) · light copper #B57438→teal-deep #0E7A8A
 *   status/family/neutral ramps re-graded in the petrol hue world; the
 *   lime AI signal (--c-lime-*) is a NEW family (AI/automation only).
 *   Landing --ln-* Orbit-Ink values → petrol stage/foam/teal/lime.
 *
 * The consumption gates (structure bans, z-ladder, RM belt, component
 * source pins) are UNCHANGED — they are product-neutral contracts. The
 * pin count is unchanged (421): every pin re-anchored, none deleted.
 * r152b/c (continuation wave, Task 2-c): +9+7 pins for the robot/motif
 * system + product-surface cascade — RobotMark states, the rb-* layer,
 * the circuit-trace separators, the retired-raster gate, the /demo live
 * thread, the lime AI registers, and the Grotesk KPI numerals.
 * P15 (concept A — character-led hero): the hero pins re-anchored to the
 * new composition (§P15 block at the tail): the machine layer (RobotScene
 * framing solver + --sb-fig/--sb-floor), the ticker/status island
 * (HeroTicker), the sink-and-fade exit (HeroExit), the Arabic display
 * headline font law. Retired with the same commit: BotChatSimulator +
 * HeroCompanion (the below-fold dock) and the dead canvas twins
 * OrbitScene + HeroDepthLayer — every pin that read those sources now
 * reads the living hero files or asserts the retirement itself.
 * P18-W2-a (the Obelisk Attendant — recovered/finished): 5 hero pins
 * re-anchored with the character rebuild + the asymmetric re-composition
 * — the 44vw inline-start column measure, the 4.4vw column display
 * scale, the status panel's wireframe-instrument-box grammar (0.75
 * resting alpha — the W1-a near-invisible reading retired), and the
 * character contract flipped to the PROCEDURAL build (BufferGeometry,
 * GLTFLoader absent; the retired GLB is provenance-only on disk). Pin
 * COUNT unchanged; no pin deleted.
 *
 * History: r127 Madarek parity rewrite (82→180+ pins), r131/r133/r134
 * wave pins — superseded value-wise by r152, kept structurally.
 *
 * (Wave 11-a completion by orchestrator; the SSOT is now THIS file plus
 * globals.css — the madarek tokens.css reference died with the Phase 5
 * departure.)
 *
 * Run: `npm run test:parity` (dependency-free node script; exit 1 on any
 * drift — CI-able via Gate 3.6). smart-bot's vocabulary maps 1:1 to the
 * family names (--c-*-bg/ink/deep) with a shadcn-style bridge
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
pin(dark, 'dark', '--background', '#050506');
pin(dark, 'dark', '--foreground', '#F4F4F6');
pin(dark, 'dark', '--primary', '#56E2F2');
pin(dark, 'dark', '--primary-foreground', '#05171B');
// 9 pastel families (§1.4)
const famDark = {
  peach: ["#2A1F1C", "#FFB08C", "#FFE2D1"], mint: ["#0D241B", "#5FE3A1", "#CFEDE1"],
  lavender: ["#1E2233", "#A9B4F0", "#D8DDF9"], sky: ["#102530", "#8FC9D8", "#CFE8F0"],
  yellow: ["#332A10", "#F8CF6E", "#F9E6BC"], rose: ["#331821", "#F2919B", "#FAD3D7"],
  sand: ["#1A1D1C", "#C4C9C4", "#DEE3E0"], grey: ["#141519", "#A7A8B0", "#D6D7DB"],
  copper: ["#0D1E24", "#56E2F2", "#C9F6FC"],
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
pin(light, 'light', '--background', '#F2F2F0');
pin(light, 'light', '--foreground', '#101115');
pin(light, 'light', '--primary', '#0E7A8A');
pin(light, 'light', '--primary-foreground', '#F2F2F0');
const famLight = {
  peach: ["#FFEDE3", "#E0825C", "#74301C"], mint: ["#D9F3E6", "#2E9E6F", "#0F4A33"],
  lavender: ["#E9E8F7", "#7B86DC", "#32387E"], sky: ["#DDF0F7", "#3E96BC", "#0F3D52"],
  yellow: ["#FBF1CF", "#C29217", "#6B4C0B"], rose: ["#FCE3E6", "#D95F6C", "#6B2128"],
  sand: ["#EDEFEA", "#849489", "#385241"], grey: ["#EAEEF0", "#62696C", "#2E3A40"],
  copper: ["#DCF1F4", "#12748A", "#0C4753"],
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
// r148 (19-AUDIT-CROSS R1, authorized pin edit): the light BASE hues move
// to the resolved fleet set — success #2F7D4F→#4FA66D (mint-ink), warning
// #8C6A1D→#D6A330 (yellow-ink), info #3B6FB5→#5C8FCE (sky-ink), destructive
// #C2414D→#DD6E78 (rose-ink) — the exact values the r127 comment already
// claimed; Menu/Link/Order ship these verbatim. Count unchanged (421).
const STATUS_DARK = {
  '--success': '#5FE3A1', '--success-foreground': '#05171B',
  '--success-soft': '#0D241B',
  '--warning': '#F8CF6E', '--warning-soft': '#332A10',
  '--info': '#8FC9D8', '--info-soft': '#102530',
  '--destructive': '#F2919B', '--destructive-foreground': '#05171B',
  '--destructive-soft': '#331821',
};
const STATUS_LIGHT = {
  '--success': '#2E9E6F', '--success-foreground': '#05171B',
  '--success-soft': '#D9F3E6',
  '--warning': '#B08210', '--warning-soft': '#FBF1CF',
  '--info': '#3E96BC', '--info-soft': '#DDF0F7',
  '--destructive': '#D95F6C', '--destructive-foreground': '#05171B',
  '--destructive-soft': '#FCE3E6',
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
pin(dark, 'glass-dark', '--glass-bg', 'rgba(10, 11, 14, 0.78)');
pin(light, 'glass-light', '--glass-bg', 'rgba(242, 242, 240, 0.78)');

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
  '--ring': '#56E2F2',
  '--state-focus-ring-color': '#56E2F2',
};
const FOCUS_LIGHT = {
  '--ring': '#0B5A68',
  '--state-focus-ring-color': '#0B5A68',
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
  '--glass-bg': '#0A0B0E',
  '--glass-bg-strong': '#0A0B0E',
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
  '--ln-ink': '#050506',
  '--ln-ink-2': '#0A0B0E',
  '--ln-cream': '#F4F4F6',
  '--ln-cream-dim': '#A7A8B0',
  '--ln-lime': '#56E2F2',
  '--ln-lime-deep': '#7CEFF9',
  '--ln-violet': '#9380FF',
  '--ln-violet-deep': '#3D3399',
  '--ln-line': 'rgba(244, 244, 246, 0.14)',
  '--ln-line-soft': 'rgba(244, 244, 246, 0.07)',
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
//     drives the day storyboard's lit rail and the chapter veil (raw
//     expressions: the fallbacks are part of the contract)
pinDecl('sp-consumer', '.landing .ln-day-path-light', 'transform', 'scaleY(var(--sp, 0))');
pinDecl('sp-consumer', '.landing .ln-chapter::before', 'opacity', 'calc(var(--sp, 0) * 0.5)');

// (e) scroll-spy selectors — the companion-narrative section ids keep
//     their R2-form active rules
//     (header[data-active-section=X] .landing-nav-link[href="#X"] — the
//     attribute-selector form; naive text dumps render it deceptively
//     as ".landing-nav-link ref=")
const SPY_SECTIONS = ['mind', 'day', 'platform', 'trust'];
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
pinDecl('landing-header', '.landing .landing-header.scrolled', 'background', 'rgb(10 11 14 / 0.92)');

// (h) NEGATIVE — .landing scope isolation, both directions:
//     1. the landing sheet never leaks into the product scopes
//     2. every top-level selector in landing.css is .landing-scoped
//        (or an at-rule wrapping .landing rules) — no bare element/global
//        selectors that would style product surfaces
const lnLeak = Object.keys(dark).filter((k) => k.startsWith('--ln-'));
if (lnLeak.length === 0) pass += 1;
else fails.push(`scope isolation: --ln-* tokens leaked into globals.css :root: ${lnLeak.join(', ')}`);
/* phase9 (P9-3-c): the gate is EXTENDED, not weakened — `html.light
     .landing` is the sanctioned LIGHT-STAGE scope (landing.css §16): it
     is still .landing-scoped (gated on the html class next-themes
     writes, attribute="class"), never a bare selector that could style
     product surfaces. Every other non-.landing prelude stays banned. */
const unscoped = landingBlocks.filter((x) =>
  !x.prelude.startsWith('.') && !x.prelude.startsWith('@') && !x.prelude.startsWith('html.light .landing'));
if (unscoped.length === 0) pass += 1;
else fails.push(`scope isolation: unscoped top-level selectors in landing.css: ${unscoped.map((x) => x.prelude).join(' | ')}`);

// (i) NEGATIVE SELF-TEST — inject drift into a copy and prove this block's
//     machinery SEES it (guards against silent-pass parser rot: if the
//     poison substitution stops matching, or the re-parse stops resolving,
//     the harness itself must fail loudly, not stay green)
const poisonedLanding = landingCss.replace(/(--ln-ink:\s*)#050506/, '$1#000000');
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

// ── phase9 (P9-3-c E3) — the landing LIGHT STAGE + theme toggle ─────────────
// Mission E3: every product's landing header gets the family ThemeToggle
// and the landing stops being theme-blind. SmartBot's stage flips to the
// canon's documented light mode («light mode = petrol mist + deep teal»,
// MASTER.md §header): ONE html.light .landing token block re-defines the
// §1 mirror at the PRODUCT light grades (globals.css .light — one coherent
// system, zero invented colors), and every raw literal that paints the
// night world carries a §16 light twin. The canvas engine (OrbitScene)
// re-samples the same tokens via MutationObserver (P9-3-a family
// pattern); the depth stars flip through CSS (presentation attributes
// lose to CSS rules).
const lightStageBlocks = landingBlocks.filter((b) => b.prelude === 'html.light .landing');
if (lightStageBlocks.length === 1) pass += 1;
else fails.push(`phase9 light stage: expected exactly ONE html.light .landing token block (§16a — found ${lightStageBlocks.length})`);
const lightLandingScope = {};
for (const b of lightStageBlocks) Object.assign(lightLandingScope, parseDecls(b.body));
const landingLightCascade = { ...light, ...landingScope, ...lightLandingScope };

// (a-light) the §1 mirror at the product light grades — every pair
//     pre-measured (mist #F2F2F0 ground): ink 14.62:1 · ink-dim 7.44:1 ·
//     signal-as-text 5.10:1 · AI lime 4.51:1 · CTA mist-on-teal 5.10:1.
pinAll(landingLightCascade, 'landing-light', {
  '--ln-ink': '#F2F2F0',
  '--ln-ink-2': '#E6E6E3',
  '--ln-cream': '#101115',
  '--ln-cream-dim': '#41434B',
  '--ln-lime': '#0E7A8A',
  '--ln-lime-deep': '#0B6573',
  '--ln-violet': '#6B54E0',
  '--ln-violet-deep': '#2A2470',
  '--ln-line': 'rgba(16, 17, 21, 0.20)',
  '--ln-line-soft': 'rgba(16, 17, 21, 0.10)',
  '--ln-grain-op': '0.06',
});
// (b-light) the §2-b bot register flips with the world (the §17 stage
//     register --sb-spot/-wash/-led/-hud twins were retired with the
//     HeroCompanion stage — P15; the living --sb-* names are §18's
//     composition tokens, pinned in the §P15 block)
pinAll(landingLightCascade, 'landing-light-bot', {
  '--ln-bot-glow': 'rgb(107 84 224 / 0.16)',
  '--ln-bot-amber': '#C25E33',
  '--ln-bot-bubble-in': 'rgb(255 255 255 / 0.94)',
  '--ln-bot-bubble-in-line': 'rgb(16 17 21 / 0.14)',
  '--ln-bot-frame': 'rgb(16 17 21 / 0.04)',
});

// (c-light) raw-literal light twins — the night literals that CANNOT ride
//     tokens get explicit §16 twins (scrolled rail, ghost pill, station
//     bar). P15 re-anchor: the station-bar twin now serves the ONE living
//     consumer (.ln-product-bar — the BotChatSimulator window twin retired
//     with its component); the companion floor-ring + starfield twins were
//     deleted with HeroCompanion/HeroDepthLayer — their successors are the
//     composition's OWN §20d twins (ticker plate + bracket corners),
//     pinned here.
pinDecl('landing-light-scrolled', 'html.light .landing .landing-header.scrolled', 'background', 'rgb(242 242 240 / 0.92)');
pinDecl('landing-light-ghost', 'html.light .landing .ln-btn-ghost', 'border-color', 'rgb(16 17 21 / 0.45)');
pinDecl('landing-light-stationbar', 'html.light .landing .ln-product-bar', 'background', 'rgb(255 255 255 / 0.72)');
pinDecl('landing-light-ticker', 'html.light .landing .ln-ticker', 'background', 'rgb(255 255 255 / 0.62)');
pinDecl('landing-light-tickercorner', 'html.light .landing .ln-ticker-corner', 'border-color', 'rgb(16 17 21 / 0.55)');
pinDecl('landing-light-selection', 'html.light .landing ::selection', 'background', 'var(--ln-violet)');
// P9-3-c2 (gate review): the footer mist-rise seam twin — the one night
// literal the first wave missed (foam 3% fades to invisible on mist).
pinDecl('landing-light-footerseam', 'html.light .landing .landing-footer::before', 'background', 'linear-gradient(180deg, transparent 0%, rgb(16 17 21 / 0.04) 100%)');

// (d-light) NEGATIVE — the DEFAULT .landing scope stays the NIGHT stage:
//     the mist values may live ONLY under the html.light compound.
const nightInk = norm(resolve(landingCascade, landingScope['--ln-ink'] ?? '')).toLowerCase();
const nightCream = norm(resolve(landingCascade, landingScope['--ln-cream'] ?? '')).toLowerCase();
if (nightInk === '#050506' && nightCream === '#f4f4f6') pass += 1;
else fails.push(`phase9 night-negative: the default .landing scope must stay the instrument night stage (got ink ${nightInk} / cream ${nightCream})`);
const lightLeak = Object.keys(landingScope).filter((k) => norm(String(landingScope[k])).toLowerCase() === '#f2f2f0');
if (lightLeak.length === 0) pass += 1;
else fails.push(`phase9 night-negative: mist values leaked into the default .landing scope: ${lightLeak.join(', ')}`);

// (e-light) the toggle contract — the family twin in the landing header:
//     the SHARED component (no fork), the tools slot OUTSIDE the
//     ≤1080px-folded CTA cluster (end-of-rail at every breakpoint).
{
  const rawLandingHeader = readFileSync(new URL('../src/components/landing/LandingHeader.tsx', import.meta.url), 'utf8');
  const toggleOk = rawLandingHeader.includes('from "@/components/shared/ThemeToggle"')
    && rawLandingHeader.includes('<ThemeToggle />')
    && /<div className="landing-header-tools">\s*<ThemeToggle \/>/.test(rawLandingHeader.replace(/\r/g, ''));
  if (toggleOk) pass += 1;
  else fails.push('phase9 toggle: LandingHeader must import the shared ThemeToggle and mount it in .landing-header-tools');
  const toolsOutsideCta = /landing-header-cta[\s\S]*?<\/div>\s*<button[\s\S]*?<\/button>\s*\{\/\* phase9[\s\S]*landing-header-tools/.test(rawLandingHeader.replace(/\r/g, ''));
  if (toolsOutsideCta) pass += 1;
  else fails.push('phase9 toggle: .landing-header-tools must sit AFTER the burger (end-of-rail, outside the ≤1080px-folded .landing-header-cta)');
  // tools slot styled in the sheet
  const toolsRule = landingBlocks.find((x) => x.prelude === '.landing .landing-header-tools');
  if (toolsRule && /display\s*:\s*flex/.test(toolsRule.body)) pass += 1;
  else fails.push('phase9 toggle: .landing .landing-header-tools { display: flex } rule missing from landing.css');
}

// (f-light) the canvas engine repaints from the SAME tokens — the
//     MutationObserver family pattern (Smart-Link P9-3-a precedent),
//     carried from the retired OrbitScene through the P15 RobotScene to
//     the P16-A CharacterScene (the GLB protagonist engine): the scene
//     re-samples its palette on every html class flip and at boot
//     (stored-light first frame).
{
  const rawRobot = readFileSync(new URL('../src/components/landing/CharacterScene.tsx', import.meta.url), 'utf8');
  /* P17: the scene reads --ln-lime/--ln-violet (the living accent
   * samples; --ln-ink-2 sampling retired with the constant ceramic
   * body-of-record — see ART-DIRECTION.md §5) */
  const robotOk = rawRobot.includes('MutationObserver')
    && rawRobot.includes("attributeFilter: ['class']")
    && rawRobot.includes('--ln-lime');
  if (robotOk) pass += 1;
  else fails.push('phase9 robot repaint: CharacterScene must observe the html class and re-sample the landing tokens (--ln-ink-2/--ln-lime/--ln-violet)');
}

// (g-light) the sheet's own head comment tells the NEW truth (the raw
//     file, not the comment-stripped copy): the landing no longer paints
//     one world in BOTH themes.
{
  const rawLandingCss = readFileSync(new URL('../src/app/landing.css', import.meta.url), 'utf8');
  if (!rawLandingCss.includes('world in BOTH themes')) pass += 1;
  else fails.push('phase9 comment truth: landing.css head still claims the landing paints BOTH themes (stale)');
}

// ── r129-F3 — the --accent-solid family (audit §4, the r128 open item) ──────
// SmartBot was the only Smart repo without the fleet six-token standard;
// --accent-solid is now the authoritative solid brand token and the
// scattered consumers (--primary/--primary-foreground/--ring/
// --state-focus-ring-color) chain to it. 12 pins.
pinAll(dark, 'accent-family-dark', {
  '--accent-solid': '#56E2F2',
  '--accent-hover': '#7CEFF9',
  '--accent-soft': '#0D1E24',
  '--accent-strong': '#2AC5D8',
  '--accent-ink': '#56E2F2',
  '--accent-fg': '#05171B',
});
pinAll(light, 'accent-family-light', {
  '--accent-solid': '#0E7A8A',
  '--accent-hover': '#0B6573',
  '--accent-soft': '#DCF1F4',
  '--accent-strong': '#0B5A68',
  '--accent-ink': '#0B5A68',
  '--accent-fg': '#F2F2F0',
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
// yellow-ink gold #8C6A1D — Madarek's own light rung), --gold-soft (the
// yellow family ground), --brand-purple (the lavender-ink chain), and
// --text-on-accent bridged to --accent-fg (the documented product semantic:
// the products' light primary is copper, so text on it is the deep fg).
pin(dark, 'brand-aliases-dark', '--gold', '#56E2F2');
pin(light, 'brand-aliases-light', '--gold', '#12748A');
pin(dark, 'brand-aliases-dark', '--gold-soft', '#0D1E24');
pin(light, 'brand-aliases-light', '--gold-soft', '#DCF1F4');
pin(dark, 'brand-aliases-dark', '--brand-purple', '#A9B4F0');
pin(light, 'brand-aliases-light', '--brand-purple', '#7B86DC');
pin(dark, 'brand-aliases-dark', '--text-on-accent', '#05171B');
pin(light, 'brand-aliases-light', '--text-on-accent', '#F2F2F0');
// The canonical neutral ramp under Madarek's own names (the five rungs the
// token matrix flagged — 150/300/400/500/800 — plus their neighbors).
const NEUTRALS_DARK = {
  '--neutral-0': '#0A0B0E', '--neutral-50': '#050506', '--neutral-100': '#101115',
  '--neutral-150': '#17181D', '--neutral-200': '#292A30', '--neutral-300': '#41434B',
  '--neutral-400': '#898B90', '--neutral-500': '#777983', '--neutral-700': '#A7A8B0',
  '--neutral-800': '#D6D7DB', '--neutral-900': '#F4F4F6',
};
const NEUTRALS_LIGHT = {
  '--neutral-0': '#FFFFFF', '--neutral-50': '#F2F2F0', '--neutral-100': '#E9E9E6',
  '--neutral-150': '#E1E1DE', '--neutral-200': '#D5D5D2', '--neutral-300': '#C2C2BE',
  '--neutral-400': '#62656C', '--neutral-500': '#55585F', '--neutral-700': '#41434B',
  '--neutral-800': '#2A2B31', '--neutral-900': '#101115',
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
pinDeclLast('measure', '.landing .ln-hero-robot .ln-hero-sub', 'max-inline-size', '52ch');
pinDeclLast('measure', '.landing .ln-chapter-lede', 'max-inline-size', '72ch');
pinDeclLast('measure', '.landing .ln-cta-lede', 'max-inline-size', '72ch');

// P4-01 press register — both pill types press at --press-scale (0.97) with
// the 80ms micro snap-back; the magnetic gold PRESERVES its translate.
pinDecl('press', '.landing .ln-btn-gold:active', 'transform', 'translate(var(--mag-x, 0), var(--mag-y, 0)) scale(var(--press-scale, 0.97))');
pinDecl('press', '.landing .ln-btn-gold:active', 'transition-duration', 'var(--t-micro)');
pinDecl('press', '.landing .ln-btn-ghost:active', 'transform', 'scale(var(--press-scale, 0.97))');
pinDecl('press', '.landing .ln-btn-ghost:active', 'transition-duration', 'var(--t-micro)');

// P3-28/29/30/35 card depth recipes — the SAME canonical values ride the
// v16-r142 consumers (mind threads, product windows, day media): resting
// station shadows + the product-bar inset top-edge highlight.
pinDeclLast('depth', '.landing .ln-mind-thread', 'box-shadow', '0 1px 2px rgba(0,0,0,0.06)');
pinDeclLast('depth', '.landing .ln-product-window', 'box-shadow', '0 1px 2px rgba(0,0,0,0.06)');
/* phase5 r152: the product-bar top-edge highlight rides the petrol foam
   rgba(233,245,240,…) (was the retired Orbit-Ink sand 245,243,231). */
pinDecl('depth', '.landing .ln-product-bar', 'box-shadow', 'inset 0 1px 0 rgba(244,244,246,0.04)');
pinDeclLast('depth', '.landing .ln-day-media', 'box-shadow', '0 1px 2px rgba(0,0,0,0.10)');

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
const rawRobotScene = readFileSync(new URL('../src/components/landing/CharacterScene.tsx', import.meta.url), 'utf8');
const rawRobotMount = readFileSync(new URL('../src/components/landing/RobotSceneMount.tsx', import.meta.url), 'utf8');

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
// r144 honesty wave: the fabricated uptime cell is GONE from TrustBand (the
// backend's hardcoded 99.9 violated REAL-or-ABSENT) — this pin flips from
// "a unit consumer exists" to an honesty gate: the band must render NO
// جهوزية/uptime claim, the code-defined engine-count cell (محرك أتمتة)
// rides in its slot, and the canonical .ln-stat-unit rule stays defined in
// landing.css for future REAL units (grammar kept, consumer optional).
{
  const deadGone = !/\.ln-btn-text\b/.test(landingCss);
  if (deadGone) pass += 1;
  else fails.push('dead classes: .ln-btn-text still present in landing.css with zero consumers');
  const rawTrust = readFileSync(new URL('../src/components/landing/TrustBand.tsx', import.meta.url), 'utf8');
  const bandHonest = /\.landing \.ln-trust-value \.ln-stat-unit\s*\{[^}]*color:\s*var\(--ln-cream-dim\)/.test(landingCss)
    && !/uptime|جهوزية/.test(rawTrust)
    && rawTrust.includes('محرك أتمتة');
  if (bandHonest) pass += 1;
  else fails.push('trust-band honesty: .ln-stat-unit rule must stay defined, the band must render NO uptime/جهوزية claim, and the verifiable engine-count cell (محرك أتمتة) must replace it');
}
// P2-5 mitigation: the mind chips strip is derived from the SAME registry
// that feeds the chat threads (all 4 capability names accessibly) —
// the chips are real ANCHOR links (native keyboard navigation, zero JS),
// each with an Arabic aria-label.
{
  const rawMind = readFileSync(new URL('../src/components/landing/MindSection.tsx', import.meta.url), 'utf8');
  const chipsFromRegistry = rawMind.includes('const CHIPS = THREADS.map')
    && rawMind.includes('ln-mind-strip');
  if (chipsFromRegistry) pass += 1;
  else fails.push('mind a11y: the chips strip must be derived from the THREADS registry (all 4 capability names accessible)');
  const chipsAnchors = rawMind.includes('<a')
    && rawMind.includes('className="ln-mind-chip"')
    && rawMind.includes('aria-label')
    && !/className="ln-mind-chip"[^>]*aria-hidden/.test(rawMind);
  if (chipsAnchors) pass += 1;
  else fails.push('mind a11y: chips must be real <a> anchors with aria-labels (no aria-hidden)');
}
// P2-4 (documented override): the skip target #page-content exists inside
// the landing (the app-level chip in layout.tsx remains the single skip
// link — the fleet a11y recipe pinned by the consumption gates).
if (rawPage.includes('id="page-content"')) pass += 1;
else fails.push('skip link: #page-content target not found inside the landing page');

// ── r129-F3 → P15 → P16-A — canvas engine pins (re-anchored from
// OrbitScene to the three.js RobotScene in P15, and from the primitives
// RobotScene to the GLB CharacterScene in P16-A — same contracts — the
// hero canvas is one engine, the authored character; the primitives
// RobotScene is deleted with the P16-A commit). ──────────────────────
// the canvas-side palette lockstep: the engine cannot read CSS vars for
// the WebGL clear/material literals, so the petrol contract is spelled in
// code — signal teal + AI lime + the petrol ground (fog), and the retired
// Orbit-Ink triplets stay absent.
for (const petrol of ['0x56e2f2', '0x9380ff', '0x050506']) {
  if (rawRobotScene.includes(petrol)) pass += 1;
  else fails.push(`CharacterScene: petrol literal ${petrol} (teal/lime/ground) not found — canvas-side of the --ln-* tokens`);
}
for (const retired of ['245,243,231', '223,237,178', '122,107,242', '0xfdf3e7']) {
  if (!rawRobotScene.includes(retired)) pass += 1;
  else fails.push(`CharacterScene: retired petrol literal ${retired} present — the canvas must stay Machine Instrument`);
}
// P12-2c → P16-A (honest pin update — same mechanism, new engine): the
// hero's canvas mount is the three.js CharacterScene (the GLB
// protagonist). Server Components may not pass ssr:false directly, so
// the dynamic import lives in the client wrapper RobotSceneMount — the
// pin asserts BOTH halves of the contract.
if (rawPage.includes('RobotSceneMount') && rawRobotMount.includes("import('@/components/landing/CharacterScene'") && rawRobotMount.includes('ssr: false')) pass += 1;
else fails.push('CharacterScene mount: page must mount RobotSceneMount; the wrapper must dynamic-import CharacterScene with { ssr: false } (P16-A hero)');
// the intro-seen calm is product-scoped (never share keys across products).
if (rawLandingStage.includes("'smartbot.intro.seen'") || rawLandingStage.includes('"smartbot.intro.seen"')) pass += 1;
else fails.push("scene calm: the product-scoped sessionStorage key 'smartbot.intro.seen' not found in LandingStage");
// the DPR hard cap 2 (the P15 concept contract, carried by P16-A —
//     retina paints ≤4× CSS pixels at most; OrbitScene's 1.5 was the
//     retired engine's budget).
if (/Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/.test(rawRobotScene)) pass += 1;
else fails.push('CharacterScene: the DPR 2 hard-cap guard not found');

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
pin(dark, 'state-tokens', '--state-input-focus-halo', '0 0 0 3px color-mix(in srgb, #56E2F2 22%, transparent)');
pin(dark, 'topbar', '--topbar-bg', 'rgba(5, 5, 6, 0.86)');
pin(light, 'topbar', '--topbar-bg', 'rgba(242, 242, 240, 0.86)');

/* ── r131-F7 pins — the round-131 primitive canon ──────────────────────────
   (a) --shadow-card-h: the button-ladder premium hover shadow (A9 #37 gap;
       SM/SO family values verbatim, both themes).
   (b) status -ink TEXT tier (A7 Cluster B): dark = the luminous bases
       (aliases resolve through var() chains); light = the pastel -deep
       values via --c-*-deep — the 9-site light 1.4.3 failure's fix. */
pin(dark, 'r131-shadow-card-h', '--shadow-card-h', '0 1px 2px rgba(1, 1, 2, 0.50), 0 8px 22px rgba(1, 1, 2, 0.55), 0 0 0 1px rgba(167, 168, 176, 0.08)');
pin(light, 'r131-shadow-card-h', '--shadow-card-h', '0 1px 2px rgba(15, 15, 15, 0.04), 0 6px 18px rgba(15, 15, 15, 0.06)');
pin(dark, 'r131-status-ink', '--success-ink', '#5FE3A1');
pin(dark, 'r131-status-ink', '--warning-ink', '#F8CF6E');
pin(dark, 'r131-status-ink', '--info-ink', '#8FC9D8');
pin(dark, 'r131-status-ink', '--destructive-ink', '#F2919B');
pin(light, 'r131-status-ink', '--success-ink', '#0F4A33');
pin(light, 'r131-status-ink', '--warning-ink', '#6B4C0B');
pin(light, 'r131-status-ink', '--info-ink', '#0F3D52');
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

  // button ladder (family 44/48/52 canon, r150 §8 — the r131 40/13/600
  // base rung is retired). r134: lg rung re-pinned 44px (h-11) → 48px
  // (h-12) — the madarek canon (components.css:474 `.btn.lg { block-size:
  // 48px }`). r150: default re-based h-10 → h-11 (44px) in sync with
  // Smart-Link parity C3 + Smart-Order parity r150 pin — ONE canonical
  // definition, three repositories.
  const btnLadder = rawButton131.includes('text-[13px] font-semibold')
    && rawButton131.includes('sm: "h-8 gap-1.5 px-3 text-xs"')
    && rawButton131.includes('default: "h-11 gap-2 px-5"')
    && !rawButton131.includes('default: "h-10')
    && rawButton131.includes('lg: "h-12 gap-2.5 px-6 text-sm"')
    && rawButton131.includes('icon: "size-10"');
  if (btnLadder) pass += 1;
  else fails.push('r150 button: ladder must be 44/48/52 (default h-11/44px canon — the h-10 rung is retired; sm h-8/12, lg h-12/48px canon, icon size-10)');
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

// ── §r134 — the frontend+mobile fix wave (R134-W2-SB-FE) ────────────────────
{
  /* Self-contained block: its own comment-stripping reader + raw reads.
     Pins the تعذّر copy policy, the lg rung canon, the og:image alt family
     form, the logical sidebar docks, and the stale-doc repairs. */
  const nc = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const read = (p) => nc(readFileSync(new URL(p, import.meta.url), 'utf8'));
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  // (1) تعذّر copy policy — the four web status maps ride the family verb
  //     and no فاشل survives anywhere user-facing (posts:24 joined the fix
  //     as the seventh site the audit sweep missed).
  const rawBcast = read('../src/app/dashboard/broadcast/page.tsx');
  const rawBill = read('../src/app/dashboard/billing/page.tsx');
  const rawPosts = read('../src/app/dashboard/posts/page.tsx');
  const rawMrkt = read('../src/app/dashboard/marketing/page.tsx');
  const taethirOk = rawBcast.includes('failed: "تعذّر"') && rawBill.includes('failed: "تعذّر"')
    && rawPosts.includes('failed: "تعذّر"') && rawMrkt.includes('failed: "تعذّرت"')
    && !rawBcast.includes('فاشل') && !rawBill.includes('فاشل')
    && !rawPosts.includes('فاشل') && !rawMrkt.includes('فشل');
  if (taethirOk) pass += 1;
  else fails.push('r134 تعذّر: broadcast/billing/posts = تعذّر, marketing = تعذّرت, zero فاشل/فشل user-facing');

  // (2) button lg rung = the 48px canon (madarek components.css:474) — the
  //     r131 ladder pin above carries the same value; this gate exists so
  //     the canon linkage is named in its own right (the rung had drifted
  //     precisely because nothing named it).
  const rawBtn134 = read('../src/components/ui/button.tsx');
  const lgOk = rawBtn134.includes('lg: "h-12 gap-2.5 px-6 text-sm"')
    && !rawBtn134.includes('lg: "h-11');
  if (lgOk) pass += 1;
  else fails.push('r134 lg rung: lg must be h-12 (48px — madarek .btn.lg canon), never h-11');

  // (3) og:image alt family form «الربط الذكي — SmartBot» (root + 6 routes).
  const ogFiles = [
    '../src/app/layout.tsx', '../src/app/privacy/page.tsx', '../src/app/terms/page.tsx',
    '../src/app/subscribe/layout.tsx', '../src/app/pricing/layout.tsx',
    '../src/app/demo/layout.tsx', '../src/app/register/layout.tsx',
  ];
  const ogOk = ogFiles.every((f) => read(f).includes('alt: "الربط الذكي — SmartBot"'))
    && ogFiles.every((f) => !read(f).includes('alt: "SmartBot —'));
  if (ogOk) pass += 1;
  else fails.push('r134 og alt: every og:image alt must be «الربط الذكي — SmartBot» (family form)');

  // (4) RTL logical docks — the three sidebar rails ride start-0, no right-0.
  const dockFiles = [
    '../src/app/dashboard/DashboardShell.tsx',
    '../src/components/layout/AdminShell.tsx',
    '../src/app/demo/page.tsx',
  ];
  const dockOk = dockFiles.every((f) => read(f).includes('fixed top-0 start-0 z-(--z-dropdown)'))
    && dockFiles.every((f) => !read(f).includes('top-0 right-0'));
  if (dockOk) pass += 1;
  else fails.push('r134 RTL docks: all three sidebar rails must ride top-0 start-0 (logical), zero right-0');

  // (5) stale-doc repairs — read RAW (the claims live inside comments, so
  //     nc() would strip the very text under test).
  const rawInputDoc = readRaw('../src/components/ui/input.tsx');
  const rawDialogDoc = readRaw('../src/components/ui/dialog.tsx');
  const docOk = !rawInputDoc.includes('h-12 touch height, rounded-lg') && rawInputDoc.includes('h-11 touch height, rounded-md')
    && !rawDialogDoc.includes('spring-eased scale-in') && rawDialogDoc.includes('ease-smooth @ 240ms');
  if (docOk) pass += 1;
  else fails.push('r134 stale docs: input.tsx must document h-11/rounded-md and dialog.tsx ease-smooth @ 240ms (reality)');
}

// ── §r152b — the Circuit Petrol robot & motif system (Task 2-c) ─────────────
{
  /* Self-contained block: own comment-stripper + raw readers. Pins the ONE
     robot art direction (RobotMark SVG states + the shared rb-* motion
     layer), the circuit-trace chapter separators, and the retirement of the
     old raster robot/demo webp assets (zero live references). */
  const nc = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const read = (p) => nc(readRaw(p));

  const rawRobot = readRaw('../src/components/shared/RobotMark.tsx');
  const rawTrace = readRaw('../src/components/shared/CircuitTrace.tsx');
  const rawGlobals2 = readRaw('../src/app/globals.css');
  const rawLanding2 = readRaw('../src/app/landing.css');
  const rawHome = read('../src/app/page.tsx');
  const rawTicker = read('../src/components/landing/HeroTicker.tsx');
  const rawProduct = read('../src/components/landing/ProductSection.tsx');

  // (1) the ONE robot: five states + the title/aria contract.
  const statesOk = rawRobot.includes('export type RobotState = "idle" | "greeting" | "thinking" | "responding" | "error"')
    && rawRobot.includes('role={title ? "img" : undefined}')
    && rawRobot.includes('aria-hidden={title ? undefined : true}')
    && rawRobot.includes('focusable="false"');
  if (statesOk) pass += 1;
  else fails.push('r152b robot: RobotMark exports the 5 states and the title/aria-hidden/focusable contract');

  // (2) motion lives in globals (rb-* layer) — NO per-instance <style>:
  //     every mount shares one definition (RSC-safe, zero duplication).
  const robotCssOk = !rawRobot.includes('dangerouslySetInnerHTML')
    && rawGlobals2.includes('.rb-led { animation: rb-led-breathe')
    && rawGlobals2.includes('@keyframes rb-scan')
    && rawGlobals2.includes('@keyframes rb-say')
    && rawGlobals2.includes('.rb-say { transform-box: fill-box')
    && rawGlobals2.includes('@media (prefers-reduced-motion: reduce) {\n  .rb-led, .rb-scan, .rb-wave, .rb-say, .rb-glitch { animation: none; }');
  if (robotCssOk) pass += 1;
  else fails.push('r152b robot motion: rb-* keyframes live in globals.css (fill-box say-verbs + own RM off-switch), zero inline <style> in RobotMark');

  // (3) the robot themes through semantic tokens (no raw hex in the SVG).
  const robotTokensOk = rawRobot.includes('var(--c-lime-ink)') && rawRobot.includes('var(--primary)')
    && rawRobot.includes('var(--secondary)') && rawRobot.includes('var(--surface-sunken)')
    && !/#([0-9A-Fa-f]{6})\b/.test(rawRobot.replace(/robot LED|visor/g, ''));
  if (robotTokensOk) pass += 1;
  else fails.push('r152b robot tokens: shell/visor/LED resolve var(--secondary/--primary/--c-lime-ink…), zero raw hexes');

  // (4) the circuit-trace component grammar (divider/live/corner variants).
  const traceOk = rawTrace.includes('variant?: "divider" | "live" | "corner"')
    && rawTrace.includes('var(--c-lime-ink)') && rawTrace.includes('vectorEffect="non-scaling-stroke"');
  if (traceOk) pass += 1;
  else fails.push('r152b CircuitTrace: divider/live/corner variants, lime live node, non-scaling strokes');

  // (5) the landing chapter separators: TraceSep <hr class="sb-trace"> ×4
  //     (2 live) + the landing geometry rule.
  const sepOk = (rawHome.match(/<TraceSep/g) ?? []).length >= 4
    && rawHome.includes('<TraceSep live />') && rawHome.includes('className="sb-trace" aria-hidden="true"')
    && rawLanding2.includes('.landing hr.sb-trace { margin: 0; }');
  if (sepOk) pass += 1;
  else fails.push('r152b separators: 4+ circuit-trace chapter <hr>s on the landing (2 live), margins zeroed in landing.css');

  // (6) the product windows ride the trace accent (not raster captures).
  const productOk = (rawProduct.match(/<CircuitTrace/g) ?? []).length >= 2
    && rawProduct.includes('variant="live"')
    && !rawProduct.includes('next/image') && !rawProduct.includes('<Image');
  if (productOk) pass += 1;
  else fails.push('r152b product windows: CircuitTrace live accents under both window bars, zero <Image>');

  // (7) P15 re-anchor (2-e: the B scenario engine ported into A's
  //     ticker) — the hero's interactive beat is the TICKER island
  //     (HeroTicker) running CONCEPT B's honest demo cycle: the inbound
  //     customer message, the intent classification, the word-by-word
  //     auto-reply, the human handoff — all labeled «عرض توضيحي» with
  //     the sr-only honesty line, one aria-live polite region, and the
  //     same IO/hidden-tab pause family the simulator carried. The
  //     transcript grammar lives on in MindSection (pinned by the
  //     r142-era mind pins).
  const simOk = rawHome.includes('<HeroTicker />')
    && rawTicker.includes('aria-live="polite"')
    && rawTicker.includes('IntersectionObserver')
    && rawTicker.includes('document.hidden')
    && rawTicker.includes('عرض توضيحي')
    && rawTicker.includes('كم سعر الاشتراك عندكم؟')
    && rawTicker.includes('النية:')
    && rawTicker.includes('تم تحويل المحادثة إلى الفريق البشري');
  if (simOk) pass += 1;
  else fails.push('P15 ticker: the hero beat is the HeroTicker island — the honest demo cycle (inbound → intent → typed reply → human handoff) with the «عرض توضيحي» badge, aria-live polite, IO + hidden-tab pause');

  // (8) RETIRED RASTER ROBOTS: zero live references to the deleted webp
  //     assets anywhere under src (comment mentions are fine — the code
  //     surfaces must stay SVG). The landing hero poses + demo captures
  //     are RobotMark/live mini-boards now.
  const srcFiles = readdirSync(new URL('../src', import.meta.url), { recursive: true })
    .filter((f) => typeof f === 'string' && /\.(tsx?|css)$/.test(f));
  const rasterRefs = [];
  for (const f of srcFiles) {
    const text = nc(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'));
    if (text.includes('/images/robot/') || text.includes('demo-inbox.webp') || text.includes('demo-analytics.webp')
      || text.includes('robot-hero.webp') || text.includes('robot-wave.webp') || text.includes('robot-think.webp') || text.includes('robot-chat.webp')) {
      rasterRefs.push(String(f));
    }
  }
  if (rasterRefs.length === 0) pass += 1;
  else fails.push(`r152b raster retirement: src must carry ZERO live references to the retired webp robots/captures (found in: ${rasterRefs.join(', ')})`);

  // (9) the lime reserve holds on the landing: the AI chip + typing beads
  //     ride the lime register, the general UI rides teal.
  const limeOk = rawLanding2.includes('.landing .ln-pp-ai')
    && rawLanding2.includes('color-mix(in srgb, var(--ln-violet) 14%, transparent)')
    && rawLanding2.includes('.landing .ln-botchat-msg.bot')
    && !rawLanding2.includes('.landing .ln-cta-bot-img {\n  inline-size: 74px;\n  block-size: 74px;\n  border-radius: var(--ln-radius-pill);\n  overflow: hidden;\n  border: 1px solid var(--ln-line);\n  /* phase5: the plate now hosts the RobotMark SVG — petrol wash ground */\n  background: rgb(');
  if (limeOk) pass += 1;
  else fails.push('r152b lime reserve: the AI chip/panel washes ride token color-mix (no raw rgb hex washes on the new §17e layer)');
}

// ── §r152c — the product-surface cascade: /demo simulator + dashboard ──────
{
  /* Self-contained block: own comment-stripper + raw readers. Pins the
     Circuit Petrol motifs as they land on the PRODUCT surfaces — the /demo
     live conversation (AI-vs-user grammar), the autoreply/AI-suggest lime
     registers, the Grotesk numerals on KPIs, the robot in the messages
     empty states. */
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

  const rawDemo = readRaw('../src/app/demo/page.tsx');
  const rawAuto = readRaw('../src/app/dashboard/autoreply/page.tsx');
  const rawSuggest = readRaw('../src/components/ai/AiSuggestDialog.tsx');
  const rawKpi = readRaw('../src/components/shared/KpiCard.tsx');
  const rawMsgs = readRaw('../src/app/dashboard/messages/page.tsx');
  const rawGlobals3 = readRaw('../src/app/globals.css');

  // (1) /demo: the live conversation speaks the product grammar — lime
  //     typing dots, mono HH:MM stamps, the lime «رد آلي» mark on bot
  //     bubbles, the RobotMark riding the same state machine.
  const demoOk = rawDemo.includes('function DemoThread()')
    && rawDemo.includes('sb-typing sb-typing--bare')
    && rawDemo.includes('<RobotMark state={robotState} className="size-8" />')
    && rawDemo.includes('font-mono tabular-nums" dir="ltr">{m.time}')
    && rawDemo.includes('رد آلي')
    && rawDemo.includes('robotState = "thinking"');
  if (demoOk) pass += 1;
  else fails.push('r152c /demo: the live thread = RobotMark state machine + lime typing dots + mono stamps + «رد آلي» lime mark');

  // (2) the reduced-motion contract on the demo playback (full transcript,
  //     zero timers).
  const demoRmOk = rawDemo.includes('const mq = window.matchMedia("(prefers-reduced-motion: reduce)")')
    && rawDemo.includes('if (reduced) setStep(mockStats.thread.length)');
  if (demoRmOk) pass += 1;
  else fails.push('r152c /demo RM: reduced motion paints the whole transcript instantly (no timers)');

  // (3) autoreply: the AI row + provider status ride the RESERVED lime
  //     register (bg-lime-soft well, lime glyph, sb-ai-chip, lime status).
  const autoOk = rawAuto.includes('bg-lime-soft text-lime border border-lime/25')
    && rawAuto.includes('sb-ai-chip ms-2 align-middle')
    && rawAuto.includes('behavior.ai_available ? "bg-lime" : "bg-warning"')
    && rawAuto.includes('behavior.ai_available ? "text-lime" : "text-muted-foreground"');
  if (autoOk) pass += 1;
  else fails.push('r152c autoreply: the AI switch row + provider status = the lime register (well/glyph/chip/status)');

  // (4) AI suggest dialog: lime Sparkles + the lime typing dots while
  //     generating (role=status text contract intact).
  const suggestOk = rawSuggest.includes('text-lime shrink-0')
    && rawSuggest.includes('<span className="sb-typing" aria-hidden="true">')
    && rawSuggest.includes('جارٍ توليد الاقتراحات…')
    && !rawSuggest.includes('Loader2');
  if (suggestOk) pass += 1;
  else fails.push('r152c AI suggest: lime Sparkles + .sb-typing generating state (spinner retired)');

  // (5) KPI numerals: the value slot rides .sb-numerals (Grotesk display
  //     numerals) — the analytics/demo/owner boards inherit it.
  const kpiOk = rawKpi.includes('sb-kpi-pop sb-numerals font-heading');
  if (kpiOk) pass += 1;
  else fails.push('r152c KpiCard: the value slot carries .sb-numerals (the Grotesk numeral register)');

  // (6) messages: the two empty states host the ONE robot (idle waiting /
  //     greeting pick-a-conversation) — decorative beside the text.
  const msgsOk = rawMsgs.includes('<RobotMark state="idle" className="size-14" />')
    && rawMsgs.includes('<RobotMark state="greeting" className="size-16" />');
  if (msgsOk) pass += 1;
  else fails.push('r152c messages: the empty states host RobotMark (idle/greeting), not a generic icon');

  // (7) the bare typing variant exists in globals (inline status rows).
  const bareOk = rawGlobals3.includes('.sb-typing--bare { padding: 0; background: none; border: 0;');
  if (bareOk) pass += 1;
  else fails.push('r152c globals: .sb-typing--bare (the chrome-free dots variant) is defined');

  // (8) the hero canvas paints the petrol world (phase5 lockstep, P15
  //     re-anchor, P16-A re-anchor to CharacterScene): the three.js engine
  //     cannot read CSS vars, so the literals MUST be pinned —
  //     foam/teal/lime present, the retired Orbit-Ink sand/pistachio/violet
  //     triplets absent. The retired OrbitScene/HeroDepthLayer (P15) AND
  //     the primitives RobotScene (P16-A) canvases are DELETED; the
  //     retirement itself is pinned in §P15.
  const rawRobotScene2 = readRaw('../src/components/landing/CharacterScene.tsx');
  const canvasOk = rawRobotScene2.includes('0xdad9d6') && rawRobotScene2.includes('0x56e2f2')
    && rawRobotScene2.includes('0x9380ff')
    && !rawRobotScene2.includes('245,243,231') && !rawRobotScene2.includes('223,237,178') && !rawRobotScene2.includes('122,107,242');
  if (canvasOk) pass += 1;
  else fails.push('P15 canvas lockstep: CharacterScene literals = petrol foam/teal/lime, zero retired Orbit-Ink triplets');

  // (9) DASHBOARD CORE cascade (r152d): the thread itself speaks the chat
  //     grammar — mono HH:MM stamps (timeStamp + title fallback), the ONE
  //     robot as the page-side tail avatar (last-bubble-of-run), the lime
  //     dispatch dots while the reply is in flight, and the machine-room
  //     .sb-trace divider under the topbar on all three core pages.
  const rawAnalytics = readRaw('../src/app/dashboard/analytics/page.tsx');
  const msgsCoreOk = rawMsgs.includes('function timeStamp(')
    && rawMsgs.includes('{timeStamp(msg.created_time)}')
    && rawMsgs.includes('isLastPageRun')
    && rawMsgs.includes('<RobotMark state="idle" className="size-5" />')
    && rawMsgs.includes('sendMut.isPending && (\n                      <div className="flex justify-start">\n                        <span className="sb-typing" aria-hidden="true">')
    && rawMsgs.includes('جارٍ إرسال الرد…');
  if (msgsCoreOk) pass += 1;
  else fails.push('r152d messages: mono HH:MM stamps + page-run robot avatar + lime dispatch dots (.sb-typing) while the reply is in flight');

  /* phase6 r154 (P6-2-d1): the topbar trace moved from the manual per-page
     <hr> appends to the PageHeader component's built-in `trace` option —
     the pages pass `trace` and NO standalone .sb-trace <hr> follows the
     header (the component renders it, output-identical). */
  const rawHeader = readRaw('../src/components/ui/PageHeader.tsx');
  const traceOk = rawHeader.includes('trace?: boolean | "static"')
    && rawHeader.includes('className="sb-trace"')
    && rawHeader.includes('data-live={trace === true ? "true" : undefined}')
    && rawMsgs.includes('        trace\n      />')
    && rawAnalytics.includes('        trace\n      />')
    && rawAuto.includes('        trace\n      />')
    && !rawMsgs.includes('<hr className="sb-trace"')
    && !rawAnalytics.includes('<hr className="sb-trace"')
    && !rawAuto.includes('<hr className="sb-trace"');
  if (traceOk) pass += 1;
  else fails.push('r152d/r154 topbar trace: the live .sb-trace divider rides under the PageHeader on messages/analytics/autoreply via the component `trace` option (manual appends retired)');

  // (10) analytics: the pure-latin numeral displays ride .sb-numerals —
  //      the peak-hour clock (r152c) + the period-comparison change %.
  const analyticsNumOk = rawAnalytics.includes('sb-numerals font-heading text-[44px]')
    && rawAnalytics.includes('sb-numerals font-heading text-2xl font-bold tabular-nums');
  if (analyticsNumOk) pass += 1;
  else fails.push('r152d analytics: peak-hour + change% ride the .sb-numerals Grotesk register');
}

// ── §r154 — phase6 package 1: the SHARED PRIMITIVES speak the machine ──────
{
  /* Self-contained block (own raw readers): pins the P6-2-d1 primitive
     grammar — the robot states on the shared empty/loading/error states,
     the petrol circuit modal corners, the KpiCard petrol tone register,
     the opt-in .sb-trace-field form fields, the circuit table accents,
     the lime AI suggest register, the ChartCard trace accent and the
     solid-pastel warning wells. All additive/backward-compatible APIs. */
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const nc = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ');

  const rawGlobals4 = readRaw('../src/app/globals.css');
  const rawEmpty = readRaw('../src/components/ui/EmptyState.tsx');
  const rawSkeleton = readRaw('../src/components/ui/PageSkeleton.tsx');
  const rawDefError = readRaw('../src/components/shared/DefaultError.tsx');
  const rawDefLoading = readRaw('../src/components/shared/DefaultLoading.tsx');
  const rawKpi2 = readRaw('../src/components/shared/KpiCard.tsx');
  const rawSuggest2 = readRaw('../src/components/ai/AiSuggestDialog.tsx');
  const rawInput = readRaw('../src/components/ui/input.tsx');
  const rawTextarea = readRaw('../src/components/ui/textarea.tsx');
  const rawSelect = readRaw('../src/components/ui/select.tsx');
  const rawSwitch = readRaw('../src/components/ui/switch.tsx');
  const rawSortTh = readRaw('../src/components/ui/SortableTh.tsx');
  const rawPagin = readRaw('../src/components/shared/TablePagination.tsx');
  const rawChart2 = readRaw('../src/components/shared/ChartCard.tsx');
  const rawSetup = readRaw('../src/components/shared/SetupWarnings.tsx');
  const rawWebhook = readRaw('../src/components/shared/WebhookHealthBanner.tsx');
  const rawToast = readRaw('../src/lib/premium-toast.tsx');

  // (1) the shared state primitives host the ONE robot: EmptyState gains
  //     the robot prop (idle default on icon-less calls), ErrorState rides
  //     the error register, DefaultError keeps role=alert with the 56px
  //     error robot, DefaultLoading/PageSkeleton paint the thinking
  //     register (spinner retired).
  const robotStatesOk = rawEmpty.includes('robot?: boolean | RobotState')
    && rawEmpty.includes('<RobotMark state={robotState} className={cn(s.icon, iconClassName)} />')
    && rawEmpty.includes('robot="error"')
    && rawDefError.includes('<RobotMark state="error" className="size-14 shrink-0" aria-hidden={true} />')
    && rawDefError.includes('role="alert"')
    && rawDefLoading.includes('<RobotMark state="thinking" className="size-16" aria-hidden={true} />')
    && rawDefLoading.includes('role="status"')
    && rawSkeleton.includes('<RobotMark state="thinking" className="size-8 shrink-0" />')
    && !rawDefLoading.includes('animate-spin');
  if (robotStatesOk) pass += 1;
  else fails.push('r154 robot states: EmptyState/DefaultError/DefaultLoading/PageSkeleton host RobotMark (idle/error/thinking), spinner retired');

  // (2) the modal card wears the petrol circuit corners: teal signal trace
  //     with the lime live node (::before) + L corner brackets (::after);
  //     the gold-era copper gradient hairline is retired.
  const modalCornersOk = rawGlobals4.includes('.mdrk-modal-card::before')
    && rawGlobals4.includes('radial-gradient(2.5px 2.5px at 100% 50%, var(--c-lime-ink), transparent 100%)')
    && rawGlobals4.includes('radial-gradient(2.5px 2.5px at 0% 50%, var(--primary), transparent 100%)')
    && rawGlobals4.includes('.mdrk-modal-card::after')
    && rawGlobals4.includes('--modal-corner: color-mix(in srgb, var(--primary) 55%, transparent)')
    && rawGlobals4.includes('calc(100% - 18px) 0 / 12px 2px')
    && !nc(rawGlobals4).includes('background: linear-gradient(90deg, transparent, var(--primary), transparent);\n  border-radius: 0 0 3px 3px;');
  if (modalCornersOk) pass += 1;
  else fails.push('r154 modal corners: .mdrk-modal-card = teal trace + lime live node + circuit corner brackets (copper hairline retired)');

  // (3) KpiCard: the petrol tone register — signal/petrol/lime/foam ride
  //     the petrol families (signal = the teal accent default); the
  //     Madarek-era names stay honored as aliases (backward compatible).
  const kpiTonesOk = rawKpi2.includes("| 'signal' | 'petrol' | 'lime' | 'foam'")
    && rawKpi2.includes("signal:   'bg-(--c-copper-bg) text-(--c-copper-ink)")
    && rawKpi2.includes("petrol:   'bg-(--c-sand-bg) text-(--c-sand-ink)")
    && rawKpi2.includes("lime:     'bg-(--c-lime-bg) text-(--c-lime-ink)")
    && rawKpi2.includes("foam:     'bg-(--c-grey-bg) text-(--c-grey-ink)")
    && rawKpi2.includes("tone = 'signal'")
    && rawKpi2.includes('tone?: KpiTone');
  if (kpiTonesOk) pass += 1;
  else fails.push('r154 KpiCard tones: petrol semantics (signal/petrol/lime/foam) documented + Madarek names aliased');

  // (4) the opt-in circuit-board form ground: all four field primitives
  //     expose traceField (input/textarea/select/switch); the CSS paints
  //     the grid behind content (negative rung, isolated host).
  const traceFieldOk = rawGlobals4.includes('z-index: -1;') && rawGlobals4.includes('/* z-index: -1')
    && rawInput.includes('traceField?: boolean')
    && rawInput.includes('"sb-trace-field relative isolate"')
    && rawTextarea.includes('traceField?: boolean')
    && rawTextarea.includes('"sb-trace-field relative isolate"')
    && rawSelect.includes('traceField?: boolean')
    && rawSelect.includes('"sb-trace-field isolate"')
    && rawSwitch.includes('traceField?: boolean')
    && rawSwitch.includes('"sb-trace-field isolate"');
  if (traceFieldOk) pass += 1;
  else fails.push('r154 trace-field: input/textarea/select/switch expose the opt-in .sb-trace-field ground (isolated host, grid behind content)');

  // (5) circuit table accents: the ACTIVE sort column + the ACTIVE page
  //     ride the 2px teal hairline node (scaleY spring, zero layout shift);
  //     pagination numerals ride the mono/tabular register.
  const tableAccentsOk = rawSortTh.includes('after:bg-primary/70 after:transition-transform after:duration-(--t-slow) after:ease-spring-soft')
    && rawSortTh.includes('active && "after:scale-y-100 after:bg-primary text-accent-foreground"')
    && rawPagin.includes('after:bg-primary after:transition-transform after:duration-(--t-slow)')
    && rawPagin.includes('<span className="font-mono tabular-nums">{p}</span>')
    && rawPagin.includes('text-xs text-muted-foreground font-mono tabular-nums');
  if (tableAccentsOk) pass += 1;
  else fails.push('r154 table accents: SortableTh/TablePagination active controls carry the teal circuit node; pagination numerals mono/tabular');

  // (6) AI suggest: the lime register mirrors autoreply — sb-ai-chip on the
  //     intent chip, lime circuit nodes on the suggestion rows, lime hover.
  const suggestLimeOk = rawSuggest2.includes('<span className="sb-ai-chip">')
    && rawSuggest2.includes('bg-lime')
    && rawSuggest2.includes('hover:border-lime/40')
    && rawSuggest2.includes('text-lime shrink-0');
  if (suggestLimeOk) pass += 1;
  else fails.push('r154 AI suggest: intent chip = sb-ai-chip + lime row nodes + lime hover (the autoreply lime register)');

  // (7) ChartCard: the section-title rung + the CircuitTrace card accent.
  const chartAccentOk = rawChart2.includes('<h2 className="sb-section-title">{title}</h2>')
    && rawChart2.includes('<CircuitTrace className="mb-4 block h-1.5 w-full" />')
    && rawChart2.includes('text-accent-foreground" aria-hidden="true"');
  if (chartAccentOk) pass += 1;
  else fails.push('r154 ChartCard: sb-section-title header + CircuitTrace accent + teal icon tint');

  // (8) the warning wells ride the SOLID status pastels (the last
  //     translucent /8,/10 washes retire — the messages offline strip twin).
  const wellsOk = rawSetup.includes('"bg-destructive-soft border-destructive/30"')
    && rawSetup.includes('"bg-warning-soft border-warning/30"')
    && !rawSetup.includes('bg-destructive/8')
    && rawWebhook.includes('bg-warning-soft border-warning/30')
    && !rawWebhook.includes('bg-warning/10');
  if (wellsOk) pass += 1;
  else fails.push('r154 warning wells: SetupWarnings/WebhookHealthBanner ride the solid -soft grounds (translucent washes retired)');

  // (9) toast accents: the gift hairline rides the visible signal-teal lit
  //     grade (was the dark ink grade — near-invisible in dark mode).
  const toastAccentOk = rawToast.includes('hairline: "var(--c-copper-ink)"')
    && !rawToast.includes('hairline: "var(--accent-foreground)"');
  if (toastAccentOk) pass += 1;
  else fails.push('r154 toast accent: the gift hairline = var(--c-copper-ink) (the visible signal teal)');
}

// ── §r154b — phase6 package 2: the dashboard HOME speaks the machine ───────
{
  /* Self-contained block: pins the P6-2-d1 dashboard-home grammar — the
     topbar trace via the component option, the BotHealthCard robot state
     machine, the mono HH:MM reply stamps, the rules-table mono index
     register, and the chart's lime live node (chart lib untouched). */
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const rawHome = readRaw('../src/app/dashboard/page.tsx');

  // (1) the topbar trace rides the PageHeader option (the messages twin).
  const homeTraceOk = rawHome.includes('          compact\n          trace\n        />')
    && !rawHome.includes('<hr className="sb-trace"');
  if (homeTraceOk) pass += 1;
  else fails.push('r154b home trace: the topbar .sb-trace rides the PageHeader trace option on /dashboard');

  // (2) BotHealthCard: the ONE robot reports its own state — thinking while
  //     the live check is in flight, error on failure/critical, responding
  //     when healthy (the severity border + status line stay for AT).
  const botHealthOk = rawHome.includes('const robotState: RobotState = isFetching')
    && rawHome.includes('? "thinking"')
    && rawHome.includes('? "error"')
    && rawHome.includes(': "responding"')
    && rawHome.includes('<RobotMark state={robotState} className="size-9 shrink-0" aria-hidden={true} />')
    && rawHome.includes('<RobotMark state="thinking" className="size-9 shrink-0" aria-hidden={true} />')
    && rawHome.includes('<RobotMark state="error" className="size-9 shrink-0" aria-hidden={true} />');
  if (botHealthOk) pass += 1;
  else fails.push('r154b bot health: RobotMark state machine (thinking in flight / error / responding healthy) on the home card');

  // (3) the recent replies ride the chat register: mono HH:MM stamps
  //     (dir=ltr + tabular) with the full Arabic date in the title tooltip.
  const stampsOk = rawHome.includes('function timeStamp(')
    && rawHome.includes('className="font-mono text-[11px] mt-0.5 tabular-nums text-muted-foreground"')
    && rawHome.includes('title={r.created_at ? formatDate(r.created_at) : undefined}')
    && rawHome.includes('{stamp}');
  if (stampsOk) pass += 1;
  else fails.push('r154b reply stamps: mono HH:MM (dir=ltr) + Arabic date title tooltip on the home recent-replies list');

  // (4) the rules table rides the mono/tabular register: zero-padded index
  //     codes (presentation only — the data/logic untouched).
  const rulesNumeralsOk = rawHome.includes('dir="ltr" className="p-3 px-2 font-mono text-xs tabular-nums text-muted-foreground select-none"')
    && rawHome.includes('String(i + 1).padStart(2, "0")')
    && rawHome.includes('aria-label="رقم القاعدة"');
  if (rulesNumeralsOk) pass += 1;
  else fails.push('r154b rules table: mono zero-padded index column (the machine register)');

  // (5) the activity chart: the lime live node marks the series' newest edge
  //     (CircuitTrace live + the lime dot beside the newest date); the bars
  //     stay teal (the chart lib is untouched) and the date range is mono.
  const chartLiveOk = rawHome.includes('<CircuitTrace variant="live" className="mt-1.5 block h-1.5 w-full" />')
    && rawHome.includes('<span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />')
    && rawHome.includes('text-xs text-muted-foreground font-mono tabular-nums');
  if (chartLiveOk) pass += 1;
  else fails.push('r154b chart live node: CircuitTrace live + lime newest-edge dot + mono date range on the home activity chart');
}

// ── §r154c — phase6 package 3 (P6-2-d2): the AUTOMATION screens speak the ────
//    machine ─────────────────────────────────────────────────────────────────
{
  /* Self-contained block (own raw readers): pins the P6-2-d2 automation-screens
     grammar — the PageHeader trace across the six automation surfaces, the
     lime live nodes on in-flight broadcasts/campaigns/steps/days, the mono
     HH:MM schedule stamps (full Arabic date in the title), the sequence
     editor's circuit rail + machine delay codes, the petrol status chips,
     the traceField composer, the calendar month-grid route and the robot
     empty states. Business logic / API contracts untouched. */
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const rawBroadcast = readRaw('../src/app/dashboard/broadcast/page.tsx');
  const rawSequences = readRaw('../src/app/dashboard/sequences/page.tsx');
  const rawScheduled = readRaw('../src/app/dashboard/scheduled/page.tsx');
  const rawPosts = readRaw('../src/app/dashboard/posts/page.tsx');
  const rawCalendar = readRaw('../src/app/dashboard/calendar/page.tsx');
  const rawMarketing = readRaw('../src/app/dashboard/marketing/page.tsx');
  const rawComments = readRaw('../src/app/dashboard/comments/page.tsx');

  // (1) the six automation surfaces ride the PageHeader trace option (the
  //     machine-room signature; the manual per-page <hr> appends stay dead).
  const tracePagesOk = [
    rawBroadcast, rawSequences, rawScheduled, rawPosts, rawMarketing, rawComments,
  ].every((raw) => /(^|\n)[ \t]*trace[ \t]*(\n|$)/.test(raw) && !raw.includes('<hr className="sb-trace"'));
  if (tracePagesOk) pass += 1;
  else fails.push('r154c trace: the PageHeader trace option rides broadcast/sequences/scheduled/posts/marketing/comments (no manual <hr> appends)');

  // (2) the lime live node (automation-active) lights the in-flight rows:
  //     pending/scheduled/sending broadcasts, active sequences, the pending
  //     scheduled-posts, scheduled/sending campaigns and calendar days.
  const limeNodesOk = rawBroadcast.includes('LIVE_STATUSES.has(b.status ?? "")')
    && rawBroadcast.includes('rounded-full bg-lime me-1.5')
    && rawSequences.includes('s.status === "active" && (')
    && rawSequences.includes('rounded-full bg-lime shrink-0')
    && rawScheduled.includes('rounded-full bg-lime shrink-0')
    && rawMarketing.includes('(c.status === "scheduled" || c.status === "sending")')
    && rawCalendar.includes('rounded-full bg-lime shrink-0');
  if (limeNodesOk) pass += 1;
  else fails.push('r154c lime nodes: the live lime dot marks in-flight broadcasts/sequences/scheduled posts/campaigns and calendar days');

  // (3) the schedule stamps ride the chat register: local timeStamp helpers +
  //     mono HH:MM spans (dir=ltr, tabular) with the full Arabic date in the
  //     title tooltip on broadcast/scheduled/posts/comments.
  const stampsOk = rawBroadcast.includes('function timeStamp(')
    && rawScheduled.includes('function timeStamp(')
    && rawPosts.includes('function timeStamp(')
    && rawComments.includes('function timeStamp(')
    && [rawBroadcast, rawScheduled, rawPosts, rawComments].every((raw) =>
      raw.includes('className="font-mono tabular-nums"'));
  if (stampsOk) pass += 1;
  else fails.push('r154c mono stamps: HH:MM mono dir=ltr + Arabic date title on broadcast/scheduled/posts/comments rows');

  // (4) the sequence editor rides the CIRCUIT RAIL: a quiet teal hairline
  //     (primary/20) connects the step nodes (lime = automation-active,
  //     ring-punched off the card ground) — reorder/delete logic untouched.
  const railOk = rawSequences.includes('absolute start-[9px] top-8 bottom-8 w-px bg-primary/20')
    && rawSequences.includes('absolute start-[4px] top-[27px] size-2.5 rounded-full bg-lime ring-2 ring-background')
    && rawSequences.includes('p-3 ps-6 space-y-2');
  if (railOk) pass += 1;
  else fails.push('r154c sequence rail: teal hairline rail + lime step nodes on the sequences editor (reorder logic intact)');

  // (5) the step delays speak the machine voice: delayCode «+2d 06h» mono
  //     dir=ltr with the full Arabic delayLabel in the title, and the
  //     days/hours number inputs ride mono/tabular digits.
  const delayCodesOk = rawSequences.includes('function delayCode(')
    && rawSequences.includes('className="font-mono tabular-nums" title={delayLabel(st.days, st.hours)}')
    && (rawSequences.match(/className="font-mono tabular-nums"/g) || []).length >= 3;
  if (delayCodesOk) pass += 1;
  else fails.push('r154c delay codes: mono «+Nd NNh» step codes + mono delay inputs on the sequences editor');

  // (6) the sequence subscriber/sent counts ride the mono/tabular register
  //     (Arabic words fall per-glyph to the text face — presentation only).
  const seqCountsOk = rawSequences.includes('<span className="font-mono tabular-nums">')
    && rawSequences.includes('countPhrase(s.subscriber_count ?? 0');
  if (seqCountsOk) pass += 1;
  else fails.push('r154c sequence counts: subscriber/sent/step counters mono+tabular on the sequence cards');

  // (7) the status chips ride the PETROL register (KpiCard vocabulary):
  //     posts + marketing map published/sent = copper signal, scheduled/
  //     sending = lime automation, draft = foam grey.
  const petrolChipsOk = rawPosts.includes('bg-(--c-copper-bg) text-(--c-copper-ink)')
    && rawPosts.includes('bg-(--c-lime-bg) text-(--c-lime-ink)')
    && rawPosts.includes('bg-(--c-grey-bg) text-(--c-grey-ink)')
    && rawMarketing.includes('sent: "bg-(--c-copper-bg) text-(--c-copper-ink)"')
    && rawMarketing.includes('scheduled: "bg-(--c-lime-bg) text-(--c-lime-ink)"')
    && rawMarketing.includes('draft: "bg-(--c-grey-bg) text-(--c-grey-ink)"');
  if (petrolChipsOk) pass += 1;
  else fails.push('r154c petrol chips: posts/marketing status badges ride the KpiCard petrol tones (copper/lime/foam)');

  // (8) the scheduled composer rides the opt-in .sb-trace-field circuit
  //     ground (textarea + datetime input) and the audience estimates ride
  //     the .sb-numerals display register (broadcast confirm + marketing).
  const composerNumeralsOk = rawScheduled.includes('traceField')
    && rawBroadcast.includes('sb-numerals font-heading text-sm font-bold tabular-nums')
    && rawMarketing.includes('sb-numerals font-heading tabular-nums');
  if (composerNumeralsOk) pass += 1;
  else fails.push('r154c composer + estimates: traceField on the scheduled composer; .sb-numerals on the broadcast/marketing audience estimates');

  // (9) the calendar speaks the month-grid route: 7-column grid + weekday
  //     header, mono day codes (dir=ltr), teal today ring, lime node on
  //     scheduled days — the API/month navigation contract unchanged.
  const gridOk = rawCalendar.includes('buildMonthGrid(')
    && rawCalendar.includes('WEEKDAY_LABELS')
    && rawCalendar.includes('grid grid-cols-7')
    && rawCalendar.includes('border-primary/50 ring-1 ring-primary/30')
    && rawCalendar.includes('font-mono tabular-nums text-xs');
  if (gridOk) pass += 1;
  else fails.push('r154c calendar grid: month grid route — mono day codes, teal today ring, lime scheduled-day nodes');

  // (10) the automation empty states host the ONE robot (idle — on duty,
  //      waiting); the comments AI suggest glyph keeps the reserved lime.
  const robotsOk = [rawBroadcast, rawSequences, rawScheduled, rawCalendar, rawComments]
    .every((raw) => /(^|\n)[ \t]*robot[ \t]*(\n|$)/.test(raw))
    && rawComments.includes('text-lime');
  if (robotsOk) pass += 1;
  else fails.push('r154c robot empties: RobotMark hosts the empty wells on broadcast/sequences/scheduled/calendar/comments; comments AI glyph lime');
}

// ── §r154d — phase6 package 4 (P6-2-d3): the DATA/ACCOUNT screens speak the ──
//    machine ─────────────────────────────────────────────────────────────────
{
  /* Self-contained block (own raw readers): pins the P6-2-d3 data/account
     package grammar — the PageHeader trace across the fifteen remaining
     surfaces (static for account/data surfaces; LIVE for the 15s-polled
     activity log), the money register (.sb-numerals on billing + the payment
     dialog + the admin queue), the mono HH:MM stamps (billing/support/
     notifications/activity/admin queues), the payment-instruction trace
     stations, the petrol ticket/queue/level chips, the opt-in traceField
     forms, the robot empty wells, the lime live nodes (healthy webhook /
     active offers / broadcast targets / the cron heartbeat pulse) and the
     terms/privacy identity chrome. Business logic / API contracts untouched. */
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const rawBilling = readRaw('../src/app/dashboard/billing/page.tsx');
  const rawTeam = readRaw('../src/app/dashboard/team/page.tsx');
  const rawSettings = readRaw('../src/app/dashboard/settings/page.tsx');
  const rawSupport = readRaw('../src/app/dashboard/support/page.tsx');
  const rawPages = readRaw('../src/app/dashboard/pages/page.tsx');
  const rawAudience = readRaw('../src/app/dashboard/audience/page.tsx');
  const rawLeads = readRaw('../src/app/dashboard/leads/page.tsx');
  const rawAds = readRaw('../src/app/dashboard/ads/page.tsx');
  const rawTools = readRaw('../src/app/dashboard/tools/page.tsx');
  const rawReports = readRaw('../src/app/dashboard/reports/page.tsx');
  const rawNotifications = readRaw('../src/app/dashboard/notifications/page.tsx');
  const rawActivity = readRaw('../src/app/dashboard/activity/page.tsx');
  const rawAdmin = readRaw('../src/app/admin/page.tsx');
  const rawAdminSettings = readRaw('../src/app/admin/settings/page.tsx');
  const rawAdminSupport = readRaw('../src/app/admin/support/page.tsx');
  const rawAdminTelegram = readRaw('../src/app/admin/telegram/page.tsx');
  const rawTgConfig = readRaw('../src/app/admin/telegram/TelegramConfigSection.tsx');
  const rawTgTargets = readRaw('../src/app/admin/telegram/BroadcastTargetsSection.tsx');
  const rawTgDiag = readRaw('../src/app/admin/telegram/DiagnosticsSection.tsx');
  const rawPayment = readRaw('../src/components/shared/payment/index.tsx');
  const rawPayInstr = readRaw('../src/components/shared/payment/payment-instructions.tsx');
  const rawCron = readRaw('../src/components/shared/CronHeartbeatCard.tsx');
  const rawTerms = readRaw('../src/app/terms/page.tsx');
  const rawPrivacy = readRaw('../src/app/privacy/page.tsx');

  // (1) the fifteen remaining surfaces ride the PageHeader trace option —
  //     `trace="static"` on the account/data/admin surfaces (the lime live
  //     node is reserved for live streams), plain live `trace` on the
  //     15s-polled activity log; no manual <hr> appends anywhere.
  const traceStaticPages = [
    rawBilling, rawTeam, rawSettings, rawSupport, rawPages,
    rawAudience, rawLeads, rawAds, rawTools, rawReports, rawNotifications,
    rawAdmin, rawAdminSettings, rawAdminSupport, rawAdminTelegram,
  ];
  const tracePagesOk = traceStaticPages.every((raw) =>
      /(^|\n)[ \t]*trace="static"[ \t]*(\n|$)/.test(raw)
      && !raw.includes('<hr className="sb-trace"'))
    && /(^|\n)[ \t]*trace[ \t]*(\n|$)/.test(rawActivity)
    && !rawActivity.includes('<hr className="sb-trace"');
  if (tracePagesOk) pass += 1;
  else fails.push('r154d trace: the PageHeader trace option rides billing/team/settings/support/pages/audience/leads/ads/tools/reports/notifications (static) + the 4 admin surfaces + activity (live) — no manual <hr> appends');

  // (2) the money register: billing wallet + history amounts, the payment
  //     dialog figures and the admin queue amounts ride .sb-numerals.
  const moneyOk = rawBilling.includes('<p className="text-3xl font-bold sb-numerals">')
    && rawBilling.includes('<p className="text-sm font-medium sb-numerals">{formatNumber(p.amount)} د.ل</p>')
    && (rawPayment.match(/text-lg font-bold text-accent-foreground sb-numerals/g) || []).length >= 2
    && rawAdmin.includes('<td className="p-3 px-4 sb-numerals" data-label="المبلغ">');
  if (moneyOk) pass += 1;
  else fails.push('r154d money mono: billing balance/history + payment dialog figures + admin queue amounts ride .sb-numerals');

  // (3) the log registers: local timeStamp helpers + mono HH:MM stamps
  //     (dir=ltr, tabular) with the full Arabic date in the title tooltip
  //     on billing/support/notifications/activity and the two admin queues.
  const stampsOk = [rawBilling, rawSupport, rawNotifications, rawActivity, rawAdmin, rawAdminSupport]
    .every((raw) => raw.includes('function timeStamp(') && raw.includes('className="font-mono tabular-nums"'))
    && rawNotifications.includes('title={formatDate(n.created_at) || undefined}')
    && rawActivity.includes('title={formatDate(log.created_at) || undefined}')
    && rawSupport.includes('title={formatDate(t.created_at) || undefined}');
  if (stampsOk) pass += 1;
  else fails.push('r154d mono stamps: HH:MM mono dir=ltr + Arabic date title on billing/support/notifications/activity and the admin queues');

  // (4) the payment steps: the shared payment instructions carry the quiet
  //     circuit trace stations between the wallet/bank steps, and the
  //     provider reference code rides the mono/tabular register.
  const payStepsOk = (rawPayInstr.match(/<hr className="sb-trace" aria-hidden="true" \/>/g) || []).length >= 3
    && rawPayInstr.includes('font-bold text-lg tracking-wide font-mono tabular-nums');
  if (payStepsOk) pass += 1;
  else fails.push('r154d payment steps: sb-trace stations between the wallet/bank instruction steps + tabular provider reference code');

  // (5) the ticket chips ride the PETROL register (KpiCard vocabulary) on
  //     BOTH support surfaces: open=lime (in flight), pending=sand, closed=
  //     foam grey, resolved=signal copper — Badge secondary + className.
  const ticketChipsOk = rawSupport.includes('open: "bg-(--c-lime-bg) text-(--c-lime-ink)"')
    && rawSupport.includes('pending: "bg-(--c-sand-bg) text-(--c-sand-ink)"')
    && rawSupport.includes('closed: "bg-(--c-grey-bg) text-(--c-grey-ink)"')
    && rawSupport.includes('resolved: "bg-(--c-copper-bg) text-(--c-copper-ink)"')
    && rawAdminSupport.includes('open: "bg-(--c-lime-bg) text-(--c-lime-ink)"')
    && rawAdminSupport.includes('className={STATUS_PETROL[t.status] || undefined}');
  if (ticketChipsOk) pass += 1;
  else fails.push('r154d ticket petrol: open=lime / pending=sand / closed=foam / resolved=copper chips on dashboard+admin support queues');

  // (6) the account forms ride the opt-in traceField circuit ground:
  //     settings password pair, team invite username, admin settings machine
  //     fields (non-secret LTR), telegram chat-id/events/approver ids.
  const traceFormsOk = (rawSettings.match(/traceField/g) || []).length >= 2
    && rawTeam.includes('aria-label="اسم المستخدم للعضو الجديد"\n                traceField')
    && rawAdminSettings.includes('traceField={f.ltr && f.type !== "password"}')
    && (rawTgConfig.match(/traceField/g) || []).length >= 2
    && rawTgTargets.includes('traceField')
    && rawTgDiag.includes('traceField');
  if (traceFormsOk) pass += 1;
  else fails.push('r154d traceField forms: settings passwords + team username + admin config (non-secret) + telegram machine-code inputs ride the circuit ground');

  // (7) the account/data empty wells host the ONE robot (billing history,
  //     leads, ads — idle: on duty, waiting).
  const robotsOk = [rawBilling, rawLeads, rawAds]
    .every((raw) => /(^|\n)[ \t]*robot[ \t]*(\n|$)/.test(raw));
  if (robotsOk) pass += 1;
  else fails.push('r154d robot empties: RobotMark hosts the empty wells on billing/leads/ads');

  // (8) the lime live node marks live rows on the account surfaces: the
  //     healthy webhook (pages), the active offer (tools) and the active
  //     broadcast target (admin telegram).
  const limeNodesOk = rawPages.includes('<span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />')
    && rawTools.includes('<span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />')
    && rawTgTargets.includes('<span className="size-1.5 rounded-full bg-lime shrink-0" aria-hidden="true" />');
  if (limeNodesOk) pass += 1;
  else fails.push('r154d lime nodes: the live lime dot marks the healthy webhook, active offers and active telegram broadcast targets');

  // (9) the admin approvals queue: petrol chips (pending=lime, verified=
  //     signal copper, cancelled=rose), mono phone cell + HH:MM queue stamp,
  //     and the CronHeartbeatCard carries the live lime pulse node.
  const adminQueueOk = rawAdmin.includes('pending: "bg-(--c-lime-bg) text-(--c-lime-ink)"')
    && rawAdmin.includes('verified: "bg-(--c-copper-bg) text-(--c-copper-ink)"')
    && rawAdmin.includes('cancelled: "bg-(--c-rose-bg) text-(--c-rose-ink)"')
    && rawAdmin.includes('text-muted-foreground font-mono" data-label="رقم الهاتف"')
    && rawCron.includes('rounded-full bg-lime animate-ping');
  if (adminQueueOk) pass += 1;
  else fails.push('r154d admin statuses: queue petrol chips (pending lime/verified copper/cancelled rose) + mono phone + HH:MM stamp + the cron lime pulse');

  // (10) the data-table registers: audience commenter/subscriber counts ride
  //      .sb-numerals, the leads phone rides mono, the reports engine code
  //      is mono and the log levels ride petrol chips (info=copper,
  //      warning=amber family, error=rose).
  const dataRegistersOk = rawAudience.includes('text-muted-foreground sb-numerals')
    && rawAudience.includes('sb-numerals tabular-nums')
    && rawLeads.includes('<span className="font-mono" dir="ltr">{c.phone}</span>')
    && rawReports.includes('<span className="font-mono" dir="ltr">{pdfStatus.engine}</span>')
    && rawReports.includes('tabular-nums font-mono')
    && rawActivity.includes('info: "bg-(--c-copper-bg) text-(--c-copper-ink)"')
    && rawActivity.includes('warning: "bg-warning-soft text-warning-ink"')
    && rawActivity.includes('error: "bg-(--c-rose-bg) text-(--c-rose-ink)"');
  if (dataRegistersOk) pass += 1;
  else fails.push('r154d data registers: audience counts sb-numerals + leads phone mono + reports engine mono + activity petrol level chips');

  // (11) the account identity touches: the team owner chip rides the copper
  //      petrol stamp, the settings username rides mono, and the pages
  //      screen mirrors /connect (mono page_id + sb-numerals fan count).
  const identityOk = rawTeam.includes('bg-(--c-copper-bg) text-(--c-copper-ink) rounded-full px-2 py-0.5 font-medium')
    && rawSettings.includes('font-medium truncate font-mono" dir="ltr">{user.username}')
    && rawPages.includes('<span className="font-mono" dir="ltr">{data.page_id}</span>')
    && rawPages.includes('sb-numerals font-bold">{formatNumber(testResult.fan_count)}');
  if (identityOk) pass += 1;
  else fails.push('r154d identity: owner copper stamp + mono username + mono page_id + sb-numerals fan count');

  // (12) the legal pages get the identity chrome: the circuit trace divider
  //      under the display header on terms AND privacy (legal prose intact).
  const legalOk = [rawTerms, rawPrivacy].every((raw) =>
    raw.includes('<h1 className="text-3xl font-bold">')
    && raw.includes('<hr className="sb-trace mt-6 mb-8" aria-hidden="true" />'));
  if (legalOk) pass += 1;
  else fails.push('r154d legal chrome: the sb-trace divider rides under the display header on /terms and /privacy (prose verbatim)');
}

// ── §p6d4 — phase6 (P6-2-d4): the identity CLOSES — petrol rasters, SSOT docs ──
//    truth + the light-grade leftovers ─────────────────────────────────────────
{
  /* Self-contained block (own raw readers): pins the P6-2-d4 closure package —
     the conversation initials avatar re-graded per theme (.sb-initials: dark =
     the v15-E6 hue recipe, light = the petrol pastel of the SAME hue), the
     «مباشر» live label on the status-as-text -ink tier, the trace-field light
     grade that actually carries the circuit chrome on white, the sparkline
     area wash as a trend-color tint (the gold-hue oklch literal retired), and
     the SSOT docs telling the Circuit Petrol truth (MASTER + Arabic guide;
     the "Madarek wins" ruling retired with them). */
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const rawMessages = readRaw('../src/app/dashboard/messages/page.tsx');
  const rawSpark = readRaw('../src/components/shared/MiniSparkline.tsx');
  const rawGlobals = readRaw('../src/app/globals.css');
  const rawMaster = readRaw('../../../design-system/smartbot/MASTER.md');
  const rawGuide = readRaw('../../../docs/design-system.md');

  // (1) both messages avatar sites (conversation list + thread header) ride
  //     .sb-initials via the --sb-hue angle — the inline background hsl pair
  //     is gone; the globals class owns the dark grade (45%/32% + white,
  //     v15-E6) AND the light pastel grade (42%/90% wash + 24% ink).
  const initialsOk = (rawMessages.match(/sb-initials /g) || []).length >= 2
    && rawMessages.includes('"--sb-hue": ((conv.senders?.[0]?.name || "").length * 37) % 360')
    && rawMessages.includes('"--sb-hue": (threadIdentity.length * 37) % 360')
    && !rawMessages.includes('style={{ background: `hsl(')
    && rawGlobals.includes('.sb-initials {\n  background: hsl(var(--sb-hue) 45% 32%);\n  color: white;\n}')
    && rawGlobals.includes('html.light .sb-initials {\n  background: hsl(var(--sb-hue) 42% 90%);\n  color: hsl(var(--sb-hue) 45% 24%);\n}');
  if (initialsOk) pass += 1;
  else fails.push('p6d4 initials: both messages avatars ride .sb-initials (--sb-hue) — dark keeps the v15-E6 grade, light gets the petrol pastel of the same hue');

  // (2) the live «مباشر» label rides the status-as-text -ink tier (r131-F7
  //     fleet law) instead of generic muted grey — mint in dark, mint-deep
  //     (a petrol light grade) in light.
  const liveOk = rawMessages.includes('text-xs text-success-ink">مباشر');
  if (liveOk) pass += 1;
  else fails.push('p6d4 live badge: the «مباشر» label rides text-success-ink');

  // (3) the trace-field light grade actually carries the circuit chrome: the
  //     5% teal mix washed to nothing on white — light re-grades to a 12% mix
  //     at 70% opacity (dark keeps the quiet 5%/0.6 register).
  const traceLightOk = rawGlobals.includes('html.light .sb-trace-field::before {')
    && (rawGlobals.match(/color-mix\(in srgb, var\(--primary\) 12%, transparent\) 1px, transparent 1px\)/g) || []).length >= 2;
  if (traceLightOk) pass += 1;
  else fails.push('p6d4 trace-field light: the light grade re-mixes to 12% @ 0.7 so the trace chrome survives the mist ground');

  // (4) the sparkline area wash is a tint of the TREND color itself — the
  //     gold-hue oklch(0.72 0.14 75) top stop (a Madarek literal that
  //     survived every hex grep) is retired.
  const sparkOk = rawSpark.includes('<stop offset="0%" stopColor={trendColor} stopOpacity={0.25} />')
    && !rawSpark.includes('stopColor="oklch(');
  if (sparkOk) pass += 1;
  else fails.push('p6d4 sparkline: the area gradient rides trendColor tints — no gold-hue oklch literals');

  // (5) the SSOT docs tell the petrol truth: the MASTER constitution and the
  //     Arabic operational guide declare Circuit Petrol + the ONE raster
  //     generator; the "Madarek wins" ruling is retired.
  const docsOk = rawMaster.includes('# Design System Master File — SmartBot (Circuit Petrol)')
    && !rawMaster.includes('Madarek wins')
    && rawMaster.includes('p6-regen-brand.mjs')
    && rawGuide.includes('Circuit Petrol')
    && rawGuide.includes('p6-regen-brand.mjs')
    && !rawGuide.includes('مدارك (المرجع الكانوني');
  if (docsOk) pass += 1;
  else fails.push('p6d4 docs truth: MASTER.md + docs/design-system.md declare the Circuit Petrol SSOT (Madarek-wins ruling retired)');
}

// ── §p10a — phase10 (P10-1a): the chart INK contract — text is a text token ──
{
  /* Self-contained block (own raw readers): pins the P10-1a route-audit fix —
     recharts tick TEXT and hover cursors must ride the secondary-TEXT token
     (--muted-foreground, 8.07:1 dark / 8.19:1 light on card), never the
     SURFACE-2 fill token (--muted: #101115 dark / #E1E1DE light = 1.11:1 /
     1.24:1 on card — the analytics daily-trend axis labels were invisible in
     BOTH stages since v17-E-F10). Root fixed once in the two chart sources;
     the ActivityHeatmap zero-cell PIN keeps var(--muted) — a surface fill is
     the correct semantics there (guards the over-correction). */
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const nc = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rawTrend = nc(readRaw('../src/components/charts/TrendLineChart.tsx'));
  const rawCharts = nc(readRaw('../src/components/charts/index.tsx'));
  const rawHeat = nc(readRaw('../src/components/charts/ActivityHeatmap.tsx'));

  // (1) both recharts sources bind the tick/cursor ink to the TEXT token —
  //     the const, the tick fill and the tooltip cursor all speak
  //     --muted-foreground; a var(--muted) binding on text/cursor is banned.
  const chartInkOk = rawTrend.includes('const MUTED = "var(--muted-foreground)"')
    && rawTrend.includes('tick={{ fontSize: 10, fill: MUTED }}')
    && rawTrend.includes('cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}')
    && rawCharts.includes('const MUTED = "var(--muted-foreground)"')
    && rawCharts.includes('tick={{ fontSize: 10, fill: MUTED }}')
    && rawCharts.includes('cursor={{ fill: MUTED, opacity: 0.4 }}')
    && !rawTrend.includes('"var(--muted)"')
    && !rawCharts.includes('"var(--muted)"');
  if (chartInkOk) pass += 1;
  else fails.push('p10a chart ink: TrendLineChart + ActivityBarChart tick text/cursor ride var(--muted-foreground) (the text tier) — the surface token var(--muted) is banned as chart ink');

  // (2) the heatmap zero-cell keeps the SURFACE semantics: var(--muted) as
  //     backgroundColor is the honest "empty cell" ground (flips with the
  //     theme); only TEXT/cursor bindings moved to the ink tier.
  const heatSurfaceOk = rawHeat.includes('backgroundColor: count === 0 ? "var(--muted)" : cellMix(count, max)')
    && !rawHeat.includes('fill: "var(--muted)"');
  if (heatSurfaceOk) pass += 1;
  else fails.push('p10a heatmap surface: the zero-count cell keeps var(--muted) as backgroundColor (surface semantics — the ink fix must not leak here)');

  // (3) the tokens themselves carry the AA text contract in both stages —
  //     the ink tier resolves on card in both scopes (values from globals).
  pin(dark, 'p10a-chart-ink', '--muted-foreground', '#A7A8B0');
  pin(light, 'p10a-chart-ink', '--muted-foreground', '#41434B');
  pin(dark, 'p10a-chart-surface', '--muted', '#101115');
  pin(light, 'p10a-chart-surface', '--muted', '#E1E1DE');
}

// ── §p10a-bridge — phase10 (coordinator, family fix): the shadow namespace
// bridge — Tailwind v4 shadow-* utilities resolve the --shadow-* THEME
// namespace at build time, never the :root var, so every plain shadow-sm
// (32 SB sites) rode the engine default (10% black, both stages —
// rendered-proven on a login card in dark). The 4 tier keys must stay
// registered in @theme inline so utilities inline var(--elev-N) and the
// :root(night)/.light(mist) flip governs. ─────────────────────────────────
{
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const g = readRaw('../src/app/globals.css');
  const bridgeOk = ['--shadow-sm: var(--elev-1);', '--shadow-md: var(--elev-2);',
    '--shadow-lg: var(--elev-3);', '--shadow-xl: var(--elev-4);']
    .every(k => g.includes(k)) && /@theme inline[\s\S]{0,12000}--shadow-sm: var\(--elev-1\)/.test(g);
  if (bridgeOk) pass += 1;
  else fails.push('p10a shadow bridge: the --shadow-* THEME namespace is registered in @theme inline (sm/md/lg/xl → var(--elev-N)) — removing it silently reverts every plain shadow-* utility to the engine default in BOTH stages');
}

// ── §P15 → §P16-A — CONCEPT A: the CHARACTER-LED cinematic hero ──────────
// The owner rejected the P12-2c hero (cropped side-column bust, world below
// the fold, IO-gated chat below the fold, three pasted layers). Concept A
// re-composed the hero around ONE protagonist (P15: the primitives robot);
// the P16 owner's primitives rejection re-anchors the block on the AUTHORED
// GLB character: the full-figure machine on a visible stage inside the
// first viewport, the console/status island under the transparent canvas,
// the Arabic display headline bottom-anchored, the sink-and-fade scroll
// exit, and the heroBus beat channel (the character reacts to the honest
// scenario engine). Honesty pins (6) below are UNCHANGED — the demo cycle,
// the published plan digits, the sr-only announcer survive every concept.
// This block pins that contract.
{
  const readRaw = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const nc = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rawHeroTicker = readRaw('../src/components/landing/HeroTicker.tsx');
  const rawHeroExit = readRaw('../src/components/landing/HeroExit.tsx');
  const rawLanding = readRaw('../src/app/landing.css');
  const rawPage = readRaw('../src/app/page.tsx');

  // (1) the retirement is REAL — the retired hero files are gone and
  //     nothing under src imports them (P16-A adds the primitives
  //     RobotScene to the retired list — the authored GLB CharacterScene
  //     replaces it; dead-but-pinned era is over).
  const retired = [
    '../src/components/landing/BotChatSimulator.tsx',
    '../src/components/landing/HeroCompanion.tsx',
    '../src/components/landing/OrbitScene.tsx',
    '../src/components/landing/HeroDepthLayer.tsx',
    '../src/components/landing/RobotScene.tsx',
  ];
  const retiredOk = retired.every((f) => {
    try { readFileSync(new URL(f, import.meta.url), 'utf8'); return false; }
    catch { return true; }
  });
  if (retiredOk) pass += 1;
  else fails.push('P16-A retirement: BotChatSimulator/HeroCompanion/OrbitScene/HeroDepthLayer/RobotScene(primitives) must be DELETED (retired with the character-led rebuilds)');

  // (2) the composition tokens (P16-A re-anchored for the authored
  //     character) — the layout owns the framing, the scene's solver
  //     obeys: --sb-fig (figure share) 0.76 + --sb-floor (floor line
  //     fraction) 0.84 on the desktop hero (figure ≈62% of the viewport,
  //     head near the vertical midline); the character-first mobile
  //     stack re-poses (fig 1.3 / floor 1.35 — the P17 bust close-up in a 41svh box).
  {
    const heroRobot = parseDecls(landingBlocks.find((x) => x.prelude === '.landing .ln-hero-robot')?.body ?? '');
    if (norm(resolve(landingCascade, heroRobot['--sb-fig'] ?? '')) === '0.76') pass += 1;
    else fails.push(`P16-A-tokens --sb-fig: expected 0.76 (the figure's host share), got ${heroRobot['--sb-fig'] ?? '<missing>'}`);
    if (norm(resolve(landingCascade, heroRobot['--sb-floor'] ?? '')) === '0.84') pass += 1;
    else fails.push(`P16-A-tokens --sb-floor: expected 0.84 (the floor line fraction), got ${heroRobot['--sb-floor'] ?? '<missing>'}`);
  }
  {
    /* P18-W5 re-anchor: the final VLM audit grounded the mobile bust —
       fig 1.3→1.24, floor 1.35→1.18 (the pedestal ring peeks in). Same
       pose law (bust close-up, >1 crop), re-pinned values. */
    const mobileRe = /@media \(max-width: 1024px\)[^@]*?--sb-fig: 1\.24;[^@]*?--sb-floor: 1\.18;/s;
    if (mobileRe.test(rawLanding)) pass += 1;
    else fails.push('P17/P18 mobile pose: the ≤1024px character-first stack must re-pose the figure (--sb-fig 1.24 / --sb-floor 1.18 — grounded bust close-up)');
  }

  // (3) ONE composed viewport: desktop hero = 100svh minus the sticky
  //     chrome (73px header + hairline) — the full figure + pedestal +
  //     CTA foot fit the first paint; the machine layer sits ABOVE the
  //     interface island (z1 over z0 — the body physically anchors the
  //     boxes), the copy above both (z3).
  {
    const desk = landingBlocks.find((x) => x.prelude === '@media (min-width: 1025px)');
    const heroRule = desk ? nestedBlock(desk.body, '.landing .ln-hero-robot') : null;
    const bs = heroRule ? declOf(heroRule, 'block-size') : undefined;
    if (bs !== undefined && norm(bs) === 'calc(100svh - 74px)') pass += 1;
    else fails.push(`P15 hero height: ≥1025px .ln-hero-robot block-size must be calc(100svh - 74px) (got ${bs ?? '<missing>'})`);
    const mbs = heroRule ? declOf(heroRule, 'min-block-size') : undefined;
    if (mbs === '620px') pass += 1;
    else fails.push(`P15 hero floor: ≥1025px min-block-size 620px (got ${mbs ?? '<missing>'})`);
  }
  pinDecl('P15-layers', '.landing .ln-robot-stage', 'z-index', '1');
  pinDecl('P15-layers', '.landing .ln-robot-stage', 'pointer-events', 'none');
  {
    const desk = landingBlocks.find((x) => x.prelude === '@media (min-width: 1025px)');
    const island = desk ? nestedBlock(desk.body, '.landing .ln-ticker-island') : null;
    const z = island ? declOf(island, 'z-index') : undefined;
    if (z === '0') pass += 1;
    else fails.push(`P15 island: the ticker/status island must be the z0 layer UNDER the machine (got z=${z ?? '<missing>'})`);
    const copy = desk ? nestedBlock(desk.body, '.landing .ln-hero-copy') : null;
    const zc = copy ? declOf(copy, 'z-index') : undefined;
    if (zc === '3') pass += 1;
    else fails.push(`P15 copy: the display block must sit above the machine (z3, got ${zc ?? '<missing>'})`);
    const cm = copy ? declOf(copy, 'max-inline-size') : undefined;
    /* P18-W2-a re-anchor (the asymmetric scene): 70vw → 44vw — the
     * display lockup owns the INLINE-START column (the figure owns
     * inline-end); the measure stays vw-coupled to the 4.4vw display
     * scale (9.7em lockup lines × 4.4vw = 2 lines in 44vw — same
     * wrap-margin law, the column-proportioned rung) */
    if (cm === '44vw') pass += 1;
    else fails.push(`P15 copy measure: the display block must ride the vw-coupled 44vw inline-start column measure (2-line lockup, got ${cm ?? '<missing>'})`);
  }

  // (4) the Arabic display headline — the P1 font-failure fix: IBM Plex
  //     Sans Arabic (var(--font-arabic)) FIRST at 700 on the display
  //     scale, tight display leading, TWO oversized lines exactly (P18-W2-a
  //     re-anchor: the copy block's 44vw inline-start column measure is
  //     vw-coupled to the 4.4vw display scale — the 9.7em lockup lines
  //     can never wrap into the ticker's band, and never cross the
  //     inline-end figure band). Space Grotesk never renders the headline
  //     (it has no Arabic glyphs) — Latin stays in the mono eyebrow.
  pinDecl('P15-display', '.landing .ln-hero-robot .ln-hero-title', 'font-family', 'var(--font-arabic)');
  /* P18-W2-a re-anchor: the poster scale is column-proportioned, not
   * viewport-wide (clamp 3.2-5.5rem @7vw → 2.6-4.3rem @4.4vw — the
   * asymmetric column's display rung) */
  pinDecl('P15-display', '.landing .ln-hero-robot .ln-hero-title', 'font-size', 'clamp(2.6rem, 4.4vw, 4.3rem)');
  pinDecl('P15-display', '.landing .ln-hero-robot .ln-hero-title', 'line-height', '1.14');
  pinDecl('P15-display', '.landing .ln-hero-robot .ln-hero-title', 'font-weight', 'var(--fw-bold)');
  {
    const titleRule = landingBlocks.find((x) => x.prelude === '.landing .ln-hero-robot .ln-hero-title');
    if (titleRule && !/grotesk/i.test(titleRule.body)) pass += 1;
    else fails.push('P15 display face: the h1 stack must not reach for Space Grotesk (no Arabic glyphs — the silent body-grade fallback was the P1 defect)');
  }
  // the eyebrow: tracked Latin caps + untracked Arabic (the tracking law)
  pinDecl('P15-eyebrow', '.landing .ln-eyebrow-latin', 'letter-spacing', '0.16em');
  pinDecl('P15-eyebrow', '.landing .ln-eyebrow-ar', 'letter-spacing', '0');

  // (5) the ticker box — the ChainGPT framing grammar: 1px hairline +
  //     bracket corners OUTSIDE (negative offsets), mono head + the
  //     DEMO badge + scenario index, the beat body height-stable (the
  //     word-by-word typing never reflows the island).
  pinDecl('P15-ticker', '.landing .ln-ticker', 'border', '1px solid var(--ln-line)');
  pinDecl('P15-ticker', '.landing .ln-ticker-beat', 'min-block-size', '5.4em');
  pinDecl('P15-ticker-corner', '.landing .ln-ticker-corner.c-a', 'inset-block-start', '-5px');
  pinDecl('P15-ticker-corner', '.landing .ln-ticker-corner.c-a', 'inset-inline-start', '-5px');
  // the status panel (P18-W2-a re-anchor — the W1-a defect fix: the
  //     bare spine list measured pixel-avg 11,11,12 on the desktop void
  //     = near-invisible): the panel is now the WIREFRAME INSTRUMENT BOX
  //     — the ticker's own grammar (full hairline box + ink wash) and
  //     resting rows lifted 0.55 → 0.75 so they hold real presence on
  //     the void; the synced active row stays cream
  pinDecl('P15-status', '.landing .ln-status', 'border', '1px solid var(--ln-line)');
  pinDecl('P15-status', '.landing .ln-status li', 'color', 'rgb(244 244 246 / 0.75)');
  pinDecl('P15-status', '.landing .ln-status li[data-active=\'true\']', 'color', 'var(--ln-cream)');

  // (6) the ticker island (source contract, 2-e: B's scenario engine) —
  //     the honest DEMO cycle: three scenarios (price/booking/complaint)
  //     whose ONLY digits are the product's own published plan terms
  //     (100 رد/شهر on the free rung, 19 د.ل the first paid rung — the
  //     DB seed + pricing page carry the same figures); never invented
  //     metrics or fabricated customers. ONE scenario stage machine
  //     (memoized script, STAGE_MS/RESET_MS beats) drives the beat body
  //     + the status rows + the mobile line; the reply types word by
  //     word; aria-live polite; RM composes ONE static frame (reply
  //     beat, fully typed); IO + hidden-tab pause.
  {
    const scenarios = rawHeroTicker.slice(
      rawHeroTicker.indexOf('const SCENARIOS'),
      rawHeroTicker.indexOf('/* ── the stage script'),
    );
    const honestDigits = /100 رد/.test(scenarios) && /19 د\.ل/.test(scenarios)
      && !/\d+\s*(%|k|ألف|مليون)/.test(scenarios);
    if (honestDigits) pass += 1;
    else fails.push('P15 ticker honesty: the scenario digits must be the product\'s own published plan terms (100 رد/شهر، 19 د.ل) — never fabricated metrics');
    const synced = rawHeroTicker.includes('STAGE_MS')
      && rawHeroTicker.includes('RESET_MS')
      && rawHeroTicker.includes('REPLY_WORD_MS')
      && rawHeroTicker.includes('useMemo')
      && rawHeroTicker.includes('aria-live="polite"')
      && rawHeroTicker.includes("window.matchMedia('(prefers-reduced-motion: reduce)')");
    if (synced) pass += 1;
    else fails.push('P15 ticker sync: ONE scenario stage machine (STAGE_MS/RESET_MS, memoized script) drives the beat + status rows + mobile line, aria-live polite, RM static');
    const sr = rawHeroTicker.includes('className="sr-only"')
      && rawHeroTicker.includes('ليست بيانات عملاء حقيقيين');
    if (sr) pass += 1;
    else fails.push('P15 ticker sr: the sr-only announcer narrates each beat once + the honesty line (ليست بيانات عملاء حقيقيين)');
  }

  // (7) the sink-and-fade exit (source contract) — compositor verbs only,
  //     rAF-gated passive scroll, listener removed on unmount, RM never arms.
  {
    const exitOk = rawHeroExit.includes('EXIT_SPAN_VH = 0.72')
      && rawHeroExit.includes('EXIT_SINK_PX = 96')
      && rawHeroExit.includes('passive: true')
      && rawHeroExit.includes('cancelAnimationFrame')
      && rawHeroExit.includes('window.removeEventListener')
      && rawHeroExit.includes("matchMedia('(prefers-reduced-motion: reduce)').matches");
    if (exitOk) pass += 1;
    else fails.push('P15 exit: HeroExit = translateY+opacity only, rAF-gated passive scroll, RM never arms, cleanup intact');
  }

  // (8) the character scene (P16-A source contract, re-anchored from the
  //     primitives RobotScene; P18-W2-a re-anchored again onto the
  //     procedural OBELISK build) — the framing solver reads the layout
  //     tokens with clamps, the pause family (IO + visibility), the
  //     disposal sweep, the RM static pose, the pointer-tracking gate,
  //     AND the P18-W2-a character contract: the fully procedural
  //     BufferGeometry build (no loader on the critical path — the
  //     retired GLB stays on disk for provenance, never fetched) + the
  //     art-directed SVG fallback (WebGL failure ≠ broken canvas).
  {
    const rawRobot = readRaw('../src/components/landing/CharacterScene.tsx');
    const solverOk = rawRobot.includes('getPropertyValue(\'--sb-fig\'')
      && rawRobot.includes('getPropertyValue(\'--sb-floor\'')
      && rawRobot.includes(', 0.3), 1.6') && rawRobot.includes(', 0.5), 1.8');
    if (solverOk) pass += 1;
    else fails.push('P17 solver: the scene camera must read --sb-fig/--sb-floor off the host (clamped 0.3-1.6 / 0.5-1.8 — bust-capable) — the layout owns the composition');
    const pauseOk = rawRobot.includes('IntersectionObserver')
      && rawRobot.includes('visibilitychange')
      && rawRobot.includes('renderer.dispose()')
      && rawRobot.includes("for (const g of geometries) g.dispose()")
      && rawRobot.includes("for (const m of materials) m.dispose()");
    if (pauseOk) pass += 1;
    else fails.push('P16-A scene lifecycle: IO pause + visibilitychange pause + full geometry/material/renderer disposal (GLB geometries included)');
    const rmOk = rawRobot.includes('one static posed frame')
      && /\} else \{\s*raf = requestAnimationFrame\(frameLoop\);/.test(rawRobot);
    if (rmOk) pass += 1;
    else fails.push('P16-A scene RM: reduced-motion = one static posed frame, no rAF');
    const trackOk = rawRobot.includes("matchMedia('(pointer: fine)')")
      && rawRobot.includes('degToRad(25)') && rawRobot.includes('degToRad(12)');
    if (trackOk) pass += 1;
    else fails.push('P16-A tracking: pointer-follow gated on (pointer: fine), head ±25°/±12°');
    /* P18-W2-a re-anchor (the §2.1/§2.2 rebuild): the GLB protagonist is
     * SUPERSEDED by the fully procedural character — authored
     * BufferGeometry, zero loader bytes on the critical path (the
     * GLTFLoader import itself must be ABSENT; the retired GLB file
     * stays on disk for provenance — see 8c). The fallback contract is
     * unchanged: the WebGL probe gates the renderer, setFailed(true)
     * renders the art-directed SVG frame — never a broken canvas. */
    const glbOk = !rawRobot.includes("import('three/examples/jsm/loaders/GLTFLoader.js')")
      && rawRobot.includes('new BufferGeometry()')
      && rawRobot.includes("getContext('webgl2')")
      && rawRobot.includes('setFailed(true)');
    if (glbOk) pass += 1;
    else fails.push('P18-W2-a procedural character: authored BufferGeometry build, NO GLTFLoader on the critical path (GLB retired, provenance-only), WebGL probe → setFailed(true) → art-directed SVG frame (never a broken canvas)');
  }

  // (8b) the heroBus beat channel (P16-A) — the honest scenario engine
  //      (HeroTicker) DISPATCHES each beat; the character scene
  //      SUBSCRIBES + adopts the in-flight beat on late mount (the GLB
  //      loads after the ticker may have advanced). The character reacts
  //      to the conversation it is having: the aliveness layer on top of
  //      the honesty engine (which stays untouched — same stages, same
  //      digits, same announcer).
  {
    const rawBus = readRaw('../src/components/landing/heroBus.ts');
    const rawChar = readRaw('../src/components/landing/CharacterScene.tsx');
    const busOk = rawBus.includes("export const HERO_BEAT_EVENT = 'smartbot:hero-beat'")
      && rawBus.includes('export function dispatchHeroBeat')
      && rawBus.includes('export function lastHeroBeat')
      && rawBus.includes('export function subscribeHeroBeat')
      && rawHeroTicker.includes("import { dispatchHeroBeat } from './heroBus'")
      && rawHeroTicker.includes('dispatchHeroBeat({ beat, scenarioId: scenario.id })')
      && rawChar.includes("import { subscribeHeroBeat, lastHeroBeat, type HeroBeat, type HeroBeatDetail } from './heroBus'");
    if (busOk) pass += 1;
    else fails.push('P16-A heroBus: HeroTicker dispatches the beat; CharacterScene subscribes + adopts the in-flight beat (dispatch → subscribe, no import cycle)');
  }

  // (8c) the GLB asset + its cache contract (P16-A) — public/models is
  //      served verbatim; BOTH the config headers AND the middleware
  //      immutable rule must carry the 1y cache (the page default is
  //      no-store — without these the protagonist re-downloads every
  //      navigation; middleware wins precedence, so both halves matter).
  //      P18-W2-a: the GLB is provenance-only now (never fetched by the
  //      scene) but stays served + cached — the contract stands.
  {
    let glbExists = false;
    try { readFileSync(new URL('../public/models/smartbot-character.glb', import.meta.url)); glbExists = true; }
    catch { /* absent */ }
    const rawNext = readRaw('../next.config.ts');
    const rawMw = readRaw('../middleware.ts');
    const mwPrefixes = rawMw.slice(rawMw.indexOf('publicPrefixes'), rawMw.indexOf(']', rawMw.indexOf('publicPrefixes')));
    const cacheOk = glbExists
      && (rawNext.includes('source: \'/models/:path*\'') || rawNext.includes('source: "/models/:path*"'))
      && rawMw.includes('MODEL_FILE_RE')
      && mwPrefixes.includes('"/models"');
    if (cacheOk) pass += 1;
    else fails.push('P16-A GLB cache: public/models/smartbot-character.glb must exist + /models/:path* immutable in next.config headers AND middleware (publicPrefixes + MODEL_FILE_RE)');
  }

  // (9) the page composes the scene (P16-A source pins) — the server
  //     component paints h1/sub inline (LCP doctrine), mounts the
  //     exit-wrapped canvas island + ticker, the glow/vignette CSS halves
  //     (the decorative circuit traces were RETIRED with the primitives
  //     robot — the character's ONE emissive edge strip is the light
  //     signature now), and the honest CTA pair.
  {
    const pageOk = rawPage.includes('<HeroTicker />')
      && rawPage.includes('<HeroExit>')
      && rawPage.includes('className="ln-robot-glow"')
      && rawPage.includes('className="ln-robot-vignette"')
      && rawPage.includes('className="ln-robot-canvas"')
      && rawPage.includes('<MagneticGoldLink href="/subscribe" xl withArrow')
      && rawPage.includes('<Link href="/demo" className="ln-btn-ghost">')
      && rawPage.includes('تعرّف على');
    if (pageOk) pass += 1;
    else fails.push('P16-A page: hero = exit-wrapped character layer + glow/vignette + canvas mount + ticker + honest CTA pair (h1 inline)');
  }

  // (10) the mobile stack (P16-A: ≤1024px character-first, its OWN
  //      composition) — the CHARACTER first (62svh stage, never a cropped
  //      head; the one-line console + compact status carry the side
  //      panel's truth) → copy → CTA foot.
  {
    const mobs = landingBlocks.filter((x) => x.prelude === '@media (max-width: 1024px)');
    const mob = mobs.find((m) => m.body.includes('.ln-robot-stage')) ?? mobs[mobs.length - 1];
    const stage = mob ? nestedBlock(mob.body, '.landing .ln-robot-stage') : null;
    const bs = stage ? declOf(stage, 'block-size') : undefined;
    // P17 re-anchor: 56svh → 41svh + the bust crop — the CTA returns to the fold
    // port from Concept B) added ~86px to the mobile stack; the stage
    // breathes so the h1 lockup returns in-fold (measured 815/844) with
    // the CTA within the disclosed protagonist-discipline gesture budget.
    // The figure fractions (0.92/0.94, pinned above) are UNCHANGED.
    if (bs === '41svh') pass += 1;
    else fails.push(`P17 mobile stage: the ≤1024px character box must be 41svh (bust close-up, got ${bs ?? '<missing>'})`);
    const statusLine = mob ? nestedBlock(mob.body, '.landing .ln-ticker-status') : null;
    if (statusLine && /display\s*:\s*flex/.test(statusLine)) pass += 1;
    else fails.push('P16-A mobile status: the console\'s compact status line must switch ON at ≤1024px (the side panel\'s mobile twin)');
    const island = mob ? nestedBlock(mob.body, '.landing .ln-ticker-island') : null;
    if (island && /display\s*:\s*contents/.test(island)) pass += 1;
    else fails.push('P16-A mobile island: display:contents — the ticker becomes a flow item of the stack');
    const msg = mob ? nestedBlock(mob.body, '.landing .ln-ticker-msg') : null;
    if (msg && /white-space\s*:\s*nowrap/.test(msg)) pass += 1;
    else fails.push('P16-A mobile console: the ticker body collapses to ONE line (ellipsis; the sr-only announcer narrates it whole)');
  }

  // (11) the character layer's light twins exist (the mist stage composes
  //      the same scene: ticker plate, corners, glow, vignette, hero bg).
  {
    const twinsOk = rawLanding.includes('html.light .landing .ln-ticker {')
      && rawLanding.includes('html.light .landing .ln-ticker-corner')
      && rawLanding.includes('html.light .landing .ln-robot-glow')
      && rawLanding.includes('html.light .landing .ln-robot-vignette')
      && rawLanding.includes('html.light .landing .ln-hero-robot');
    if (twinsOk) pass += 1;
    else fails.push('P16-A light twins: the character layer + composition need their §19a/§20d mist twins (theme toggle repaints the scene)');
  }
}

// ── §P18-W4-b — the two THIN surfaces go deep (API-contract-verified) ────────
{
  /* Self-contained block (own raw readers): pins the W1-a priorities #7-8
     build-out. The ads page leaves "accounts list only" behind — the account
     rows expand into the REAL campaign/ad read endpoints
     (facebook_routes.py:1234-1275, DB re-serve of the exact Graph dicts:
     status/objective/created_time + nested adsets; creative + insights
     metrics). The settings page leaves "profile+password only" behind with
     the surfaces that ARE real: notification preferences (GET/PUT
     /api/notifications/settings — the shared ["notification-settings"] cache
     key with the notifications page) and the webhook health display
     (GET /api/webhook/check). Honesty pins ride along: the ads surface is
     READ-ONLY because the backend has ZERO ads write endpoints (no create/
     pause/resume routes — the ads_management/app-review gap is stated in the
     page, not faked with dead controls), and settings renders no session/
     token management (auth.py has no such routes — documented gap). */
  const readSrc = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const rawAds = readSrc('../src/app/dashboard/ads/page.tsx');
  const rawSettings = readSrc('../src/app/dashboard/settings/page.tsx');

  // (1) the ads page consumes the REAL read endpoints — each account row
  //     expands into GET /api/ads/campaigns/{id} + GET /api/ads/ads/{id}
  //     under their own react-query keys.
  const adsReadsOk = rawAds.includes('`/api/ads/campaigns/${')
    && rawAds.includes('`/api/ads/ads/${')
    && rawAds.includes('queryKey: ["ads-campaigns", accountId]')
    && rawAds.includes('queryKey: ["ads-items", accountId]');
  if (adsReadsOk) pass += 1;
  else fails.push('P18-W4-b ads reads: the account expansion consumes GET /api/ads/campaigns|ads/{id} (react-query keys ads-campaigns/ads-items)');

  // (2) the ads surface is READ-ONLY by backend truth: zero write calls in
  //     the page source AND the honest ads_management/app-review gap notice
  //     (never fake controls against endpoints that do not exist).
  const adsReadOnlyOk = !/method:\s*["'](POST|PUT|PATCH|DELETE)["']/.test(rawAds)
    && rawAds.includes('عرض الحملات فعّال — التحكم بها قريباً');
  if (adsReadOnlyOk) pass += 1;
  else fails.push('P18-W4-b ads honesty: read-only surface (no write methods in source) + the ads_management gap notice');

  // (3) the settings sections ride REAL contracts: the notification
  //     preferences (GET/PUT + the SHARED cache key — one entry serves both
  //     the notifications page and settings) + the webhook health display
  //     + the Arabic/RTL display card.
  const settingsRealOk = rawSettings.includes('/api/notifications/settings')
    && rawSettings.includes('queryKey: ["notification-settings"]')
    && rawSettings.includes('/api/webhook/check')
    && rawSettings.includes('من اليمين إلى اليسار (RTL)');
  if (settingsRealOk) pass += 1;
  else fails.push('P18-W4-b settings sections: prefs (GET/PUT /api/notifications/settings, shared query key) + webhook check display + RTL card');

  // (4) no fake surfaces: settings stays free of session/token-management
  //     calls (no endpoints exist — a documented gap, never a dead UI).
  const settingsNoFakeOk = !rawSettings.includes('/api/sessions')
    && !rawSettings.includes('/api/tokens');
  if (settingsNoFakeOk) pass += 1;
  else fails.push('P18-W4-b settings honesty: no session/token management calls (no backend endpoints — documented gap only)');
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(fails.length === 0
  ? `✓ Machine Instrument parity snapshot: ${pass} assertions passed (globals.css product tokens + landing.css instrument layer == the phase17 contract + the character-led cinematic hero composition)`
  : `✗ Machine Instrument parity DRIFT: ${fails.length} failure(s) of ${pass + fails.length}:\n  - ` + fails.join('\n  - '));
process.exit(fails.length === 0 ? 0 : 1);
