import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/* r131-F7b (A4 P2-3 + R131-W1 fleet ruling "status = solid pastel 11/600
 * tnum", finishing the F7/F8 badge item): the Smart-Menu washed idiom
 * (15% alpha ground + 25% border + base-token text) is RETIRED. Semantic
 * variants now ride the canonical solid pastel pair — OPAQUE --*-soft
 * family ground + the AA -ink text tier (dark: luminous ink on deep pastel;
 * light: -deep ink on pastel ground — the SO r130 / madarek .badge recipe,
 * W1-I §3.6). gold joins the copper pastel family. Base rung re-based on
 * the canonical badge type: 11px / 600 / tabular-nums (was 12px/500). */

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-(--t-fast) focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive-soft text-destructive-ink focus-visible:ring-destructive/20 [a]:hover:bg-destructive-soft/80",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        /* r131-F7b: SOLID PASTEL status pairs — opaque --*-soft family ground
         * + the AA -ink text tier, borderless (madarek .badge recipe).
         * gold = the copper family ground + --accent-ink (theme-flipped:
         * gold #E9B44C dark / copper-deep #5C3416 light — AA text in both). */
        success: "bg-success-soft text-success-ink",
        warning: "bg-warning-soft text-warning-ink",
        danger: "bg-destructive-soft text-destructive-ink",
        info: "bg-info-soft text-info-ink",
        gold: "bg-(--c-copper-bg) text-(--accent-ink)",
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
 * info/gold only). */
export { Badge }
