"use client"

import { useQuery } from "@tanstack/react-query"
import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Clock, Calendar, Users, Bot, TrendingUp, Activity, AlertCircle, RefreshCw, LayoutDashboard, LogOut, ChevronLeft, MessageCircle} from "lucide-react"

import { cn } from "@/lib/utils"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fadeUp, stagger, springGentle } from "@/lib/motion"
import { csrfFetch } from "@/lib/csrf-client"

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

// ── Stats card ──
function StatCard({ icon: Icon, label, value, trend, color }: {
  icon: any; label: string; value: number | string; trend?: number; color?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn("size-8 rounded-lg flex items-center justify-center", color ? `bg-${color}/10` : "bg-muted")}>
            <Icon className={cn("size-4", color ? `text-${color}` : "text-muted-foreground")} />
          </div>
        </div>
        <p className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          {trend !== undefined && (
            <span className={cn("text-xs", trend >= 0 ? "text-green-500" : "text-red-500")}>
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main Dashboard ──
export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => csrfFetch("/api/stats").then((r) => r.json()),
    refetchInterval: 15000,
  })

  const router = useRouter()

  const handleLogout = async () => {
    try {
      await csrfFetch("/api/logout", { method: "POST" })
      toast.success("تم تسجيل الخروج")
      router.push("/login")
    } catch { /* ignore */ }
  }

  const { data: replies, isLoading: repliesLoading } = useQuery({
    queryKey: ["dashboard-replies"],
    queryFn: () => csrfFetch("/api/replies?page=1&per_page=5").then((r) => r.json()),
  })

  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: ["dashboard-rules"],
    queryFn: () => csrfFetch("/api/rules").then((r) => r.json()),
  })

  const recentReplies = Array.isArray(replies?.data) ? replies.data : Array.isArray(replies) ? replies : []
  const rulesList = Array.isArray(rules) ? rules : []
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    // title handled by layout.tsx metadata
    const meta = document.createElement("meta")
    meta.name = "robots"
    meta.content = "noindex, nofollow"
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  if (statsError && !statsLoading) {
    return <ErrorState message={(statsError as Error)?.message} onRetry={() => refetchStats()} />
  }

  if (statsLoading && !stats) return <LoadingSkeleton />

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Simplified Sidebar */}
      <aside className={cn(
        "fixed top-0 right-0 z-50 h-full w-60 border-l border-border bg-card transition-transform md:-translate-x-0 md:static md:z-auto flex flex-col",
        sidebarOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <div className="size-8 rounded-lg bg-orange flex items-center justify-center text-white font-bold text-sm">S</div>
          <p className="font-bold text-sm">SmartBot</p>
        </div>
        <nav className="p-3 space-y-1 flex-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">عام</div>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-orange text-orange-foreground text-sm font-medium">
            <LayoutDashboard className="size-4" /> لوحة البيانات
          </div>
        </nav>
        <div className="p-3 border-t border-border">
          <button onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <LogOut className="size-4" /> تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="md:pr-60">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setSidebarOpen(true)}>
                <ChevronLeft className="size-5" />
              </Button>
              <h1 className="font-bold">لوحة البيانات</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-600">نشط</span>
            </div>
          </div>
        </header>

        <SectionContainer className="py-6">
          <motion.div variants={stagger} initial="hidden" animate="visible">
            {/* Stats grid */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 mb-6">
              <StatCard icon={Clock} label="آخر 7 أيام" value={stats?.total_replies || 0} trend={stats?.trend?.week} color="orange" />
              <StatCard icon={Calendar} label="ردود اليوم" value={stats?.today_replies || 0} trend={stats?.trend?.today} color="blue" />
              <StatCard icon={Users} label="المتابعون" value={stats?.fan_count || 0} color="green" />
              <StatCard icon={Bot} label="القواعد النشطة" value={rulesList.filter((r: any) => r.is_active !== false).length} color="yellow" />
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
                                <span className={cn("inline-flex items-center gap-1 text-xs", r.is_active !== false ? "text-green-600" : "text-muted-foreground")}>
                                  <span className={cn("size-1.5 rounded-full", r.is_active !== false ? "bg-green-500" : "bg-muted-foreground")} />
                                  {r.is_active !== false ? "نشط" : "متوقف"}
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
    </div>
  )
}

// ── Bar Chart ──
function ChartBars({ data }: { data: Record<string, number> }) {
  const entries = useMemo(() => Object.entries(data).slice(-24), [data])
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div>
      <div className="flex items-end gap-1 h-32">
        {entries.map(([d, v], i) => (
          <div key={d} className="flex-1 flex flex-col items-end justify-end h-full">
            <div
              className="w-full rounded-t bg-orange/70 hover:bg-orange transition-colors min-h-[2px]"
              style={{ height: `${(v / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
        {entries.length > 0 && (
          <>
            <span>{entries[0]?.[0]?.slice(5) || ""}</span>
            <span>{entries[entries.length - 1]?.[0]?.slice(5) || ""}</span>
          </>
        )}
      </div>
    </div>
  )
}
