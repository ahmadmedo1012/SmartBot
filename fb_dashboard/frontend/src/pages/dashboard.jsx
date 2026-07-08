import { useQuery } from "@tanstack/react-query"
import { useMemo, useEffect } from "react"
import { fetchStats, fetchRules, fetchBotStatus, fetchRecentActivity,
  fetchReplies, fetchAiStatus } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"
import { MessageSquare, Bot, RefreshCw, AlertTriangle, Activity, Users, ArrowUp, ArrowDown } from "lucide-react"

// ═══════════════════════════════════════════
// Metric card (primary = accent tint, secondary = neutral)
// ═══════════════════════════════════════════

function MetricCard({ title, value, subtitle, icon: Icon, primary, loading, change }) {
  if (loading) return (
    <Card className="overflow-hidden"><CardContent className="p-5"><div className="flex items-center gap-4"><Skeleton className="size-12 rounded-xl shrink-0" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-28" /></div></div></CardContent></Card>
  )
  return (
    <Card className={`overflow-hidden ${primary ? "ring-1 ring-primary/20 bg-primary/[0.02]" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={`flex size-12 items-center justify-center rounded-xl shrink-0 ${primary ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
            <div className="flex items-baseline gap-2">
              <span className={`font-bold font-mono tabular-nums ${primary ? "text-2xl text-foreground" : "text-xl text-foreground"}`}>{value}</span>
              {change !== undefined && (
                <span className={`text-xs font-medium flex items-center gap-0.5 ${change >= 0 ? "text-success" : "text-destructive"}`}>
                  {change >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                  {Math.abs(change)}%
                </span>
              )}
            </div>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════
// Status strip (compact row of mini indicators)
// ═══════════════════════════════════════════

function StatusStrip({ botStatus, aiStatus }) {
  const items = [
    { label: "البوت", value: botStatus?.running ? "شغال" : "متوقف", color: botStatus?.running ? "bg-success" : "bg-destructive" },
    { label: "AI", value: aiStatus?.available ? "متصل" : "غير مفعل", color: aiStatus?.available ? "bg-success" : "bg-muted-foreground" },
  ]
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${item.color}`} />
          <span>{item.label}: <strong className="text-foreground">{item.value}</strong></span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════
// Recent activity (compact timeline)
// ═══════════════════════════════════════════

function ActivityTimeline({ activities, loading }) {
  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}</div>
  if (!activities?.length) return <p className="text-sm text-muted-foreground text-center py-8">لا يوجد نشاط حديث</p>
  return (
    <div className="space-y-0">
      {activities.slice(0, 5).map((a, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 border-b last:border-b-0">
          <div className={`size-1.5 rounded-full shrink-0 ${a.type === "reply" ? "bg-primary" : "bg-muted-foreground/30"}`} />
          <p className="text-sm flex-1 truncate">{a.text}</p>
          <span className="text-xs text-muted-foreground shrink-0">{a.time ? format(new Date(a.time), "HH:mm") : ""}</span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════
// MAIN DASHBOARD — Command (operator) composition
// ═══════════════════════════════════════════

export function Dashboard(_p) {
  useEffect(() => { document.title = "SmartBot" }, [])

  const { data: stats, isLoading, error, refetch } = useQuery({ queryKey: ["stats"], queryFn: fetchStats, refetchInterval: 10000 })
  const { data: rules = [] } = useQuery({ queryKey: ["rules"], queryFn: fetchRules })
  const { data: botStatus } = useQuery({ queryKey: ["bot-status"], queryFn: fetchBotStatus, refetchInterval: 10000 })
  const { data: aiStatus } = useQuery({ queryKey: ["ai-status"], queryFn: fetchAiStatus })
  const { data: activities, isLoading: actLoading } = useQuery({ queryKey: ["recent-activity"], queryFn: () => fetchRecentActivity(8), refetchInterval: 15000 })
  const { data: recent } = useQuery({ queryKey: ["replies-recent"], queryFn: () => fetchReplies(1, 5) })

  const chartData = useMemo(() => stats?.chart
    ? Object.entries(stats.chart).map(([d, c]) => ({ date: (() => { try { return new Date(d).toLocaleDateString("ar-SA", { weekday: "short", day: "numeric" }) } catch { return d } })(), replies: c }))
    : [], [stats])

  const activeRules = rules.filter(r => r.enabled).length
  const recentReplies = recent?.items || []

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header + Status strip ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground mt-0.5">مرحباً بك في SmartBot</p>
        </div>
        <div className="flex items-center gap-4">
          <StatusStrip botStatus={botStatus} aiStatus={aiStatus} />
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => refetch()}>
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── Metric strip (compact row, 4 cards) ── */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard title="إجمالي الردود" value={stats?.total_replies?.toLocaleString() || "0"} subtitle="كل الردود" icon={MessageSquare} loading={isLoading} change={12} />
        <MetricCard title="ردود اليوم" value={stats?.today_replies?.toLocaleString() || "0"} subtitle="آخر 24 ساعة" icon={Activity} loading={isLoading} primary />
        <MetricCard title="المتابعون" value={stats?.fan_count?.toLocaleString() || "—"} subtitle="متابعي الصفحة" icon={Users} loading={isLoading} />
        <MetricCard title="القواعد النشطة" value={activeRules || "0"} subtitle={`من ${rules.length}`} icon={Bot} loading={isLoading} />
      </div>

      {/* ── Failed state ── */}
      {error && !isLoading && (
        <Card><CardContent className="flex flex-col items-center py-12">
          <AlertTriangle className="size-10 text-destructive/60 mb-3" />
          <p className="text-sm text-muted-foreground mb-3">{error?.message || "فشل التحميل"}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="size-3.5 ml-1" />إعادة</Button>
        </CardContent></Card>
      )}

      {/* ── Main grid: chart (2/3) + sidebar (1/3) ── */}
      {!error && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">النشاط اليومي</CardTitle>
                <Badge variant="outline" className="text-xs rounded-full font-mono tabular-nums">{stats?.total_replies || 0} رد</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[260px] w-full rounded-lg" />
              ) : chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs><linearGradient id="af" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.15} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} dy={8} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-lg border bg-card px-3 py-2 text-sm shadow-lg"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold font-mono tabular-nums">{payload[0].value}</p></div> : null} />
                    <Area type="monotone" dataKey="replies" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#af)" activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--background))", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="flex flex-col items-center py-12"><Activity className="size-8 text-muted-foreground/20 mb-2" /><p className="text-sm text-muted-foreground">بيانات غير كافية بعد</p></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">آخر النشاطات</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ActivityTimeline activities={activities} loading={actLoading} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Work queue table (dominant, 60%+) ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">آخر الردود</CardTitle>
            <Badge variant="outline" className="text-xs rounded-full font-mono tabular-nums">{stats?.total_replies || 0}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
          ) : recentReplies.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-8"><span className="size-1.5 rounded-full bg-muted-foreground/30 block" /></th>
                    <th>صاحب التعليق</th>
                    <th>التعليق</th>
                    <th>الرد</th>
                    <th className="w-24">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReplies.map(r => (
                    <tr key={r.id} className="hover:bg-muted/40 cursor-pointer transition-colors">
                      <td><span className="size-1.5 rounded-full bg-success block mx-auto" /></td>
                      <td className="font-medium">{r.commenter_name}</td>
                      <td className="text-muted-foreground max-w-[200px] truncate">{r.comment_text}</td>
                      <td className="text-muted-foreground max-w-[200px] truncate text-xs font-mono">{r.reply_text}</td>
                      <td className="text-muted-foreground text-xs whitespace-nowrap font-mono tabular-nums">
                        {r.created_at ? format(new Date(r.created_at), "yyyy/MM/dd HH:mm", { locale: arSA }) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center py-12">
              <MessageSquare className="size-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">لا توجد ردود بعد</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mobile-nav-spacer" />
    </div>
  )
}
