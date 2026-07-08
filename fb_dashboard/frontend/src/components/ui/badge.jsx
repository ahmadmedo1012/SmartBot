import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/10 text-primary hover:bg-primary/15",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/15",
        outline:
          "bg-transparent text-foreground border-border",
        success:
          "border-transparent bg-success/10 text-[hsl(var(--success))] hover:bg-success/15",
        warning:
          "border-transparent bg-warning/10 text-[hsl(var(--warning))] hover:bg-warning/15",
        info:
          "border-transparent bg-info/10 text-[hsl(var(--info))] hover:bg-info/15",
        premium:
          "border-transparent bg-gradient-to-r from-primary/15 to-accent/15 text-foreground hover:from-primary/20 hover:to-accent/20",
        subtle:
          "border-transparent bg-transparent text-muted-foreground hover:text-foreground gap-1.5 px-1",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, children, ...props }) {
  const isSubtle = variant === "subtle"
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {isSubtle && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants }
