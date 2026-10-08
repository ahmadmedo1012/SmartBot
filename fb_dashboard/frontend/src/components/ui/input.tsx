"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react"

/* Smart-Menu parity (world-class launch plan v3 §6.1):
 * h-12 touch height, rounded-lg, dir=auto, focus ring glow + border-accent-foreground,
 * optional state icons (success/warning/error) — legacy label/hint/error API
 * preserved for existing call sites.
 * v14-E5: placeholder moved to the dedicated --placeholder-text token
 * (AA 4.5:1 measured in both modes — see globals.css).
 * r130 (W1-E D-13): the focus halo = the single sanctioned
 * --state-input-focus-halo token (3px @ 22% of the solid accent) — was a
 * hand-spelled 4px @ 12% ring-mix off the canonical recipe. */

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
              "flex h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-4 py-3 text-base shadow-xs transition-[color,background-color,border-color,box-shadow] duration-(--t-fast) file:border-0 file:bg-transparent file:text-base file:font-medium placeholder:text-placeholder-text focus-visible:outline-none focus-visible:border-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:shadow-(--state-input-focus-halo) disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground/60 dark:bg-input/30 dark:disabled:bg-muted dark:disabled:text-muted-foreground/50",
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
                /* r131-F7b (A7 Cluster B): status-as-glyph rides the AA -ink
                 * tier in both themes (light pastel -deep — was the raw base
                 * token, 2.2-3.0:1 on the field surface in light). */
                effectiveState === "error" && "text-destructive-ink",
                effectiveState === "success" && "text-success-ink",
                effectiveState === "warning" && "text-warning-ink",
              )}
              aria-hidden="true"
            >
              <StateIcon className="size-5" />
            </span>
          )}
        </div>
        {hint && !error && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {/* r131-F7b (A7 Cluster B): error text rides the AA -ink tier (light
         * rose-deep #6B2128 — 8.8:1; was the raw base 2.9:1 in light). */}
        {error && <p id={errorId} className="text-xs text-destructive-ink">{error}</p>}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
