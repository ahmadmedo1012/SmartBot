/**
 * DayPanelArt — W6 2-a · «يوم في الحياة» panel illustrations (v4).
 *
 * ONE deliberate character family: the four storyboard panels draw the
 * SAME machine the 3D hero (CharacterScene) renders — a direct 2D
 * translation of the hero's measured build, not a mascot beside it:
 *
 * · HEAD — the near-square filleted skull (66×68 at figure scale) with
 *   the graphite vented top deck + three fins, the recessed black OLED
 *   screen filling ~70% of the face, the SPECTRUM bezel ring (the
 *   hero's tube, here the same diagonal the WebGL-fallback SVG blesses)
 *   and TWO white dot eyes — wide-set, upper third, glow haloed.
 * · BODY — the boxy chest with its one horizontal seam + two vertical
 *   slots, waist, hips; SMOOTH off-white limbs on graphite BALL joints
 *   (shoulder → elbow → articulated three-finger hand), legs with
 *   graphite knees + flat feet; the low RECT pedestal only where the
 *   story stages it (panel 04).
 * · MATERIAL (v2 — the VLM round-2 upgrade: mass, not stickers):
 *   2–3-stop gradients from ONE light law shared by all four panels —
 *   key light from the upper inline-start (the hero's key sits at
 *   +x/+y — the RTL start side), so every shell gradient runs
 *   bright-top-start → dark-bottom-end — now carried further by a
 *   real finishing pass: specular glints on every graphite ball joint
 *   (the machined read), a white glint arc on the bezel TUBE, a
 *   diagonal catchlight on the OLED glass + its cyan emission spill
 *   onto the shell, rim light on the lit shell shoulders, ambient
 *   occlusion creases under the chin / shoulders / waist, and a GROUND
 *   CONTACT that survives the dark stage: a cyan stage-light pool
 *   (the machine's own spill, --ln-day-pool) under the contact shadow
 *   (a plain black pool was invisible on the ink ground — VLM round 1).
 *   VLM round 3 adds the last mass pass: a cylindrical sheen line on
 *   every limb (the key-side highlight that turns a flat capsule into
 *   a tube), a specular band on the chest's lit face, pose-reactive
 *   ground shadows (the shadow drifts toward the reaching side), and
 *   ENVIRONMENT BOUNCE light per panel — the violet chip's glow at the
 *   catch (p2), the hologram's cyan spill on the presenting arm (p4),
 *   a warm dawn wash on the 06:00 floor. The character's own key
 *   light stays THE ONE LAW (upper inline-start) in all four panels —
 *   a character-sheet convention, like animation model sheets; sun
 *   and moon are scene storytelling, never a second key.
 *   Colors resolve through the --ln-day-* tokens (landing.css §17d):
 *   dark carries the hero's W4-A shell grade #9D9B96 family, porcelain
 *   day carries the hero light grade #D9D7D2 family; the spectrum
 *   ring, OLED glass and white eyes are LIGHT — constant.
 * · LIGHT STAGE (v4 — the VLM light round): porcelain day borrows the
 *   hero's OWN light-stage device — a white machine-halo (FigureHalo,
 *   --ln-day-halo) behind head + torso, exactly where the hero mounts
 *   its radial white glow — so the off-white shell mass separates from
 *   the light stage the way the 3D machine does; props become solid
 *   white cards with stronger day lines (the product's own
 *   white-bubble light language) and the contact shadows carry real
 *   ink mist. Night is byte-identical (halo transparent there).
 * · REGISTER — each capability keeps the landing's color grammar:
 *   cyan = the machine's voice (wave arcs, sound waves, chart bars),
 *   violet = the AI register (scan line, intent chips, growth point),
 *   amber = the human/handoff register (the envelope, the dawn sun).
 * · POSES — four genuinely distinct silhouettes: the 06:00 wave (arm
 *   up, arcs + chevrons of motion, welcome bubble clear of the crown),
 *   the 13:20 classify (hand REACHED OUT to catch the شكوى chip —
 *   violet sparks bridge fingertips and chip — while سؤال/طلب sit
 *   classified in the tray), the 21:45 reply (presenting arm offers
 *   the bubble by its tail, sound waves broadcast, the amber dotted
 *   escalation carries the human-decision message to the glowing
 *   envelope), the 00:00 report (confident on its pedestal, one arm
 *   presenting the day's rising chart, calm eyes, midnight moon).
 *   RTL: every prop (bubble, tray, trajectory, chart) is composed
 *   right → left, the reading direction — the bars rise toward the
 *   left (forward in RTL time), with a small inline time arrow.
 *
 * Decorative by contract: the storyboard panels own their Arabic
 * title/desc, so the art renders aria-hidden with no role; the tiny
 * Arabic labels inside (أهلاً! / سؤال / طلب / شكوى) echo the copy,
 * never replace it. Motion is ONE gentle prop bob (.dpa-bob, CSS in
 * §17d) with its prefers-reduced-motion off-switch — nothing essential
 * animates. No raster assets, no new dependencies: pure inline SVG
 * (viewBox 0 0 400 250 — the media frame's 16:10), one <defs> family
 * per panel (unique ids, no cross-svg references).
 */

export type DayPanelPose = "wave" | "classify" | "reply" | "report";

/* ── the spectrum ring — the hero bezel's blessed 2D stops (the
   CharacterScene fallback SVG's exact diagonal) ─────────────────── */
const BEZEL_STOPS: Array<[number, string]> = [
  [0, "#00F0FF"],
  [0.3, "#4A6BFF"],
  [0.55, "#B04DFF"],
  [0.8, "#FF5AC8"],
  [1, "#FF8A3C"],
];

/* ── the shared <defs> family — shell/graphite gradients live in the
   FIGURE's local space (gradientUnits=userSpaceOnUse over 0..140 ×
   0..190), so every panel lights the character identically no matter
   where the figure is translated. The shell light axis runs from the
   upper inline-start (140,6) to the lower end (0,190). ───────────── */
function PanelDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-shell`} gradientUnits="userSpaceOnUse" x1="140" y1="6" x2="0" y2="190">
        <stop offset="0" stopColor="var(--ln-day-shell-hi)" />
        <stop offset="0.52" stopColor="var(--ln-day-shell)" />
        <stop offset="1" stopColor="var(--ln-day-shell-lo)" />
      </linearGradient>
      <linearGradient id={`${uid}-graphite`} gradientUnits="userSpaceOnUse" x1="140" y1="6" x2="0" y2="190">
        <stop offset="0" stopColor="var(--ln-day-graphite-hi)" />
        <stop offset="1" stopColor="var(--ln-day-graphite)" />
      </linearGradient>
      <linearGradient id={`${uid}-screen`} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="62">
        <stop offset="0" stopColor="var(--ln-day-screen-hi)" />
        <stop offset="1" stopColor="var(--ln-day-screen)" />
      </linearGradient>
      <linearGradient id={`${uid}-bezel`} x1="0" y1="0" x2="1" y2="1">
        {BEZEL_STOPS.map(([offset, color]) => (
          <stop key={offset} offset={offset} stopColor={color} />
        ))}
      </linearGradient>
      <radialGradient id={`${uid}-eyeglow`}>
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      {/* the machine's own light sphere — the hero's white halo
          device (its light stage sits the machine on a bright halo so
          the off-white shell mass separates from porcelain). Byte-
          invisible on the night stage (--ln-day-halo: transparent). */}
      <radialGradient id={`${uid}-halo`}>
        <stop offset="0" stopColor="var(--ln-day-halo)" />
        <stop offset="1" stopColor="var(--ln-day-halo)" stopOpacity="0" />
      </radialGradient>
      {/* the contact shadow — a soft pool pressed under the figure */}
      <radialGradient id={`${uid}-shadow`}>
        <stop offset="0" stopColor="var(--ln-day-shadow-core)" />
        <stop offset="0.62" stopColor="var(--ln-day-shadow-core)" stopOpacity="0.45" />
        <stop offset="1" stopColor="var(--ln-day-shadow-edge)" />
      </radialGradient>
      {/* the stage-light pool — the machine's own cyan spill; a plain
          black shadow vanishes on the ink stage, so the ground contact
          is carried by light, the way the hero's stage reads */}
      <radialGradient id={`${uid}-pool`}>
        <stop offset="0" stopColor="var(--ln-day-pool)" />
        <stop offset="1" stopColor="var(--ln-day-pool)" stopOpacity="0" />
      </radialGradient>
      {/* machined-graphite specular — the ball joints' glint */}
      <radialGradient id={`${uid}-spec`}>
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.6" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      {/* the dawn sun — a soft warm orb, not line-art (VLM round 2) */}
      <radialGradient id={`${uid}-sun`}>
        <stop offset="0" stopColor="#FFF3D6" />
        <stop offset="0.4" stopColor="#FFB25E" stopOpacity="0.9" />
        <stop offset="1" stopColor="var(--ln-bot-amber)" stopOpacity="0" />
      </radialGradient>
      {/* the violet register's spill — the chip's glow at the catch */}
      <radialGradient id={`${uid}-violetglow`}>
        <stop offset="0" stopColor="var(--ln-violet)" stopOpacity="0.34" />
        <stop offset="1" stopColor="var(--ln-violet)" stopOpacity="0" />
      </radialGradient>
      {/* the handoff badge's amber halo */}
      <radialGradient id={`${uid}-amber`}>
        <stop offset="0" stopColor="var(--ln-bot-amber)" stopOpacity="0.38" />
        <stop offset="1" stopColor="var(--ln-bot-amber)" stopOpacity="0" />
      </radialGradient>
      {/* the midnight moon's cream halo */}
      <radialGradient id={`${uid}-moonglow`}>
        <stop offset="0" stopColor="var(--ln-cream)" stopOpacity="0.22" />
        <stop offset="1" stopColor="var(--ln-cream)" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/* ── the eyes — the hero's two-dot grammar, four registers ────────── */
type EyeState = "happy" | "scan" | "wide" | "calm";

function RobotEyes({ uid, state, shift }: { uid: string; state: EyeState; shift?: [number, number] }) {
  const [dx, dy] = shift ?? [0, 0];
  return (
    <g transform={`translate(${dx} ${dy})`}>
      <circle cx="56.5" cy="34" r="12" fill={`url(#${uid}-eyeglow)`} />
      <circle cx="83.5" cy="34" r="12" fill={`url(#${uid}-eyeglow)`} />
      {state === "happy" ? (
        <g stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M50.5 36.5 q6 -9.5 12 0" />
          <path d="M77.5 36.5 q6 -9.5 12 0" />
        </g>
      ) : state === "scan" ? (
        <g>
          <circle cx="56.5" cy="33" r="4" fill="#FFFFFF" />
          <circle cx="83.5" cy="33" r="4" fill="#FFFFFF" />
          {/* the classify register — violet, the AI sweep across the glass */}
          <line x1="47" y1="43" x2="93" y2="43" stroke="var(--ln-violet)" strokeWidth="2.6" strokeLinecap="round" opacity="0.95" />
        </g>
      ) : state === "wide" ? (
        <g fill="#FFFFFF">
          <circle cx="56.5" cy="34" r="5.2" />
          <circle cx="83.5" cy="34" r="5.2" />
        </g>
      ) : (
        <g fill="#FFFFFF">
          <circle cx="56.5" cy="34" r="3.6" />
          <circle cx="83.5" cy="34" r="3.6" />
        </g>
      )}
    </g>
  );
}

/* ── the head — skull + vented deck + OLED screen + spectrum ring ─── */
function RobotHead({
  uid,
  eyes,
  shift,
  tilt = 0,
}: {
  uid: string;
  eyes: EyeState;
  shift?: [number, number];
  tilt?: number;
}) {
  return (
    <g transform={tilt ? `rotate(${tilt} 70 90)` : undefined}>
      <rect x="37" y="10" width="66" height="68" rx="14" fill={`url(#${uid}-shell)`} stroke="var(--ln-day-edge)" strokeWidth="1.4" />
      {/* rim light — the shell's lit shoulder (upper inline-start) */}
      <path d="M56 11 Q 89 8.6 102.2 27.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1.8" strokeLinecap="round" />
      {/* the vented top deck + fins (the crown's graphite detail) */}
      <rect x="49" y="6" width="42" height="6" rx="3" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
      {[56.5, 70, 83.5].map((fx) => (
        <rect
          key={fx}
          x={fx - 2.2}
          y="0.5"
          width="4.4"
          height="9"
          rx="2.2"
          fill={`url(#${uid}-graphite)`}
          stroke="var(--ln-day-edge)"
          strokeWidth="1"
        />
      ))}
      {/* the OLED emission spill — the screen's soft cyan aura onto the
          shell, seated under the bezel tube */}
      <rect x="43" y="18" width="54" height="46" rx="10" fill="none" stroke="var(--ln-lime)" strokeOpacity="0.2" strokeWidth="5" />
      {/* the recessed black glass */}
      <rect x="45.5" y="20.5" width="49" height="41" rx="8" fill={`url(#${uid}-screen)`} stroke="var(--ln-day-edge)" strokeWidth="1" opacity="0.9" />
      {/* glass catchlight — one diagonal sheen down the OLED's LIT side
          (the inline-start half, under the same key as every other
          specular — VLM round 4: the light law owns the glass too) */}
      <path d="M78 21.6 L88 21.6 L93.8 60.6 L89 60.6 Z" fill="#FFFFFF" opacity="0.08" />
      {/* the spectrum ring — the hero's bezel TUBE, with its specular
          glint riding the lit corner (the tube read) */}
      <rect x="40.5" y="15.5" width="59" height="51" rx="11" fill="none" stroke={`url(#${uid}-bezel)`} strokeWidth="4.2" />
      <path d="M84 16.2 Q 97.6 17.6 99.2 28" fill="none" stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="2.4" strokeLinecap="round" />
      <RobotEyes uid={uid} state={eyes} shift={shift} />
    </g>
  );
}

/* ── one arm — ball shoulder → smooth upper → elbow ball → forearm →
   the articulated three-finger hand. Limbs are capsule strokes in the
   figure-local shell gradient (coherent lighting); the elbow ball
   carries its machined specular. ──────────────────────────────────── */
type ArmPose = {
  elbow: [number, number];
  hand: [number, number];
  /** rotation of the hand frame — 0 = fingers up, 180 = fingers down */
  handAngle: number;
  /** the same articulated hand, fingers configured: open (the 3-finger
      relaxed hand) or point (index extended — the presenting register) */
  fingers?: "open" | "point";
};

function RobotArm({ uid, shoulder, pose }: { uid: string; shoulder: [number, number]; pose: ArmPose }) {
  const [sx, sy] = shoulder;
  const [ex, ey] = pose.elbow;
  const [hx, hy] = pose.hand;
  return (
    <g>
      {/* the arm's occlusion fringe — a dark under-line the limb sits
          on, so it reads IN FRONT of the torso, not pasted over it */}
      <line x1={sx} y1={sy + 3.5} x2={ex} y2={ey + 3.5} stroke="var(--ln-day-shadow-core)" strokeWidth="10.5" strokeLinecap="round" opacity="0.16" />
      <line x1={ex} y1={ey + 3} x2={hx} y2={hy + 3} stroke="var(--ln-day-shadow-core)" strokeWidth="9" strokeLinecap="round" opacity="0.13" />
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={`url(#${uid}-shell)`} strokeWidth="10.5" strokeLinecap="round" />
      <line x1={ex} y1={ey} x2={hx} y2={hy} stroke={`url(#${uid}-shell)`} strokeWidth="9" strokeLinecap="round" />
      {/* the cylinder sheen — the key-side highlight that makes the
          capsule read as a tube (mass, not a flat sticker) */}
      <g stroke="#FFFFFF" strokeOpacity="0.2" strokeLinecap="round">
        <line x1={sx + 1.7} y1={sy - 1.7} x2={ex + 1.7} y2={ey - 1.7} strokeWidth="2.8" />
        <line x1={ex + 1.5} y1={ey - 1.5} x2={hx + 1.5} y2={hy - 1.5} strokeWidth="2.4" />
      </g>
      <circle cx={ex} cy={ey} r="6.4" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
      <circle cx={ex + 2.1} cy={ey - 2.1} r="2.1" fill={`url(#${uid}-spec)`} />
      <g transform={`translate(${hx} ${hy}) rotate(${pose.handAngle})`}>
        <rect x="-8.5" y="-6" width="17" height="12" rx="5.5" fill="var(--ln-day-shell)" stroke="var(--ln-day-edge)" strokeWidth="1.2" />
        {pose.fingers === "point" ? (
          /* the presenting hand — index finger extended toward the
             subject, the other two folded (the rig's own hand, posed) */
          <g fill="var(--ln-day-shell)" stroke="var(--ln-day-edge)" strokeWidth="1">
            <rect x="-2.2" y="-20" width="4.4" height="20.5" rx="2.2" />
            <rect x="-6.4" y="-11.5" width="4.3" height="8" rx="2.1" />
            <rect x="2.1" y="-11.5" width="4.3" height="8" rx="2.1" />
          </g>
        ) : (
          <g fill="var(--ln-day-shell)" stroke="var(--ln-day-edge)" strokeWidth="1">
            <rect x="-6" y="-13" width="4.3" height="9" rx="2.1" />
            <rect x="-1.8" y="-14.5" width="4.3" height="10.5" rx="2.1" />
            <rect x="2.4" y="-13" width="4.3" height="9" rx="2.1" />
          </g>
        )}
      </g>
    </g>
  );
}

/* ── the standing figure — the hero's proportions, feet on the y=178
   floor (the pedestal adds its 12 below, to y=190). Placed on the
   scene's ground line (232) via translate. ────────────────────────── */
function RobotFigure({
  uid,
  x,
  y = 54,
  eyes,
  eyeShift,
  tilt,
  armL,
  armR,
  pedestal = false,
}: {
  uid: string;
  x: number;
  y?: number;
  eyes: EyeState;
  eyeShift?: [number, number];
  tilt?: number;
  armL: ArmPose;
  armR: ArmPose;
  pedestal?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {pedestal ? (
        <g>
          {/* the deck — the pedestal's top slab, wide enough to
              overhang its plinth (mass, not a wireframe) */}
          <rect x="16" y="178" width="108" height="10" rx="3" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1.2" />
          <rect x="24" y="179.6" width="92" height="2.8" rx="1.4" fill="var(--ln-day-graphite-hi)" opacity="0.7" />
          {/* the plinth front — the hero's low stage: a sunk face under
              the deck's overhang, so the pedestal reads as a solid
              object with weight (VLM round 4: mass, not a thin line) */}
          <path d="M22 188 L118 188 L112 199 L28 199 Z" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
          <path d="M22 188 L118 188 L112 199 L28 199 Z" fill="var(--ln-day-shadow-core)" opacity="0.3" />
          {/* the body CAST onto the deck (toward the end side, opposite
              the key) + the feet pressed into it — the figure is ON the
              platform, not hovering over it (VLM round 3) */}
          <ellipse cx="54" cy="179.6" rx="17" ry="2.1" fill="var(--ln-day-shadow-core)" opacity="0.3" />
          <ellipse cx="70" cy="177.9" rx="30" ry="2.6" fill="var(--ln-day-shadow-core)" opacity="0.5" />
        </g>
      ) : null}
      {/* the ground contact — feet pressed into their own soft pools
          (the shared deck crease lives in the pedestal group above) */}
      {pedestal ? null : (
        <g>
          <ellipse cx="54.5" cy="179.5" rx="11.5" ry="2.6" fill={`url(#${uid}-shadow)`} opacity="0.62" />
          <ellipse cx="85.5" cy="179.5" rx="11.5" ry="2.6" fill={`url(#${uid}-shadow)`} opacity="0.62" />
        </g>
      )}
      {/* legs — smooth limbs with the cylinder sheen, graphite knees
          (specular), flat feet */}
      <line x1="55" y1="148" x2="55" y2="172" stroke={`url(#${uid}-shell)`} strokeWidth="11" strokeLinecap="round" />
      <line x1="85" y1="148" x2="85" y2="172" stroke={`url(#${uid}-shell)`} strokeWidth="11" strokeLinecap="round" />
      <g stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="2.6" strokeLinecap="round">
        <line x1="56.7" y1="150" x2="56.7" y2="170" />
        <line x1="86.7" y1="150" x2="86.7" y2="170" />
      </g>
      <circle cx="55" cy="161" r="6.2" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
      <circle cx="85" cy="161" r="6.2" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
      <circle cx="57" cy="159" r="2.2" fill={`url(#${uid}-spec)`} />
      <circle cx="87" cy="159" r="2.2" fill={`url(#${uid}-spec)`} />
      <rect x="45" y="169" width="19" height="9" rx="3.5" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
      <rect x="76" y="169" width="19" height="9" rx="3.5" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
      {/* hips + waist + chest — one boxy family, with the waist's
          ambient occlusion crease where the segments meet */}
      <rect x="48" y="136" width="44" height="17" rx="8.5" fill={`url(#${uid}-shell)`} stroke="var(--ln-day-edge)" strokeWidth="1.3" />
      <rect x="53.5" y="125" width="33" height="14" rx="7" fill={`url(#${uid}-shell)`} stroke="var(--ln-day-edge)" strokeWidth="1.3" />
      <ellipse cx="70" cy="139.5" rx="14" ry="2.6" fill="var(--ln-day-shadow-core)" opacity="0.3" />
      <rect x="45" y="90" width="50" height="38" rx="11" fill={`url(#${uid}-shell)`} stroke="var(--ln-day-edge)" strokeWidth="1.4" />
      {/* the chest's quiet details — one seam + two vertical slots */}
      <line x1="56" y1="104" x2="84" y2="104" stroke={`url(#${uid}-graphite)`} strokeWidth="2.4" strokeLinecap="round" />
      <rect x="58.5" y="100" width="5" height="15" rx="2.5" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="0.8" />
      <rect x="76.5" y="100" width="5" height="15" rx="2.5" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="0.8" />
      {/* chest rim light — the lit shoulder, same key as the head */}
      <path d="M52 91.2 Q 84 88.4 94.4 108" fill="none" stroke="#FFFFFF" strokeOpacity="0.38" strokeWidth="1.7" strokeLinecap="round" />
      {/* the chest's specular band on the lit face — the broad sheen
          that gives the boxy torso its front-facing mass */}
      <rect x="48.5" y="93" width="13" height="32" rx="6.5" fill="#FFFFFF" opacity="0.07" />
      {/* soft chin occlusion on the chest crown */}
      <ellipse cx="70" cy="93" rx="15" ry="3.5" fill="var(--ln-day-shadow-core)" opacity="0.35" />
      {/* the neck collar */}
      <rect x="62" y="80" width="16" height="12" rx="4" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
      <RobotHead uid={uid} eyes={eyes} shift={eyeShift} tilt={tilt} />
      {/* the shoulder balls — crease occlusion seated under each, then
          the machined ball with its specular (integrated, not pasted) */}
      <ellipse cx="44" cy="105.5" rx="8" ry="2.4" fill="var(--ln-day-shadow-core)" opacity="0.3" />
      <ellipse cx="96" cy="105.5" rx="8" ry="2.4" fill="var(--ln-day-shadow-core)" opacity="0.3" />
      <circle cx="44" cy="97" r="9" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1.1" />
      <circle cx="96" cy="97" r="9" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1.1" />
      <circle cx="46.4" cy="94.6" r="2.6" fill={`url(#${uid}-spec)`} />
      <circle cx="98.4" cy="94.6" r="2.6" fill={`url(#${uid}-spec)`} />
      {/* arms last — the poses (wave, catch, presenting) read over the body */}
      <RobotArm uid={uid} shoulder={[44, 97]} pose={armL} />
      <RobotArm uid={uid} shoulder={[96, 97]} pose={armR} />
    </g>
  );
}

/* ── shared prop helpers ───────────────────────────────────────────── */

/** the grounded contact — the stage-light pool under the contact shadow */
function GroundGlow({ uid, cx, rx, ry = 11, cy = 232 }: { uid: string; cx: number; rx: number; ry?: number; cy?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${uid}-pool)`} />;
}

/** the grounded contact shadow — a soft radial pool */
function GroundShadow({ uid, cx, rx, ry = 7, cy = 232 }: { uid: string; cx: number; rx: number; ry?: number; cy?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${uid}-shadow)`} />;
}

/** the figure halo — the machine's own light sphere behind head +
 *  torso (the hero's light-stage device; transparent at night) */
function FigureHalo({ uid, cx, cy, rx = 96, ry = 122 }: { uid: string; cx: number; cy: number; rx?: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${uid}-halo)`} />;
}

/** a soft ambient depth pool under a floating prop (bubble / envelope) */
function PropShadow({ uid, cx, cy, rx, ry = 5, opacity = 0.38 }: { uid: string; cx: number; cy: number; rx: number; ry?: number; opacity?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${uid}-shadow)`} opacity={opacity} />;
}

/** a tiny Arabic label — decorative echo of the panel copy (aria-hidden art) */
function TinyLabel({ x, y, children, size = 13 }: { x: number; y: number; children: string; size?: number }) {
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight="600" fill="var(--ln-cream-dim)">
      {children}
    </text>
  );
}

/** a rounded message line inside a bubble/chip (abstract text, RTL right-aligned) */
function MsgLine({ x, y, w, opacity = 0.5 }: { x: number; y: number; w: number; opacity?: number }) {
  return <rect x={x} y={y} width={w} height="7" rx="3.5" fill="var(--ln-cream)" opacity={opacity} />;
}

/* ═══ PANEL 01 · 06:00 — the wave ═══════════════════════════════════
 * The robot leans into its raised wave — arcs + chevrons of motion
 * ring the relaxed hand, the welcome bubble rides clear above the
 * crown (its tail stitched into the bubble outline — no floating
 * triangle), and the 06:00 dawn sun is a soft warm orb on the
 * horizon, not line-art. */
function WavePanel({ uid, className }: PanelProps) {
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true" focusable="false" className={className}>
      <PanelDefs uid={uid} />
      {/* the 06:00 dawn wash on the stage floor — the day's first warm
          light arriving at the end side (scene dressing; the figure's
          key stays the one law) */}
      <ellipse cx={128} cy={229} rx={56} ry={9} fill={`url(#${uid}-amber)`} opacity={0.4} />
      <GroundGlow uid={uid} cx={217} rx={74} />
      <GroundShadow uid={uid} cx={214} rx={58} />
      <PropShadow uid={uid} cx={154} cy={57} rx={50} />
      {/* the welcome reply — the machine's voice in cyan; the tail is
          part of the bubble's own outline (VLM round 2: no drift) */}
      <g className="dpa-bob">
        <path
          d="M114 10 H194 Q208 10 208 24 V36 Q208 50 194 50 L186 50 L188 62 L178 50 H114 Q100 50 100 36 V24 Q100 10 114 10 Z"
          fill="var(--ln-day-prop)"
          stroke="var(--ln-day-prop-line)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <text x={154} y={36} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--ln-lime)">
          أهلاً!
        </text>
      </g>
      <FigureHalo uid={uid} cx={220} cy={163} />
      <RobotFigure
        uid={uid}
        x={150}
        eyes="happy"
        tilt={-5}
        armL={{ elbow: [22, 86], hand: [32, 52], handAngle: 40 }}
        armR={{ elbow: [103, 122], hand: [101, 146], handAngle: 180 }}
      />
      {/* the wave — motion arcs + chevrons ringing the relaxed hand
          (strong enough to carry at 300-420px — VLM round 4) */}
      <g stroke="var(--ln-lime)" strokeWidth={2.5} strokeLinecap="round" fill="none">
        <path d="M170 96 Q 177 87 187 88" opacity={1} />
        <path d="M162 100 Q 172 80 192 81" opacity={0.7} />
        <path d="M155 106 Q 167 73 197 74" opacity={0.45} />
      </g>
      <g stroke="var(--ln-lime)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M171 111 l-7 4 l7 4" opacity={0.95} />
        <path d="M160 116 l-7 4 l7 4" opacity={0.65} />
      </g>
      {/* 06:00 — the dawn orb rising over the horizon hairline (kept
          quiet: scene storytelling, not a second key light). The line
          crosses BEHIND the glow so the sun reads as seated on it. */}
      <g>
        <line x1={7} y1={207} x2={64} y2={207} stroke="var(--ln-bot-amber)" strokeWidth={1.5} strokeLinecap="round" opacity={0.32} />
        <circle cx={34} cy={198} r={13.5} fill={`url(#${uid}-sun)`} opacity={0.92} />
        <circle cx={34} cy={198} r={4.6} fill="#FFE9C4" opacity={0.9} />
      </g>
    </svg>
  );
}

/* ═══ PANEL 02 · 13:20 — the classify ═══════════════════════════════
 * Scan-line eyes, head tilted into the work: the near hand is REACHED
 * OUT to catch the incoming شكوى chip — violet sparks bridge the
 * fingertips and the chip (the magnetic read) — while سؤال and طلب
 * sit already classified in the tray; the chip's trajectory carries
 * it (RTL) to the dashed slot still awaiting it. */
function ClassifyPanel({ uid, className }: PanelProps) {
  const rows = [
    { y: 74, label: "سؤال" },
    { y: 110, label: "طلب" },
    { y: 146, label: "شكوى" },
  ];
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true" focusable="false" className={className}>
      <PanelDefs uid={uid} />
      <GroundGlow uid={uid} cx={278} rx={74} />
      <GroundShadow uid={uid} cx={273} rx={56} />
      {/* the intent tray — grounded on the stage, three labeled slots */}
      <g>
        <PropShadow uid={uid} cx={77} cy={187} rx={64} ry={6} opacity={0.55} />
        <rect x={16} y={56} width={122} height={128} rx={12} fill="var(--ln-day-prop)" stroke="var(--ln-day-prop-line)" strokeWidth={1.4} />
        {rows.map((r, i) => (
          <g key={r.label}>
            <rect x={26} y={r.y} width={102} height={30} rx={8} fill="var(--ln-day-prop)" stroke="var(--ln-day-prop-line-soft)" strokeWidth={1.2} />
            <TinyLabel x={100} y={r.y + 20}>{r.label}</TinyLabel>
            {i < 2 ? (
              /* seated chips — classified, checked (same chip geometry
                 as the flying one, so the read completes itself); the
                 inset top hairline seats them INTO the slot */
              <g>
                <rect x={32} y={r.y + 9} width={34} height={18} rx={6} fill="var(--ln-violet)" fillOpacity={0.22} stroke="var(--ln-violet)" strokeWidth={1.2} />
                <rect x={34} y={r.y + 11} width={30} height={2} rx={1} fill="var(--ln-day-shadow-core)" opacity={0.3} />
                <path d={`M38 ${r.y + 18} l 4 5 l 9 -11`} stroke="var(--ln-violet)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
            ) : (
              /* the empty slot — sized to the chip now in flight */
              <rect x={32} y={r.y + 9} width={34} height={18} rx={6} fill="none" stroke="var(--ln-day-prop-line)" strokeWidth={1.2} strokeDasharray="3 4" />
            )}
          </g>
        ))}
      </g>
      {/* the classify trajectory — violet, dotted, RTL; the final
          approach arcs DOWN into the awaiting slot */}
      <path d="M182 110 Q 114 122 58 160" stroke="var(--ln-violet)" strokeWidth={2.4} strokeLinecap="round" strokeDasharray="0.5 7" fill="none" opacity={0.85} />
      <FigureHalo uid={uid} cx={282} cy={163} />
      <RobotFigure
        uid={uid}
        x={212}
        eyes="scan"
        eyeShift={[-4, -3]}
        tilt={-10}
        armL={{ elbow: [30, 80], hand: [14, 52], handAngle: -60 }}
        armR={{ elbow: [103, 122], hand: [101, 146], handAngle: 180 }}
      />
      {/* the magnetic catch — the chip's violet glow bathing the
          contact, then the sparks ringing fingertip ↔ chip */}
      <ellipse cx={216} cy={100} rx={17} ry={14} fill={`url(#${uid}-violetglow)`} />
      <g fill="var(--ln-violet)">
        <circle cx={215} cy={96} r={1.8} opacity={0.9} />
        <circle cx={220} cy={101} r={1.2} opacity={0.6} />
        <circle cx={223} cy={107} r={0.9} opacity={0.4} />
      </g>
      {/* the incoming chip — mid-flight at the fingertips */}
      <g className="dpa-bob">
        <g transform="translate(196 99) rotate(-8)">
          <rect x={-17} y={-10} width={34} height={20} rx={7} fill="var(--ln-violet)" fillOpacity={0.18} stroke="var(--ln-violet)" strokeWidth={1.3} />
          <MsgLine x={-11} y={-4} w={22} opacity={0.55} />
          <MsgLine x={-11} y={4} w={13} opacity={0.35} />
        </g>
      </g>
      {/* the chip's motion ticks — it flies right → left (RTL), so its
          wake trails off the right edge (VLM round 3: no static pasting) */}
      <g stroke="var(--ln-violet)" strokeWidth={2.2} strokeLinecap="round" opacity={0.55}>
        <line x1={224} y1={93} x2={233} y2={90} />
        <line x1={227} y1={102} x2={234} y2={100} />
      </g>
    </svg>
  );
}

/* ═══ PANEL 03 · 21:45 — the reply + the handoff ════════════════════
 * The presenting arm offers the instant reply by its tail — fingertips
 * at the bubble's edge, sound waves broadcasting from its far side —
 * while the dotted amber path carries what needs a human decision to
 * the envelope, whose badge now glows its receiving halo. */
function ReplyPanel({ uid, className }: PanelProps) {
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true" focusable="false" className={className}>
      <PanelDefs uid={uid} />
      <GroundGlow uid={uid} cx={274} rx={74} />
      <GroundShadow uid={uid} cx={270} rx={56} />
      {/* the reply bubble + its sound waves (the machine's voice, cyan).
          One outline: the tail is stitched in — its tip rides the
          presenting hand (VLM round 2: no floating triangle). */}
      <PropShadow uid={uid} cx={154} cy={110} rx={54} />
      <g className="dpa-bob">
        <path
          d="M112 46 H196 Q212 46 212 62 V88 Q212 104 196 104 L188 122 L180 104 H112 Q96 104 96 88 V62 Q96 46 112 46 Z"
          fill="var(--ln-day-prop)"
          stroke="var(--ln-day-prop-line)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <MsgLine x={108} y={64} w={88} opacity={0.55} />
        <MsgLine x={130} y={80} w={64} opacity={0.35} />
      </g>
      <g stroke="var(--ln-lime)" strokeWidth={2.8} strokeLinecap="round" fill="none">
        <path d="M82 62 Q 71 75 82 88" opacity={1} />
        <path d="M69 56 Q 54 75 69 94" opacity={0.7} />
        <path d="M56 50 Q 37 75 56 100" opacity={0.45} />
      </g>
      {/* the escalation path — amber (the human register), RTL to the envelope */}
      <path d="M108 110 Q 76 128 56 144" stroke="var(--ln-bot-amber)" strokeWidth={2.4} strokeLinecap="round" strokeDasharray="0.5 7" fill="none" opacity={1} />
      {/* the handoff — the envelope that reaches the team, its badge
          glowing the receiving halo */}
      <g>
        <PropShadow uid={uid} cx={34} cy={178} rx={26} ry={4} opacity={0.55} />
        <rect x={12} y={142} width={44} height={32} rx={6} fill="var(--ln-bot-amber)" fillOpacity={0.12} stroke="var(--ln-bot-amber)" strokeWidth={2} />
        <path d="M15 147 L34 163 L53 147" stroke="var(--ln-bot-amber)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx={50} cy={141} r={9.5} fill={`url(#${uid}-amber)`} />
        <circle cx={50} cy={141} r={5} fill="var(--ln-bot-amber)" />
      </g>
      <FigureHalo uid={uid} cx={278} cy={163} />
      <RobotFigure
        uid={uid}
        x={208}
        eyes="wide"
        eyeShift={[-3, -1]}
        tilt={-4}
        armL={{ elbow: [26, 100], hand: [-18, 66], handAngle: -15 }}
        armR={{ elbow: [103, 122], hand: [101, 146], handAngle: 180 }}
      />
    </svg>
  );
}

/* ═══ PANEL 04 · 00:00 — the report ═════════════════════════════════
 * Confident on its pedestal (the only panel that stages it — deck +
 * sunk plinth, the hero's low stage), one arm STRAIGHT and long, its
 * index finger aimed at the chart's growth point — the unambiguous
 * «behold the numbers» presentation line, a silhouette owned by no
 * other panel (the wave bends its elbow beside the head; the reply
 * offers low by the bubble's tail). Bars + trend climb toward the
 * LEFT, forward in RTL time, with a small inline time arrow to make
 * the direction unmistakable — the projection seated in its cyan
 * hologram pool, its light spilling onto the presenting arm and the
 * chart-facing chest (the bounce that binds pose to story), calm
 * eyes on the numbers, midnight moon overhead. */
function ReportPanel({ uid, className }: PanelProps) {
  const bars = [
    { x: 134, h: 26, o: 0.4 },
    { x: 106, h: 46, o: 0.56 },
    { x: 78, h: 64, o: 0.72 },
    { x: 50, h: 86, o: 0.95 },
  ];
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true" focusable="false" className={className}>
      <PanelDefs uid={uid} />
      {/* ground contact for the raised staging: the plinth's foot at
          y≈241, its pool + shadow beneath it */}
      <GroundGlow uid={uid} cx={308} rx={78} cy={240} />
      <GroundShadow uid={uid} cx={308} rx={68} cy={240} />
      {/* the plinth's own pressed contact — a second, tighter shadow at
          its foot so the pedestal carries the robot's weight (VLM r5) */}
      <ellipse cx={308} cy={241} rx={54} ry={2.8} fill={`url(#${uid}-shadow)`} opacity={0.6} />
      {/* the performance projection — seated in its cyan hologram pool
          (two depths of spill for the volumetric read) */}
      <ellipse cx={96} cy={109} rx={132} ry={80} fill={`url(#${uid}-pool)`} opacity={0.45} />
      <ellipse cx={96} cy={109} rx={98} ry={62} fill={`url(#${uid}-pool)`} />
      <g className="dpa-bob">
        <rect x={20} y={48} width={152} height={122} rx={12} fill="var(--ln-day-prop)" stroke="var(--ln-day-prop-line)" strokeWidth={1.4} />
        <g stroke="var(--ln-day-prop-line-soft)" strokeWidth={1.2} strokeDasharray="2 5">
          <line x1={34} y1={88} x2={158} y2={88} />
          <line x1={34} y1={122} x2={158} y2={122} />
        </g>
        {bars.map((b) => (
          <rect key={b.x} x={b.x} y={154 - b.h} width={20} height={b.h} rx={3} fill="var(--ln-lime)" opacity={b.o} />
        ))}
        <polyline points="144,118 116,98 88,80 60,54" fill="none" stroke="var(--ln-cream)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
        <g fill="var(--ln-cream)" opacity={0.9}>
          <circle cx={144} cy={118} r={2.6} />
          <circle cx={116} cy={98} r={2.6} />
          <circle cx={88} cy={80} r={2.6} />
        </g>
        {/* the growth point — violet, with its chevron (the trend's
            leading edge — where RTL time is heading — carries the
            unmistakable UP cue) */}
        <circle cx={60} cy={54} r={5.5} fill="var(--ln-violet)" fillOpacity={0.25} />
        <circle cx={60} cy={54} r={3.4} fill="var(--ln-violet)" />
        <path d="M68 58 L60 50 L52 58" stroke="var(--ln-violet)" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* the time arrow — RTL forward is leftward: the past dots fade
          out behind (right), the bold head points on (left) */}
        <g stroke="var(--ln-cream-dim)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.6}>
          <path d="M156 160 H142" />
          <path d="M150 153.5 L142.5 160 L150 166.5" />
        </g>
        <g fill="var(--ln-cream-dim)">
          <circle cx={161} cy={160} r={1.6} opacity={0.5} />
          <circle cx={166.5} cy={160} r={1.3} opacity={0.32} />
          <circle cx={171.5} cy={160} r={1} opacity={0.18} />
        </g>
      </g>
      {/* 00:00 — the midnight moon + stars, halogen enough to read */}
      <circle cx={368} cy={34} r={17} fill={`url(#${uid}-moonglow)`} />
      <mask id={`${uid}-moon`}>
        <rect x={344} y={10} width={48} height={48} fill="white" />
        <circle cx={376} cy={28} r={9.5} fill="black" />
      </mask>
      <circle cx={368} cy={34} r={10.5} fill="var(--ln-cream)" opacity={0.6} mask={`url(#${uid}-moon)`} />
      <g fill="var(--ln-cream)" opacity={0.55}>
        <rect x={344} y={18} width={4} height={4} rx={0.9} transform="rotate(45 346 20)" />
        <rect x={385} y={62} width={3.2} height={3.2} rx={0.8} transform="rotate(45 386.6 63.6)" />
        <rect x={328} y={50} width={2.8} height={2.8} rx={0.7} transform="rotate(45 329.4 51.4)" />
      </g>
      <FigureHalo uid={uid} cx={308} cy={151} />
      <RobotFigure
        uid={uid}
        x={238}
        y={42}
        pedestal
        eyes="calm"
        eyeShift={[-4, -1]}
        tilt={-10}
        armL={{ elbow: [26, 92], hand: [-16, 64], handAngle: -72, fingers: "point" }}
        armR={{ elbow: [103, 122], hand: [101, 146], handAngle: 180 }}
      />
      {/* the hologram's cyan light spilling onto the presenter — the
          chart's own glow washing the presenting forearm and the
          chest's chart-facing face (VLM round 3: bounce light binds the
          pose to its story) */}
      <line x1={262} y1={132} x2={226} y2={108} stroke="var(--ln-lime)" strokeWidth={3} strokeLinecap="round" opacity={0.26} />
      <rect x={284.5} y={135} width={13} height={32} rx={6.5} fill="var(--ln-lime)" opacity={0.06} />
    </svg>
  );
}

/* ── the family portrait — one component, four performances ───────── */
type PanelProps = { uid: string; className?: string };

export function DayPanelArt({ pose, className }: { pose: DayPanelPose; className?: string }) {
  switch (pose) {
    case "wave":
      return <WavePanel uid="dpa1" className={className} />;
    case "classify":
      return <ClassifyPanel uid="dpa2" className={className} />;
    case "reply":
      return <ReplyPanel uid="dpa3" className={className} />;
    case "report":
      return <ReportPanel uid="dpa4" className={className} />;
  }
}
