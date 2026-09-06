"use client"
import { forwardRef, useImperativeHandle } from "react"

/* Adapted from Smart-Menu (smart-link.ly shared identity) — same animation
   choreography, import path adapted for SmartBot's framer-motion setup.
   v6+: framer-free — the front-copy wiggle is pure CSS (.ai-icon rules in
   globals.css); the imperative handle stays for API compatibility. */
import type { AnimatedIconHandle, AnimatedIconProps } from "./upload-icon"

const CopyIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
    useImperativeHandle(ref, () => ({
      startAnimation: () => {},
      stopAnimation: () => {},
    }))

    return (
      <div
        className={`ai-icon inline-flex cursor-pointer items-center justify-center ${className}`}
      >
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
          aria-hidden="true"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
          <path
            className="front-copy"
            d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z"
          />
        </svg>
      </div>
    )
  },
)

CopyIcon.displayName = "CopyIcon"

export default CopyIcon
