'use client';

/* P12-2c — THE ROBOT SCENE (spec-smartbot.md S1, the reference-defining
 * signature). An ORIGINAL chibi SmartBot mascot built from three.js
 * primitives — an original design, NOT a ChainGPT copy: petrol-dark body
 * panels + teal emissive eyes + a lime accent rim strip (their robot is
 * light-grey with a rainbow rim).
 *
 *   Head      — blocky box with rounded edges, recessed glossy-black
 *               face plane, two emissive teal eyes, lime rim strip.
 *   Torso     — dark petrol body with a light-grey chest plate + panel
 *               lines (thin inset boxes).
 *   Arms      — stubby capsules on sphere shoulder joints (counter-swing
 *               under pointer tracking).
 *   Pedestal  — dark box with an emissive teal edge strip + fog at the
 *               base, faint grid floor, sparse particles, CSS vignette.
 *
 * Pointer tracking (verified ChainGPT interaction, ours lerped): head
 * yaw/pitch ±25°/±12°, torso yaw ±10°, arm counter-rotation; idle bob +
 * eye blink. Reduced-motion → one static posed frame, no rAF, no
 * tracking. Theme-aware: material colors sampled from CSS vars at mount
 * + re-sampled through a MutationObserver on the html class (dark =
 * petrol-dark body + glow eyes; light = light-grey body + petrol face
 * + teal eyes). DPR capped 2; rAF paused offscreen (IO) + hidden tab;
 * every geometry/material disposed on unmount. Imports only the three
 * modules actually used (tree-shake). aria-hidden: decorative by role.
 */

import { useEffect, useRef } from 'react';
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  CircleGeometry,
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
  type Material,
} from 'three';

export type RobotSceneProps = {
  className?: string;
};

/* Emissive constants — the controlled-neon pair (S5): teal + lime ONLY.
 * These are the fallbacks; the real values are sampled from the
 * .landing token scope so the robot repaints with the theme. */
const TEAL = 0x17c3a4;
const LIME = 0xc6f24e;

/* Sampling bridge: read the landing token vars off <html> (the .landing
 * scope declares them; a landing mount implies html context) and parse
 * hex/rgb() to a THREE.Color. Falls back to the dark-stage constant. */
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
  face: number;
  eye: number;
  rim: number;
  grid: number;
  stage: number;
  fogNear: Color;
  fogColor: Color;
};

function samplePalette(): Palette {
  const html = document.documentElement;
  const light = html.classList.contains('light');
  if (light) {
    return {
      dark: false,
      body: readVar(html, '--ln-ink-2', 0x35525c),
      chest: 0xd9e6e1,
      face: 0x0e2b33,
      eye: readVar(html, '--ln-lime-deep', TEAL),
      rim: readVar(html, '--ln-violet', LIME),
      grid: 0x0f5d4f,
      stage: 0xcfe0da,
      fogNear: new Color(0xdfe9e4),
      fogColor: new Color(0xdfe9e4),
    };
  }
  return {
    dark: true,
    body: 0x123843,
    chest: 0x9fc3bc,
    face: 0x050708,
    eye: readVar(html, '--ln-lime', TEAL),
    rim: readVar(html, '--ln-violet', LIME),
    grid: 0x1a5a4e,
    stage: 0x0a2029,
    fogNear: new Color(0x071a21),
    fogColor: new Color(0x071a21),
  };
}

export function RobotScene({ className }: RobotSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── renderer / scene / camera ─────────────────────────────── */
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // no WebGL — the CSS sky behind carries the hero
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 600, host.clientHeight || 600, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(34, 1, 0.1, 40);
    camera.position.set(0, 1.55, 5.6);
    camera.lookAt(0, 0.95, 0);

    /* ── light rig: key + rim + fill ────────────────────────────── */
    const key = new DirectionalLight(0xf2fbf7, 1.35);
    key.position.set(2.4, 4.2, 3.4);
    scene.add(key);
    const rim = new DirectionalLight(TEAL, 0.85);
    rim.position.set(-3.2, 2.6, -2.2);
    scene.add(rim);
    const fill = new AmbientLight(0x22333a, 0.9);
    scene.add(fill);
    const glow = new PointLight(TEAL, 6, 5.5, 2);
    glow.position.set(0, 0.32, 1.1);
    scene.add(glow);

    /* ── registry for full disposal ─────────────────────────────── */
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const track = <T extends BufferGeometry | Material>(x: T): T => {
      if (x instanceof BufferGeometry) geometries.push(x);
      else materials.push(x as Material);
      return x;
    };

    /* ═══ THE ROBOT (original SmartBot mascot) ══════════════════ */
    const robot = new Group();
    scene.add(robot);

    let palette = samplePalette();
    const fog = new Fog(palette.fogColor, 4.2, 12);
    scene.fog = fog;

    /* materials — theme-sampled */
    const bodyMat = track(new MeshStandardMaterial({ color: palette.body, roughness: 0.82, metalness: 0.08 }));
    const chestMat = track(new MeshStandardMaterial({ color: palette.chest, roughness: 0.9 }));
    const faceMat = track(
      new MeshStandardMaterial({
        color: palette.face,
        roughness: 0.18,
        metalness: 0.55,
      }),
    );
    const eyeMat = track(new MeshBasicMaterial({ color: palette.eye }));
    const rimMat = track(new MeshBasicMaterial({ color: palette.rim }));
    const stageMat = track(new MeshStandardMaterial({ color: palette.stage, roughness: 0.95 }));

    /* — torso: dark petrol shell with a light chest plate — */
    const torso = new Group();
    robot.add(torso);
    const torsoMesh = new Mesh(track(new BoxGeometry(0.94, 1.06, 0.66)), bodyMat);
    torsoMesh.position.y = 0.52;
    torso.add(torsoMesh);
    /* chest plate (lighter panel — SmartBot's "face" of the body) */
    const chest = new Mesh(track(new BoxGeometry(0.56, 0.5, 0.1)), chestMat);
    chest.position.set(0, 0.66, 0.33);
    torso.add(chest);
    /* panel lines: two thin inset strips flanking the chest */
    const panelA = new Mesh(track(new BoxGeometry(0.05, 0.62, 0.06)), faceMat);
    panelA.position.set(0.35, 0.62, 0.34);
    torso.add(panelA);
    const panelB = new Mesh(track(new BoxGeometry(0.05, 0.62, 0.06)), faceMat);
    panelB.position.set(-0.35, 0.62, 0.34);
    torso.add(panelB);
    /* a small lime AI mark on the chest — the "AI marks are lime" law */
    const aiMark = new Mesh(track(new CircleGeometry(0.052, 6)), rimMat);
    aiMark.position.set(0, 0.66, 0.39);
    torso.add(aiMark);
    /* hips block */
    const hips = new Mesh(track(new BoxGeometry(0.6, 0.3, 0.46)), bodyMat);
    hips.position.y = 0.06;
    torso.add(hips);

    /* — stubby arms with sphere joints — */
    const makeArm = (side: 1 | -1) => {
      const arm = new Group();
      arm.position.set(0.62 * side, 0.86, 0);
      const joint = new Mesh(track(new SphereGeometry(0.15, 18, 14)), chestMat);
      arm.add(joint);
      const limb = new Mesh(track(new CylinderGeometry(0.09, 0.09, 0.42, 12)), bodyMat);
      limb.position.y = -0.28;
      arm.add(limb);
      const hand = new Mesh(track(new SphereGeometry(0.11, 14, 10)), chestMat);
      hand.position.y = -0.56;
      arm.add(hand);
      torso.add(arm);
      return arm;
    };
    const armR = makeArm(1);
    const armL = makeArm(-1);

    /* — head: blocky box with rounded edge look (box + edge cylinders) — */
    const head = new Group();
    head.position.y = 1.52;
    robot.add(head);
    const headMesh = new Mesh(track(new BoxGeometry(1.06, 0.78, 0.86)), bodyMat);
    head.add(headMesh);
    /* rounded-edge cylinders across the top corners (the chibi roundness) */
    for (const side of [-1, 1]) {
      const c1 = new Mesh(track(new CylinderGeometry(0.075, 0.075, 0.86, 12)), bodyMat);
      c1.rotation.z = Math.PI / 2;
      c1.position.set(0.455 * side, 0.325, 0);
      head.add(c1);
      const c2 = new Mesh(track(new CylinderGeometry(0.075, 0.075, 0.86, 12)), bodyMat);
      c2.rotation.x = Math.PI / 2;
      c2.position.set(0, 0.325, 0.38 * side);
      head.add(c2);
    }
    /* ear pods (the "antenna ears" of the chibi silhouette) */
    for (const side of [-1, 1]) {
      const pod = new Mesh(track(new CylinderGeometry(0.13, 0.13, 0.12, 14)), faceMat);
      pod.rotation.z = Math.PI / 2;
      pod.position.set(0.59 * side, 0.02, 0);
      head.add(pod);
      const dot = new Mesh(track(new SphereGeometry(0.045, 10, 8)), rimMat);
      dot.position.set(0.66 * side, 0.02, 0);
      head.add(dot);
    }
    /* recessed glossy-black face plane (the screen) */
    const face = new Mesh(track(new BoxGeometry(0.8, 0.5, 0.06)), faceMat);
    face.position.set(0, 0.02, 0.4);
    head.add(face);
    /* the emissive rim frame around the face (lime — the AI strip) */
    const faceRim = new Mesh(track(new TorusGeometry(0.4, 0.016, 8, 44)), rimMat);
    faceRim.position.set(0, 0.02, 0.44);
    head.add(faceRim);
    /* two emissive teal eyes */
    const eyes: Mesh[] = [];
    for (const side of [-1, 1]) {
      const eye = new Mesh(track(new CircleGeometry(0.075, 20)), eyeMat);
      eye.position.set(0.19 * side, 0.05, 0.44);
      head.add(eye);
      eyes.push(eye);
    }

    /* — pedestal: dark box + emissive teal edge strip — */
    const pedestal = new Group();
    scene.add(pedestal);
    const pedBox = new Mesh(track(new BoxGeometry(1.5, 0.22, 1.5)), stageMat);
    pedBox.position.y = -0.11;
    pedestal.add(pedBox);
    const pedEdge = new Mesh(track(new TorusGeometry(0.98, 0.02, 8, 60)), eyeMat);
    pedEdge.rotation.x = Math.PI / 2;
    pedEdge.position.y = 0.01;
    pedestal.add(pedEdge);

    /* — faint grid floor — */
    const gridLines: BufferGeometry[] = [];
    const gridMat = track(new MeshBasicMaterial({ color: palette.grid, transparent: true, opacity: 0.3 }));
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      const h = track(new PlaneGeometry(12, 0.012));
      const mh = new Mesh(h, gridMat);
      mh.rotation.x = -Math.PI / 2;
      mh.position.set(0, -0.24, i * 1.1);
      scene.add(mh);
      gridLines.push(h);
      const v = track(new PlaneGeometry(0.012, 12));
      const mv = new Mesh(v, gridMat);
      mv.rotation.x = -Math.PI / 2;
      mv.position.set(i * 1.1, -0.24, 0);
      scene.add(mv);
      gridLines.push(v);
    }

    /* — sparse particles — */
    const COUNT = 90;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 9;
      pos[i * 3 + 1] = Math.random() * 4.4 - 0.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 7;
    }
    const pGeo = track(new BufferGeometry());
    pGeo.setAttribute('position', new BufferAttribute(pos, 3));
    const pMat = track(
      new PointsMaterial({ color: palette.dark ? 0x9fc3bc : 0x3d5a63, size: 0.035, transparent: true, opacity: 0.55 }),
    );
    const particles = new Points(pGeo, pMat);
    scene.add(particles);

    /* helper: composed stubby arm geometry lives in makeArm — a simple
       cylinder limb reads as a capsule at chibi scale */
    /* ── theme repaint (MutationObserver on html class) ─────────── */
    const repaint = () => {
      palette = samplePalette();
      bodyMat.color.setHex(palette.body);
      chestMat.color.setHex(palette.chest);
      faceMat.color.setHex(palette.face);
      eyeMat.color.setHex(palette.eye);
      rimMat.color.setHex(palette.rim);
      stageMat.color.setHex(palette.stage);
      gridMat.color.setHex(palette.grid);
      pMat.color.setHex(palette.dark ? 0x9fc3bc : 0x3d5a63);
      fog.color.copy(palette.fogColor);
      if (!reduced) renderer.render(scene, camera);
    };
    const mo = new MutationObserver(repaint);
    mo.observe(document.documentElement, { attributeFilter: ['class'] });

    /* ── resize (DPR-cap 2) ─────────────────────────────────────── */
    const resize = () => {
      const w = host.clientWidth || 600;
      const h = host.clientHeight || 600;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      if (reduced) renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    /* ── pointer tracking: head ±25°/±12°, torso ±10°, arms counter ── */
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
    if (!reduced && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerleave', onLeave, { passive: true });
    }

    /* ── the frame loop — idle bob + blink + lerped tracking ─────── */
    let raf = 0;
    let yaw = 0;
    let pitch = 0;
    let torsoYaw = 0;
    let blinkT = -1; // <0 = not blinking
    let nextBlink = 2.4 + Math.random() * 3;
    const t0 = performance.now();
    let last = t0;
    let visible = true;

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = (now - t0) / 1000;

      /* lerp toward the pointer targets */
      yaw = MathUtils.lerp(yaw, targetX * MathUtils.degToRad(25), 1 - Math.pow(0.0015, dt));
      pitch = MathUtils.lerp(pitch, targetY * MathUtils.degToRad(12), 1 - Math.pow(0.0015, dt));
      torsoYaw = MathUtils.lerp(torsoYaw, targetX * MathUtils.degToRad(10), 1 - Math.pow(0.004, dt));

      /* idle bob (subtle breathing) */
      const bob = Math.sin(t * 1.6) * 0.035;
      robot.position.y = bob;
      head.position.y = 1.52 + Math.sin(t * 1.6 + 0.6) * 0.02;

      /* head + torso tracking */
      head.rotation.y = yaw;
      head.rotation.x = pitch;
      torso.rotation.y = torsoYaw;

      /* arm counter-swing */
      armR.rotation.z = 0.14 + Math.sin(t * 1.6) * 0.05 - torsoYaw * 0.6;
      armL.rotation.z = -0.14 - Math.sin(t * 1.6) * 0.05 - torsoYaw * 0.6;

      /* eye blink — scale Y briefly */
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
      for (const eye of eyes) eye.scale.y = eyeScale;

      /* particle drift */
      particles.position.y = Math.sin(t * 0.22) * 0.12;

      renderer.render(scene, camera);
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    if (reduced) {
      /* one static posed frame — a friendly 3/4 gaze, no rAF */
      head.rotation.y = MathUtils.degToRad(-14);
      torso.rotation.y = MathUtils.degToRad(-6);
      armR.rotation.z = 0.18;
      armL.rotation.z = -0.12;
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(frame);
    }

    /* ── pausing: offscreen + hidden tab ─────────────────────────── */
    const io = new IntersectionObserver(
      (entries) => {
        const was = visible;
        visible = entries[entries.length - 1].isIntersecting;
        if (reduced) return;
        if (visible && !was && !raf && !document.hidden) {
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      },
      { rootMargin: '80px 0px' },
    );
    io.observe(host);
    const onVis = () => {
      if (reduced) return;
      if (!document.hidden && visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    /* ── teardown: dispose EVERY geometry/material, kill observers ── */
    return () => {
      if (raf) cancelAnimationFrame(raf);
      mo.disconnect();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className={className ? `ln-robot ${className}` : 'ln-robot'} ref={hostRef} aria-hidden="true" />
  );
}

export default RobotScene;
