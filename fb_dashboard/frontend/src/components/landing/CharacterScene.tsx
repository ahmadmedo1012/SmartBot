'use client';

/* P18-W2-a — THE OBELISK ATTENDANT (the §2.1/§2.2 rebuild).
 *
 * The chibi boxy-CRT-head GLB is SUPERSEDED by a NEW, fully
 * procedural Three.js character — authored BufferGeometry, no
 * external asset, no loader on the critical path (Blender is absent
 * from this environment; procedural geometry IS the pipeline). The
 * retired GLB stays on disk at public/models/smartbot-character.glb
 * for provenance only — it is never fetched.
 *
 * THE CHARACTER (silhouette of record — asymmetric obelisk):
 * · proportions head : torso : base ≈ 1 : 2.2 : 1.2 (tall monolith,
 *   NOT chibi — a deliberate presence, not a toy);
 * · HEAD — a softly-faceted ASYMMETRIC wedge prism (authored
 *   BufferGeometry, 6 vertical stations + a swept chamfer: the
 *   inline-start brow plane sweeps LOW toward the jaw on one side,
 *   the far side stays clean) — one sculptural volume, never a box;
 * · FACE — a smoked-glass panel SET INTO the head's inline-start
 *   facet (the existing black-glass visor material system), carrying
 * · ONE VERTICAL LUMINOUS APERTURE SLIT (cyan #56E2F2, emissive) —
 *   the single eye; expression = the slit's width/phase, modulated
 *   by the idle breathing (NEVER two dot eyes — the ChainGPT law);
 * · NECK — a graphite gimbal ring stack (two torus segments + a
 *   bearing band) between head and mantle (a modeled transition);
 * · MANTLE — 3 overlapping lathe-turned ceramic shrouds in the
 *   existing #DAD9D6 body-of-record, with a graphite core band
 *   revealed between the upper and lower layers, one cyan core
 *   disc at the chest, and the ONE tri-hue edge strip.
 *
 * KEPT FROM P17 (the graded systems — untouched contracts): the
 * ceramic/visor/graphite materials + runtime palette repaint
 * (MutationObserver on html class), the light rig (neutral key +
 * cool cyan rim −x + warm amber kicker +x + face glow), the beat
 * hues (classify→VIOLET, handoff→AMBER on the core + aperture),
 * the idle breathing/blink-equivalent (aperture phase), the
 * framing solver (--sb-fig/--sb-floor with clamps), the pause
 * family (IO + visibilitychange), the disposal sweep, the RM static
 * pose, the DPR 2 cap, and the heroBus beat channel.
 *
 * ALIVENESS — three timescales, instrument-grade amplitudes:
 * (1) POINTER: head ±25°/±12°, mantle ~40% (critically damped);
 * (2) IDLE: breathing bob ±1.2% of height, aperture width phase,
 *     strip cyan→violet→amber rotation (18s);
 * (3) SCENARIO (heroBus): inbound → head turns toward the console +
 *     aperture WIDENS; classify → core + aperture pulse VIOLET;
 *     reply → aperture phase scans (the slit breathes quickly);
 *     handoff → the mantle tips forward + core warms AMBER.
 *
 * The fallback SVG (WebGL failure) is redrawn to the SAME obelisk
 * silhouette — asymmetric wedge head + vertical aperture + mantle —
 * so the WebGL-less client sees the same character, never the old
 * chibi. */

import { useEffect, useRef, useState } from 'react';
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  CylinderGeometry,
  TorusGeometry,
  LatheGeometry,
  PlaneGeometry,
  BoxGeometry,
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  Fog,
  DirectionalLight,
  AmbientLight,
  PointLight,
  Color,
  MathUtils,
  CanvasTexture,
  ACESFilmicToneMapping,
  Box3,
  Vector2,
  Vector3,
  DoubleSide,
  type Material,
} from 'three';
import { subscribeHeroBeat, lastHeroBeat, type HeroBeat, type HeroBeatDetail } from './heroBus';

export type CharacterSceneProps = {
  className?: string;
};

/* Emissive constants — the phase-17 accent registers (the machine
 * instrument law): CYAN = the machine's voice; VIOLET = the AI register
 * (classify beats); AMBER = the human/handoff warm register. These are
 * the fallbacks; the live values are sampled from the .landing token
 * scope so the character repaints with the theme. */
const CYAN = 0x56e2f2;
const VIOLET = 0x9380ff;
const AMBER = 0xff9a69;

/* ── the composition contract (world units) ────────────────────────
 * The framing solver places these inside the host box:
 *   FLOOR_Y — the grid floor the pedestal base stands on
 *   CHAR_H  — the character's normalized height (feet ON the pedestal)
 *   TOP_Y   — the figure's crown (head crown + breathing margin)   */
const FLOOR_Y = -0.19;
const CHAR_H = 1.9;
const TOP_Y = CHAR_H + 0.04;

/* ── the OBELISK proportion constants (P18 proportions of record) ──
 * head : torso : base ≈ 1 : 2.2 : 1.2 — the tall monolith presence.
 * HEAD_H 0.42, MANTLE_H 0.92, PLINTH_H 0.50 ≈ 1 : 2.2 : 1.2 scaled. */
const HEAD_H = 0.44;
const MANTLE_H = 0.94;
const NECK_H = 0.10;
const GIMBAL_Y = MANTLE_H + NECK_H; /* neck sits on the mantle */
const HEAD_Y0 = GIMBAL_Y + HEAD_H * 0.5; /* head's pivot (its center) */

/* Sampling bridge: read the landing token vars off <html> (the .landing
 * scope declares them; a landing mount implies html context) and parse
 * hex/rgb() to a number. Falls back to the dark-stage constant. */
function readVar(el: Element | null, name: string, fallback: number): number {
  try {
    if (!el) return fallback;
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const m = raw.match(
      /^#([0-9a-f]{6})$/i,
    );
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
  body: number;
  mantleLower: number;
  joint: number;
  visor: number;
  visorGlow: number;
  visorIntensity: number;
  aperture: number;
  apertureIntensity: number;
  core: number;
  coreIntensity: number;
  stage: number;
  pedTop: number;
  pedRing: number;
  grid: number;
  particle: number;
  fogColor: Color;
};

function samplePalette(): Palette {
  const html = document.documentElement;
  if (html.classList.contains('light')) {
    return {
      dark: false,
      /* the porcelain-day stage: the ceramic obelisk holds via its
       * graphite gimbal + black glass face (contrast carries the
       * silhouette); the accents drop to their ink grades */
      body: 0xdad9d6,
      mantleLower: 0xc9c8c4,
      joint: 0x898b90,
      visor: 0x090a0d,
      visorGlow: 0x14262c,
      visorIntensity: 0.35,
      aperture: 0x0e7a8a,
      apertureIntensity: 1.0,
      core: 0x0e7a8a,
      coreIntensity: 0.7,
      stage: 0xe1e1de,
      pedTop: 0xc9c9c6,
      pedRing: 0x0e7a8a,
      grid: 0x8a9ba3,
      particle: 0x55585f,
      fogColor: new Color(0xf2f2f0),
    };
  }
  return {
    dark: true,
    /* dark stage — THE phase-17 inversion: the ceramic obelisk
     * (#DAD9D6 — --sb-robot-body) is the scene's principal light
     * source (the light figure on the near-black void). The face is
     * black glass set into the wedge; the aperture slit is the cyan
     * heartbeat; the core disc breathes the beat hues. */
    body: 0xdad9d6,
    mantleLower: 0xc9c8c4,
    joint: 0x898b90,
    visor: 0x090a0d,
    visorGlow: 0x08151c,
    visorIntensity: 0.35,
    aperture: 0xffffff,
    apertureIntensity: 2.2,
    core: readVar(html, '--ln-lime', CYAN),
    coreIntensity: 1.15,
    stage: 0x0a0b0e,
    pedTop: 0x17181d,
    pedRing: readVar(html, '--ln-lime', CYAN),
    grid: 0x1e3a40,
    particle: 0x777983,
    fogColor: new Color(0x050506),
  };
}

/* ── the art-directed static fallback frame (WebGL absent / failed) ──
 * A composed SVG portrait of the SAME obelisk character — the
 * asymmetric wedge head with the swept brow chamfer, the smoked-glass
 * facet, the ONE vertical aperture slit, the graphite gimbal rings,
 * the layered ceramic mantle with the metallic core band, the cyan
 * core disc + the tri-hue edge strip — so a WebGL-less client gets
 * the P18 hero, never a hole. Same phase-17 values as the scene. */
function CharacterFallbackSvg() {
  return (
    <svg viewBox="0 0 360 470" role="presentation" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id="sb-fb-wedge" x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0" stopColor="#E4E4E0" />
          <stop offset="0.5" stopColor="#DAD9D6" />
          <stop offset="1" stopColor="#BDBDB9" />
        </linearGradient>
        <linearGradient id="sb-fb-visor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B0C10" />
          <stop offset="1" stopColor="#050507" />
        </linearGradient>
        <linearGradient id="sb-fb-strip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#56E2F2" />
          <stop offset="1" stopColor="#9380FF" />
        </linearGradient>
        <radialGradient id="sb-fb-apglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#56E2F2" stopOpacity="0.5" />
          <stop offset="1" stopColor="#56E2F2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sb-fb-coreglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#56E2F2" stopOpacity="0.5" />
          <stop offset="1" stopColor="#56E2F2" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* contact shadow */}
      <ellipse cx="180" cy="452" rx="112" ry="12" fill="rgb(1 1 2 / 0.85)" />

      {/* the pedestal — the turned plinth + emissive rim */}
      <path d="M 84 384 L 276 384 L 286 416 L 74 416 Z" fill="#141519" stroke="#292A30" strokeWidth="1" />
      <path d="M 74 416 L 286 416 L 296 442 L 64 442 Z" fill="#0A0B0E" />
      <ellipse cx="180" cy="384" rx="94" ry="10" fill="#101115" />
      <ellipse cx="180" cy="384" rx="94" ry="10" fill="none" stroke="#56E2F2" strokeWidth="2" opacity="0.7" />

      {/* the plinth base of the obelisk (proportion tier 3) */}
      <path d="M 108 340 L 252 340 L 244 384 L 116 384 Z" fill="url(#sb-fb-wedge)" stroke="#898B90" strokeWidth="1" />

      {/* the mantle — layered ceramic shrouds (tier 2) */}
      <path d="M 100 220 C 100 200 118 190 180 190 C 242 190 260 200 260 220 L 252 344 L 108 344 Z" fill="url(#sb-fb-wedge)" stroke="#898B90" strokeWidth="1" />
      {/* the upper shroud overlaps lower — the layered mantle read */}
      <path d="M 118 196 C 136 186 156 182 180 182 C 204 182 224 186 242 196 L 234 262 L 126 262 Z" fill="#E9E9E5" stroke="#898B90" strokeWidth="1" opacity="0.95" />
      {/* the metallic core band revealed between layers */}
      <path d="M 126 262 L 234 262 L 232 276 L 128 276 Z" fill="#898B90" opacity="0.9" />
      {/* the chest core disc — the cyan heartbeat */}
      <circle cx="180" cy="298" r="30" fill="url(#sb-fb-coreglow)" />
      <circle cx="180" cy="298" r="10" fill="#56E2F2" />
      {/* the lower shroud */}
      <path d="M 128 276 L 232 276 L 244 336 L 116 336 Z" fill="#CFCFCC" stroke="#898B90" strokeWidth="1" />

      {/* the ONE edge strip — the tri-hue light signature */}
      <path d="M 254 214 C 258 254 258 300 250 342" stroke="url(#sb-fb-strip)" strokeWidth="8" fill="none" opacity="0.2" />
      <path d="M 254 214 C 258 254 258 300 250 342" stroke="url(#sb-fb-strip)" strokeWidth="3" fill="none" opacity="0.9" />

      {/* the graphite gimbal ring stack (the neck) */}
      <rect x="126" y="160" width="108" height="7" rx="3" fill="#898B90" />
      <rect x="132" y="170" width="96" height="6" rx="3" fill="#74767B" />
      <rect x="128" y="178" width="104" height="5" rx="2.5" fill="#898B90" opacity="0.85" />

      {/* THE HEAD — the asymmetric wedge prism: the inline-start
          brow sweeps low (the chamfer), the far side stays clean */}
      <path
        d="M 118 156 L 242 156 L 250 88 L 226 34 L 118 34 Z"
        fill="url(#sb-fb-wedge)"
        stroke="#898B90"
        strokeWidth="1"
      />
      {/* the swept brow plane — the inline-start chamfer read */}
      <path d="M 118 34 L 100 78 L 112 156 L 118 156 Z" fill="#C9C9C5" stroke="#898B90" strokeWidth="1" />

      {/* the smoked-glass facet SET INTO the wedge's inline-start face */}
      <path d="M 118 48 L 224 46 L 230 142 L 118 148 Z" fill="url(#sb-fb-visor)" stroke="#56E2F2" strokeOpacity="0.3" strokeWidth="1" />

      {/* THE ONE VERTICAL APERTURE SLIT — cyan, luminous (the eye) */}
      <ellipse cx="166" cy="96" rx="16" ry="30" fill="url(#sb-fb-apglow)" />
      <path d="M 162 66 L 170 66 L 172 126 L 160 126 Z" fill="#56E2F2" />
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
    renderer.toneMappingExposure = 1.12;
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(34, 1, 0.1, 40);

    /* ── light rig (phase 17 — the multicolor rim treatment): neutral
     *     key, COOL CYAN rim (-x, the machine's edge), WARM AMBER kicker
     *     (+x, low — the human/handoff register at rim strength), cool
     *     fill, white face glow, cyan pedestal spill (6 lamps, all
     *     shadow-less). The ceramic PBR shells need strong keys — the
     *     controlled-illumination law lives in the RIM HUES. */
    const key = new DirectionalLight(0xf7f8fa, 2.1);
    key.position.set(2.6, 4.2, 3.2);
    scene.add(key);
    const rim = new DirectionalLight(CYAN, 1.8);
    rim.position.set(-3.6, 3.3, -2.4);
    scene.add(rim);
    const kicker = new DirectionalLight(AMBER, 1.05);
    kicker.position.set(3.4, 2.1, -2.6);
    scene.add(kicker);
    const fill = new AmbientLight(0x16181d, 1.15);
    scene.add(fill);
    const faceGlow = new PointLight(0xffffff, 2.0, 3.0, 2);
    faceGlow.position.set(0, CHAR_H * 0.85, 1.15);
    scene.add(faceGlow);
    const pedGlow = new PointLight(CYAN, 1.2, 2.8, 2);
    pedGlow.position.set(0, 0.42, 0.9);
    scene.add(pedGlow);

    /* ── registry for full disposal (scene-built) ── */
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const track = <T extends BufferGeometry | Material>(x: T): T => {
      if (x instanceof BufferGeometry) geometries.push(x);
      else materials.push(x as Material);
      return x;
    };

    let palette = samplePalette();

    /* ═══ THE WORLD (the machine's stage — kept from P17) ═══
     * Pedestal: a lathe-tiered plinth matching the character's own
     * turned-shell grammar (two chamfered tiers + emissive rim), the
     * two landing-pad rings, the grid hairlines, dust, and the contact
     * shadow + mirrored reflection grounding pair. */
    const figure = new Group(); // character + pedestal (mirrored below)
    scene.add(figure);

    const pedestal = new Group();
    figure.add(pedestal);
    const stageMat = track(new MeshStandardMaterial({ color: palette.stage, roughness: 0.92, metalness: 0.1 }));
    const pedTopMat = track(new MeshStandardMaterial({ color: palette.pedTop, roughness: 0.85, metalness: 0.15 }));
    const pedRingMat = track(
      new MeshBasicMaterial({ color: palette.pedRing, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    /* tier 1 — the crown the character stands on (top at y = 0) */
    const pedTier1 = new Mesh(track(new CylinderGeometry(0.66, 0.7, 0.12, 48)), stageMat);
    pedTier1.position.y = -0.06;
    pedestal.add(pedTier1);
    /* tier 2 — the chamfered base (bottom exactly at FLOOR_Y) */
    const pedTier2 = new Mesh(track(new CylinderGeometry(0.7, 0.78, 0.07, 48)), stageMat);
    pedTier2.position.y = -0.155;
    pedestal.add(pedTier2);
    /* the top plate — a shade lighter (a lit platform, not a flat disc) */
    const pedTop = new Mesh(track(new CylinderGeometry(0.64, 0.66, 0.012, 48)), pedTopMat);
    pedTop.position.y = -0.004;
    pedestal.add(pedTop);
    /* the emissive rim — the pedestal's own light signature */
    const pedEdge = new Mesh(track(new TorusGeometry(0.655, 0.011, 8, 72)), pedRingMat);
    pedEdge.rotation.x = Math.PI / 2;
    pedEdge.position.y = 0.002;
    pedestal.add(pedEdge);

    /* the landing-pad rings (the world's scale read) */
    const floorRingMat = track(
      new MeshBasicMaterial({ color: palette.pedRing, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    const floorRing = new Mesh(track(new TorusGeometry(1.55, 0.008, 6, 72)), floorRingMat);
    floorRing.rotation.x = Math.PI / 2;
    floorRing.position.set(0, FLOOR_Y + 0.002, 0);
    scene.add(floorRing);
    const floorRing2Mat = track(
      new MeshBasicMaterial({ color: palette.pedRing, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    const floorRing2 = new Mesh(track(new TorusGeometry(2.35, 0.006, 6, 80)), floorRing2Mat);
    floorRing2.rotation.x = Math.PI / 2;
    floorRing2.position.set(0, FLOOR_Y + 0.002, 0);
    scene.add(floorRing2);

    /* the faint grid floor */
    const gridMat = track(new MeshBasicMaterial({ color: palette.grid, transparent: true, opacity: 0.44 }));
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      const h = track(new PlaneGeometry(12, 0.012));
      const mh = new Mesh(h, gridMat);
      mh.rotation.x = -Math.PI / 2;
      mh.position.set(0, FLOOR_Y, i * 1.1);
      scene.add(mh);
      const v = track(new PlaneGeometry(0.012, 12));
      const mv = new Mesh(v, gridMat);
      mv.rotation.x = -Math.PI / 2;
      mv.position.set(i * 1.1, FLOOR_Y, 0);
      scene.add(mv);
    }

    /* sparse particles, two depth layers (the soft round dust sprite) */
    const COUNT = 140;
    const pos = new Float32Array(COUNT * 3);
    const nearPos = new Float32Array((COUNT >> 1) * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 11;
      pos[i * 3 + 1] = Math.random() * 3.2 - 0.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 7;
      if (i < COUNT >> 1) {
        nearPos[i * 3] = (Math.random() - 0.5) * 9;
        nearPos[i * 3 + 1] = Math.random() * 3 - 0.1;
        nearPos[i * 3 + 2] = 2.4 + Math.random() * 1.2;
      }
    }
    const pGeo = track(new BufferGeometry());
    pGeo.setAttribute('position', new BufferAttribute(pos, 3));
    const pGeoNear = track(new BufferGeometry());
    pGeoNear.setAttribute('position', new BufferAttribute(nearPos, 3));
    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = 32;
    spriteCanvas.height = 32;
    const spriteCtx = spriteCanvas.getContext('2d');
    if (spriteCtx) {
      const g = spriteCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      spriteCtx.fillStyle = g;
      spriteCtx.fillRect(0, 0, 32, 32);
    }
    const dustTexture = new CanvasTexture(spriteCanvas);
    const pMat = track(
      new PointsMaterial({
        color: palette.particle,
        size: 0.028,
        map: dustTexture,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    const pMatNear = track(
      new PointsMaterial({
        color: palette.particle,
        size: 0.06,
        map: dustTexture,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    const particles = new Points(pGeo, pMat);
    scene.add(particles);
    const particlesNear = new Points(pGeoNear, pMatNear);
    scene.add(particlesNear);

    /* the contact shadow — the elliptical dark pool under the pedestal
     * (the in-scene half of the grounding; the CSS floor glow is the
     * light half) */
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 64;
    shadowCanvas.height = 64;
    const shadowCtx = shadowCanvas.getContext('2d');
    if (shadowCtx) {
      const g = shadowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(3,10,13,0.88)');
      g.addColorStop(0.4, 'rgba(3,10,13,0.55)');
      g.addColorStop(0.75, 'rgba(3,10,13,0.18)');
      g.addColorStop(1, 'rgba(3,10,13,0)');
      shadowCtx.fillStyle = g;
      shadowCtx.fillRect(0, 0, 64, 64);
    }
    const shadowTexture = new CanvasTexture(shadowCanvas);
    const shadowMat = track(
      new MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    const contactShadow = new Mesh(track(new PlaneGeometry(3.4, 2.1)), shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.scale.set(1, 0.62, 1);
    contactShadow.position.set(0, FLOOR_Y + 0.004, 0.1);
    contactShadow.renderOrder = 1;
    scene.add(contactShadow);

    const fog = new Fog(palette.fogColor, 7, 15);
    scene.fog = fog;

    /* ── the framing solver — the layout owns the composition ────
     * The host's --sb-fig (figure fraction of host height) and
     * --sb-floor (floor line fraction) place the full figure + its
     * stage inside the box; the fog keeps the character crisp (near >
     * camera distance) while the far grid dissolves. */
    const frame = () => {
      const w = host.clientWidth || 600;
      const h = host.clientHeight || 600;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      const style = getComputedStyle(host);
      /* P17: fig/floor may EXCEED 1 — the mobile bust close-up (fig 1.3 /
       * floor 1.35) deliberately overflows the box: the head stays whole,
       * the hips/pedestal crop below. Clamps widened accordingly. */
      const figFrac = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-fig')) || 0.62, 0.3), 1.6);
      const floorFrac = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-floor')) || 0.78, 0.5), 1.8);
      /* the RING FIT clamp: the layout can cap the landing-pad rings
       * (--sb-ringfit, default 1) so their near edges never crop at
       * the host's bottom edge on narrow/tall boxes. */
      const ringFit = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-ringfit')) || 1, 0.4), 1);
      floorRing.scale.setScalar(Math.min(1, (ringFit * 2.35) / 1.55));
      floorRing2.scale.setScalar(ringFit);
      const span = TOP_Y - FLOOR_Y;
      const hUnits = span / figFrac;
      const dist = hUnits / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)));
      const lookY = FLOOR_Y + (floorFrac - 0.5) * hUnits;
      /* P18-W2-a — the LATERAL COMPOSITION BIAS: --sb-x shifts the whole
       * camera rig (+ world stage) sideways so the figure renders at the
       * host's inline-end band while the canvas stays FULL-WIDTH (no
       * hard crop edges — the rings/grid bleed off-frame cinematically).
       * Default 0 = centered (mobile bust + tablet band grammar). */
      const xBias = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-x')) || 0, -1.5), 1.5);
      /* level camera (y == lookY) — the y→screen mapping is exact, so
       * the CSS floor glow at --sb-floor lands on the pedestal */
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

    /* ── lifecycle state (character-ready values live here) ──────── */
    let raf = 0;
    let mo: MutationObserver | null = null;
    let io: IntersectionObserver | null = null;
    let last = performance.now();
    let visible = true;
    let unsubBeat: (() => void) | null = null;
    let frameLoop: (now: number) => void = () => {};

    /* ── the beat channel state (scenario engine → character) ────── */
    let beat: HeroBeat | null = null;
    let beatAt = -1e9;

    /* ── pointer tracking targets (armed on character ready) ─────── */
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

    /* ═══ THE CHARACTER — THE OBELISK ATTENDANT, procedural build ═══
     * One authored geometry pass, no loader, no external asset. All
     * meshes are built from LatheGeometry (the turned ceramic mantle
     * grammar), BufferGeometry (the asymmetric wedge head), torus
     * segments (the gimbal neck), and thin prisms (the aperture slit +
     * core band + edge strip). Total vertex budget < 6k. */

    /* the materials of record (the P17 systems, unchanged values) */
    const bodyMat = track(new MeshStandardMaterial({ color: palette.body, roughness: 0.72, metalness: 0.04 }));
    const mantleLowerMat = track(new MeshStandardMaterial({ color: palette.mantleLower, roughness: 0.72, metalness: 0.04 }));
    const jointMat = track(new MeshStandardMaterial({ color: palette.joint, roughness: 0.6, metalness: 0.1 }));
    const visorMat = track(new MeshStandardMaterial({ color: palette.visor, roughness: 0.35, metalness: 0.2 }));
    const apertureMat = track(
      new MeshStandardMaterial({
        color: 0x0a1418,
        emissive: new Color(CYAN),
        emissiveIntensity: 2.2,
        roughness: 0.4,
      }),
    );
    const coreMat = track(
      new MeshStandardMaterial({
        color: 0x0a1418,
        emissive: new Color(CYAN),
        emissiveIntensity: 1.15,
        roughness: 0.4,
      }),
    );
    const stripMat = track(
      new MeshStandardMaterial({
        color: 0x0a1418,
        emissive: new Color(CYAN),
        emissiveIntensity: 0.95,
        roughness: 0.4,
      }),
    );
    const stripA = new Color(CYAN);  /* the tri-hue ramp endpoints: */
    const stripB = new Color(VIOLET);/* machine → AI → human registers */
    const stripC = new Color(AMBER); /* (the strip's slow rotation) */

    const character = new Group();
    figure.add(character);

    /* ── the mantle — three overlapping lathe shrouds (tier 2) ──────
     * Each shroud is a turned profile; the upper overlaps the lower's
     * rim (the layered ceramic mantle), with the graphite core band
     * revealed in the waist gap between shroud 2 and 3. */
    const shroud = (
      profile: [number, number][],
      mat: Material,
      segs = 40,
    ) => {
      const pts = profile.map(([x, y]) => new Vector2(x, y));
      const geo = track(new LatheGeometry(pts, segs));
      return new Mesh(geo, mat);
    };

    /* shroud A (upper) — the shoulder cape, wide at top, tapering */
    const shroudA = shroud(
      [
        [0.0, 0.0],
        [0.30, 0.0],
        [0.315, 0.02],
        [0.33, 0.10],
        [0.30, 0.22],
        [0.245, 0.34],
        [0.225, 0.40],
      ],
      bodyMat,
    );
    shroudA.position.y = MANTLE_H - 0.40;
    character.add(shroudA);

    /* shroud B (mid) — the chest tier, slightly narrower, overlapping
     * A's hem: carries the smoked-glass core disc + the tri-hue strip */
    const shroudB = shroud(
      [
        [0.0, 0.0],
        [0.265, 0.0],
        [0.272, 0.02],
        [0.272, 0.24],
        [0.262, 0.30],
      ],
      bodyMat,
    );
    shroudB.position.y = MANTLE_H - 0.52;
    character.add(shroudB);

    /* the graphite core band — the revealed metallic waist between
     * the mid and lower shrouds (the layered mantle's hinge read) */
    const coreBand = new Mesh(track(new CylinderGeometry(0.236, 0.246, 0.12, 40)), jointMat);
    coreBand.position.y = MANTLE_H - 0.63;
    character.add(coreBand);

    /* shroud C (lower) — the base skirt flaring to the plinth */
    const shroudC = shroud(
      [
        [0.0, 0.0],
        [0.24, 0.0],
        [0.248, 0.03],
        [0.286, 0.16],
        [0.32, 0.34],
        [0.335, 0.46],
      ],
      mantleLowerMat,
    );
    shroudC.position.y = MANTLE_H - 1.09;
    character.add(shroudC);

    /* the chest core — the cyan heartbeat disc set INTO shroud B's
     * front face (the beat hue carrier: classify VIOLET / handoff
     * AMBER — the P17 law, kept) */
    const coreDisc = new Mesh(track(new CylinderGeometry(0.062, 0.062, 0.03, 28)), coreMat);
    coreDisc.rotation.x = Math.PI / 2;
    coreDisc.position.set(0, MANTLE_H - 0.36, 0.262);
    character.add(coreDisc);
    const coreNode = coreDisc; /* the beat channel's scale node */

    /* the ONE tri-hue edge strip — a thin vertical prism on the
     * shroud B surface (the rim's inline-end edge), the multicolor
     * light signature rotating cyan→violet→amber over 18s */
    const stripGeo = track(new BufferGeometry());
    {
      /* a flat quad strip hugging shroud B's side arc */
      const verts: number[] = [];
      const ang = 0.52; /* the strip's angular center (inline-end side) */
      const r = 0.275;
      const hw = 0.055; /* the strip's arc half-width (radians) */
      for (const a of [ang - hw, ang + hw]) {
        verts.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      }
      for (const a of [ang - hw, ang + hw]) {
        verts.push(Math.sin(a) * r, 0.28, Math.cos(a) * r);
      }
      stripGeo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
      stripGeo.setIndex([0, 1, 2, 1, 3, 2]);
      stripGeo.computeVertexNormals();
    }
    const strip = new Mesh(stripGeo, stripMat);
    strip.position.y = MANTLE_H - 0.52;
    character.add(strip);

    /* the plinth — the obelisk's tier-3 base (proportion 1.2), a
     * chamfered foot flaring onto the pedestal */
    const plinth = shroud(
      [
        [0.0, 0.0],
        [0.30, 0.0],
        [0.312, 0.02],
        [0.34, 0.10],
        [0.38, 0.22],
        [0.40, 0.34],
        [0.405, 0.42],
      ],
      mantleLowerMat,
    );
    plinth.position.y = 0;
    character.add(plinth);

    /* ── the gimbal neck — graphite ring stack (tier joint) ────────
     * Two torus segments + a bearing band between mantle and head:
     * the modeled transition the chibi lacked. */
    const neckGroup = new Group();
    neckGroup.position.y = MANTLE_H;
    character.add(neckGroup);
    const gimbalA = new Mesh(track(new TorusGeometry(0.16, 0.032, 10, 36)), jointMat);
    gimbalA.rotation.x = Math.PI / 2;
    gimbalA.position.y = 0.022;
    neckGroup.add(gimbalA);
    const gimbalB = new Mesh(track(new CylinderGeometry(0.138, 0.15, 0.05, 32)), jointMat);
    gimbalB.position.y = 0.052;
    neckGroup.add(gimbalB);
    const gimbalC = new Mesh(track(new TorusGeometry(0.152, 0.026, 10, 36)), jointMat);
    gimbalC.rotation.x = Math.PI / 2;
    gimbalC.position.y = 0.084;
    neckGroup.add(gimbalC);

    /* ── THE HEAD — the asymmetric softly-faceted wedge ────────────
     * Authored BufferGeometry: 6 stations bottom→top, each a quad
     * ring whose corners are swept progressively — the inline-start
     * brow plane drops LOW toward the jaw on one side (the chamfer),
     * the inline-end side stays clean and full-height. A smoked-glass
     * facet panel + the vertical aperture slit are SET INTO the
     * inline-start face (recessed 0.01 behind the facet plane).
     *
     * Stations (y from head base; head depth z, half-width x):
     *   y0.00 base    x±0.20 z 0.20 → 0.14  (the jaw, chamfer begins)
     *   y0.16 lower   x±0.205 z 0.21 → 0.15 (brow sweep deepens)
     *   y0.30 brow    x±0.21  z 0.22 → 0.16 (max sweep, near-side low)
     *   y0.34 crown   x±0.19  z 0.19 → 0.17 (the far side's high plane)
     *   y0.40 top     x±0.13  z 0.13 → 0.12 (crown platform)
     *   y0.44 apex    x 0 z 0 (point — the obelisk's peak)
     */
    const headGroup = new Group();
    headGroup.position.y = HEAD_Y0;
    character.add(headGroup);

    const wedgeGeometry = ((): BufferGeometry => {
      /* A closed, manifold hexagonal-ring prism: 5 stations bottom→top,
       * each ring carrying 6 corners swept around the cross-section —
       *   [0] IS-front   [1] IS-mid   [2] IS-back   [3] IE-back
       *   [4] IE-mid     [5] IE-front
       * The IS corners' y is swept DOWN by `sweep` (the brow plane
       * drops low on the inline-start side — the asymmetric chamfer);
       * the IE side stays clean and full-height. Rings are stitched
       * with outward-wound quads, the apex is a single fan vertex, the
       * base a fan cap: a watertight sculpt (verified closed +
       * positive-volume winding). */
      const stations: { y: number; xIS: number; xIE: number; zF: number; zB: number; sweep: number }[] = [
        { y: 0.0, xIS: 0.20, xIE: 0.20, zF: 0.20, zB: 0.14, sweep: 0.0 },
        { y: 0.17, xIS: 0.208, xIE: 0.208, zF: 0.21, zB: 0.15, sweep: 0.05 },
        { y: 0.31, xIS: 0.212, xIE: 0.212, zF: 0.215, zB: 0.155, sweep: 0.11 },
        { y: 0.375, xIS: 0.19, xIE: 0.205, zF: 0.19, zB: 0.17, sweep: 0.15 },
        { y: 0.435, xIS: 0.13, xIE: 0.14, zF: 0.13, zB: 0.12, sweep: 0.1 },
      ];
      const verts: number[] = [];
      const indices: number[] = [];
      let vi = 0;
      const push = (x: number, y: number, z: number) => {
        verts.push(x, y, z);
        return vi++;
      };
      const rings: number[][] = [];
      for (const s of stations) {
        rings.push([
          push(-s.xIS, s.y - s.sweep, s.zF), /* 0 IS front */
          push(-s.xIS * 0.92, s.y - s.sweep * 0.7, (s.zF - s.zB) * 0.15 + s.zB), /* 1 IS mid — the soft facet */
          push(-s.xIS * 0.8, s.y - s.sweep * 0.55, -s.zB), /* 2 IS back */
          push(s.xIE * 0.8, s.y, -s.zB), /* 3 IE back */
          push(s.xIE * 0.92, s.y, (s.zF - s.zB) * 0.15 + s.zB), /* 4 IE mid */
          push(s.xIE, s.y, s.zF), /* 5 IE front */
        ]);
      }
      const apex = push(0, HEAD_H, 0);
      const quad = (a: number, b: number, c: number, d: number) => {
        indices.push(a, b, c, a, c, d);
      };
      for (let i = 0; i < rings.length - 1; i++) {
        const lo = rings[i]!;
        const hi = rings[i + 1]!;
        for (let c = 0; c < 6; c++) {
          const cn = (c + 1) % 6;
          quad(hi[c]!, hi[cn]!, lo[cn]!, lo[c]!);
        }
      }
      /* the apex fan — the obelisk's peak */
      const last = rings[rings.length - 1]!;
      for (let c = 0; c < 6; c++) {
        const cn = (c + 1) % 6;
        indices.push(last[cn]!, last[c]!, apex);
      }
      /* the base cap fan */
      const base = push(0, stations[0]!.y, 0);
      for (let c = 0; c < 6; c++) {
        const cn = (c + 1) % 6;
        indices.push(base, rings[0]![c]!, rings[0]![cn]!);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    })();

    /* center the head's pivot at its mid-height (rotation origin) */
    const head = new Mesh(track(wedgeGeometry), bodyMat);
    head.position.y = -HEAD_H * 0.5;
    headGroup.add(head);

    /* the smoked-glass face — a facet-matched quad SET INTO the
     * inline-start/front corner of the wedge (recessed 0.012), tilted
     * to ride the brow sweep's plane */
    const facePanel = new Mesh(track(new PlaneGeometry(0.20, 0.24)), visorMat);
    facePanel.position.set(-0.085, 0, 0.168);
    facePanel.rotation.y = -0.42;
    facePanel.rotation.z = 0.0;
    facePanel.rotation.x = -0.06;
    headGroup.add(facePanel);

    /* THE ONE VERTICAL APERTURE SLIT — the eye (cyan, emissive): a
     * thin vertical prism on the face panel's plane; its scale.x is
     * the expression channel (breathing phase + beat widening). */
    const aperture = new Mesh(track(new BoxGeometry(0.024, 0.15, 0.012)), apertureMat);
    aperture.position.set(-0.085, 0.015, 0.175);
    aperture.rotation.y = -0.42;
    headGroup.add(aperture);
    const apertureNode = aperture; /* the expression node */

    /* the neck's crown plate — the graphite collar the head rides on */
    const collar = new Mesh(track(new CylinderGeometry(0.148, 0.158, 0.035, 32)), jointMat);
    collar.position.y = GIMBAL_Y + 0.01;
    character.add(collar);

    /* normalize the figure: the build used MANTLE_H+NECK_H+HEAD_H
     * directly in world scale (≈ CHAR_H); verify + rescale to contract */
    let characterBaseY = 0;
    {
      const box = new Box3().setFromObject(character);
      const size = box.getSize(new Vector3());
      const S = CHAR_H / Math.max(size.y, 1e-6);
      character.scale.setScalar(S);
      character.position.y = -box.min.y * S;
      characterBaseY = character.position.y;
    }

    /* ── the reflection hint — a faint mirrored copy of the whole
     * figure under the floor line (the grounding's second half;
     * unlit clones at low opacity, fog does the fading). The clone's
     * colors are derived from the PALETTE (live-updating). */
    const reflMats: { mat: MeshBasicMaterial; kind: 'body' | 'visor' | 'aperture' | 'core' | 'stage' }[] = [];
    const reflection = character.clone(true);
    reflection.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as MeshStandardMaterial;
      const kind =
        src === apertureMat ? 'aperture'
        : src === coreMat ? 'core'
        : src === visorMat ? 'visor'
        : src === bodyMat || src === mantleLowerMat || src === jointMat ? 'body'
        : 'stage';
      const reflMat = track(
        new MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: kind === 'aperture' || kind === 'core' ? 0.22 : 0.13,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      reflMats.push({ mat: reflMat, kind: kind as 'body' | 'visor' | 'aperture' | 'core' | 'stage' });
      mesh.material = reflMat;
      mesh.renderOrder = -1;
    });
    reflection.scale.setScalar(character.scale.x);
    reflection.scale.y = -character.scale.x;
    reflection.position.y = 2 * FLOOR_Y;
    scene.add(reflection);
    /* the reflection's palette derivation — called from repaint() */
    const paintReflection = () => {
      for (const { mat: rm, kind } of reflMats) {
        const fromEmissive = kind === 'aperture' || kind === 'core';
        const hex =
          kind === 'body' ? palette.body
          : kind === 'visor' ? palette.visor
          : kind === 'aperture' ? palette.aperture
          : kind === 'core' ? palette.core
          : palette.stage;
        rm.color.setHex(hex).multiplyScalar(fromEmissive ? 0.85 : 0.55);
        rm.opacity = fromEmissive ? 0.22 : 0.13;
      }
    };

    /* ── theme repaint (MutationObserver on html class) — the
     * procedural materials repaint with the theme (P17 contract). */
    const repaint = () => {
      palette = samplePalette();
      stageMat.color.setHex(palette.stage);
      pedTopMat.color.setHex(palette.pedTop);
      pedRingMat.color.setHex(palette.pedRing);
      floorRingMat.color.setHex(palette.pedRing);
      floorRing2Mat.color.setHex(palette.pedRing);
      gridMat.color.setHex(palette.grid);
      pMat.color.setHex(palette.particle);
      pMatNear.color.setHex(palette.particle);
      faceGlow.color.setHex(palette.dark ? 0xffffff : 0x0e7a8a);
      pedGlow.color.setHex(palette.pedRing);
      fog.color.copy(palette.fogColor);
      bodyMat.color.setHex(palette.body);
      mantleLowerMat.color.setHex(palette.mantleLower);
      jointMat.color.setHex(palette.joint);
      visorMat.color.setHex(palette.visor);
      apertureMat.emissive.setHex(palette.aperture);
      apertureMat.emissiveIntensity = palette.apertureIntensity;
      coreMat.emissive.setHex(palette.core);
      coreMat.emissiveIntensity = palette.coreIntensity;
      /* the strip's breathing hue pair follows the theme */
      stripA.setHex(palette.dark ? CYAN : 0x0e7a8a);
      stripB.setHex(palette.dark ? VIOLET : 0x6b54e0);
      paintReflection();
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

    /* ── pointer tracking: head ±25°/±12°, mantle ±10% ── */
    if (!reduced && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerleave', onLeave, { passive: true });
    }

    /* ── the frame loop — three timescales of aliveness ──────────
     * (1) pointer tracking (damped lerp), (2) idle layers (bob +
     * aperture breathing phase + strip tri-hue rotation), (3)
     * scenario reactions (look toward the console, aperture widen,
     * aperture scan pulse, core pulse + hue, mantle tip). All
     * smoothed toward per-beat targets; zero per-frame allocations. */
    let yaw = 0;
    let pitch = 0;
    let lookBias = 0;
    let apertureWide = 1;
    let scanPhase = 0;
    let mantleTip = 0;
    const t0 = performance.now();
    /* the beat hue state — the core's temperature (phase-17 law) */
    const coreHue = new Color(CYAN);
    const tmpColor = new Color();

    frameLoop = (now: number) => {
      raf = 0;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = (now - t0) / 1000;

      /* lerp toward the pointer targets */
      yaw = MathUtils.lerp(yaw, targetX * MathUtils.degToRad(25), 1 - Math.pow(0.0015, dt));
      pitch = MathUtils.lerp(pitch, targetY * MathUtils.degToRad(12), 1 - Math.pow(0.0015, dt));

      /* scenario reaction targets (the beat drives the character) */
      const b = beat ?? 'reset';
      lookBias = MathUtils.lerp(lookBias, b === 'inbound' ? 0.34 : 0, 1 - Math.pow(0.02, dt));
      apertureWide = MathUtils.lerp(apertureWide, b === 'inbound' ? 1.5 : 1, 1 - Math.pow(0.04, dt));
      scanPhase = MathUtils.lerp(scanPhase, b === 'reply' ? 1 : 0, 1 - Math.pow(0.05, dt));
      mantleTip = MathUtils.lerp(mantleTip, b === 'handoff' ? 1 : 0, 1 - Math.pow(0.03, dt));
      let corePulse = 0;
      if (b === 'classify') {
        const since = (now - beatAt) / 1000;
        if (since >= 0 && since < 1.4) {
          corePulse = Math.abs(Math.sin(since * Math.PI * 2.4)) * Math.exp(-since * 2.2);
        }
      }
      /* the phase-17 beat color law — the core's HUE tells the story:
       * cyan (the machine's voice) at rest; VIOLET while classifying
       * (the AI register); AMBER warmth on handoff (the human
       * register). Lerped — a temperature shift, never a flash. */
      const coreBeatColor = b === 'classify' ? VIOLET : b === 'handoff' ? AMBER : palette.dark ? CYAN : 0x0e7a8a;
      coreHue.lerp(tmpColor.setHex(coreBeatColor), 1 - Math.pow(0.06, dt));

      /* idle bob (breathing) — the whole figure rides ±1.2% */
      character.position.y = characterBaseY + Math.sin(t * 1.5) * 0.018;
      headGroup.position.y = HEAD_Y0 + Math.sin(t * 1.5 + 0.6) * 0.01;

      /* head tracking + the beat's look bias + the autonomous gaze
       * wander layered under it (a parked pointer never leaves the
       * character staring dead-center) */
      const wander = Math.sin(t * 0.21) * 0.12 + Math.sin(t * 0.07) * 0.05;
      headGroup.rotation.y = yaw + wander + lookBias;
      headGroup.rotation.x = pitch + Math.sin(t * 0.17) * 0.03 + mantleTip * 0.06;
      /* the mantle tips slightly with the beat (the whole body's
       * attention — an instrument-grade lean, never a toy sway) */
      character.rotation.x = mantleTip * 0.045;
      character.rotation.y = MathUtils.lerp(character.rotation.y, lookBias * 0.3, 1 - Math.pow(0.01, dt));

      /* THE APERTURE — the single eye's expression channel: the idle
       * breathing phase modulates the slit's width ±18%; inbound
       * widens it (apertureWide); reply runs a fast scan shimmer. */
      const breath = 1 + Math.sin(t * 1.5) * 0.18;
      const scan = 1 + Math.sin(t * 9) * 0.1 * scanPhase;
      apertureNode.scale.set(apertureWide * breath * scan, 1, 1);
      apertureMat.emissiveIntensity =
        palette.apertureIntensity + Math.sin(t * 1.5) * 0.12 + corePulse * 0.25;

      /* the emissive registers: the core pulses with its beat hue
       * (violet on classify / amber on handoff), the ONE tri-hue edge
       * strip breathes + rotates cyan→violet→amber (18s) */
      coreMat.emissiveIntensity = palette.coreIntensity + corePulse * 1.8;
      coreMat.emissive.copy(coreHue);
      {
        const cs = 1 + corePulse * 0.07;
        coreNode.scale.set(cs, cs, 1);
      }
      stripMat.emissiveIntensity = palette.dark
        ? 0.95 + Math.sin(t * 0.9) * 0.3
        : 0.7 + Math.sin(t * 0.9) * 0.15;
      const phase = (t % 18) / 6; // 0..3
      if (phase < 1) stripMat.emissive.copy(stripA).lerp(stripB, phase);
      else if (phase < 2) stripMat.emissive.copy(stripB).lerp(stripC, phase - 1);
      else stripMat.emissive.copy(stripC).lerp(stripA, phase - 2);

      /* particle drift (two depth layers, the near one slower) */
      particles.position.y = Math.sin(t * 0.22) * 0.12;
      particlesNear.position.y = Math.sin(t * 0.13 + 1.2) * 0.08;

      renderer.render(scene, camera);
      if (visible && !document.hidden) raf = requestAnimationFrame(frameLoop);
    };

    if (reduced) {
      /* one static posed frame — the obelisk mid-idle: a soft 3/4
         gaze, the aperture at its resting width, no rAF, no
         tracking, no beat channel (the ticker composes its own
         static first beat) */
      headGroup.rotation.y = MathUtils.degToRad(-12);
      headGroup.rotation.x = 0.02;
      character.rotation.y = MathUtils.degToRad(-4);
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
      dustTexture.dispose();
      shadowTexture.dispose();
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
