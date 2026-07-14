import { type Variants } from "framer-motion"

export const springDefault = { type: "spring" as const, stiffness: 200, damping: 20 }
export const springSnappy = { type: "spring" as const, stiffness: 300, damping: 20 }
export const springGentle = { type: "spring" as const, stiffness: 150, damping: 24 }

export const fadeUp = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } } } as const
export const stagger = { animate: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } } as const

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: springSnappy },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
}

export const fadeUpSpring = (delay = 0): Variants => ({
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { ...springDefault, delay } },
})

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
}
