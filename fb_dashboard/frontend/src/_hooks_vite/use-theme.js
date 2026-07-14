import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "smartbot-theme"

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark") return stored
  } catch (_) {}
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) return "light"
  return "dark"
}

export function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light")
    document.documentElement.classList.toggle("dark", theme === "dark")
    try { localStorage.setItem(STORAGE_KEY, theme) } catch (_) {}
  }, [theme])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === "dark" ? "light" : "dark"))
  }, [])

  return { theme, toggleTheme, isDark: theme === "dark", isLight: theme === "light" }
}
