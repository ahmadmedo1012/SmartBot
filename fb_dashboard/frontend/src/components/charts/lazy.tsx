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

/* r131-F7b (A4 P1-2 completion — the F8 pulse sweep missed this one): the
 * lazy-chart fallback rides the canonical .skeleton shimmer surface (was
 * bg-muted/30 + animate-pulse opacity blink); shape kept (128px chart
 * band, r-xl) — ChartCard.tsx's in-card twin landed in F8, this is the
 * dynamic-import boundary. RM: the token-bound shimmer zeroes (static). */
const ChartSkeleton = () => (
  <div className="skeleton h-32 rounded-xl" aria-hidden="true" />
)

export const ActivityBarChart = dynamic(
  () => import("./index").then(m => m.ActivityBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)

export const ComparisonBars = dynamic(
  () => import("./index").then(m => m.ComparisonBars),
  { ssr: false, loading: () => <ChartSkeleton /> },
)
