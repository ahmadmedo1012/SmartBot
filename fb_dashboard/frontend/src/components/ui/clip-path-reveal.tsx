"use client"

import { useRef, useState, useEffect, type ReactNode, type CSSProperties } from "react"
import { motion, useReducedMotion } from "framer-motion"

/* Ported from Smart-Menu's scroll-craft integration (smart-link.ly shared
   identity) — import path adapted for SmartBot's framer-motion setup. */

type RevealDirection = "up" | "down" | "left" | "right" | "iris"

interface ClipPathRevealProps {
  children: ReactNode
  className?: string
  /** Direction of the wipe reveal */
  direction?: RevealDirection
  /** Start progress (0-1) */
  from?: number
  /** Animation duration (ms) */
  duration?: number
  /** Delay before animation starts (ms) */
  delay?: number
  style?: CSSProperties
}

/**
 * ClipPathReveal — clip-path wipe reveal animation
 *
 * Adapted from scroll-craft's data-sc-reveal device
 * Uses clip-path to create wipe effects (up, down, left, right, iris)
 *
 * clip-path is relative to the border box, not the ink
 * For type with tight line-height, add padding to prevent clipping
 *
 * @example
 * ```tsx
 * <ClipPathReveal direction="up">
 *   <img src="hero.webp" alt="" />
 * </ClipPathReveal>
 * ```
 */
export function ClipPathReveal({
  children,
  className,
  direction = "up",
  from = 0,
  duration = 700,
  delay = 0,
  style,
}: ClipPathRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [progress, setProgress] = useState(from)
  const [isInView, setIsInView] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    const element = ref.current
    if (!element) return

    if (prefersReducedMotion) {
      setProgress(1)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: from }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [from, prefersReducedMotion])

  // Animate to full reveal once in view
  useEffect(() => {
    if (!isInView || prefersReducedMotion) return

    const timeout = setTimeout(() => {
      setProgress(1)
    }, delay)

    return () => clearTimeout(timeout)
  }, [isInView, delay, prefersReducedMotion])

  // Generate clip-path based on direction and progress
  const getClipPath = (p: number) => {
    const pct = (1 - p) * 100

    switch (direction) {
      case "up":
        return `inset(${pct}% 0 0 0)`
      case "down":
        return `inset(0 0 ${pct}% 0)`
      case "left":
        // RTL-aware: left in LTR, right in RTL
        return `inset(0 ${pct}% 0 0)`
      case "right":
        return `inset(0 0 0 ${pct}%)`
      case "iris":
        return `circle(${p * 78}% at 50% 50%)`
      default:
        return `inset(0 0 ${pct}% 0)`
    }
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={{ clipPath: getClipPath(from) }}
      animate={{ clipPath: getClipPath(progress) }}
      transition={{
        duration: duration / 1000,
        ease: [0.23, 1, 0.32, 1],
      }}
    >
      {children}
    </motion.div>
  )
}

// Wrapper for images with reveal animation
interface RevealImageProps extends Omit<ClipPathRevealProps, "children"> {
  src: string
  alt: string
  sizes?: string
  priority?: boolean
  className?: string
}

/**
 * RevealImage — Image with clip-path reveal animation
 *
 * @example
 * ```tsx
 * <RevealImage
 *   src="/hero.webp"
 *   alt="Product hero"
 *   direction="up"
 * />
 * ```
 */
export function RevealImage({
  src,
  alt,
  sizes,
  priority = false,
  direction = "up",
  ...props
}: RevealImageProps) {
  const [loaded, setLoaded] = useState(false)

  return (
    <ClipPathReveal direction={direction} {...props}>
      <img
        src={src}
        alt={alt}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        onLoad={() => setLoaded(true)}
        className={`${props.className ?? ""} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </ClipPathReveal>
  )
}
