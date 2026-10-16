/**
 * P18-W4-b — the ads page campaign surface (API-contract-verified).
 *
 * The backend exposes exactly THREE ads routes, ALL GET (facebook_routes.py:
 * 1187-1275): /api/ads/accounts, /api/ads/campaigns/{id}, /api/ads/ads/{id}.
 * There is NO create-campaign POST and NO pause/resume PATCH anywhere in
 * fb_dashboard/ (no route, no fb_client write method, no MCP ads tool) —
 * so this spec pins the REAL read surface and the HONEST absence of
 * management controls:
 *
 *   - «حملات الحساب» expands the account row → GET /api/ads/campaigns/{id}
 *     answers {items, source, synced} with the RAW Graph campaign dicts
 *     (status/objective/created_time + the nested adsets edge) — the row
 *     renders the Arabic status chip, the objective label, the created date
 *     and the summed adset budgets (Graph minor units → currency display).
 *   - the ads section consumes GET /api/ads/ads/{id} — the RAW Graph ad
 *     dicts with insights{impressions, clicks, spend, ctr, cpc} — and
 *     renders the five REAL metric cells (no fabricated fields).
 *   - a campaign WITHOUT insights data shows the honest «لا تتوفر مؤشرات»
 *     line — never zero-fabricated metrics.
 *   - no «إنشاء حملة» / «إيقاف» / «تشغيل» controls exist anywhere on the
 *     page (the documented management gap — read-only by backend truth).
 *
 * Mock bundle (house pattern — AdminSidebar.v19.test): a fresh QueryClient,
 * @/lib/csrf-client apiFetch mock (ApiError class preserved), URL-routed
 * responses per endpoint.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AdsPage from "@/app/dashboard/ads/page"
import type { AdsAccountsResponse, AdCampaign, AdItem } from "@/lib/types"

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}))

/* @/lib/api (unwrapApi, used by the page's queryFn) imports ApiError from
 * ./csrf-client — the partial mock keeps the class so that import binding
 * survives (AdminSidebar.v19.test recipe). */
vi.mock("@/lib/csrf-client", () => {
  class ApiError extends Error {
    constructor(public status: number, public body: unknown) {
      super(`تعذّر الطلب (${status})`)
    }
  }
  return { ApiError, apiFetch: mocks.apiFetch }
})

/* ---------- harnesses ---------- */

function jsonRes(data: unknown) {
  return { ok: true, json: async () => ({ success: true, data }) }
}

/** The raw Graph campaign dict the campaigns endpoint re-serves (payload_json). */
const CAMPAIGN_FIXTURE: AdCampaign = {
  id: "2385123",
  name: "حملة الصيف",
  status: "ACTIVE",
  objective: "OUTCOMES_ENGAGEMENT",
  created_time: "2026-08-01T10:30:00+0000",
  /* Graph nested-edge wrapper: adsets come back as {data: [...]}. */
  adsets: {
    data: [
      {
        id: "s1", name: "مجموعة 1", status: "ACTIVE",
        daily_budget: "5000", lifetime_budget: "150000",
        start_time: "2026-08-01", end_time: "2026-08-31",
      },
      { id: "s2", name: "مجموعة 2", status: "PAUSED", daily_budget: "2500" },
    ],
  },
}

/** The raw Graph ad dict the ads endpoint re-serves (insights nested edge). */
const AD_WITH_INSIGHTS: AdItem = {
  id: "ad-1", name: "إعلان ترويجي", status: "ACTIVE",
  adset_id: "s1", campaign_id: "2385123",
  creative: { id: "c1", title: "خصم الصيف", body: "خصومات كبيرة", image_url: "https://example.com/i.png" },
  insights: { data: [{ impressions: "4839", clicks: "36", spend: "3.59", ctr: "0.74", cpc: "0.09" }] },
}

/** An ad with NO insights row — the honest no-metrics line (never zeros). */
const AD_WITHOUT_INSIGHTS: AdItem = {
  id: "ad-2", name: "إعلان تجريبي", status: "PAUSED",
  adset_id: "s2", campaign_id: "2385123",
}

const ACCOUNTS: AdsAccountsResponse = {
  items: [{ id: "act_101", name: "حساب المتجر", account_status: 1, currency: "USD", amount_spent: "1200", balance: "50" }],
  source: "db",
  synced: true,
}

function stubAdsRoutes(routes: {
  accounts?: () => ReturnType<typeof jsonRes>
  campaigns?: () => ReturnType<typeof jsonRes>
  ads?: () => ReturnType<typeof jsonRes>
} = {}) {
  mocks.apiFetch.mockImplementation(async (url: string) => {
    if (url === "/api/ads/accounts") return (routes.accounts ?? (() => jsonRes(ACCOUNTS)))()
    if (url === "/api/ads/campaigns/act_101") return (routes.campaigns ?? (() => jsonRes(AD_LIST())))()
    if (url === "/api/ads/ads/act_101") return (routes.ads ?? (() => jsonRes(ITEMS_LIST())))()
    return { ok: false, status: 404, json: async () => ({ detail: "غير موجود" }) }
  })
}

function AD_LIST(items: AdCampaign[] = [CAMPAIGN_FIXTURE]) {
  return { items, source: "db", synced: true }
}

function ITEMS_LIST(items: AdItem[] = [AD_WITH_INSIGHTS, AD_WITHOUT_INSIGHTS]) {
  return { items, source: "db", synced: true }
}

function renderAds() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AdsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mocks.apiFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/* ---------- the campaign/ads read surface ---------- */

describe("ads page — the account expands into its campaigns (P18-W4-b)", () => {
  it("«حملات الحساب» fetches GET /api/ads/campaigns/{id} and renders the REAL Graph row fields", async () => {
    const calls: string[] = []
    mocks.apiFetch.mockImplementation(async (url: string) => {
      calls.push(url)
      if (url === "/api/ads/accounts") return jsonRes(ACCOUNTS)
      if (url === "/api/ads/campaigns/act_101") return jsonRes(AD_LIST())
      if (url === "/api/ads/ads/act_101") return jsonRes(ITEMS_LIST())
      return { ok: false, status: 404, json: async () => ({ detail: "غير موجود" }) }
    })
    renderAds()

    // nothing is fetched beyond the account list until the row expands
    await screen.findByText("حساب المتجر")
    expect(calls).toEqual(["/api/ads/accounts"])

    fireEvent.click(screen.getByRole("button", { name: "حملات الحساب" }))
    expect(await screen.findByText("حملة الصيف")).toBeInTheDocument()
    expect(calls).toContain("/api/ads/campaigns/act_101")
    expect(calls).toContain("/api/ads/ads/act_101")

    // the campaign card: Arabic status chips (Graph ACTIVE — the account
    // row badge, the campaign badge AND the ad row badge all show نشطة)
    // + objective label (OUTCOMES_ENGAGEMENT → تفاعل) + adset count + budgets
    expect(screen.getAllByText("نشطة")).toHaveLength(3)
    expect(screen.getByText("الهدف: تفاعل")).toBeInTheDocument()
    // 2 adsets → dual phrase; budgets: (5000 + 2500) cents = 75 USD daily,
    // 150000 cents = 1.500 USD lifetime (Graph minor units, account currency)
    expect(screen.getByText("مجموعتان إعلانيتان")).toBeInTheDocument()
    expect(screen.getByText(/ميزانية يومية:/)).toHaveTextContent("75 USD")
    expect(screen.getByText(/ميزانية إجمالية:/)).toHaveTextContent("1.500 USD")
  })

  it("the ads section renders the REAL insights metrics (impressions/clicks/spend/ctr/cpc) — ar-LY formatted", async () => {
    stubAdsRoutes()
    renderAds()

    fireEvent.click(await screen.findByRole("button", { name: "حملات الحساب" }))

    expect(await screen.findByText("إعلان ترويجي")).toBeInTheDocument()
    expect(screen.getByText("مرات الظهور")).toBeInTheDocument()
    expect(screen.getByText("4.839")).toBeInTheDocument() // formatNumber("4839")
    expect(screen.getByText("36")).toBeInTheDocument() // clicks
    // spend 3.59 + cpc 0.09 carry the account currency; ctr renders with %
    expect(screen.getByText("3,59 USD")).toBeInTheDocument()
    expect(screen.getByText("0,74%")).toBeInTheDocument()
    expect(screen.getByText("0,09 USD")).toBeInTheDocument()
    // the creative title the Graph creative field-object carries
    expect(screen.getByText("النص الإبداعي: خصم الصيف")).toBeInTheDocument()

    // an ad with NO insights row → the honest line, never zero-fabricated cells
    expect(screen.getByText("إعلان تجريبي")).toBeInTheDocument()
    expect(screen.getByText("لا تتوفر مؤشرات أداء لهذا الإعلان بعد.")).toBeInTheDocument()
  })

  it("an account with no campaigns shows the campaign empty state (not an error)", async () => {
    stubAdsRoutes({
      campaigns: () => jsonRes(AD_LIST([])),
      ads: () => jsonRes(ITEMS_LIST([])),
    })
    renderAds()

    fireEvent.click(await screen.findByRole("button", { name: "حملات الحساب" }))

    expect(await screen.findByText("لا توجد حملات في هذا الحساب")).toBeInTheDocument()
    expect(screen.getByText("لا توجد إعلانات في هذا الحساب")).toBeInTheDocument()
  })

  it("NO management controls exist (create/pause/resume) — the backend has no write endpoints", async () => {
    stubAdsRoutes()
    renderAds()

    fireEvent.click(await screen.findByRole("button", { name: "حملات الحساب" }))
    await screen.findByText("حملة الصيف")

    // the documented gap: read-only surface — no fabricated controls
    expect(screen.queryByRole("button", { name: /إنشاء/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /إيقاف/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /تشغيل|استئناف/ })).toBeNull()
    expect(screen.queryByRole("switch")).toBeNull()
    // and the honest notice explains WHY (ads_management + app review)
    expect(screen.getByText("عرض الحملات فعّال — التحكم بها قريباً")).toBeInTheDocument()
  })

  it("collapsing the account unmounts the detail; re-expanding re-renders from cache", async () => {
    stubAdsRoutes()
    renderAds()

    fireEvent.click(await screen.findByRole("button", { name: "حملات الحساب" }))
    expect(await screen.findByText("حملة الصيف")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "إخفاء الحملات" }))
    expect(screen.queryByText("حملة الصيف")).toBeNull()
    expect(screen.getByRole("button", { name: "حملات الحساب" })).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(screen.getByRole("button", { name: "حملات الحساب" }))
    expect(await screen.findByText("حملة الصيف")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "إخفاء الحملات" })).toHaveAttribute("aria-expanded", "true")
  })

  it("a failing campaigns fetch shows the retry state (state family) and recovers", async () => {
    /* the page rides the house retry: 1 — the first failure is retried
     * once, so the mock must fail TWICE before the error state renders
     * (the third call, from the retry button, succeeds). */
    let failuresLeft = 2
    mocks.apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/ads/accounts") return jsonRes(ACCOUNTS)
      if (url === "/api/ads/campaigns/act_101") {
        if (failuresLeft > 0) {
          failuresLeft -= 1
          return { ok: false, status: 502, json: async () => ({ detail: "تعذّر الوصول" }) }
        }
        return jsonRes(AD_LIST())
      }
      if (url === "/api/ads/ads/act_101") return jsonRes(ITEMS_LIST())
      return { ok: false, status: 404, json: async () => ({ detail: "غير موجود" }) }
    })
    renderAds()

    fireEvent.click(await screen.findByRole("button", { name: "حملات الحساب" }))
    /* retry: 1 rides react-query's default exponential backoff (~1s before
     * the second attempt) — the error state lands past the default 1s
     * findByText clock, so widen the window. */
    expect(await screen.findByText("تعذّر تحميل الحملات", {}, { timeout: 4000 })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }))
    await waitFor(() => expect(screen.getByText("حملة الصيف")).toBeInTheDocument())
  })
})
