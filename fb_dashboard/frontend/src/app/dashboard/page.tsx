"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { motion } from "framer-motion"
import { TrendingUp, Activity, AlertCircle, RefreshCw, MessageCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/PageHeader"
import { fadeUp, stagger } from "@/lib/motion"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"

// ── Skeleton ──
function LoadingSkeleton() {
  return (
    <SectionContainer className="py-6 space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-36 bg-muted rounded animate-pulse" />
        <div className="h-4 w-48 bg-muted rounded animate-pulse" />
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4 space-y-2">
            <div className="h-3 w-16 bg-muted rounded animate-pulse" />
            <div className="h-7 w-12 bg-muted rounded animate-pulse" />
          </CardContent></Card>
        ))}
      </div>
      <div className="h-48 bg-muted rounded animate-pulse" />
    </SectionContainer>
  )
}

// ── Error State ──
function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <SectionContainer className="py-16 text-center">
      <AlertCircle className="size-12 text-muted-foreground mx-auto mb-4" />
      <h2 className="text-lg font-bold mb-1">حدث خطأ في التحميل</h2>
      <p className="text-sm text-muted-foreground mb-4">{message || "تعذر تحميل بيانات لوحة التحكم"}</p>
      <Button onClick={onRetry}><RefreshCw className="size-4" /> إعادة المحاولة</Button>
    </SectionContainer>
  )
}

const STAT_COLORS: Record<string, { bg: string; text: string }> = {
  orange: { bg: "bg-orange/10", text: "text-orange" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-500" },
  green: { bg: "bg-green-500/10", text: "text-green-500" },
  yellow: { bg: "bg-yellow-500/10", text: "text-yellow-500" },
  purple: { bg: "bg-purple-500/10", text: "text-purple-500" },
  red: { bg: "bg-red-500/10", text: "text-red-500" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-500" },
  indigo: { bg: "bg-indigo-500/10", text: "text-indigo-500" },
  cyan: { bg: "bg-cyan-500/10", text: "text-cyan-500" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-500" },
}

// ── Stats card ──
function StatCard({ icon: Icon, label, value, trend, color }: {
  icon: any; label: string; value: number | string; trend?: number; color?: string
}) {
  const c = color ? STAT_COLORS[color] : undefined
  return (
    <Card className="stat-card border-border/50 hover:border-orange/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className={cn("size-9 rounded-lg flex items-center justify-center transition-transform duration-200", c?.bg || "bg-muted")}>
            <Icon className={cn("size-4", c?.text || "text-muted-foreground")} />
          </div>
          {trend !== undefined && (
            <span className={cn(
              "inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              trend >= 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
            )}>
              <span aria-hidden="true">{trend >= 0 ? "↑" : "↓"}</span>
              {Math.abs(trend)}%
            </span>
          )}
        </div>
        <p className="text-2xl font-bold tabular-nums tracking-tight">
          {typeof value === "number" ? value.toLocaleString("ar-LY") : value}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  )
}

// ── Bar Chart ──
function ChartBars({ data }: { data: Record<string, number> }) {
  const entries = useMemo(() => Object.entries(data).slice(-24), [data])
  const max = Math.max(...entries.map(([, v]) => v), 1)
  if (entries.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
        لا توجد بيانات نشاط لعرضها
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-end gap-1.5 h-32">
        {entries.map(([d, v], i) => (
          <motion.div
            key={d}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: `${(v / max) * 100}%`, opacity: 1 }}
            transition={{ duration: 0.5, delay: i * 0.02, ease: "easeOut" }}
            className="flex-1 group relative"
          >
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-orange to-orange/70 group-hover:from-orange group-hover:to-orange transition-all duration-200 min-h-[3px] shadow-sm shadow-orange/20 group-hover:shadow-md group-hover:shadow-orange/30"
              style={{ height: "100%" }}
              title={`${d}: ${v} رد`}
            />
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-popover text-popover-foreground text-[10px] px-1.5 py-0.5 rounded shadow-md border border-border whitespace-nowrap z-10">
              {v} رد
            </div>
          </motion.div>
        ))}
      </div>
      <div className="flex justify-between mt-2.5 text-[10px] text-muted-foreground tabular-nums">
        <span>{entries[0]?.[0]?.slice(5) || ""}</span>
        <span>{entries[entries.length - 1]?.[0]?.slice(5) || ""}</span>
      </div>
    </div>
  )
}

// ── Main Dashboard ──
export default function DashboardPage() {
  const { data: bundle, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-bundle"],
    queryFn: () => apiFetch("/api/dashboard/bundle").then(unwrapApi),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  })

  const recentReplies = bundle?.recent_replies || []
  const rulesList = bundle?.rules || []
  const stats = bundle?.stats || {}

  if (error && !isLoading) {
    return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
  }

  if (isLoading && !bundle) return <LoadingSkeleton />

  return (
    <div className="min-h-screen bg-background" dir="rtl">
        {/* Header */}
        <PageHeader
          icon={<TrendingUp className="size-4" />}
          title="لوحة البيانات"
          status={{ label: "متصل", tone: "success" }}
          compact
        />

        <SectionContainer className="py-6">
          <motion.div variants={stagger} initial="hidden" animate="visible">
            {/* Stats grid */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 mb-6">
              <StatCard icon={TrendingUp} label="جميع الردود" value={stats?.total_replies || 0} trend={stats?.trend?.week} color="orange" />
              <StatCard icon={Activity} label="ردود اليوم" value={stats?.today_replies || 0} trend={stats?.trend?.today} color="blue" />
              <StatCard icon={MessageCircle} label="المتابعون" value={stats?.fan_count || 0} color="green" />
              <StatCard icon={RefreshCw} label="القواعد النشطة" value={rulesList.filter((r: any) => r.enabled !== false).length} color="yellow" />
            </div>

            {/* Activity chart */}
            <motion.div variants={fadeUp} custom={4} className="mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="size-4 text-orange" /> النشاط اليومي
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats?.chart ? (
                    <ChartBars data={stats.chart} />
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">بيانات غير كافية بعد</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Recent replies */}
              <motion.div variants={fadeUp} custom={5}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageCircle className="size-4 text-orange" /> آخر الردود
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {recentReplies.length > 0 ? recentReplies.slice(0, 5).map((r: any) => (
                      <div key={r.id} className="flex items-start gap-3 px-6 py-3 border-b border-border last:border-0">
                        <div className="size-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                          {(r.commenter_name || r.commenter || "?")[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{r.commenter_name || r.commenter}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.comment_text || r.text}</p>
                          <p className="text-xs text-orange truncate">{r.reply_text || r.reply}</p>
                        </div>
                      </div>
                    )) : (
                      <div className="p-8 text-center text-sm text-muted-foreground">لا توجد ردود بعد</div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Rules */}
              <motion.div variants={fadeUp} custom={6}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Activity className="size-4 text-orange" /> قواعد الرد
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {rulesList.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground text-xs">
                            <th className="text-right p-3 font-medium">القاعدة</th>
                            <th className="text-center p-3 font-medium">الكلمات</th>
                            <th className="text-center p-3 font-medium">الحالة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rulesList.slice(0, 5).map((r: any) => (
                            <tr key={r.id} className="border-b border-border last:border-0">
                              <td className="p-3 font-medium">{r.name}</td>
                              <td className="p-3 text-center text-muted-foreground">{r.keywords || "—"}</td>
                              <td className="p-3 text-center">
                                <span className={cn("inline-flex items-center gap-1 text-xs", r.enabled !== false ? "text-green-600" : "text-muted-foreground")}>
                                  <span className={cn("size-1.5 rounded-full", r.enabled !== false ? "bg-green-500" : "bg-muted-foreground")} />
                                  {r.enabled !== false ? "نشط" : "متوقف"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-8 text-center text-sm text-muted-foreground">لا توجد قواعد بعد</div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </motion.div>
        </SectionContainer>
    </div>
  )
}
