import { useState, useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  fetchAnalyticsOverview, fetchHourlyStats, fetchRules, fetchReplies,
} from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Area, AreaChart, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { Download, BarChart3, PieChart as PieIcon, TrendingUp, MessageSquare, Calendar } from "lucide-react"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"

function exportCSV(data, filename) {
  if (!data.length) return
  const header = Object.keys(data[0]).join(",")
  const rows = data.map(r => Object.values(r).map(v => `"${v}"`).join(","))
  const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" })
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function Reports({ role }) {
  useEffect(() => { document.title = "التقارير | SmartBot" }, [])
  const [days, setDays] = useState("7")

  const { data: analytics, isLoading: aLoading } = useQuery({
    queryKey: ["analytics-overview", days], queryFn: () => fetchAnalyticsOverview(parseInt(days)),
  })
  const { data: hourly, isLoading: hLoading } = useQuery({
    queryKey: ["hourly-stats"], queryFn: fetchHourlyStats,
  })
  const { data: rules = [] } = useQuery({ queryKey: ["rules"], queryFn: fetchRules })
  const { data: repliesRes } = useQuery({
    queryKey: ["replies-all"], queryFn: () => fetchReplies(1, 100),
  })

  const chartData = useMemo(() => analytics?.daily_breakdown
    ? Object.entries(analytics.daily_breakdown).map(([d, c]) => ({
        date: (() => { try { return new Date(d).toLocaleDateString("ar-SA", { month: "short", day: "numeric" }) } catch { return d } })(),
        replies: c
      }))
    : [], [analytics])

  const topRules = useMemo(() => analytics?.top_rules?.map(t => ({
    name: rules.find(r => r.id === t.rule_id)?.name || `#${t.rule_id}`,
    count: t.count,
  })) || [], [analytics, rules])

  const pieData = useMemo(() => {
    const sd = analytics?.sentiment_distribution || {}
    return [
      { name: "إيجابي", value: sd.إيجابي || 0, color: "hsl(152, 72%, 26%)" },
      { name: "سلبي", value: sd.سلبي || 0, color: "hsl(0, 88%, 50%)" },
      { name: "محايد", value: sd.محايد || 0, color: "hsl(211, 92%, 42%)" },
    ].filter(d => d.value > 0)
  }, [analytics])

  const allReplies = repliesRes?.items || []

  return (
    <div className="content-container space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold">التقارير</h1>
          <p className="text-sm text-muted-foreground">تحليلات متقدمة لأداء البوت والتفاعلات</p>
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
          <Button variant="outline" size="sm" onClick={() => exportCSV(allReplies, `reports-${format(new Date(), "yyyy-MM-dd")}.csv`)} disabled={!allReplies.length} className="min-h-[44px] sm:min-h-0">
            <Download className="ml-1 h-4 w-4" />تصدير
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الردود", value: analytics?.total_replies || 0 },
          { label: "ردود اليوم", value: analytics?.today_replies || 0 },
          { label: "المتابعون", value: analytics?.fan_count || "—" },
          { label: "ذروة النشاط", value: analytics?.peak_hour != null ? `${analytics.peak_hour}:00` : "—" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold font-mono tabular-nums mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Daily Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              الاتجاه اليومي
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aLoading ? <Skeleton className="h-48 w-full" /> : chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs><linearGradient id="rpf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-xl border bg-card/95 backdrop-blur-sm px-3 py-2 text-xs shadow-lg glass-heavy">{label}: <strong>{payload[0].value}</strong></div> : null} />
                  <Area type="monotone" dataKey="replies" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rpf)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">بيانات غير كافية</p>}
          </CardContent>
        </Card>

        {/* Hourly */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="size-4 text-muted-foreground" />
              التوزيع الساعي
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hLoading ? <Skeleton className="h-48 w-full" /> : hourly?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourly}>
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={h => `${h}:00`} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lg">{label}:00 — <strong>{payload[0].value}</strong></div> : null} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4,4,0,0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات</p>}
          </CardContent>
        </Card>

        {/* Sentiment Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieIcon className="size-4 text-muted-foreground" />
              توزيع المشاعر
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="flex items-center justify-center gap-6">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {pieData.map(e => (
                    <div key={e.name} className="flex items-center gap-2 text-xs">
                      <span className="size-3 rounded-full" style={{ backgroundColor: e.color }} />
                      <span>{e.name}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{e.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات مشاعر</p>}
          </CardContent>
        </Card>

        {/* Top Rules */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="size-4 text-muted-foreground" />
              أفضل القواعد
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topRules.length > 0 ? (
              <div className="space-y-2">
                {topRules.slice(0, 8).map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-5 text-left font-mono">{i + 1}.</span>
                    <span className="flex-1 truncate">{r.name}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{r.count}</span>
                    <div className="h-2 w-24 rounded-full bg-muted overflow-hidden hidden sm:block">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(r.count / Math.max(...topRules.map(x => x.count))) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mobile-nav-spacer" />
    </div>
  )
}
