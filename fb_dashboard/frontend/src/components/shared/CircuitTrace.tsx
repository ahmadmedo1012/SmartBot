import type { SVGProps } from "react";

/**
 * CircuitTrace — the SmartBot signature divider/accent (phase5 r152).
 *
 * A thin signal trace with node dots — the machine-room world's section
 * divider and card accent. Token-driven (trace = primary @ 34%, nodes =
 * primary; the LIVE node = LIME — reserved for AI/automation beats).
 * Pure SVG geometry: performant, theme-aware, zero motion (the CSS twin
 * .sb-trace exists for full-bleed <hr> cases).
 *
 * Variants:
 *   divider (default) — horizontal trace, terminal nodes + mid node.
 *   live              — the inline-end node is LIME (automation-active).
 *   corner            — an L-shaped trace for card/panel accents.
 */
export interface CircuitTraceProps extends Omit<SVGProps<SVGSVGElement>, "title"> {
  variant?: "divider" | "live" | "corner";
  title?: string;
}

export function CircuitTrace({ variant = "divider", title, ...svg }: CircuitTraceProps) {
  const trace = "color-mix(in srgb, var(--primary) 34%, transparent)";
  const node = "var(--primary)";
  const liveNode = "var(--c-lime-ink)";
  return (
    <svg
      viewBox="0 0 120 8"
      preserveAspectRatio="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...svg}
    >
      {title ? <title>{title}</title> : null}
      {variant === "corner" ? (
        <path d="M2 6 H56 Q60 6 60 2 V1.5" fill="none" stroke={trace} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      ) : (
        <g>
          <line x1="4" y1="4" x2="116" y2="4" stroke={trace} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <circle cx="2" cy="4" r="2.4" fill={node} />
          <circle cx="60" cy="4" r="1.4" fill={node} opacity="0.75" />
          <circle cx="118" cy="4" r="2.4" fill={variant === "live" ? liveNode : node} />
        </g>
      )}
    </svg>
  );
}
