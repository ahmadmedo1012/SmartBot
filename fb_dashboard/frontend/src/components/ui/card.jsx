import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl bg-card/55 backdrop-blur-2xl border border-border/10 shadow-sm transition-all duration-200",
      className
    )}
    {...props} />
))
Card.displayName = "Card"

const CardInteractive = React.forwardRef(({ className, ...props }, ref) => (
  <Card
    ref={ref}
    className={cn(
      "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-accent/15",
      className
    )}
    {...props} />
))
CardInteractive.displayName = "CardInteractive"

const CardHighlight = React.forwardRef(({ className, color = "accent", ...props }, ref) => (
  <CardInteractive
    ref={ref}
    className={cn(
      "relative overflow-hidden",
      className
    )}
    {...props}
    data-accent={color} />
))
CardHighlight.displayName = "CardHighlight"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1 p-5 pb-2", className)}
    {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-[15px] font-semibold leading-tight tracking-tight", className)}
    {...props} />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xs text-muted-foreground/80", className)}
    {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-2", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-5 pt-0 gap-2", className)}
    {...props} />
))
CardFooter.displayName = "CardFooter"

export {
  Card, CardInteractive, CardHighlight,
  CardHeader, CardFooter, CardTitle, CardDescription, CardContent,
}
