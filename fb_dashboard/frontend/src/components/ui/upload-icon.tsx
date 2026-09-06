"use client"
import { forwardRef, useImperativeHandle } from "react"

/* Adapted from Smart-Menu (smart-link.ly shared identity) — same animation
   choreography, import path adapted for SmartBot's framer-motion setup.
   Types are inlined (SmartBot has no ui/types.ts icon contracts).
   v6+: framer-free — the looping arrow fly is pure CSS (.ai-icon rules in
   globals.css, upload-fly keyframes); the imperative handle stays for API
   compatibility. */
export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}
export interface AnimatedIconProps {
  size?: number | string
  color?: string
  strokeWidth?: number
  className?: string
}

const UploadIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
    useImperativeHandle(ref, () => ({
      startAnimation: () => {},
      stopAnimation: () => {},
    }))

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`ai-icon cursor-pointer ${className}`}
        style={{ overflow: "visible" }}
        aria-hidden="true"
      >
        {/* Base bracket */}
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        {/* Arrow (main & only) */}
        <g className="arrow-group">
          <path d="M12 3v12" />
          <path d="m17 8-5-5-5 5" />
        </g>
      </svg>
    )
  },
)

UploadIcon.displayName = "UploadIcon"
export default UploadIcon
