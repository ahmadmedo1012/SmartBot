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
 * Note (queryFn, P13-2c): apiFetch("/api/me") now receives react-query's
 * cancellation `signal` — a hung /api/me used to spin the AuthGuard /
 * login / connect loaders forever (P13-1c F1); the signal plus apiFetch's
 * 20s default clock bounds the wait (retry: 1 → error state, never an
 * infinite loader). Passing the signal changes NOTHING else: the GET still
 * plants the csrf cookie (v15-E5 D4-H1) and 401s still flow through
 * apiFetch's global session-expiry journey; the guard's own redirect
 * effect (see AuthGuard) still wins the race to /login?redirect=<path>.
 */
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import type { ApiUser } from "@/lib/types"

/* r132-F3a: the four /api/me query constants below dropped their export
 * keywords — zero external importers; useMe() at the bottom consumes them
 * (billing/page.tsx rides the ["me"] key inline, not via these names). */
const ME_QUERY_KEY = ["me"] as const

/** v24-C3: 5 minutes — children render instantly on every in-shell navigation. */
const ME_STALE_TIME = 5 * 60_000

/** v24-C3: replaces v19's per-pathname refetch — freshness without per-tap RTTs. */
const ME_REFETCH_INTERVAL = 60_000

/** /api/me answer shape: ok({ user: ApiUser }). */
export interface MePayload {
  user: ApiUser
}

/** The one queryFn for the ["me"] entry (same contract as v19's). */
const meQueryFn = async ({ signal }: { signal?: AbortSignal }): Promise<MePayload> => {
  // P13-2c: thread react-query's cancellation signal — see the module note.
  const res = await apiFetch("/api/me", { signal })
  if (!res.ok) throw new Error(`تعذّر تحميل الحساب (${res.status})`)
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
