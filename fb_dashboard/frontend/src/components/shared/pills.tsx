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
