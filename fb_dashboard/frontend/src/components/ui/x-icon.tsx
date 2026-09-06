"use client"
import { forwardRef, useImperativeHandle } from "react"

/* Ported from Smart-Menu (smart-link.ly shared identity) — identical
   animation choreography, import path adapted for SmartBot's
   framer-motion setup. Types are inlined (no ui/types.ts contract here).
   v6+: framer-free — hover choreography is pure CSS (.ai-icon rules in
   globals.css); the imperative handle stays for API compatibility. */
export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface AnimatedIconProps {
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
}

const XIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
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
        aria-hidden="true"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />

        {/* First line (top-left to bottom-right) */}
        <path
          d="M18 6l-12 12"
          className="x-line-1"
        />

        {/* Second line (bottom-left to top-right) */}
        <path
          d="M6 6l12 12"
          className="x-line-2"
        />
      </svg>
    )
  },
)

XIcon.displayName = "XIcon"
export default XIcon
