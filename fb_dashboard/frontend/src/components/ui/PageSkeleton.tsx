import { cn } from "@/lib/utils"

/* r131-F7 (A4 P1-2 + A11 SB-2, canonical W1-I §3.13): the shape-matched
 * route-fallback skeleton. Every loading.tsx rendered DefaultLoading — an
 * abstract centered spinner on a 60vh void — so the FIRST navigation to
 * every page painted a blank band instead of the page's own anatomy.
 * PageSkeleton paints the page SHAPE (header bar + KPI row + content
 * cards, per variant) on the .skeleton shimmer surface:
 *
 *   page    — dashboard/admin home: sticky header bar + 4-tile KPI row +
 *             two content cards with row strips.
 *   list    — table/list surfaces: header + filter pill row + row strips.
 *   cards   — pricing-style 3-column card grid under a header.
 *   form    — auth/connect/subscribe: centered card with label+field pairs.
 *   article — legal/pricing prose: header + paragraph line blocks.
 *
 * a11y: role="status" + aria-busy + an sr-only Arabic label (the visible
 * bars are aria-hidden decoration). Server-component safe (zero hooks) so
 * loading.tsx files stay on the server. The RM belt zeroes the shimmer
 * token → static surface under prefers-reduced-motion. */

function Bar({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />
}

const VARIANTS = ["page", "list", "cards", "form", "article"] as const
export type PageSkeletonVariant = (typeof VARIANTS)[number]

export function PageSkeleton({
  variant = "page",
  className,
}: {
  variant?: PageSkeletonVariant
  className?: string
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("w-full px-6 py-6 space-y-6", className)}
    >
      <span className="sr-only">جارٍ تحميل الصفحة…</span>

      {/* header bar — the PageHeader anatomy: icon well + title + action chip */}
      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Bar className="size-8 rounded-lg" />
          <Bar className="h-6 w-36 sm:w-48 rounded-md" />
          <Bar className="hidden sm:block h-4 w-24 rounded" />
        </div>
        <Bar className="h-10 w-24 rounded-md" />
      </div>

      {variant === "page" && (
        <>
          {/* KPI row — the 132px metric tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/50 p-5 space-y-3">
                <Bar className="h-4 w-20 rounded" />
                <Bar className="h-8 w-24 rounded" />
                <Bar className="h-3 w-16 rounded" />
              </div>
            ))}
          </div>
          {/* content cards with row strips */}
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1].map((c) => (
              <div key={c} className="rounded-xl border border-border/50 p-5 space-y-4">
                <Bar className="h-5 w-32 rounded" />
                {Array.from({ length: 4 }).map((_, r) => (
                  <div key={r} className="flex items-center gap-3">
                    <Bar className="size-10 rounded-lg shrink-0" />
                    <Bar className="h-4 flex-1 rounded" />
                    <Bar className="h-4 w-14 rounded" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {variant === "list" && (
        <>
          {/* filter pill row */}
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bar key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>
          {/* row strips — the list/table body */}
          <div className="rounded-xl border border-border/50 divide-y divide-border/50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Bar className="size-10 rounded-lg shrink-0" />
                <Bar className="h-4 flex-1 rounded" />
                <Bar className="hidden sm:block h-4 w-24 rounded" />
                <Bar className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </>
      )}

      {variant === "cards" && (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/50 p-6 space-y-4">
              <Bar className="h-5 w-24 rounded" />
              <Bar className="h-10 w-28 rounded" />
              {Array.from({ length: 4 }).map((_, r) => (
                <Bar key={r} className="h-3.5 w-full rounded" />
              ))}
              <Bar className="h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
      )}

      {variant === "form" && (
        <div className="mx-auto max-w-md rounded-xl border border-border/50 bg-card p-6 space-y-5">
          <div className="space-y-2 text-center">
            <Bar className="mx-auto h-6 w-40 rounded" />
            <Bar className="mx-auto h-3.5 w-56 rounded" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Bar className="h-3.5 w-20 rounded" />
              <Bar className="h-11 w-full rounded-md" />
            </div>
          ))}
          <Bar className="h-10 w-full rounded-md" />
        </div>
      )}

      {variant === "article" && (
        <div className="mx-auto max-w-2xl space-y-5">
          {Array.from({ length: 5 }).map((_, p) => (
            <div key={p} className="space-y-2.5">
              <Bar className="h-5 w-44 rounded" />
              {Array.from({ length: 3 }).map((_, l) => (
                <Bar key={l} className="h-3.5 w-full rounded" />
              ))}
              <Bar className="h-3.5 w-2/3 rounded" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
