"use client"

/**
 * v17-E-F10 (D6-8) — TrendLineChart: خطي الاتجاه اليومي للتحليلات المتقدمة.
 *
 * عقد المكون مرآة ActivityBarChart (charts/index.tsx): نفس رموز الألوان
 * (var(--primary)/var(--muted)/var(--border) — لا hex خام)، نفس hook
 * prefers-reduced-motion المحلي (v8-C2 — recharts يرسم tween 600ms افتراضيًا)،
 * نفس sr-only summary (v8-B14) ونفس بطاقة tooltip العربية.
 *
 * lazy contract: هذا الملف يستورد recharts على مستوى الوحدة؛ المستهلك
 * (صفحة analytics) يحمّله عبر next/dynamic ssr:false — نفس نمط
 * charts/lazy.tsx دون لمس الملف المشترك (ملكية v17-E-F10 حصرية).
 */
import { useEffect, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { countPhrase } from "@/lib/format"

// Brand solid — NOT --accent (that token is the 15% whisper tint; using it
// here made chart lines nearly invisible — same note as charts/index.tsx).
const ACCENT = "var(--primary)"
const MUTED = "var(--muted)"
const GRID = "var(--border)"

/* v8-C2 twin (نسخة محلية من charts/index.tsx — الملف المشترك خارج ملكية
 * هذه الموجة): يوقف tween الرسم عند prefers-reduced-motion. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return reduced
}

export interface TrendDatum {
  label: string
  value: number
  hint?: string
}

/** منحنى خطي للاتجاه اليومي (عدد الردود لكل يوم). */
export function TrendLineChart({
  data,
  height = 180,
  summary,
}: {
  data: TrendDatum[]
  height?: number
  /** sr-only text alternative for screen readers (v8-B14) */
  summary?: string
}) {
  const animate = !usePrefersReducedMotion() // v8-C2 — top-level hook (no conditional order)
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        لا توجد بيانات لعرضها
      </div>
    )
  }
  return (
    <div>
      {summary ? <p className="sr-only">{summary}</p> : null}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" opacity={0.4} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: MUTED }}
            interval="preserveStartEnd"
            minTickGap={28}
            tickLine={false}
            axisLine={false}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as TrendDatum
              return (
                <div className="rounded-lg border border-border bg-popover text-popover-foreground px-2.5 py-1.5 text-xs shadow-md">
                  <span className="text-muted-foreground">{p.hint ?? p.label}: </span>
                  <span className="font-bold tabular-nums">
                    {countPhrase(Number(p.value) || 0, "رد", "ردين", "ردود")}
                  </span>
                </div>
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={ACCENT}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={animate}
            animationDuration={600}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
