import { type Variants } from "framer-motion"

/* Smart-Menu parity (world-class launch plan v3 §6): identical spring values
 * to Smart-Menu's lib/motion — softer, weightier motion language.
 * (was: 350/25, 500/30, 180/22 — 1.5-3x stiffer than Smart-Menu) */
export const springGentle = { type: "spring" as const, stiffness: 120, damping: 14, mass: 0.8 } // ~400ms — cross-screen
export const springDefault = { type: "spring" as const, stiffness: 200, damping: 20, mass: 0.8 } // ~300ms settle
export const springSnappy = { type: "spring" as const, stiffness: 300, damping: 24, mass: 0.7 } // ~240ms — entrances
export const springFloaty = { type: "spring" as const, stiffness: 60, damping: 10, mass: 1.2 }
export const springMagnetic = { type: "spring" as const, stiffness: 400, damping: 10, mass: 0.5 }
export const springBouncy = { type: "spring" as const, stiffness: 500, damping: 8, mass: 0.6 }

/* Hover/frequent micro-interactions: fastest settle */
export const springHover = { type: "spring" as const, stiffness: 600, damping: 35 }

export const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.165, 0.84, 0.44, 1] as const } },
} as const
export const stagger = { animate: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } } as const

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, y: -3, transition: { duration: 0.1 } },
}

export const fadeUpSpring = (delay = 0): Variants => ({
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { ...springGentle, delay } },
})

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
}

/* v4 plan §4.2 — Smart-Menu's full motion vocabulary, ported verbatim so both
 * projects share one motion language (values are byte-identical to
 * Smart-Menu's lib/motion.ts; SmartBot components migrate to them gradually). */
export const easeOutQuart = { duration: 0.5, ease: [0.165, 0.84, 0.44, 1] as const }
export const easeSmooth = { duration: 0.35, ease: [0.16, 1, 0.2, 1] as const }
export const staggerFast: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }
export const staggerMedium: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }
export const scaleFade: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: springDefault },
}
export const tiltIn: Variants = {
  hidden: { opacity: 0, rotateX: -10, y: 30, scale: 0.95 },
  visible: { opacity: 1, rotateX: 0, y: 0, scale: 1, transition: { type: "spring", stiffness: 200, damping: 20 } },
}
export const slideLeft: Variants = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0, transition: easeOutQuart },
}
export const slideUpScale: Variants = {
  hidden: { opacity: 0, y: 60, scale: 0.9 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 150, damping: 16 } },
}
export const cardHover = { scale: 1.03, y: -8, transition: { type: "spring" as const, stiffness: 300, damping: 18 } }
export const cardTap = { scale: 0.97, transition: { type: "spring" as const, stiffness: 400 } }
export const btnTap = { scale: 0.92, transition: { type: "spring" as const, stiffness: 500 } }
export const floatSlow: Variants = {
  rest: { y: 0 },
  float: { y: [-6, 6, -6], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } },
}
export const shimmerVariants: Variants = {
  hidden: { x: "-100%" },
  visible: { x: "200%", transition: { duration: 2, repeat: Infinity, ease: "linear" } },
}
export const badgePop: Variants = {
  hidden: { scale: 0 },
  visible: { scale: 1, transition: { type: "spring", stiffness: 600, damping: 10 } },
}
