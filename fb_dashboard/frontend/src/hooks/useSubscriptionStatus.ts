"use client"

import { useMe } from "./useMe"

/* v19 Step 1 — the ONE central subscription-status source (frontend half).
 *
 * The v19 live round proved the plan-name field /api/me already returned was
 * consumed by NOTHING: the sidebar «اشتراك» CTA rendered unconditionally
 * (AdminSidebar.tsx gates only on the onSubscribe prop existing) and the
 * payment endpoints accepted duplicate requests from already-subscribed
 * tenants. The backend half (_subscription.py + /api/me snapshot fields)
 * feeds this hook; the hook feeds the shell.
 *
 * v24-C3 (A2 Q1/Q4 — de-dupe /api/me): this hook no longer owns a fetch.
 * It now derives from the SHARED ["me"] query (hooks/useMe.ts) — the exact
 * same cache entry AuthGuard gates on — so one /api/me serves the guard,
 * this CTA gate and billing. The v19 "fresh on every mount" trio
 * (staleTime 0 + refetchOnMount "always" + the pathname-keyed refetch()
 * effect) is gone: it doubled /api/me traffic per navigation (A2 Q1) and
 * re-rendered the shell on every tap. Freshness is now the shared entry's
 * 60s refetchInterval + 5-minute staleTime (see useMe.ts) — a mid-session
 * admin approval still flips the sidebar CTA within a minute.
 */
export interface SubscriptionStatus {
  /** Tenant plan name ("free" | "basic" | …) — /api/me user.subscriptionStatus. */
  plan: string
  /** Derived state (closed set): "active" | "inactive" | "unknown" (loading). */
  state: "active" | "inactive" | "unknown"
  hasActiveSubscription: boolean
  hasPendingSubscription: boolean
  planEnd: string | null
  isLoading: boolean
}

export function useSubscriptionStatus(): SubscriptionStatus {
  // v24-C3: same ["me"] cache entry as AuthGuard/billing — zero extra RTTs.
  const { data, isLoading } = useMe()
  const user = data?.user
  return {
    plan: user?.subscriptionStatus ?? "free",
    state: isLoading
      ? "unknown"
      : user?.subscriptionState === "active"
        ? "active"
        : "inactive",
    hasActiveSubscription: user?.hasActiveSubscription ?? false,
    hasPendingSubscription: user?.hasPendingSubscription ?? false,
    planEnd: user?.subscriptionPlanEnd ?? null,
    isLoading,
  }
}
