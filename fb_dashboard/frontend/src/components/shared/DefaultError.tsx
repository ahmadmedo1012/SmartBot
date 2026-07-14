"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useEffect } from "react"

export function DefaultError({ error, reset, className }: { error: Error & { digest?: string }; reset?: () => void; className?: string }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className={cn("flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4", className)}>
      <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <svg className="size-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold">حدث خطأ غير متوقع</h2>
      <p className="text-sm text-muted-foreground max-w-md">{error?.message || "يرجى المحاولة مرة أخرى"}</p>
      {reset && <Button onClick={reset} variant="outline">إعادة المحاولة</Button>}
    </div>
  )
}
