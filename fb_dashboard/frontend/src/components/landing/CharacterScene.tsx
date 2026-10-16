'use client';

/* P16-A (concept A — CHARACTER-LED CINEMATIC) — THE PROTAGONIST SCENE.
 *
 * The primitives robot is RETIRED (the owner rejected it — an authored
 * character or nothing): the hero's protagonist is now the authored GLB
 * attendant-machine (public/models/smartbot-character.glb — lathe
 * profiles, feathered shells, chibi proportions) loaded at runtime and
 * normalized into the SAME world the pedestal / landing rings / grid
 * floor always lived in, so the layout's composition tokens
 * (--sb-fig / --sb-floor, read off the host) still own the framing: the
 * full figure — antenna crown → pedestal base — always composes inside
 * the host box, never below the fold.
 *
 * The node contract (matched by name PREFIX — the exporter may hash
 * suffixes): Root → Torso → {Head, ArmL, ArmR, ChestCore, EdgeStrip},
 * Head → {Visor, EyeL, EyeR, AntennaL, AntennaR}. Materials are PBR
 * (BodyMat / ChestMat / JointMat / VisorMat / emissive EyeMat lime,
 * CoreMat/StripMat teal) — the authored values ARE the dark-stage
 * palette of record; the light stage repaints them through the same
 * MutationObserver family the scene always had.
 *
 * ALIVENESS — three timescales, per the reference:
 *   (1) POINTER: head yaw/pitch ±25°/±12° + torso ~40% of that,
 *       critically-damped lerp; arms counter-swing.
 *   (2) IDLE: breathing bob, eye blinks (scaleY on EyeL/EyeR), antenna
 *       sway, edge-strip emissive breathing with a slow teal→lime hue
 *       drift (ONE accent temperature, 2 hues max).
 *   (3) SCENARIO: the honest HeroTicker engine drives the character
 *       through the heroBus — inbound → the head turns toward the
 *       message console + the eyes widen; classify → the chest core
 *       pulses; reply typing → the eyes scan; handoff → an arm raises
 *       slightly. The character reacts to the conversation it is
 *       having: the interaction that makes the product feel alive.
 *
 * WORLD: dark petrol void, pedestal + two landing rings + grid
 * hairlines + sparse dust + the grounding pair (soft contact shadow +
 * a faint mirrored reflection under the floor line). ONE emissive
 * strip on the character (EdgeStrip) is the light signature — the CSS
 * circuit traces were retired with the primitives robot.
 *
 * Resilience: a WebGL probe before the renderer — a missing/failing
 * context (or a failed GLB fetch) renders the ART-DIRECTED static SVG
 * frame of the character, never a broken canvas. DPR capped 2; rAF
 * paused offscreen (IO) + on hidden tabs; prefers-reduced-motion = one
 * static posed frame (mid-idle), no rAF, no tracking, no beat channel;
 * teardown disposes EVERY geometry/material (GLB included) and the
 * renderer. GLTFLoader is lazy-imported inside the effect so its bytes
 * ride the hero chunk only. aria-hidden: decorative by role. */

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
  PlaneGeometry,
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
  Vector3,
  DoubleSide,
  type Material,
  type Object3D,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { subscribeHeroBeat, lastHeroBeat, type HeroBeat, type HeroBeatDetail } from './heroBus';

export type CharacterSceneProps = {
  className?: string;
};

/* Emissive constants — the controlled-neon pair (teal + lime ONLY).
 * These are the fallbacks; the live values are sampled from the
 * .landing token scope so the character repaints with the theme. */
const TEAL = 0x17c3a4;
const LIME = 0xc6f24e;

/* ── the composition contract (world units) ────────────────────────
 * The framing solver places these inside the host box:
 *   FLOOR_Y — the grid floor the pedestal base stands on
 *   CHAR_H  — the character's normalized height (feet ON the pedestal)
 *   TOP_Y   — the figure's crown (antenna tips + breathing margin)   */
const FLOOR_Y = -0.19;
const CHAR_H = 1.9;
const TOP_Y = CHAR_H + 0.04;

/* the character GLB — served verbatim from public/models/ (immutable) */
const GLB_URL = '/models/smartbot-character.glb';

/* ONE accent temperature (P16-A law): pure lime (#c6f24e) is the EYES
 * + the active status ticks only; the edge strip / core / rim
 * registers stay in the teal family, breathing toward lime at most. */
const TEAL_LIME_BLEND = 0x71d99a;

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
  chest: number;
  joint: number;
  visor: number;
  visorGlow: number;
  visorIntensity: number;
  eye: number;
  eyeIntensity: number;
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
      /* the light stage keeps the mist values the robot always used:
       * body inks from the --ln-ink-2 family, chest + stage on paper */
      body: readVar(html, '--ln-ink-2', 0x35525c),
      chest: 0xc6d9d2,
      joint: 0x2b454e,
      visor: 0x0e2b33,
      visorGlow: 0x0c7563,
      visorIntensity: 0.5,
      eye: 0x0c7563,
      eyeIntensity: 1.0,
      core: 0x0c7563,
      coreIntensity: 0.7,
      stage: 0xcfe0da,
      pedTop: 0xb9cec7,
      pedRing: 0x0c7563,
      grid: 0x0f5d4f,
      particle: 0x3d5a63,
      fogColor: new Color(0xdfe9e4),
    };
  }
  return {
    dark: true,
    /* dark stage: the GLB's OWN authored PBR values are the palette of
     * record (recorded at load); only the live emissives are sampled
     * so the eyes + the status register stay lockstep with the tokens */
    body: 0x163f4b,
    /* P16-W3 (P1-a): the sage chest plate dimmed 0xc6d9d2 → 0x6e847c —
     * its lit pixels crossed the h1 display band between the glyphs
     * (measured: 9.8% of the line-1 background carried >80-lum machine
     * px, p99 = 184 ≈ glyph brightness). The plate stays readable at
     * chest height but no longer competes with the display lockup. */
    chest: 0x6e847c,
    joint: 0x0e2b33,
    visor: 0x0d3340,
    visorGlow: 0x0e5a4b,
    visorIntensity: 0.55,
    eye: readVar(html, '--ln-violet', LIME),
    eyeIntensity: 1.6,
    core: readVar(html, '--ln-lime', TEAL),
    coreIntensity: 1.15,
    stage: 0x0a2029,
    pedTop: 0x1a4550,
    pedRing: readVar(html, '--ln-lime', TEAL),
    grid: 0x1a5a4e,
    particle: 0x9fc3bc,
    fogColor: new Color(0x071a21),
  };
}

/* ── the art-directed static fallback frame (WebGL absent / failed) ──
 * A composed SVG portrait of the SAME character — lathe silhouette,
 * glossy visor, lime eyes, teal core, the ONE edge strip — so a
 * WebGL-less client gets the hero, never a hole. Same petrol values
 * as the scene; positioned by CSS at the framing fractions. */
function CharacterFallbackSvg() {
  return (
    <svg viewBox="0 0 360 470" role="presentation" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id="sb-fb-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d505d" />
          <stop offset="0.55" stopColor="#163f4b" />
          <stop offset="1" stopColor="#0f3140" />
        </linearGradient>
        <linearGradient id="sb-fb-head" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a4a57" />
          <stop offset="1" stopColor="#123843" />
        </linearGradient>
        <linearGradient id="sb-fb-visor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d3340" />
          <stop offset="1" stopColor="#06181f" />
        </linearGradient>
        <linearGradient id="sb-fb-strip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#17C3A4" />
          <stop offset="1" stopColor="#C6F24E" />
        </linearGradient>
        <radialGradient id="sb-fb-eyeglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#C6F24E" stopOpacity="0.55" />
          <stop offset="1" stopColor="#C6F24E" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sb-fb-coreglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#17C3A4" stopOpacity="0.5" />
          <stop offset="1" stopColor="#17C3A4" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* contact shadow */}
      <ellipse cx="180" cy="452" rx="118" ry="13" fill="rgb(3 10 13 / 0.85)" />

      {/* the pedestal — a lathe-tiered plinth + emissive rim */}
      <path d="M 66 384 L 294 384 L 302 416 L 58 416 Z" fill="#12333e" stroke="#1a4550" strokeWidth="1" />
      <path d="M 58 416 L 302 416 L 314 442 L 46 442 Z" fill="#0d2830" />
      <ellipse cx="180" cy="384" rx="114" ry="11" fill="#0f2d38" />
      <ellipse cx="180" cy="384" rx="114" ry="11" fill="none" stroke="#17C3A4" strokeWidth="2" opacity="0.75" />

      {/* the body — the feathered lathe shell */}
      <path
        d="M 92 182 C 92 140 112 128 180 128 C 248 128 268 140 268 182 L 268 302 C 268 358 238 384 180 384 C 122 384 92 358 92 302 Z"
        fill="url(#sb-fb-body)"
        stroke="#0b2831"
        strokeWidth="1"
      />
      {/* shoulder shells (the feathered pair) */}
      <path d="M 92 182 C 92 148 108 136 132 132 C 116 158 108 200 106 246 L 92 246 Z" fill="#649089" opacity="0.85" />
      <path d="M 268 182 C 268 148 252 136 228 132 C 244 158 252 200 254 246 L 268 246 Z" fill="#649089" opacity="0.85" />
      {/* chest plate + core */}
      <path d="M 132 236 L 228 236 L 220 322 L 140 322 Z" fill="#c6d9d2" opacity="0.92" />
      <circle cx="180" cy="279" r="26" fill="url(#sb-fb-coreglow)" />
      <circle cx="180" cy="279" r="9" fill="#17C3A4" />

      {/* the ONE edge strip — the light signature (teal→lime) */}
      <path d="M 262 168 C 264 230 264 300 258 362" stroke="url(#sb-fb-strip)" strokeWidth="9" fill="none" opacity="0.22" />
      <path d="M 262 168 C 264 230 264 300 258 362" stroke="url(#sb-fb-strip)" strokeWidth="3" fill="none" opacity="0.9" />

      {/* ear pods */}
      <rect x="44" y="66" width="18" height="44" rx="9" fill="#0e2b33" />
      <rect x="298" y="66" width="18" height="44" rx="9" fill="#0e2b33" />

      {/* the head — the chibi crown */}
      <rect x="58" y="22" width="244" height="128" rx="58" fill="url(#sb-fb-head)" stroke="#0b2831" strokeWidth="1" />

      {/* the glossy visor + the lime eyes */}
      <rect x="84" y="46" width="192" height="82" rx="34" fill="url(#sb-fb-visor)" stroke="#17C3A4" strokeOpacity="0.3" strokeWidth="1" />
      <ellipse cx="141" cy="87" rx="24" ry="24" fill="url(#sb-fb-eyeglow)" />
      <ellipse cx="219" cy="87" rx="24" ry="24" fill="url(#sb-fb-eyeglow)" />
      <ellipse cx="141" cy="87" rx="12" ry="18" fill="#C6F24E" />
      <ellipse cx="219" cy="87" rx="12" ry="18" fill="#C6F24E" />

      {/* antennas */}
      <path d="M 146 30 L 132 6" stroke="#2b4a54" strokeWidth="5" strokeLinecap="round" />
      <circle cx="132" cy="6" r="5" fill="#C6F24E" opacity="0.9" />
      <path d="M 214 30 L 228 10" stroke="#2b4a54" strokeWidth="5" strokeLinecap="round" />
      <circle cx="228" cy="10" r="5" fill="#17C3A4" opacity="0.9" />
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

    /* ── light rig: key + teal rim + fill + face glow + pedestal spill
     *     (5, all shadow-less). The PBR shells need stronger keys than
     *     the flat primitives did — key 2.1, rim 1.6; the glow point
     *     light rides just in front of the visor so the lime eye band
     *     stays the focal anchor, and the pedestal spill washes the
     *     hips from the emissive rim below (the machine's own ground
     *     light, not a scene lamp). */
    const key = new DirectionalLight(0xf2fbf7, 2.2);
    key.position.set(2.6, 4.2, 3.2);
    scene.add(key);
    /* P16-W3 (P1-b, evaluator: "stock/generic at hero scale",
   "dropped onto the background"): the rim doubles down — a sharper
   cooler edge separation carves the silhouette out of the dark stage
   (the ChainGPT single-edge-strip lesson: light as identity), and the
   key lifts one notch so the PBR shells model more strongly. */
    const rim = new DirectionalLight(TEAL, 1.8);
    rim.position.set(-3.6, 3.3, -2.4);
    scene.add(rim);
    const fill = new AmbientLight(0x22333a, 1.15);
    scene.add(fill);
    const faceGlow = new PointLight(TEAL_LIME_BLEND, 2.4, 3.0, 2);
    faceGlow.position.set(0, CHAR_H * 0.85, 1.15);
    scene.add(faceGlow);
    const pedGlow = new PointLight(TEAL, 1.2, 2.8, 2);
    pedGlow.position.set(0, 0.42, 0.9);
    scene.add(pedGlow);

    /* ── registry for full disposal (scene-built AND GLB assets) ── */
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const track = <T extends BufferGeometry | Material>(x: T): T => {
      if (x instanceof BufferGeometry) geometries.push(x);
      else materials.push(x as Material);
      return x;
    };

    let palette = samplePalette();

    /* ═══ THE WORLD (the machine's stage — refined, not replaced) ═══
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
     * camera distance) while the far grid dissolves. Runs at effect
     * level so the WORLD paints before the GLB joins it. */
    const frame = () => {
      const w = host.clientWidth || 600;
      const h = host.clientHeight || 600;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      const style = getComputedStyle(host);
      const figFrac = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-fig')) || 0.62, 0.3), 0.95);
      const floorFrac = Math.min(Math.max(parseFloat(style.getPropertyValue('--sb-floor')) || 0.78, 0.5), 0.95);
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
      /* level camera (y == lookY) — the y→screen mapping is exact, so
       * the CSS floor glow at --sb-floor lands on the pedestal */
      camera.position.set(0, lookY, dist);
      camera.lookAt(0, lookY, 0);
      camera.updateProjectionMatrix();
      fog.near = dist * 1.06;
      fog.far = dist * 2.6;
      if (reduced) renderer.render(scene, camera);
    };
    frame();
    const ro = new ResizeObserver(frame);
    ro.observe(host);
    renderer.render(scene, camera); /* the world paints pre-GLB */

    /* ── lifecycle state (character-ready values live here) ──────── */
    let raf = 0;
    let mo: MutationObserver | null = null;
    let io: IntersectionObserver | null = null;
    let disposed = false;
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

    /* GLB materials, classified by name PREFIX (hash-suffix safe) */
    type GltfMatKind = 'body' | 'chest' | 'joint' | 'visor' | 'eye' | 'core' | 'strip';
    const gltfMats = new Map<MeshStandardMaterial, GltfMatKind>();

    function classifyMat(name: string): GltfMatKind | null {
      if (name.startsWith('Body')) return 'body';
      if (name.startsWith('Chest')) return 'chest';
      if (name.startsWith('Joint')) return 'joint';
      if (name.startsWith('Visor')) return 'visor';
      if (name.startsWith('Eye')) return 'eye';
      if (name.startsWith('Core')) return 'core';
      if (name.startsWith('Strip')) return 'strip';
      return null;
    }

    /* ═══ THE CHARACTER — the authored GLB, normalized at runtime ═══ */
    let gltfScene: Object3D | null = null;
    let root: Object3D | null = null;
    let torso: Object3D | null = null;
    let head: Object3D | null = null;
    let headY0 = 0;
    let eyeL: Object3D | null = null;
    let eyeR: Object3D | null = null;
    let eyeLX = 0;
    let eyeRX = 0;
    let antennaL: Object3D | null = null;
    let antennaR: Object3D | null = null;
    let armL: Object3D | null = null;
    let armR: Object3D | null = null;
    let coreNode: Object3D | null = null;
    let eyeMat: MeshStandardMaterial | null = null;
    let coreMat: MeshStandardMaterial | null = null;
    let stripMat: MeshStandardMaterial | null = null;
    const stripA = new Color(TEAL); /* the breathing hue pair (2 max) */
    const stripB = new Color(LIME);

    const findNode = (wanted: string): Object3D | null => {
      if (!gltfScene) return null;
      let hit: Object3D | null = null;
      const exact = (o: Object3D) => {
        if (hit === null && o.name === wanted) hit = o;
      };
      gltfScene.traverse(exact);
      if (hit !== null) return hit;
      const prefixed = (o: Object3D) => {
        if (hit === null && o.name.startsWith(wanted)) hit = o;
      };
      gltfScene.traverse(prefixed);
      return hit;
    };

    const disposeGltf = (gltf: GLTF) => {
      gltf.scene.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.dispose();
        }
      });
    };

    const onCharacter = (gltf: GLTF) => {
      if (disposed) {
        disposeGltf(gltf);
        return;
      }

      /* normalize: authored units → the world contract (feet at the
       * pedestal top, height = CHAR_H, horizontally centered) */
      gltfScene = gltf.scene;
      const box = new Box3().setFromObject(gltf.scene);
      const size = box.getSize(new Vector3());
      const S = CHAR_H / Math.max(size.y, 1e-6);
      const character = new Group();
      character.scale.setScalar(S);
      character.position.y = -box.min.y * S;
      character.add(gltf.scene);
      figure.add(character);

      /* register every GLB geometry/material for the disposal sweep,
       * classifying the PBR materials by name prefix as we go */
      gltf.scene.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        geometries.push(mesh.geometry);
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as MeshStandardMaterial;
          const kind = classifyMat(std.name ?? '');
          if (kind) {
            gltfMats.set(std, kind);
            /* record the authored dark values — the palette of record */
            std.userData.sbOrig = {
              color: std.color.getHex(),
              emissive: std.emissive.getHex(),
              emissiveIntensity: std.emissiveIntensity,
            };
            materials.push(std);
          }
        }
      });
      for (const [mat, kind] of gltfMats) {
        if (kind === 'eye' && !eyeMat) eyeMat = mat;
        if (kind === 'core' && !coreMat) coreMat = mat;
        if (kind === 'strip' && !stripMat) stripMat = mat;
      }

      /* the node contract (by name PREFIX) */
      root = findNode('Root');
      torso = findNode('Torso');
      head = findNode('Head');
      eyeL = findNode('EyeL');
      eyeR = findNode('EyeR');
      antennaL = findNode('AntennaL');
      antennaR = findNode('AntennaR');
      armL = findNode('ArmL');
      armR = findNode('ArmR');
      coreNode = findNode('ChestCore');
      if (head) headY0 = head.position.y;
      if (eyeL) eyeLX = eyeL.position.x;
      if (eyeR) eyeRX = eyeR.position.x;

      /* ── the reflection hint — a faint mirrored copy of the whole
       * figure under the floor line (the grounding's second half;
       * unlit clones at low opacity, fog does the fading) ────────── */
      const reflection = figure.clone(true);
      reflection.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as MeshStandardMaterial;
        const kind = classifyMat(src.name ?? '') ?? 'stage';
        const fromEmissive = kind === 'eye' || kind === 'core' || kind === 'strip';
        const base = new Color(fromEmissive ? src.emissive.getHex() : src.color.getHex());
        base.multiplyScalar(fromEmissive ? 0.85 : 0.55);
        const reflMat = track(
          new MeshBasicMaterial({
            color: base,
            transparent: true,
            opacity: fromEmissive ? 0.22 : 0.13,
            depthWrite: false,
            side: DoubleSide,
          }),
        );
        reflMat.userData.sbKind = kind;
        mesh.material = reflMat;
        mesh.renderOrder = -1;
      });
      reflection.scale.y = -1;
      reflection.position.y = 2 * FLOOR_Y;
      scene.add(reflection);

      /* ── theme repaint (MutationObserver on html class) — the GLB
       * materials traverse-and-repaint: authored values in dark, the
       * mist family in light. */
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
        faceGlow.color.setHex(palette.dark ? TEAL_LIME_BLEND : 0x0c7563);
        pedGlow.color.setHex(palette.pedRing);
        fog.color.copy(palette.fogColor);
        for (const [mat, kind] of gltfMats) {
          const orig = mat.userData.sbOrig as { color: number; emissive: number; emissiveIntensity: number };
          if (palette.dark) {
            mat.color.setHex(orig.color);
            mat.emissive.setHex(kind === 'visor' ? palette.visorGlow : orig.emissive);
            mat.emissiveIntensity =
              kind === 'eye'
                ? palette.eyeIntensity
                : kind === 'core'
                  ? palette.coreIntensity
                  : kind === 'strip'
                    ? 0.75 /* P16-W3 (P1-a): the strip emissive eased — it crossed the h1 band */
                    : kind === 'visor'
                      ? palette.visorIntensity
                      : orig.emissiveIntensity;
          } else {
            mat.color.setHex(
              kind === 'body'
                ? palette.body
                : kind === 'chest'
                  ? palette.chest
                  : kind === 'joint'
                    ? palette.joint
                    : kind === 'visor'
                      ? palette.visor
                      : orig.color,
            );
            mat.emissive.setHex(
              kind === 'eye' || kind === 'core' || kind === 'strip'
                ? palette.core
                : kind === 'visor'
                  ? palette.visorGlow
                  : orig.emissive,
            );
            mat.emissiveIntensity =
              kind === 'eye'
                ? palette.eyeIntensity
                : kind === 'core' || kind === 'strip'
                  ? palette.coreIntensity
                  : kind === 'visor'
                    ? palette.visorIntensity
                    : orig.emissiveIntensity;
          }
          mat.needsUpdate = true;
        }
        /* the strip's breathing hue pair follows the theme */
        stripA.setHex(palette.dark ? TEAL : 0x0c7563);
        stripB.setHex(palette.dark ? LIME : 0x5a7a16);
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

      /* ── pointer tracking: head ±25°/±12°, torso ±10°, arms counter ── */
      if (!reduced && window.matchMedia('(pointer: fine)').matches) {
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerleave', onLeave, { passive: true });
      }

      /* ── the frame loop — three timescales of aliveness ──────────
       * (1) pointer tracking (damped lerp), (2) idle layers (bob,
       * blink, antenna sway, strip breathing), (3) scenario reactions
       * (look toward the console, eye widen, eye scan, core pulse,
       * arm raise) — all smoothed toward per-beat targets. */
      let yaw = 0;
      let pitch = 0;
      let torsoYaw = 0;
      let lookBias = 0;
      let eyeWide = 1;
      let scanAmp = 0;
      let armLift = 0;
      let blinkT = -1; // <0 = not blinking
      let nextBlink = 2.4 + Math.random() * 3;
      const t0 = performance.now();

      frameLoop = (now: number) => {
        raf = 0;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        const t = (now - t0) / 1000;

        /* lerp toward the pointer targets */
        yaw = MathUtils.lerp(yaw, targetX * MathUtils.degToRad(25), 1 - Math.pow(0.0015, dt));
        pitch = MathUtils.lerp(pitch, targetY * MathUtils.degToRad(12), 1 - Math.pow(0.0015, dt));
        torsoYaw = MathUtils.lerp(torsoYaw, targetX * MathUtils.degToRad(10), 1 - Math.pow(0.004, dt));

        /* scenario reaction targets (the beat drives the character) */
        const b = beat ?? 'reset';
        lookBias = MathUtils.lerp(lookBias, b === 'inbound' ? 0.34 : 0, 1 - Math.pow(0.02, dt));
        eyeWide = MathUtils.lerp(eyeWide, b === 'inbound' ? 1.24 : 1, 1 - Math.pow(0.04, dt));
        scanAmp = MathUtils.lerp(scanAmp, b === 'reply' ? 1 : 0, 1 - Math.pow(0.05, dt));
        armLift = MathUtils.lerp(armLift, b === 'handoff' ? 1 : 0, 1 - Math.pow(0.03, dt));
        let corePulse = 0;
        if (b === 'classify') {
          const since = (now - beatAt) / 1000;
          if (since >= 0 && since < 1.4) {
            corePulse = Math.abs(Math.sin(since * Math.PI * 2.4)) * Math.exp(-since * 2.2);
          }
        }

        /* idle bob (breathing) — the root rides ±1.5% of the height */
        if (root) root.position.y = Math.sin(t * 1.5) * 0.015;
        if (head) head.position.y = headY0 + Math.sin(t * 1.5 + 0.6) * 0.008;

        /* head + torso tracking + the beat's look bias, with an
         * autonomous gaze wander layered under it (a parked pointer
         * never leaves the character staring dead-center) */
        const wander = Math.sin(t * 0.21) * 0.12 + Math.sin(t * 0.07) * 0.05;
        if (head) {
          head.rotation.y = yaw + wander + lookBias;
          head.rotation.x = pitch + Math.sin(t * 0.17) * 0.03;
        }
        if (torso) torso.rotation.y = torsoYaw + wander * 0.4 + lookBias * 0.45;

        /* arm pose + counter-swing + the handoff lift (the -x arm
         * raises). P16-W3 (P1-a, pixel-verified): the rest pose lifts
         * the arms FORWARD (rotation.x ≈ -0.58) — a friendly
         * presentation stance whose hands sit at chest height, well
         * above the display lockup's band, so no lit arm pixels cross
         * the h1 ground (the h1 block spans nearly the full width —
         * horizontal tucking cannot dodge it; only height clears it).
         * Counter-sway rides the z-axis as before; the handoff lift
         * raises the -x arm exactly as before. */
        const sway = Math.sin(t * 1.5) * 0.03;
        if (armL) { armL.rotation.x = -0.58; armL.rotation.z = 0.06 + sway + torsoYaw * 0.55; }
        if (armR) { armR.rotation.x = -0.58; armR.rotation.z = -0.06 - sway - torsoYaw * 0.55 - 0.45 * armLift; }

        /* eye blink — scale Y briefly; widen on inbound; scan on reply */
        nextBlink -= dt;
        if (nextBlink <= 0 && blinkT < 0) {
          blinkT = 0;
          nextBlink = 2.6 + Math.random() * 3.4;
        }
        let eyeScale = 1;
        if (blinkT >= 0) {
          blinkT += dt;
          const d = blinkT / 0.16;
          if (d >= 1) {
            blinkT = -1;
          } else {
            eyeScale = 1 - Math.sin(d * Math.PI) * 0.92;
          }
        }
        const scan = Math.sin(t * 9) * 0.016 * scanAmp;
        if (eyeL) {
          eyeL.scale.set(eyeWide, eyeScale * eyeWide, eyeWide);
          eyeL.position.x = eyeLX + scan;
        }
        if (eyeR) {
          eyeR.scale.set(eyeWide, eyeScale * eyeWide, eyeWide);
          eyeR.position.x = eyeRX + scan;
        }

        /* antenna sway (two phase-offset pendulums) */
        if (antennaL) antennaL.rotation.z = Math.sin(t * 1.1) * 0.09;
        if (antennaR) antennaR.rotation.z = Math.sin(t * 1.1 + 1.9) * 0.08;

        /* the emissive registers: eyes breathe, the core pulses on
         * classify, the ONE edge strip breathes + drifts teal→lime */
        if (eyeMat) eyeMat.emissiveIntensity = palette.eyeIntensity + Math.sin(t * 1.5) * 0.12 + corePulse * 0.25;
        if (coreMat) coreMat.emissiveIntensity = palette.coreIntensity + corePulse * 1.8;
        if (coreNode) {
          const cs = 1 + corePulse * 0.07;
          coreNode.scale.set(cs, cs, cs);
        }
        if (stripMat) {
          stripMat.emissiveIntensity = palette.dark
            ? 0.95 + Math.sin(t * 0.9) * 0.3
            : 0.7 + Math.sin(t * 0.9) * 0.15;
          stripMat.emissive.copy(stripA).lerp(stripB, 0.5 + 0.5 * Math.sin(t * 0.6));
        }

        /* particle drift (two depth layers, the near one slower) */
        particles.position.y = Math.sin(t * 0.22) * 0.12;
        particlesNear.position.y = Math.sin(t * 0.13 + 1.2) * 0.08;

        renderer.render(scene, camera);
        if (visible && !document.hidden) raf = requestAnimationFrame(frameLoop);
      };

      if (reduced) {
        /* one static posed frame — the character mid-idle: a soft 3/4
           gaze, antennas mid-sway, eyes open; no rAF, no tracking, no
           beat channel (the ticker composes its own static first beat) */
        if (head) head.rotation.y = MathUtils.degToRad(-12);
        if (torso) torso.rotation.y = MathUtils.degToRad(-5);
        if (armL) armL.rotation.z = 0.08;
        if (armR) armR.rotation.z = -0.14;
        if (antennaL) antennaL.rotation.z = 0.06;
        if (antennaR) antennaR.rotation.z = -0.05;
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
    };

    /* the lazy GLTFLoader import — its bytes ride the hero chunk only.
     * The import itself is a network fetch in dev/edge cases: a chunk
     * that fails to load must land in the SVG fallback, never an
     * unhandled rejection on the console (the zero-error law). */
    const boot = async () => {
      try {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        if (disposed) return;
        new GLTFLoader().load(
          GLB_URL,
          (gltf) => onCharacter(gltf),
          undefined,
          () => {
            /* missing/broken asset → hide the half-world (its pedestal
             * would double under the SVG's own) + stop the loop, then the
             * art-directed frame carries the hero */
            if (disposed) return;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            visible = false;
            renderer.domElement.style.display = 'none';
            setFailed(true);
          },
        );
      } catch {
        if (!disposed) setFailed(true);
      }
    };
    void boot();

    /* ── teardown: dispose EVERY geometry/material, kill observers ── */
    return () => {
      disposed = true;
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
