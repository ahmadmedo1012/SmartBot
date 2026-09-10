"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactNode, useEffect, useState } from "react"
import { attachQueryPersister } from "@/lib/query-persist"

/* v12-E5.2 — QueryClientProvider moved from the ROOT providers into the
 * /dashboard and /admin layouts.
 *
 * Who actually consumes react-query? A full grep of src/ found useQuery /
 * useQueryClient / useMutation in exactly 22 dashboard pages + admin/telegram
 * — nothing on public routes (/, /pricing, /login, /register, /connect,
 * /subscribe, /demo, /onboarding) ever calls it. Mounting it at the root
 * shipped @tanstack/react-query (~45KB) in every public page's first-load JS.
 *
 * Both layouts import THIS shared client component (server layouts can't
 * create the client themselves — no hooks in RSC).
 *
 * Options preserved 1:1 from the old app/providers.tsx:
 *  - v9-B7 useState factory: the QueryClient is created lazily on the first
 *    CLIENT render, never at module scope — a module-scope instance would be
 *    shared across every SSR request in the same Node process and could leak
 *    one user's cached API responses into another user's SSR output.
 *  - staleTime 30s / no refetchOnWindowFocus / retry 1.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  )

  /* v24-C3 (A2 #3 — persist the query cache): hydrate from sessionStorage
   * right after mount (async by design — the server HTML rendered the
   * pending skeletons, so restoring data during the first client render
   * would be a hydration mismatch), then persist cache changes (debounced,
   * ~500KB cap, ['me'] never persisted — see lib/query-persist.ts). A
   * refresh or back-navigation then paints cached data instantly and
   * revalidates in the background (stale entries refetch on mount). */
  useEffect(() => attachQueryPersister(queryClient), [queryClient])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
