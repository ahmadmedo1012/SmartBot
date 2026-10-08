"use client"

/**
 * SortableTh + useTableSort — v26-F4 (P4-A4 §2 P2): shared column sorting
 * for the dashboard tables (admin payments, admin support tickets,
 * dashboard rules). Before this round NO table anywhere in src/ carried
 * aria-sort/sortBy (audit-verified: 0 hits) — pagination existed, sorting
 * did not.
 *
 * A11y contract:
 * - the <th> carries aria-sort="ascending"|"descending"|"none" (WAI-ARIA
 *   Authoring Practices for sortable tables) — screen readers announce the
 *   current direction BEFORE the click, not after;
 * - the control is a real <button type="button"> (Enter/Space free) with an
 *   Arabic aria-label naming the column AND the action;
 * - the chevron swaps ChevronUp/ChevronDown for the active column; inactive
 *   columns show a muted ChevronsUpDown affordance (icon-swap family, RTL
 *   neutral — vertical, never a reading-direction glyph).
 *
 * useTableSort cycles a column: inactive → asc → desc → inactive, sorts a
 * COPY (never the query cache), compares numbers numerically and everything
 * else with localeCompare("ar") so Arabic + Latin strings both order
 * naturally, and treats null/undefined as empty (sorts to the end in asc).
 */
import { useCallback, useMemo, useState } from "react"
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type SortDir = "asc" | "desc"
export interface SortState {
  column: string
  dir: SortDir
}

/** Stable comparator: numbers numerically, strings via localeCompare("ar"),
 * null/undefined as empty (kept deterministic by a final id-free tiebreak on
 * the raw string form). */
function compare(a: unknown, b: unknown): number {
  const va = a ?? ""
  const vb = b ?? ""
  if (typeof va === "number" && typeof vb === "number") return va - vb
  return String(va).localeCompare(String(vb), "ar")
}

/**
 * Sort `rows` by a registered accessor. `accessors` maps a stable column key
 * (the same key SortableTh receives) to (row) => number | string | null.
 */
export function useTableSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => number | string | null | undefined>,
) {
  const [sort, setSort] = useState<SortState | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const get = accessors[sort.column]
    if (!get) return rows
    const out = [...rows]
    out.sort((a, b) => {
      const cmp = compare(get(a), get(b))
      return sort.dir === "asc" ? cmp : -cmp
    })
    return out
  }, [rows, sort, accessors])

  /** Column click cycle: inactive → asc → desc → back to inactive. */
  const toggleSort = useCallback((column: string) => {
    setSort((prev) =>
      prev?.column === column
        ? prev.dir === "asc"
          ? { column, dir: "desc" }
          : null
        : { column, dir: "asc" },
    )
  }, [])

  return { sorted, sort, toggleSort }
}

interface SortableThProps {
  /** Visible column label (Arabic). */
  label: string
  /** Stable column key — must match an accessor key in useTableSort. */
  column: string
  /** Current sort state from useTableSort (null = no active sort). */
  sort: SortState | null
  onToggle: (column: string) => void
  align?: "start" | "center"
  className?: string
}

export function SortableTh({
  label,
  column,
  sort,
  onToggle,
  align = "start",
  className,
}: SortableThProps) {
  const active = sort?.column === column
  const dir = active ? sort.dir : undefined
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "p-3 font-medium",
        align === "center" ? "text-center" : "text-start",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(column)}
        aria-label={`ترتيب حسب ${label}${active ? (dir === "asc" ? "، تصاعديًا" : "، تنازليًا") : ""}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm outline-none",
          "hover:text-foreground transition-colors duration-(--t-fast) ease-smooth",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-40" aria-hidden="true" />
        )}
      </button>
    </th>
  )
}
