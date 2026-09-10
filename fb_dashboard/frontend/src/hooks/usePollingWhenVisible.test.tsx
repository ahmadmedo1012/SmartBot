/**
 * v24-R2 (A2 #6/#7) — usePollingWhenVisible contract (visibility-aware
 * polling for react-query).
 *
 * Pinned behaviors (integration with a REAL QueryClient + useQuery, exactly
 * how analytics/activity pages consume it):
 *  - visible → the hook returns the interval value (the plain refetchInterval
 *    contract); hidden → false (the observer's interval timer is cleared).
 *  - no fetch fires while the tab is hidden, even after many intervals.
 *  - returning to the tab triggers ONE immediate refetch when the data went
 *    stale while hidden (older than one interval, no fetch in flight).
 *  - returning within one interval costs ZERO requests (no double-fetch).
 *  - after the return, normal polling resumes (the next tick refetches).
 *
 * The probe uses a 50ms interval so real timers can exercise the cadence
 * without fake-timer/react-query interplay; margins are ≥3× the interval.
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { usePollingWhenVisible } from "./usePollingWhenVisible"

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}))

/* @/lib/api (unwrapApi) imports ApiError from ./csrf-client — the partial
 * mock keeps the class so that import binding survives (house pattern). */
vi.mock("@/lib/csrf-client", () => {
  class ApiError extends Error {
    constructor(public status: number, public body: unknown) {
      super(`فشل الطلب (${status})`)
    }
  }
  return { ApiError, apiFetch: mocks.apiFetch }
})

const KEY = ["poll-probe"]
const INTERVAL = 50

/** jsdom defaults to visible; flip the DOM APIs react-query and the hook
 * read, then notify both listeners inside act() so React flushes the hook's
 * state flip (the event bubbles to window in real browsers — mirror that so
 * focusManager sees it too). */
async function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true })
  Object.defineProperty(document, "hidden", { value: state === "hidden", configurable: true })
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
  })
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function Probe() {
  const refetchInterval = usePollingWhenVisible(INTERVAL, KEY)
  const q = useQuery({
    queryKey: KEY,
    queryFn: () =>
      mocks.apiFetch("/api/probe").then((res: { json: () => Promise<{ n: number }> }) => res.json()),
    refetchInterval,
  })
  return (
    <span>
      <span data-testid="interval">{String(refetchInterval)}</span>
      <span data-testid="data">{String(q.data?.n ?? 0)}</span>
    </span>
  )
}

function renderProbe() {
  // production defaults that matter here: no refetchOnWindowFocus (the
  // hook owns visibility refetches), no retries.
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <Probe />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.apiFetch.mockReset()
  mocks.apiFetch.mockImplementation(async () => ({ json: async () => ({ n: mocks.apiFetch.mock.calls.length }) }))
})

afterEach(() => {
  vi.restoreAllMocks()
  // restore jsdom's default visible tab for the next test (the tests
  // shadow the Document prototype getters with own properties)
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
  Object.defineProperty(document, "hidden", { value: false, configurable: true })
})

describe("usePollingWhenVisible", () => {
  it("visible → interval value; hidden → false; visible again → interval", async () => {
    renderProbe()
    expect(screen.getByTestId("interval").textContent).toBe(String(INTERVAL))

    await setVisibility("hidden")
    expect(screen.getByTestId("interval").textContent).toBe("false")

    await setVisibility("visible")
    expect(screen.getByTestId("interval").textContent).toBe(String(INTERVAL))
  })

  it("no fetch fires while hidden, even after many intervals", async () => {
    renderProbe()
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("1"))

    await setVisibility("hidden")
    await sleep(3 * INTERVAL)
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1)

    await setVisibility("visible")
  })

  it("returning to the tab refetches immediately when data went stale while hidden", async () => {
    renderProbe()
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("1"))

    await setVisibility("hidden")
    await sleep(2 * INTERVAL + 20) // data now older than one interval
    await setVisibility("visible")

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("2"))
  })

  it("returning within one interval costs zero requests (no double-fetch)", async () => {
    renderProbe()
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("1"))

    await setVisibility("hidden")
    await sleep(10) // way below the 50ms interval
    await setVisibility("visible")
    // no immediate resume-refetch (data is fresher than one interval) — and
    // the resumed poll tick only fires a full interval AFTER the return
    await sleep(20)

    expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
  })

  it("normal polling resumes after the return (next tick refetches)", async () => {
    renderProbe()
    await waitFor(() => expect(screen.getByTestId("data").textContent).toBe("1"))

    await setVisibility("hidden")
    await sleep(2 * INTERVAL + 20)
    await setVisibility("visible")
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(2))

    // cadence restored: at least one more tick within a few intervals
    await waitFor(() => expect(mocks.apiFetch.mock.calls.length).toBeGreaterThanOrEqual(3), { timeout: 4 * INTERVAL })
  })
})
