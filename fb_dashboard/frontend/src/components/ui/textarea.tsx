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
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-base shadow-xs transition-[color,background-color,border-color,box-shadow] duration-200 outline-none placeholder:text-muted-foreground/70 focus-visible:border-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
