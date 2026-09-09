"use client"

/**
 * v17-E-F10 (D6-8) — ActivityHeatmap: خريطة حرارية لنشاط الردود بالساعة.
 *
 * بيانات /api/analytics/hourly-heatmap: خلايا {hour, day, count} بتجميع
 * UTC (يوم "YYYY-MM-DD" + ساعة 0-23). المكون يجمعها في شبكة
 * أيام-الأسبوع (٧ صفوف) × الساعات (٢٤ عمودًا) — CSS grid خالص بلا
 * recharts (البند D6-8: "heatmap بسيط grid CSS")، الألوان من رموز
 * التصميم عبر color-mix (نفس أسلوب page.tsx/Header.tsx — لا hex خام).
 *
 * a11y/عربية:
 *  - كل خلية تحمل title عربيًا: "الثلاثاء 14:00 — 5 ردود" (countPhrase).
 *  - الشبكة dir="ltr" حتى يقرأ محور الساعات يسار→يمين مثل محور recharts
 *    (نفس اتجاه XAxis في ActivityBarChart/TrendLineChart)، وأسماء الأيام
 *    العربية تُعرض في عمود البداية.
 *  - summary (sr-only، v8-B14) يصف المحتوى لقارئ الشاشة بدل 168 خلية.
 */
import { countPhrase } from "@/lib/format"

export interface HeatmapCell {
  hour: number
  day: string
  count: number
}

/** أسماء أيام الأسبوع بترتيب Date.getUTCDay() (0=الأحد … 6=السبت). */
export const WEEKDAY_LABELS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
] as const

/** 24 ساعة — أعمدة الشبكة. */
const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** هامش أدنى للرؤية: أخف خلية 22% تشبعًا ثم تصاعد خطي حتى 100%. */
function cellMix(count: number, max: number): string {
  const intensity = max > 0 ? count / max : 0
  const pct = Math.round(22 + 78 * intensity)
  return `color-mix(in srgb, var(--primary) ${pct}%, transparent)`
}

export function ActivityHeatmap({
  cells,
  summary,
}: {
  cells: HeatmapCell[]
  /** sr-only text alternative for screen readers (v8-B14) */
  summary?: string
}) {
  /* تجميع client-side: خلايا الباك-إند (يوم×ساعة) → شبكة (يوم-أسبوع×ساعة)
   * بتاريخ UTC — الباك-إند يجمّع بتوقيت UTC فتُحلَّل الأيام بـgetUTCDay
   * ليبقى اليوم متطابقًا مع تجميع الخادم (الوصف يصرّح بتوقيت غرينتش). */
  const grid: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const c of cells) {
    const d = new Date(`${c.day}T00:00:00Z`)
    if (Number.isNaN(d.getTime())) continue
    const wd = d.getUTCDay()
    const h = Number(c.hour)
    if (wd >= 0 && wd < 7 && Number.isInteger(h) && h >= 0 && h < 24) {
      grid[wd][h] += Number(c.count) || 0
    }
  }
  const max = Math.max(...grid.flat())

  if (max === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات لعرضها</p>
    )
  }

  return (
    <div dir="ltr">
      {summary ? <p className="sr-only">{summary}</p> : null}
      <div className="space-y-1">
        {/* صف عناوين الساعات — يعرض كل 6 ساعات (0/6/12/18) لتجنب الازدحام */}
        <div className="grid" style={{ gridTemplateColumns: "3.25rem repeat(24, minmax(0, 1fr))" }}>
          <span aria-hidden="true" />
          {HOURS.map((h) => (
            <span
              key={h}
              className="text-center text-2xs text-muted-foreground tabular-nums"
              title={`${h}:00`}
            >
              {h % 6 === 0 ? h : ""}
            </span>
          ))}
        </div>
        {grid.map((row, wd) => (
          <div
            key={WEEKDAY_LABELS[wd]}
            className="grid items-center"
            style={{ gridTemplateColumns: "3.25rem repeat(24, minmax(0, 1fr))" }}
          >
            <span
              className="text-2xs text-muted-foreground text-end pe-1 truncate"
              title={WEEKDAY_LABELS[wd]}
            >
              {WEEKDAY_LABELS[wd]}
            </span>
            {row.map((count, h) => (
              <div
                key={h}
                className="aspect-square rounded-[3px] mx-[1px]"
                title={`${WEEKDAY_LABELS[wd]} ${h}:00 — ${countPhrase(count, "رد", "ردين", "ردود")}`}
                style={{ backgroundColor: count === 0 ? "var(--muted)" : cellMix(count, max) }}
              />
            ))}
          </div>
        ))}
      </div>
      {/* مفتاح القراءة */}
      <div className="mt-2.5 flex items-center justify-end gap-1.5" aria-hidden="true">
        <span className="text-2xs text-muted-foreground">أقل</span>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <span
            key={f}
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: cellMix(Math.max(1, Math.round(max * f)), max) }}
          />
        ))}
        <span className="text-2xs text-muted-foreground">أكثر</span>
      </div>
    </div>
  )
}
