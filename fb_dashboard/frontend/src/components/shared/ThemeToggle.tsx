"use client"

import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"

/* v6+ — framer-free rewrite of the Smart-Menu theme toggle port.
 * v6 kept `import { motion } from "framer-motion"` here, and ThemeToggle is
 * imported by Header (hence EVERY public page) AND login directly — that
 * single line shipped the ~190KB motion bundle to every visitor. The visual
 * language is preserved with CSS twins: hover scale+rotate on the button,
 * crossfading rotate icon swap, reduced-motion respected by globals.css.
 * v13: framer-motion dependency fully removed app-wide — CSS twins final. */

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === "dark"

  if (!mounted) {
    return <div className={cn("size-11", className)} aria-hidden="true" />
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      className={cn(
        "relative size-11 rounded-full",
        "bg-card/80 border border-border/60 backdrop-blur-sm shadow-sm",
        "hover:bg-accent hover:border-accent-foreground/40 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/50",
        "cursor-pointer",
        "flex items-center justify-center",
        "overflow-hidden",
        "transition-transform duration-200 ease-out",
        "hover:scale-[1.08] hover:rotate-[15deg] active:scale-[0.92]",
        className
      )}
    >
      <div className="relative size-4">
        <span className={cn("tt-icon absolute inset-0 size-4 text-foreground", isDark ? "tt-icon-hidden" : "tt-icon-active")}>
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        </span>
        <span className={cn("tt-icon absolute inset-0 size-4 text-foreground", isDark ? "tt-icon-active" : "tt-icon-hidden")}>
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </span>
      </div>
    </button>
  )
}
