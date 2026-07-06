import { createContext, useContext, useEffect, useState, useCallback } from "react"

const ThemeContext = createContext({ theme: "dark", setTheme: () => {}, systemTheme: "dark" })

export function ThemeProvider({ children, defaultTheme = "dark", storageKey = "smartbot-theme" }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem(storageKey) || defaultTheme)
  const [systemTheme, setSystemTheme] = useState("dark")

  // Detect system preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)")
    setSystemTheme(mq.matches ? "light" : "dark")
    const handler = (e) => setSystemTheme(e.matches ? "light" : "dark")
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const setTheme = useCallback((t) => {
    setThemeState(t)
    localStorage.setItem(storageKey, t)
  }, [storageKey])

  const resolvedTheme = theme === "system" ? systemTheme : theme

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light", "dark", "system")
    root.classList.add(theme)
    root.style.colorScheme = theme === "system" ? systemTheme : theme
    localStorage.setItem(storageKey, theme)
  }, [theme, resolvedTheme, storageKey])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, systemTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
