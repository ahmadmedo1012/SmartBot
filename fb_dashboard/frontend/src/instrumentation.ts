/**
 * v6 §C — server-side Sentry (GlitchTip-compatible) instrumentation.
 *
 * DSN resolution (src/lib/sentry-config.ts): env override → committed
 * DEFAULT_SENTRY_DSN (project smartbot-web) → "off" disables. SSR/route
 * errors land in the SAME project as browser errors, separate from the
 * FastAPI backend (smartbot-api).
 * The SDK speaks the same DSN wire protocol as GlitchTip — switching
 * backends later is a DSN swap, not a code change.
 *
 * Frontend client errors are initialised in instrumentation-client.ts via
 * NEXT_PUBLIC_SENTRY_DSN (public env — inlined at build time).
 * API-route/backend errors additionally flow through FastAPI's own bridge
 * (fb_dashboard/_observability.py) which also alerts the admin Telegram.
 */

import { resolveSentryDsn } from "./lib/sentry-config"

type SentryModule = typeof import("@sentry/nextjs")

let _sentryServer: SentryModule | null = null

export async function register() {
  const dsn = resolveSentryDsn(process.env.SENTRY_DSN)
  if (process.env.NEXT_RUNTIME !== "nodejs" || !dsn) {
    return // disabled via SENTRY_DSN=off (or no default configured)
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
