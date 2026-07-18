import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 select-none cursor-pointer active:scale-[0.97]",
  {
    variants: {
      variant: {
        orange: "bg-orange text-orange-foreground hover:brightness-110 shadow-lg shadow-orange/20 hover:shadow-xl hover:shadow-orange/25 border-0",
        outline: "border-border bg-transparent text-foreground hover:bg-foreground/5 hover:border-foreground/30",
        ghost: "bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/10 border-transparent",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
      },
      size: {
        sm: "h-8 gap-1.5 px-3.5 text-xs",
        default: "h-10 gap-2 px-5 text-sm",
        lg: "h-12 gap-2.5 px-7 text-sm sm:text-base",
        icon: "size-8",
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
