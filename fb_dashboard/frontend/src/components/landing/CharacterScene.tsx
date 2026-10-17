'use client';

/* P19-W2-C — THE VESSEL · المَركَب (the §2.2 rebuild, Direction A —
 * the sculptural intelligence companion, selected by the P19 concept
 * board evaluation).
 *
 * The rejected P18 Obelisk (stacked box primitives + wedge head +
 * protruding face slab + pedestal + landing-pad rings) is SUPERSEDED
 * by a genuinely different foundation:
 *
 * THE CHARACTER (silhouette of record — the turned vessel):
 * · ONE continuous lathe-turned porcelain body — a rounded foot, a
 *   drawn-in waist, a chest swell, a shoulder taper into the neck;
 *   one sculptural volume, never stacked boxes;
 * · the HEAD is a smooth cranial dome that continues the body's
 *   curvature across ONE designed articulation seam (the graphite
 *   collar) — an engineered joint, not a disconnection;
 * · the FACE is a recessed smoked-glass lens set INTO the dome's
 *   front (inset, elliptical, framed by a thin graphite bezel) —
 *   never a protruding slab;
 * · THE EYE is ONE thin luminous ARC (cyan #56E2F2, emissive + a
 *   soft additive glow) inside the lens — a calm downward-open
 *   gaze. NEVER two dot eyes, NEVER a rectangular face border (the
 *   ChainGPT identity laws); expression = the arc's intensity and
 *   breathing, modulated by idle + scenario beats;
 * · deliberate asymmetry: ONE swept pauldron arc riding the
 *   inline-start shoulder with a visible gap (graphite against
 *   porcelain) + the dome's resting z-lean;
 * · the chest carries a QUIET core porthole (small housing + dim
 *   ring) — the heartbeat register, deliberately subordinate to
 *   the face;
 * · materials: warm porcelain (clearcoat 1.0 — bone-china read
 *   under the neutral key), dark graphite metal (the joints +
 *   bezels), smoked glass (the lens). The PMREM RoomEnvironment
 *   gives all three believable reflections — the premium-material
 *   read the rejected matte-plastic character never had.
 *
 * THE STAGE (the rejected world is RETIRED): no pedestal, no
 * landing-pad rings, no grid hairlines, no dust particles, no
 * mirrored reflection — the vessel stands on a soft contact shadow
 * in the near-black void; the CSS floor glow (the light spill)
 * does the rest. The vessel IS the scene's principal light source
 * (the pale figure on the near-black void).
 *
 * KEPT (the graded integration contracts): the token-sampling
 * palette + runtime theme repaint (MutationObserver on html
 * class), the beat channel (heroBus: inbound/classify/reply/
 * handoff — the eye + core carry the phase-17 hue law: cyan = the
 * machine's voice, VIOLET = the AI register, AMBER = the human
 * handoff), pointer head-tracking, the framing solver (--sb-fig/
 * --sb-floor/--sb-x with clamps), the pause family (IO +
 * visibilitychange), the RM static pose, the DPR 2 cap, the
 * disposal sweep, and the WebGL probe + art-directed SVG fallback
 * (redrawn to the SAME vessel silhouette).
 *
 * ALIVENESS — three timescales, instrument-grade amplitudes:
 * (1) POINTER: head ±22°/±10° (critically damped);
 * (2) IDLE: breathing bob ±1.3% of height, the arc's luminous
 *     breath, the head's slow wander + resting z-lean;
 * (3) SCENARIO (heroBus): inbound → the head turns toward the
 *     console + the arc brightens; classify → the arc + core
 *     warm VIOLET; reply → a fast scan shimmer on the arc;
 *     handoff → the body tips forward + the registers warm AMBER. */

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
  LatheGeometry,
  SphereGeometry,
  CylinderGeometry,
  TorusGeometry,
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
  Vector2,
  Vector3,
  type Material,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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

/* ── the composition contract (world units) ────────────────────────
 * The framing solver places these inside the host box:
 *   FLOOR_Y — the floor line the contact shadow sits on
 *   TOP_Y   — the figure's crown (dome + breathing margin)       */
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
  porcelain: number;
  graphite: number;
  lens: number;
  eye: number;
  eyeIntensity: number;
  core: number;
  coreIntensity: number;
  glowOpacity: number;
  shadowStrength: number;
  fogColor: Color;
};

function samplePalette(): Palette {
  const html = document.documentElement;
  if (html.classList.contains('light')) {
    return {
      dark: false,
      /* porcelain-day stage: the vessel holds via its graphite seams
       * + black glass lens (contrast carries the silhouette); the
       * accents drop to their ink grades */
      porcelain: 0xd9d7d2,
      graphite: 0x2a2c33,
      lens: 0x090b0f,
      eye: 0x0e7a8a,
      eyeIntensity: 1.9,
      core: 0x0e7a8a,
      coreIntensity: 0.9,
      glowOpacity: 0.55,
      shadowStrength: 0.32,
      fogColor: new Color(0xf2f2f0),
    };
  }
  return {
    dark: true,
    /* dark stage — THE inversion: the warm porcelain vessel
     * (#E7E5E0) is the scene's principal light source (the light
     * figure on the near-black void). The lens is smoked glass set
     * into the dome; the arc is the cyan heartbeat. */
    porcelain: 0xe7e5e0,
    graphite: 0x1e2026,
    lens: 0x05070b,
    eye: readVar(html, '--ln-lime', CYAN),
    eyeIntensity: 2.3, /* survives ACES at mobile scale; the halo carries the cyan hue */
    core: readVar(html, '--ln-lime', CYAN),
    coreIntensity: 1.2,
    glowOpacity: 0.9,
    shadowStrength: 0.62,
    fogColor: new Color(0x050506),
  };
}

/* ── the art-directed static fallback frame (WebGL absent / failed) ──
 * A composed SVG portrait of the SAME vessel character — the
 * continuous turned body, the cranial dome, the recessed lens with
 * the ONE cyan arc, the graphite collar + foot ring, the swept
 * pauldron, the chest porthole — so a WebGL-less client gets the
 * P19 hero, never a hole. */
function CharacterFallbackSvg() {
  return (
    <svg viewBox="0 0 360 470" role="presentation" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id="sb-fb-body" x1="0" y1="0" x2="1" y2="0.15">
          <stop offset="0" stopColor="#EFEDE8" />
          <stop offset="0.5" stopColor="#E7E5E0" />
          <stop offset="1" stopColor="#C8C6C1" />
        </linearGradient>
        <linearGradient id="sb-fb-lens" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0B0D12" />
          <stop offset="1" stopColor="#04060A" />
        </linearGradient>
        <radialGradient id="sb-fb-eyeglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#56E2F2" stopOpacity="0.55" />
          <stop offset="1" stopColor="#56E2F2" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* the contact shadow */}
      <ellipse cx="180" cy="452" rx="118" ry="14" fill="rgb(1 1 2 / 0.85)" />

      {/* the foot ring — graphite */}
      <path d="M 96 402 L 264 402 L 258 428 L 102 428 Z" fill="#26282F" />

      {/* THE VESSEL — the continuous turned body (one volume) */}
      <path
        d="M 180 92
           C 214 92 232 118 232 150
           C 232 190 214 208 202 236
           C 192 260 196 286 210 316
           C 224 346 228 374 220 400
           C 214 420 200 428 180 428
           C 160 428 146 420 140 400
           C 132 374 136 346 150 316
           C 164 286 168 260 158 236
           C 146 208 128 190 128 150
           C 128 118 146 92 180 92 Z"
        fill="url(#sb-fb-body)"
        stroke="#8A8C90"
        strokeWidth="1"
      />
      {/* the waist read — a soft inner shade line */}
      <path d="M 150 250 C 168 240 192 240 210 250" stroke="#B9B7B2" strokeWidth="2" fill="none" opacity="0.6" />

      {/* the swept pauldron — the ONE asymmetric arc (inline-start) */}
      <path
        d="M 236 214 C 244 206 250 196 252 184"
        stroke="#26282F"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 116 210 C 110 200 108 190 110 180"
        stroke="#26282F"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />

      {/* the chest porthole — the quiet heartbeat */}
      <circle cx="180" cy="330" r="17" fill="none" stroke="#26282F" strokeWidth="4" />
      <circle cx="180" cy="330" r="6" fill="#56E2F2" opacity="0.9" />

      {/* the graphite collar — the designed articulation seam */}
      <path d="M 148 118 L 212 118 L 210 106 L 150 106 Z" fill="#26282F" />

      {/* THE DOME — the cranial head continuing the curvature */}
      <path
        d="M 180 18
           C 214 18 240 44 240 78
           C 240 104 214 116 180 116
           C 146 116 120 104 120 78
           C 120 44 146 18 180 18 Z"
        fill="url(#sb-fb-body)"
        stroke="#8A8C90"
        strokeWidth="1"
      />

      {/* the recessed smoked-glass lens, set INTO the dome */}
      <ellipse cx="180" cy="76" rx="44" ry="30" fill="url(#sb-fb-lens)" stroke="#26282F" strokeWidth="2.5" />

      {/* THE ONE LUMINOUS ARC — the eye (cyan, calm downward gaze) */}
      <ellipse cx="180" cy="74" rx="30" ry="20" fill="url(#sb-fb-eyeglow)" />
      <path
        d="M 156 82 C 164 66 196 66 204 82"
        stroke="#56E2F2"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
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

    /* ── THE PREMIUM MATERIAL BASE — PMREM RoomEnvironment ───────
     * The single biggest craft upgrade over the rejected matte
     * character: believable reflections on the porcelain clearcoat,
     * the graphite metal, and the smoked glass. Low intensity keeps
     * the near-black void dark — the environment READS as material,
     * never as a light source. */
    const pmrem = new PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.34;

    /* ── light rig (the controlled-illumination law): neutral warm
     *     key, COOL CYAN rim (-x, the machine's edge), WARM AMBER
     *     kicker (+x, low — the human/handoff register at rim
     *     strength), quiet fill, white face glow. The porcelain
     *     clearcoat needs a strong key; the rim hues carry the
     *     register. All shadow-less. */
    const key = new DirectionalLight(0xfff1e4, 2.35);
    key.position.set(2.4, 4.0, 3.0);
    scene.add(key);
    const rim = new DirectionalLight(CYAN, 1.9);
    rim.position.set(-3.4, 3.0, -2.3);
    scene.add(rim);
    const kicker = new DirectionalLight(AMBER, 0.85);
    kicker.position.set(3.2, 1.5, -2.5);
    scene.add(kicker);
    const fill = new AmbientLight(0x14161c, 0.95);
    scene.add(fill);
    const faceGlow = new PointLight(0xffffff, 1.15, 3.4, 2);
    faceGlow.position.set(0, CHAR_H * 0.86, 1.05);
    scene.add(faceGlow);
    /* the eye's floor bounce — a faint cyan spill from under the
     * vessel's face (the grounding half: the light the arc eye
     * would cast onto the void's floor + the body's lower curve) */
    const bounce = new PointLight(CYAN, 0.5, 2.2, 2);
    bounce.position.set(0.15, 0.35, 0.75);
    scene.add(bounce);

    /* ── registry for full disposal (scene-built) ── */
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const track = <T extends BufferGeometry | Material>(x: T): T => {
      if (x instanceof BufferGeometry) geometries.push(x);
      else materials.push(x as Material);
      return x;
    };

    let palette = samplePalette();

    /* ═══ THE WORLD — the vessel stands in the void ═══
     * No pedestal, no rings, no grid, no dust: a soft contact shadow
     * + the fog. The CSS floor glow (the light spill under the
     * figure) is the other half of the grounding. */
    const figure = new Group();
    scene.add(figure);

    /* the contact shadow — a soft radial canvas pool under the feet */
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
    const contactShadow = new Mesh(track(new PlaneGeometry(0.92, 0.46)), shadowMat);
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
      /* P19-W2-C: the clamp ceiling is 1.9 — the mobile BUST crop
       * (visible window ≈ 0.86 world units of the 1.40 span) needs
       * fig ≈ 1.63, beyond the P17 ceiling of 1.6 */
      const figFrac = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-fig')) || 0.62, 0.3), 1.9);
      const floorFrac = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-floor')) || 0.78, 0.5), 1.8);
      const span = TOP_Y - FLOOR_Y;
      const hUnits = span / figFrac;
      const dist = hUnits / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)));
      const lookY = FLOOR_Y + (floorFrac - 0.5) * hUnits;
      /* the LATERAL COMPOSITION BIAS: --sb-x shifts the camera rig
       * sideways so the figure renders at the host's inline-end band
       * while the canvas stays FULL-WIDTH (the composition bleeds
       * off-frame cinematically). Default 0 = centered. */
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

    /* ═══ THE CHARACTER — THE VESSEL, procedural build ═══
     * One authored geometry pass, no loader, no external asset. The
     * body is a single LatheGeometry (the turned volume), the head a
     * squashed sphere dome riding the graphite collar, the face a
     * recessed lens + bezel + the ONE arc. Vertex budget < 5k. */

    /* the materials of record — the porcelain/graphite/glass system */
    const porcelainMat = track(
      new MeshPhysicalMaterial({
        color: palette.porcelain,
        roughness: 0.34,
        metalness: 0.02,
        clearcoat: 1.0,
        clearcoatRoughness: 0.16,
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
    const lensMat = track(
      new MeshPhysicalMaterial({
        color: palette.lens,
        roughness: 0.07,
        metalness: 0.12,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
      }),
    );
    const eyeMat = track(
      new MeshStandardMaterial({
        color: 0x0a1418,
        emissive: new Color(CYAN),
        emissiveIntensity: palette.eyeIntensity,
        roughness: 0.4,
      }),
    );
    const coreMat = track(
      new MeshStandardMaterial({
        color: 0x0a1418,
        emissive: new Color(CYAN),
        emissiveIntensity: palette.coreIntensity,
        roughness: 0.4,
      }),
    );

    /* the eye-glow sprite — the soft additive halo that makes the
     * arc legible at every canvas scale (the P18 lesson: a thin
     * emissive alone measures ~0 px) */
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
        color: CYAN,
        transparent: true,
        opacity: palette.glowOpacity,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );

    const character = new Group();
    figure.add(character);

    /* THE BODY — the one continuous turned volume (the lathe profile:
     * foot flare → waist draw-in → chest swell → shoulder taper →
     * neck). 96 radial segments: the silhouette reads as porcelain,
     * never faceted. */
    const profile: Array<[number, number]> = [
      [0.001, 0.0],
      [0.2, 0.0],
      [0.27, 0.02],
      [0.285, 0.07],
      [0.26, 0.16],
      [0.215, 0.32],
      [0.196, 0.46],
      [0.205, 0.6],
      [0.24, 0.74],
      [0.265, 0.84],
      [0.262, 0.92],
      [0.235, 0.99],
      [0.18, 1.04],
      [0.115, 1.08],
      [0.085, 1.11],
      [0.001, 1.12],
    ];
    const body = new Mesh(
      track(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 96)),
      porcelainMat,
    );
    character.add(body);

    /* the foot ring — a graphite rim grounding the volume */
    const foot = new Mesh(track(new CylinderGeometry(0.285, 0.3, 0.03, 64)), graphiteMat);
    foot.position.y = 0.045;
    character.add(foot);

    /* the graphite collar — THE designed articulation seam the head
     * rides on (an engineered joint, not a disconnection) */
    const collar = new Mesh(track(new TorusGeometry(0.105, 0.018, 14, 48)), graphiteMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.095;
    character.add(collar);

    /* THE HEAD GROUP — the cranial dome (pivots at the collar for
     * aliveness; its curvature CONTINUES the body's taper) */
    const headGroup = new Group();
    headGroup.position.y = 1.1;
    character.add(headGroup);
    const dome = new Mesh(track(new SphereGeometry(0.205, 48, 40)), porcelainMat);
    dome.scale.set(1, 1.07, 0.97);
    dome.position.y = 0.15;
    headGroup.add(dome);

    /* the crown pin — a small graphite datum on the dome (a machined
     * reference point, quiet) */
    const crownPin = new Mesh(track(new CylinderGeometry(0.022, 0.028, 0.02, 24)), graphiteMat);
    crownPin.position.y = 0.352;
    headGroup.add(crownPin);

    /* THE FACE — the recessed smoked-glass lens SET INTO the dome's
     * front: an elliptical glass volume (inset by its z-squash), its
     * curvature echoing the dome. Never a protruding slab. */
    const lens = new Mesh(track(new SphereGeometry(0.152, 40, 32)), lensMat);
    lens.scale.set(0.92, 1.16, 0.34);
    lens.position.set(0.012, 0.16, 0.172);
    headGroup.add(lens);
    /* the bezel — the thin elliptical graphite frame of the recess */
    const bezel = new Mesh(track(new TorusGeometry(0.152, 0.008, 10, 56)), graphiteMat);
    bezel.scale.set(0.94, 1.18, 0.9);
    bezel.position.set(0.012, 0.16, 0.176);
    headGroup.add(bezel);

    /* THE EYE — the ONE thin luminous arc riding the lens's FRONT
     * surface (z-front 0.245 > the lens front 0.224 — the P18 lesson
     * repeated and caught: an emissive element buried inside an opaque
     * mesh never renders; pixel-proof, not VLM-assumed). It reads as
     * light held INSIDE the glass. Calm downward-open gaze; the
     * emissive is the expression channel. */
    const eye = new Mesh(track(new TorusGeometry(0.075, 0.013, 10, 48, Math.PI * 0.85)), eyeMat);
    eye.rotation.z = Math.PI + Math.PI * 0.075;
    eye.position.set(0.012, 0.158, 0.232);
    headGroup.add(eye);
    /* the arc's glow halo (a camera-facing additive disc, also in
     * front of the glass) */
    const eyeGlow = new Mesh(track(new PlaneGeometry(0.4, 0.4)), glowMat);
    eyeGlow.position.set(0.012, 0.155, 0.236);
    headGroup.add(eyeGlow);

    /* THE PAULDRON — the ONE swept asymmetric arc riding the
     * inline-start shoulder: an epaulette that HUGS the shoulder
     * slope (radius just off the body's chest curve, a flat lie, a
     * small visible gap) — a graphite sweep against porcelain,
     * clearly BELOW head height, never a handle over the crown. */
    const pauldron = new Mesh(
      track(new TorusGeometry(0.258, 0.026, 14, 48, Math.PI * 1.1)),
      graphiteMat,
    );
    pauldron.rotation.x = Math.PI / 2 + 0.1;
    pauldron.rotation.z = Math.PI * 0.66;
    pauldron.position.y = 0.86;
    character.add(pauldron);

    /* THE CHEST CORE — the quiet heartbeat porthole (subordinate to
     * the face: small housing + dim ring) */
    const coreHousing = new Mesh(track(new CylinderGeometry(0.05, 0.056, 0.03, 32)), graphiteMat);
    coreHousing.rotation.x = Math.PI / 2;
    coreHousing.position.set(0, 0.72, 0.243);
    character.add(coreHousing);
    const coreRing = new Mesh(track(new TorusGeometry(0.03, 0.0045, 8, 40)), coreMat);
    coreRing.position.set(0, 0.72, 0.259);
    character.add(coreRing);
    const coreNode = coreRing; /* the beat pulse node */

    /* normalize the figure to the composition contract */
    let characterBaseY = 0;
    {
      const box = new Box3().setFromObject(character);
      const size = box.getSize(new Vector3());
      const S = CHAR_H / Math.max(size.y, 1e-6);
      character.scale.setScalar(S);
      character.position.y = -box.min.y * S;
      characterBaseY = character.position.y;
    }

    /* ── theme repaint (MutationObserver on html class) — the
     * procedural materials repaint with the theme. */
    const repaint = () => {
      palette = samplePalette();
      faceGlow.color.setHex(palette.dark ? 0xffffff : 0x0e7a8a);
      fog.color.copy(palette.fogColor);
      porcelainMat.color.setHex(palette.porcelain);
      graphiteMat.color.setHex(palette.graphite);
      lensMat.color.setHex(palette.lens);
      eyeMat.emissive.setHex(palette.eye);
      eyeMat.emissiveIntensity = palette.eyeIntensity;
      coreMat.emissive.setHex(palette.core);
      coreMat.emissiveIntensity = palette.coreIntensity;
      glowMat.color.setHex(palette.eye);
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

    /* ── the frame loop — three timescales of aliveness ──────────
     * (1) pointer tracking (damped lerp), (2) idle layers (bob +
     * the arc's luminous breath + the head wander + resting lean),
     * (3) scenario reactions (look toward the console, arc widen +
     * brighten, scan shimmer, hue law on the registers, body tip).
     * Zero per-frame allocations. */
    let yaw = 0;
    let pitch = 0;
    let lookBias = 0;
    let eyeWide = 1;
    let scanPhase = 0;
    let bodyTip = 0;
    const t0 = performance.now();
    /* the beat hue state — the registers' temperature (the law) */
    const beatHue = new Color(CYAN);
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
      eyeWide = MathUtils.lerp(eyeWide, b === 'inbound' ? 1.45 : 1, 1 - Math.pow(0.04, dt));
      scanPhase = MathUtils.lerp(scanPhase, b === 'reply' ? 1 : 0, 1 - Math.pow(0.05, dt));
      bodyTip = MathUtils.lerp(bodyTip, b === 'handoff' ? 1 : 0, 1 - Math.pow(0.03, dt));
      let corePulse = 0;
      if (b === 'classify') {
        const since = (now - beatAt) / 1000;
        if (since >= 0 && since < 1.4) {
          corePulse = Math.abs(Math.sin(since * Math.PI * 2.4)) * Math.exp(-since * 2.2);
        }
      }
      /* the beat color law — the registers' HUE tells the story:
       * cyan (the machine's voice) at rest; VIOLET while classifying
       * (the AI register); AMBER warmth on handoff (the human
       * register). Lerped — a temperature shift, never a flash. */
      const beatColor = b === 'classify' ? VIOLET : b === 'handoff' ? AMBER : palette.eye;
      beatHue.lerp(tmpColor.setHex(beatColor), 1 - Math.pow(0.06, dt));

      /* idle bob (breathing) — the whole figure rides ±1.3% */
      character.position.y = characterBaseY + Math.sin(t * 1.5) * 0.017;
      headGroup.position.y = 1.1 + Math.sin(t * 1.5 + 0.6) * 0.008;

      /* head tracking + the beat's look bias + the autonomous gaze
       * wander + the RESTING Z-LEAN (the deliberate asymmetry) */
      const wander = Math.sin(t * 0.21) * 0.12 + Math.sin(t * 0.07) * 0.05;
      headGroup.rotation.y = yaw + wander + lookBias;
      headGroup.rotation.x = pitch + Math.sin(t * 0.17) * 0.03 + bodyTip * 0.05;
      headGroup.rotation.z = 0.035 + Math.sin(t * 0.13) * 0.012;
      /* the body tips slightly with the beat (the whole vessel's
       * attention — an instrument-grade lean, never a toy sway) */
      character.rotation.x = bodyTip * 0.04;
      character.rotation.y = MathUtils.lerp(character.rotation.y, lookBias * 0.3, 1 - Math.pow(0.01, dt));

      /* THE ARC — the eye's expression channel: the idle luminous
       * breath ±16%; inbound brightens + widens; reply runs a fast
       * scan shimmer; the hue follows the beat law. */
      const breath = 1 + Math.sin(t * 1.5) * 0.16;
      const scan = 1 + Math.sin(t * 9) * 0.09 * scanPhase;
      eye.scale.setScalar(eyeWide * scan);
      eyeGlow.scale.setScalar(breath * eyeWide * (1 + corePulse * 0.35));
      eyeMat.emissiveIntensity =
        palette.eyeIntensity * breath * eyeWide + scanPhase * 0.4 + corePulse * 0.5;
      eyeMat.emissive.copy(beatHue);
      glowMat.color.copy(beatHue);

      /* the core porthole pulses with its beat hue (violet on
       * classify / amber on handoff) — the quiet heartbeat */
      coreMat.emissiveIntensity = palette.coreIntensity + corePulse * 1.7;
      coreMat.emissive.copy(beatHue);
      {
        const cs = 1 + corePulse * 0.08;
        coreNode.scale.set(cs, cs, 1);
      }

      renderer.render(scene, camera);
      if (visible && !document.hidden) raf = requestAnimationFrame(frameLoop);
    };

    if (reduced) {
      /* one static posed frame — the vessel mid-idle: a soft 3/4
         gaze, the arc at rest, no rAF, no tracking, no beat channel
         (the ticker composes its own static first beat) */
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
      shadowTexture.dispose();
      glowTexture.dispose();
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
