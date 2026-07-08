import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl bg-card/25 backdrop-blur-2xl border border-border/10 shadow-glass transition-all duration-200",
      className
    )}
    {...props} />
))
Card.displayName = "Card"

const CardInteractive = React.forwardRef(({ className, ...props }, ref) => (
  <Card
    ref={ref}
    className={cn(
      "cursor-pointer hover:scale-[1.01] hover:shadow-card-hover hover:border-ring/10",
      className
    )}
    {...props} />
))
CardInteractive.displayName = "CardInteractive"

const CardBordered = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-border/40 bg-card/25 backdrop-blur-2xl transition-all duration-200",
      className
    )}
    {...props} />
))
CardBordered.displayName = "CardBordered"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1 p-4 sm:p-5 pb-2", className)}
    {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-heading text-lg font-semibold leading-tight tracking-tight", className)}
    {...props} />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground/80", className)}
    {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 sm:p-5 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-4 sm:p-5 pt-0 gap-2", className)}
    {...props} />
))
CardFooter.displayName = "CardFooter"

export {
  Card,
  CardInteractive,
  CardBordered,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
