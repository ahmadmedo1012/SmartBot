"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { FileBarChart, AlertCircle, RefreshCw, MessageSquare, Bot, Users, MessagesSquare, TrendingUp, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { KpiCard } from "@/components/shared/KpiCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { unwrapApi } from "@/lib/api"
import type { AnalyticsDashboard, TopCommenter } from "@/lib/types"
import { countPhrase, formatNumber } from "@/lib/format"

/* v17-E-F8 (D6-4): عقد POST /api/reports/generate (routers/reports_routes.py)
 * — جسم JSON {type: "monthly"|"subscriber", days 1..365} والرد **بايتات
 * PDF خام** (Response(media_type="application/pdf") — بلا غلاف ok())؛
 * الاسم من رأس Content-Disposition. الجدولة البريدية مؤجلة بقرار
 * dec-dead-tables (لا مكدس بريد). */
const REPORT_TYPES = [
  { key: "monthly", label: "تقرير شهري" },
  { key: "subscriber", label: "تقرير المشتركين" },
] as const

const REPORT_PERIODS = [
  { days: 7, label: "آخر 7 أيام" },
  { days: 30, label: "آخر 30 يوماً" },
  { days: 90, label: "آخر 90 يوماً" },
] as const

export default function ReportsPage() {
  const { data: dashboard, isLoading: dbLoad, isError: dbErr, error: dbError, refetch: dbRefetch } = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: async () => {
      const res = await apiFetch("/api/analytics/dashboard?days=30")
      if (!res.ok) throw new Error(`فشل تحميل الإحصائيات (${res.status})`)
      return unwrapApi<AnalyticsDashboard>(res)
    },
    retry: 1,
  })

  const { data: topCommenters = [], isLoading: tcLoad, isError: tcErr } = useQuery({
    queryKey: ["analytics-top-commenters"],
    queryFn: async () => {
      const res = await apiFetch("/api/analytics/top-commenters?limit=10")
      if (!res.ok) throw new Error(`فشل تحميل المعلقين (${res.status})`)
      return unwrapApi<TopCommenter[]>(res)
    },
    retry: 1,
  })

  /* v17-E-F8 (D6-4): جاهزية محرك PDF — GET /api/reports/status يعيد
   * {available, engine}. المحرك غير مثبت على الخادم = زر معطّل بنص
   * صادق (لا زر ميت يقود لخطأ 500). */
  const { data: pdfStatus } = useQuery({
    queryKey: ["reports-pdf-status"],
    queryFn: async () => {
      const res = await apiFetch("/api/reports/status")
      if (!res.ok) throw new Error("تعذر فحص جاهزية التقارير")
      return unwrapApi<{ available: boolean; engine: string }>(res)
    },
    retry: 1,
  })
  const pdfAvailable = pdfStatus?.available !== false

  const [reportType, setReportType] = useState<string>("monthly")
  const [reportDays, setReportDays] = useState<number>(30)

  /* تنزيل التقرير — POST /api/reports/generate ثم blob download:
     إنشاء رابط مؤقت (createObjectURL) + نقرة برمجية + تنظيف. */
  const downloadMut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/reports/generate", {
        method: "POST",
        body: JSON.stringify({ type: reportType, days: reportDays }),
      })
      const blob = await res.blob()
      const typeLabel = REPORT_TYPES.find(t => t.key === reportType)?.label || reportType
      const disposition = res.headers.get("Content-Disposition") || ""
      const match = /filename="?([^";]+)"?/.exec(disposition)
      const filename = match?.[1] || `تقرير-${reportType}-${reportDays}يوم.pdf`
      const url = URL.createObjectURL(blob)
      try {
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
      } finally {
        URL.revokeObjectURL(url)
      }
      return { typeLabel, size: blob.size }
    },
    onSuccess: (d) => {
      brandedToast.success(`تم تنزيل ${d.typeLabel}`, "افتح الملف من مجلد التنزيلات")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل توليد التقرير"),
  })

  const loading = dbLoad || tcLoad
  const anyError = dbErr || tcErr

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<FileBarChart className="size-4" />}
        title="التقارير"
        subtitle="التقارير والإحصائيات"
        compact
      />

      {/* D4-بند2 → r131-F8 (task #12): the content column rides the canonical
          1200 token (was max-w-5xl 1024). */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-(--marketing-max-w) mx-auto w-full">
        {loading ? (
          /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. */
          <div className="space-y-3">{[1,2,3,4].map(i => <Card key={i}><CardContent className="p-4"><div className="skeleton h-16 rounded" /></CardContent></Card>)}</div>
        ) : anyError ? (
          /* r131-F8 (A4 P2-8): bare-AlertCircle error → the canonical .state family. */
          <div className="state state-danger py-16" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <h2 className="state-title">فشل تحميل التقارير</h2>
            <p className="state-desc">{(dbError as Error)?.message || "تعذر الاتصال، تحقق من الإنترنت ثم أعد المحاولة"}</p>
            <Button size="sm" variant="outline" onClick={() => dbRefetch()}><RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة</Button>
          </div>
        ) : (
          <>
            {/* r131-F8 (A4 P2-2): the hand-rolled 20px-value/36px-well strip →
                the canonical KpiCard (30px tnum value, 44px pastel well + rim). */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={MessageSquare} label="إجمالي الرسائل" value={formatNumber(dashboard?.total_messages ?? 0)} tone="sky" index={0} />
              <KpiCard icon={Bot} label="ردود البوت التلقائية" value={formatNumber(dashboard?.total_replies ?? 0)} tone="copper" index={1} />
              <KpiCard icon={MessagesSquare} label="المحادثات" value={formatNumber(dashboard?.total_conversations ?? 0)} tone="mint" index={2} />
              <KpiCard icon={Users} label="عملاء محفوظون (CRM)" value={formatNumber(dashboard?.total_customers ?? 0)} tone="sand" index={3} />
            </div>

            <Card>
              <CardContent className="p-4 space-y-3">
                {/* v17-E-F8 (D6-4): تقرير PDF قابل للتنزيل — وعد Basic/Premium
                    «تقارير PDF» كانت الصفحة تقرأ analytics فقط. خيارات النوع/المدة
                    ثم زر تنزيل (blob). */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Download className="size-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">تقرير PDF</p>
                      <p className="text-3xs text-muted-foreground">
                        {pdfAvailable
                          ? "تقرير PDF جاهز للتنزيل — يعتمد على بياناتك في الفترة المحددة"
                          : `محرك التقارير غير متاح حالياً على الخادم${pdfStatus?.engine ? ` (${pdfStatus.engine})` : ""} — تواصل مع الدعم`}
                      </p>
                    </div>
                  </div>
                  {/* v24-C1 (A1 P0): the controls group now wraps internally —
                      selects go flex-1 min-w-0 and the download button takes
                      its own full-width row on mobile. The old single-line
                      group needed ~380px vs ~295px of card content, clipping
                      the primary PDF download at 375px. */}
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {/* r131-F8 (A4 P1-1d): the two hand-rolled native selects →
                        the shared Select primitive (44px / 16px / r-md / halo —
                        was a third focus grammar + md:text-sm). */}
                    <div className="flex-1 min-w-0 sm:w-44">
                      <Select
                        value={reportType}
                        onChange={e => setReportType(e.target.value)}
                        aria-label="نوع التقرير"
                      >
                        {REPORT_TYPES.map(t => (
                          <option key={t.key} value={t.key}>{t.label}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex-1 min-w-0 sm:w-36">
                      <Select
                        value={reportDays}
                        onChange={e => setReportDays(Number(e.target.value))}
                        aria-label="مدة التقرير"
                      >
                        {REPORT_PERIODS.map(p => (
                          <option key={p.days} value={p.days}>{p.label}</option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      loading={downloadMut.isPending}
                      disabled={!pdfAvailable || downloadMut.isPending}
                      onClick={() => downloadMut.mutate()}
                      className="w-full sm:w-auto shrink-0"
                    >
                      <Download className="size-3.5" /> {downloadMut.isPending ? "جارٍ التوليد…" : "تنزيل تقرير PDF"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-muted/50 flex items-center justify-center"><TrendingUp className="size-4 text-muted-foreground" /></div>
                  <div>
                    <p className="text-sm font-bold">
                      {formatNumber(dashboard?.today_replies ?? 0)}
                      <span className="text-3xs text-muted-foreground font-normal"> رد اليوم</span>
                    </p>
                    <p className="text-3xs text-muted-foreground">
                      {formatNumber(dashboard?.unique_commenters ?? 0)} معلّق فريد · {formatNumber(dashboard?.active_rules ?? 0)} قاعدة نشطة · آخر {formatNumber(dashboard?.period_days ?? 30)} يوماً
                    </p>
                  </div>
                </div>
                {/* r131-F8 (A4 P2-3): hand-rolled trend chip → Badge. */}
                <Badge variant={(dashboard?.change_pct ?? 0) >= 0 ? "success" : "danger"} className="px-2.5 py-1 tabular-nums">
                  {(dashboard?.change_pct ?? 0) >= 0 ? "↑" : "↓"} {Math.abs(dashboard?.change_pct ?? 0)}%
                </Badge>
              </CardContent>
            </Card>

            <section>
              <h2 className="sb-section-title mb-3">أكثر المعلقين تفاعلاً</h2>
              {tcLoad ? (
                /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. */
                <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-3"><div className="skeleton h-6 w-48 rounded" /></CardContent></Card>)}</div>
              ) : tcErr ? (
                <Card><CardContent className="p-4 text-center text-xs text-muted-foreground">تعذر تحميل المعلقين</CardContent></Card>
              ) : topCommenters.length === 0 ? (
                <Card><CardContent className="p-0">
                  <EmptyState icon={MessageSquare} size="sm" title="لا توجد بيانات كافية" description="ستظهر أسماء أكثر المعلقين تفاعلاً هنا بعد وصول تعليقات على منشوراتك." />
                </CardContent></Card>
              ) : (
                <div className="space-y-1">
                  {topCommenters.map((c, i) => (
                    /* v9-B12 — ranked list: positional keys corrupt React's
                        diffing when the ranking shifts; commenter_id is stable */
                    <Card key={c.commenter_id ?? c.name ?? i}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4 text-center">{i + 1}</span>
                          <span className="text-sm">{c.name}</span>
                        </div>
                        {/* v12-E4.13: countPhrase — same dual/plural phrasing as
                            audience/page.tsx:104 (was «N تعليق»). */}
                        <span className="text-xs text-muted-foreground">{countPhrase(c.count, "تعليق", "تعليقين", "تعليقات")}</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
