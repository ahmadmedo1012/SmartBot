"use client"

import { useRef, type ReactNode, type CSSProperties, useState, useEffect } from "react"
import { motion, useReducedMotion } from "framer-motion"

/* Ported from Smart-Menu's scroll-craft integration (smart-link.ly shared
   identity) — import path adapted for SmartBot's framer-motion setup.
   See SCROLLCRAFT.md in this folder for the full component guide. */

interface ScrollRevealProps {
  children: ReactNode
  className?: string
  /** Stagger delay between children (ms) */
  delay?: number
  /** Animation duration */
  duration?: number
  /** Distance to translate from */
  y?: number
  /** Distance to translate from (x axis) */
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
}

/**
 * ScrollReveal — Fire-once reveal animation
 *
 * Adapted from scroll-craft's flow + in device
 * Content fades up (or slides in) when it enters the viewport
 * Once revealed, it stays revealed (no re-hiding on scroll up)
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
}: ScrollRevealProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [isInView, setIsInView] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Skip observer for reduced motion
    if (prefersReducedMotion) {
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
  }, [threshold, rootMargin, once, prefersReducedMotion])

  const Component = motion[as as keyof typeof motion] as any

  return (
    <Component
      ref={ref as any}
      className={className}
      style={style}
      initial={{ opacity: 0, y, x }}
      animate={isInView ? { opacity: 1, y: 0, x: 0 } : undefined}
      transition={{
        duration: prefersReducedMotion ? 0.2 : duration,
        delay: prefersReducedMotion ? 0 : delay / 1000,
        ease: [0.23, 1, 0.32, 1],
      }}
    >
      {children}
    </Component>
  )
}

interface StaggeredRevealProps {
  children: ReactNode[]
  className?: string
  /** Time between each child reveal (ms) */
  stagger?: number
  /** Initial Y offset */
  y?: number
  /** Animation duration per child */
  duration?: number
  /** Root margin */
  rootMargin?: string
  style?: CSSProperties
}

/**
 * StaggeredReveal — Reveals children one after another
 *
 * Adapted from scroll-craft's data-sc-stagger behavior
 * Each child gets a progressive delay
 *
 * @example
 * ```tsx
 * <StaggeredReveal stagger={80}>
 *   {items.map(item => <Card key={item.id} {...item} />)}
 * </StaggeredReveal>
 * ```
 */
export function StaggeredReveal({
  children,
  className,
  stagger = 60,
  y = 20,
  duration = 0.55,
  rootMargin = "-8% 0px",
  style,
}: StaggeredRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [isInView, setIsInView] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    const element = ref.current
    if (!element) return

    if (prefersReducedMotion) {
      setIsInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.05, rootMargin }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [rootMargin, prefersReducedMotion])

  return (
    <div ref={ref} className={className} style={style}>
      {children.map((child, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : y }}
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          transition={{
            duration: prefersReducedMotion ? 0.2 : duration,
            delay: prefersReducedMotion ? 0 : (i * stagger) / 1000,
            ease: [0.23, 1, 0.32, 1],
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  )
}
