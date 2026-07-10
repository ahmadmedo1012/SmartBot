"use client"

import * as React from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, error, ...props }, ref) => {
  return (
    <div className="relative">
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border bg-background/60 backdrop-blur-sm px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0 focus-visible:border-ring/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30",
          error
            ? "border-destructive/60 focus-visible:ring-destructive/30 focus-visible:border-destructive"
            : "border-input",
          className
        )}
        ref={ref}
        aria-invalid={error ? "true" : undefined}
        {...props} />
      {error && (
        <div className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3 rtl:ps-3 rtl:pe-0">
          <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
        </div>
      )}
      {error && typeof error === "string" && (
        <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
})
Input.displayName = "Input"

export { Input }
