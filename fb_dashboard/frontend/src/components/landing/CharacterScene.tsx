'use client';

/* P21-C — THE CHAINGPT REFERENCE CHARACTER (the binding rebuild).
 *
 * Phase 21 replaces the P19 Vessel (owner-rejected: lathe-turned
 * porcelain, ONE cyan arc eye — a personal concept, not the reference)
 * with a faithful reconstruction of the ChainGPT robot's design language
 * (chaingpt.org marketing hero — the binding visual reference, measured
 * via live browser capture + VLM audit in p21-research/chaingpt/):
 *
 * THE CHARACTER (silhouette of record — the boxy machine companion):
 * · ONE filleted-cube HEAD (RoundedBoxGeometry) — the reference's wide
 *   square skull with heavy corner radii, riding a graphite neck;
 * · THE FACE is a recessed dark-glass SCREEN filling ~70% of the head's
 *   front, carrying a faint instrument grid (canvas texture) — never a
 *   protruding slab;
 * · THE EYES are TWO bright white horizontal bars (slightly rounded,
 *   softly glowing) on the screen — the reference's LED grammar, never
 *   one arc;
 * · THE BEZEL is the spectrum rim-light: a thick glowing frame around
 *   the screen carrying the ChainGPT gradient (cyan → blue → purple →
 *   pink → orange), the character's principal light source;
 * · the BODY is boxy: filleted chest block + waist + hip, ball-joint
 *   shoulders (graphite spheres), segmented cylinder arms with elbow
 *   spheres and mitt hands, short legs with flat feet;
 * · MATERIALS: matte off-white shell (roughness 0.6 — the reference's
 *   clay/plastic read, NOT glossy porcelain), dark graphite joints,
 *   glossy black screen glass. PMREM RoomEnvironment for believable
 *   material response at low intensity.
 * · THE PEDESTAL: the figure stands on a dark near-black plinth (the
 *   reference's staging), grounded by the contact shadow.
 *
 * MOTION — reference-led stillness (the directive: remove primitive
 * bobbing): NO body bob, NO sway. What remains is exactly the
 * reference's instrument-grade life: (1) POINTER head tracking
 * ±22°/±10° (critically damped); (2) a slow autonomous gaze wander;
 * (3) the eyes' luminous breath (intensity only — light, not motion);
 * (4) SCENARIO (heroBus beats): inbound → the head turns toward the
 *   console + the eyes brighten; classify → the bezel warms VIOLET;
 *   reply → a fast eye shimmer; handoff → the body tips forward +
 *   the bezel warms AMBER. RM → one static posed frame.
 *
 * KEPT (the graded integration contracts, unchanged): the token-
 * sampling palette + runtime theme repaint (MutationObserver on html
 * class), the beat channel, the framing solver (--sb-fig/--sb-floor/
 * --sb-x with clamps), the pause family (IO + visibilitychange), the
 * DPR 2 cap, the disposal sweep, and the WebGL probe + art-directed
 * SVG fallback (redrawn to the SAME boxy silhouette).
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
  type Material,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { subscribeHeroBeat, lastHeroBeat, type HeroBeat, type HeroBeatDetail } from './heroBus';

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
 * the reference hero: cyan → blue → purple → pink → orange). */
const SPECTRUM_STOPS = ['#00f0ff', '#4a6bff', '#b04dff', '#ff5ac8', '#ff8a3c'];

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
    shell: 0xe8e6e1,
    graphite: 0x1e2026,
    screen: 0x04060a,
    lime: readVar(html, '--ln-lime', CYAN),
    eyeIntensity: 2.4, /* survives ACES at mobile scale */
    bezelOpacity: 0.98,
    glowOpacity: 0.85,
    shadowStrength: 0.62,
    fogColor: new Color(0x050506),
  };
}

/* ── the bezel spectrum texture — a rounded-rect frame stroke carrying
 * the ChainGPT gradient (canvas-authored, no external asset). P21-C
 * v2: the first cut measured TOO SUBTLE at hero scale (the frame read
 * as a partial top-rim accent) — the stroke is now thicker (52px),
 * fully opaque, and carries a wide soft bloom pass so the spectrum
 * reads as the character's principal light at ANY distance. */
function makeBezelTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 400;
  const ctx = c.getContext('2d')!;
  /* the reference's rim is a CLOCKWISE spectrum sweep around the frame
   * (cyan → blue → purple → pink → orange → back) — a conic gradient
   * centered on the face reproduces every hue around the perimeter
   * (linear-diagonal skewed cyan-dominant in the first cut; conic
   * measured: all four hue families visible). Fallback: linear. */
  let g: CanvasGradient;
  if (typeof ctx.createConicGradient === 'function') {
    g = ctx.createConicGradient(-Math.PI / 2, 256, 200);
  } else {
    g = ctx.createLinearGradient(24, 20, 488, 380);
  }
  SPECTRUM_STOPS.forEach((hex, i) => g.addColorStop(i / (SPECTRUM_STOPS.length - 1), hex));
  /* the wide soft bloom FIRST (under the core stroke) — the glow that
   * bleeds onto the shell cheeks, the reference's rim-light spill */
  ctx.strokeStyle = g;
  ctx.lineWidth = 104;
  ctx.globalAlpha = 0.4;
  roundRectPath(ctx, 26, 22, 460, 356, 54);
  ctx.stroke();
  ctx.globalAlpha = 1;
  /* the CORE stroke — thick, fully saturated, the principal light */
  ctx.strokeStyle = g;
  ctx.lineWidth = 64;
  roundRectPath(ctx, 26, 22, 460, 356, 54);
  ctx.stroke();
  return new CanvasTexture(c);
}

/* ── the screen's instrument grid — the reference's faint matrix on
 * the black glass (a quiet machine surface, never a busy display;
 * v5: sparser + dimmer — at hero distance a 0.10-alpha 16px grid
 * merged into a blue wash that read as a 'window', not a face). */
function makeScreenTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#03050a';
  ctx.fillRect(0, 0, 256, 192);
  ctx.strokeStyle = 'rgba(86, 226, 242, 0.055)';
  ctx.lineWidth = 1;
  for (let x = 10; x < 256; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x, 188);
    ctx.stroke();
  }
  for (let y = 10; y < 192; y += 20) {
    ctx.beginPath();
    ctx.moveTo(4, y);
    ctx.lineTo(252, y);
    ctx.stroke();
  }
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
 * A composed SVG portrait of the SAME boxy reference character — the
 * filleted head, the recessed screen with the TWO white bar eyes, the
 * spectrum bezel, the graphite joints, the pedestal — so a WebGL-less
 * client gets the P21 hero, never a hole. */
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
      {/* the segmented arms (hanging, slightly bent) */}
      <path d="M 100 282 L 96 318 L 102 344 L 106 344 L 106 318 L 110 284 Z" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />
      <circle cx="102" cy="322" r="8" fill="#26282F" />
      <path d="M 260 282 L 264 318 L 258 344 L 254 344 L 254 318 L 250 284 Z" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />
      <circle cx="258" cy="322" r="8" fill="#26282F" />
      {/* the mitt hands */}
      <rect x="94" y="344" width="20" height="24" rx="6" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />
      <rect x="246" y="344" width="20" height="24" rx="6" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />

      {/* the chest vent — a quiet graphite datum strip */}
      <rect x="152" y="282" width="56" height="6" rx="3" fill="#26282F" />

      {/* THE NECK — the graphite collar the head rides on */}
      <rect x="162" y="236" width="36" height="24" rx="6" fill="#26282F" />

      {/* THE HEAD — the filleted cube */}
      <rect x="106" y="62" width="148" height="122" rx="26" fill="url(#sb-fb-shell)" stroke="#8A8C90" strokeWidth="1" />

      {/* THE SCREEN — the recessed black glass (≈70% of the face) */}
      <rect x="124" y="84" width="112" height="78" rx="14" fill="url(#sb-fb-screen)" />

      {/* THE BEZEL — the spectrum rim-light frame */}
      <rect x="119" y="79" width="122" height="88" rx="17" fill="none" stroke="url(#sb-fb-bezel)" strokeWidth="6" />

      {/* THE EYES — two white bars, softly glowing */}
      <ellipse cx="146" cy="122" rx="24" ry="14" fill="url(#sb-fb-eyeglow)" />
      <ellipse cx="214" cy="122" rx="24" ry="14" fill="url(#sb-fb-eyeglow)" />
      <rect x="136" y="115" width="22" height="13" rx="4" fill="#FFFFFF" />
      <rect x="202" y="115" width="22" height="13" rx="4" fill="#FFFFFF" />
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
    renderer.toneMappingExposure = 1.14;
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
     * neutral warm key (the studio read), a QUITE stronger cool rim on
     * the inline-start (the bezel's cyan spill), the amber kicker low
     * on inline-end (the spectrum's warm end), quiet fill. The bezel
     * emissive + eye glow carry the character light; shadow-less. */
    const key = new DirectionalLight(0xfff1e4, 1.6);
    key.position.set(2.4, 4.0, 3.0);
    scene.add(key);
    const rim = new DirectionalLight(CYAN, 2.3);
    rim.position.set(-3.4, 3.2, -2.6);
    scene.add(rim);
    const kicker = new DirectionalLight(AMBER, 1.1);
    kicker.position.set(3.2, 1.5, -2.5);
    scene.add(kicker);
    const fill = new AmbientLight(0x14161c, 0.95);
    scene.add(fill);
    const faceGlow = new PointLight(0xffffff, 0.9, 3.4, 2);
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
        roughness: 0.58,
        metalness: 0.04,
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
      }),
    );
    const graphiteMat = track(
      new MeshPhysicalMaterial({
        color: palette.graphite,
        roughness: 0.32,
        metalness: 0.88,
        clearcoat: 0.4,
        clearcoatRoughness: 0.3,
      }),
    );
    const screenMat = track(
      new MeshPhysicalMaterial({
        color: palette.screen,
        roughness: 0.1,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
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

    /* the screen's instrument grid + the bezel's spectrum frame */
    const screenTexture = makeScreenTexture();
    const screenGridMat = track(
      new MeshBasicMaterial({ map: screenTexture, transparent: false }),
    );
    const bezelTexture = makeBezelTexture();
    const bezelMat = track(
      new MeshBasicMaterial({
        map: bezelTexture,
        transparent: true,
        opacity: palette.bezelOpacity,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false, /* the spectrum is LIGHT, not surface — raw colors, no ACES */
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

    /* THE PEDESTAL — the dark plinth the figure stands on (the
     * reference's staging): a near-black low cylinder with a graphite
     * top rim, quietly grounding the machine. */
    const pedestal = new Mesh(
      track(new CylinderGeometry(0.5, 0.56, 0.12, 48)),
      track(new MeshPhysicalMaterial({ color: 0x101218, roughness: 0.5, metalness: 0.55 })),
    );
    pedestal.position.y = 0.06;
    character.add(pedestal);
    const pedestalRim = new Mesh(track(new CylinderGeometry(0.505, 0.505, 0.02, 48)), graphiteMat);
    pedestalRim.position.y = 0.125;
    character.add(pedestalRim);

    /* THE BODY — boxy: chest block (filleted) + waist + hips, one
     * matte-shell family with graphite datum strips. */
    const chest = new Mesh(track(new RoundedBoxGeometry(0.5, 0.44, 0.34, 4, 0.09)), shellMat);
    chest.position.y = 0.55;
    character.add(chest);
    const waist = new Mesh(track(new RoundedBoxGeometry(0.34, 0.14, 0.24, 3, 0.05)), shellMat);
    waist.position.y = 0.29;
    character.add(waist);
    const hips = new Mesh(track(new RoundedBoxGeometry(0.42, 0.16, 0.3, 3, 0.06)), shellMat);
    hips.position.y = 0.19;
    character.add(hips);

    /* the chest datum strip (the quiet machine vent) + v5: the chest
     * PANEL grammar — a slightly recessed graphite-edged panel with
     * three vent slits (the reference's mechanical chest read) */
    const chestPanel = new Mesh(track(new RoundedBoxGeometry(0.34, 0.16, 0.02, 2, 0.01)), graphiteMat);
    chestPanel.position.set(0, 0.62, 0.168);
    character.add(chestPanel);
    for (const vy of [0.585, 0.62, 0.655]) {
      const vent = new Mesh(track(new RoundedBoxGeometry(0.26, 0.018, 0.014, 2, 0.007)), shellMat);
      vent.position.set(0, vy, 0.181);
      character.add(vent);
    }

    /* THE LEGS — short cylinders + flat feet (the reference's stance) */
    const legGeo = track(new CylinderGeometry(0.062, 0.055, 0.22, 24));
    for (const sx of [-0.13, 0.13]) {
      const leg = new Mesh(legGeo, shellMat);
      leg.position.set(sx, 0.145, 0);
      character.add(leg);
      const foot = new Mesh(track(new RoundedBoxGeometry(0.12, 0.06, 0.2, 2, 0.02)), graphiteMat);
      foot.position.set(sx, 0.135, 0.03);
      character.add(foot);
    }

    /* THE ARMS — ball-joint shoulders (graphite spheres) + segmented
     * cylinders + elbow spheres + mitt hands, hanging with a slight
     * bend (the reference's relaxed stance). */
    for (const sx of [-0.3, 0.3]) {
      const shoulder = new Mesh(track(new SphereGeometry(0.085, 24, 20)), graphiteMat);
      shoulder.position.set(sx, 0.72, 0);
      character.add(shoulder);
      const upper = new Mesh(track(new CylinderGeometry(0.05, 0.045, 0.24, 20)), shellMat);
      upper.position.set(sx * 1.06, 0.56, 0.02);
      character.add(upper);
      const elbow = new Mesh(track(new SphereGeometry(0.048, 20, 16)), graphiteMat);
      elbow.position.set(sx * 1.1, 0.44, 0.03);
      character.add(elbow);
      const forearm = new Mesh(track(new CylinderGeometry(0.043, 0.04, 0.2, 20)), shellMat);
      forearm.position.set(sx * 1.12, 0.33, 0.055);
      character.add(forearm);
      const hand = new Mesh(track(new RoundedBoxGeometry(0.09, 0.12, 0.08, 2, 0.03)), shellMat);
      hand.position.set(sx * 1.13, 0.22, 0.07);
      character.add(hand);
    }

    /* THE NECK — the graphite collar the head rides on (the
     * articulation seam, engineered not dislocated) */
    const neck = new Mesh(track(new CylinderGeometry(0.085, 0.1, 0.1, 28)), graphiteMat);
    neck.position.y = 0.8;
    character.add(neck);

    /* THE HEAD GROUP — the filleted THICK cube (pivots at the neck for
     * pointer/gaze aliveness; the reference's big square skull reads as
     * a SOLID BLOCK — v5: depth up 0.42 → 0.5, width down to a cube-ish
     * 0.5, never a flat picture-frame) */
    const headGroup = new Group();
    headGroup.position.y = 0.86;
    character.add(headGroup);
    const skull = new Mesh(track(new RoundedBoxGeometry(0.5, 0.44, 0.5, 5, 0.1)), shellMat);
    skull.position.y = 0.22;
    headGroup.add(skull);

    /* THE SCREEN — the recessed black-glass panel filling ~70% of the
     * head's front: an inset slab + the instrument-grid face. Set INTO
     * the skull (its front sits just inside the shell's front face). */
    const screen = new Mesh(track(new RoundedBoxGeometry(0.37, 0.28, 0.035, 3, 0.02)), screenMat);
    screen.position.set(0, 0.23, 0.235);
    headGroup.add(screen);
    const screenGrid = new Mesh(track(new PlaneGeometry(0.33, 0.24)), screenGridMat);
    screenGrid.position.set(0, 0.23, 0.254);
    headGroup.add(screenGrid);

    /* THE EYES — TWO bright white horizontal bars on the screen (the
     * reference's LED grammar: slightly rounded, softly glowing). The
     * emissive + the additive halos carry them past ACES at any scale. */
    const eyeGeo = track(new RoundedBoxGeometry(0.115, 0.038, 0.014, 2, 0.006));
    const eyeL = new Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.088, 0.235, 0.264);
    headGroup.add(eyeL);
    const eyeR = new Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.088, 0.235, 0.264);
    headGroup.add(eyeR);
    const eyeGlowGeo = track(new PlaneGeometry(0.3, 0.18));
    const eyeGlowL = new Mesh(eyeGlowGeo, glowMat);
    eyeGlowL.position.set(-0.088, 0.235, 0.27);
    headGroup.add(eyeGlowL);
    const eyeGlowR = new Mesh(eyeGlowGeo, glowMat);
    eyeGlowR.position.set(0.088, 0.235, 0.27);
    headGroup.add(eyeGlowR);

    /* THE BEZEL — the spectrum rim-light frame around the screen (the
     * character's principal light source, the ChainGPT gradient). An
     * additive plane carrying the gradient frame texture, riding just
     * in front of the screen's edges. */
    const bezel = new Mesh(track(new PlaneGeometry(0.5, 0.39)), bezelMat);
    bezel.position.set(0, 0.23, 0.258);
    headGroup.add(bezel);

    /* the side mechanical detail — a small graphite ear puck on each
     * side of the skull (the reference's side profile datum) */
    for (const sx of [-0.255, 0.255]) {
      const puck = new Mesh(track(new CylinderGeometry(0.035, 0.035, 0.03, 20)), graphiteMat);
      puck.rotation.z = Math.PI / 2;
      puck.position.set(sx, 0.23, 0);
      headGroup.add(puck);
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
      bezelMat.opacity = palette.bezelOpacity;
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

      /* THE HEAD — pointer tracking + the beat's look bias + the
       * autonomous gaze wander (the body stays STILL: reference law) */
      const wander = Math.sin(t * 0.21) * 0.12 + Math.sin(t * 0.07) * 0.05;
      headGroup.rotation.y = yaw + wander + lookBias;
      headGroup.rotation.x = pitch + Math.sin(t * 0.17) * 0.02 + bodyTip * 0.05;
      headGroup.rotation.z = 0.012 + Math.sin(t * 0.13) * 0.008;
      /* the body tips slightly with the handoff beat only (an
       * instrument-grade lean, never a toy sway) */
      character.rotation.x = bodyTip * 0.04;
      character.rotation.y = MathUtils.lerp(character.rotation.y, lookBias * 0.3, 1 - Math.pow(0.01, dt));

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
      character.rotation.y = MathUtils.degToRad(-6);
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
      screenTexture.dispose();
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
