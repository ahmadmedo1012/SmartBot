'use client';

/* r129 — FAITHFUL PORT of the Madarek OrbitScene (madarek@cf7ffca,
 * src/components/landing/OrbitScene.tsx, 635 lines) per the r129 port
 * spec: every constant, formula and pause guard is byte-identical
 * (omega stays rad/ms, DPR cap 1.5, dt clamp 48ms, intro bloom 1400ms,
 * TRAIL_MAX 16, parallax ±7/6 + ±13/10, magnetism 170→14px, scroll fade
 * floor 0.45, IO '80px 0px' + visibilitychange, RM = one drawStatic
 * frame with no live listener, mouse smoother inside the event rAF —
 * intentional, do not "fix"). Next.js adaptations ONLY: the 'use client'
 * directive above (every window/document/navigator access lives inside
 * the effect, so SSR emits a bare <canvas aria-hidden>). The
 * returning-visitor calm (sessionStorage 'smartbot.intro.seen' →
 * .landing[data-intro-seen]) lives in LandingStage, the page-level
 * client wrapper — mirroring where Madarek's LandingPage owns it. */

import { useEffect, useRef, useState } from 'react';

/**
 * OrbitScene — «مدارات المعرفة» canvas engine (Orbit Ink edition).
 *
 * A calm, flat orbital system over the hero's solid ink ground:
 * knowledge nodes ride thin cream hairline rings, and a lime
 * "traveller" (the learner) moves between orbits leaving a fading
 * thread. Light comes from contrast, not glow — the round-3 craft.
 *
 * ── Craft contract (docs/immersive-redesign-plan.md §5 +
 *    round-3 REFERENCE-DESIGN-SPEC §4.4) ─────────────────────────
 * · Final visual diet (round-3 VLM verdict vs the reference + premium-
 *   polish audit P1-5): the reference hero is pure color + pure type —
 *   zero background graphics. The orbit identity stays as a WHISPER
 *   THAT REGISTERS: ≤110 static stars (α 0.42–0.84, no twinkle), ONE
 *   0.25 nebula wash, 3 hairline rings (α 0.24–0.42), 6 nodes (glow
 *   sprites α ≤0.38). Measured against the audit's floor: ≥1.5% lit
 *   pixels (lum ≥24/255), avgLuminance ≥6/255 (was 0.22% / 2.72
 *   before the lift). The reduced-motion static frame paints the same
 *   constants.
 * · Zero dependencies — Canvas 2D + one rAF loop.
 * · DPR capped at 1.5 (retina paints ≤2.25× CSS pixels, not 4×).
 * · Allocation-free draw loop: every per-frame color string, point
 *   and buffer is built once (module scope or on resize) and only
 *   rewritten numerically per frame — no GC churn, no 100ms frames.
 * · No canvas shadow-blur filters anywhere — glows are pre-rendered
 *   radial sprites at low alpha (audit §C: per-frame shadow filters
 *   are far too slow).
 * · Containment-first geometry: orbit radius ≤ min(w,h) × 0.45 and
 *   the system is centered inside the canvas, so no ring is ever
 *   amputated by the hero's overflow:hidden (mobile audit #10) and
 *   rings keep a circular character instead of wide flat ellipses.
 * · Fully paused when offscreen (IntersectionObserver) or tab hidden.
 * · prefers-reduced-motion → ONE composed static frame; no rAF, no
 *   scroll/mouse listeners.
 * · navigator.saveData / low deviceMemory → reduced density.
 * · Any canvas failure → component unmounts itself; the hero's CSS
 *   sky fallback carries the scene (page stays complete).
 * · Every listener + rAF + observer is cleaned up on unmount.
 */

type Density = 'full' | 'low';

export type OrbitSceneProps = {
  className?: string;
  /** Force a density tier (used by tests / embeds). Default: auto. */
  density?: Density;
  /**
   * Horizontal bias of the orbital system, −1 … 1 (0 = centered).
   * The hero passes a negative value so the visual mass sits opposite
   * the RTL text column, keeping the composition asymmetric. The bias
   * is clamped so the full system always stays inside the canvas.
   */
  biasX?: number;
  /** Ambient rotation speed multiplier. 1 = default. */
  speed?: number;
};

/** Circuit Petrol palette (phase5 r152) — canvas-side of the --ln-* landing
 *  tokens. phase9 (P9-3-c E3): the triplets + strings below are now the
 *  DARK BOOT DEFAULTS only — the engine SAMPLES the real tokens at boot
 *  (getComputedStyle on the .landing scope) and re-samples on every
 *  theme flip (MutationObserver on the html class — the Smart-Link
 *  P9-3-a family pattern), so the “lockstep with landing.css §1” is
 *  enforced live instead of by hand: foam #E9F5F0 stars/hairlines,
 *  signal-teal #17C3A4 the knowledge light, AI-lime #C6F24E the sparse
 *  depth accent; the light stage re-samples mist ink / deep teal /
 *  the dark-lime tier. A failed re-read keeps the last good palette —
 *  the engine never paints guesswork. */
const CREAM = [233, 245, 240] as const; // #E9F5F0 foam — stars / hairlines
const LIME = [23, 195, 164] as const; // #17C3A4 signal teal — the knowledge light
const VIOLET = [198, 242, 78] as const; // #C6F24E AI lime — depth accent

type NodeColor = 'lime' | 'violet' | 'cream';

type Triplet = readonly [number, number, number];

/** Per-frame color strings — built once, referenced every frame. (phase5
 *  r152: re-anchored in lockstep with the triplets above — the stars,
 *  nodes, rings, links and trails all paint the petrol world now.
 *  phase9 (P9-3-c): these are the DARK defaults; the live values live in
 *  the effect closure (see repaintFromTokens) so a theme flip rewrites
 *  them without touching the frozen geometry code.) */
const STAR_COLORS = {
  cream: 'rgb(233,245,240)',
  lime: 'rgb(23,195,164)',
  violet: 'rgb(198,242,78)',
} as const;
const NODE_FILL = {
  lime: 'rgba(23,195,164,0.95)',
  violet: 'rgba(198,242,78,0.95)',
  cream: 'rgba(233,245,240,0.9)',
} as const;
const RING_STROKE = 'rgb(233,245,240)';
const LINK_STROKE = 'rgb(23,195,164)';
const TRAIL_STROKE = 'rgb(23,195,164)';
const HEAD_FILL = 'rgb(233,245,240)';

/* phase9 (P9-3-c E3) — token reader (the Smart-Link P9-3-a primitive):
 * resolves a --ln-* custom property on the .landing scope into an RGB
 * triplet. Accepts the #hex and rgb()/rgba() forms the landing sheet
 * emits; anything else (empty/failed) returns null. */
function readTokenTriplet(root: Element, token: string): Triplet | null {
  const raw = getComputedStyle(root).getPropertyValue(token).trim();
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const fn = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1]!.split(/[,/\s]+/).filter(Boolean).slice(0, 3);
    if (parts.length === 3) {
      const t = parts.map((p) => parseFloat(p));
      if (t.every((n) => Number.isFinite(n))) return t as unknown as Triplet;
    }
  }
  return null;
}
const rgbOf = (t: Triplet) => `rgb(${t[0]},${t[1]},${t[2]})`;
const rgbaOf = (t: Triplet, a: number) => `rgba(${t[0]},${t[1]},${t[2]},${a})`;

type Star = {
  x: number;
  y: number;
  r: number;
  base: number;
  color: string;
  /** 0 = far layer (slower parallax, smaller) · 1 = near layer */
  depth: number;
};
type Node = {
  orbit: number;
  angle: number;
  omega: number;
  r: number;
  color: NodeColor;
  /** live position — preallocated, rewritten numerically every frame */
  x: number;
  y: number;
};

/**
 * Orbit fractions of the system radius + tilt + angular speed + line alpha.
 * Visibility lift (premium-polish P1-5): mist tiers 0.36/0.28/0.20
 * inner→outer (was 0.16/0.11/0.08) — the rings read as drawn geometry
 * at first glance now, still hairlines, never neon.
 */
const ORBITS = [
  { f: 0.4, rot: -0.34, omega: 0.00016, mist: 0.42 },
  { f: 0.61, rot: -0.28, omega: 0.00011, mist: 0.33 },
  { f: 1, rot: -0.16, omega: 0.00006, mist: 0.24 },
] as const;

const NODE_PALETTE: readonly NodeColor[] = ['lime', 'lime', 'violet', 'cream', 'lime', 'violet'];
const TRAIL_MAX = 16; // visual diet: shorter fading thread (was 24)

/** Pre-rendered radial-glow sprite — per-frame shadow filters are far too slow. */
function makeGlowSprite(size: number, rgb: readonly number[], coreAlpha: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  if (!g) return c;
  const half = size / 2;
  const grad = g.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${coreAlpha})`);
  grad.addColorStop(0.25, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${coreAlpha * 0.55})`);
  grad.addColorStop(0.6, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${coreAlpha * 0.14})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export function OrbitScene({ className, density, biasX = 0, speed = 1 }: OrbitSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!canvasNode) return;
    const context = canvasNode.getContext('2d', { alpha: true });
    if (!context) {
      setFailed(true);
      return;
    }
    // Non-nullable aliases — narrowing doesn't survive into the hoisted
    // engine functions below, so hand them values that are never null.
    const canvas: HTMLCanvasElement = canvasNode;
    const ctx: CanvasRenderingContext2D = context;

    // ── environment tiers ─────────────────────────────────────────────
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canHover = window.matchMedia('(hover: hover)').matches;
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
    const saveData = Boolean(conn?.saveData);
    const mem = (navigator as { deviceMemory?: number }).deviceMemory;
    const lowMemory = typeof mem === 'number' && mem <= 2;

    const tier: Density = density ?? (saveData || lowMemory ? 'low' : 'full');

    // ── sizing + containment-first geometry ───────────────────────────
    let w = 0;
    let h = 0;
    let dpr = 1;
    // Whole orbital system: max radius ≤ min(w,h) × 0.45 (mobile audit
    // #10) — nothing the scene draws can be amputated by overflow:hidden.
    let orbitR = 1;
    let systemCx = 0;
    let systemCy = 0;
    // rings stay rounder on tall (portrait) screens, disc-tilted on wide ones
    let squash = 0.52;
    let linkDist = 120;
    let stars: Star[] = [];
    let nodes: Node[] = [];
    let nebula: HTMLCanvasElement | null = null;
    let glowLime: HTMLCanvasElement;
    let glowViolet: HTMLCanvasElement;
    let glowCream: HTMLCanvasElement;

    /* phase9 (P9-3-c E3) — the LIVE palette: starts at the dark boot
     * defaults (module consts), flips when the theme flips (below). The
     * frozen geometry/formulas never change — only what they paint with. */
    let P: { cream: Triplet; lime: Triplet; violet: Triplet } = {
      cream: CREAM,
      lime: LIME,
      violet: VIOLET,
    };
    let starColors: Record<NodeColor, string> = { ...STAR_COLORS };
    let nodeFill: Record<NodeColor, string> = { ...NODE_FILL };
    let ringStroke = RING_STROKE;
    let linkStroke = LINK_STROKE;
    let trailStroke = TRAIL_STROKE;
    let headFill = HEAD_FILL;

    const mouse = { x: 0.5, y: 0.5, active: false, sx: 0.5, sy: 0.5 };
    let scrollP = 0; // 0 … 1 as the hero scrolls away (drives the fade only)
    let introT = 0; // 0 … 1 scene bloom on mount

    function buildScene() {
      const area = w * h;
      // Depth pass: two parallax star layers (≈110 full / ≈52 low, was
      // 60/36) with STATIC alpha 0.28–0.58. The far layer drifts at 40%
      // of the near layer's parallax, so the sky reads as SPACE, not as
      // a scatter of dots on glass. Still no twinkle — nothing flashes.
      const starCount = tier === 'low'
        ? Math.min(52, Math.max(18, Math.round(area / 22000)))
        : Math.min(110, Math.max(28, Math.round(area / 10500)));
      stars = Array.from({ length: starCount }, () => {
        const tint = Math.random();
        const depth = Math.random() < 0.62 ? 0 : 1; // majority far
        return {
          x: Math.random(),
          y: Math.random(),
          // P1-5 lift: radius + base alpha ×1.3 (r ≤1.56, α ≤0.75) —
          // the sky registers as SPACE from across the room now.
          r: (0.52 + Math.random() * 1.04) * (depth === 1 ? 1.15 : 0.85),
          base: (0.42 + Math.random() * 0.42) * (depth === 1 ? 1 : 0.82),
          depth,
          color:
            tint < 0.8 ? starColors.cream : tint < 0.94 ? starColors.lime : starColors.violet,
        };
      });

      // Visual diet: 6 nodes full tier / 4 low (was 10/6), flat 2px core.
      const nodeCount = tier === 'low' ? 4 : 6;
      nodes = Array.from({ length: nodeCount }, (_, i) => {
        const orbit = i % ORBITS.length;
        return {
          orbit,
          angle: Math.random() * Math.PI * 2,
          omega: ORBITS[orbit]!.omega * (0.75 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1),
          r: 2,
          color: NODE_PALETTE[i % NODE_PALETTE.length]!,
          x: 0,
          y: 0,
        };
      });

      // Depth bloom — TWO tones painted once per resize into the same
      // offscreen canvas (still one drawImage per frame): a violet radial
      // around the orbital system (P1-5: 0.11 → 0.16 — a visible light
      // source) + a wide cream horizon glow at the very bottom, as if the
      // ink lifted a little where the page continues below the fold
      // (0.07 → 0.09, lifted with the rest of the pass).
      nebula = document.createElement('canvas');
      nebula.width = Math.max(1, w);
      nebula.height = Math.max(1, h);
      const ng = nebula.getContext('2d');
      if (ng) {
        const rr = orbitR * 1.6;
        const grad = ng.createRadialGradient(systemCx, systemCy, 0, systemCx, systemCy, rr);
        grad.addColorStop(0, rgbaOf(P.violet, 0.25));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ng.fillStyle = grad;
        ng.fillRect(0, 0, w, h);
        const hz = ng.createRadialGradient(w * 0.5, h * 1.18, 0, w * 0.5, h * 1.18, h * 0.75);
        hz.addColorStop(0, rgbaOf(P.cream, 0.14));
        hz.addColorStop(1, 'rgba(0,0,0,0)');
        ng.fillStyle = hz;
        ng.fillRect(0, 0, w, h);
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      // Spec §4.4 — DPR cap 1.5: retina paints ≤2.25× CSS pixels.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Containment-first system placement (mobile audit #10): radius
      // capped at 45% of the short side; the bias can only consume the
      // SLACK beyond the cap, so cx ± orbitR always lands inside [0, w].
      orbitR = Math.min(w, h) * 0.45;
      systemCx = w * 0.5 + biasX * Math.max(0, w * 0.5 - orbitR);
      systemCy = h * 0.46;
      squash = w < h ? 0.72 : 0.52;
      linkDist = Math.min(190, orbitR * 0.7);

      buildScene();
    }

    // ── helpers (all write into preallocated buffers) ────────────────
    const scratch = { x: 0, y: 0 };

    function orbitPoint(orbit: number, angle: number, scale: number, out: { x: number; y: number }) {
      const o = ORBITS[orbit]!;
      const rx = orbitR * o.f * scale;
      const ry = rx * squash;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = cos * rx;
      const y = sin * ry;
      const rxr = Math.cos(o.rot);
      const ryr = Math.sin(o.rot);
      out.x = systemCx + x * rxr - y * ryr;
      out.y = systemCy + x * ryr + y * rxr;
    }

    const traveller = {
      orbit: 1,
      angle: -Math.PI / 3,
      jumpFrom: null as null | { orbit: number; angle: number; t: number; dur: number; toOrbit: number; toAngle: number },
    };

    // trail ring buffer — preallocated once, never reallocated
    const trailX = new Float64Array(TRAIL_MAX);
    const trailY = new Float64Array(TRAIL_MAX);
    let trailLen = 0;
    let trailHead = 0; // index of the next write

    function pushTrail(x: number, y: number) {
      trailX[trailHead] = x;
      trailY[trailHead] = y;
      trailHead = (trailHead + 1) % TRAIL_MAX;
      if (trailLen < TRAIL_MAX) trailLen++;
    }

    /** Buffer index of the i-th oldest trail point. */
    function trailIndex(i: number): number {
      return (trailHead - trailLen + i + TRAIL_MAX) % TRAIL_MAX;
    }

    function updateTraveller(dt: number) {
      if (traveller.jumpFrom) {
        const j = traveller.jumpFrom;
        j.t += dt;
        const p = Math.min(1, j.t / j.dur);
        const ease = p * p * (3 - 2 * p); // smoothstep
        orbitPoint(j.orbit, j.angle, systemScale(), scratch);
        const ax = scratch.x;
        const ay = scratch.y;
        orbitPoint(j.toOrbit, j.toAngle, systemScale(), scratch);
        const lift = Math.sin(p * Math.PI) * 26;
        pushTrail(ax + (scratch.x - ax) * ease, ay + (scratch.y - ay) * ease - lift);
        if (p >= 1) {
          traveller.orbit = j.toOrbit;
          traveller.angle = j.toAngle;
          traveller.jumpFrom = null;
          scheduleJump();
        }
        return;
      }
      traveller.angle += ORBITS[traveller.orbit]!.omega * 1.9 * speed * dt;
      orbitPoint(traveller.orbit, traveller.angle, systemScale(), scratch);
      pushTrail(scratch.x, scratch.y);
    }

    let jumpTimer = 0;
    function scheduleJump() {
      // after a random dwell, leap to a neighbouring orbit
      jumpTimer = window.setTimeout(() => {
        const dir = traveller.orbit === 0 ? 1 : traveller.orbit === ORBITS.length - 1 ? -1 : Math.random() < 0.5 ? 1 : -1;
        traveller.jumpFrom = {
          orbit: traveller.orbit,
          angle: traveller.angle,
          toOrbit: traveller.orbit + dir,
          toAngle: traveller.angle + (Math.random() - 0.5) * 2.2,
          t: 0,
          dur: 1500,
        };
      }, 2600 + Math.random() * 4200);
    }

    function systemScale() {
      // blooms in on mount only — no scroll expansion, so the radius cap
      // holds at every scroll position (mobile audit #10 fix)
      return 0.94 + 0.06 * introT;
    }

    // ── draw (allocation-free) ────────────────────────────────────────
    function draw(dt: number) {
      ctx.clearRect(0, 0, w, h);

      const fade = 1 - scrollP * 0.55;

      // depth bloom — offscreen, one drawImage
      if (nebula) {
        ctx.globalAlpha = fade;
        ctx.drawImage(nebula, 0, 0, w, h);
      }

      // stars — two parallax layers; STATIC alpha (nothing flashes).
      // Near layer carries the full drift, far layer 40% of it → depth.
      const starParX = (mouse.sx - 0.5) * 7;
      const starParY = (mouse.sy - 0.5) * 6;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]!;
        const k = s.depth === 1 ? 1 : 0.4;
        ctx.globalAlpha = s.base * fade;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x * w + starParX * k, s.y * h + starParY * k, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // orbit rings — thin flat cream hairlines (1px); parallax amplitude
      // trimmed ~40% (calm, not playful)
      const orbitParX = (mouse.sx - 0.5) * 13;
      const orbitParY = (mouse.sy - 0.5) * 10;
      const scale = systemScale();
      const cx = systemCx + orbitParX;
      const cy = systemCy + orbitParY;
      ctx.lineWidth = 1;
      ctx.strokeStyle = ringStroke;
      for (let i = 0; i < ORBITS.length; i++) {
        const o = ORBITS[i]!;
        ctx.globalAlpha = o.mist * fade;
        ctx.beginPath();
        ctx.ellipse(cx, cy, orbitR * o.f * scale, orbitR * o.f * scale * squash, o.rot, 0, Math.PI * 2);
        ctx.stroke();
      }

      // nodes — positions rewritten into the preallocated node objects
      // (raw orbit coords; parallax is applied at draw time so nodes,
      // rings and trail move as one system layer)
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        n.angle += n.omega * speed * (reducedMotion ? 0 : 1) * dt;
        orbitPoint(n.orbit, n.angle, scale, scratch);
        let ox = 0;
        let oy = 0;
        if (canHover && mouse.active) {
          const dx = mouse.sx * w - (scratch.x + orbitParX);
          const dy = mouse.sy * h - (scratch.y + orbitParY);
          const dist = Math.hypot(dx, dy);
          if (dist < 170 && dist > 0.001) {
            const pull = (1 - dist / 170) * 14;
            ox = (dx / dist) * pull;
            oy = (dy / dist) * pull;
          }
        }
        n.x = scratch.x + ox;
        n.y = scratch.y + oy;
      }

      // constellation links between near nodes (P1-5: 0.17 → 0.22)
      ctx.lineWidth = 1;
      ctx.strokeStyle = linkStroke;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]!;
        for (let k = i + 1; k < nodes.length; k++) {
          const b = nodes[k]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < linkDist) {
            ctx.globalAlpha = (1 - d / linkDist) * 0.26 * fade;
            ctx.beginPath();
            ctx.moveTo(a.x + orbitParX, a.y + orbitParY);
            ctx.lineTo(b.x + orbitParX, b.y + orbitParY);
            ctx.stroke();
          }
        }
      }

      // node glows + cores (sprites — flat craft, not neon). Glow disc
      // wider still (r*12.5) so each node reads as a lit body from afar.
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        const sprite = n.color === 'lime' ? glowLime : n.color === 'violet' ? glowViolet : glowCream;
        const gs = n.r * 12.5;
        ctx.globalAlpha = fade;
        ctx.drawImage(sprite, n.x + orbitParX - gs / 2, n.y + orbitParY - gs / 2, gs, gs);
        ctx.fillStyle = nodeFill[n.color];
        ctx.beginPath();
        ctx.arc(n.x + orbitParX, n.y + orbitParY, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // traveller + trail — front layer, same system parallax (P1-5:
      // trail α 0.32 → 0.42, head glow 52 → 60px — the learner reads)
      if (!reducedMotion) updateTraveller(dt);
      ctx.strokeStyle = trailStroke;
      for (let i = 1; i < trailLen; i++) {
        const i0 = trailIndex(i - 1);
        const i1 = trailIndex(i);
        const t = (i + 1) / trailLen;
        ctx.globalAlpha = t * 0.5 * fade;
        ctx.lineWidth = 1 + t * 1.6;
        ctx.beginPath();
        ctx.moveTo(trailX[i0]! + orbitParX, trailY[i0]! + orbitParY);
        ctx.lineTo(trailX[i1]! + orbitParX, trailY[i1]! + orbitParY);
        ctx.stroke();
      }
      if (trailLen > 0) {
        const head = trailIndex(trailLen - 1);
        const hx = trailX[head]! + orbitParX;
        const hy = trailY[head]! + orbitParY;
        ctx.globalAlpha = fade;
        ctx.drawImage(glowLime, hx - 33, hy - 33, 66, 66);
        ctx.fillStyle = headFill;
        ctx.beginPath();
        ctx.arc(hx, hy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    // ── static frame (reduced-motion path) ────────────────────────────
    function drawStatic() {
      introT = 1;
      trailLen = 0;
      trailHead = 0;
      // seed a trail along the current orbit for a composed still: walk
      // back TRAIL_MAX steps, then push forward so the ring buffer runs
      // oldest → newest exactly like the live loop (head glow on top)
      const step = ORBITS[traveller.orbit]!.omega * 26;
      traveller.angle -= step * TRAIL_MAX;
      for (let i = 0; i < TRAIL_MAX; i++) {
        traveller.angle += step;
        orbitPoint(traveller.orbit, traveller.angle, systemScale(), scratch);
        pushTrail(scratch.x, scratch.y);
      }
      draw(0);
    }

    // ── loop control ──────────────────────────────────────────────────
    let raf = 0;
    let last = 0;
    let dtGlobal = 16;
    let running = false;
    let inView = true;
    let visible = !document.hidden;

    function frame(now: number) {
      raf = 0;
      if (!running) return;
      dtGlobal = Math.min(48, now - last || 16);
      last = now;
      if (introT < 1) introT = Math.min(1, introT + dtGlobal / 1400);
      draw(dtGlobal);
      if (running) raf = requestAnimationFrame(frame);
    }

    function setRunning(next: boolean) {
      if (reducedMotion) return; // static path never loops
      const target = next && inView && visible;
      if (target === running) return;
      running = target;
      if (running) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    // ── listeners ─────────────────────────────────────────────────────
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          inView = e.isIntersecting;
          setRunning(inView);
        }
      },
      { rootMargin: '80px 0px' },
    );

    const onVisibility = () => {
      visible = !document.hidden;
      setRunning(visible);
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (reducedMotion) drawStatic();
    });
    ro.observe(canvas);

    // scroll → fade progress; rAF-coalesced (one gBCR read per frame max)
    let scrollRaf = 0;
    const readScroll = () => {
      scrollRaf = 0;
      const rect = canvas.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      scrollP = Math.max(0, Math.min(1, -rect.top / (vh * 0.9)));
    };
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(readScroll);
    };

    // mouse parallax — same pending-flag pattern
    let mouseRaf = 0;
    const onMouse = (e: MouseEvent) => {
      if (mouseRaf) return;
      mouseRaf = requestAnimationFrame(() => {
        mouseRaf = 0;
        const rect = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - rect.left) / Math.max(1, rect.width);
        mouse.y = (e.clientY - rect.top) / Math.max(1, rect.height);
        mouse.active = mouse.x >= 0 && mouse.x <= 1 && mouse.y >= 0 && mouse.y <= 1;
        mouse.sx += (mouse.x - mouse.sx) * 0.12;
        mouse.sy += (mouse.y - mouse.sy) * 0.12;
      });
    };

    // ── boot / teardown ───────────────────────────────────────────────
    /* phase9 (P9-3-c E3) — theme repaint (the Smart-Link P9-3-a pattern):
     * the landing toggle flips html.dark/html.light and the light stage
     * (landing.css §16) REDEFINES the very tokens sampled here. One
     * MutationObserver on the html class re-reads the same --ln-* tokens
     * (getComputedStyle resolves them through the new cascade — ink
     * stars/rings on mist, deep-teal nodes, dark-lime depth), rebuilds
     * the derived strings + glow sprites + star field + nebula, and the
     * running loop paints the new world on its next frame (the
     * reduced-motion path redraws its single composed frame). A failed
     * re-read keeps the last good palette — the engine never paints
     * guesswork (the boot law holds for every repaint). */
    function repaintFromTokens() {
      const root = canvas.closest('.landing') ?? canvas;
      const cream = readTokenTriplet(root, '--ln-cream');
      const lime = readTokenTriplet(root, '--ln-lime');
      const violet = readTokenTriplet(root, '--ln-violet');
      if (!cream || !lime || !violet) return;
      const same =
        cream[0] === P.cream[0] && cream[1] === P.cream[1] && cream[2] === P.cream[2] &&
        lime[0] === P.lime[0] && lime[1] === P.lime[1] && lime[2] === P.lime[2] &&
        violet[0] === P.violet[0] && violet[1] === P.violet[1] && violet[2] === P.violet[2];
      if (same) return; // dark default or a no-op flip — nothing to rebuild
      P = { cream, lime, violet };
      starColors = { cream: rgbOf(P.cream), lime: rgbOf(P.lime), violet: rgbOf(P.violet) };
      nodeFill = {
        lime: rgbaOf(P.lime, 0.95),
        violet: rgbaOf(P.violet, 0.95),
        cream: rgbaOf(P.cream, 0.9),
      };
      ringStroke = starColors.cream;
      linkStroke = starColors.lime;
      trailStroke = starColors.lime;
      headFill = starColors.cream;
      glowLime = makeGlowSprite(64, P.lime, 0.38);
      glowViolet = makeGlowSprite(64, P.violet, 0.32);
      glowCream = makeGlowSprite(64, P.cream, 0.27);
      buildScene(); // stars + nebula re-painted with the new palette
      if (reducedMotion) drawStatic();
    }
    const themeObserver = new MutationObserver(repaintFromTokens);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    const teardown = () => {
      running = false;
      io.disconnect();
      ro.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('mousemove', onMouse);
      if (raf) cancelAnimationFrame(raf);
      if (mouseRaf) cancelAnimationFrame(mouseRaf);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.clearTimeout(jumpTimer);
    };

    try {
      // P1-5 visibility lift: glow cores ×1.3 (0.31/0.26/0.22, was
      // 0.24/0.20/0.17) — lit bodies, still flat craft. The horizon
      // nebula does the heavy lifting.
      glowLime = makeGlowSprite(64, P.lime, 0.38);
      glowViolet = makeGlowSprite(64, P.violet, 0.32);
      glowCream = makeGlowSprite(64, P.cream, 0.27);
      resize();
      // phase9 (P9-3-c): a stored-light visitor lands here with html.light
      // already set (layout.tsx pre-paint boot) — one token re-read paints
      // the mist world from the first frame. Dark visitors sample the same
      // values the defaults already carry → the `same` guard skips the
      // rebuild (zero extra work, star field untouched).
      repaintFromTokens();
    } catch {
      setFailed(true);
      teardown();
      return;
    }

    if (reducedMotion) {
      // ONE static composed frame — no loop, no scroll/mouse listeners.
      drawStatic();
      return teardown;
    }

    readScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    if (canHover) window.addEventListener('mousemove', onMouse, { passive: true });
    io.observe(canvas);
    document.addEventListener('visibilitychange', onVisibility);
    scheduleJump();
    setRunning(true);
    return teardown;
  }, [density, biasX, speed]);

  if (failed) return null;
  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
