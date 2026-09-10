/**
 * v22-D2 (W2-FIN) — WebhookHealthBanner contract pins.
 *
 * The W1-D2 silence problem: pages answer «متصل» while the FB webhook
 * subscription is dead (subscribed_apps=[] / 403 #200) — every real-time
 * feature (messages, comments, feed events) is OFF and the dashboard says
 * nothing. FIX-F persisted the verdict (BotState fb_webhook_subscribed,
 * exposed by GET /api/facebook/settings); this is its UI surface.
 *
 * Pinned behaviors:
 *   - connected + webhook_subscribed === false → the loud Arabic banner
 *     (title, missing-permission detail, CTA routing to /connect)
 *   - webhook_subscribed === null (never probed) → NO banner — unknown is
 *     NOT false (the backend's v22-D2 contract: only a probed-and-negative
 *     verdict may paint the banner)
 *   - not connected → NO banner (that state belongs to SetupWarnings)
 *   - fetch failure / non-success envelope → NO banner (never a false alarm)
 *   - NOT dismissible: no dismiss button, no sessionStorage key — a health
 *     signal disappears only when the subscription is actually fixed
 *
 * Mock bundle (house pattern from OnboardingWizard/MessagesPage tests):
 * next/navigation router spy + vi.stubGlobal(fetch).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { WebhookHealthBanner } from "@/components/shared/WebhookHealthBanner"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
}))

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function stubFetch(routes: Record<string, () => Response>) {
  const calls: { method: string; url: string }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const method = ((init?.method ?? "GET") as string).toUpperCase()
    calls.push({ method, url: u })
    const maker = routes[`${method} ${u}`]
    return maker ? maker() : jsonRes({ success: true, data: {} })
  })
  vi.stubGlobal("fetch", fn)
  return { calls }
}

const SETTINGS_ROUTE = "GET /api/facebook/settings"

function renderBanner() {
  return render(<WebhookHealthBanner />)
}

beforeEach(() => {
  mocks.push.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("connected-but-unsubscribed → loud banner", () => {
  it("renders the title, the missing permission, and routes the CTA to /connect", async () => {
    stubFetch({
      [SETTINGS_ROUTE]: () =>
        jsonRes({
          success: true,
          data: {
            page_id: "1235690416285843",
            has_token: true,
            connected: true,
            page_name: "Smart Link-الربط الذكي",
            webhook_subscribed: false,
            webhook_state: {
              ts: 1789049000,
              subscribed: false,
              fields: [],
              error: "http_403",
              missing: ["pages_manage_metadata"],
              source: "heartbeat",
            },
          },
        }),
    })
    renderBanner()

    // the loud honest-state title (the W1-D2 verdict, verbatim)
    expect(
      await screen.findByText("متصل لكن الويبهوك غير مفعل — الرسائل والتعليقات اللحظية معطلة"),
    ).toBeInTheDocument()
    // the REAL cause (403 #200 = missing permission) surfaces verbatim
    expect(screen.getByText(/pages_manage_metadata/)).toBeInTheDocument()
    expect(screen.getByText(/developers\.facebook\.com/)).toBeInTheDocument()

    // the CTA routes to the connect page (the fix path)
    fireEvent.click(screen.getByRole("button", { name: /إصلاح الربط/ }))
    expect(mocks.push).toHaveBeenCalledWith("/connect")
  })

  it("joins multiple missing permissions with an Arabic comma", async () => {
    stubFetch({
      [SETTINGS_ROUTE]: () =>
        jsonRes({
          success: true,
          data: {
            connected: true,
            webhook_subscribed: false,
            webhook_state: {
              subscribed: false,
              missing: ["pages_manage_metadata", "pages_read_engagement"],
            },
          },
        }),
    })
    renderBanner()

    expect(
      await screen.findByText(/pages_manage_metadata، pages_read_engagement/),
    ).toBeInTheDocument()
  })
})

describe("unknown ≠ false — only a probed-and-negative verdict paints the banner", () => {
  it("webhook_subscribed === null (never probed) → NO banner", async () => {
    stubFetch({
      [SETTINGS_ROUTE]: () =>
        jsonRes({
          success: true,
          data: { connected: true, webhook_subscribed: null, webhook_state: null },
        }),
    })
    renderBanner()
    await waitFor(() =>
      expect(screen.queryByRole("alert")).toBeNull(),
    )
  })
})

describe("states the banner must NOT paint", () => {
  it("not connected → no banner (that state belongs to SetupWarnings)", async () => {
    stubFetch({
      [SETTINGS_ROUTE]: () =>
        jsonRes({
          success: true,
          data: { connected: false, webhook_subscribed: false },
        }),
    })
    renderBanner()
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })

  it("healthy (subscribed) → no banner", async () => {
    stubFetch({
      [SETTINGS_ROUTE]: () =>
        jsonRes({
          success: true,
          data: { connected: true, webhook_subscribed: true },
        }),
    })
    renderBanner()
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })

  it("fetch failure → no banner (never a false alarm)", async () => {
    stubFetch({
      [SETTINGS_ROUTE]: () => jsonRes({ detail: "انتهت الجلسة" }, 401),
    })
    renderBanner()
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })

  it("non-success envelope → no banner", async () => {
    stubFetch({
      [SETTINGS_ROUTE]: () => jsonRes({ success: false, error: "boom" }),
    })
    renderBanner()
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
  })
})

describe("not dismissible (health signal)", () => {
  it("renders no dismiss control and writes no session key — it hides only when fixed", async () => {
    stubFetch({
      [SETTINGS_ROUTE]: () =>
        jsonRes({
          success: true,
          data: { connected: true, webhook_subscribed: false, webhook_state: { missing: [] } },
        }),
    })
    renderBanner()

    await screen.findByRole("alert")
    // no X / dismiss affordance of any kind (unlike SetupWarnings)
    expect(screen.queryByRole("button", { name: /إخفاء|إغلاق|dismiss/i })).toBeNull()
    expect(screen.queryByLabelText(/إخفاء/)).toBeNull()
    // the only button is the fix CTA
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(sessionStorage.length).toBe(0)
  })
})
