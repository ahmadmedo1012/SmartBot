"use client"

/* Ported from Smart-Menu ui/message-circle-icon.tsx (final-launch plan v3 §2.4)
 * — imperative draw-on-hover choreography for the WhatsApp affordance.
 * v6+: framer-free — the draw-on-hover is pure CSS (message-draw keyframes
 * + pathLength="1" normalization); types inlined per the SB icon-file
 * convention; the imperative handle stays for API compatibility. */
import { forwardRef, useImperativeHandle } from "react"

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

const MessageCircleIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
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
        <path
          className="message-path"
          pathLength={1}
          d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"
          style={{ transformOrigin: "center" }}
        />
      </svg>
    )
  },
)

MessageCircleIcon.displayName = "MessageCircleIcon"

export default MessageCircleIcon
