"use client"

import { useRef, useState, useEffect, type ReactNode, type CSSProperties } from "react"

/* v6+ — framer-free + SSR-safe rewrite of the Smart-Menu scroll-craft port.
 *
 * Two defects fixed vs the framer version:
 * 1. SEO/LCP/a11y: the old version split text inside useEffect → SSR HTML
 *    carried an EMPTY container (verified live: /pricing rendered
 *    <h1><div data-kinetic="words"></div></h1>). String children are now
 *    split AT RENDER TIME so every unit ships in the HTML — the h1 paints
 *    at first paint, crawlers see the text, and no-JS visitors read it.
 * 2. Bundle: framer-motion (~190KB) left the public critical path with
 *    this conversion (CSS transitions + the same IO trigger).
 */

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
  style?: CSSProperties
}

function splitUnits(text: string, mode: KineticMode): string[] {
  if (mode === "chars") return Array.from(text)
  if (mode === "words") return text.split(/(\s+)/).filter(t => t.length > 0)
  return text.split("\n").filter(l => l.length > 0)
}

/**
 * KineticText — text that assembles word/line/char by unit
 *
 * Each unit rises from behind a mask with a staggered delay. The reveal is
 * a pure CSS transition (.kinetic-unit + .kinetic-in) triggered by the same
 * fire-once IntersectionObserver; prefers-reduced-motion shows text instantly.
 */
export function KineticText({
  children,
  className,
  mode = "lines",
  delay = 0,
  duration = 800,
  style,
}: KineticTextProps) {
  const ref = useRef<HTMLDivElement | null>(null)
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
          observer.disconnect()
        }
      },
      { threshold: 0.2 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // SSR-safe split: string children are split at render time (units ship in
  // the HTML). Non-string children render as-is inside the mask container.
  const units = typeof children === "string" ? splitUnits(children, mode) : null
  const staggerDelay = duration / Math.max(units?.length ?? 1, 1) * 0.62

  return (
    <div
      ref={ref}
      className={[className, isInView ? "kinetic-in" : ""].filter(Boolean).join(" ")}
      style={style}
      data-kinetic={mode}
      data-ssr-split={units ? "true" : undefined}
    >
      {units ? (
        units.map((text, index) => (
          <span
            key={index}
            className="inline-block overflow-hidden align-top"
            style={{
              // Line masks need room for descenders
              paddingBottom: mode === "lines" ? "0.14em" : undefined,
              marginBottom: mode === "lines" ? "-0.14em" : undefined,
            }}
          >
            <span
              className="kinetic-unit"
              style={{
                "--kt-dur": `${duration / 1000}s`,
                "--kt-delay": `${delay + index * staggerDelay}ms`,
              } as CSSProperties}
            >
              {text}
            </span>
          </span>
        ))
      ) : (
        <span
          className="kinetic-unit"
          style={{ "--kt-dur": `${duration / 1000}s`, "--kt-delay": `${delay}ms` } as CSSProperties}
        >
          {children}
        </span>
      )}
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
      <KineticText mode={mode} delay={props.delay} duration={props.duration}>
        {props.children}
      </KineticText>
    </Component>
  )
}
