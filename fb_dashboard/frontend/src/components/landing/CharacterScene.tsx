'use client';

/* W3-A — THE REFERENCE CONVERGENCE PASS (P21 Wave 3, the binding loop).
 *
 * The Wave 2 machine held its structure but the fresh comparison
 * audit (32/100, p21-research/w3-evidence/) measured it against the
 * live reference and found four dominant deltas — ALL closed here:
 *
 * · THE EYES were wide BARS (and read invisible under the old bloom)
 *   → now TWO bright white circular DOTS, upper-third of the screen,
 *   wide-set, ~18% of the screen width (the reference's measured LED
 *   grammar);
 * · THE BEZEL was a flat additive plane that read as a pastel decal
 *   → now a closed TUBE tracing the face inset's rounded-rect
 *   perimeter, per-vertex spectrum colors by clockwise angle (left
 *   cyan → top violet → right magenta → bottom-right orange → amber
 *   → teal-green closing) — a CRISP 3D glowing rim standing proud of
 *   the recessed black face (the reference's rainbow ring); the old
 *   canvas plane survives ONLY as a soft low-opacity bloom halo;
 * · THE SCREEN's instrument grid read as a CRT monitor → retired;
 *   the face is pure black OLED glass carrying only the dot eyes;
 * · THE LIMBS carried graphite collar seams/cuffs that read as
 *   striped retro tubes, the chest carried a grill + LED → all
 *   retired: SMOOTH off-white limbs with graphite ball joints only,
 *   the chest's TWO quiet vertical slots (the reference's detail),
 *   and a reference-led ASYMMETRIC POSE (near arm extended in the
 *   presenting line, far arm bent by the hip);
 * · THE PEDESTAL is the reference's low RECT plinth (was a podium
 *   cylinder), the skull is near-square (1.11:1) with a quiet graphite
 *   top deck, the cool rim light drops so the spectrum bezel IS the
 *   principal light, and the framing gives the figure real negative
 *   space (--sb-fig 0.76 → 0.60 — the reference holds the full figure
 *   with breathing room, never a close-up crop).
 *
 * KEPT (the graded integration contracts, unchanged): the token-
 * sampling palette + runtime theme repaint (MutationObserver on html
 * class), the beat channel (classify → VIOLET-lean bezel, handoff →
 * AMBER-lean — the tint law now rides BOTH the tube and the halo),
 * the framing solver (--sb-fig/--sb-floor/--sb-x with clamps), the
 * pause family (IO + visibilitychange), the DPR 2 cap, the disposal
 * sweep, and the WebGL probe + art-directed SVG fallback (redrawn to
 * the SAME dot-eye grammar).
 */

import { useEffect, useRef, useState } from 'react';
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MeshBasicMaterial,
  SphereGeometry,
  CylinderGeometry,
  PlaneGeometry,
  BufferGeometry,
  Color,
  MathUtils,
  CanvasTexture,
  ACESFilmicToneMapping,
  PMREMGenerator,
  Fog,
  DirectionalLight,
  AmbientLight,
  PointLight,
  AdditiveBlending,
  Box3,
  Vector3,
  CatmullRomCurve3,
  TubeGeometry,
  CircleGeometry,
  BufferAttribute,
  type Material,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { subscribeHeroBeat, lastHeroBeat, type HeroBeat, type HeroBeatDetail } from './heroBus';
/* W3-A — THE BEZEL RING (geometry, not a decal): the reference's rim
 * is a CRISP glowing frame tracing the face inset's 3D contour —
 * rebuilt as a TubeGeometry along a closed rounded-rect path, each
 * vertex colored by its CLOCKWISE angle around the face (left cyan →
 * top violet → right magenta → bottom-right orange → bottom amber →
 * teal-green closing to cyan — the reference's rainbow ring). The old
 * flat additive plane survives ONLY as the soft bloom halo behind
 * the tube (the reference's light spill onto the cheeks). */
const BEZEL_STOPS: Array<[number, string]> = [
  [0.0, '#00f0ff'],
  [0.14, '#4a6bff'],
  [0.27, '#b04dff'],
  [0.44, '#ff5ac8'],
  [0.6, '#ff8a3c'],
  [0.74, '#ffd23c'],
  [0.88, '#26d9a0'],
  [1.0, '#00f0ff'],
];

function bezelColorAt(t: number, out: Color): Color {
  const tt = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < BEZEL_STOPS.length - 2 && tt > BEZEL_STOPS[i + 1][0]) i++;
  const a = BEZEL_STOPS[i];
  const b = BEZEL_STOPS[i + 1];
  const u = Math.max(0, Math.min(1, (tt - a[0]) / (b[0] - a[0])));
  out.set(a[1]).lerp(tmpBezelA.set(b[1]), u);
  return out;
}
const tmpBezelA = new Color();
const tmpBezelB = new Color();

/* the closed rounded-rect path (clockwise from the top edge, fillets
 * as quarter arcs) — sampled densely so CatmullRom traces true */
function roundedRectCurve(w: number, h: number, r: number, z: number): CatmullRomCurve3 {
  const pts: Vector3[] = [];
  const push = (x: number, y: number) => pts.push(new Vector3(x, y, z));
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  const N = 9, C = 7; /* straight samples + corner arc samples */
  for (let i = 0; i <= N; i++) push(x0 + r + ((x1 - r) - (x0 + r)) * (i / N), y1);
  for (let i = 1; i <= C; i++) { const a = Math.PI / 2 - (Math.PI / 2) * (i / C); push(x1 - r + Math.cos(a) * r, y1 - r + Math.sin(a) * r); }
  for (let i = 1; i <= N; i++) push(x1, (y1 - r) - ((y1 - r) - (y0 + r)) * (i / N));
  for (let i = 1; i <= C; i++) { const a = -(Math.PI / 2) * (i / C); push(x1 - r + Math.cos(a) * r, y0 + r + Math.sin(a) * r); }
  for (let i = 1; i <= N; i++) push((x1 - r) - ((x1 - r) - (x0 + r)) * (i / N), y0);
  for (let i = 1; i <= C; i++) { const a = -Math.PI / 2 - (Math.PI / 2) * (i / C); push(x0 + r + Math.cos(a) * r, y0 + r + Math.sin(a) * r); }
  for (let i = 1; i <= N; i++) push(x0, (y0 + r) + ((y1 - r) - (y0 + r)) * (i / N));
  for (let i = 1; i <= C; i++) { const a = Math.PI - (Math.PI / 2) * (i / C); push(x0 + r + Math.cos(a) * r, y1 - r + Math.sin(a) * r); }
  return new CatmullRomCurve3(pts, true);
}

/* the bezel tube geometry with per-vertex spectrum colors */
function makeBezelTubeGeometry(w: number, h: number, r: number, tubeR: number): TubeGeometry {
  const curve = roundedRectCurve(w, h, r, 0);
  const geo = new TubeGeometry(curve, 220, tubeR, 12, true);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = tmpBezelB;
  for (let i = 0; i < pos.count; i++) {
    const ang = Math.atan2(pos.getY(i), pos.getX(i));
    const u = (ang + Math.PI) / (2 * Math.PI); /* 0 left · .25 bottom · .5 right · .75 top */
    const t = 1 - u; /* clockwise from the LEFT edge (the reference reads L→R) */
    bezelColorAt(t, c);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}

export type CharacterSceneProps = {
  className?: string;
};

/* Emissive constants — the machine instrument law (unchanged):
 * CYAN = the machine's voice; VIOLET = the AI register (classify);
 * AMBER = the human/handoff warm register. */
const CYAN = 0x56e2f2;
const VIOLET = 0x9380ff;
const AMBER = 0xff9a69;

/* The ChainGPT spectrum rim (the bezel's gradient stops — measured off
 * the reference hero: cyan → blue → purple → pink → orange). W2-C1: the
 * five anchors are the HUE PATH of record, not the render list — the
 * sweep below samples them densely (HSL, monotonic unwrapped hue) so the
 * conic frame reads as ONE continuous spectrum (the five-stop piecewise
 * gradient produced visible band boundaries at hero scale). */
const SPECTRUM_STOPS = ['#00f0ff', '#4a6bff', '#b04dff', '#ff5ac8', '#ff8a3c'];

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToCss(c: Hsl): string {
  const f = (n: number) => {
    const k = (n + c.h * 12) % 12;
    const a = c.s * Math.min(c.l, 1 - c.l);
    const v = c.l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255);
  };
  return `rgb(${f(0)}, ${f(8)}, ${f(4)})`;
}

/* the smooth bezel sweep — n+1 (offset, color) samples along the
 * anchors' hue path (piecewise-linear in HSL, hue unwrapped monotone:
 * 187° → 227° → 275° → 322° → 389°), clockwise as the reference reads */
function spectrumSweep(n: number): Array<[number, string]> {
  const anchors = SPECTRUM_STOPS.map(hexToHsl);
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].h < anchors[i - 1].h) anchors[i].h += 1;
  }
  const out: Array<[number, string]> = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const f = Math.min(t * (anchors.length - 1), anchors.length - 1 - 1e-4);
    const i = Math.floor(f);
    const u = f - i;
    const a = anchors[i];
    const b = anchors[i + 1];
    out.push([
      t,
      hslToCss({ h: a.h + (b.h - a.h) * u, s: a.s + (b.s - a.s) * u, l: a.l + (b.l - a.l) * u }),
    ]);
  }
  return out;
}

/* ── the composition contract (world units) ────────────────────────
 * The framing solver places these inside the host box:
 *   FLOOR_Y — the floor line the pedestal + contact shadow sit on
 *   TOP_Y   — the figure's crown (head + breathing margin)       */
const FLOOR_Y = 0;
const CHAR_H = 1.34;
const TOP_Y = CHAR_H + 0.06;

/* Sampling bridge: read the landing token vars off <html> and parse
 * hex/rgb() to a number. Falls back to the dark-stage constant. */
function readVar(el: Element | null, name: string, fallback: number): number {
  try {
    if (!el) return fallback;
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const m = raw.match(/^#([0-9a-f]{6})$/i);
    if (m) return parseInt(m[1], 16);
    const rgb = raw.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (rgb) {
      const r = Math.round(+rgb[1]);
      const g = Math.round(+rgb[2]);
      const b = Math.round(+rgb[3]);
      return (r << 16) | (g << 8) | b;
    }
  } catch {
    /* first paint under SSR-less conditions — keep fallback */
  }
  return fallback;
}

type Palette = {
  dark: boolean;
  shell: number;
  graphite: number;
  screen: number;
  lime: number;
  eyeIntensity: number;
  bezelOpacity: number;
  glowOpacity: number;
  shadowStrength: number;
  fogColor: Color;
};

function samplePalette(): Palette {
  const html = document.documentElement;
  if (html.classList.contains('light')) {
    return {
      dark: false,
      /* porcelain-day stage: the boxy figure holds via its graphite
       * joints + black screen + bezel (contrast carries the
       * silhouette); the accents drop to their ink grades */
      shell: 0xd9d7d2,
      graphite: 0x2a2c33,
      screen: 0x090b0f,
      lime: 0x0e7a8a,
      eyeIntensity: 1.6,
      bezelOpacity: 0.62,
      glowOpacity: 0.5,
      shadowStrength: 0.34,
      fogColor: new Color(0xf2f2f0),
    };
  }
  return {
    dark: true,
    /* dark stage — the reference's scene: matte off-white machine on
     * the near-black void, the spectrum bezel is the principal light.
     * The rim light rides the landing's OWN --ln-lime token (the
     * machine's-voice ink — the phase-9 repaint lockstep contract). */
    shell: 0xe2e0da,
    graphite: 0x14161a,
    screen: 0x04060a,
    lime: readVar(html, '--ln-lime', CYAN),
    eyeIntensity: 2.2,
    bezelOpacity: 0.98,
    glowOpacity: 0.5,
    shadowStrength: 0.62,
    fogColor: new Color(0x050506),
  };
}

/* ── the bezel BLOOM texture — W3-A: the bezel's CRISP spectrum now
 * lives on the geometry (the vertex-colored tube); this canvas is
 * ONLY the soft additive halo that bleeds the tube's light onto the
 * shell cheeks (the reference's rim-light spill). One blurred pass,
 * low alpha — never a second frame stroke (the old double-stroke
 * read as a flat decal at hero scale). */
function makeBezelTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 800;
  const ctx = c.getContext('2d')!;
  let g: CanvasGradient;
  if (typeof ctx.createConicGradient === 'function') {
    g = ctx.createConicGradient(-Math.PI / 2, 512, 400);
  } else {
    g = ctx.createLinearGradient(48, 40, 976, 760);
  }
  for (const [offset, color] of spectrumSweep(45)) g.addColorStop(offset, color);
  /* the soft bloom pass ONLY — blurred in-canvas so the halo is
   * stepless (ctx.filter is ignored by engines without it — the
   * un-blurred pass is a fine fallback) */
  ctx.filter = 'blur(26px)';
  ctx.strokeStyle = g;
  ctx.lineWidth = 240;
  ctx.globalAlpha = 0.5;
  roundRectPath(ctx, 52, 44, 920, 712, 108);
  ctx.stroke();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  return new CanvasTexture(c);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x, y, );
  ctx.closePath();
}

/* ── the art-directed static fallback frame (WebGL absent / failed) ──
 * A composed SVG portrait of the SAME boxy reference character (W3-A
 * grammar): the filleted head, the recessed black screen with TWO
 * white DOT eyes, the spectrum bezel ring, smooth limbs (one
 * presenting), the two chest slots, the rect pedestal — so a
 * WebGL-less client gets the P21 hero, never a hole. */
function CharacterFallbackSvg() {
  return (
    <svg viewBox="0 0 360 470" role="presentation" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id="sb-fb-shell" x1="0" y1="0" x2="1" y2="0.1">
          <stop offset="0" stopColor="#F0EEE9" />
          <stop offset="0.55" stopColor="#E8E6E1" />
          <stop offset="1" stopColor="#C9C7C2" />
        </linearGradient>
        <linearGradient id="sb-fb-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B0D12" />
          <stop offset="1" stopColor="#04060A" />
        </linearGradient>
        <linearGradient id="sb-fb-bezel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00F0FF" />
          <stop offset="0.3" stopColor="#4A6BFF" />
          <stop offset="0.55" stopColor="#B04DFF" />
          <stop offset="0.8" stopColor="#FF5AC8" />
          <stop offset="1" stopColor="#FF8A3C" />
        </linearGradient>
        <radialGradient id="sb-fb-eyeglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.6" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* the contact shadow */}
      <ellipse cx="180" cy="452" rx="126" ry="14" fill="rgb(1 1 2 / 0.85)" />

      {/* THE PEDESTAL — the dark plinth */}
      <path d="M 104 404 L 256 404 L 262 430 L 98 430 Z" fill="#15171C" />
      <path d="M 104 404 L 256 404 L 258 412 L 102 412 Z" fill="#1D2026" />

      {/* THE BODY — boxy chest + waist + hips (one family) */}
      <path d="M 118 258 L 242 258 L 246 318 Q 246 330 234 330 L 126 330 Q 114 330 114 318 Z" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />
      <path d="M 134 330 L 226 330 L 222 356 L 138 356 Z" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />
      <path d="M 124 356 L 236 356 L 240 396 L 120 396 Z" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />

      {/* the ball-joint shoulders — graphite */}
      <circle cx="114" cy="266" r="16" fill="#26282F" />
      <circle cx="246" cy="266" r="16" fill="#26282F" />
      {/* the smooth limbs, W3-A: NO collar seams (the reference's
          clean off-white arms) — the far arm hangs bent by the hip,
          the near arm extends in the presenting line */}
      <path d="M 100 282 L 95 320 L 99 346 L 111 346 L 113 320 L 110 284 Z" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />
      <circle cx="105" cy="330" r="8" fill="#26282F" />
      <path d="M 99 338 L 96 360 L 104 378 L 114 374 L 110 352 Z" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />
      <rect x="96" y="372" width="20" height="22" rx="6" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />
      <path d="M 260 282 L 276 306 L 292 330 L 306 352 L 296 360 L 280 336 L 266 310 L 254 286 Z" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />
      <circle cx="299" cy="356" r="8" fill="#26282F" />
      <rect x="292" y="364" width="20" height="22" rx="6" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />
      {/* the presenting hand — open, angled toward the content */}
      <rect x="290" y="382" width="22" height="20" rx="6" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" transform="rotate(18 301 392)" />

      {/* the chest's two vertical slots (W3-A — the grill/LED retired) */}
      <rect x="156" y="288" width="10" height="34" rx="5" fill="#26282F" />
      <rect x="194" y="288" width="10" height="34" rx="5" fill="#26282F" />

      {/* THE NECK — the graphite collar the head rides on */}
      <rect x="162" y="236" width="36" height="24" rx="6" fill="#26282F" />

      {/* THE HEAD — the filleted cube (W2-C1: heavier corner radii) */}
      <rect x="106" y="62" width="148" height="122" rx="30" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />

      {/* THE SCREEN — the recessed black glass (≈70% of the face,
          W2-C1: larger + riding higher, per the reference) */}
      <rect x="122" y="76" width="116" height="88" rx="15" fill="url(#sb-fb-screen)" />

      {/* THE BEZEL — the spectrum rim-light frame */}
      <rect x="117" y="71" width="126" height="98" rx="18" fill="none" stroke="url(#sb-fb-bezel)" strokeWidth="6" />

      {/* THE EYES — two white circular dots (W3-A — the reference's
          measured grammar: circles, upper-third, wide-set) */}
      <circle cx="148" cy="106" r="22" fill="url(#sb-fb-eyeglow)" />
      <circle cx="212" cy="106" r="22" fill="url(#sb-fb-eyeglow)" />
      <circle cx="148" cy="106" r="9" fill="#FFFFFF" />
      <circle cx="212" cy="106" r="9" fill="#FFFFFF" />
    </svg>
  );
}

export function CharacterScene({ className }: CharacterSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── renderer / scene / camera ─────────────────────────────── */
    let renderer: WebGLRenderer;
    try {
      /* the probe: a WebGL-less client never reaches the renderer —
       * the composed SVG frame below carries the hero instead */
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
      if (!gl) throw new Error('WebGL unavailable');
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true); // art-directed static fallback, not a broken canvas
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 600, host.clientHeight || 600, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(34, 1, 0.1, 40);

    /* ── THE MATERIAL BASE — PMREM RoomEnvironment (kept: believable
     * material response at low intensity — reads as material, never as
     * a light source; the matte shell needs far less than porcelain
     * clearcoat did). */
    const pmrem = new PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.3;

    /* ── light rig (the controlled-illumination law, reference-led):
     * W3-A: the bezel TUBE is the principal light now — the cool rim
     * drops from 2.3 to 1.15 so the shell reads as SHELL (the old
     * cyan wash fought the spectrum). Neutral warm key, quiet amber
     * kicker low on inline-end, quiet fill, the white face glow. */
    const key = new DirectionalLight(0xfff1e4, 1.35);
    key.position.set(2.4, 4.0, 3.0);
    scene.add(key);
    const rim = new DirectionalLight(CYAN, 0.7);
    rim.position.set(-3.4, 3.2, -2.6);
    scene.add(rim);
    const kicker = new DirectionalLight(AMBER, 0.8);
    kicker.position.set(3.2, 1.5, -2.5);
    scene.add(kicker);
    const fill = new AmbientLight(0x14161c, 0.4);
    scene.add(fill);
    const faceGlow = new PointLight(0xffffff, 0.55, 3.4, 2);
    faceGlow.position.set(0, CHAR_H * 0.9, 1.05);
    scene.add(faceGlow);

    /* ── registry for full disposal (scene-built) ── */
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const track = <T extends BufferGeometry | Material>(x: T): T => {
      if (x instanceof BufferGeometry) geometries.push(x);
      else materials.push(x as Material);
      return x;
    };

    let palette = samplePalette();

    /* ═══ THE WORLD — the machine stands on its plinth in the void ═══
     * No rings, no dust, no grid IN the scene (the faint column grid
     * is the CSS layer's job, matching the reference's page grid). A
     * soft contact shadow + the fog; the CSS floor glow completes the
     * grounding. */
    const figure = new Group();
    scene.add(figure);

    /* the contact shadow — a soft radial canvas pool under the pedestal */
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 128;
    {
      const ctx = shadowCanvas.getContext('2d')!;
      const g = ctx.createRadialGradient(128, 64, 6, 128, 64, 118);
      g.addColorStop(0, `rgba(0,0,2,${palette.shadowStrength})`);
      g.addColorStop(0.55, `rgba(0,0,2,${palette.shadowStrength * 0.42})`);
      g.addColorStop(1, 'rgba(0,0,2,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 128);
    }
    const shadowTexture = new CanvasTexture(shadowCanvas);
    const shadowMat = track(
      new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 1 }),
    );
    const contactShadow = new Mesh(track(new PlaneGeometry(1.24, 0.62)), shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, FLOOR_Y + 0.004, 0.02);
    contactShadow.renderOrder = 1;
    scene.add(contactShadow);

    const fog = new Fog(palette.fogColor, 7, 15);
    scene.fog = fog;

    /* ── the framing solver — the layout owns the composition ────
     * The host's --sb-fig (figure fraction of host height) and
     * --sb-floor (floor line fraction) place the figure inside the
     * box; fig/floor may EXCEED 1 (the mobile bust close-up). */
    const frame = () => {
      const w = host.clientWidth || 600;
      const h = host.clientHeight || 600;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      const style = getComputedStyle(host);
      const figFrac = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-fig')) || 0.62, 0.3), 1.9);
      const floorFrac = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-floor')) || 0.78, 0.5), 1.8);
      const span = TOP_Y - FLOOR_Y;
      const hUnits = span / figFrac;
      const dist = hUnits / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)));
      const lookY = FLOOR_Y + (floorFrac - 0.5) * hUnits;
      /* the LATERAL COMPOSITION BIAS: --sb-x shifts the camera rig
       * sideways so the figure renders at the host's inline-end band
       * while the canvas stays FULL-WIDTH. Default 0 = centered. */
      const xBias = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-x')) || 0, -1.5), 1.5);
      /* level camera (y == lookY) — the y→screen mapping is exact, so
       * the CSS floor glow at --sb-floor lands on the contact shadow */
      camera.position.set(xBias, lookY, dist);
      camera.lookAt(xBias, lookY, 0);
      camera.updateProjectionMatrix();
      fog.near = dist * 1.06;
      fog.far = dist * 2.6;
      if (reduced) renderer.render(scene, camera);
    };
    frame();
    const ro = new ResizeObserver(frame);
    ro.observe(host);
    renderer.render(scene, camera); /* the world paints pre-character */

    /* ── lifecycle state ─────────────────────────────────────────── */
    let raf = 0;
    let mo: MutationObserver | null = null;
    let io: IntersectionObserver | null = null;
    let last = performance.now();
    let visible = true;
    let unsubBeat: (() => void) | null = null;
    let frameLoop: (now: number) => void = () => {};

    /* ── the beat channel state ──────────────────────────────────── */
    let beat: HeroBeat | null = null;
    let beatAt = -1e9;

    /* ── pointer tracking targets ────────────────────────────────── */
    let targetX = 0;
    let targetY = 0;
    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const cx = (e.clientX - rect.left) / rect.width - 0.5;
      const cy = (e.clientY - rect.top) / rect.height - 0.5;
      targetX = Math.max(-0.5, Math.min(0.5, cx)) * 2; // −1..1
      targetY = Math.max(-0.5, Math.min(0.5, cy)) * 2;
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
    };

    const onVis = () => {
      if (reduced) return;
      if (!document.hidden && visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frameLoop);
      }
    };

    /* ═══ THE CHARACTER — the ChainGPT reference machine, procedural
     * build. One authored geometry pass, no loader, no external asset
     * (the reference's silhouette reconstructed: filleted head + screen
     * + two bar eyes + spectrum bezel + boxy ball-jointed body +
     * pedestal). Vertex budget < 6k. */

    /* the materials of record — matte shell / graphite / screen glass */
    const shellMat = track(
      new MeshPhysicalMaterial({
        color: palette.shell,
        roughness: 0.62,
        metalness: 0.03,
        clearcoat: 0.06,
        clearcoatRoughness: 0.6,
      }),
    );
    const graphiteMat = track(
      new MeshPhysicalMaterial({
        color: palette.graphite,
        roughness: 0.3,
        metalness: 0.9,
        clearcoat: 0.4,
        clearcoatRoughness: 0.3,
      }),
    );
    const screenMat = track(
      new MeshPhysicalMaterial({
        color: palette.screen,
        roughness: 0.22,
        metalness: 0.05,
        clearcoat: 0.35,
        clearcoatRoughness: 0.2,
      }),
    );
    const eyeMat = track(
      new MeshStandardMaterial({
        color: 0x101418,
        emissive: new Color(0xffffff),
        emissiveIntensity: palette.eyeIntensity * 1.3,
        roughness: 0.35,
        toneMapped: false, /* the eyes are LIGHT — pure white bars, no ACES */
      }),
    );

    /* W3-A: the screen grid is RETIRED — the reference's face is pure
     * black OLED glass carrying only the two dot eyes (the grid read
     * as a CRT/monitor, the #1 VLM delta). The bezel's crisp spectrum
     * lives on the TUBE geometry; the canvas texture below is only
     * the soft bloom halo. */
    const bezelTexture = makeBezelTexture();
    const bezelMat = track(
      new MeshBasicMaterial({
        map: bezelTexture,
        transparent: true,
        opacity: palette.bezelOpacity * 0.34, /* bloom only — the tube is the bezel now */
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false, /* the spectrum is LIGHT, not surface — raw colors, no ACES */
      }),
    );
    /* the bezel TUBE material — vertex-colored spectrum, unlit, raw */
    const bezelTubeMat = track(
      new MeshBasicMaterial({
        vertexColors: true,
        toneMapped: false, /* the rim is LIGHT — raw spectrum, no ACES */
      }),
    );

    /* the eye-glow sprite — the soft additive halo that makes the
     * bars legible at every canvas scale (the P18 lesson holds) */
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 128;
    glowCanvas.height = 128;
    {
      const ctx = glowCanvas.getContext('2d')!;
      const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    const glowTexture = new CanvasTexture(glowCanvas);
    const glowMat = track(
      new MeshBasicMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: palette.glowOpacity,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false, /* eye halos are light, not surface — raw, no ACES */
      }),
    );

    const character = new Group();
    figure.add(character);

    /* THE PEDESTAL — W3-A: the reference's staging is a low dark
     * RECTANGULAR plinth (the round cylinder + rim read as a podium —
     * a display-stand, not the reference's block). Quiet, near-black,
     * grounded by the contact shadow. */
    const pedestal = new Mesh(
      track(new RoundedBoxGeometry(0.82, 0.1, 0.6, 3, 0.025)),
      track(new MeshPhysicalMaterial({ color: 0x101218, roughness: 0.55, metalness: 0.45 })),
    );
    pedestal.position.y = 0.05;
    character.add(pedestal);

    /* THE BODY — W3-A iter3: reference ratios with a slightly taller
     * torso (the iter3 VLM read: +15% vs iter2's squat marshmallow) —
     * chest deepens + narrows, the two-slot chest stays. */
    const chest = new Mesh(track(new RoundedBoxGeometry(0.44, 0.34, 0.32, 4, 0.08)), shellMat);
    chest.position.y = 0.69;
    character.add(chest);
    const waist = new Mesh(track(new RoundedBoxGeometry(0.3, 0.1, 0.23, 3, 0.04)), shellMat);
    waist.position.y = 0.5;
    character.add(waist);
    const hips = new Mesh(track(new RoundedBoxGeometry(0.38, 0.14, 0.29, 3, 0.05)), shellMat);
    hips.position.y = 0.41;
    character.add(hips);
    /* iter5: ONE horizontal chest seam — the reference's panel line */
    const chestSeam = new Mesh(track(new RoundedBoxGeometry(0.32, 0.012, 0.01, 1, 0.004)), graphiteMat);
    chestSeam.position.set(0, 0.63, 0.155);
    character.add(chestSeam);

    /* the chest's two vertical dark slots (the reference's quiet
     * chest detail — indentations, not a panel) */
    const slotGeo = track(new RoundedBoxGeometry(0.042, 0.13, 0.018, 2, 0.008));
    for (const sx of [-0.085, 0.085]) {
      const slot = new Mesh(slotGeo, graphiteMat);
      slot.position.set(sx, 0.71, 0.152);
      character.add(slot);
    }

    /* THE LEGS — W3-A iter2: LONGER (the reference's legs are ~20% of
     * the figure — iter1's 11% read as stubs) with graphite knee
     * spheres, slimmer cylinders, flat feet. */
    const legGeo = track(new CylinderGeometry(0.06, 0.052, 0.2, 24));
    const kneeGeo = track(new SphereGeometry(0.052, 18, 14));
    for (const sx of [-0.13, 0.13]) {
      const leg = new Mesh(legGeo, shellMat);
      leg.position.set(sx, 0.22, 0);
      character.add(leg);
      const knee = new Mesh(kneeGeo, graphiteMat);
      knee.position.set(sx, 0.21, 0.01);
      character.add(knee);
      const foot = new Mesh(track(new RoundedBoxGeometry(0.12, 0.055, 0.2, 2, 0.02)), graphiteMat);
      foot.position.set(sx, 0.125, 0.03);
      character.add(foot);
    }

    /* THE ARMS — W3-A: ball-joint shoulders + SMOOTH off-white limbs
     * (the graphite collar seams/cuffs are RETIRED — with them the
     * arms read as striped retro tubes, the VLM's #2 delta). Each arm
     * is a pivot group at the shoulder: upper segment → elbow sphere
     * → forearm group → mitt hand, POSED asymmetrically per the
     * reference: the INLINE-START side arm (toward the hero text, +x)
     * extends outward-down in the presenting gesture; the far arm
     * bends at the elbow and rests near the hip. */
    const buildArm = (side: 1 | -1, presenting: boolean) => {
      const arm = new Group();
      const shoulder = new Mesh(track(new SphereGeometry(0.082, 24, 20)), graphiteMat);
      arm.add(shoulder);
      const upper = new Mesh(track(new CylinderGeometry(0.055, 0.05, 0.24, 20)), shellMat);
      upper.position.y = -0.13;
      arm.add(upper);
      const elbow = new Mesh(track(new SphereGeometry(0.05, 20, 16)), graphiteMat);
      elbow.position.y = -0.26;
      arm.add(elbow);
      const fore = new Group(); /* pivot at the elbow */
      fore.position.y = -0.26;
      const forearm = new Mesh(track(new CylinderGeometry(0.047, 0.043, 0.2, 20)), shellMat);
      forearm.position.y = -0.11;
      fore.add(forearm);
      const hand = new Mesh(track(new RoundedBoxGeometry(0.095, 0.105, 0.085, 2, 0.03)), shellMat);
      hand.position.y = -0.235;
      fore.add(hand);
      arm.add(fore);
      /* the pose — the reference's 3/4 read: */
      if (presenting) {
        arm.rotation.z = side * -0.8; /* the extended presenting line */
        arm.rotation.x = -0.3; /* toward the camera — the open gesture */
        fore.rotation.x = -0.06; /* straight — the presenting arm reaches */
      } else {
        arm.rotation.z = side * -0.22; /* close to the body */
        arm.rotation.x = 0.12;
        fore.rotation.x = -0.62; /* bent — the hand rides by the hip */
        fore.rotation.z = side * 0.18;
      }
      arm.position.set(side * 0.29, 0.815, 0.01);
      character.add(arm);
      return { arm, fore };
    };
    buildArm(1, true); /* +x — the presenting side (toward the RTL text) */
    buildArm(-1, false); /* -x — the resting side */

    /* THE NECK — W3-A iter2: slightly longer + slimmer so the head's
     * articulation reads (the reference shows a visible neck gap
     * between chest crown and skull underside) */
    const neck = new Mesh(track(new CylinderGeometry(0.082, 0.1, 0.14, 28)), graphiteMat);
    neck.position.y = 0.86;
    character.add(neck);

    /* THE HEAD GROUP — the filleted THICK cube (pivots at the neck for
     * pointer/gaze aliveness). W3-A: near-square 1.11:1 skull with
     * 0.16 fillets, the reference's vented TOP DECK + side ears. */
    const headGroup = new Group();
    headGroup.position.y = 0.9;
    character.add(headGroup);
    /* W3-A iter3: TALLER + narrower — the reference's rectangular boxy
     * skull (the iter2 0.62×0.56 read as a wide "TV" shape) */
    const skull = new Mesh(track(new RoundedBoxGeometry(0.6, 0.6, 0.56, 5, 0.09)), shellMat);
    skull.position.y = 0.28;
    headGroup.add(skull);
    /* the top deck — the reference's dark vented crown: a wider
     * graphite plate riding proud on the crown + three BEEFIER fins
     * (iter3: the whisper fins didn't read at hero scale) */
    const topDeck = new Mesh(track(new RoundedBoxGeometry(0.38, 0.036, 0.46, 2, 0.012)), graphiteMat);
    topDeck.position.set(0, 0.575, 0);
    headGroup.add(topDeck);
    const finGeo = track(new RoundedBoxGeometry(0.036, 0.075, 0.42, 1, 0.014));
    for (const fx of [-0.13, 0, 0.13]) {
      const fin = new Mesh(finGeo, graphiteMat);
      fin.position.set(fx, 0.585, 0);
      headGroup.add(fin);
    }

    /* THE SCREEN — the recessed black-glass panel filling ~70% of the
     * head's front. W3-A: pure black glass (the grid is retired),
     * riding just proud of the skull front so the bezel TUBE (proud of
     * both) creates the inset depth: tube front ≈ 0.337, screen front
     * ≈ 0.315, skull front = 0.31. */
    const screen = new Mesh(track(new RoundedBoxGeometry(0.46, 0.42, 0.05, 3, 0.03)), screenMat);
    screen.position.set(0, 0.31, 0.262);
    headGroup.add(screen);

    /* THE EYES — W3-A: TWO bright white circular DOTS on the screen
     * (the reference's grammar measured: circles ≈ 15-18% of the
     * screen width, upper-third, wide-set). The emissive circles +
     * tight additive halos carry them at any scale. */
    const eyeGeo = track(new CircleGeometry(0.036, 28));
    const eyeL = new Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.104, 0.355, 0.295);
    headGroup.add(eyeL);
    const eyeR = new Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.104, 0.355, 0.295);
    headGroup.add(eyeR);
    const eyeGlowGeo = track(new PlaneGeometry(0.13, 0.13));
    const eyeGlowL = new Mesh(eyeGlowGeo, glowMat);
    eyeGlowL.position.set(-0.104, 0.355, 0.298);
    headGroup.add(eyeGlowL);
    const eyeGlowR = new Mesh(eyeGlowGeo, glowMat);
    eyeGlowR.position.set(0.104, 0.355, 0.298);
    headGroup.add(eyeGlowR);

    /* THE BEZEL — W3-A: the spectrum rim is GEOMETRY now — a closed
     * TubeGeometry tracing the face inset's rounded-rect perimeter
     * (0.54×0.43 outer, fillets following the screen), each vertex
     * colored by its clockwise angle (the rainbow ring). The tube's
     * front (≈0.337) stands proud of the screen (0.315) and skull
     * (0.31) — the reference's raised glowing rim around a recessed
     * dark face. The old additive plane survives at low opacity and
     * LARGER scale purely as the soft bloom halo (cheek spill). */
    const bezelTube = new Mesh(
      track(makeBezelTubeGeometry(0.55, 0.49, 0.08, 0.03)),
      bezelTubeMat,
    );
    bezelTube.position.set(0, 0.31, 0.295);
    headGroup.add(bezelTube);
    const bezel = new Mesh(track(new PlaneGeometry(0.8, 0.7)), bezelMat);
    bezel.position.set(0, 0.31, 0.34);
    headGroup.add(bezel);

    /* the side mechanical detail — the reference's SIDE EARS: BLOCKY
     * graphite datum pads (iter5: the cylinder pucks read as dots) */
    for (const sx of [-0.3, 0.3]) {
      const pad = new Mesh(track(new RoundedBoxGeometry(0.05, 0.11, 0.13, 2, 0.018)), graphiteMat);
      pad.position.set(sx, 0.29, 0);
      headGroup.add(pad);
    }

    /* normalize the figure to the composition contract */
    {
      const box = new Box3().setFromObject(character);
      const size = box.getSize(new Vector3());
      const S = CHAR_H / Math.max(size.y, 1e-6);
      character.scale.setScalar(S);
      character.position.y = -box.min.y * S;
    }

    /* ── theme repaint (MutationObserver on html class) — the
     * procedural materials repaint with the theme, the rim re-samples
     * the landing's --ln-lime token (the phase-9 lockstep contract). */
    const repaint = () => {
      palette = samplePalette();
      faceGlow.color.setHex(palette.dark ? 0xffffff : 0x0e7a8a);
      rim.color.setHex(palette.lime);
      fog.color.copy(palette.fogColor);
      shellMat.color.setHex(palette.shell);
      graphiteMat.color.setHex(palette.graphite);
      screenMat.color.setHex(palette.screen);
      eyeMat.emissiveIntensity = palette.eyeIntensity;
      bezelMat.opacity = palette.bezelOpacity * 0.34;
      bezelTubeMat.opacity = palette.dark ? 1 : 0.82;
      bezelTubeMat.transparent = !palette.dark;
      glowMat.opacity = palette.glowOpacity;
      shadowMat.opacity = palette.dark ? 1 : 0.55;
      if (!reduced) renderer.render(scene, camera);
    };
    repaint();
    mo = new MutationObserver(repaint);
    mo.observe(document.documentElement, { attributeFilter: ['class'] });

    /* ── the beat channel: subscribe + adopt the current beat ──── */
    const onBeat = (d: HeroBeatDetail) => {
      beat = d.beat;
      beatAt = performance.now();
    };
    const current = lastHeroBeat();
    if (current) onBeat(current);
    if (!reduced) unsubBeat = subscribeHeroBeat(onBeat);

    /* ── pointer tracking: head ±22°/±10° ── */
    if (!reduced && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerleave', onLeave, { passive: true });
    }

    /* ── the frame loop — reference-led aliveness ─────────────────
     * NO body bob, NO sway (the directive: the primitive motion dies).
     * What animates: (1) pointer head tracking (damped), (2) the slow
     * autonomous gaze wander, (3) the eyes' luminous breath (light,
     * not motion), (4) the beat reactions (look toward the console,
     * eyes brighten, bezel hue law, reply shimmer, handoff body tip).
     * Zero per-frame allocations. */
    let yaw = 0;
    let pitch = 0;
    let lookBias = 0;
    let eyeWide = 1;
    let scanPhase = 0;
    let bodyTip = 0;
    const t0 = performance.now();
    /* the beat tint — the bezel's temperature (the law rides the rim) */
    const beatTint = new Color(0xffffff);
    const tmpColor = new Color();

    frameLoop = (now: number) => {
      raf = 0;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = (now - t0) / 1000;

      /* lerp toward the pointer targets */
      yaw = MathUtils.lerp(yaw, targetX * MathUtils.degToRad(22), 1 - Math.pow(0.0015, dt));
      pitch = MathUtils.lerp(pitch, targetY * MathUtils.degToRad(10), 1 - Math.pow(0.0015, dt));

      /* scenario reaction targets (the beat drives the character) */
      const b = beat ?? 'reset';
      lookBias = MathUtils.lerp(lookBias, b === 'inbound' ? 0.34 : 0, 1 - Math.pow(0.02, dt));
      eyeWide = MathUtils.lerp(eyeWide, b === 'inbound' ? 1.5 : 1, 1 - Math.pow(0.04, dt));
      scanPhase = MathUtils.lerp(scanPhase, b === 'reply' ? 1 : 0, 1 - Math.pow(0.05, dt));
      bodyTip = MathUtils.lerp(bodyTip, b === 'handoff' ? 1 : 0, 1 - Math.pow(0.03, dt));
      let corePulse = 0;
      if (b === 'classify') {
        const since = (now - beatAt) / 1000;
        if (since >= 0 && since < 1.4) {
          corePulse = Math.abs(Math.sin(since * Math.PI * 2.4)) * Math.exp(-since * 2.2);
        }
      }

      /* the beat tint law — the BEZEL's temperature tells the story:
       * the neutral spectrum at rest; VIOLET-lean while classifying
       * (the AI register); AMBER-lean on handoff (the human register).
       * Lerped — a temperature shift, never a flash. The eyes stay
       * white (the reference's LED grammar, held). */
      const tintHex = b === 'classify' ? VIOLET : b === 'handoff' ? AMBER : 0xffffff;
      beatTint.lerp(tmpColor.setHex(tintHex), 1 - Math.pow(0.06, dt));
      bezelMat.color.copy(beatTint);
      bezelTubeMat.color.copy(beatTint);

      /* THE HEAD — pointer tracking + the beat's look bias + the
       * autonomous gaze wander (the body stays STILL: reference law) */
      const wander = Math.sin(t * 0.21) * 0.12 + Math.sin(t * 0.07) * 0.05;
      headGroup.rotation.y = yaw + wander + lookBias;
      headGroup.rotation.x = pitch + Math.sin(t * 0.17) * 0.02 + bodyTip * 0.05;
      headGroup.rotation.z = 0.012 + Math.sin(t * 0.13) * 0.008;
      /* the body tips slightly with the handoff beat only (an
       * instrument-grade lean, never a toy sway). W3-A iter2: a REST
       * body yaw (+11°) — the reference's 3/4 read (its body angles
       * toward its presenting side; ours mirrors toward the RTL
       * content) instead of iter1's flat frontal stance. */
      const REST_YAW = 0.2;
      character.rotation.x = bodyTip * 0.04;
      character.rotation.y = MathUtils.lerp(character.rotation.y, REST_YAW + lookBias * 0.3, 1 - Math.pow(0.01, dt));

      /* THE EYES — the expression channel: the idle luminous breath
       * ±12%; inbound brightens + widens; reply runs a fast shimmer. */
      const breath = 1 + Math.sin(t * 1.5) * 0.12;
      const scan = 1 + Math.sin(t * 9) * 0.07 * scanPhase;
      eyeL.scale.setScalar(eyeWide * scan);
      eyeR.scale.setScalar(eyeWide * scan);
      eyeGlowL.scale.setScalar(breath * eyeWide * (1 + corePulse * 0.3));
      eyeGlowR.scale.setScalar(breath * eyeWide * (1 + corePulse * 0.3));
      eyeMat.emissiveIntensity = palette.eyeIntensity * breath * eyeWide + scanPhase * 0.35;
      glowMat.opacity = palette.glowOpacity * (0.8 + 0.2 * breath);

      renderer.render(scene, camera);
      if (visible && !document.hidden) raf = requestAnimationFrame(frameLoop);
    };

    if (reduced) {
      /* one static posed frame — the machine mid-gaze: a soft 3/4
       * attention, the eyes at rest, no rAF, no tracking, no beat
       * channel (the ticker composes its own static first beat) */
      headGroup.rotation.y = MathUtils.degToRad(-12);
      headGroup.rotation.x = 0.02;
      character.rotation.y = 0.2;
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(frameLoop);
    }

    /* ── pausing: offscreen + hidden tab ─────────────────────────── */
    io = new IntersectionObserver(
      (entries) => {
          const was = visible;
          visible = entries[entries.length - 1].isIntersecting;
          if (reduced) return;
          if (visible && !was && !raf && !document.hidden) {
            last = performance.now();
            raf = requestAnimationFrame(frameLoop);
          }
        },
        { rootMargin: '80px 0px' },
    );
    io.observe(host);
    document.addEventListener('visibilitychange', onVis);

    /* ── teardown: dispose EVERY geometry/material, kill observers ── */
    return () => {
      if (raf) cancelAnimationFrame(raf);
      mo?.disconnect();
      ro.disconnect();
      io?.disconnect();
      unsubBeat?.();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      shadowTexture.dispose();
      glowTexture.dispose();
      bezelTexture.dispose();
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className={className ? `ln-robot ${className}` : 'ln-robot'} ref={hostRef} aria-hidden="true">
      {failed ? (
        <div className="ln-character-fallback">
          <CharacterFallbackSvg />
        </div>
      ) : null}
    </div>
  );
}

export default CharacterScene;
