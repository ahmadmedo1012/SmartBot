/**
 * DayPanelArt — W6 2-a · «يوم في الحياة» panel illustrations (v5, P31-B).
 *
 * ONE deliberate character family, REBUILT: the four storyboard panels
 * draw the SAME head the 3D hero (CharacterScene) now renders — the
 * P31-B MOLDED DOME silhouette, in the panels' 2D grammar:
 *
 * · HEAD — the swept-dome crown (brow-wide at the cheeks, tapering
 *   through the jaw to the rounded chin — the hero's profile revolve,
 *   here one dome path), the machined crown seam hints + the sagittal
 *   graphite crest (the retired deck/fins' heirs), the BROW LEDGE the
 *   visor tucks under, the tapered WRAP VISOR (wide at the brow,
 *   rounding to the chin — the hero's jawline) carrying the OLED glass
 *   + the SPECTRUM bezel ring + TWO white dot eyes (wide-set, upper
 *   third, glow haloed), and the radius-matched rounded EAR PODS,
 *   angled slightly forward (the hero's capsules — the boxy datum pads
 *   retire).
 * · BUST (P22 — the head-only era, kept): each panel stages the SAME
 *   levitating bust the 3D hero renders — the head on its SLIM docking
 *   neck (column + bearing + collar, the hero's slimmed mount),
 *   hovering above its own cyan levitation pool on the ground line.
 *   The machine's expressiveness rides the FACE STATES + the head TILT
 *   + the props' composition — never a deformed pose.
 * · FACE STATES (P31-B — meaningful states, not poses): the OLED face
 *   changes state per capability, all EYE-CENTRIC (nothing below the
 *   eye line ever reads as a mouth): LISTENING (happy arc eyes + cyan
 *   pulse rings receiving), THINKING (dot eyes + the violet scanline
 *   sweeping through the eye line), ANSWERING (wide bright eyes +
 *   cyan broadcast arcs leaving each eye), WORKING (calm eyes + the
 *   tiny violet instrument dial at the glass's bottom edge). One
 *   vocabulary across all four — the same family the hero's beat
 *   channel speaks.
 * · MATERIAL (kept): 2–3-stop gradients from ONE light law shared by
 *   all four panels — key light from the upper inline-start (the
 *   hero's key sits at +x/+y — the RTL start side), so every shell
 *   gradient runs bright-top-start → dark-bottom-end, the finishing
 *   pass carried over: specular glints on the graphite joints, a white
 *   glint arc on the bezel TUBE, a diagonal catchlight on the OLED
 *   glass + its cyan emission spill onto the shell, rim light on the
 *   dome's lit shoulder, ambient occlusion at the neck seat, and the
 *   cyan stage-light pool ground contact (a plain black pool was
 *   invisible on the ink ground). Colors resolve through the --ln-day-*
 *   tokens (landing.css §17d); the spectrum ring, OLED glass and white
 *   eyes are LIGHT — constant.
 * · REGISTER — each capability keeps the landing's color grammar:
 *   cyan = the machine's voice (wave arcs, sound bars, broadcast wave,
 *   chart bars), violet = the AI register (scan line, intent chips,
 *   growth point), amber = the human/handoff register (the envelope,
 *   the dawn sun).
 * · SCENES (kept, P22) — four genuinely distinct narratives around the
 *   one bust: the 06:00 wave (the head tilted into its greeting, arcs +
 *   chevrons of motion ringing the screen side, the welcome bubble
 *   clear of the crown), the 13:20 classify (scan-line eyes, the شكوى
 *   chip drawn magnetically toward the OLED face — violet sparks
 *   bridging chip ↔ screen — while سؤال/طلب sit classified in the
 *   tray), the 21:45 reply (the bubble offered beside the head, sound
 *   waves broadcasting, the amber dotted escalation carrying the
 *   human-decision message to the glowing envelope), the 00:00 report
 *   (calm eyes on the numbers, the head hovering beside its rising
 *   chart, midnight moon overhead). RTL: every prop is composed
 *   right → left, the reading direction.
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
      <linearGradient id={`${uid}-screen`} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="72">
        <stop offset="0" stopColor="var(--ln-day-screen-hi)" />
        <stop offset="1" stopColor="var(--ln-day-screen)" />
      </linearGradient>
      <linearGradient id={`${uid}-bezel`} x1="0" y1="0" x2="1" y2="1">
        {BEZEL_STOPS.map(([offset, color]) => (
          <stop key={offset} offset={offset} stopColor={color} />
        ))}
      </linearGradient>
      <radialGradient id={`${uid}-eyeglow`}>
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" />
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
      {/* machined-graphite specular — the joints' + pods' glint */}
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

/* ── the face states — the hero's two-dot LED grammar, four
   meaningful registers (one per capability). The P31-B iter-2 law
   (two VLM rounds read every glyph below the eye line as a
   "mouth/grill"): the states are EYE-CENTRIC — rings around the eyes,
   a scanline THROUGH the eye line, broadcast arcs beside the eyes —
   the only below-eye glyph is the working dial, an instrument ring,
   never anatomy. The gaze shift rides the eyes alone. ─────────────── */
type FaceState = "listening" | "thinking" | "answering" | "working";

function FaceStates({ uid, state, gaze = [0, 0] }: { uid: string; state: FaceState; gaze?: [number, number] }) {
  const [gx, gy] = gaze;
  return (
    <g>
      <circle cx="56.5" cy="42" r="9" fill={`url(#${uid}-eyeglow)`} />
      <circle cx="83.5" cy="42" r="9" fill={`url(#${uid}-eyeglow)`} />
      {state === "listening" ? (
        <g>
          {/* the receiving eyes — attentive DOTS (the hero's exact
              LED grammar — the VLM round-3 read killed the arc-eyes +
              full pulse rings as "cartoon pupils/irises") with the
              cyan ripple arcs ARRIVING at each eye from its OUTER
              side, open toward the nose — sound reaching the machine,
              a receiving wave, never a closed iris ring */}
          <g transform={`translate(${gx} ${gy})`} fill="#FFFFFF">
            <circle cx="56.5" cy="41" r="4.6" />
            <circle cx="83.5" cy="41" r="4.6" />
          </g>
          <g stroke="var(--ln-lime)" fill="none" strokeLinecap="round">
            <path d="M50.65 37.3 Q 48.55 41 50.65 44.7" strokeWidth="1.7" opacity="0.85" />
            <path d="M48.9 36.2 Q 46.1 41 48.9 45.8" strokeWidth="1.25" opacity="0.45" />
            <path d="M89.35 37.3 Q 91.45 41 89.35 44.7" strokeWidth="1.7" opacity="0.85" />
            <path d="M91.1 36.2 Q 93.9 41 91.1 45.8" strokeWidth="1.25" opacity="0.45" />
          </g>
        </g>
      ) : state === "thinking" ? (
        <g>
          {/* the classifying eyes — steady dots with the AI register's
              violet scanline sweeping THROUGH the eye line (a scanner
              beam crosses the eyes; a mouth never could) + its
              trailing ticks */}
          <g transform={`translate(${gx} ${gy})`} fill="#FFFFFF">
            <circle cx="56.5" cy="41" r="4" />
            <circle cx="83.5" cy="41" r="4" />
          </g>
          <line x1="47" y1="41" x2="93" y2="41" stroke="var(--ln-violet)" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" />
          <line x1="90" y1="47.5" x2="93" y2="47.5" stroke="var(--ln-violet)" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
          <line x1="84" y1="47.5" x2="87" y2="47.5" stroke="var(--ln-violet)" strokeWidth="1.8" strokeLinecap="round" opacity="0.3" />
        </g>
      ) : state === "answering" ? (
        <g>
          {/* the speaking eyes — wide + bright, the machine's voice
              radiating OUT: three cyan broadcast arcs leave each eye's
              outer side (transmitting, at eye height — never a mouth) */}
          <g transform={`translate(${gx} ${gy})`} fill="#FFFFFF">
            <circle cx="56.5" cy="41" r="5.2" />
            <circle cx="83.5" cy="41" r="5.2" />
          </g>
          <g stroke="var(--ln-lime)" fill="none" strokeLinecap="round">
            <path d="M47.5 41 q-3.5 0 -6.5 3.2" strokeWidth="1.8" opacity="0.9" />
            <path d="M45.5 35.4 q-6.5 0.8 -11 5.8" strokeWidth="1.5" opacity="0.55" />
            <path d="M44.5 30.4 q-9.5 1.2 -15.5 8.2" strokeWidth="1.2" opacity="0.3" />
            <path d="M92.5 41 q3.5 0 6.5 3.2" strokeWidth="1.8" opacity="0.9" />
            <path d="M94.5 35.4 q6.5 0.8 11 5.8" strokeWidth="1.5" opacity="0.55" />
            <path d="M95.5 30.4 q9.5 1.2 15.5 8.2" strokeWidth="1.2" opacity="0.3" />
          </g>
        </g>
      ) : (
        <g>
          {/* the night-watch eyes — calm, on the numbers; the working
              register is a tiny violet DIAL at the glass's bottom edge
              (an instrument ring with a progress arc + dot — hardware,
              never anatomy) */}
          <g transform={`translate(${gx} ${gy})`} fill="#FFFFFF">
            <circle cx="56.5" cy="41" r="3.6" />
            <circle cx="83.5" cy="41" r="3.6" />
          </g>
          <g stroke="var(--ln-violet)" fill="none">
            <circle cx="70" cy="61" r="5.4" strokeWidth="1.4" opacity="0.75" />
            <path d="M70 61 L74 58.2" strokeWidth="1.8" strokeLinecap="round" opacity="0.95" />
          </g>
          <circle cx="70" cy="61" r="1.7" fill="var(--ln-violet)" />
        </g>
      )}
    </g>
  );
}

/* ── the head — the P31-B molded dome in the panels' 2D grammar ──── */

/* the wrap visor's outline: wide at the brow, rounding to the chin —
   the hero's tapered jawline; one path shared by the emission spill,
   the glass, and the spectrum tube so the family can't drift */
const VISOR_PATH =
  "M 56 30 H 84 Q 96 30 96 41 V 48 Q 96 70 74 70 H 66 Q 44 70 44 48 V 41 Q 44 30 56 30 Z";

function RobotHead({
  uid,
  state,
  gaze,
  tilt = 0,
}: {
  uid: string;
  state: FaceState;
  gaze?: [number, number];
  tilt?: number;
}) {
  return (
    <g transform={tilt ? `rotate(${tilt} 70 48)` : undefined}>
      {/* rim light — the dome's lit shoulder (upper inline-start) */}
      <path d="M46 9 Q 86 4.5 103.5 30" fill="none" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1.8" strokeLinecap="round" />
      {/* THE DOME — the hero's swept crown: brow-wide at the cheeks,
          tapering through the jaw to the rounded chin (one path — the
          rounded-box "toaster" era retires here too). VLM round-2 fix:
          76 → 72 wide (H/W 1.14 → 1.20 = the 3D head's own 1.21) — the
          panel head reads as tall and elegant as the hero, never
          chubby) */}
      <path
        d="M70 4 C 93 4 106 20 106 42 C 106 62 99 76 87 84 C 80.5 88.5 75.5 90.5 70 90.5 C 64.5 90.5 59.5 88.5 53 84 C 41 76 34 62 34 42 C 34 20 47 4 70 4 Z"
        fill={`url(#${uid}-shell)`}
        stroke="var(--ln-day-edge)"
        strokeWidth="1.4"
      />
      {/* the crown part-line hints (the machined seam's sides) */}
      <path d="M37 44 Q 38.5 33 44 25.5" fill="none" stroke={`url(#${uid}-graphite)`} strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      <path d="M103 44 Q 101.5 33 96 25.5" fill="none" stroke={`url(#${uid}-graphite)`} strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      {/* the sagittal crest — the graphite spine over the crown (the
          hero's crown rib, the retired fins' heir) */}
      <rect x="67.8" y="4.5" width="4.4" height="17" rx="2.2" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
      {/* the brow ledge — the shell ridge the visor tucks under (the
          hero's face-plate → skull transition) */}
      <path d="M47 27 Q 70 20.5 93 27" fill="none" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="2.6" strokeLinecap="round" />
      {/* THE WRAP VISOR — the tapered OLED glass: wide at the brow,
          rounding to the chin; the emission spill seated under the
          bezel tube */}
      <path d={VISOR_PATH} fill="none" stroke="var(--ln-lime)" strokeOpacity="0.2" strokeWidth="6" />
      <path d={VISOR_PATH} fill={`url(#${uid}-screen)`} stroke="var(--ln-day-edge)" strokeWidth="1" opacity="0.9" />
      {/* glass catchlight — one diagonal sheen down the OLED's LIT side
          (the inline-start half, under the same key as every other
          specular) */}
      <path d="M85 31.4 L93.5 31.4 L90.5 68.6 L85 68.6 Z" fill="#FFFFFF" opacity="0.08" />
      {/* the spectrum ring — the hero's bezel TUBE tracing the visor,
          with its specular glint riding the lit corner (the tube read).
          VLM round-1: 4.2 → 5.2 — the tube's weight carries the
          hardware-housing read at panel scale, same proportion as the
          3D bezel (≈10% of the visor's width) */}
      <path d={VISOR_PATH} fill="none" stroke={`url(#${uid}-bezel)`} strokeWidth="5.2" />
      <path d="M84.8 31.2 Q 94.2 32.4 95.6 41.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="2.6" strokeLinecap="round" />
      {/* THE EARS — radius-matched rounded pods (the hero's capsules),
          hugging the cheekline, angled slightly forward (round-2: one
          notch slimmer — the pods stay a quiet instrument, never the
          head's loudest proportion) */}
      <g transform="rotate(-10 35.2 48)">
        <rect x="30.8" y="34" width="8.8" height="28" rx="4.4" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
        <line x1="34.3" y1="38" x2="34.3" y2="45" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <g transform="rotate(10 104.8 48)">
        <rect x="100.4" y="34" width="8.8" height="28" rx="4.4" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
        <line x1="105.7" y1="38" x2="105.7" y2="45" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <FaceStates uid={uid} state={state} gaze={gaze} />
    </g>
  );
}

/* ── the levitation ground (P22) — the bust's own light: a cyan pool
 *   on the ground line with a brighter core (the hover's source), and
 *   the SOFT wide shadow a mass hovering HIGH casts — light, never a
 *   pressed contact (the head rides above its light, not on it). ──── */
function BustGround({ uid, cx, cy = 232, rx = 48 }: { uid: string; cx: number; cy?: number; rx?: number }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={8} fill={`url(#${uid}-pool)`} />
      <ellipse cx={cx} cy={cy - 1} rx={rx * 0.4} ry={3.2} fill="var(--ln-lime)" opacity={0.28} />
      <ellipse cx={cx} cy={cy + 2} rx={rx * 0.86} ry={4.6} fill={`url(#${uid}-shadow)`} opacity={0.4} />
    </g>
  );
}

/* ── the bust (P22 + P31-B) — the head-only staging the hero renders,
 *   in 2D: the molded-dome crown on its SLIM docking neck (column +
 *   bearing + collar — the hero's slimmed mount), hovering above
 *   BustGround. cx centers the HEAD; y seats the crown; s scales (the
 *   head is the protagonist now — big); tilt + the face state carry
 *   the panel's mood. No body, no limbs, no hands — by the owner's
 *   directive, at the source. ─────────────────────────────────────── */
function RobotBust({
  uid,
  cx,
  y,
  state,
  gaze,
  tilt = 0,
  s = 1.35,
  ground = 232,
  groundRx = 48,
}: {
  uid: string;
  cx: number;
  y: number;
  state: FaceState;
  gaze?: [number, number];
  tilt?: number;
  s?: number;
  ground?: number;
  groundRx?: number;
}) {
  return (
    <g>
      <BustGround uid={uid} cx={cx} cy={ground} rx={groundRx} />
      <g transform={`translate(${cx - 70 * s} ${y}) scale(${s})`}>
        {/* the neck — the slim docking mount: bearing race at the
            skull seat, taper column, wider collar disc (the hero's
            collar → column → race stack) */}
        <rect x="61" y="86" width="18" height="5.5" rx="2.75" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
        <rect x="63.5" y="88" width="13" height="18" rx="4.5" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
        <rect x="57" y="104" width="26" height="7.5" rx="3.75" fill={`url(#${uid}-graphite)`} stroke="var(--ln-day-edge)" strokeWidth="1" />
        <rect x="59.5" y="105.4" width="21" height="2" rx="1" fill="var(--ln-day-graphite-hi)" opacity={0.7} />
        {/* soft occlusion where the neck seats into the skull */}
        <ellipse cx="70" cy="89" rx="11" ry="2.6" fill="var(--ln-day-shadow-core)" opacity={0.35} />
        <RobotHead uid={uid} state={state} gaze={gaze} tilt={tilt} />
      </g>
    </g>
  );
}

/* ── shared prop helpers ───────────────────────────────────────────── */

/** the figure halo — the machine's own light sphere behind the bust
 *  (the hero's light-stage device; transparent at night) */
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
 * P31-B: the LISTENING face — happy arc eyes ringed with the cyan
 * pulse rings receiving the day's first comment; the bust tilts into
 * its greeting, arcs + chevrons of motion ring the head's screen side
 * (the machine's voice, cyan), the welcome bubble rides clear
 * above-left of the crown, and the 06:00 dawn sun is a soft warm orb
 * on the horizon. */
function WavePanel({ uid, className }: PanelProps) {
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true" focusable="false" className={className}>
      <PanelDefs uid={uid} />
      {/* the 06:00 dawn wash on the stage floor — the day's first warm
          light arriving at the end side (scene dressing; the bust's
          key stays the one law) */}
      <ellipse cx={128} cy={229} rx={56} ry={9} fill={`url(#${uid}-amber)`} opacity={0.4} />
      <PropShadow uid={uid} cx={154} cy={57} rx={50} />
      {/* the welcome reply — the machine's voice in cyan; the tail is
          part of the bubble's own outline (no floating triangle) */}
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
      <FigureHalo uid={uid} cx={278} cy={110} rx={82} ry={92} />
      <RobotBust uid={uid} cx={278} y={40} s={1.35} state="listening" gaze={[-3, 1]} tilt={-5} />
      {/* the greeting — motion arcs + chevrons ringing the head's
          screen side (strong enough to carry at 300-420px) */}
      <g stroke="var(--ln-lime)" strokeWidth={2.6} strokeLinecap="round" fill="none">
        <path d="M224 86 Q 209 103 216 122" opacity={1} />
        <path d="M212 76 Q 191 103 202 130" opacity={0.7} />
        <path d="M200 66 Q 173 103 188 138" opacity={0.45} />
      </g>
      <g stroke="var(--ln-lime)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M182 98 l-7 4 l7 4" opacity={0.95} />
        <path d="M173 108 l-7 4 l7 4" opacity={0.65} />
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
 * P31-B: the THINKING face — steady dot eyes with the violet scanline
 * sweeping through the eye line; the bust tilted into the work, the
 * incoming شكوى chip drawn MAGNETICALLY toward the OLED face (violet
 * sparks bridging chip ↔ screen, the AI register's pull) while سؤال
 * and طلب sit already classified in the tray; the chip's trajectory
 * carries it (RTL) to the dashed slot still awaiting it. */
function ClassifyPanel({ uid, className }: PanelProps) {
  const rows = [
    { y: 74, label: "سؤال" },
    { y: 110, label: "طلب" },
    { y: 146, label: "شكوى" },
  ];
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true" focusable="false" className={className}>
      <PanelDefs uid={uid} />
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
      <path d="M172 112 Q 110 124 58 160" stroke="var(--ln-violet)" strokeWidth={2.4} strokeLinecap="round" strokeDasharray="0.5 7" fill="none" opacity={0.85} />
      <FigureHalo uid={uid} cx={266} cy={104} rx={78} ry={88} />
      <RobotBust uid={uid} cx={266} y={36} s={1.35} state="thinking" gaze={[-3, -2]} tilt={-9} />
      {/* the magnetic catch — the chip's violet glow bathing the gap
          between chip and screen (a clear gap: the chip hovers BEFORE
          the face, never touching its rim), then the sparks bridging */}
      <ellipse cx={208} cy={101} rx={16} ry={13} fill={`url(#${uid}-violetglow)`} />
      <g fill="var(--ln-violet)">
        <circle cx={207} cy={96} r={1.8} opacity={0.9} />
        <circle cx={211} cy={101} r={1.2} opacity={0.6} />
        <circle cx={214} cy={107} r={0.9} opacity={0.4} />
      </g>
      {/* the incoming chip — mid-flight, pulled toward the OLED face
          (a deliberate air gap to the bezel — hovering, never
          clipped) */}
      <g className="dpa-bob">
        <g transform="translate(186 100) rotate(-8)">
          <rect x={-17} y={-10} width={34} height={20} rx={7} fill="var(--ln-violet)" fillOpacity={0.18} stroke="var(--ln-violet)" strokeWidth={1.3} />
          <MsgLine x={-11} y={-4} w={22} opacity={0.55} />
          <MsgLine x={-11} y={4} w={13} opacity={0.35} />
        </g>
      </g>
      {/* the chip's motion ticks — it flies right → left (RTL), so its
          wake trails up-right of the chip, clear of the head's rim */}
      <g stroke="var(--ln-violet)" strokeWidth={2.2} strokeLinecap="round" opacity={0.55}>
        <line x1={203} y1={86} x2={212} y2={83} />
        <line x1={206} y1={93} x2={214} y2={91} />
      </g>
    </svg>
  );
}

/* ═══ PANEL 03 · 21:45 — the reply + the handoff ════════════════════
 * P31-B: the ANSWERING face — wide bright eyes with the cyan broadcast
 * arcs leaving each eye; the instant reply rides beside the head —
 * the bubble's tail pointing home to the machine, sound waves
 * broadcasting from its far side — while the dotted amber path carries
 * what needs a human decision to the envelope, whose badge glows its
 * receiving halo. */
function ReplyPanel({ uid, className }: PanelProps) {
  return (
    <svg viewBox="0 0 400 250" aria-hidden="true" focusable="false" className={className}>
      <PanelDefs uid={uid} />
      {/* the reply bubble + its sound waves (the machine's voice, cyan).
          One outline: the tail is stitched in — its tip points toward
          the head, the speaker. */}
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
      <FigureHalo uid={uid} cx={272} cy={106} rx={78} ry={88} />
      <RobotBust uid={uid} cx={272} y={40} s={1.35} state="answering" gaze={[-3, -1]} tilt={-4} />
    </svg>
  );
}

/* ═══ PANEL 04 · 00:00 — the report ═════════════════════════════════
 * P31-B: the WORKING face — calm night-watch eyes + the tiny violet
 * instrument dial at the glass's bottom edge; the bust hovers BESIDE
 * its rising chart, the
 * hologram's cyan light spilling onto the head's chart-facing face
 * (the bounce that binds the gaze to its story). Bars + trend climb
 * toward the LEFT, forward in RTL time, with a small inline time
 * arrow to make the direction unmistakable — the projection seated
 * in its cyan hologram pool, midnight moon overhead. */
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
      <FigureHalo uid={uid} cx={292} cy={92} rx={80} ry={90} />
      <RobotBust uid={uid} cx={292} y={28} s={1.35} ground={240} groundRx={52} state="working" gaze={[-3, -1]} tilt={-9} />
      {/* the hologram's cyan light spilling onto the reader — the
          chart's own glow washing the head's chart-facing face (the
          bounce that binds the gaze to its story) */}
      <line x1={252} y1={116} x2={232} y2={92} stroke="var(--ln-lime)" strokeWidth={3} strokeLinecap="round" opacity={0.26} />
      <rect x={248} y={88} width={12} height={44} rx={6} fill="var(--ln-lime)" opacity={0.06} />
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
