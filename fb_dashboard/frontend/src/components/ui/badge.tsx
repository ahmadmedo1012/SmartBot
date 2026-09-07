import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/* Smart-Menu parity (world-class launch plan v3 §6.1): soft tinted chips
 * (15% washes + 25% borders) instead of solid fills, h-5 rounded-full (v8-D4 pill),
 * font-medium. Legacy variant names (success/warning/danger/info/orange)
 * kept working — mapped onto the Smart-Menu tinted idiom. */

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        /* legacy semantic names → Smart-Menu tinted style */
        success: "bg-success/15 text-success border-success/25",
        warning: "bg-warning/15 text-warning border-warning/25",
        danger: "bg-destructive/15 text-destructive border-destructive/25",
        info: "bg-info/15 text-info border-info/25",
        orange: "bg-accent-foreground/15 text-accent-foreground border-accent-foreground/25",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

/* v14-E5 (D2-L1): badgeVariants export removed — zero external importers
 * (verified by grep; buttonVariants got the same treatment in v10-W4). The
 * internal const stays — BadgeProps and Badge() consume it.
 * v15-E6 (D5-L7): dead VARIANTS removed — gold/saffron/gradient had zero
 * consumers in the app (grep-verified across src/e2e; live variants are
 * default/secondary/destructive/outline/ghost/link/success/warning/danger/
 * info/orange only). */
export { Badge }
