"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/* r131-F7 (A4 P1-1d + A11 SB-7): the shared SELECT primitive — the 5
 * hand-rolled native <select>s (reports ×2, tools, team ×2) each carried
 * their own focus ring + md:text-sm (14px desktop, iOS-zoom + sub-floor).
 * This component rides the canonical input recipe verbatim (ui/input.tsx
 * r130):
 *   · h-11 (44px) · text-base (16px floor at every breakpoint)
 *   · rounded-md r-md 10px · px-4 pe-10 (chevron slot)
 *   · focus = accent border + the single sanctioned 3px @ 22% halo
 *     (--state-input-focus-halo) — replaces the per-page ring-2/30 idiom
 *   · aria-invalid = destructive border + destructive ring (input twin)
 *   · appearance-none + the ChevronDown affordance (native arrows are
 *     unstyleable and render a different icon per OS)
 * NATIVE on purpose (vs a Radix/base-ui popover select): keyboard + mobile
 * OS picker semantics for free, zero portal/positioning surface, and the
 * consumer swap stays a 1-line change (same <select> API — options and
 * value/onChange pass straight through). Option popup chrome is
 * OS-controlled; the option bg is pinned to the popover token where the
 * platform honors it. */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          dir="auto"
          className={cn(
            /* r133 (A10): hover border state (madarek components.css:721 twin
               — inputs sat inert until focus). */
            "flex h-11 w-full min-w-0 appearance-none rounded-md border border-input bg-transparent px-4 py-3 pe-10 text-base shadow-xs transition-[color,background-color,border-color,box-shadow] duration-(--t-fast) outline-none hover:not-aria-invalid:border-foreground/25",
            "focus-visible:border-accent-foreground focus-visible:shadow-(--state-input-focus-halo)",
            "aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-2 aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:focus-visible:ring-destructive/40",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground/60 dark:bg-input/30 dark:disabled:bg-muted dark:disabled:text-muted-foreground/50",
            /* the dropdown list chrome is OS-controlled; pin the popup to
               the popover surface where the platform honors it (Windows/
               Chrome/Edge; Safari/iOS keep the native sheet). */
            "[&>option]:bg-popover [&>option]:text-popover-foreground",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }
