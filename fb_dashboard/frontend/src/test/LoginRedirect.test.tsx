/**
 * P42-8a — safeRedirect regression wall (login/page.tsx).
 *
 * The login page's open-redirect guard (v14-E4 D1 security review) had ZERO
 * tests: only a comment in ApiGlobal401.test.tsx mentions it. It is the
 * single trust boundary every ?redirect= round-trip rides on (401 session
 * expiry, AuthGuard, /connect, /subscribe all land here with a redirect
 * param). This wall pins the guard through the real page surface — the
 * already-authenticated mount path (/api/me answers a user → landingFor →
 * window.location.replace) — with no production-code change:
 *
 *   - a RELATIVE path (with query) is honored verbatim (the legitimate
 *     post-login round-trip: /dashboard/billing?tab=invoices)
 *   - "//evil.com" (protocol-relative foreign host) is REJECTED → /dashboard
 *   - "/\evil.com" (WHATWG backslash normalization: IS "//evil.com" to the
 *     location parser) is REJECTED → /dashboard
 *   - an absolute foreign URL (https://evil.com/x) is REJECTED → /dashboard
 *   - a javascript: URI is REJECTED → /dashboard
 *   - no redirect param + platform admin (tenant_id 0) → /admin (v10-B5
 *     landing contract rides the same landingFor seam)
 *
 * P42-W10 (F-01) — the control-char class the wall above missed (the exact
 * gap Reviewer A flagged: the W8b sibling fix Smart-Menu e7294e50 was never
 * ported to this twin). WHATWG parsing strips ASCII tab/LF/CR BEFORE the
 * path grammar, so '/\t/evil.com' sailed through the old three checks:
 *   - semantics proof: WHATWG URL itself resolves '/\t/evil.com' on a
 *     foreign origin (pinned as a live assertion, not a comment)
 *   - "/<TAB>/evil.com", "/<LF>/evil.com", "/<CR>/evil.com",
 *     "/<DEL>/evil.com" (percent-encoded in the query) are ALL REJECTED
 *     → /dashboard (whole [\x00-\x1f\x7f] class, verbatim port)
 *
 * Mock bundle (house pattern, RegisterForm.test.tsx twin): premium-toast
 * spy, next-themes stub (the corner ThemeToggle), stubbed fetch with real
 * Response objects, and a stubbed window.location whose `search` carries
 * the ?redirect= under test (the page reads it at mount).
 */
import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import LoginPage from "@/app/login/page"

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  replace: vi.fn(),
}))

vi.mock("@/lib/premium-toast", () => ({
  brandedToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}))

/** Build a real Response with a JSON body (house helper). */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/** /api/me answering an authenticated tenant admin (role admin, tenant 5). */
function stubMeAuthenticated() {
  vi.stubGlobal("fetch", vi.fn(async () =>
    jsonRes({
      success: true,
      data: {
        user: { id: 1, role: "admin", tenant_id: 5, onboardingCompleted: true },
      },
    }),
  ))
}

/** Stub window.location carrying the given ?search at mount. */
function stubLocationWithSearch(search: string) {
  vi.stubGlobal("location", {
    href: `http://localhost/login${search}`,
    search,
    replace: mocks.replace,
    assign: vi.fn(),
  })
}

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  mocks.replace.mockClear()
  // clean csrf cookie jar between cases (jsdom Set-Cookie semantics)
  document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT"
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("login ?redirect= — safeRedirect wall (P42-8a)", () => {
  it("honors a relative path with its query verbatim (the legit round-trip)", async () => {
    stubMeAuthenticated()
    stubLocationWithSearch("?redirect=%2Fdashboard%2Fbilling%3Ftab%3Dinvoices")

    render(<LoginPage />)

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard/billing?tab=invoices"),
    )
  })

  it("rejects the protocol-relative foreign host //evil.com → /dashboard", async () => {
    stubMeAuthenticated()
    stubLocationWithSearch("?redirect=//evil.com")

    render(<LoginPage />)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"))
    expect(mocks.replace).toHaveBeenCalledTimes(1)
  })

  it("rejects the backslash trick /\\evil.com (WHATWG-normalized //evil.com) → /dashboard", async () => {
    stubMeAuthenticated()
    stubLocationWithSearch("?redirect=%2F%5Cevil.com")

    render(<LoginPage />)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"))
  })

  it("rejects an absolute foreign URL https://evil.com/x → /dashboard", async () => {
    stubMeAuthenticated()
    stubLocationWithSearch("?redirect=https%3A%2F%2Fevil.com%2Fx")

    render(<LoginPage />)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"))
  })

  it("rejects a javascript: URI → /dashboard", async () => {
    stubMeAuthenticated()
    stubLocationWithSearch("?redirect=javascript%3Aalert(1)")

    render(<LoginPage />)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"))
  })

  it("PROOF OF SEMANTICS: WHATWG URL itself strips the tab before the path grammar — '/\\t/evil.com' resolves on the foreign origin", () => {
    // The attack mechanics, pinned live: the same parser window.location
    // uses strips ASCII tab/LF/CR from the input BEFORE applying the path
    // grammar, so '/\t/evil.com' is READ as '//evil.com' (network-path,
    // foreign host). If this assertion ever breaks, the four rejections
    // below lose their threat model — revisit the whole class.
    const u = new URL("/\t/evil.com", "https://smartbot.example")
    expect(u.origin).toBe("https://evil.com")
    // and the LF/CR twins read identically:
    expect(new URL("/\n/evil.com", "https://smartbot.example").origin).toBe("https://evil.com")
    expect(new URL("/\r/evil.com", "https://smartbot.example").origin).toBe("https://evil.com")
  })

  it("rejects '/<TAB>/evil.com' (percent-encoded %09 — the exact F-01 vector) → /dashboard", async () => {
    stubMeAuthenticated()
    stubLocationWithSearch("?redirect=/%09/evil.com")

    render(<LoginPage />)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"))
    expect(mocks.replace).toHaveBeenCalledTimes(1)
  })

  it("rejects '/<LF>/evil.com' (percent-encoded %0A) → /dashboard", async () => {
    stubMeAuthenticated()
    stubLocationWithSearch("?redirect=/%0A/evil.com")

    render(<LoginPage />)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"))
  })

  it("rejects '/<CR>/evil.com' (percent-encoded %0D) → /dashboard", async () => {
    stubMeAuthenticated()
    stubLocationWithSearch("?redirect=/%0D/evil.com")

    render(<LoginPage />)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"))
  })

  it("rejects '/<DEL>/evil.com' (percent-encoded %7F — pins the \\x7f end of the class) → /dashboard", async () => {
    stubMeAuthenticated()
    stubLocationWithSearch("?redirect=/%7F/evil.com")

    render(<LoginPage />)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"))
  })

  it("no redirect param + platform admin (tenant_id 0) lands on /admin (v10-B5)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonRes({
        success: true,
        data: {
          user: { id: 1, role: "admin", tenant_id: 0, onboardingCompleted: true },
        },
      }),
    ))
    stubLocationWithSearch("")

    render(<LoginPage />)

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"))
  })
})
