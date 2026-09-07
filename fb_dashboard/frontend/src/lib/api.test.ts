/**
 * v11-A5 — unit tests for the unified API envelope contract (Track A.4).
 *
 * Backend contract: every /api endpoint returns
 *   {"success": boolean, "data": ..., "error"?: string}
 * These tests pin the three failure modes users actually hit:
 *   1. business-fail envelope (HTTP 200, success:false) → ApiError with the
 *      backend's Arabic message — never a silent undefined.
 *   2. transport-level !ok (401/500…) → ApiError with status + parsed body.
 *   3. non-JSON body (HTML error page) → null/generic fallback, no crash.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { unwrapApi } from "./api"
import { ApiError, apiFetch, __resetSession401ForTests } from "./csrf-client"

/** Build a real Response with a JSON body. */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** Capture a rejection as a value so instance + fields can be asserted. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => new Error("expected rejection"),
    (e: unknown) => e,
  )
}

describe("unwrapApi", () => {
  it("returns the data payload from a success envelope (scalars and nested objects)", async () => {
    expect(await unwrapApi(jsonRes({ success: true, data: 42 }))).toBe(42)
    expect(
      await unwrapApi(jsonRes({ success: true, data: { plan: "pro", limits: [1, 2] } })),
    ).toEqual({ plan: "pro", limits: [1, 2] })
  })

  it("throws ApiError (status 200) carrying the Arabic error on a business-fail envelope", async () => {
    const envelope = { success: false, error: "خطة غير موجودة" }
    const err = await rejection(unwrapApi(jsonRes(envelope)))
    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err as ApiError
    expect(apiErr.message).toBe("خطة غير موجودة")
    expect(apiErr.status).toBe(200)
    expect(apiErr.body).toEqual(envelope)
  })

  it("passes legacy bare-JSON bodies through unchanged (no success key)", async () => {
    const legacy = { id: 1, items: ["a"] }
    expect(await unwrapApi(jsonRes(legacy))).toEqual(legacy)
  })

  it("resolves null when the body is not JSON (e.g. an HTML error page)", async () => {
    const res = new Response("<html>gateway error</html>", { status: 502 })
    expect(await unwrapApi(res)).toBeNull()
  })
})

describe("ApiError message precedence", () => {
  it("prefers detail, then error, then the Arabic generic fallback", () => {
    expect(new ApiError(404, { detail: "الصفحة غير موجودة" }).message).toBe("الصفحة غير موجودة")
    expect(new ApiError(401, { error: "انتهت الجلسة، سجّل الدخول من جديد" }).message).toBe(
      "انتهت الجلسة، سجّل الدخول من جديد",
    )
    // non-string detail must not leak "undefined" into the message
    expect(new ApiError(500, { detail: 123 }).message).toBe("فشل الطلب (500)")
    expect(new ApiError(503, null).message).toBe("فشل الطلب (503)")
  })
})

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    /* v15-E5 (D4-H3): the 401 tests below trip the global session-expiry
     * handler — clear its dedupe state + pending redirect timer so nothing
     * leaks into later tests (the wrapper's own behavior is pinned in
     * src/test/ApiGlobal401.test.ts). */
    __resetSession401ForTests()
  })

  it("sends JSON content-type + credentials and returns the raw ok Response", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => jsonRes({ success: true, data: { ok: true } }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const res = await apiFetch("/api/plans", { method: "POST", body: "{}" })

    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/plans")
    expect(init.credentials).toBe("include")
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json")
  })

  it("throws ApiError on transport-level 401 with the backend's Arabic error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonRes({ error: "الجلسة منتهية" }, 401)),
    )

    const err = await rejection(apiFetch("/api/dashboard"))
    expect(err).toBeInstanceOf(ApiError)
    const apiErr = err as ApiError
    expect(apiErr.status).toBe(401)
    expect(apiErr.message).toBe("الجلسة منتهية")
  })

  it("falls back to the generic Arabic message when a 401 body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unauthorized", { status: 401 })))

    const err = await rejection(apiFetch("/api/dashboard"))
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(401)
    expect((err as ApiError).message).toBe("فشل الطلب (401)")
  })
})
