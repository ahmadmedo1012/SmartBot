"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { TriangleAlert } from "lucide-react"
import { isSentryEnabled } from "@/lib/sentry-config"

/**
 * Root-level global error boundary — the last-resort catch that replaces
 * the root layout, so it must render its own <html>/<body>.
 *
 * r131-F7 (A4 P2-8 + A7 P2): re-based on the ONE canonical .state family
 * (globals.css — surface + icon + retry) instead of the standalone
 * 96px-circle skin; the byline contrast defect is fixed too
 * (text-muted-foreground/50 → 2.43:1 light → full token 8.1:1).
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
        {/* The .state family rides the same globals.css bundle the app
            loads on this boundary (global-error keeps the root CSS chunk —
            every token class below already resolved before this change). */}
        <main className="state state-danger relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
          <div className="state-icon" aria-hidden="true">
            <TriangleAlert />
          </div>
          <h1 className="state-title">حدث خطأ غير متوقع</h1>
          <p className="state-desc">تعذر تحميل التطبيق. يرجى تحديث الصفحة.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" onClick={() => reset()}>
              إعادة المحاولة
            </Button>
            {/* v16-E3 (D1 C2): un-nested <a><Button> — outline lg visuals
                moved to a span, the anchor is the single tab stop. */}
            <a href="/">
              <span className="relative inline-flex shrink-0 items-center justify-center rounded-md border border-border/70 bg-transparent text-foreground hover:bg-foreground/5 hover:border-accent-foreground/40 hover:shadow-sm dark:hover:bg-foreground/10 dark:hover:border-accent-foreground/35 font-sans text-sm font-semibold whitespace-nowrap select-none isolate overflow-hidden transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-(--t-fast) ease-smooth h-11 min-h-11 min-w-11 gap-2.5 px-6 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>*]:relative">
                العودة للرئيسية
              </span>
            </a>
          </div>
          {/* r131-F7 (A7 P2 #1): full token (8.1:1 dark / 4.98:1 light on
              the ground) — was /50 (2.43:1 light, crash-screen byline). */}
          <p className="relative mt-16 text-xs text-muted-foreground select-none">SmartBot &mdash; smart-link.ly</p>
        </main>
      </body>
    </html>
  )
}
