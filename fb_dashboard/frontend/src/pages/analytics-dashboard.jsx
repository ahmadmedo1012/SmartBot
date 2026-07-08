import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchAnalyticsOverview } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Area, AreaChart, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts"
import {
  Download, TrendingUp, Clock, Target, MessageSquare, Users, BarChart3,
  Activity, AlertTriangle, RefreshCw, Zap, Smile,
  ArrowUp, ArrowDown,
} from "lucide-react"
import { format } from "date-fns"

// ── Inline analytics API fns (add to api.js later if heavily reused) ──
const BASE = ""
async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: opts.body instanceof FormData ? {} : { "Content-Type": "application/json", ...opts.headers },
  })
  if (!res.ok) { const t = await res.text(); throw new Error(t.slice(0, 200)) }
  return res.json()
}
const fetchDailyTrend = (d) => api(`/api/analytics/daily-trend?days=${d}`)
const fetchHourlyHeatmap = (d) => api(`/api/analytics/hourly-heatmap?days=${d}`)
const fetchTopRules = (d, l) => api(`/api/analytics/top-rules?days=${d}&limit=${l}`)
const fetchSentimentTrend = (d) => api(`/api/analytics/sentiment-trend?days=${d}`)
const fetchPeakHour = (d) => api(`/api/analytics/peak-hour?days=${d}`)
const fetchTopCommenters = (d, l) => api(`/api/analytics/top-commenters?days=${d}&limit=${l}`)
const fetchPeriodComparison = (d) => api(`/api/analytics/period-comparison?days=${d}`)
// ──────────────────────────────────────────────────────────────────────

function KpiCard({ title, value, change, icon: Icon, accent, loading, error }) {
  if (loading) return (
    <Card className="overflow-hidden">
      <div className={`h-[2px] ${accent === "primary" ? "bg-primary" : accent === "info" ? "bg-info" : accent === "success" ? "bg-success" : "bg-warning"}`} />
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
  const changePositive = change != null ? change >= 0 : null
  return (
    <Card className="overflow-hidden">
      <div className={`h-[2px] ${accent === "primary" ? "bg-primary" : accent === "info" ? "bg-info" : accent === "success" ? "bg-success" : "bg-warning"}`} />
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex size-10 items-center justify-center rounded-xl shrink-0 ${
            accent === "primary" ? "bg-primary/15 text-primary" :
            accent === "info" ? "bg-info/15 text-info" :
            accent === "success" ? "bg-success/15 text-success" :
            "bg-warning/15 text-warning"
          }`}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-bold font-mono tabular-nums text-foreground">{error ? "—" : value}</span>
              {change != null && (
                <span className={`flex items-center text-xs font-mono tabular-nums gap-0.5 ${
                  changePositive ? "text-success" : "text-destructive"
                }`}>
                  {changePositive ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                  {Math.abs(change)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, icon: Icon, children, loading, isEmpty, emptyMsg = "لا توجد بيانات كافية", height = 260 }) {
  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-4 pb-4">
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : isEmpty ? (
          <p className="text-sm text-muted-foreground text-center py-12">{emptyMsg}</p>
        ) : (
          <div style={{ height }}>
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const tooltipContent = ({ active, payload, label }) =>
  active && payload?.length ? (
    <div className="rounded-xl border bg-card/95 backdrop-blur-sm px-3 py-2 text-xs shadow-lg glass-heavy">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  ) : null

export function AnalyticsDashboard() {
  useEffect(() => { document.title = "تحليلات متقدمة | SmartBot" }, [])
  const [days, setDays] = useState("30")

  const { data: overview, isLoading: ovLoading, error: ovError, refetch: refetchOv } = useQuery({
    queryKey: ["analytics-overview", days],
    queryFn: () => fetchAnalyticsOverview(parseInt(days)),
  })
  const { data: dailyTrend, isLoading: dtLoading } = useQuery({
    queryKey: ["daily-trend", days],
    queryFn: () => fetchDailyTrend(parseInt(days)),
  })
  const { data: hourly, isLoading: hrLoading } = useQuery({
    queryKey: ["hourly-heatmap", days],
    queryFn: () => fetchHourlyHeatmap(parseInt(days)),
  })
  const { data: topRulesData, isLoading: trLoading } = useQuery({
    queryKey: ["top-rules-analytics", days],
    queryFn: () => fetchTopRules(parseInt(days), 10),
  })
  const { data: sentimentTrend, isLoading: stLoading } = useQuery({
    queryKey: ["sentiment-trend", days],
    queryFn: () => fetchSentimentTrend(parseInt(days)),
  })
  const { data: peakHourData } = useQuery({
    queryKey: ["peak-hour", days],
    queryFn: () => fetchPeakHour(parseInt(days)),
  })
  const { data: topCommentersData, isLoading: tcLoading } = useQuery({
    queryKey: ["top-commenters", days],
    queryFn: () => fetchTopCommenters(parseInt(days), 10),
  })
  const { data: comparisonData, isLoading: cpLoading } = useQuery({
    queryKey: ["period-comparison", days],
    queryFn: () => fetchPeriodComparison(parseInt(days)),
  })

  const anyError = ovError

  // ── Derived ──
  const kpis = useMemo(() => {
    const o = overview || {}
    const pc = comparisonData || {}
    return [
      {
        key: "total_replies", title: "إجمالي الردود",
        value: o.total_replies?.toLocaleString() || "0",
        change: pc.total_replies_change ?? null,
        icon: MessageSquare, accent: "primary",
      },
      {
        key: "today_replies", title: "ردود اليوم",
        value: o.today_replies?.toLocaleString() || "0",
        change: pc.today_replies_change ?? null,
        icon: Activity, accent: "info",
      },
      {
        key: "active_rules", title: "القواعد النشطة",
        value: o.active_rules?.toLocaleString() || "0",
        icon: Zap, accent: "warning",
      },
      {
        key: "total_subscribers", title: "إجمالي المشتركين",
        value: o.total_subscribers?.toLocaleString() || o.fan_count?.toLocaleString() || "—",
        change: pc.fan_count_change ?? null,
        icon: Users, accent: "success",
      },
      {
        key: "interaction_rate", title: "معدل التفاعل",
        value: o.interaction_rate != null ? `${o.interaction_rate}%` : "—",
        icon: Target, accent: "info",
      },
      {
        key: "avg_response_time", title: "متوسط وقت الرد",
        value: o.avg_response_time != null ? `${o.avg_response_time}ث` : "—",
        icon: Clock, accent: "warning",
      },
    ]
  }, [overview, comparisonData])

  const dailyChart = useMemo(() => {
    if (!dailyTrend?.length) return []
    return dailyTrend.map(d => ({
      ...d,
      date: (() => { try { return new Date(d.date).toLocaleDateString("ar-SA", { month: "short", day: "numeric" }) } catch { return d.date } })(),
    }))
  }, [dailyTrend])

  const sentimentChart = useMemo(() => {
    if (!sentimentTrend?.length) return []
    return sentimentTrend.map(d => ({
      ...d,
      date: (() => { try { return new Date(d.date).toLocaleDateString("ar-SA", { month: "short", day: "numeric" }) } catch { return d.date } })(),
    }))
  }, [sentimentTrend])

  const topRules = useMemo(() => {
    if (!topRulesData?.length) return []
    const max = Math.max(...topRulesData.map(r => r.count), 1)
    return topRulesData.map(r => ({ ...r, pct: (r.count / max) * 100 }))
  }, [topRulesData])

  const topCommenters = topCommentersData || []
  const periodComparison = comparisonData || {}
  const maxCommentCount = Math.max(...topCommenters.map(c => c.count), 1)

  // ── Export ──
  function exportCSV(data, filename) {
    if (!data.length) return
    const header = Object.keys(data[0]).join(",")
    const rows = data.map(r => Object.values(r).map(v => `"${v}"`).join(","))
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function handleExport() {
    const rows = dailyChart.map(d => ({ التاريخ: d.date, الردود: d.replies || d.count || 0 }))
    exportCSV(rows, `analytics-${format(new Date(), "yyyy-MM-dd")}.csv`)
  }

  return (
    <div className="content-container space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold">تحليلات متقدمة</h1>
          <p className="text-sm text-muted-foreground">مقاييس شاملة لأداء التفاعل</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 أيام</SelectItem>
              <SelectItem value="30">30 يوم</SelectItem>
              <SelectItem value="90">90 يوم</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!dailyChart.length && !ovLoading} className="min-h-[44px] sm:min-h-0">
            <Download className="ml-1 h-4 w-4" />تصدير
          </Button>
        </div>
      </div>

      {anyError && !ovLoading ? (
        <div className="flex flex-col items-center py-20 gap-3">
          <AlertTriangle className="h-12 w-12 text-destructive/60" />
          <p className="text-sm text-muted-foreground">حدث خطأ في تحميل البيانات</p>
          <Button variant="outline" size="sm" onClick={() => refetchOv()}>
            <RefreshCw className="h-3 w-3 ml-1" />إعادة المحاولة
          </Button>
        </div>
      ) : (
        <>
          {/* KPI Cards Row — 6 cards, 3-col md, 6-col lg */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {kpis.map(k => (
              <KpiCard key={k.key} {...k} loading={ovLoading} error={!!ovError} />
            ))}
          </div>

          {/* Charts Grid 2x2 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Daily trend — AreaChart */}
            <ChartCard title="الاتجاه اليومي" icon={TrendingUp} loading={dtLoading} isEmpty={dailyChart.length < 2}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyChart}>
                  <defs>
                    <linearGradient id="daily-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={tooltipContent} />
                  <Area type="monotone" dataKey="replies" name="الردود" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#daily-fill)" activeDot={{ r: 4 }} />
                  {dailyChart[0]?.comments != null && (
                    <Area type="monotone" dataKey="comments" name="التعليقات" stroke="hsl(var(--info))" strokeWidth={2} fill="none" activeDot={{ r: 4 }} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Hourly heatmap — BarChart */}
            <ChartCard title="التوزيع الساعي" icon={Clock} loading={hrLoading} isEmpty={!hourly?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={h => `${h}`} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) =>
                    active && payload?.length
                      ? <div className="rounded-xl border bg-card/95 backdrop-blur-sm px-3 py-2 text-xs shadow-lg glass-heavy">{label}:00 — <strong>{payload[0].value}</strong></div>
                      : null
                  } />
                  <Bar dataKey="count" name="الردود" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Top rules — horizontal BarChart */}
            <ChartCard title="أفضل القواعد" icon={BarChart3} loading={trLoading} isEmpty={!topRules.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRules} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) =>
                    active && payload?.length
                      ? <div className="rounded-xl border bg-card/95 backdrop-blur-sm px-3 py-2 text-xs shadow-lg glass-heavy">{label}: <strong>{payload[0].value}</strong></div>
                      : null
                  } />
                  <Bar dataKey="count" name="الردود" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Sentiment trend — multi-line/stacked */}
            <ChartCard title="اتجاه المشاعر" icon={Smile} loading={stLoading} isEmpty={!sentimentChart.length}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sentimentChart}>
                  <defs>
                    <linearGradient id="pos-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(152, 72%, 26%)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(152, 72%, 26%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="neg-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(0, 88%, 50%)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(0, 88%, 50%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="neu-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(211, 92%, 42%)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(211, 92%, 42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={tooltipContent} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="positive" name="إيجابي" stroke="hsl(152, 72%, 26%)" strokeWidth={2} fill="url(#pos-fill)" />
                  <Area type="monotone" dataKey="negative" name="سلبي" stroke="hsl(0, 88%, 50%)" strokeWidth={2} fill="url(#neg-fill)" />
                  <Area type="monotone" dataKey="neutral" name="محايد" stroke="hsl(211, 92%, 42%)" strokeWidth={2} fill="url(#neu-fill)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Bottom Section: Top Commenters + Comparison */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top Commenters */}
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  أفضل المعلقين
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {tcLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}</div>
                ) : topCommenters.length > 0 ? (
                  <div className="space-y-2">
                    {topCommenters.map((c, i) => (
                      <div key={c.name || i} className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground w-5 text-left font-mono text-xs">{i + 1}.</span>
                        <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                          {(c.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="font-mono tabular-nums text-xs text-muted-foreground">{c.count}</span>
                        <div className="h-2 w-20 rounded-full bg-muted overflow-hidden hidden sm:block">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${(c.count / maxCommentCount) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">لا يوجد معلقون بارزون في هذه الفترة</p>
                )}
              </CardContent>
            </Card>

            {/* Period Comparison */}
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="size-4 text-muted-foreground" />
                  مقارنة الفترات
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {cpLoading ? (
                  <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
                ) : Object.keys(periodComparison).length > 0 ? (
                  <Tabs defaultValue="replies" className="w-full">
                    <TabsList className="mb-3">
                      <TabsTrigger value="replies" className="text-xs">الردود</TabsTrigger>
                      <TabsTrigger value="engagement" className="text-xs">التفاعل</TabsTrigger>
                      <TabsTrigger value="sentiment" className="text-xs">المشاعر</TabsTrigger>
                    </TabsList>
                    <TabsContent value="replies">
                      <ComparisonTable data={periodComparison.replies} />
                    </TabsContent>
                    <TabsContent value="engagement">
                      <ComparisonTable data={periodComparison.engagement} />
                    </TabsContent>
                    <TabsContent value="sentiment">
                      <ComparisonTable data={periodComparison.sentiment} />
                    </TabsContent>
                  </Tabs>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">بيانات غير كافية للمقارنة</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Full Comparison Table */}
          {Object.keys(periodComparison).length > 0 && periodComparison.full && (
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">جدول المقارنة الكامل</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="data-table-wrapper data-table-card-view"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">المقياس</TableHead>
                      <TableHead className="text-xs">الفترة الحالية</TableHead>
                      <TableHead className="text-xs">الفترة السابقة</TableHead>
                      <TableHead className="text-xs">التغيير</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodComparison.full.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell data-label="المقياس" className="text-xs font-medium">{row.metric}</TableCell>
                        <TableCell data-label="الفترة الحالية" className="text-xs font-mono tabular-nums">{row.current}</TableCell>
                        <TableCell data-label="الفترة السابقة" className="text-xs font-mono tabular-nums">{row.previous}</TableCell>
                        <TableCell data-label="التغيير">
                          <Badge variant={row.change >= 0 ? "default" : "destructive"} className="text-[10px] rounded-full">
                            {row.change >= 0 ? "+" : ""}{row.change}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></div>
              </CardContent>
            </Card>
          )}

          {/* Peak Hour Insight */}
          {peakHourData?.hour != null && (
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  ذروة النشاط اليومي: <strong className="text-foreground">{peakHourData.hour}:00</strong>
                  {peakHourData.count != null && <> — {peakHourData.count} رد</>}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="mobile-nav-spacer" />
        </>
      )}
    </div>
  )
}

function ComparisonTable({ data }) {
  if (!data?.length) return <p className="text-xs text-muted-foreground text-center py-6">لا توجد بيانات مقارنة</p>
  return (
    <div className="space-y-2">
      {data.map((row, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span className="text-xs font-medium text-muted-foreground">{row.label}</span>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="font-mono tabular-nums text-xs">{row.current}</span>
              <span className="text-muted-foreground mx-1 text-xs">/</span>
              <span className="font-mono tabular-nums text-xs text-muted-foreground">{row.previous}</span>
            </div>
            <Badge variant={row.change >= 0 ? "default" : "destructive"} className="text-[10px] rounded-full min-w-[48px] justify-center">
              {row.change >= 0 ? "↑" : "↓"} {Math.abs(row.change)}%
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}
