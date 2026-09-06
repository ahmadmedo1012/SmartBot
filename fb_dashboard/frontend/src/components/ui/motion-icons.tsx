"use client"

import { Check } from "lucide-react"
import { forwardRef, type SVGProps, type CSSProperties } from "react"

/**
 * Motion-enhanced lucide icons. Ported from Smart-Menu (smart-link.ly
 * shared identity) — v6+: the useAnimate choreography (scale + rotate on
 * hover) is now a pure CSS hover (.motion-icon in globals.css, per-icon
 * rotation via --mi-rot). Drop-in replacement for plain lucide:
 * size/color/className API unchanged, framer-motion fully out of the
 * public (subscribe) critical path.
 *
 * v10-W4: 27 dead wrappers purged (zero importers each, re-grepped) —
 * MotionCheck (subscribe flow ×3) is the only live one.
 */
type MotionIconProps = SVGProps<SVGSVGElement>

const LABEL_ROTATION: Record<string, number> = {
  Check: 15,
}

function makeMotionIcon(Icon: typeof Check, label: string) {
  const Cmp = forwardRef<SVGSVGElement, MotionIconProps>(({ className, width, height, style, ...rest }, ref) => {
    const iconStyle: CSSProperties = {
      ...(style as CSSProperties | undefined),
      "--mi-rot": `${LABEL_ROTATION[label] ?? 0}deg`,
    } as CSSProperties
    return (
      <svg
        ref={ref}
        className={["motion-icon", className].filter(Boolean).join(" ")}
        width={width ?? "100%"}
        height={height ?? "100%"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={iconStyle}
        aria-hidden="true"
      >
        <Icon {...(rest as object)} className="w-full h-full" />
      </svg>
    )
  })
  Cmp.displayName = `Motion${label}`
  return Cmp
}

export const MotionCheck = makeMotionIcon(Check, "Check")
