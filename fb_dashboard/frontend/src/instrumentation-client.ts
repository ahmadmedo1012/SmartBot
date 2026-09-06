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
    // v12-E5.6: no unconditional "production" — local dev/preview builds
    // used to tag every event as production (D12 finding). Explicit
    // NEXT_PUBLIC_SENTRY_ENVIRONMENT wins, then Next's own NODE_ENV, and
    // only then the safe production default.
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "production",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.05"),
    sendDefaultPii: false,
  })
}

// Instrument client-side route navigations (SDK v10 requirement).
// No-op without the SDK active — the guard mirrors register().
// Next calls this as (url: string, navigationType: RouterTransitionType, event);
// Sentry's recorder takes (href, navigationType) — narrow the unknown rest args.
export const onRouterTransitionStart = async (...args: unknown[]) => {
  if (!resolveSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN)) return
  const Sentry = await import("@sentry/nextjs")
  const [href, navigationType] = args
  if (typeof href === "string" && typeof navigationType === "string") {
    Sentry.captureRouterTransitionStart(href, navigationType)
  }
}
