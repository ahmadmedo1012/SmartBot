import type { SVGProps } from "react";

/**
 * RobotMark — THE SmartBot robot (phase5 r152, Circuit Petrol).
 *
 * ONE art direction everywhere (landing hero, /demo simulator, empty
 * states, auth cards): matte petrol shell (soft surface + hairline
 * edge), teal visor (the machine's voice — SIGNAL TEAL), lime status
 * LED (the AI/automation signal — reserved color). No raster assets,
 * no stock illustration: a single lightweight inline SVG (≈2KB) that
 * themes itself through the semantic tokens (dark + light +
 * prefers-contrast — the shell/visor/LED resolve every mode).
 *
 * STATES (a visible state machine, mirrors the product truth):
 *   idle       — calm, breathing LED. Default everywhere.
 *   greeting   — happy arc-eyes + a teal wave line. Landing hero wave /
 *                welcomes / finale.
 *   thinking   — scan bar sweeps the visor (lime — the AI register),
 *                eyes drift apart. «typing»/AI-generating moments.
 *   responding — wide-open eyes + teal sound waves. A bot reply just
 *                landed.
 *   error      — rose visor glitch + rose LED. Error/empty-danger
 *                states.
 *
 * Motion: the rb-* keyframes live in globals.css (signature-motif
 * layer §4) — ONE definition shared by every instance (no per-render
 * <style> duplication), every loop verb carries its own
 * prefers-reduced-motion off-switch, and the universal belt in
 * globals.css is the second guard.
 *
 * Decorative by role: consumers pair it with a text label — it renders
 * aria-hidden (default) unless a `title` is passed, in which case it
 * becomes a titled <img> for standalone informative uses.
 */
export type RobotState = "idle" | "greeting" | "thinking" | "responding" | "error";

export interface RobotMarkProps extends Omit<SVGProps<SVGSVGElement>, "title"> {
  state?: RobotState;
  /** optional accessible name — renders a <title> and drops aria-hidden */
  title?: string;
}

export function RobotMark({ state = "idle", title, ...svg }: RobotMarkProps) {
  /* the reserved register: the LED is LIME (AI/automation heartbeat)
   * except on error, where the whole machine goes rose. */
  const led = state === "error" ? "var(--destructive)" : "var(--c-lime-ink)";
  const visor = state === "error" ? "var(--destructive)" : "var(--primary)";
  return (
    <svg
      viewBox="0 0 120 120"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...svg}
    >
      {title ? <title>{title}</title> : null}
      {/* antenna + the status LED (breathing — rb-led) */}
      <line x1="60" y1="14" x2="60" y2="28" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" />
      <circle className="rb-led" cx="60" cy="9" r="5.5" fill={led} />
      {/* ear nodes — circuit junctions */}
      <rect x="8" y="44" width="7" height="16" rx="3.5" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
      <rect x="105" y="44" width="7" height="16" rx="3.5" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
      {/* head shell — matte petrol */}
      <rect x="22" y="24" width="76" height="56" rx="18" fill="var(--secondary)" stroke="var(--border)" strokeWidth="2" />
      {/* neck */}
      <rect x="54" y="76" width="12" height="10" rx="3" fill="var(--card)" />
      {/* visor ground — sunken slot */}
      <rect x="32" y="36" width="56" height="28" rx="13" fill="var(--surface-sunken)" stroke="var(--border)" strokeWidth="1.5" />
      {/* visor glass — the machine voice (teal; rose + glitch on error) */}
      <rect
        x="35"
        y="39"
        width="50"
        height="22"
        rx="10"
        fill={visor}
        opacity={state === "error" ? 0.85 : 0.92}
        className={state === "error" ? "rb-glitch" : undefined}
      />
      {/* eyes per state */}
      {state === "greeting" ? (
        <g stroke="var(--surface-sunken)" strokeWidth="3.4" strokeLinecap="round" fill="none">
          <path d="M45 51 q4 -6 8 0" />
          <path d="M67 51 q4 -6 8 0" />
        </g>
      ) : state === "thinking" ? (
        <g fill="var(--surface-sunken)">
          <rect x="45" y="46" width="8" height="10" rx="4" />
          <rect x="67" y="48" width="8" height="8" rx="4" />
        </g>
      ) : state === "responding" ? (
        <g fill="var(--surface-sunken)">
          <rect x="44" y="43" width="10" height="14" rx="5" />
          <rect x="66" y="43" width="10" height="14" rx="5" />
        </g>
      ) : (
        <g fill="var(--surface-sunken)">
          <rect x="45" y="45" width="9" height="12" rx="4.5" />
          <rect x="66" y="45" width="9" height="12" rx="4.5" />
        </g>
      )}
      {/* visor scan bar — the thinking register (LIME: the AI sweep) */}
      {state === "thinking" ? (
        <rect className="rb-scan" x="56" y="40" width="5" height="20" rx="2.5" fill="var(--c-lime-ink)" opacity="0.9" />
      ) : null}
      {/* sound waves — the responding register (teal, both sides) */}
      {state === "responding" ? (
        <g stroke="var(--primary)" strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path className="rb-say" d="M12 52 q-4 6 0 12" />
          <path className="rb-say" d="M6 48 q-6 9 0 18" />
          <path className="rb-say" d="M108 52 q4 6 0 12" />
          <path className="rb-say" d="M114 48 q6 9 0 18" />
        </g>
      ) : null}
      {/* wave line — the greeting register (teal, clear of the shell) */}
      {state === "greeting" ? (
        <path
          className="rb-wave"
          d="M2 42 q5 -7 9 0 t9 0"
          stroke="var(--primary)"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
          style={{ transformOrigin: "10px 42px" }}
        />
      ) : null}
      {/* body shell */}
      <rect x="34" y="84" width="52" height="26" rx="12" fill="var(--secondary)" stroke="var(--border)" strokeWidth="2" />
      {/* chest circuit trace + nodes — the Circuit Petrol motif on the body */}
      <line x1="44" y1="97" x2="76" y2="97" stroke="var(--border)" strokeWidth="1.6" />
      <circle cx="44" cy="97" r="2.4" fill="var(--primary)" />
      <circle cx="76" cy="97" r="2.4" fill="var(--primary)" />
      <rect x="55" y="92" width="10" height="10" rx="3" fill="var(--surface-sunken)" />
      <circle className="rb-led" cx="60" cy="97" r="2.6" fill={led} />
    </svg>
  );
}
