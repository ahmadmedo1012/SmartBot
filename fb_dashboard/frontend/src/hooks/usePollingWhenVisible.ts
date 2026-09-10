"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

/**
 * v24-R2 (A2 #6/#7) — visibility-aware polling for react-query useQuery.
 *
 * Replaces a bare `refetchInterval: N` with the same value while the tab is
 * VISIBLE and `false` while it is HIDDEN:
 *
 *   const KEY = ["activity-logs"]                       // hoisted, stable
 *   const refetchInterval = usePollingWhenVisible(15_000, KEY)
 *   const q = useQuery({ queryKey: KEY, queryFn, refetchInterval })
 *
 * Behaviour:
 *  - Hidden → the returned `false` clears the observer's interval timer
 *    (react-query re-evaluates the option on every render, so the state flip
 *    restarts it). This is stronger than the default
 *    `refetchIntervalInBackground: false` skip-while-hidden — the timer stops
 *    waking the tab entirely.
 *  - Visible again → one immediate refetch of `queryKey` IF the cached data
 *    went stale while hidden (`dataUpdatedAt` older than `intervalMs`) and no
 *    fetch is already in flight — returning to the tab always shows data at
 *    least as fresh as one poll tick, without double-fetching when the
 *    absence was shorter than one interval (the request-count win A2 #6 asks
 *    for: "fewer requests, same perceived freshness").
 *  - Polling then resumes at the normal cadence.
 *
 * Contract notes for adopters:
 *  - Pass the SAME (ideally module-level, stable) queryKey the useQuery uses
 *    — the resume refetch targets it via the QueryClient.
 *  - `refetchOnWindowFocus` is disabled app-wide (QueryProvider defaults), so
 *    this hook's resume refetch is the only visibility-driven fetch; pages
 *    that re-enable refetchOnWindowFocus would double-refetch on return.
 *  - SSR-safe: server renders assume "visible" (same value the plain
 *    `refetchInterval: N` produced); the real visibility state is read on
 *    the client right after hydration.
 */
export function usePollingWhenVisible(
  intervalMs: number,
  queryKey: readonly unknown[],
): number | false {
  const queryClient = useQueryClient()
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  )

  useEffect(() => {
    const onVisibilityChange = () => {
      const nowVisible = document.visibilityState !== "hidden"
      if (nowVisible && !visible) {
        // v24-R2: resume — immediate refetch only when the data actually went
        // stale while hidden (older than one poll interval, no fetch in
        // flight). A quick tab-back within the interval costs zero requests.
        const state = queryClient.getQueryState(queryKey)
        if (state && state.fetchStatus !== "fetching") {
          const age = state.dataUpdatedAt > 0 ? Date.now() - state.dataUpdatedAt : Infinity
          if (age >= intervalMs) {
            void queryClient.refetchQueries({ queryKey, exact: true, type: "active" })
          }
        }
      }
      setVisible(nowVisible)
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
    // `visible` is a dep on purpose: the handler needs the PREVIOUS value
    // (was the tab already visible?) exactly once per transition, so the
    // listener must re-subscribe with a fresh closure on every flip.
  }, [queryClient, queryKey, intervalMs, visible])

  return visible ? intervalMs : false
}
