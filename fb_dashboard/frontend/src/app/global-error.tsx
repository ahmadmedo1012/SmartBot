"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { isSentryEnabled } from "@/lib/sentry-config"

/**
 * Root-level global error boundary — Smart-Menu parity (route-level
 * error.tsx files exist everywhere; this is the last-resort catch that
 * replaces the root layout, so it must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Global error:", error)
    // v6 §C — last-resort boundary reports too (isSentryEnabled covers the
    // committed-default DSN case where the env var itself is unset; the
    // dynamic import keeps the default state zero-cost).
    if (isSentryEnabled(process.env.NEXT_PUBLIC_SENTRY_DSN)) {
      import("@sentry/nextjs").then(S => {
        S.captureException(error, { tags: { boundary: "global-error" } })
      }).catch(() => {})
    }
  }, [error])

  return (
    <html lang="ar" dir="rtl">
      <body className="bg-background text-foreground antialiased">
        <main className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden px-6">
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="size-24 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-8">
              <svg className="size-12 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold mb-4">حدث خطأ غير متوقع</h1>
            <p className="text-lg text-muted-foreground max-w-md mb-8 leading-relaxed">
              تعذر تحميل التطبيق. يرجى تحديث الصفحة.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" className="text-base px-8 h-12" onClick={() => reset()}>
                إعادة المحاولة
              </Button>
              {/* v16-E3 (D1 C2): un-nested <a><Button> — outline lg visuals
                  moved to a span, the anchor is the single tab stop. */}
              <a href="/">
                <span className="relative inline-flex shrink-0 items-center justify-center rounded-lg border border-border/70 bg-transparent text-foreground hover:bg-foreground/5 hover:border-accent-foreground/40 hover:shadow-sm dark:hover:bg-foreground/10 dark:hover:border-accent-foreground/35 font-sans font-bold whitespace-nowrap select-none isolate overflow-hidden transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 ease-smooth h-12 min-h-11 min-w-11 gap-2.5 px-8 text-base [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>*]:relative before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(105deg,transparent_30%,oklch(1_0_0_/_0.22)_50%,transparent_70%)] before:-translate-x-full before:transition-transform before:duration-700 before:ease-out hover:before:translate-x-full before:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-[radial-gradient(circle_at_50%_50%,oklch(1_0_0_/_0.16),transparent_45%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500">
                  العودة للرئيسية
                </span>
              </a>
            </div>
          </div>
          <p className="relative z-10 mt-16 text-xs text-muted-foreground/50 select-none">SmartBot &mdash; smart-link.ly</p>
        </main>
      </body>
    </html>
  )
}
