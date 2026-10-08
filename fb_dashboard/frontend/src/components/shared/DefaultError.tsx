"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { isSentryEnabled } from "@/lib/sentry-config"
import { TriangleAlert } from "lucide-react"
import { useEffect } from "react"

/* r131-F7 (A4 P2-8 + A11): the ONE route-boundary error skin, re-based on
 * the canonical .state family (globals.css): 56px r-xl rose-soft tile with
 * the -ink glyph (light rose-deep #6B2128 / dark rose #F0938F — was a 64px
 * rounded-full destructive/10 circle), 18px/600 title, 13px/42ch desc,
 * retry on the sm outline rung. The per-page hand-rolled error blocks and
 * the admin/telegram glass skin retire onto this family (F8 sweep).
 * Behavioral contracts are UNCHANGED (pinned by DefaultError.test.tsx):
 * role=alert, h1 page heading, fixed Arabic copy, digest LTR for support,
 * console + Sentry reporting, #page-content skip-link target. */
export function DefaultError({
  error,
  reset,
  className,
  title,
  description,
}: {
  error: Error & { digest?: string }
  reset?: () => void
  className?: string
  title?: string
  description?: string
}) {
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
    <div
      role="alert"
      className={cn(
        "state state-danger min-h-[60vh] px-4",
        className
      )}
    >
      <span id="page-content" className="sr-only" tabIndex={-1} />
      <div className="state-icon" aria-hidden="true">
        <TriangleAlert />
      </div>
      {/* v8-B19: route error boundaries replace the whole page tree, so this
          heading IS the page's h1 (was h2 — no h1 on error screens) */}
      <h1 className="state-title">{title ?? "حدث خطأ غير متوقع"}</h1>
      {/* v9-E9: raw error.message (often browser-English) is never shown to
          users anymore — the raw message + stack already go to the console
          and Sentry in the effect above. Fixed Arabic copy here; the digest
          (a server-generated hash, not user text) stays visible for support. */}
      <p className="state-desc">
        {description ??
          /* v12-E4.13: «وقع» → «حدث» — matches the h1 verb above (same-word
              drift inside one component). */
          "حدث خطأ أثناء تحميل هذه الصفحة. جرّب إعادة المحاولة، وإن استمرت المشكلة تواصل مع فريق الدعم."}
      </p>
      {error?.digest && (
        <p className="text-xs text-muted-foreground">
          رمز الخطأ: <span dir="ltr" className="font-mono">{error.digest}</span>
        </p>
      )}
      {reset && (
        <Button onClick={reset} variant="outline" size="sm">
          إعادة المحاولة
        </Button>
      )}
    </div>
  )
}
