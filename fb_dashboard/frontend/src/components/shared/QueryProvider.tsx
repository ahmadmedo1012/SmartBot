"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactNode, useState } from "react"

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
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
