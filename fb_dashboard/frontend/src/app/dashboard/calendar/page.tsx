"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { CalendarDays, AlertCircle, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { Button } from "@/components/ui/button"
import { unwrapApi } from "@/lib/api"
import type { ScheduledPost } from "@/lib/types"
import { formatMonth } from "@/lib/format"

/* phase6 r154 (P6-2-d2) — شبكة الشهر (معالجة المسار الهادئ): الأسبوع
 * يبدأ الأحد (عطلة ليبيا الجمعة/السبت)؛ رقم اليوم مونو dir=ltr؛ اليوم
 * الحالي حلقة تيل (primary)؛ الأيام ذات منشورات مجدولة تحمل عقدة لايم
 * + مقتطفات محذوفة (النص الكامل في الـtitle). عقد الـAPI/الاستعلام/
 * التنقل بين الأشهر كما هي — هذا إعادة عرض فقط (كانت قائمة صفوف). */
const WEEKDAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const

interface MonthCell {
  key: string
  day: number
  inMonth: boolean
  today: boolean
  items: ScheduledPost[]
}

function buildMonthGrid(month: Date, posts: ScheduledPost[], markToday: boolean): MonthCell[] {
  const year = month.getFullYear()
  const monthIdx = month.getMonth()
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  const lead = new Date(year, monthIdx, 1).getDay() /* 0 = الأحد (العمود الأول) */
  const prevTail = new Date(year, monthIdx, 0).getDate()
  const today = new Date()
  /* تجميع المنشورات على أيام الشهر بالتوقيت المحلي (نفس عقد
   * formatDateOnly في القائمة القديمة). */
  const byDay = new Map<number, ScheduledPost[]>()
  for (const p of posts) {
    if (!p.scheduled_at) continue
    const d = new Date(p.scheduled_at)
    if (Number.isNaN(d.getTime())) continue
    if (d.getFullYear() !== year || d.getMonth() !== monthIdx) continue
    const list = byDay.get(d.getDate())
    if (list) list.push(p)
    else byDay.set(d.getDate(), [p])
  }
  const cells: MonthCell[] = []
  for (let i = 0; i < lead; i++) {
    cells.push({ key: `lead-${i}`, day: prevTail - lead + 1 + i, inMonth: false, today: false, items: [] })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      key: `day-${day}`,
      day,
      inMonth: true,
      today: markToday && day === today.getDate(),
      items: byDay.get(day) ?? [],
    })
  }
  let tail = 1
  while (cells.length % 7 !== 0) {
    cells.push({ key: `tail-${tail}`, day: tail++, inMonth: false, today: false, items: [] })
  }
  return cells
}

export default function CalendarPage() {
  // v9-B6 — `new Date()` used to run during render (server UTC vs client +02
  // hydration mismatch risk) and the month was a constant, so the query key
  // never changed. Month now lives in client-only state, initialized after
  // mount; the query key follows it and the arrows navigate it.
  const [month, setMonth] = useState<Date | null>(null)
  useEffect(() => {
    setMonth(new Date())
  }, [])

  const year = month?.getFullYear()
  const monthNum = month != null ? month.getMonth() + 1 : undefined

  const { data: posts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["calendar", year, monthNum],
    queryFn: () => apiFetch(`/api/calendar?year=${year}&month=${monthNum}`).then(unwrapApi<ScheduledPost[]>),
    enabled: month !== null,
    refetchInterval: 60000,
  })

  const shiftMonth = (delta: number) => {
    setMonth(m => (m ? new Date(m.getFullYear(), m.getMonth() + delta, 1) : m))
  }
  const backToCurrent = () => {
    const now = new Date()
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
  }
  const isCurrentMonth = month != null &&
    month.getFullYear() === new Date().getFullYear() &&
    month.getMonth() === new Date().getMonth()

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي (CalendarDays
          أيقونة الصفحة نفسها — نفس سياق تقويم AdminSidebar). */}
      <PageHeader
        icon={<CalendarDays className="size-4" />}
        title="تقويم المحتوى"
        subtitle="جدول المحتوى الشهري"
        compact
      />
      {/* D4-بند2 → r131-F8 (task #12): the content column rides the canonical
          1200 token (was max-w-5xl 1024). */}
      <div className="flex-1 overflow-y-auto p-6 max-w-(--marketing-max-w) mx-auto w-full">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              {month ? (
                <h2 className="sb-section-title">{formatMonth(month)}</h2>
              ) : (
                <div className="skeleton h-5 w-28 rounded" aria-hidden="true" />
              )}
              {/* RTL calendar navigation: "previous" points right (start side),
                  "next" points left (forward direction).
                  v14-E5 (D2-M5): raw ChevronRight/ChevronLeft replaced by
                  DirectionalIcon — the v7 §2.1 single source for directional
                  chevrons. Identical rendering (back→RTL: right, forward→RTL:
                  left); the component owns the glyph + the rtl flip. */}
              <div className="flex gap-1">
                {/* v25 (W-09): size-11 p-0 — هدف لمس 44px صريح (كان size-8؛
                    الشيفرون يبقى صغيراً داخل منطقة اللمس الأكبر). */}
                <Button size="sm" variant="ghost" onClick={() => shiftMonth(-1)} disabled={!month} aria-label="الشهر السابق" className="size-11 p-0">
                  <DirectionalIcon semanticDirection="back" variant="chevron" className="size-4" />
                </Button>
                {!isCurrentMonth && month && (
                  <Button size="sm" variant="ghost" onClick={backToCurrent} className="h-8 px-2 text-xs" aria-label="العودة إلى الشهر الحالي">
                    الشهر الحالي
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => shiftMonth(1)} disabled={!month} aria-label="الشهر التالي" className="size-11 p-0">
                  <DirectionalIcon semanticDirection="forward" variant="chevron" className="size-4" />
                </Button>
              </div>
            </div>
            {isError ? (
              /* r131-F7b (A4 P2-8 completion): bare-AlertCircle → the .state family. */
              <div className="state state-danger py-8" role="alert">
                <div className="state-icon" aria-hidden="true">
                  <AlertCircle />
                </div>
                <p className="state-title">تعذّر تحميل التقويم</p>
                <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
              </div>
            ) : isLoading || !month ? (
              /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. (plain JS comment —
                 JSX-comment braces are invalid in a ternary expression slot;
                 r131-F7b syntax repair) */
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-10 rounded" />)}</div>
            ) : posts.length === 0 ? (
              <EmptyState
                /* phase6 r154 — الروبوت يستضيف البئر: RobotMark في حالة
                   idle (البوت في الخدمة، تقويم الشهر بانتظار الجدولة). */
                robot
                size="sm"
                title="لا توجد منشورات في هذا الشهر"
                description="جدّول منشورات هذا الشهر من صفحة المنشورات وستظهر هنا فور جدولتها."
              />
            ) : (
              <div>
                <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
                  {WEEKDAY_LABELS.map((d) => (
                    <div key={d} className="text-2xs text-muted-foreground text-center font-medium py-0.5">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {buildMonthGrid(month, posts, isCurrentMonth).map((c) => (
                    <div
                      key={c.key}
                      className={`min-h-16 rounded-lg border p-1.5 space-y-0.5 ${
                        c.today
                          ? "border-primary/50 ring-1 ring-primary/30"
                          : c.inMonth
                            ? "border-border/50"
                            : "border-border/50 opacity-45"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          dir="ltr"
                          className={`font-mono tabular-nums text-xs ${
                            c.today ? "text-primary font-bold" : c.inMonth ? "text-muted-foreground" : ""
                          }`}
                        >
                          {String(c.day).padStart(2, "0")}
                        </span>
                        {c.items.length > 0 && (
                          <span className="size-1.5 rounded-full bg-lime shrink-0" aria-hidden="true" />
                        )}
                      </div>
                      {c.items.slice(0, 2).map((p) => (
                        <p
                          key={p.id}
                          className="truncate text-2xs leading-4 text-foreground/80"
                          title={p.message ?? undefined}
                        >
                          {p.message}
                        </p>
                      ))}
                      {c.items.length > 2 && (
                        <p dir="ltr" className="text-2xs leading-4 text-muted-foreground font-mono tabular-nums">
                          +{c.items.length - 2}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
