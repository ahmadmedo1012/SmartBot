import { type Variants } from "framer-motion"

/* springDefault: ~300ms settle — GSAP UI micro-interaction target (< 300ms) */
export const springDefault = { type: "spring" as const, stiffness: 350, damping: 25 }
/* springSnappy: ~240ms — for entrance transitions */
export const springSnappy = { type: "spring" as const, stiffness: 500, damping: 30 }
/* springGentle: ~400ms — reserved for cross-screen transitions only */
export const springGentle = { type: "spring" as const, stiffness: 180, damping: 22 }

/* Hover/frequent micro-interactions: needs fastest settle */
export const springHover = { type: "spring" as const, stiffness: 600, damping: 35 }

export const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 350, damping: 25 } },
} as const
export const stagger = { animate: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } } as const

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, y: -3, transition: { duration: 0.1 } },
}

export const fadeUpSpring = (delay = 0): Variants => ({
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { ...springDefault, delay } },
})

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
}
