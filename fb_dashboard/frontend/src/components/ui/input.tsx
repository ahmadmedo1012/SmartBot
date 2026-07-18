"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, id, ...props }, ref) => {
    const errorId = id ? `${id}-error` : undefined
    return (
      <div className="space-y-1">
        {label && <Label htmlFor={id}>{label}</Label>}
        <input
          id={id}
          type={type}
          className={cn(
            "flex h-10 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive",
            className
          )}
          ref={ref}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
        {error && <p id={errorId} className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
