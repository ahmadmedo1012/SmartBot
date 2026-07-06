import { useQuery } from "@tanstack/react-query"
import { useMemo, useEffect } from "react"
import { fetchStats, fetchRules, fetchBotStatus, fetchReplies } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { LivePulse } from "@/components/live-pulse"
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts"
import {
  MessageSquare, Users, Bot, RefreshCw, AlertTriangle, Activity, Clock, TrendingUp, Zap,
} from "lucide-react"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-lg rtl text-right">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-semibold tabular-nums font-mono">{entry.value} ردود</span>
        </div>
      ))}
    </div>
  )
}

function MetricCard({ title, value, subtitle, icon: Icon, accent, trend }) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-[2px] ${accent === "primary" ? "bg-primary" : accent === "info" ? "bg-info" : accent === "success" ? "bg-success" : "bg-warning"}`} />
      <CardHeader className="flex flex-row items-start gap-4 p-5 pb-0">
        <div className={`flex size-11 items-center justify-center rounded-xl ${accent === "primary" ? "bg-primary/15 text-primary" : accent === "info" ? "bg-info/15 text-info" : accent === "success" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
          <Icon className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <CardTitle className="text-xs font-medium text-muted-foreground truncate">{title}</CardTitle>
          <div className="text-2xl font-bold font-mono tabular-nums text-foreground mt-0.5">{value}</div>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs font-medium shrink-0 mt-1 ${trend > 0 ? "text-success" : "text-destructive"}`}>
            <TrendingUp className="size-3" />
            <span className="tabular-nums">{Math.abs(trend)}%</span>
          </div>
        )}
      </CardHeader>
    </Card>
  )
}

function MetricSkeleton() {
  return (
    <div className="p-5 rounded-lg border bg-card">
      <div className="flex items-start gap-4">
        <Skeleton className="size-11 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  )
}

export function Dashboard() {
  useEffect(() => { document.title = "لوحة التحكم | SmartBot" }, [])

  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ["stats"], queryFn: fetchStats, refetchInterval: 10000,
  })
  const { data: rules = [], isLoading: rulesLoading, error: rulesError } = useQuery({
    queryKey: ["rules"], queryFn: fetchRules,
  })
  const { data: botStatus } = useQuery({
    queryKey: ["bot-status"], queryFn: fetchBotStatus, refetchInterval: 10000,
  })
  const { data: recentRepliesData, isLoading: repliesLoading } = useQuery({
    queryKey: ["replies-recent"], queryFn: () => fetchReplies(1, 5),
  })

  const loading = statsLoading || rulesLoading || repliesLoading
  const hasError = statsError || rulesError
  const recentReplies = recentRepliesData?.items || []

  const chartData = useMemo(() => stats?.chart
    ? Object.entries(stats.chart).map(([date, count]) => {
        let label = date
        try { const d = new Date(date); if (!isNaN(d.getTime())) label = d.toLocaleDateString("ar-SA", { weekday: "short", day: "numeric" }) } catch {}
        return { date: label, replies: count }
      })
    : [], [stats])

  const responseRate = useMemo(() => {
    if (!stats?.total_replies) return "—"
    const days = Object.keys(stats.chart || {}).length || 1
    return (stats.total_replies / days).toFixed(1)
  }, [stats])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground mt-1">نظرة عامة على أداء البوت والتفاعلات</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">v2.0.{new Date().toISOString().slice(5,10).replace("-","")}</span>
          <LivePulse />
          <Badge className={`gap-1.5 px-3 py-1 rounded-full text-xs ${botStatus?.running ? "bg-success/15 text-success border-success/30" : "bg-destructive/15 text-destructive border-destructive/30"}`}>
            <span className={`size-2 rounded-full ${botStatus?.running ? "bg-success animate-pulse" : "bg-destructive"}`} />
            {botStatus?.running ? "البوت شغال" : "متوقف"}
          </Badge>
        </div>
      </div>

      {hasError && !loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertTriangle className="h-14 w-14 text-destructive/60 mb-4" />
          <p className="text-destructive font-medium mb-4">{statsError?.message || "فشل تحميل البيانات"}</p>
          <Button variant="outline" onClick={() => refetchStats()} className="gap-2"><RefreshCw className="h-4 w-4" />إعادة المحاولة</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loading ? (
              [1,2,3,4].map(i => <MetricSkeleton key={i} />)
            ) : (
              <>
                <MetricCard title="إجمالي الردود" value={stats?.total_replies?.toLocaleString() || "0"} subtitle="جميع الردود التلقائية" icon={MessageSquare} accent="primary" trend={stats?.today_replies ? 100 : 0} />
                <MetricCard title="ردود اليوم" value={stats?.today_replies?.toLocaleString() || "0"} subtitle="آخر 24 ساعة" icon={Activity} accent="info" />
                <MetricCard title="المتابعون" value={stats?.fan_count?.toLocaleString() || "—"} subtitle="متابعو الصفحة" icon={Users} accent="success" />
                <MetricCard title="القواعد النشطة" value={rules.filter(r => r.enabled).length || "0"} subtitle={`من أصل ${rules.length} قاعدة`} icon={Bot} accent="warning" />
              </>
            )}
          </div>

          {/* Stats Row */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Chart */}
            <div className="lg:col-span-2">
              <Card className="panel-top-accent-primary">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Activity className="size-4 text-muted-foreground" />
                      النشاط (آخر 7 أيام)
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] gap-1 rounded-full">
                      <Clock className="size-3" />
                      {stats?.total_replies || 0} إجمالي
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-[260px] w-full rounded-lg" />
                  ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={8} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dx={-4} />
                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "4 4" }} />
                        <defs>
                          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Line type="monotone" dataKey="replies" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false}
                          activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16">
                      <Activity className="h-12 w-12 text-muted-foreground/20 mb-3" />
                      <p className="text-sm text-muted-foreground">لا توجد بيانات كافية</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Quick Stats */}
            <div className="space-y-4">
              <Card className="panel-top-accent-info">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="size-4 text-muted-foreground" />
                    معدل الاستجابة
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-info/15 text-info">
                      <TrendingUp className="size-6" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold font-mono tabular-nums">{responseRate}</div>
                      <p className="text-xs text-muted-foreground">رد / يوم</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="panel-top-accent-warning">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">القاعدة الأكثر استخداماً</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats?.top_rule_id ? (
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Bot className="size-6" />
                      </div>
                      <span className="text-sm font-semibold">{rules.find(r => r.id === stats.top_rule_id)?.name || "—"}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">لا توجد إحصائيات بعد</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent Replies Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  آخر الردود
                </CardTitle>
                <Badge variant="outline" className="text-[10px] rounded-full">{stats?.total_replies || 0} رد</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentReplies.length > 0 ? (
                <div className="data-table-wrapper"><table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">صاحب التعليق</th>
                      <th scope="col">التعليق</th>
                      <th scope="col">الرد</th>
                      <th scope="col">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentReplies.map(r => (
                      <tr key={r.id}>
                        <td className="font-medium"><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-success" />{r.commenter_name}</span></td>
                        <td className="text-sm text-muted-foreground max-w-[200px] truncate">{r.comment_text}</td>
                        <td className="text-sm text-muted-foreground max-w-[200px] truncate font-mono text-xs">{r.reply_text}</td>
                        <td className="text-xs text-muted-foreground whitespace-nowrap font-mono tabular-nums">
                          {r.created_at ? format(new Date(r.created_at), "yyyy/MM/dd HH:mm", { locale: arSA }) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              ) : (
                <div className="flex flex-col items-center py-12">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">لا توجد ردود بعد</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
