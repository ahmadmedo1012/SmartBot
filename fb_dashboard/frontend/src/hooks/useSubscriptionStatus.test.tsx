/**
 * v19 Step 1 — useSubscriptionStatus contract (the ONE central /api/me derivation).
 *
 * The v19 live round proved the plan-name field /api/me already returned was
 * consumed by NOTHING: the sidebar «اشتراك» CTA rendered unconditionally and
 * the payment endpoints accepted duplicate requests from already-subscribed
 * tenants. DashboardShell now gates the CTA on this hook's output
 * (`subLoading || !hasActiveSubscription ? handleSubscribe : undefined`),
 * so these three pins ARE the sidebar CTA contract:
 *   - inactive tenant → state "inactive" + hasActiveSubscription false +
 *     plan "free" (the shell keeps onSubscribe defined → CTA renders)
 *   - active tenant → state "active" + hasActiveSubscription true +
 *     planEnd surfaces (the shell passes undefined → the dead upsell vanishes)
 *   - pending /api/me → isLoading true + state "unknown" with safe defaults
 *     (the shell deliberately keeps the CTA visible to avoid a hide-flash)
 *
 * Mock bundle (house patterns): next/navigation usePathname (the hook's
 * pathname-driven refetch), @/lib/csrf-client apiFetch answering the envelope
 * shape unwrapApi consumes ({ok, json}), and a fresh QueryClient per test —
 * staleTime 0 mirrors the hook's own "always fresh on mount" contract.
 * The probe harness writes hook values into data-testid spans, exactly like
 * useCountUp.test.tsx.
 */
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useSubscriptionStatus } from "./useSubscriptionStatus"
import type { SubscriptionStatus } from "./useSubscriptionStatus"

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: (): string => "/dashboard",
}))

/* @/lib/api (unwrapApi, used by the hook's queryFn) imports ApiError from
 * ./csrf-client — the partial mock keeps the class so that import binding
 * survives. The envelope shape is answered via .json(), never a real fetch. */
vi.mock("@/lib/csrf-client", () => {
  class ApiError extends Error {
    constructor(public status: number, public body: unknown) {
      super(`فشل الطلب (${status})`)
    }
  }
  return { ApiError, apiFetch: mocks.apiFetch }
})

/** /api/me success envelope as apiFetch's queryFn consumes it. */
function meRes(user: Record<string, unknown>) {
  return { ok: true, json: async () => ({ success: true, data: { user } }) }
}

/* ---------- probe ---------- */

function Probe() {
  const s: SubscriptionStatus = useSubscriptionStatus()
  return (
    <div>
      <span data-testid="plan">{s.plan}</span>
      <span data-testid="state">{s.state}</span>
      <span data-testid="active">{String(s.hasActiveSubscription)}</span>
      <span data-testid="pending">{String(s.hasPendingSubscription)}</span>
      <span data-testid="planEnd">{s.planEnd ?? ""}</span>
      <span data-testid="loading">{String(s.isLoading)}</span>
    </div>
  )
}

const read = (id: string) => screen.getByTestId(id).textContent

function renderProbe() {
  // fresh client per test (comments-page house harness); staleTime 0 mirrors
  // the hook's own refetchOnMount:"always" freshness contract
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  return render(
    <QueryClientProvider client={qc}>
      <Probe />
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

/* ---------- contract ---------- */

describe("useSubscriptionStatus", () => {
  it('inactive tenant → state "inactive", flags false, plan "free"', async () => {
    mocks.apiFetch.mockResolvedValue(
      meRes({
        id: 1,
        username: "sara",
        subscriptionStatus: "free",
        subscriptionState: "inactive",
        hasActiveSubscription: false,
        hasPendingSubscription: false,
        subscriptionPlanEnd: null,
      }),
    )
    renderProbe()

    await waitFor(() => expect(read("state")).toBe("inactive"))
    expect(read("plan")).toBe("free")
    expect(read("active")).toBe("false")
    expect(read("pending")).toBe("false")
    expect(read("planEnd")).toBe("")
    expect(read("loading")).toBe("false")
    // the ONE /api/me read the shell's CTA gate depends on
    expect(mocks.apiFetch).toHaveBeenCalledWith("/api/me")
  })

  it('active tenant → state "active", flags true, planEnd surfaces', async () => {
    mocks.apiFetch.mockResolvedValue(
      meRes({
        id: 1,
        username: "ahmed",
        subscriptionStatus: "pro",
        subscriptionState: "active",
        hasActiveSubscription: true,
        hasPendingSubscription: false,
        subscriptionPlanEnd: "2026-12-31T00:00:00",
      }),
    )
    renderProbe()

    await waitFor(() => expect(read("state")).toBe("active"))
    expect(read("plan")).toBe("pro")
    expect(read("active")).toBe("true")
    expect(read("pending")).toBe("false")
    expect(read("planEnd")).toBe("2026-12-31T00:00:00")
    expect(read("loading")).toBe("false")
  })

  it('never-resolving /api/me → isLoading stays true, state "unknown", safe defaults', () => {
    mocks.apiFetch.mockImplementation(() => new Promise(() => {}))
    renderProbe()

    expect(read("loading")).toBe("true")
    expect(read("state")).toBe("unknown")
    // safe defaults while pending — DashboardShell keeps the CTA visible
    expect(read("plan")).toBe("free")
    expect(read("active")).toBe("false")
    expect(read("pending")).toBe("false")
    expect(read("planEnd")).toBe("")
  })
})
