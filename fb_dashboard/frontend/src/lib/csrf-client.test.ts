/**
 * v13-E6 — CSRF double-submit contract tests (v12-E4, pairs with
 * app/middleware.py): every mutating request must echo the non-HttpOnly
 * `csrf_token` cookie in X-CSRF-Token, GETs never do, and the header is
 * never fabricated when the cookie is absent.
 *
 * House patterns (from api.test.ts): stub the real `fetch` global with
 * vi.stubGlobal + a vi.fn returning a real Response, and restore with
 * vi.unstubAllGlobals() in afterEach. Cookies are managed through the
 * real jsdom document.cookie jar — the documented reset recipe deletes
 * the cookie with a past expiry (jsdom honors Set-Cookie semantics).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { apiFetch } from "./csrf-client"

/** Build a real Response with a JSON body. */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** Fetch stub that records the RequestInit it was called with. */
function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => jsonRes({ success: true, data: null }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

/** jsdom recipe: expire the csrf cookie so each test starts from a clean jar. */
function clearCsrfCookie() {
  document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
}

/** Read the headers the (single) fetch call actually sent. */
function sentHeaders(fetchMock: ReturnType<typeof vi.fn>): Headers {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return new Headers(init.headers)
}

beforeEach(() => {
  clearCsrfCookie()
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearCsrfCookie()
})

describe("apiFetch X-CSRF-Token (double-submit cookie)", () => {
  it("echoes the cookie on POST, PUT, PATCH and DELETE — but never on GET", async () => {
    document.cookie = "csrf_token=tok-123"

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const fetchMock = stubFetch()
      await apiFetch("/api/x", { method })
      expect(sentHeaders(fetchMock).get("X-CSRF-Token")).toBe("tok-123")
      vi.unstubAllGlobals()
    }

    const getMock = stubFetch()
    await apiFetch("/api/x", { method: "GET" })
    expect(sentHeaders(getMock).get("X-CSRF-Token")).toBeNull()
  })

  it("treats a lowercase method as its uppercase verb (post → CSRF header set)", async () => {
    document.cookie = "csrf_token=tok-123"
    const fetchMock = stubFetch()

    await apiFetch("/api/x", { method: "post" })

    expect(sentHeaders(fetchMock).get("X-CSRF-Token")).toBe("tok-123")
  })

  it("preserves a cookie value that itself contains '=' (base64-style padding)", async () => {
    document.cookie = "csrf_token=abc=def=="
    const fetchMock = stubFetch()

    await apiFetch("/api/x", { method: "POST" })

    // split('=') naively truncates at the first '='; the slice(1).join('=)
    // reconstruction must keep the full value
    expect(sentHeaders(fetchMock).get("X-CSRF-Token")).toBe("abc=def==")
  })

  it("picks the csrf_token row out of a multi-cookie jar", async () => {
    document.cookie = "session=zzz"
    document.cookie = "theme=dark"
    document.cookie = "csrf_token=the-right-one"
    const fetchMock = stubFetch()

    await apiFetch("/api/x", { method: "DELETE" })

    expect(sentHeaders(fetchMock).get("X-CSRF-Token")).toBe("the-right-one")
  })

  it("sends no X-CSRF-Token when the cookie is absent (cold visit)", async () => {
    const fetchMock = stubFetch()

    await apiFetch("/api/x", { method: "POST" })

    expect(sentHeaders(fetchMock).has("X-CSRF-Token")).toBe(false)
  })

  it("never overwrites a preset X-CSRF-Token header", async () => {
    document.cookie = "csrf_token=cookie-value"
    const fetchMock = stubFetch()

    await apiFetch("/api/x", {
      method: "POST",
      headers: { "X-CSRF-Token": "preset-value" },
    })

    expect(sentHeaders(fetchMock).get("X-CSRF-Token")).toBe("preset-value")
  })

  it("skips the cookie lookup entirely on the server (no document)", async () => {
    document.cookie = "csrf_token=tok-123"
    const fetchMock = stubFetch()
    // SSR guard: `typeof document !== "undefined"` must short-circuit before
    // the cookie read — a bare `document.cookie` would throw in Node.
    vi.stubGlobal("document", undefined)

    await expect(apiFetch("/api/x", { method: "POST" })).resolves.toBeInstanceOf(Response)

    expect(sentHeaders(fetchMock).get("X-CSRF-Token")).toBeNull()
  })
})

describe("apiFetch Content-Type handling", () => {
  it("does not force a JSON content-type on FormData or URLSearchParams bodies", async () => {
    const formMock = stubFetch()
    await apiFetch("/api/upload", { method: "POST", body: new FormData() })
    expect(sentHeaders(formMock).get("Content-Type")).toBeNull()
    vi.unstubAllGlobals()

    const urlMock = stubFetch()
    await apiFetch("/api/form", { method: "POST", body: new URLSearchParams("a=1") })
    // the browser (and jsdom) sets the urlencoded type itself — apiFetch
    // must not preempt it with application/json (FastAPI 422 regression)
    expect(urlMock).toHaveBeenCalledTimes(1)
    const init = urlMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Headers(init[1].headers).get("Content-Type")).not.toBe("application/json")
  })

  it("respects a caller-provided Content-Type instead of JSON", async () => {
    const fetchMock = stubFetch()

    await apiFetch("/api/x", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "raw",
    })

    expect(sentHeaders(fetchMock).get("Content-Type")).toBe("text/plain")
  })

  it("defaults to application/json for plain string bodies", async () => {
    const fetchMock = stubFetch()

    await apiFetch("/api/x", { method: "POST", body: "{}" })

    expect(sentHeaders(fetchMock).get("Content-Type")).toBe("application/json")
  })
})
