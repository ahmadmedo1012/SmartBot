import { motion } from "framer-motion"
import { useTheme } from "@/hooks/use-theme"

/* ponytail: skip useReducedMotion, skip AnimatePresence — single icon, simple opacity-only crossfade */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <motion.button
      onClick={toggleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 350, damping: 22, mass: 0.4 }}
      aria-label={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      style={{
        width: 32, height: 32, borderRadius: "50%",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--fg)", overflow: "hidden",
        willChange: "transform",
      }}
    >
      {isDark ? (
        <svg key="moon" viewBox="0 0 24 24" style={{ width: 16, height: 16, color: "var(--fg)" }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg key="sun" viewBox="0 0 24 24" style={{ width: 16, height: 16, color: "var(--fg)" }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      )}
    </motion.button>
  )
}
