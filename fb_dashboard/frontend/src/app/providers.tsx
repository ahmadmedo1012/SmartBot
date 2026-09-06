"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "framer-motion"
import { ReactNode, useState } from "react"

/* v8-C2: reducedMotion="user" — every framer-motion animation in the tree now
 * automatically respects the OS "reduce motion" preference (springs, staggers,
 * sparkline draws, page entrances). The CSS keyframes in globals.css already
 * honored prefers-reduced-motion; this closes the gap for ALL JS-driven motion
 * (WCAG 2.3.3) in one line. */
export function Providers({ children }: { children: ReactNode }) {
  // v9-B7 — useState factory: the QueryClient is created lazily on the first
  // client render instead of at module scope. A module-scope instance is
  // shared across every SSR request in the same Node process, leaking a
  // user's cached API responses into other users' SSR output.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </QueryClientProvider>
  )
}
