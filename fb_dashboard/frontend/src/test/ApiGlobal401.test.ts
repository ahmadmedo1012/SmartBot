/**
 * v15-E5 (D4-H3) — the GLOBAL 401 session-expiry journey in the central
 * wrapper (apiFetch, src/lib/csrf-client.ts).
 *
 * The ONE structural fix covering all 22 react-query dashboard pages: a 401
 * mid-use (e.g. a 60s refetchInterval with an expired token) used to leave
 * the page spinning in a local error state; now the wrapper announces the
 * expiry in Arabic and redirects to /login?redirect=<current path+search>
 * (login's safeRedirect lands the user back after re-authenticating).
 *
 * Pins:
 *   - 401 → Arabic toast («انتهت الجلسة») + replace("/login?redirect=…")
 *     after the short readability delay (fake timers advance it)
 *   - the ApiError still THROWS (every caller's catch sees the same object)
 *   - loop/smart skips: /api/login (wrong password!), /api/register,
 *     /api/auth/change-password (401 = wrong CURRENT password) and a 401
 *     while already on /login never redirect
 *   - the burst dedupe: three parallel 401s → ONE toast, ONE redirect
 *   - skipAuthRedirect: caller-owned 401 journeys stay untouched
 *
 * House patterns: real Response objects via vi.stubGlobal fetch, jsdom
 * cookie jar, premium-toast module mock, stubbed window.location.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, apiFetch, __resetSession401ForTests } from "@/lib/csrf-client"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("@/lib/premium-toast", () => ({
  premiumToast: mocks.toast,
}))

/** Build a real Response with a JSON body. */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function stub401(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonRes({ detail: "انتهت صلاحية الجلسة" }, 401),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function stubLocation(pathname: string, search = "") {
  mocks.replace.mockClear()
  const loc: Record<string, unknown> = {
    pathname,
    search,
    replace: mocks.replace,
    assign: vi.fn(),
    href: `http://localhost${pathname}${search}`,
  }
  vi.stubGlobal("location", loc)
}

/** Capture a rejection as a value so instance + fields can be asserted. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => new Error("expected rejection"),
    (e: unknown) => e,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.toast.mockClear()
  mocks.replace.mockClear()
  __resetSession401ForTests()
  stubLocation("/dashboard/analytics")
})

afterEach(() => {
  __resetSession401ForTests()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("apiFetch global 401 (D4-H3) — toast + redirect", () => {
  it("401 mid-dashboard → Arabic toast + replace to /login with the current path (and keeps throwing)", async () => {
    const fetchMock = stub401()

    const err = await rejection(apiFetch("/api/dashboard/stats"))
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)

    // toast fires via the dynamic premium-toast import (v16 bundle fix —
    // sonner no longer rides the public-route chunk graph); flush it, then
    // the redirect still waits for the readability delay
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1))
    expect(mocks.toast).toHaveBeenCalledWith(
      "error",
      "انتهت الجلسة",
      "أعد تسجيل الدخول — سيتم تحويلك إلى صفحة الدخول الآن",
    )
    expect(mocks.replace).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1200)
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith("/login?redirect=%2Fdashboard%2Fanalytics")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("carries the query string too (login lands the user on the exact page)", async () => {
    stub401()
    stubLocation("/dashboard/billing", "?tab=invoices")

    await rejection(apiFetch("/api/payments/balance"))

    await vi.advanceTimersByTimeAsync(1200)
    expect(mocks.replace).toHaveBeenCalledWith("/login?redirect=%2Fdashboard%2Fbilling%3Ftab%3Dinvoices")
  })
})

describe("apiFetch global 401 — loop & semantic skips", () => {
  it("NEVER redirects a login 401 (wrong password is the login page's own journey)", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonRes({ detail: "بيانات تسجيل الدخول غير صحيحة" }, 401),
    )
    vi.stubGlobal("fetch", fetchMock)
    stubLocation("/login")

    const err = await rejection(apiFetch("/api/login", { method: "POST", body: "{}" }))
    expect((err as ApiError).message).toBe("بيانات تسجيل الدخول غير صحيحة")

    await vi.advanceTimersByTimeAsync(1200)
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("NEVER redirects change-password 401 — «كلمة المرور الحالية غير صحيحة» must surface, not a session kick", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonRes({ detail: "كلمة المرور الحالية غير صحيحة" }, 401),
    )
    vi.stubGlobal("fetch", fetchMock)
    stubLocation("/dashboard/settings")

    const err = await rejection(apiFetch("/api/auth/change-password", { method: "POST" }))
    expect((err as ApiError).message).toBe("كلمة المرور الحالية غير صحيحة")

    await vi.advanceTimersByTimeAsync(1200)
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("skips register 401s as well (pre-session surface)", async () => {
    stub401()
    stubLocation("/register")

    await rejection(apiFetch("/api/register", { method: "POST", body: "{}" }))

    await vi.advanceTimersByTimeAsync(1200)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("a 401 while already ON /login never re-redirects (loop guard)", async () => {
    stub401()
    stubLocation("/login")

    await rejection(apiFetch("/api/me"))

    await vi.advanceTimersByTimeAsync(1200)
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

describe("apiFetch global 401 — burst dedupe & opt-out", () => {
  it("three parallel 401s (stale refetch burst) → ONE toast, ONE redirect", async () => {
    stub401()

    await Promise.allSettled([
      apiFetch("/api/dashboard/stats"),
      apiFetch("/api/comments"),
      apiFetch("/api/subscribers"),
    ])

    // v16: the toast arrives via the dynamic premium-toast import — flush
    // it before counting (dedupe still collapses the burst to ONE call)
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(1200)
    expect(mocks.replace).toHaveBeenCalledTimes(1)
  })

  it("skipAuthRedirect leaves the journey entirely to the caller", async () => {
    stub401()

    await rejection(apiFetch("/api/subscriptions", { method: "POST", skipAuthRedirect: true }))

    expect(mocks.toast).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1200)
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
