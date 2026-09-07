"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { isSentryEnabled } from "@/lib/sentry-config"
import { useEffect } from "react"

export function DefaultError({ error, reset, className }: { error: Error & { digest?: string }; reset?: () => void; className?: string }) {
  useEffect(() => {
    console.error(error)
    // v6 §C — report to Sentry/GlitchTip when client tracking is active
    // (env override OR committed default — see lib/sentry-config.ts);
    // dynamic import = zero cost otherwise.
    if (isSentryEnabled(process.env.NEXT_PUBLIC_SENTRY_DSN)) {
      import("@sentry/nextjs").then(S => {
        S.captureException(error, {
          tags: { boundary: "route-error", digest: error.digest ?? "" },
        })
      }).catch(() => {})
    }
  }, [error])

  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4", className)}>
      <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <svg className="size-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      {/* v13-D9-K4: error boundaries replace the page tree — the layout's
          skip link needs its #page-content target on these screens too. */}
      <span id="page-content" className="sr-only" tabIndex={-1} />
      {/* v8-B19: route error boundaries replace the whole page tree, so this
          heading IS the page's h1 (was h2 — no h1 on error screens) */}
      <h1 className="text-lg font-semibold">حدث خطأ غير متوقع</h1>
      {/* v9-E9: raw error.message (often browser-English) is never shown to
          users anymore — the raw message + stack already go to the console
          and Sentry in the effect above. Fixed Arabic copy here; the digest
          (a server-generated hash, not user text) stays visible for support. */}
      <p className="text-sm text-muted-foreground max-w-md">
        {/* v12-E4.13: «وقع» → «حدث» — matches the h1 verb above (same-word
            drift inside one component). */}
        حدث خطأ أثناء تحميل هذه الصفحة. جرّب إعادة المحاولة، وإن استمرت المشكلة تواصل مع فريق الدعم.
      </p>
      {error?.digest && (
        <p className="text-xs text-muted-foreground">
          رمز الخطأ: <span dir="ltr" className="font-mono">{error.digest}</span>
        </p>
      )}
      {reset && <Button onClick={reset} variant="outline">إعادة المحاولة</Button>}
    </div>
  )
}
