"use client"

import dynamic from "next/dynamic"

/* v9-B14 (plan E4) — lazy recharts boundary.
 *
 * /dashboard and /dashboard/analytics used to import @/components/charts
 * directly, which eagerly pulled the ~344KB recharts chunk into their
 * first-load JS (the "lazy since v6" claim was not real — charts/index.tsx
 * imports recharts at module top level). Both pages are client components
 * and recharts needs a DOM anyway, so ssr:false dynamic imports defer the
 * whole charts module (recharts included) until a chart actually renders.
 *
 * Component props — including the sr-only `summary` text alternative
 * (v8-B14) — are preserved: dynamic() infers them from the module's
 * exported component types.
 */

const ChartSkeleton = () => (
  <div className="h-32 rounded-xl bg-muted/30 animate-pulse" aria-hidden="true" />
)

export const ActivityBarChart = dynamic(
  () => import("./index").then(m => m.ActivityBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)

export const ComparisonBars = dynamic(
  () => import("./index").then(m => m.ComparisonBars),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
