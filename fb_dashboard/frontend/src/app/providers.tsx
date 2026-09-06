"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "framer-motion"
import { ReactNode } from "react"

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
})

/* v8-C2: reducedMotion="user" — every framer-motion animation in the tree now
 * automatically respects the OS "reduce motion" preference (springs, staggers,
 * sparkline draws, page entrances). The CSS keyframes in globals.css already
 * honored prefers-reduced-motion; this closes the gap for ALL JS-driven motion
 * (WCAG 2.3.3) in one line. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </QueryClientProvider>
  )
}
