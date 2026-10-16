/**
 * P18-W4-b — the settings page sections beyond profile+password.
 *
 * Pins the three REAL surfaces (API-contract-verified — nothing faked):
 *   - تفضيلات الإشعارات: GET/PUT /api/notifications/settings (alerts_routes
 *     .py:88-131) — the 6-key preference schema, the same ["notification-settings"]
 *     query key as the notifications page (shared cache), Switch role=switch
 *     toggles, and the PUT body {preferences: {...}} contract.
 *   - حالة الويبهوك: GET /api/webhook/check (webhooks.py:57-120) — the
 *     callback URL (mono), the subscribed verdict, the messages/feed field
 *     badges, and the repair links to /connect + /dashboard/pages.
 *   - اللغة والاتجاه: display-only (Arabic RTL-first by design — no
 *     language endpoint exists, so no fake selector is rendered).
 *
 * Mock bundle (house pattern — SettingsChangePassword.test): QueryClient
 * provider, premium-toast spy, URL-router fetch stub (STATEFUL preferences —
 * the PUT mutates the store so the post-toggle refetch serves the new state).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import SettingsPage from "@/app/dashboard/settings/page"

/* P18-W4-b: the webhook card links to /connect + /dashboard/pages via
 * next/link — the anchor mock keeps the module graph free of app-router
 * context requirements in jsdom (house recipe, billing test twin). */
vi.mock("next/link", () => ({
  default: function MockLink({ href, children }: { href: string; children: ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

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

/** Build a real Response with a JSON body. */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

interface RecordedCall {
  method: string
  url: string
  body?: string
}

const ME_USER = {
  id: 1, username: "aziz", role: "admin", email: "aziz@test.ly",
}

const WEBHOOK_OK = {
  configured: true,
  secret_source: "db",
  verify_token: "***",
  webhook_url: "https://api.smart-link.ly/webhook",
  subscribed_fields: ["feed", "messages"],
  subscribed: true,
  subscribe_error: "",
  messages_field_subscribed: true,
  feed_field_subscribed: true,
  instructions: [],
}

/** STATEFUL preferences store — the PUT mutates it (the real backend upserts). */
function makePrefStore(initial: Record<string, boolean>) {
  const store = { ...initial }
  const calls: RecordedCall[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const method = ((init?.method ?? "GET") as string).toUpperCase()
    calls.push({ method, url: u, body: init?.body ? String(init.body) : undefined })
    if (u === "/api/me") return jsonRes({ success: true, data: { user: ME_USER } })
    if (u === "/api/notifications/settings" && method === "GET") {
      return jsonRes({ success: true, data: { preferences: { ...store } } })
    }
    if (u === "/api/notifications/settings" && method === "PUT") {
      const prefsIn = JSON.parse(String(init?.body)).preferences as Record<string, boolean>
      Object.assign(store, prefsIn)
      return jsonRes({ success: true, data: { preferences: { ...store } } })
    }
    if (u === "/api/webhook/check") return jsonRes({ success: true, data: WEBHOOK_OK })
    return jsonRes({ success: true, data: {} })
  })
  return { fn, calls, store }
}

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SettingsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.toastSuccess.mockClear()
  mocks.toastError.mockClear()
  mocks.replace.mockClear()
  vi.stubGlobal("location", {
    pathname: "/dashboard/settings",
    search: "",
    href: "http://localhost/dashboard/settings",
    replace: mocks.replace,
    assign: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("settings — notification preferences (GET/PUT /api/notifications/settings)", () => {
  const SAVED = {
    new_comments: false,
    new_messages: true,
    new_leads: true,
    payment_alerts: true,
    system_updates: true,
    marketing_reports: false,
  }

  it("renders the 6-key schema through Switch rows (saved state honored)", async () => {
    vi.stubGlobal("fetch", makePrefStore(SAVED).fn)
    renderSettings()

    await screen.findByText("تفضيلات الإشعارات")
    const off = screen.getByRole("switch", { name: "تعليقات جديدة — معطّل" })
    expect(off).toHaveAttribute("aria-checked", "false")
    expect(screen.getByRole("switch", { name: "رسائل جديدة — مفعّل" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("switch", { name: "تقارير التسويق — معطّل" })).toHaveAttribute("aria-checked", "false")
    // all six keys of the backend schema render
    expect(screen.getByRole("switch", { name: "عملاء متوقعون جدد — مفعّل" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "إشعارات الدفع — مفعّل" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "تحديثات النظام — مفعّل" })).toBeInTheDocument()
  })

  it("a toggle PUTs {preferences} with the flipped key and refetches the saved state", async () => {
    const state = makePrefStore(SAVED)
    vi.stubGlobal("fetch", state.fn)
    renderSettings()

    await screen.findByText("تفضيلات الإشعارات")
    fireEvent.click(screen.getByRole("switch", { name: "تعليقات جديدة — معطّل" }))

    // the mutation chain (act-flush + apiFetch awaits) needs waitFor
    await waitFor(() => {
      const puts = state.calls.filter((c) => c.url === "/api/notifications/settings" && c.method === "PUT")
      expect(puts).toHaveLength(1)
      // the exact backend contract: {preferences: {…6 keys, new_comments: true}}
      expect(JSON.parse(String(puts[0].body))).toEqual({
        preferences: { ...SAVED, new_comments: true },
      })
    })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("تم حفظ تفضيلات الإشعارات"))
    // the invalidate → refetch serves the upserted state (stateful store)
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "تعليقات جديدة — مفعّل" })).toHaveAttribute("aria-checked", "true"),
    )
  })

  it("a failing PUT surfaces the backend's Arabic detail (the ApiError contract)", async () => {
    const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      const method = ((init?.method ?? "GET") as string).toUpperCase()
      if (u === "/api/me") return jsonRes({ success: true, data: { user: ME_USER } })
      if (u === "/api/notifications/settings" && method === "GET") {
        return jsonRes({ success: true, data: { preferences: { ...SAVED } } })
      }
      if (u === "/api/notifications/settings" && method === "PUT") {
        return jsonRes({ detail: "تعذّر الحفظ الآن — حاول لاحقاً" }, 500)
      }
      if (u === "/api/webhook/check") return jsonRes({ success: true, data: WEBHOOK_OK })
      return jsonRes({ success: true, data: {} })
    })
    vi.stubGlobal("fetch", fn)
    renderSettings()

    await screen.findByText("تفضيلات الإشعارات")
    fireEvent.click(screen.getByRole("switch", { name: "تعليقات جديدة — معطّل" }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("تعذّر الحفظ الآن — حاول لاحقاً"))
  })
})

describe("settings — webhook health display (GET /api/webhook/check, read-only)", () => {
  it("shows the subscribed verdict, the mono callback URL and the field badges", async () => {
    vi.stubGlobal("fetch", makePrefStore({}).fn)
    renderSettings()

    await screen.findByText("حالة الويبهوك")
    expect(screen.getByText("اشتراك الأحداث")).toBeInTheDocument()
    expect(screen.getByText("مشترك")).toBeInTheDocument()
    // the callback URL rides the mono machine register (dir=ltr)
    expect(screen.getByText("https://api.smart-link.ly/webhook")).toBeInTheDocument()
    // the two fields the automation depends on
    expect(screen.getByText("الرسائل")).toBeInTheDocument()
    expect(screen.getByText("التعليقات")).toBeInTheDocument()
    // the repair surface stays on /connect (+ the pages twin) — linked, not duplicated
    expect(screen.getByRole("link", { name: "إدارة الربط وإعادة الاشتراك" })).toHaveAttribute("href", "/connect")
    expect(screen.getByRole("link", { name: "إعدادات الصفحة" })).toHaveAttribute("href", "/dashboard/pages")
  })

  it("an unsubscribed webhook shows the warning verdict (honest, not a green lie)", async () => {
    const fn = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u === "/api/me") return jsonRes({ success: true, data: { user: ME_USER } })
      if (u === "/api/notifications/settings") {
        return jsonRes({ success: true, data: { preferences: {} } })
      }
      if (u === "/api/webhook/check") {
        return jsonRes({
          success: true,
          data: { ...WEBHOOK_OK, subscribed: false, subscribed_fields: [], messages_field_subscribed: false, feed_field_subscribed: false },
        })
      }
      return jsonRes({ success: true, data: {} })
    })
    vi.stubGlobal("fetch", fn)
    renderSettings()

    await screen.findByText("حالة الويبهوك")
    expect(screen.getByText("غير مشترك")).toBeInTheDocument()
    expect(screen.getByText("الرسائل (غير مشترك)")).toBeInTheDocument()
    expect(screen.getByText("التعليقات (غير مشترك)")).toBeInTheDocument()
  })
})

describe("settings — language & direction (display-only, no fake selector)", () => {
  it("shows Arabic + RTL without rendering a language switcher (no endpoint exists)", async () => {
    vi.stubGlobal("fetch", makePrefStore({}).fn)
    renderSettings()

    await screen.findByText("اللغة والاتجاه")
    expect(screen.getByText("العربية")).toBeInTheDocument()
    expect(screen.getByText("من اليمين إلى اليسار (RTL)")).toBeInTheDocument()
    // honesty: no language select/switch — the backend has no such endpoint
    expect(screen.queryByRole("switch", { name: /اللغة/ })).toBeNull()
    expect(screen.queryByRole("combobox")).toBeNull()
  })
})
