"use client"

/* v6 §D — client boundary: the landing page is now a React SERVER component
 * and renders <Button> in its hero; forwardRef is not allowed in RSC, so the
 * button island must be marked client-side (standard shadcn layout). */
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  /* r131-F7 (fleet ruling, R131-W1 "buttons 40/13/600/r10" — A4 P2-5 +
   * A9 P1-9): re-based on the SO r130 canonical ladder verbatim:
   *   default 40px (h-10) / 13px / 600 · sm 32px (h-8) / 12px ·
   *   lg 48px (h-12) / 14px · icon 40px · icon-sm 32px (NEW).
   * The old 48/40/56 ladder (+ the base min-h-11 that overrode every rung)
   * is retired — one rung chunkier than the whole fleet. Label weight 600,
   * radius r-md 10px, press = scale(0.97) @ 80ms micro (unchanged).
   * r134 (R134-W1-XC): lg 44px (h-11) → 48px (h-12) — the canon rung
   * (madarek components.css:474 `.btn.lg { block-size: 48px }`) Smart-Menu
   * already ships and Smart-Order aligned this round; the rung had drifted
   * precisely because nothing pinned it (r134 pin added in tests/parity.mjs).
   * Hover on filled CTAs = -2px lift + the NEUTRAL premium card shadow
   * (--shadow-card-h, r131 token) — was -1px + shadow-md.
   * Focus = the ONE global :focus-visible outline (globals.css 2px token
   * ring); the old double ring-2 + offset-2 indicator is retired (SO r130
   * W2-1 / A11 SB-6). Loading sets aria-busy.
   * DE-GLOW: no sheen pseudo-layers (SB ruling), no colored glow shadows. */
  "group/btn relative inline-flex shrink-0 items-center justify-center rounded-md border border-transparent font-sans text-[13px] font-semibold whitespace-nowrap cursor-pointer transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-(--duration-fast) ease-smooth outline-none select-none active:scale-[0.97] active:duration-(--t-micro) disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 isolate",
  {
    variants: {
      variant: {
        /* neutral-brand solid: gold slab on the مدارك night / copper on
         * cream, ink-dark label (--accent-fg values). r131: hover lifts the
         * canonical -2px with the premium hover shadow (Madarek §4.5). */
        gold:
          "bg-primary text-primary-foreground hover:bg-primary/95 hover:-translate-y-[2px] active:bg-primary/90 shadow-sm hover:shadow-(--shadow-card-h) border-0",
        /* Madarek accent-CTA metal: gold gradient #C9962F→#E9B44C (dark) /
         * copper→gold (light) with the AA-pinned espresso label.
         * r133 (A10): hover:brightness-110 dropped — the reference lifts +
         * neutral shadow, never a brightness filter. */
        flame:
          "bg-[linear-gradient(135deg,var(--c-ember),var(--c-saffron))] text-espresso hover:-translate-y-[2px] shadow-sm hover:shadow-(--shadow-card-h) border-0",
        outline:
          "border-border/70 bg-transparent text-foreground hover:bg-foreground/5 hover:border-accent-foreground/40 hover:shadow-sm dark:hover:bg-foreground/10 dark:hover:border-accent-foreground/35",
        ghost:
          "bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/10 border-transparent dark:hover:bg-foreground/15",
        /* destructive (r131-F7b A7 Cluster B): the soft destructive action
         * rides the SOLID pastel pair — opaque -soft ground + the AA -ink
         * text tier (was /10 wash + raw base, sub-AA in light). */
        destructive:
          "bg-destructive-soft text-destructive-ink hover:bg-destructive-soft/80 aria-invalid:border-destructive/40 aria-invalid:ring-destructive/20",
      },
      size: {
        sm: "h-8 gap-1.5 px-3 text-xs",
        default: "h-10 gap-2 px-5",
        lg: "h-12 gap-2.5 px-6 text-sm",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "gold", size: "default" },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        /* r131-F7 (A11 SB-6): the busy state is announced — spinner + label
         * kept rendering was invisible to screen readers before. */
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button } /* v10-W4: buttonVariants un-exported (internal only) */
