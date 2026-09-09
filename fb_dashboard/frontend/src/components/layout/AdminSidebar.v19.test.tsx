/**
 * v19 — AdminSidebar + the ads page DB-first envelope (the two visible
 * halves of the live round, pinned together because they share the mock
 * bundle).
 *
 * AdminSidebar pins:
 *   - the «اشتراك» CTA renders ONLY while onSubscribe is truthy —
 *     DashboardShell now computes `subLoading || !hasActiveSubscription ?
 *     handleSubscribe : undefined`, so a subscribed tenant's sidebar loses
 *     the dead upsell button (and pending-payment users keep it)
 *   - ThemeToggle mounts in the sidebar bottom (v19 Step 3 — the switcher
 *     used to vanish right after login). next-themes is mocked with the
 *     ThemeToggle.test.tsx recipe; RTL's act-flushed render flips the
 *     `mounted` gate so the real button (aria-label) is observable.
 *
 * Ads page pins (v19 Step 2 — unwrapApi<AdsAccountsResponse>
 * {items, source, synced}): synced=false + empty items → the honest
 * «فشل الاتصال بفيسبوك» error (NOT the old lying «لا توجد حسابات» state);
 * synced=true + empty → the plain empty state; synced=false + stored rows →
 * the rows render WITH the «يتم عرض آخر بيانات محفوظة» warning banner.
 *
 * Mock bundle (house pattern — MessagesPage/comments-page): a fresh
 * QueryClient per render, @/lib/csrf-client apiFetch, next/navigation
 * usePathname, next/image anchors. PageHeader/Card/EmptyState/lucide and
 * @/lib/format are real.
 */
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AdminSidebar } from "./AdminSidebar"
import AdsPage from "@/app/dashboard/ads/page"
import type { AdsAccountsResponse } from "@/lib/types"

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: (): string => "/dashboard",
}))

/* next-themes — the documented ThemeToggle.test.tsx recipe: the real
 * ThemeProvider never mounts in render-only tests. resolvedTheme "dark" →
 * the toggle carries the "switch to day mode" Arabic aria-label. */
vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn(), resolvedTheme: "dark", themes: [] as string[] }),
}))

/* @/lib/api (unwrapApi, used by the ads page's queryFn) imports ApiError
 * from ./csrf-client — the partial mock keeps the class so that import
 * binding survives. */
vi.mock("@/lib/csrf-client", () => {
  class ApiError extends Error {
    constructor(public status: number, public body: unknown) {
      super(`فشل الطلب (${status})`)
    }
  }
  return { ApiError, apiFetch: mocks.apiFetch }
})

/* next/image anchors (MessagesPage house pattern) — the sidebar logo stays
 * a plain <img>, keeping the module graph free of app-router context. */
vi.mock("next/image", () => ({
  default: function MockImage({ alt, src }: { alt: string; src: string }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />
  },
}))

/* ---------- harnesses ---------- */

/** AdminSidebar itself never queries (DashboardShell owns react-query via
 * useSubscriptionStatus) — the fresh-client wrapper just mirrors its real
 * mount context; the component only needs its props. */
function renderSidebar(props: { onSubscribe?: () => void } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AdminSidebar onNavigate={vi.fn()} onLogout={vi.fn()} {...props} />
    </QueryClientProvider>,
  )
}

function renderAds() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AdsPage />
    </QueryClientProvider>,
  )
}

/** /api/ads/accounts success envelope as the page's queryFn consumes it. */
function adsRes(data: AdsAccountsResponse) {
  return { ok: true, json: async () => ({ success: true, data }) }
}

beforeEach(() => {
  mocks.apiFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/* ---------- AdminSidebar (v19 Step 1 + Step 3) ---------- */

describe("AdminSidebar «اشتراك» CTA gate (v19)", () => {
  it("renders the «اشتراك» button when onSubscribe is provided (truthy)", () => {
    renderSidebar({ onSubscribe: vi.fn() })

    expect(screen.getByRole("button", { name: /اشتراك/ })).toBeInTheDocument()
  })

  it("hides the «اشتراك» button when onSubscribe is undefined", () => {
    renderSidebar()

    expect(screen.queryByRole("button", { name: /اشتراك/ })).toBeNull()
  })

  it("mounts ThemeToggle in the bottom bar beside logout (v19 Step 3)", () => {
    renderSidebar({ onSubscribe: vi.fn() })

    // the theme toggle button with its Arabic mode aria-label
    expect(
      screen.getByRole("button", { name: /الوضع النهاري|الوضع الليلي/ }),
    ).toBeInTheDocument()
    // and it sits next to the logout button, not instead of it
    expect(screen.getByRole("button", { name: "تسجيل الخروج" })).toBeInTheDocument()
  })
})

/* ---------- ads page (v19 Step 2 — DB-first envelope) ---------- */

describe("ads page v19 DB-first envelope states", () => {
  it("synced=false + empty items → the honest «فشل الاتصال بفيسبوك» error state", async () => {
    mocks.apiFetch.mockResolvedValue(adsRes({ items: [], source: "db", synced: false }))
    renderAds()

    expect(await screen.findByText("فشل الاتصال بفيسبوك")).toBeInTheDocument()
    // a way out is offered — retry refetches the envelope
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument()
    // NOT the old lying empty state
    expect(screen.queryByText("لا توجد حسابات إعلانية مرتبطة")).toBeNull()
  })

  it("synced=true + empty items → the plain «لا توجد حسابات» empty state", async () => {
    mocks.apiFetch.mockResolvedValue(adsRes({ items: [], source: "db", synced: true }))
    renderAds()

    expect(await screen.findByText("لا توجد حسابات إعلانية مرتبطة")).toBeInTheDocument()
    // a healthy empty is neither an error nor a staleness warning
    expect(screen.queryByText("فشل الاتصال بفيسبوك")).toBeNull()
    expect(screen.queryByText(/يتم عرض آخر بيانات محفوظة/)).toBeNull()
  })

  it("synced=false + stored rows → the rows render WITH the «آخر بيانات محفوظة» warning", async () => {
    mocks.apiFetch.mockResolvedValue(
      adsRes({
        items: [{ id: "act_1", name: "Main", account_status: 1, currency: "USD" }],
        source: "db",
        synced: false,
      }),
    )
    renderAds()

    expect(await screen.findByText("Main")).toBeInTheDocument()
    // stale-but-honest: the warning banner says the refresh failed
    expect(screen.getByText(/يتم عرض آخر بيانات محفوظة/)).toBeInTheDocument()
    // the row really rendered (status badge + currency line)
    expect(screen.getByText("نشطة")).toBeInTheDocument()
    expect(screen.getByText("العملة: USD")).toBeInTheDocument()
    // …but no hard error — serving stored rows beats a lying failure state
    expect(screen.queryByText("فشل الاتصال بفيسبوك")).toBeNull()
  })
})
