import { useQuery } from "@tanstack/react-query"
import { useMemo, useEffect } from "react"
import {
  fetchStats, fetchRules, fetchBotStatus, fetchReplies, fetchAnalyticsOverview,
  fetchRecentActivity, fetchAiStatus, fetchTemplates,
} from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { LivePulse } from "@/components/live-pulse"
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { toast } from "sonner"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"
import {
  MessageSquare, Users, Bot, RefreshCw, AlertTriangle, Activity,
  Clock, Zap, Sparkles, BarChart3, Brain,
  Inbox, ChevronUp, ThumbsUp, ThumbsDown, Meh,
  Target, HeartHandshake, Send,
} from "lucide-react"

// ── Chart Tooltip ──
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-lg rtl text-right">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-semibold tabular-nums font-mono">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Metric Card ──
function MetricCard({ title, value, subtitle, icon: Icon, accent, trend, loading }) {
  if (loading) {
    return (
      <Card className="relative overflow-hidden">
        <div className={`absolute inset-x-0 top-0 h-[2px] ${accent === "primary" ? "bg-primary" : accent === "info" ? "bg-info" : accent === "success" ? "bg-success" : "bg-warning"}`} />
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <Skeleton className="size-11 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="relative overflow-hidden group hover:shadow-lg transition-all">
      <div className={`absolute inset-x-0 top-0 h-[2px] ${accent === "primary" ? "bg-primary" : accent === "info" ? "bg-info" : accent === "success" ? "bg-success" : "bg-warning"}`} />
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={`flex size-11 items-center justify-center rounded-xl shrink-0 ${
            accent === "primary" ? "bg-primary/15 text-primary" :
            accent === "info" ? "bg-info/15 text-info" :
            accent === "success" ? "bg-success/15 text-success" :
            "bg-warning/15 text-warning"
          }`}>
            <Icon className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
            <div className="text-2xl font-bold font-mono tabular-nums text-foreground mt-0.5">{value}</div>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-0.5 text-xs font-medium shrink-0 mt-1 ${
              trend >= 0 ? "text-success" : "text-destructive"
            }`}>
              <ChevronUp className={`size-3 ${trend < 0 ? "rotate-180" : ""}`} />
              <span className="tabular-nums">{Math.abs(trend)}%</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Activity Timeline ──
function ActivityTimeline({ activities, loading }) {
  if (loading) {
    return <div className="space-y-3 p-4">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
  }
  if (!activities?.length) {
    return (
      <div className="flex flex-col items-center py-12">
        <Activity className="h-10 w-10 text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground">لا يوجد نشاط حديث</p>
      </div>
    )
  }
  return (
    <div className="space-y-0">
      {activities.slice(0, 8).map((a, i) => (
        <div key={i} className="flex items-start gap-3 py-2.5 px-4 border-b last:border-b-0 hover:bg-muted/30 transition-colors">
          <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
            a.type === "reply" ? "bg-success/15 text-success" :
            a.level === "ERROR" ? "bg-destructive/15 text-destructive" :
            "bg-muted text-muted-foreground"
          }`}>
            {a.type === "reply" ? <MessageSquare className="size-4" /> : <Activity className="size-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground truncate">{a.text}</p>
            {a.detail && <p className="text-xs text-muted-foreground truncate">{a.detail}</p>}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
            {a.time ? format(new Date(a.time), "HH:mm") : ""}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── AI Insights Widget ──
function AiInsightsWidget({ stats }) {
  const { data: aiStatus } = useQuery({
    queryKey: ["ai-status"], queryFn: fetchAiStatus,
  })
  const { data: templates = [] } = useQuery({
    queryKey: ["templates"], queryFn: () => fetchTemplates(),
  })

  return (
    <Card className="panel-top-accent-info h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Brain className="size-4 text-info" />
            الذكاء الاصطناعي
          </CardTitle>
          <Badge variant="outline" className={`text-xs rounded-full ${aiStatus?.available ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground"}`}>
            {aiStatus?.available ? "متصل" : "غير مفعل"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {aiStatus?.available ? (
          <>
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4 text-warning" />
              <span className="text-muted-foreground">المزود: <strong className="text-foreground">{aiStatus.provider}</strong></span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">قوالب الردود</p>
                <p className="text-lg font-bold font-mono tabular-nums">{templates.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">تحليلات اليوم</p>
                <p className="text-lg font-bold font-mono tabular-nums">{stats?.today_replies || 0}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">AI جاهز لتوليد ردود ذكية — استخدمه من شاشة الردود أو التعليقات</p>
          </>
        ) : (
          <div className="flex flex-col items-center py-4 text-center">
            <Brain className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">ضبط OpenAI/Gemini API</p>
            <p className="text-xs text-muted-foreground/70 mt-1">لتفعيل الردود الذكية</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Sentiment Mini Chart ──
function SentimentMini({ distribution }) {
  const items = [
    { key: "إيجابي", label: "إيجابي", color: "hsl(152, 72%, 26%)", icon: ThumbsUp },
    { key: "سلبي", label: "سلبي", color: "hsl(0, 88%, 50%)", icon: ThumbsDown },
    { key: "محايد", label: "محايد", color: "hsl(211, 92%, 42%)", icon: Meh },
  ]
  const total = Object.values(distribution || {}).reduce((a, b) => a + b, 0) || 1
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <HeartHandshake className="size-4 text-muted-foreground" />
          توزيع المشاعر
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total > 1 ? (
          <div className="space-y-3">
            {items.map(({ key, label, color, icon: Icon }) => {
              const count = distribution?.[key] || 0
              const pct = Math.round((count / total) * 100)
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Icon className="size-3.5" style={{ color }} />
                      <span className="text-muted-foreground">{label}</span>
                    </div>
                    <span className="font-mono tabular-nums text-xs text-foreground">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات كافية</p>
        )}
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════

export function Dashboard({ role }) {
  useEffect(() => { document.title = "لوحة التحكم | SmartBot" }, [])

  // ── Queries ──
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: ["stats"], queryFn: fetchStats, refetchInterval: 10000,
  })
  const { data: rules = [] } = useQuery({
    queryKey: ["rules"], queryFn: fetchRules,
  })
  const { data: botStatus } = useQuery({
    queryKey: ["bot-status"], queryFn: fetchBotStatus, refetchInterval: 10000,
  })
  const { data: recentRepliesData } = useQuery({
    queryKey: ["replies-recent"], queryFn: () => fetchReplies(1, 5),
  })
  const { data: analytics } = useQuery({
    queryKey: ["analytics-overview-7"], queryFn: () => fetchAnalyticsOverview(7),
  })
  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ["recent-activity"], queryFn: () => fetchRecentActivity(12), refetchInterval: 15000,
  })

  const loading = statsLoading
  const hasError = statsError
  const recentReplies = recentRepliesData?.items || []

  // ── Chart Data ──
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

  const canEdit = role === "admin" || role === "editor"

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground mt-1">نظرة عامة شاملة على أداء البوت والتفاعلات</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground/50 font-mono tabular-nums">v3.0.{new Date().toISOString().slice(5,10).replace("-","")}</span>
          <LivePulse />
          <Badge className={`gap-1.5 px-3 py-1 rounded-full text-xs ${
            botStatus?.running
              ? "bg-success/15 text-success border-success/30"
              : "bg-destructive/15 text-destructive border-destructive/30"
          }`}>
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
        <>
          {/* ── Row 1: Key Metrics ── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <MetricCard title="إجمالي الردود" value={stats?.total_replies?.toLocaleString() || "0"}
              subtitle="جميع الردود التلقائية" icon={MessageSquare} accent="primary" loading={loading} />
            <MetricCard title="ردود اليوم" value={stats?.today_replies?.toLocaleString() || "0"}
              subtitle="آخر 24 ساعة" icon={Activity} accent="info" loading={loading} />
            <MetricCard title="المتابعون" value={stats?.fan_count?.toLocaleString() || "—"}
              subtitle="متابعو الصفحة" icon={Users} accent="success" loading={loading} />
            <MetricCard title="القواعد النشطة" value={rules.filter(r => r.enabled).length || "0"}
              subtitle={`من أصل ${rules.length} قاعدة`} icon={Bot} accent="warning" loading={loading} />
            <MetricCard title="معدل الاستجابة" value={responseRate}
              subtitle="رد/يوم" icon={Zap} accent="info" loading={loading} />
          </div>

          {/* ── Row 2: Charts + Sidebar ── */}
          <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {/* Main chart — spans 2 cols */}
            <div className="lg:col-span-2 xl:col-span-2">
              <Card className="panel-top-accent-primary h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="size-4 text-muted-foreground" />
                      النشاط اليومي (آخر 7 أيام)
                    </CardTitle>
                    <Badge variant="outline" className="text-xs gap-1 rounded-full">
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
                      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                        <defs>
                          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={8} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dx={-4} />
                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "4 4" }} />
                        <Area type="monotone" dataKey="replies" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#areaFill)"
                          activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }} />
                      </AreaChart>
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

            {/* Right sidebar: AI + Top Rule */}
            <div className="space-y-4 lg:col-span-1 xl:col-span-1">
              <AiInsightsWidget stats={stats} />
              <Card className="panel-top-accent-warning">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Target className="size-4 text-muted-foreground" />
                    القاعدة الأكثر استخداماً
                  </CardTitle>
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

          {/* ── Row 3: Sentiment + Activity + Quick Actions ── */}
          <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {/* Sentiment distribution */}
            <div className="lg:col-span-1">
              <SentimentMini distribution={analytics?.sentiment_distribution} />
            </div>

            {/* Recent Activity Timeline */}
            <div className="lg:col-span-1 xl:col-span-2">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Activity className="size-4 text-muted-foreground" />
                      آخر النشاطات
                    </CardTitle>
                    <Badge variant="outline" className="text-xs rounded-full">مباشر</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <ActivityTimeline activities={activities} loading={activitiesLoading} />
                </CardContent>
              </Card>
            </div>

            {/* Quick actions — only for editors+ */}
            {canEdit && (
              <div className="lg:col-span-1">
                <Card className="h-full panel-top-accent-info">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="size-4 text-muted-foreground" />
                      إجراءات سريعة
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3 text-sm"
                      onClick={() => {
                        fetch("/api/bot/trigger", { method: "POST" })
                          .then(r => r.json())
                          .then(() => toast.success("تم تشغيل دورة البوت"))
                          .catch(() => toast.error("فشل تشغيل البوت"))
                      }}>
                      <RefreshCw className="size-4 text-info" />
                      تشغيل البوت الآن
                    </Button>
                    <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3 text-sm"
                      onClick={() => window.location.href = "/static/index.html#/posts"}>
                      <Send className="size-4 text-success" />
                      نشر منشور جديد
                    </Button>
                    <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3 text-sm"
                      onClick={() => window.location.href = "/static/index.html#/messages"}>
                      <Inbox className="size-4 text-warning" />
                      صندوق الوارد
                    </Button>
                    <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3 text-sm"
                      onClick={() => window.location.href = "/static/index.html#/rules"}>
                      <Bot className="size-4 text-primary" />
                      إدارة القواعد
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* ── Row 4: Recent Replies Table ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  آخر الردود
                </CardTitle>
                <Badge variant="outline" className="text-xs rounded-full">{stats?.total_replies || 0} رد</Badge>
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
        </>
      )}
    </div>
  )
}
