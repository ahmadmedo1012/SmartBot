"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

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
              <a href="/">
                <Button variant="outline" size="lg" className="text-base px-8 h-12">
                  العودة للرئيسية
                </Button>
              </a>
            </div>
          </div>
          <p className="relative z-10 mt-16 text-xs text-muted-foreground/50 select-none">SmartBot &mdash; smart-link.ly</p>
        </main>
      </body>
    </html>
  )
}
