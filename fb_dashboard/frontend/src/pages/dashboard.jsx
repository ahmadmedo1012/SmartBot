import { useQuery } from "@tanstack/react-query"
import { useMemo, useState, useEffect } from "react"
import {
  fetchStats, fetchRules, fetchBotStatus, fetchReplies,
  fetchRecentActivity, fetchAiStatus, fetchTemplates,
} from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"
import {
  MessageSquare, Users, Bot, RefreshCw, AlertTriangle, Activity,
  Clock, Zap, Brain, Inbox, ChevronUp, ThumbsUp, ThumbsDown, Meh,
  Target, HeartHandshake,
} from "lucide-react"

function MetricCard({ title, value, subtitle, icon: Icon, accent, loading }) {
  if (loading) {
    return (
      <Card className="overflow-hidden">
        <div className={`h-[2px] ${accent === "primary" ? "bg-primary" : accent === "info" ? "bg-info" : accent === "success" ? "bg-success" : "bg-warning"}`} />
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 sm:size-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="overflow-hidden">
      <div className={`h-[2px] ${accent === "primary" ? "bg-primary" : accent === "info" ? "bg-info" : accent === "success" ? "bg-success" : "bg-warning"}`} />
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className={`flex size-9 sm:size-10 items-center justify-center rounded-xl shrink-0 ${
            accent === "primary" ? "bg-primary/15 text-primary" :
            accent === "info" ? "bg-info/15 text-info" :
            accent === "success" ? "bg-success/15 text-success" :
            "bg-warning/15 text-warning"
          }`}>
            <Icon className="size-[18px] sm:size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground truncate">{title}</p>
            <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-foreground mt-0.5">{value}</div>
            {subtitle && <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AiWidget() {
  const { data: aiStatus } = useQuery({ queryKey: ["ai-status"], queryFn: fetchAiStatus })
  const { data: templates = [] } = useQuery({ queryKey: ["templates"], queryFn: () => fetchTemplates() })
  return (
    <Card className="panel-top-accent-info h-full">
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
            <Brain className="size-3.5 sm:size-4 text-info" />AI
          </CardTitle>
          <Badge variant="outline" className={`text-[10px] rounded-full ${aiStatus?.available ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
            {aiStatus?.available ? "متصل" : "غير مفعل"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-1">
        {aiStatus?.available ? (
          <p className="text-xs text-muted-foreground">{templates.length} قالب · {aiStatus.provider}</p>
        ) : (
          <p className="text-xs text-muted-foreground/70">ضبط OpenAI/Gemini API للردود الذكية</p>
        )}
      </CardContent>
    </Card>
  )
}

function ActivityLine({ activities, loading }) {
  if (loading) return <div className="space-y-2 p-3">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}</div>
  if (!activities?.length) return <p className="text-xs text-muted-foreground text-center py-6">لا يوجد نشاط حديث</p>
  return (
    <div className="divide-y max-h-[220px] overflow-y-auto">
      {activities.slice(0, 5).map((a, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5 px-3 text-xs">
          <div className={`size-1.5 rounded-full shrink-0 ${a.type === "reply" ? "bg-success" : a.level === "ERROR" ? "bg-destructive" : "bg-muted-foreground/30"}`} />
          <span className="truncate flex-1">{a.text}</span>
          <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
            {a.time ? format(new Date(a.time), "HH:mm") : ""}
          </span>
        </div>
      ))}
    </div>
  )
}

function SentimentBar({ distribution }) {
  const items = [
    { key: "إيجابي", color: "bg-success" },
    { key: "سلبي", color: "bg-destructive" },
    { key: "محايد", color: "bg-info" },
  ]
  const total = Object.values(distribution || {}).reduce((a, b) => a + b, 0) || 1
  return total > 1 ? (
    <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-muted">
      {items.map(({ key, color }) => {
        const pct = ((distribution?.[key] || 0) / total) * 100
        return pct > 0 ? <div key={key} className={`${color} transition-all`} style={{ width: `${pct}%` }} title={key} /> : null
      })}
    </div>
  ) : (
    <div className="h-2 rounded-full bg-muted" />
  )
}

export function Dashboard({ role }) {
  useEffect(() => { document.title = "SmartBot" }, [])
  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ["stats"], queryFn: fetchStats, refetchInterval: 15000,
  })
  const { data: rules = [] } = useQuery({ queryKey: ["rules"], queryFn: fetchRules })
  const { data: botStatus } = useQuery({ queryKey: ["bot-status"], queryFn: fetchBotStatus, refetchInterval: 15000 })
  const { data: recent } = useQuery({ queryKey: ["replies-recent"], queryFn: () => fetchReplies(1, 5) })
  const { data: activities, isLoading: actLoading } = useQuery({
    queryKey: ["recent-activity"], queryFn: () => fetchRecentActivity(8), refetchInterval: 20000,
  })
  const { data: analytics } = useQuery({ queryKey: ["analytics-7"], queryFn: () => fetchAnalyticsOverview(7) })

  const chartData = useMemo(() => stats?.chart
    ? Object.entries(stats.chart).map(([date, count]) => ({
        date: (() => { try { return new Date(date).toLocaleDateString("ar-SA", { weekday: "short", day: "numeric" }) } catch { return date } })(),
        replies: count
      }))
    : [], [stats])

  const canEdit = role === "admin" || role === "editor"

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-base sm:text-xl font-bold">لوحة التحكم</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">نظرة عامة شاملة</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`gap-1 px-2 py-0.5 rounded-full text-[10px] ${
            botStatus?.running ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
          }`}>
            <span className={`size-1.5 rounded-full ${botStatus?.running ? "bg-success animate-pulse" : "bg-destructive"}`} />
            {botStatus?.running ? "شغال" : "متوقف"}
          </Badge>
        </div>
      </div>

      {error && !isLoading ? (
        <div className="flex flex-col items-center py-16">
          <AlertTriangle className="h-10 w-10 text-destructive/60 mb-3" />
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3 w-3 ml-1" />إعادة</Button>
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <MetricCard title="إجمالي الردود" value={stats?.total_replies?.toLocaleString() || "0"} subtitle="كل الردود" icon={MessageSquare} accent="primary" loading={isLoading} />
            <MetricCard title="ردود اليوم" value={stats?.today_replies?.toLocaleString() || "0"} subtitle="آخر 24 ساعة" icon={Activity} accent="info" loading={isLoading} />
            <MetricCard title="المتابعون" value={stats?.fan_count?.toLocaleString() || "—"} subtitle="متابعي الصفحة" icon={Users} accent="success" loading={isLoading} />
            <MetricCard title="القواعد النشطة" value={rules.filter(r => r.enabled).length || "0"} subtitle={`من ${rules.length}`} icon={Bot} accent="warning" loading={isLoading} />
          </div>

          {/* Chart + Sidebar */}
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card className="panel-top-accent-primary">
                <CardHeader className="pb-2 px-4 pt-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                      <Activity className="size-3.5 sm:size-4 text-muted-foreground" />
                      النشاط
                    </CardTitle>
                    {stats?.total_replies > 0 && <Badge variant="outline" className="text-[10px] rounded-full">{stats.total_replies}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="px-2 sm:px-4 pb-4">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                        <defs><linearGradient id="af" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={6} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dx={-4} />
                        <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                          <div className="rounded-lg border bg-card px-2 py-1.5 text-xs shadow-lg">{label}: <strong>{payload[0].value}</strong></div>
                        ) : null} cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "3 3" }} />
                        <Area type="monotone" dataKey="replies" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#af)" activeDot={{ r: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center py-8"><Activity className="h-8 w-8 text-muted-foreground/20 mb-2" /><p className="text-xs text-muted-foreground">لا توجد بيانات كافية</p></div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3">
              <AiWidget />
              <Card>
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                    <Target className="size-3.5 sm:size-4 text-muted-foreground" />
                    الأكثر استخداماً
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-1">
                  {stats?.top_rule_id ? (
                    <p className="text-xs font-semibold">{rules.find(r => r.id === stats.top_rule_id)?.name || "—"}</p>
                  ) : <p className="text-xs text-muted-foreground">لا توجد إحصائيات</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 px-4 pt-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs sm:text-sm font-semibold">المشاعر</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-1">
                  <SentimentBar distribution={analytics?.sentiment_distribution} />
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>👍 {analytics?.sentiment_distribution?.إيجابي || 0}</span>
                    <span>👎 {analytics?.sentiment_distribution?.سلبي || 0}</span>
                    <span>😐 {analytics?.sentiment_distribution?.محايد || 0}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent Replies */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                  <MessageSquare className="size-3.5 sm:size-4 text-muted-foreground" />
                  آخر الردود
                </CardTitle>
                <Badge variant="outline" className="text-[10px] rounded-full">{stats?.total_replies || 0}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(recent?.items || []).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="data-table data-table-card-view">
                    <thead>
                      <tr>
                        <th scope="col">المعلق</th>
                        <th scope="col">النص</th>
                        <th scope="col">الرد</th>
                        <th scope="col">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(recent?.items || []).map(r => (
                        <tr key={r.id}>
                          <td className="font-medium text-xs" data-label="المعلق">{r.commenter_name}</td>
                          <td className="text-muted-foreground max-w-[100px] sm:max-w-[180px] truncate text-xs" data-label="النص">{r.comment_text}</td>
                          <td className="text-muted-foreground max-w-[100px] sm:max-w-[180px] truncate text-[11px] font-mono" data-label="الرد">{r.reply_text}</td>
                          <td className="text-muted-foreground text-[10px] font-mono whitespace-nowrap" data-label="التاريخ">
                            {r.created_at ? format(new Date(r.created_at), "MM/dd HH:mm", { locale: arSA }) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center py-8">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/20 mb-2" />
                  <p className="text-xs text-muted-foreground">لا توجد ردود بعد</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                <Activity className="size-3.5 sm:size-4 text-muted-foreground" />
                آخر النشاطات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ActivityLine activities={activities} loading={actLoading} />
            </CardContent>
          </Card>

          {canEdit && (
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              <Button variant="outline" size="sm" className="shrink-0 text-xs gap-1 rounded-full"
                onClick={() => fetch("/api/bot/trigger", { method: "POST" }).then(() => {}).catch(() => {})}>
                <RefreshCw className="size-3" />تشغيل البوت
              </Button>
              <Button variant="outline" size="sm" className="shrink-0 text-xs gap-1 rounded-full"
                onClick={() => window.location.href = "/static/index.html#/posts"}>
                نشر منشور
              </Button>
              <Button variant="outline" size="sm" className="shrink-0 text-xs gap-1 rounded-full"
                onClick={() => window.location.href = "/static/index.html#/messages"}>
                صندوق الوارد
              </Button>
            </div>
          )}
        </>
      )}
      <div className="mobile-nav-spacer" />
    </div>
  )
}
