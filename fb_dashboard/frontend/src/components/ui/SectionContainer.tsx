"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const SectionContainer = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, children, ...props }, ref) => (
    <section ref={ref} className={cn("section-container", className)} {...props}>
      <div className="section-inner">{children}</div>
    </section>
  )
)
SectionContainer.displayName = "SectionContainer"

export { SectionContainer }
