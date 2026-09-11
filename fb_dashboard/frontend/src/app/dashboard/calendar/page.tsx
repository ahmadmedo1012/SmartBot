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
import { formatDateOnly, formatMonth } from "@/lib/format"

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
      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              {month ? (
                <h2 className="font-bold text-sm">{formatMonth(month)}</h2>
              ) : (
                <div className="h-5 w-28 bg-muted rounded animate-pulse" aria-hidden="true" />
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
              <div className="text-center py-8">
                <AlertCircle className="size-8 mx-auto mb-2 text-destructive/50" />
                <p className="text-sm text-muted-foreground mb-3">فشل تحميل التقويم</p>
                <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
              </div>
            ) : isLoading || !month ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : posts.length === 0 ? (
              <EmptyState icon={CalendarDays} size="sm" title="لا توجد منشورات في هذا الشهر" description="جدّول منشورات هذا الشهر من صفحة المنشورات وستظهر هنا فور جدولتها." />
            ) : (
              <div className="space-y-2">
                {posts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
                    <span className="truncate">{p.message ? (p.message.length > 50 ? p.message.slice(0, 50) + "…" : p.message) : ""}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {p.scheduled_at ? formatDateOnly(p.scheduled_at) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
