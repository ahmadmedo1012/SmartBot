import type { SVGProps } from "react";

/**
 * CircuitTrace — the SmartBot signature trace accent (phase5 r152).
 *
 * A thin signal trace with node ticks — the machine-room world's card
 * accent and short divider. Token-driven (trace = primary @ 34%, nodes =
 * primary; the LIVE node = LIME — reserved for AI/automation beats).
 * Pure SVG geometry: performant, theme-aware, zero motion.
 *
 * GEOMETRY CONTRACT (stretch-safe): the svg is stretched freely
 * (preserveAspectRatio="none") — the horizontal line carries
 * vectorEffect="non-scaling-stroke" and the nodes are VERTICAL ticks
 * (a vertical line is immune to horizontal stretching; non-scaling
 * strokes keep their painted width at every scale). Circles were
 * rejected deliberately: at wide stretches they shear into ellipses.
 * For full-bleed <hr> chapter dividers prefer the CSS twin .sb-trace
 * (globals.css) — same grammar, dot nodes, no aspect math.
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
          {/* terminal node ticks — vertical ⇒ stretch-immune; the painted
              width stays fixed (non-scaling) at every container width */}
          <line x1="2" y1="2.2" x2="2" y2="5.8" stroke={node} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <line x1="60" y1="3.1" x2="60" y2="4.9" stroke={node} strokeWidth="2" strokeLinecap="round" opacity="0.75" vectorEffect="non-scaling-stroke" />
          <line
            x1="118"
            y1="2.2"
            x2="118"
            y2="5.8"
            stroke={variant === "live" ? liveNode : node}
            strokeWidth="3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </svg>
  );
}
