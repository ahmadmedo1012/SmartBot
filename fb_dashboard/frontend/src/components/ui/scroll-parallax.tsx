"use client"

import { useRef, useState, useEffect, type ReactNode, type CSSProperties } from "react"
import { useReducedMotion } from "framer-motion"

/* Ported from Smart-Menu's scroll-craft integration (smart-link.ly shared
   identity) — import path adapted for SmartBot's framer-motion setup. */

interface ScrollParallaxProps {
  children: ReactNode
  className?: string
  /** Movement rate (-2 to 2). Negative = moves up faster (recedes). Positive = lags behind scroll. */
  rate?: number
  /** Maximum pixel travel to cap extreme values */
  maxTravel?: number
  style?: CSSProperties
}

/**
 * ScrollParallax — Differential movement for depth perception
 *
 * Adapted from scroll-craft's data-sc-parallax device
 * - Subtle movement (rates 0.3 to 1.5 are most usable)
 * - Past 200px of total travel it reads as a bug, not depth
 * - Capped at maxTravel (default 80px) to prevent extreme cases
 * - Disabled under prefers-reduced-motion
 * - Disabled on touch devices (too much stutter)
 *
 * @example
 * ```tsx
 * <div className="relative h-[400px]">
 *   <ScrollParallax rate={-0.3} className="absolute inset-0">
 *     <img src="background.webp" alt="" />
 *   </ScrollParallax>
 *   <ScrollParallax rate={0.2} className="absolute inset-0">
 *     <h2>Foreground content</h2>
 *   </ScrollParallax>
 * </div>
 * ```
 */
export function ScrollParallax({
  children,
  className,
  rate = 0.5,
  maxTravel = 80,
  style,
}: ScrollParallaxProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [transform, setTransform] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    // Detect mobile / low-power devices
    const checkMobile = () => {
      const coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches
      const small = window.matchMedia("(max-width: 860px)").matches
      setIsMobile(coarse || small)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Disable parallax for reduced motion OR mobile (performance)
    if (prefersReducedMotion || isMobile) {
      setTransform(0)
      return
    }

    let rafId: number | null = null

    const scheduleUpdate = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (!element) return

        const rect = element.getBoundingClientRect()
        const viewportHeight = window.innerHeight

        // Element center vs viewport center
        const elementCenter = rect.top + rect.height / 2
        const viewportCenter = viewportHeight / 2

        // Distance from viewport center, normalized (-0.5 to 0.5)
        const distance = (viewportCenter - elementCenter) / viewportHeight
        const clamped = Math.max(-0.5, Math.min(0.5, distance))

        // rate * 100 = total travel in pixels at extremes
        // Divided by 2 because we only travel to half (clamped -0.5 to 0.5)
        const travel = (rate * 100 * clamped)
        const capped = Math.max(-maxTravel, Math.min(maxTravel, travel))

        setTransform(capped)
      })
    }

    // Initial calculation
    scheduleUpdate()

    window.addEventListener("scroll", scheduleUpdate, { passive: true })
    window.addEventListener("resize", scheduleUpdate)

    return () => {
      window.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", scheduleUpdate)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [rate, maxTravel, prefersReducedMotion, isMobile])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        transform: `translate3d(0, ${transform.toFixed(2)}px, 0)`,
        willChange: prefersReducedMotion || isMobile ? undefined : "transform",
      }}
    >
      {children}
    </div>
  )
}
