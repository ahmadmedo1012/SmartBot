/**
 * v6 §C — client-side Sentry (GlitchTip-compatible) instrumentation.
 *
 * HARD RULE: when NEXT_PUBLIC_SENTRY_DSN is unset this registers nothing —
 * the dynamic import never happens, so the Sentry bundle chunk is never
 * loaded and the no-op state is truly zero-cost for page weight.
 * (NEXT_PUBLIC_ vars are inlined at BUILD time: set the env var in Vercel
 * and redeploy to activate.)
 */

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  if (!dsn) {
    return
  }
  const Sentry = await import("@sentry/nextjs")
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.05"),
    sendDefaultPii: false,
  })
}

// Instrument client-side route navigations (SDK v10 requirement).
// No-op without the SDK active — the guard mirrors register().
export const onRouterTransitionStart = async (...args: unknown[]) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
  const Sentry = await import("@sentry/nextjs")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(Sentry as any).captureRouterTransitionStart?.(...args)
}
