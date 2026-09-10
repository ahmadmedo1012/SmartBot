"use client"

/**
 * v24-C3 (A2 §6.1/Q1+Q2+Q4 — the dashboard waterfall killer): THE shared
 * /api/me react-query entry. Before this, /api/me was fetched on EVERY
 * dashboard navigation TWICE — AuthGuard's raw fetch (useEffect keyed on
 * pathname) + useSubscriptionStatus's staleTime:0/refetchOnMount:"always"
 * query with its own pathname-keyed refetch() effect — and the guard blocked
 * the whole subtree behind a spinner while the fetch was in flight.
 *
 * One cache entry now serves every consumer (AuthGuard gate,
 * useSubscriptionStatus CTA gate, billing's current-plan lookup — the same
 * ["me"] key since v19), so one request satisfies all three.
 *
 * Freshness policy (replaces v19's "staleTime 0 + refetchOnMount always" —
 * A2 Q4): staleTime 5 min means in-shell navigations render children from
 * cache with ZERO /api/me round-trips, and a 60s refetchInterval keeps the
 * subscription CTA / platform gate honest mid-session (the v19 concern: an
 * admin approval must flip the sidebar within a minute, not per navigation).
 * refetchIntervalInBackground stays false (global default) — no polling in
 * hidden tabs.
 *
 * Note (queryFn): apiFetch("/api/me") is deliberately called with a single
 * argument — no signal/skipAuthRedirect — so the /api/me GET keeps planting
 * the csrf cookie (v15-E5 D4-H1) and 401s flow through apiFetch's global
 * session-expiry journey; the guard's own redirect effect (see AuthGuard)
 * still wins the race to /login?redirect=<path>.
 */
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import type { ApiUser } from "@/lib/types"

/** The one true /api/me cache key (shared with billing/page.tsx since v19). */
export const ME_QUERY_KEY = ["me"] as const

/** v24-C3: 5 minutes — children render instantly on every in-shell navigation. */
export const ME_STALE_TIME = 5 * 60_000

/** v24-C3: replaces v19's per-pathname refetch — freshness without per-tap RTTs. */
export const ME_REFETCH_INTERVAL = 60_000

/** /api/me answer shape: ok({ user: ApiUser }). */
export interface MePayload {
  user: ApiUser
}

/** The one queryFn for the ["me"] entry (same contract as v19's). */
export const meQueryFn = async (): Promise<MePayload> => {
  const res = await apiFetch("/api/me")
  if (!res.ok) throw new Error(`فشل تحميل الحساب (${res.status})`)
  return unwrapApi<MePayload>(res)
}

/** v24-C3: the shared /api/me hook — AuthGuard, useSubscriptionStatus (and
 * any future consumer) all read from this single cache entry. */
export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: meQueryFn,
    staleTime: ME_STALE_TIME,
    refetchInterval: ME_REFETCH_INTERVAL,
    retry: 1,
  })
}
