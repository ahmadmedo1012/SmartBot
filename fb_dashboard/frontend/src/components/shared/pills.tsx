"use client"

import { cn } from "@/lib/utils"

/**
 * pillClasses — canonical Madarek `.pill` filter family (components.css
 * §530; SO r131 twin: components/dashboard/filter-pills.tsx): surface +
 * hairline pills, 12px/600, hover = border-strong + surface-2 + −1px lift,
 * `.on` = ink slab (light: ink + cream) / gold (dark: primary metal) +
 * the 4px accent/16% halo. One spelling for every filter/selector chip —
 * replaces the gold-gradient/outline-Button pills (A4 P2-5: admin:213,
 * admin/support:216, messages:785).
 */
export function pillClasses(on: boolean, className?: string) {
  return cn(
    /* r131 (SO F3 twin): no explicit ring — the ONE global
       :focus-visible outline contract (globals.css) already covers
       these; a ring here would be a double focus indicator. */
    "inline-flex items-center justify-center rounded-full border text-xs font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-(--t-fast) ease-smooth active:scale-[0.97] active:duration-(--t-micro)",
    on
      ? "border-transparent bg-foreground text-background shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent-solid)_16%,transparent)] dark:bg-primary dark:text-primary-foreground"
      : "border-border bg-card text-muted-foreground hover:-translate-y-px hover:border-foreground/25 hover:bg-muted hover:text-foreground",
    className
  )
}

/**
 * tagPillClasses — the TAG twin of the pill family (W7-G, A4 P2-6): the
 * toggle chips that assign/filter subscriber TAGS (audience dialog,
 * broadcast filter, messages). Same ONE grammar as pillClasses —
 * surface + hairline, −1px hover lift, `.on` ink slab + 4px halo — and
 * the same ONE focus law: NO private ring (each of the three sites it
 * replaced carried its own focus-visible:ring-2, the exact drift from
 * the global outline contract this retires). What tag chips uniquely
 * add on top: the 44px touch floor (min-h-11), px-3 + gap-1.5 for the
 * color-dot child, text-sm/medium for free-length Arabic tag names,
 * and WRAP (the base family's nowrap would break a 320px dialog row
 * the moment a tag name runs long).
 */
export function tagPillClasses(on: boolean, className?: string) {
  return pillClasses(
    on,
    cn("min-h-11 gap-1.5 px-3 text-sm font-medium whitespace-normal", className)
  )
}
