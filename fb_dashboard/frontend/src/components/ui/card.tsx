import * as React from "react"

import { cn } from "@/lib/utils"

/* Ported verbatim from Smart-Menu (world-class launch plan v3 §6.1):
 * rounded-xl radius, --card-spacing system (16px default / 12px sm),
 * elevation tiers (elevated/flat/outlined), interactive mode, spotlight
 * conic border, grid CardHeader with CardAction, muted CardFooter.
 * Replaces the old shadcn-style card (rounded-sm + fixed p-6). */

function Card({
  className,
  children,
  size = "default",
  variant = "default",
  elevation = "flat",
  interactive = false,
  spotlight = false,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm";
  variant?: "default" | "glass" | "gradient";
  elevation?: "elevated" | "flat" | "outlined";
  interactive?: boolean;
  /** Spotlight border: conic-gradient that illuminates on hover */
  spotlight?: boolean;
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      data-elevation={elevation}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={cn(
        "group/card relative flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground border border-border/40 shadow-sm [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        "transition-[transform,box-shadow,border-color,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.2,1)]",
        // Elevated is opt-in for cards that represent a clear interactive surface.
        "data-[elevation=elevated]:shadow-md data-[elevation=elevated]:hover:shadow-xl data-[elevation=elevated]:hover:shadow-accent-foreground/10 data-[elevation=elevated]:hover:-translate-y-1 data-[elevation=elevated]:hover:border-accent-foreground/35 data-[elevation=elevated]:focus-visible:ring-2 data-[elevation=elevated]:focus-visible:ring-accent-foreground/50 data-[elevation=elevated]:focus-visible:ring-offset-2",
        // Flat: no hover transform or shadow
        "data-[elevation=flat]:hover:shadow-none data-[elevation=flat]:hover:translate-y-0 data-[elevation=flat]:focus-visible:ring-2 data-[elevation=flat]:focus-visible:ring-accent-foreground/50",
        // Outlined: prominent border, no hover effects
        "data-[elevation=outlined]:border-2 data-[elevation=outlined]:border-foreground/10 data-[elevation=outlined]:hover:shadow-none data-[elevation=outlined]:hover:translate-y-0 data-[elevation=outlined]:focus-visible:ring-2 data-[elevation=outlined]:focus-visible:ring-accent-foreground/50",
        // Interactive: enhanced cursor and keyboard feedback
        interactive && "cursor-pointer hover:bg-card/80 hover:border-accent-foreground/30 hover:shadow-lg active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/50 focus-visible:ring-offset-2",
        variant === "glass" && "glass-card backdrop-blur-xl",
        variant === "gradient" && "bg-gradient-to-br from-accent-foreground/[0.06] via-card to-secondary/40",
        className
      )}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.currentTarget.click();
        }
      }}
      {...props}
    >
      {children}
      {/* Spotlight border overlay — conic-gradient that sweeps on hover */}
      {spotlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover/card:opacity-100"
          style={{
            background: "conic-gradient(from 0deg at 50% 50%, transparent 0deg, oklch(0.55 0.19 45 / 0.6) 30deg, transparent 50deg)",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            padding: "1px",
          }}
        />
      )}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t border-border/40 bg-muted/25 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
