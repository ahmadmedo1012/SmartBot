"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AdminTelegramError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => { console.error(error?.message || "Telegram admin error") }, [error])

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden">
      {/* v13-D9-K4: error boundary replaces the page tree — skip-link target. */}
      <span id="page-content" className="sr-only" tabIndex={-1} />
      <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 via-background to-primary/5" />
      <div className="relative z-10 flex flex-col items-center text-center px-6 animate-fade-in">
        <div className="relative mb-8">
          <div className="size-24 rounded-full glass flex items-center justify-center mx-auto">
            <AlertTriangle className="size-12 text-destructive" />
          </div>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-4">حدث خطأ في إعدادات تليجرام</h1>
        <p className="text-lg text-muted-foreground max-w-md mb-8 leading-relaxed">يرجى المحاولة مرة أخرى</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button size="lg" className="text-base px-8 h-12" onClick={() => reset()}>
            إعادة المحاولة
          </Button>
          {/* v16-E3 (D1 C2): un-nested <a><Button> — outline lg visuals
              moved to a span, the anchor is the single tab stop. */}
          <a href="/admin">
            <span className="relative inline-flex shrink-0 items-center justify-center rounded-lg border border-border/70 bg-transparent text-foreground hover:bg-foreground/5 hover:border-accent-foreground/40 hover:shadow-sm dark:hover:bg-foreground/10 dark:hover:border-accent-foreground/35 font-sans font-bold whitespace-nowrap select-none isolate overflow-hidden transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 ease-smooth h-12 min-h-11 min-w-11 gap-2.5 px-8 text-base [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>*]:relative before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(105deg,transparent_30%,oklch(1_0_0_/_0.22)_50%,transparent_70%)] before:-translate-x-full before:transition-transform before:duration-700 before:ease-out hover:before:translate-x-full before:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-[radial-gradient(circle_at_50%_50%,oklch(1_0_0_/_0.16),transparent_45%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500">
              العودة للوحة التحكم
            </span>
          </a>
        </div>
      </div>
    </div>
  )
}
