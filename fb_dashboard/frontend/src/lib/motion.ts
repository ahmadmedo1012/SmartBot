import { type Variants } from "framer-motion"

/* Smart-Menu parity (world-class launch plan v3 §6): identical spring values
 * to Smart-Menu's lib/motion — softer, weightier motion language.
 * (was: 350/25, 500/30, 180/22 — 1.5-3x stiffer than Smart-Menu)
 *
 * v10-W4: dead exports purged (23 of 26 — zero importers each, re-grepped).
 * Kept: springGentle (DashboardShell), fadeUp + stagger (dashboard/admin). */
export const springGentle = { type: "spring" as const, stiffness: 120, damping: 14, mass: 0.8 } // ~400ms — cross-screen

/* v8-C1 FIX: fadeUp/stagger were prop-shaped objects ({initial, animate}),
 * yet every dashboard/admin consumer used them as `variants={...}` with
 * initial="hidden" animate="visible" — framer resolved no matching labels, so
 * the designed entrance choreography on the two most important screens
 * NEVER played. Now real Variants. `custom={n}` finally works: n is the
 * position in the cascade (KpiCard indices 0-6, sections 7/9) → delay n*0.05s. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.05, ease: [0.165, 0.84, 0.44, 1] as const },
  }),
}
export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
}
