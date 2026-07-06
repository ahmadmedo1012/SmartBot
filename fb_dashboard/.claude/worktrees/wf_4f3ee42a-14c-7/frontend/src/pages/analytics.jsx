import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"
import { fetchStats, fetchRules } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area,
  BarChart, Bar,
} from "recharts"
import {
  Activity, AlertTriangle, RefreshCw, Hash, Gauge, Bot, MessageSquare, Users, BarChart3,
} from "lucide-react"

function CustomTooltip({ active, payload, label }) {
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

function StatCard({ label, value, icon: Icon }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 p-5 pb-0">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-2">
        <div className="text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}

export function Analytics() {
  useEffect(() => { document.title = "التحليلات | SmartBot" }, [])

  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ["stats"], queryFn: fetchStats, refetchInterval: 10000, refetchIntervalInBackground: false,
  })
  const { data: rules, isLoading: rulesLoading, error: rulesError, refetch: refetchRules } = useQuery({
    queryKey: ["rules"], queryFn: fetchRules,
  })

  const loading = statsLoading || rulesLoading
  const hasError = statsError || rulesError

  const chartData = useMemo(() => stats?.chart
    ? Object.entries(stats.chart).map(([date, count]) => {
        let label = date
        try { const d = new Date(date); if (!isNaN(d.getTime())) label = d.toLocaleDateString("ar-SA", { weekday: "short", day: "numeric" }) } catch {}
        return { date: label, replies: count }
      })
    : [], [stats])

  const topRuleName = useMemo(() => {
    if (!stats?.top_rule_id || !rules?.length) return null
    const rule = rules.find(r => r.id === stats.top_rule_id)
    return rule?.name || null
  }, [stats?.top_rule_id, rules])

  const responseRate = useMemo(() => {
    const days = Object.keys(stats?.chart || {}).length
    if (!days || !stats?.total_replies) return "0.0"
    return (stats.total_replies / days).toFixed(1)
  }, [stats])

  const kpis = [
    { label: "إجمالي الردود", value: stats?.total_replies?.toLocaleString() ?? "0", icon: MessageSquare },
    { label: "ردود اليوم", value: stats?.today_replies?.toLocaleString() ?? "0", icon: Activity },
    { label: "المتابعين", value: stats?.fan_count?.toLocaleString() ?? "0", icon: Users },
    { label: "القواعد", value: rules?.length ?? "0", icon: Bot },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">التحليلات</h1>
        <p className="text-sm text-muted-foreground mt-1">إحصائيات متقدمة وأداء البوت</p>
      </div>

      {hasError && !loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <AlertTriangle className="h-14 w-14 text-destructive/80" />
          <p className="text-destructive font-medium">{statsError?.message || rulesError?.message || "فشل تحميل البيانات"}</p>
          <Button variant="outline" onClick={() => { refetchStats(); refetchRules() }} className="gap-2"><RefreshCw className="h-4 w-4" />إعادة المحاولة</Button>
        </div>
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-10 w-10 rounded-full mb-3" /><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-8 w-20" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {kpis.map(kpi => <StatCard key={kpi.label} {...kpi} />)}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="panel-top-accent-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="size-4 text-muted-foreground" />
                  الردود (آخر 7 أيام)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={310}>
                    <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                      <defs><linearGradient id="analyticsArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={8} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dx={-4} />
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "4 4" }} />
                      <Area type="monotone" dataKey="replies" fill="url(#analyticsArea)" stroke="none" />
                      <Line type="monotone" dataKey="replies" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                    <Activity className="h-16 w-16 text-muted-foreground/25" />
                    <p className="text-muted-foreground">لا توجد بيانات كافية</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="panel-top-accent-info">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <BarChart3 className="size-4 text-muted-foreground" />
                  توزيع الردود
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={310}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={8} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dx={-4} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                      <Bar dataKey="replies" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                    <BarChart3 className="h-16 w-16 text-muted-foreground/25" />
                    <p className="text-muted-foreground">لا توجد بيانات كافية</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Hash className="size-4 text-primary" />
                  القاعدة الأكثر استخداماً
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topRuleName ? (
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Bot className="size-6" />
                    </div>
                    <span className="text-lg font-semibold">{topRuleName}</span>
                  </div>
                ) : (
                  <p className="text-muted-foreground py-4">لا توجد قاعدة نشطة</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Gauge className="size-4 text-success" />
                  معدل الاستجابة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-lg bg-success/10 text-success">
                    <Activity className="size-6" />
                  </div>
                  <div>
                    <span className="text-lg font-semibold tabular-nums font-mono">{responseRate}</span>
                    <span className="text-sm text-muted-foreground mr-1">رد / يوم</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// ponytail: BarChart3 icon is from lucide-react, not recharts — name collision is fine
// skipped: per-rule breakdown chart, add when rules have usage distribution data
