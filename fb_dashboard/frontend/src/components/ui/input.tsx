"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react"

/* Smart-Menu parity (world-class launch plan v3 §6.1):
 * h-12 touch height, rounded-lg, dir=auto, focus ring glow + border-orange,
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
              "flex h-12 w-full rounded-lg border border-input bg-transparent px-4 py-2 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:shadow-[0_0_0_4px_oklch(0.55_0.19_45_/_0.12)] disabled:cursor-not-allowed disabled:opacity-50",
              startIcon && "ps-11",
              StateIcon && "pe-11",
              effectiveState === "error" && "border-destructive focus-visible:border-destructive",
              effectiveState === "success" && "border-success/60",
              effectiveState === "warning" && "border-warning/60",
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
