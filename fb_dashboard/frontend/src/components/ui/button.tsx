import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/btn relative inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent font-sans text-sm font-bold whitespace-nowrap cursor-pointer transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.2,1)] outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 min-h-11 min-w-11 isolate overflow-hidden before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(105deg,transparent_30%,oklch(1_0_0_/_0.22)_50%,transparent_70%)] before:-translate-x-full before:transition-transform before:duration-700 before:ease-out hover:before:translate-x-full before:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-[radial-gradient(circle_at_50%_50%,oklch(1_0_0_/_0.16),transparent_45%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500 [&>*]:relative",
  {
    variants: {
      variant: {
        orange:
          "bg-orange text-orange-foreground hover:bg-orange/95 shadow-md shadow-orange/25 hover:shadow-xl hover:shadow-orange/40 border-0 dark:shadow-orange/35 dark:hover:shadow-orange/50",
        flame:
          "bg-[linear-gradient(135deg,var(--c-ember),var(--c-saffron))] text-espresso hover:brightness-110 shadow-md shadow-orange/30 hover:shadow-2xl hover:shadow-orange/45 border-0 dark:hover:brightness-110",
        outline:
          "border-border/70 bg-transparent text-foreground hover:bg-foreground/5 hover:border-orange/40 hover:shadow-sm dark:hover:bg-foreground/10 dark:hover:border-orange/35",
        ghost:
          "bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/10 border-transparent dark:hover:bg-foreground/15",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/15 dark:hover:bg-destructive/25",
      },
      size: {
        sm: "h-10 gap-1.5 px-3.5 text-xs",
        default: "h-12 gap-2 px-5 text-sm",
        lg: "h-14 gap-2.5 px-7 text-sm sm:text-base",
        icon: "size-12",
      },
    },
    defaultVariants: { variant: "orange", size: "default" },
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
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} {...props}>
        {loading && <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
