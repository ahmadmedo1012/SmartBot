"use client"

import { useRef, useState, useEffect, type ReactNode, type CSSProperties } from "react"
import { motion, useReducedMotion } from "framer-motion"

/* Ported from Smart-Menu's scroll-craft integration (smart-link.ly shared
   identity) — import path adapted for SmartBot's framer-motion setup. */

type KineticMode = "lines" | "words" | "chars"

interface KineticTextProps {
  children: ReactNode
  className?: string
  /** Split mode: lines, words, or chars */
  mode?: KineticMode
  /** Animation delay before start (ms) */
  delay?: number
  /** Time to complete full reveal (ms) */
  duration?: number
  /** Easing function */
  ease?: string | number[]
  style?: CSSProperties
}

/**
 * KineticText — Type that assembles character/word/line by line
 *
 * Adapted from scroll-craft's data-sc-kinetic device
 * Splits text into units and staggers their reveal
 * Each unit slides up from behind a mask, entering from a clean edge
 *
 * @example
 * ```tsx
 * <KineticText mode="lines">إدارة تفاعل فيسبوك بذكاء</KineticText>
 * ```
 */
export function KineticText({
  children,
  className,
  mode = "lines",
  delay = 0,
  duration = 800,
  ease = [0.23, 1, 0.32, 1],
  style,
}: KineticTextProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [units, setUnits] = useState<{ text: string; index: number }[]>([])
  const [isInView, setIsInView] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  // Parse text content for splitting
  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Get text content
    const text = typeof children === "string" ? children : element.textContent || ""

    // Split based on mode
    let parsed: string[] = []
    if (mode === "chars") {
      parsed = Array.from(text)
    } else if (mode === "words") {
      parsed = text.split(/(\s+)/).filter(t => t.length > 0)
    } else {
      // lines — preserve words and measure positions
      parsed = text.split("\n").filter(l => l.length > 0)
    }

    // Create units
    const parsedUnits = parsed.map((text, index) => ({ text, index }))
    setUnits(parsedUnits)
  }, [children, mode])

  // Intersection observer for triggering animation
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
      { threshold: 0.2 }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [prefersReducedMotion])

  const staggerDelay = duration / 1000 / Math.max(units.length, 1) * 0.62 // 0.62 spread leaves tail for last unit

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      data-kinetic={mode}
    >
      {units.map(({ text, index }) => (
        <span
          key={index}
          className="inline-block overflow-hidden align-top"
          style={{
            // Line masks need room for descenders
            paddingBottom: mode === "lines" ? "0.14em" : undefined,
            marginBottom: mode === "lines" ? "-0.14em" : undefined,
          }}
        >
          <motion.span
            className="inline-block"
            initial={{
              opacity: prefersReducedMotion ? 1 : 0,
              y: prefersReducedMotion ? 0 : 100,
            }}
            animate={isInView ? { opacity: 1, y: 0 } : undefined}
            transition={{
              duration: prefersReducedMotion ? 0 : duration / 1000,
              delay: prefersReducedMotion ? 0 : (delay + index * staggerDelay * 1000) / 1000,
              ease: ease as any,
            }}
          >
            {text}
          </motion.span>
        </span>
      ))}
    </div>
  )
}

// Wrapper component for headings with kinetic animation
interface KineticHeadingProps extends Omit<KineticTextProps, "children"> {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  children: ReactNode
}

export function KineticHeading({
  as: Component = "h2",
  mode = "lines",
  ...props
}: KineticHeadingProps) {
  return (
    <Component className={props.className} style={props.style}>
      <KineticText mode={mode} delay={props.delay} duration={props.duration} ease={props.ease}>
        {props.children}
      </KineticText>
    </Component>
  )
}
