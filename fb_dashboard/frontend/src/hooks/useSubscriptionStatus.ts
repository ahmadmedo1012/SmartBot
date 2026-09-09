"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import type { ApiUser } from "@/lib/types"

/* v19 Step 1 — the ONE central subscription-status source (frontend half).
 *
 * The v19 live round proved the plan-name field /api/me already returned was
 * consumed by NOTHING: the sidebar «اشتراك» CTA rendered unconditionally
 * (AdminSidebar.tsx gates only on the onSubscribe prop existing) and the
 * payment endpoints accepted duplicate requests from already-subscribed
 * tenants. The backend half (_subscription.py + /api/me snapshot fields)
 * feeds this hook; the hook feeds the shell.
 *
 * Design (useConfig.ts conventions + the react-query ["me"] cache the
 * billing page already owns — one cache, one truth):
 *  - queryKey ["me"]: shared with billing/page.tsx — no duplicate requests,
 *    both consumers invalidate together on refetch.
 *  - staleTime 0 + refetchOnMount "always": EVERY mount re-reads the
 *    server truth (the plan's «بلا أي كاش قديم» — correctness must not
 *    depend on a live SSE channel that background tabs may silently kill;
 *    any later page load sees the real status).
 *  - pathname effect: AuthGuard refetches /api/me per route change; this
 *    mirrors it so a mid-session admin approval flips the sidebar CTA
 *    without a full reload.
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
  const pathname = usePathname()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await apiFetch("/api/me")
      if (!res.ok) throw new Error(`فشل تحميل الحساب (${res.status})`)
      return unwrapApi<{ user: ApiUser }>(res)
    },
    // v19: fresh on every mount — the whole point of the fix (no stale cache)
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  })

  useEffect(() => {
    if (pathname) void refetch()
    // refetch identity is stable in react-query v5; pathname drives re-runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

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
