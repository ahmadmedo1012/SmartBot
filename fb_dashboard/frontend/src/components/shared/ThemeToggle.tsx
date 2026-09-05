"use client"

import { useTheme } from "next-themes"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"

/* Smart-Menu literal port (final-launch plan v3 §2.4): circular glass toggle
 * (size-11 rounded-full bg-card/80 backdrop-blur) with orange-muted hover,
 * spring whileHover scale+rotate / whileTap 0.92, AnimatePresence icon swap
 * (rotate ∓90 + scale .5), resolvedTheme (system-aware) and reduced-motion
 * support — replacing the flat size-10 rounded-lg variant. */
const springIcon = { type: "spring" as const, stiffness: 300, damping: 22, mass: 0.8 }
const instant = { duration: 0 }

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const t = prefersReducedMotion ? instant : springIcon

  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === "dark"

  if (!mounted) {
    return <div className={cn("size-11", className)} aria-hidden="true" />
  }

  return (
    <motion.button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      className={cn(
        "relative size-11 rounded-full",
        "bg-card/80 border border-border/60 backdrop-blur-sm shadow-sm",
        "hover:bg-orange-muted hover:border-orange/40 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/50",
        "cursor-pointer",
        "flex items-center justify-center",
        "overflow-hidden",
        className
      )}
      whileHover={{ scale: 1.08, rotate: isDark ? -15 : 15 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 350, damping: 22 }}
    >
      <div className="relative size-4">
        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.svg
              key="moon"
              viewBox="0 0 24 24"
              className="absolute inset-0 size-4 text-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
              transition={t}
            >
              <path
                d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
              />
            </motion.svg>
          ) : (
            <motion.svg
              key="sun"
              viewBox="0 0 24 24"
              className="absolute inset-0 size-4 text-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ opacity: 0, rotate: 90, scale: 0.5 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -90, scale: 0.5 }}
              transition={t}
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  )
}
