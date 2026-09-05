"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* Ported from Smart-Menu (world-class launch plan v3 §6.1):
 * rounded-lg, field-sizing-content, orange focus border — replaces the raw
 * <textarea> elements scattered in dashboard pages. */

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      dir="auto"
      className={cn(
        "flex min-h-16 w-full rounded-lg border border-input bg-transparent px-4 py-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 field-sizing-content",
        className
      )}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
