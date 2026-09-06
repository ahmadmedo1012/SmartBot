/**
 * v6 §C — server-side Sentry (GlitchTip-compatible) instrumentation.
 *
 * HARD RULE: when SENTRY_DSN is unset this file does NOTHING — no import,
 * no network, no overhead. The Sentry SDK speaks the same DSN wire protocol
 * as GlitchTip, so switching backends later is a DSN swap, not a code change.
 *
 * Frontend client errors are initialised in instrumentation-client.ts via
 * NEXT_PUBLIC_SENTRY_DSN (public env — inlined at build time).
 * API-route/backend errors additionally flow through FastAPI's own bridge
 * (fb_dashboard/_observability.py) which also alerts the admin Telegram.
 */

type SentryModule = typeof import("@sentry/nextjs")

let _sentryServer: SentryModule | null = null

export async function register() {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (process.env.NEXT_RUNTIME !== "nodejs" || !dsn) {
    return // clean no-op — the default state until the owner sets the DSN
  }
  const Sentry = await import("@sentry/nextjs")
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "production",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.05"),
    sendDefaultPii: false,
  })
  _sentryServer = Sentry
}

/**
 * Next.js hook (v16 signature): unhandled errors during server rendering,
 * server actions and route handlers. Shape mirrors
 * next/dist/server/instrumentation/types.d.ts — typed loosely on purpose
 * (internal Next types are not a public API).
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, unknown> },
  context: { routerKind: string; routePath: string; routeType: string; [key: string]: unknown },
): Promise<void> {
  if (!_sentryServer) return
  _sentryServer.captureRequestError(error, request as never, context as never)
}
