/**
 * v24-R2 (A2 #5) — LAZY Sentry init contract for src/instrumentation-client.
 *
 * Pinned behaviors:
 *  - register() installs the lightweight hooks WITHOUT touching the SDK:
 *    the @sentry/nextjs module factory must not even evaluate (the 567KB
 *    raw / 178KB gz chunk stays unfetched — the mobile first-visit diet).
 *  - Route transitions never load the SDK either — they are buffered and
 *    replayed as navigation breadcrumbs AFTER the lazy init (breadcrumb
 *    flush strictly BEFORE the queued-error replay, so the first error
 *    event carries its pre-init navigation trail).
 *  - The FIRST window "error" / "unhandledrejection" loads the SDK once,
 *    inits it with the SAME option contract as the eager era (committed
 *    default DSN, tracesSampleRate 0.05 fallback, sendDefaultPii false)
 *    and replays every queued error via captureException.
 *  - console.error(<Error>) loads the SDK WITHOUT queueing (the error
 *    boundaries capture the same error themselves — queueing here would
 *    duplicate every boundary event).
 *  - The pre-init error queue is bounded (first 20 win).
 *  - DSN "off" → register() installs nothing at all.
 *
 * Each test builds a FRESH module graph (vi.resetModules + vi.doMock) with
 * its own @sentry/nextjs mock instance, because the funnel state (queues,
 * sdk promise) is module-level by design — the factory-run counter is the
 * "was the chunk fetched" signal vitest can observe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Mock } from "vitest"

import { DEFAULT_SENTRY_DSN } from "@/lib/sentry-config"

/** jsdom's ErrorEvent carries no `error` member — synthesize the shape the
 * funnel reads (browsers set it natively). */
function dispatchErrorEvent(detail: { error?: unknown; message?: string }) {
  const ev = new Event("error")
  Object.assign(ev, detail)
  window.dispatchEvent(ev)
}

function dispatchRejection(reason: unknown) {
  const ev = new Event("unhandledrejection")
  Object.assign(ev, { reason })
  window.dispatchEvent(ev)
}

/** Let the async import/init/flush chain resolve. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

interface SentryMocks {
  init: Mock
  captureException: Mock
  addBreadcrumb: Mock
  captureRouterTransitionStart: Mock
}

/**
 * Fresh instrumentation-client module + a fresh @sentry/nextjs mock.
 * `factoryRuns` counts mock evaluations — 0 until the funnel's dynamic
 * import actually executes (≙ the async chunk being fetched).
 */
async function freshModule(): Promise<{
  register: typeof import("../instrumentation-client")["register"]
  onRouterTransitionStart: typeof import("../instrumentation-client")["onRouterTransitionStart"]
  sentry: SentryMocks
  factoryRuns: () => number
}> {
  const sentry: SentryMocks = {
    init: vi.fn(),
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    captureRouterTransitionStart: vi.fn(),
  }
  let runs = 0
  vi.resetModules()
  vi.doMock("@sentry/nextjs", () => {
    runs++
    return sentry
  })
  const mod = await import("../instrumentation-client")
  return {
    register: mod.register,
    onRouterTransitionStart: mod.onRouterTransitionStart,
    sentry,
    factoryRuns: () => runs,
  }
}

let originalConsoleError: (...data: unknown[]) => void

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SENTRY_DSN
  // register() wraps console.error — keep vitest's own console restorable
  originalConsoleError = console.error.bind(console)
})

afterEach(() => {
  console.error = originalConsoleError
  vi.doUnmock("@sentry/nextjs")
})

describe("v24-R2 lazy Sentry init", () => {
  it("register() installs hooks without loading the SDK", async () => {
    const { register, sentry, factoryRuns } = await freshModule()
    await register()

    expect(factoryRuns()).toBe(0)
    expect(sentry.init).not.toHaveBeenCalled()

    // the hooks are live: a queued error now flows through the funnel
    dispatchErrorEvent({ error: new Error("late boom") })
    await flush()
    expect(factoryRuns()).toBe(1)
    expect(sentry.init).toHaveBeenCalledTimes(1)
    expect(sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "late boom" }))
  })

  it("route transitions never load the SDK and replay as breadcrumbs after init", async () => {
    const { register, onRouterTransitionStart, sentry, factoryRuns } = await freshModule()
    await register()

    await onRouterTransitionStart("/dashboard/analytics", "push")
    expect(factoryRuns()).toBe(0) // navigation is not an error — no 178KB chunk

    dispatchErrorEvent({ error: new Error("real boom") })
    await flush()

    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "navigation",
        message: "/dashboard/analytics",
        data: { navigationType: "push" },
      }),
    )
    // breadcrumb BEFORE the queued error → the first event carries the trail
    expect(sentry.addBreadcrumb.mock.invocationCallOrder[0]).toBeLessThan(
      sentry.captureException.mock.invocationCallOrder[0],
    )
    // post-init transitions forward to the SDK recorder
    await onRouterTransitionStart("/dashboard/activity", "replace")
    expect(sentry.captureRouterTransitionStart).toHaveBeenCalledWith("/dashboard/activity", "replace")
  })

  it("first error loads the SDK once and preserves the init option contract", async () => {
    const { register, sentry, factoryRuns } = await freshModule()
    await register()

    const boom = new Error("boom")
    dispatchErrorEvent({ error: boom })
    dispatchErrorEvent({ error: new Error("second") })
    dispatchRejection(new Error("rejected"))
    await flush()

    expect(factoryRuns()).toBe(1)
    expect(sentry.init).toHaveBeenCalledTimes(1)
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DEFAULT_SENTRY_DSN,
        tracesSampleRate: 0.05,
        sendDefaultPii: false,
      }),
    )
    expect(sentry.captureException).toHaveBeenCalledTimes(3)
    expect(sentry.captureException).toHaveBeenCalledWith(boom)
    expect(sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "second" }))
    expect(sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "rejected" }))
  })

  it("message-only window errors synthesize an Error with the source location", async () => {
    const { register, sentry } = await freshModule()
    await register()

    dispatchErrorEvent({ message: "Uncaught SyntaxError: unexpected token" })
    await flush()

    expect(sentry.captureException).toHaveBeenCalledTimes(1)
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Uncaught SyntaxError") }),
    )
  })

  it("console.error(<Error>) loads the SDK but never queues (boundary pipeline)", async () => {
    // silence vitest's console before register() captures it as the
    // "original" — the funnel forwards original args to what it captured
    console.error = () => {}
    const { register, sentry, factoryRuns } = await freshModule()
    await register()

    console.error(new Error("boundary error"))
    await flush()

    // the SDK is loaded + initialized (so DefaultError's own capture works)
    expect(factoryRuns()).toBe(1)
    expect(sentry.init).toHaveBeenCalledTimes(1)
    // ...but the funnel itself did NOT capture — no duplicate event
    expect(sentry.captureException).not.toHaveBeenCalled()

    // non-Error console.error stays free (no SDK pull for log noise)
    console.error("just a string", 42)
    await flush()
    expect(factoryRuns()).toBe(1)
  })

  it("pre-init error queue is bounded (first 20 win)", async () => {
    const { register, sentry } = await freshModule()
    await register()

    for (let i = 0; i < 25; i++) {
      dispatchErrorEvent({ error: new Error(`e${i}`) })
    }
    await flush()

    expect(sentry.captureException).toHaveBeenCalledTimes(20)
    expect(sentry.captureException).toHaveBeenNthCalledWith(1, expect.objectContaining({ message: "e0" }))
    expect(sentry.captureException).toHaveBeenNthCalledWith(20, expect.objectContaining({ message: "e19" }))
  })

  it('DSN "off" → register() installs nothing (all no-op)', async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "off"
    console.error = () => {} // keep the boundary-trigger call silent
    const { register, onRouterTransitionStart, sentry, factoryRuns } = await freshModule()
    await register()

    dispatchErrorEvent({ error: new Error("boom") })
    dispatchRejection("nope")
    console.error(new Error("boundary"))
    await onRouterTransitionStart("/x", "push")
    await flush()

    expect(factoryRuns()).toBe(0)
    expect(sentry.init).not.toHaveBeenCalled()
    expect(sentry.captureException).not.toHaveBeenCalled()
  })
})
