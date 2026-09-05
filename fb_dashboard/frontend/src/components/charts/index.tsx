"use client"

/**
 * Reusable recharts wrappers (latest_plan.md Track E.5).
 * Replaces every manual `<div style={{height}}>` bar chart.
 * Colors come from design tokens (docs/design-system.md) — no raw hex.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const ACCENT = "var(--accent)"
const MUTED = "var(--muted)"
const GRID = "var(--border)"

export interface BarDatum {
  label: string
  value: number
  hint?: string
}

/** Compact vertical bar chart — daily/hourly activity. */
export function ActivityBarChart({
  data,
  height = 160,
  showAxis = false,
}: {
  data: BarDatum[]
  height?: number
  showAxis?: boolean
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        لا توجد بيانات لعرضها
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" opacity={0.4} />
        {showAxis && (
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
        )}
        {!showAxis && <XAxis dataKey="label" hide />}
        <YAxis hide />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as BarDatum
            return (
              <div className="rounded-lg border border-border bg-popover text-popover-foreground px-2.5 py-1.5 text-xs shadow-md">
                <span className="text-muted-foreground">{p.hint ?? p.label}: </span>
                <span className="font-bold tabular-nums">{p.value}</span>
              </div>
            )
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} fill={ACCENT} maxBarSize={28} animationDuration={600} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Horizontal comparison bars (e.g. sentiment distribution, top rules). */
export function ComparisonBars({
  data,
}: {
  data: BarDatum[]
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات بعد</p>
  }
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0 text-muted-foreground">{d.label}</span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, background: ACCENT }}
            />
          </div>
          <span className="tabular-nums text-muted-foreground w-8 text-end">{d.value}</span>
        </div>
      ))}
    </div>
  )
}
