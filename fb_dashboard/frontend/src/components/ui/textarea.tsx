"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* r131-F7 (A4 P1-1c — the missed wave): textarea now rides the SAME
 * canonical input recipe ui/input.tsx got in r130 (SO W2-1 fix 4 twin):
 *   · 44px family height: min-h-24 (96px, was min-h-16 64px) with
 *     padding-block 12px — the multiline control floors at the family
 *     field anatomy instead of a squat half-height slab.
 *   · radius r-md 10px (rounded-md — was rounded-lg 12px, one rung over
 *     the input grammar).
 *   · 16px font floor at EVERY breakpoint (was md:text-sm 14px — the
 *     iOS-zoom + sub-floor defect class r130 killed on input).
 *   · focus = accent border + the single sanctioned 3px @ 22% halo
 *     (--state-input-focus-halo — was a hand-rolled ring-2 ring-ring/40).
 *   · error states mirror input: aria-invalid rides the destructive
 *     border + destructive halo ring (no separate spelling).
 *   · logical padding only; dir=auto kept. */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      dir="auto"
      className={cn(
        /* r133 (A10): hover border state (madarek components.css:721 twin
           — inputs sat inert until focus). */
        "flex field-sizing-content min-h-24 w-full rounded-md border border-input bg-transparent px-4 py-3 text-base leading-(--lh-base) shadow-xs transition-[color,background-color,border-color,box-shadow] duration-(--t-fast) outline-none placeholder:text-placeholder-text hover:not-aria-invalid:border-foreground/25 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground/60 dark:bg-input/30 dark:disabled:bg-muted dark:disabled:text-muted-foreground/50",
        "focus-visible:border-accent-foreground focus-visible:shadow-(--state-input-focus-halo)",
        "aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-2 aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:focus-visible:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
