/**
 * v6 §C — client-side Sentry (GlitchTip-compatible) instrumentation.
 * v24-R2 (A2 #5) — LAZY init: the @sentry/nextjs chunk (567 KB raw /
 * 178 KB gz) used to be fetched on EVERY page view right after hydration
 * because register() awaited the dynamic import unconditionally. The
 * funnel below registers zero-dependency global error hooks FIRST and only
 * dynamic-imports the SDK when the FIRST error signal arrives; errors
 * caught in that window are queued and replayed after init, so nothing is
 * lost:
 *
 *   1. window "error"         → queue ev.error (or synthesize from
 *                                message/filename/lineno) + load SDK
 *   2. "unhandledrejection"   → queue ev.reason + load SDK
 *   3. console.error(<Error>) → load SDK only (no queue — see below)
 *
 * (3) is the error-boundary pipeline: DefaultError.tsx / global-error.tsx
 * console.error(error) FIRST and then captureException via their own
 * dynamic import. Our hook fires inside that console.error call — strictly
 * BEFORE their import() — so our init continuation is registered on the
 * shared chunk-load promise first and init (synchronous) completes before
 * their capture runs. Boundary events therefore keep flowing WITHOUT our
 * queue; queueing them here too would duplicate every boundary event.
 *
 * Route transitions (onRouterTransitionStart) never load the SDK — they are
 * buffered as navigation breadcrumbs (bounded) and replayed via
 * addBreadcrumb right after the lazy init, so the first captured error
 * still carries its pre-init navigation trail. Trade-off (documented):
 * pre-init navigations produce no spans — tracing only starts after the
 * first error, at the configured tracesSampleRate.
 *
 * DSN resolution (src/lib/sentry-config.ts): env override → committed
 * DEFAULT_SENTRY_DSN → "off" disables (every hook becomes a no-op).
 * Init options are byte-identical to the previous eager version (DSN
 * source, environment, release — NEXT_PUBLIC_SENTRY_RELEASE, inlined by
 * the next.config.ts env gate from the build script's SENTRY_RELEASE —
 * tracesSampleRate, sendDefaultPii).
 * (NEXT_PUBLIC_ vars are inlined at BUILD time; an env override in Vercel
 * still requires a redeploy to take effect.)
 */

import { resolveSentryDsn } from "./lib/sentry-config"

type SentryModule = typeof import("@sentry/nextjs")

/* Bounded buffers: pre-init errors/breadcrumbs are capped, first-come — the
 * earliest error is usually the root cause; a storm beyond the cap is
 * dropped, matching the SDK's own bounded internal buffering. */
const ERROR_QUEUE_CAP = 20
const CRUMB_QUEUE_CAP = 20

const errorQueue: unknown[] = []
const crumbQueue: { href: string; navigationType: string; timestamp: number }[] = []

/** Resolved once; the promise is shared by every trigger and by
 * onRouterTransitionStart. Rejections are swallowed: a failed lazy load
 * (e.g. offline at the first error) must not surface as a NEW unhandled
 * rejection and re-enter this funnel. */
let sdkPromise: Promise<SentryModule> | null = null

function ensureSdk(): void {
  if (sdkPromise) return
  const dsn = resolveSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN)
  if (!dsn) return
  sdkPromise = (async () => {
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
    /* Breadcrumbs first: they attach to every event captured AFTER the
     * addBreadcrumb call, so replaying them before the queued errors gives
     * the first error event its pre-init navigation trail. */
    for (const crumb of crumbQueue.splice(0)) {
      Sentry.addBreadcrumb({
        type: "navigation",
        category: "navigation",
        message: crumb.href,
        data: { navigationType: crumb.navigationType },
        timestamp: crumb.timestamp,
      })
    }
    for (const err of errorQueue.splice(0)) {
      Sentry.captureException(err)
    }
    return Sentry
  })()
  sdkPromise.catch(() => {
    /* Lazy load failed — Sentry stays off for this session (the same end
     * state as a blocked CDN in the eager world). */
  })
}

function queueError(candidate: unknown): void {
  if (errorQueue.length >= ERROR_QUEUE_CAP) return
  errorQueue.push(candidate)
  ensureSdk()
}

export async function register() {
  /* Client-side hook (Next loads this file in the browser; the guard keeps
   * the module importable from node/jsdom test contexts). */
  if (typeof window === "undefined") return
  if (!resolveSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN)) return

  /* (1) uncaught errors. ErrorEvent.error carries the original Error object
   * in every current browser; the message-only fallback keeps string throws
   * and script parse errors reportable with their source location. */
  window.addEventListener("error", (ev: ErrorEvent) => {
    if (ev.error instanceof Error) {
      queueError(ev.error)
    } else if (typeof ev.message === "string" && ev.message) {
      queueError(new Error(`${ev.message} (${ev.filename ?? "unknown"}:${ev.lineno ?? 0})`))
    }
  })

  /* (2) unhandled promise rejections — reason is any value; the SDK's
   * captureException synthesizes a "non-Error rejection" event for
   * non-Error values. */
  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    queueError(ev.reason)
  })

  /* (3) error-boundary trigger — see the header comment for why this loads
   * the SDK WITHOUT queueing (the boundaries capture the same error through
   * their own import once init has run; queueing here would duplicate every
   * boundary event). */
  const originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    if (args[0] instanceof Error) ensureSdk()
    originalConsoleError(...args)
  }
}

// Instrument client-side route navigations (SDK v10 requirement).
// No-op without the SDK active — the guard mirrors register().
// Next calls this as (url: string, navigationType: RouterTransitionType, event);
// Sentry's recorder takes (href, navigationType) — narrow the unknown rest args.
export const onRouterTransitionStart = async (...args: unknown[]) => {
  if (!resolveSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN)) return
  const [href, navigationType] = args
  if (typeof href !== "string" || typeof navigationType !== "string") return
  if (sdkPromise) {
    /* SDK loaded (or loading): forward the transition — an in-flight load
     * is awaited past init, so tracing/breadcrumbs stay ordered. A failed
     * load resolves null and the transition is dropped (Sentry off). */
    const Sentry = await sdkPromise.catch((): SentryModule | null => null)
    if (Sentry) Sentry.captureRouterTransitionStart(href, navigationType)
    return
  }
  /* v24-R2: navigation is not an error — it must never pull the 178 KB gz
   * chunk. Buffer (bounded) and replay as breadcrumbs after lazy init. */
  if (crumbQueue.length < CRUMB_QUEUE_CAP) {
    crumbQueue.push({ href, navigationType, timestamp: Date.now() / 1000 })
  }
}
