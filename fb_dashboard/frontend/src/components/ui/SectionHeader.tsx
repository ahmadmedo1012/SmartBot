"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Eyebrow } from "./Eyebrow"

/* v6+ — framer-free rewrite of the Smart-Menu SectionHeader port.
 * The staggered whileInView reveal is now CSS (.reveal + delay vars in
 * globals.css) with the same IntersectionObserver trigger pattern —
 * framer-motion leaves the landing/pricing critical path. */

interface SectionHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  className?: string
  align?: "center" | "start"
}

export function SectionHeader({ eyebrow, title, subtitle, description, icon, className, align = "center" }: SectionHeaderProps) {
  const desc = subtitle || description
  const centered = align === "center"
  return (
    <SectionHeaderReveal className={cn("mb-14 sm:mb-20", centered ? "text-center" : "mx-auto text-center", className)}>
      {eyebrow && (
        <div className="reveal" style={{ "--rv-y": "8px", "--rv-dur": "0.45s", "--rv-delay": "0ms" } as React.CSSProperties}>
          <Eyebrow className={centered ? "justify-center" : "justify-start"}>
            {icon}{icon && " "}{eyebrow}
          </Eyebrow>
        </div>
      )}
      {title && (
        <div className="reveal" style={{ "--rv-y": "16px", "--rv-dur": "0.5s", "--rv-delay": "80ms" } as React.CSSProperties}>
          <h2
            className={cn(
              "text-3xl sm:text-4xl lg:text-[3.25rem] font-semibold leading-[1.25] tracking-tight text-balance",
              centered ? "mx-auto" : "max-w-2xl",
            )}
          >
            {title}
          </h2>
        </div>
      )}
      {desc && (
        <div className="reveal" style={{ "--rv-y": "8px", "--rv-dur": "0.45s", "--rv-delay": "160ms" } as React.CSSProperties}>
          <p
            className={cn(
              "text-base text-muted-foreground/90 mt-4 max-w-[48ch] leading-relaxed",
              centered ? "mx-auto" : "",
            )}
          >
            {desc}
          </p>
        </div>
      )}
    </SectionHeaderReveal>
  )
}

/* Single fire-once IO trigger for the header block: adds .reveal-shown to
 * itself and every .reveal child carries its own delay var. */
function SectionHeaderReveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const [shown, setShown] = React.useState(false)
  const ref = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: "-40px 0px -40px 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={cn(shown && "reveal-shown", className)}>
      {children}
    </div>
  )
}
