"use client"
import { forwardRef, useImperativeHandle, useCallback, useRef } from "react"
import { motion, useAnimate } from "framer-motion"

/* Adapted from Smart-Menu (smart-link.ly shared identity) — same animation
   choreography, import path adjusted for SmartBot's framer-motion setup.
   Types are inlined (SmartBot has no ui/types.ts icon contracts). */
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
    const [scope, animate] = useAnimate()
    const isAnimatingRef = useRef(false)

    const start = useCallback(async () => {
      if (isAnimatingRef.current) return
      isAnimatingRef.current = true

      while (isAnimatingRef.current) {
        // 1. Fly up and fade out
        await animate(".arrow-group", { y: -12, opacity: 0 }, { duration: 0.4, ease: "easeIn" })
        if (!isAnimatingRef.current) break

        // 2. Instant reset to bottom
        await animate(".arrow-group", { y: 12, opacity: 0 }, { duration: 0 })

        // 3. Fly in from bottom to center
        await animate(".arrow-group", { y: 0, opacity: 1 }, { duration: 0.4, ease: "easeOut" })
        if (!isAnimatingRef.current) break

        // Small pause at center for "intention"
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }, [animate])

    const stop = useCallback(() => {
      isAnimatingRef.current = false
      animate(".arrow-group", { y: 0, opacity: 1 }, { duration: 0.3, ease: "easeOut" })
    }, [animate])

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }))

    return (
      <motion.svg
        ref={scope}
        onHoverStart={start}
        onHoverEnd={stop}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`cursor-pointer ${className}`}
        style={{ overflow: "visible" }}
      >
        {/* Base bracket */}
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        {/* Arrow (main & only) */}
        <motion.g className="arrow-group">
          <path d="M12 3v12" />
          <path d="m17 8-5-5-5 5" />
        </motion.g>
      </motion.svg>
    )
  },
)

UploadIcon.displayName = "UploadIcon"
export default UploadIcon
