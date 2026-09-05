"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react"

/* Smart-Menu parity (world-class launch plan v3 §6.1):
 * h-12 touch height, rounded-lg, dir=auto, focus ring glow + border-accent-foreground,
 * optional state icons (success/warning/error) — legacy label/hint/error API
 * preserved for existing call sites. */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  /** Visual state — trailing icon feedback (Smart-Menu) */
  state?: "error" | "success" | "warning"
  /** Icon rendered at the inline-start of the input */
  startIcon?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, hint, id, state, startIcon, ...props }, ref) => {
    const errorId = id ? `${id}-error` : undefined
    const hintId = id ? `${id}-hint` : undefined
    const effectiveState = state ?? (error ? "error" : undefined)
    const StateIcon =
      effectiveState === "success" ? CheckCircle2
      : effectiveState === "warning" ? AlertTriangle
      : effectiveState === "error" ? AlertCircle
      : null
    return (
      <div className="space-y-1">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="relative">
          {startIcon && (
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted-foreground" aria-hidden="true">
              {startIcon}
            </span>
          )}
          <input
            id={id}
            type={type}
            dir="auto"
            className={cn(
              "flex h-12 w-full min-w-0 rounded-lg border border-input bg-transparent px-4 py-3 text-base shadow-xs transition-[color,background-color,border-color,box-shadow] duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:shadow-[0_0_0_4px_oklch(0.55_0.19_45_/_0.12)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground/60 md:text-sm dark:bg-input/30 dark:disabled:bg-muted dark:disabled:text-muted-foreground/50",
              startIcon && "ps-11",
              StateIcon && "pe-11",
              effectiveState === "error" && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
              effectiveState === "success" && "border-success focus-visible:border-success focus-visible:ring-success/20",
              effectiveState === "warning" && "border-warning focus-visible:border-warning focus-visible:ring-warning/20",
              className
            )}
            ref={ref}
            aria-invalid={effectiveState === "error" || undefined}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            {...props}
          />
          {StateIcon && (
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 end-3 flex items-center",
                effectiveState === "error" && "text-destructive",
                effectiveState === "success" && "text-success",
                effectiveState === "warning" && "text-warning",
              )}
              aria-hidden="true"
            >
              <StateIcon className="size-5" />
            </span>
          )}
        </div>
        {hint && !error && (
          <p id={hintId} className="text-[11px] text-muted-foreground">
            {hint}
          </p>
        )}
        {error && <p id={errorId} className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
