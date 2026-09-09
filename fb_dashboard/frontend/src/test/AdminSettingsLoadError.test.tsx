/**
 * v17-E-F3 — admin/settings load-failure contract pins (D1 §5.2, P2).
 *
 * Pinned behaviors:
 *   - GET /api/admin/config failure renders an IN-PAGE retryable error card
 *     (role="alert" + «إعادة المحاولة»), mirroring admin/telegram:248-255
 *     (v9-B10) — it used to be a transient toast followed by an EMPTY form
 *     that read as «nothing configured» (false negative).
 *   - The settings form is gated: no field renders until a load succeeds.
 *   - The retry button re-runs load(); success then renders the real values.
 *   - A raw network failure (TypeError — English "Failed to fetch") surfaces
 *     Arabic copy, never the English message (D9 leak guard). v17-S2
 *     (D9 «أخطر 10» #2): apiFetch now converts the rejection itself into the
 *     central Arabic ApiError («تعذر الوصول إلى الخادم…") — the page's
 *     e instanceof ApiError branch renders that instead of its generic
 *     fallback, which is MORE specific (names the actual cause).
 *   - brandedToast.error is NOT fired for load failures (the in-page state
 *     replaced the toast — no double announcement).
 *
 * Mock bundle (house pattern from TelegramSettingsToken/MessagesPage tests):
 * premium-toast spy, URL-router fetch stub, next/link anchor. No
 * QueryClientProvider — this page is plain useState/useEffect.
 */
import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AdminSettingsPage from "@/app/admin/settings/page"

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}))

vi.mock("@/lib/premium-toast", () => ({
  brandedToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
    warning: vi.fn(),
  },
}))

/* The page's back link imports next/link — the anchor keeps the module graph
 * free of app-router context requirements in jsdom. */
vi.mock("next/link", () => ({
  default: function MockLink({ href, children }: { href: string; children: ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

/** Build a real Response with a JSON body (house helper). */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const CONFIG_URL = "GET /api/admin/config" /* stubFetch routes key: `${method} ${url}` */

/** The REAL backend failure shape: FastAPI 403 carries an Arabic detail. */
function forbiddenRes(): Response {
  return jsonRes({ detail: "هذه الواجهة للمدير العام فقط" }, 403)
}

/** A real success payload (subset — the form only reads known keys). */
function configRes(): Response {
  return jsonRes({
    success: true,
    data: { bank_transfer_bank_name: "بنك الواحة" },
  })
}

function stubFetch(routes: Record<string, () => Response>) {
  const calls: { method: string; url: string; body?: string }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const method = ((init?.method ?? "GET") as string).toUpperCase()
    calls.push({ method, url: u, body: init?.body ? String(init.body) : undefined })
    const maker = routes[`${method} ${u}`]
    return maker ? maker() : jsonRes({ success: true, data: {} })
  })
  vi.stubGlobal("fetch", fn)
  return calls
}

function renderSettings(routes: Record<string, () => Response>) {
  const calls = stubFetch(routes)
  render(<AdminSettingsPage />)
  return calls
}

/**
 * jsdom matchMedia stub — D8-verified recipe (KpiCard.test.tsx). SectionHeader
 * consults prefers-reduced-motion on every mount and jsdom implements no
 * matchMedia at all, so the stub is MANDATORY or every render throws.
 * Listeners are inert no-ops (no test fires a change event).
 */
function installMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, _listener: EventListenerOrEventListenerObject) => {},
      removeEventListener: (_type: string, _listener: EventListenerOrEventListenerObject) => {},
      dispatchEvent: () => false,
    }),
  )
}

/**
 * jsdom implements no IntersectionObserver either — SectionHeader's
 * fire-once reveal trigger constructs one on mount. Inert stub: the
 * callback never fires (.reveal-shown is a cosmetic class; the header
 * content renders either way).
 */
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)
  // default: motion allowed (matches=false), like most real visitors
  installMatchMedia(false)
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  mocks.toastInfo.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("v17-E-F3 — admin/settings load failure (D1 §5.2)", () => {
  it("a failed config load renders the in-page error card with retry — and NO empty form", async () => {
    renderSettings({ [CONFIG_URL]: forbiddenRes })

    // the in-page alert card (role=alert) carries the backend's Arabic detail
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("هذه الواجهة للمدير العام فقط")
    expect(
      screen.getByRole("button", { name: "إعادة المحاولة" }),
    ).toBeInTheDocument()

    // THE §5.2 pin: the form never renders from a failed load — no false
    // «nothing configured» fields for the admin to misread
    expect(screen.queryByLabelText("اسم البنك")).toBeNull()
    expect(screen.queryByLabelText("رمز بوت تليجرام")).toBeNull()
    expect(screen.queryByLabelText("البريد الإلكتروني للدعم")).toBeNull()

    // the transient toast is GONE — the in-page state replaces it (no double
    // announcement: banner role=alert is the single live region)
    expect(mocks.toastError).not.toHaveBeenCalledWith("تعذّر تحميل الإعدادات")
  })

  it("«إعادة المحاولة» re-runs the load and the form renders on success", async () => {
    // first call fails, then the route recovers (mutable thunk)
    let route: () => Response = forbiddenRes
    const calls = renderSettings({ [CONFIG_URL]: () => route() })

    await screen.findByRole("alert")
    route = configRes
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))

    // the retry actually re-fetched the config endpoint
    await waitFor(() => {
      expect(calls.filter((c) => c.url === "/api/admin/config" && c.method === "GET").length).toBe(2)
    })

    // the form now renders WITH the server's values — not empty placeholders
    const bank = await screen.findByLabelText("اسم البنك")
    expect((bank as HTMLInputElement).value).toBe("بنك الواحة")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("a raw network failure surfaces the central Arabic network copy — never the English error", async () => {
    // fetch itself rejects (offline) — v17-S2 (D9 «أخطر 10» #2): apiFetch
    // converts the rejection into the central Arabic ApiError instead of
    // letting the browser's English TypeError reach any caller
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    }))
    render(<AdminSettingsPage />)

    const alert = await screen.findByRole("alert")
    // the central network message (page's ApiError branch — specific, Arabic)
    expect(alert).toHaveTextContent("تعذر الوصول إلى الخادم — تحقق من اتصالك بالإنترنت")
    // the English browser message must NOT leak into the UI (D9 contract)
    expect(alert).not.toHaveTextContent(/Failed to fetch/)
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument()
  })
})
