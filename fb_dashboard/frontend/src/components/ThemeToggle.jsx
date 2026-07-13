import { motion, AnimatePresence } from "framer-motion"
import { Sun, Moon } from "lucide-react"
import { useTheme } from "@/hooks/use-theme"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <motion.button
      onClick={toggleTheme}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      aria-label={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      style={{
        width: 34, height: 34, borderRadius: "50%",
        background: "color-mix(in oklch, var(--border) 40%, transparent)",
        border: "1px solid var(--border)",
        cursor: "pointer", display: "grid", placeItems: "center",
        color: "var(--fg)", position: "relative",
        transition: "background .15s, border-color .15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-soft)" }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "color-mix(in oklch, var(--border) 40%, transparent)" }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? "moon" : "sun"}
          initial={{ opacity: 0, rotate: -90, scale: 0 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          style={{ display: "grid", placeItems: "center" }}
        >
          {isDark ? <Moon size={16} strokeWidth={1.8} /> : <Sun size={16} strokeWidth={1.8} />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}
