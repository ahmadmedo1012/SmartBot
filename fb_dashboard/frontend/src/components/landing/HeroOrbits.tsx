/* r128 Stage B (F3b) — HeroOrbits: the hero sky's flat orbit chart.
 *
 * A server component (pure static SVG, zero JS): the canonical OrbitScene
 * canvas engine is replaced with the SAME visual grammar per the task
 * mandate — thin 1px cream/lime orbit lines, BOT-FEATURE nodes at the
 * intersections, one horizon hairline, flat flat flat. The two flagship
 * capabilities (الردود الذكية، التحليلات) ride the inner orbits as lime
 * nodes; the rest of the dashboard's capabilities sit as dim cream nodes
 * on the outer ring — the bot's feature set IS the sky.
 *
 * Geometry (viewBox 1200×1200, xMidYMid slice — matches the depth layer):
 *   center  (380, 520) — violet core (accent 2, echoes the progress
 *                        chapter's core)
 *   rings   r = 170 / 260 / 350 / 440 — 1px cream hairlines, two dashed
 *   horizon y = 1010 — the ground line the sky sets behind
 * Decorative (aria-hidden); the real feature names live in the features
 * constellation chapter and the marquee. */

const CREAM_14 = "rgba(245,243,231,0.14)";
const CREAM_10 = "rgba(245,243,231,0.10)";
const CREAM_07 = "rgba(245,243,231,0.07)";
const CREAM_22 = "rgba(245,243,231,0.22)";
const LIME_LINE = "rgba(223,237,178,0.5)";
const LIME_FILL = "#DFEDB2";
const VIOLET = "#7A6BF2";

const CX = 380;
const CY = 520;

/* polar helper — math angles, y flipped for the SVG grid */
function pt(r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

/* the two flagship capabilities — lime nodes on the inner orbits */
const SMART_REPLIES = pt(260, 125);
const ANALYTICS = pt(350, 35);

/* the rest of the dashboard's capabilities — dim nodes on the outer ring */
const CAPABILITIES = [75, 105, 45, 15, 345, 315].map((a) => pt(440, a));

export function HeroOrbits({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 1200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* orbit rings — thin 1px hairlines, two dashed */}
      <circle cx={CX} cy={CY} r={170} fill="none" stroke={CREAM_14} strokeWidth={1} />
      <circle cx={CX} cy={CY} r={260} fill="none" stroke={CREAM_14} strokeWidth={1} strokeDasharray="2 6" />
      <circle cx={CX} cy={CY} r={350} fill="none" stroke={CREAM_10} strokeWidth={1} />
      <circle cx={CX} cy={CY} r={440} fill="none" stroke={CREAM_07} strokeWidth={1} strokeDasharray="2 6" />

      {/* the horizon — where the sky meets the ground */}
      <line x1={0} y1={1010} x2={1200} y2={1010} stroke={CREAM_10} strokeWidth={1} />

      {/* constellation lines — thin, from the core to each flagship */}
      <line x1={CX} y1={CY} x2={SMART_REPLIES.x} y2={SMART_REPLIES.y} stroke={LIME_LINE} strokeWidth={1} />
      <line x1={CX} y1={CY} x2={ANALYTICS.x} y2={ANALYTICS.y} stroke={CREAM_14} strokeWidth={1} />
      {/* the two flagships linked — the orbit thread */}
      <line x1={SMART_REPLIES.x} y1={SMART_REPLIES.y} x2={ANALYTICS.x} y2={ANALYTICS.y} stroke={CREAM_14} strokeWidth={1} />
      {/* thin ties to the wider capability ring */}
      <line x1={SMART_REPLIES.x} y1={SMART_REPLIES.y} x2={CAPABILITIES[2]!.x} y2={CAPABILITIES[2]!.y} stroke={CREAM_07} strokeWidth={1} />
      <line x1={ANALYTICS.x} y1={ANALYTICS.y} x2={CAPABILITIES[4]!.x} y2={CAPABILITIES[4]!.y} stroke={CREAM_07} strokeWidth={1} />

      {/* the core — violet, accent 2 */}
      <circle cx={CX} cy={CY} r={5} fill={VIOLET} />
      <circle cx={CX} cy={CY} r={11} fill="none" stroke={CREAM_22} strokeWidth={1} />

      {/* the flagship capabilities — lime nodes with a thin cream halo */}
      <g>
        <circle cx={SMART_REPLIES.x} cy={SMART_REPLIES.y} r={13} fill="none" stroke={CREAM_22} strokeWidth={1} />
        <circle cx={SMART_REPLIES.x} cy={SMART_REPLIES.y} r={7} fill={LIME_FILL} />
        <circle cx={ANALYTICS.x} cy={ANALYTICS.y} r={13} fill="none" stroke={CREAM_22} strokeWidth={1} />
        <circle cx={ANALYTICS.x} cy={ANALYTICS.y} r={7} fill={LIME_FILL} />
      </g>

      {/* the wider capability ring — dim cream nodes on the outer orbit */}
      {CAPABILITIES.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="rgba(245,243,231,0.35)" />
      ))}
    </svg>
  );
}
