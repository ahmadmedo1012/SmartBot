"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* Smart-Menu literal structure (final-launch plan v3 §2.4 port): the CSS-class
 * .section-container/.section-inner pair under-spec'd the rhythm — missing
 * base+lg padding tiers (py-16/24/28 vs 48/64px), scroll-mt-20 anchor offset,
 * tone="alt" sunken band, and the background transition. Tailwind utilities
 * are now the single source, same as menu.smart-link.ly. */
export interface SectionContainerProps extends React.HTMLAttributes<HTMLElement> {
  /** Visual separation tone: "default" (flat background) or "alt" (subtle raised band) */
  tone?: "default" | "alt"
}

const SectionContainer = React.forwardRef<HTMLElement, SectionContainerProps>(
  ({ className, children, tone = "default", ...props }, ref) => (
    <section
      ref={ref}
      className={cn(
        "relative scroll-mt-20 py-16 sm:py-24 lg:py-28 overflow-hidden transition-[background-color,border-color] duration-300",
        tone === "alt" && "bg-[var(--surface-sunken)]/60 border-y border-border/40",
        className,
      )}
      {...props}
    >
      <div className="relative max-w-[1220px] mx-auto px-4 sm:px-6">{children}</div>
    </section>
  )
)
SectionContainer.displayName = "SectionContainer"

export { SectionContainer }
