"use client"

import { cn } from "@/lib/utils"

/**
 * TablePagination — canonical Madarek `.table-pagination` (SO r131 twin:
 * components/dashboard/table-pagination.tsx): flex-between footer attached
 * to the table, count on the start side + windowed NUMBERED buttons on the
 * end side. Replaces the «السابق/التالي» link rows (A4 P2-1:
 * audience:229-243, admin/support:478-492).
 *   · buttons 36px (44px touch floor below sm)
 *   · active page = accent-soft ground + primary border + accent-foreground ink
 *   · disabled step 0.45, ellipsis gap between windows
 */

function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1])
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p))
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => pages.add(p))
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const out: Array<number | "gap"> = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) out.push("gap")
    out.push(p)
  })
  return out
}

/* No explicit ring (double focus indicator) — the ONE global
   :focus-visible outline contract covers these (SO F3 twin). */
const stepBtn =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-md px-2 text-[13px] font-semibold transition-[color,background-color,border-color,box-shadow,opacity] duration-(--t-fast) disabled:pointer-events-none disabled:opacity-45 sm:h-9 sm:min-w-9"

export function TablePagination({
  page,
  totalPages,
  total,
  onPageChange,
  unitLabel = "سجل",
  className,
}: {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  unitLabel?: string
  className?: string
}) {
  if (totalPages <= 1) return null
  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3", className)}
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        {total} {unitLabel}
      </p>
      <nav aria-label="تصفح الصفحات" className="flex items-center gap-1.5">
        <button
          type="button"
          className={cn(stepBtn, "border border-border bg-card text-muted-foreground hover:text-foreground")}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          السابق
        </button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="w-6 text-center text-xs text-muted-foreground" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-current={p === page ? "page" : undefined}
              onClick={() => onPageChange(p)}
              className={cn(
                stepBtn,
                p === page
                  ? "border border-primary/50 bg-(--accent-soft) text-accent-foreground"
                  : "border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
              )}
            >
              <span className="tabular-nums">{p}</span>
            </button>
          )
        )}
        <button
          type="button"
          className={cn(stepBtn, "border border-border bg-card text-muted-foreground hover:text-foreground")}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          التالي
        </button>
      </nav>
    </div>
  )
}
