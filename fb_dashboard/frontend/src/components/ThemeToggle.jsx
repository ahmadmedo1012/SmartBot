import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { useTheme } from "@/hooks/use-theme"

const springIcon = { type: "spring", stiffness: 300, damping: 22, mass: 0.8 }
const instant = { duration: 0 }

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const prefersReducedMotion = useReducedMotion()
  const t = prefersReducedMotion ? instant : springIcon
  const isDark = theme === "dark"

  return (
    <motion.button
      onClick={toggleTheme}
      whileHover={{ scale: 1.08, rotate: isDark ? -15 : 15 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 350, damping: 22 }}
      aria-label={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--fg)", overflow: "hidden",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in oklch, var(--accent) 15%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in oklch, var(--accent) 30%, transparent)" }}
      onMouseLeave={e => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.borderColor = "var(--border)" }}
    >
      <div style={{ position: "relative", width: 16, height: 16 }}>
        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.svg
              key="moon"
              viewBox="0 0 24 24"
              style={{ position: "absolute", inset: 0, width: 16, height: 16, color: "var(--fg)" }}
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
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </motion.svg>
          ) : (
            <motion.svg
              key="sun"
              viewBox="0 0 24 24"
              style={{ position: "absolute", inset: 0, width: 16, height: 16, color: "var(--fg)" }}
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
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </motion.svg>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  )
}
