/**
 * v13-E6 — DefaultError / DefaultLoading contracts (route-level fallbacks).
 *
 * Pins the v9-E9 promise: a browser-English error.message is NEVER shown
 * to users — fixed Arabic copy + the server digest (support lookup only).
 * Also pins the v6 §C wiring: console.error always, Sentry
 * captureException (tagged boundary=route-error) when the DSN resolves on.
 *
 * @sentry/nextjs is mocked (captureException) — the component imports it
 * dynamically, which the mock intercepts; the real SDK would try to spin
 * up transport in jsdom.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DefaultError } from "./DefaultError"
import { DefaultLoading } from "./DefaultLoading"

const sentryMock = vi.hoisted(() => ({ captureException: vi.fn() }))
vi.mock("@sentry/nextjs", () => ({
  captureException: sentryMock.captureException,
}))

function makeError(digest?: string): Error & { digest?: string } {
  const err = new Error("boom-secret-internal-detail") as Error & { digest?: string }
  if (digest !== undefined) err.digest = digest
  return err
}

beforeEach(() => {
  sentryMock.captureException.mockClear()
  // silence + capture the component's own console.error(error) call
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("DefaultError", () => {
  it("renders role=alert with the h1 and the fixed Arabic body copy", () => {
    render(<DefaultError error={makeError()} reset={vi.fn()} />)

    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "حدث خطأ غير متوقع" })).toBeInTheDocument()
    expect(
      screen.getByText(
        "حدث خطأ أثناء تحميل هذه الصفحة. جرّب إعادة المحاولة، وإن استمرت المشكلة تواصل مع فريق الدعم.",
      ),
    ).toBeInTheDocument()
  })

  it("never leaks the raw English error.message into the UI", () => {
    render(<DefaultError error={makeError()} reset={vi.fn()} />)

    expect(screen.queryByText(/boom-secret-internal-detail/)).toBeNull()
    // ...but the console + Sentry still receive the raw error (below)
  })

  it("shows the digest LTR for support lookup when present, and hides it otherwise", () => {
    const { unmount } = render(<DefaultError error={makeError("abc123")} reset={vi.fn()} />)
    const digest = screen.getByText("abc123")
    expect(digest).toHaveAttribute("dir", "ltr")
    expect(screen.getByText(/رمز الخطأ:/)).toBeInTheDocument()
    unmount()

    render(<DefaultError error={makeError()} reset={vi.fn()} />)
    expect(screen.queryByText(/رمز الخطأ:/)).toBeNull()
  })

  it("logs the error to the console and reports it to Sentry tagged as route-error", async () => {
    const error = makeError("d1")
    render(<DefaultError error={error} reset={vi.fn()} />)

    expect(console.error).toHaveBeenCalledWith(error)
    await waitFor(() => expect(sentryMock.captureException).toHaveBeenCalledTimes(1))
    expect(sentryMock.captureException).toHaveBeenCalledWith(error, {
      tags: { boundary: "route-error", digest: "d1" },
    })
  })

  it("wires the reset button only when reset is provided", () => {
    const reset = vi.fn()
    const { unmount } = render(<DefaultError error={makeError()} reset={reset} />)
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    expect(reset).toHaveBeenCalledTimes(1)
    unmount()

    render(<DefaultError error={makeError()} />)
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("reports to Sentry even without a digest (empty digest tag)", async () => {
    const error = makeError()
    render(<DefaultError error={error} reset={vi.fn()} />)

    await waitFor(() => expect(sentryMock.captureException).toHaveBeenCalledTimes(1))
    expect(sentryMock.captureException).toHaveBeenCalledWith(error, {
      tags: { boundary: "route-error", digest: "" },
    })
  })
})

describe("DefaultLoading", () => {
  it("renders a polite status region with an sr-only announcement", () => {
    render(<DefaultLoading />)

    const region = screen.getByRole("status")
    expect(region).toHaveAttribute("aria-live", "polite")
    // the visible "جارٍ التحميل…" text is aria-hidden decoration; the
    // screen-reader text is the longer sr-only variant
    expect(screen.getByText("جارٍ تحميل المحتوى", { selector: ".sr-only" })).toBeInTheDocument()
    expect(region.textContent).toContain("جارٍ التحميل…")
  })

  it("appends the caller className", () => {
    const { container } = render(<DefaultLoading className="test-loading-extra" />)

    expect(container.firstElementChild).toHaveClass("test-loading-extra")
  })
})
