"use client"

import { useRef, type ReactNode, type CSSProperties, useState, useEffect } from "react"

/* v6+ — framer-free rewrite of the Smart-Menu scroll-craft port.
 * The IntersectionObserver trigger (already present pre-v6+) is kept; the
 * motion tween is now a CSS transition (.reveal/.reveal-shown in
 * globals.css) — framer-motion (~190KB) leaves the public critical path.
 * API is unchanged: every call site keeps working as-is. */

interface ScrollRevealProps {
  children: ReactNode
  className?: string
  /** Stagger delay between children (ms) */
  delay?: number
  /** Animation duration (seconds) */
  duration?: number
  /** Distance to translate from (px) */
  y?: number
  /** Distance to translate from (x axis, px) */
  x?: number
  /** Threshold for intersection observer */
  threshold?: number
  /** Root margin for intersection observer */
  rootMargin?: string
  /** Fire only once on entry */
  once?: boolean
  /** Custom as element */
  as?: "div" | "section" | "article" | "span" | "ul" | "li"
  style?: CSSProperties
  /** Add scale(0.95) to the entrance (matches the framer version's look) */
  scale?: boolean
}

/**
 * ScrollReveal — fire-once (or repeating) reveal animation
 *
 * Content fades up (or slides in) when it enters the viewport.
 * Once revealed, it stays revealed (unless once=false).
 *
 * @example
 * ```tsx
 * <ScrollReveal y={24} delay={100}>
 *   <h2>This will fade up when scrolled into view</h2>
 * </ScrollReveal>
 * ```
 */
export function ScrollReveal({
  children,
  className,
  delay = 0,
  duration = 0.6,
  y = 20,
  x = 0,
  threshold = 0.15,
  rootMargin = "-10% 0px -10% 0px",
  once = true,
  as = "div",
  style,
  scale = false,
}: ScrollRevealProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (mq.matches) {
      setIsInView(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          if (once) {
            observer.disconnect()
          }
        } else if (!once) {
          setIsInView(false)
        }
      },
      { threshold, rootMargin }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold, rootMargin, once])

  const Component = as as "div"

  return (
    <Component
      ref={ref as never}
      className={[scale ? "reveal-scale" : "reveal", isInView ? "reveal-shown" : "", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...style,
        "--rv-x": `${x}px`,
        "--rv-y": `${y}px`,
        "--rv-dur": `${duration}s`,
        "--rv-delay": `${delay}ms`,
      } as CSSProperties}
    >
      {children}
    </Component>
  )
}
