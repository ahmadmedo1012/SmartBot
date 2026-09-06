/**
 * v6 §C — client-side Sentry (GlitchTip-compatible) instrumentation.
 *
 * DSN resolution (src/lib/sentry-config.ts): env override → committed
 * DEFAULT_SENTRY_DSN → "off" disables. The dynamic import keeps the SDK
 * chunk out of the critical path — page weight/LCP are unaffected (the
 * chunk loads async after hydration).
 * (NEXT_PUBLIC_ vars are inlined at BUILD time; an env override in Vercel
 * still requires a redeploy to take effect.)
 */

import { resolveSentryDsn } from "./lib/sentry-config"

export async function register() {
  const dsn = resolveSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN)
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
  if (!resolveSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN)) return
  const Sentry = await import("@sentry/nextjs")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(Sentry as any).captureRouterTransitionStart?.(...args)
}
