import { useQuery } from "@tanstack/react-query"
import { useMemo, useEffect, useRef } from "react"
import { motion, useSpring, useTransform, useInView } from "framer-motion"
import { fetchStats, fetchRules, fetchBotStatus, fetchRecentActivity,
  fetchReplies, fetchAiStatus } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"
import {
  MessageSquare, Bot, RefreshCw, AlertTriangle, Activity, Users,
  ArrowUp, ArrowDown, Sparkles, BarChart3, Clock,
  Inbox
} from "lucide-react"

// ═══════════════════════════════════════════
// Animated counter — spring-driven count-up
// ═══════════════════════════════════════════

function AnimatedCounter({ value, decimals = 0, suffix = "" }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const spring = useSpring(0, { stiffness: 40, damping: 12 })
  const display = useTransform(spring, (v) => v.toFixed(decimals) + suffix)
  useEffect(() => { if (inView) spring.set(Number(value) || 0) }, [inView, spring, value])
  return <span ref={ref}>{inView ? <motion.span>{display}</motion.span> : "0" + suffix}</span>
}

// ═══════════════════════════════════════════
// Metric card — glass effect, trend, icon container, hover lift
// ═══════════════════════════════════════════

const iconColors = {
  primary: "bg-primary/10 text-primary dark:bg-primary/15",
  accent: "bg-accent/10 text-accent dark:bg-accent/15",
  warning: "bg-warning/10 text-warning dark:bg-warning/15",
  info: "bg-info/10 text-info dark:bg-info/15",
}

function MetricCard({ title, value, subtitle, icon: Icon, color = "primary", loading, change }) {
  // Glass card with hover lift
  if (loading) return (
    <Card className="glass-card animate-pulse overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="group"
    >
      <Card className="glass-card overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex size-12 items-center justify-center rounded-xl shrink-0 ${iconColors[color] || iconColors.primary} transition-transform duration-300 group-hover:scale-110`}>
              <Icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground truncate mb-1">{title}</p>
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="font-bold font-mono tabular-nums text-2xl text-foreground tracking-tight">
                  <AnimatedCounter value={value || "0"} suffix="" />
                </span>
                {change !== undefined && change !== null && (
                  <span className={`text-xs font-semibold flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${
                    change >= 0
                      ? "bg-success/10 text-success dark:bg-success/15"
                      : "bg-destructive/10 text-destructive dark:bg-destructive/15"
                  }`}>
                    {change >= 0 ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}
                    {Math.abs(change)}%
                  </span>
                )}
              </div>
              {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ═══════════════════════════════════════════
// Welcome header — gradient text + animated stats strip
// ═══════════════════════════════════════════

function WelcomeHeader({ botStatus, aiStatus, isLoading, onRefresh }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <h1 className="text-gradient-premium text-2xl sm:text-3xl font-bold tracking-tight">
            لوحة التحكم
          </h1>
          <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0 font-normal gap-1 text-muted-foreground border-dashed">
            <Sparkles className="size-2.5 text-accent" />
            مباشر
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">مرحباً بك في SmartBot — منصة الردود الذكية</p>
      </div>

      <div className="flex items-center gap-4">
        {/* Animated status indicators */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
          <div className="flex items-center gap-1.5">
            <motion.span
              className="size-1.5 rounded-full block"
              animate={{ backgroundColor: botStatus?.running ? "hsl(142 70% 40%)" : "hsl(0 84% 60%)" }}
              transition={{ duration: 0.3 }}
            />
            <span>البوت: <strong className="text-foreground">{botStatus?.running ? "شغال" : "متوقف"}</strong></span>
          </div>
          <span className="text-border/50">|</span>
          <div className="flex items-center gap-1.5">
            <motion.span
              className="size-1.5 rounded-full block"
              animate={{ backgroundColor: aiStatus?.available ? "hsl(142 70% 40%)" : "hsl(217 19% 45%)" }}
              transition={{ duration: 0.3 }}
            />
            <span>AI: <strong className="text-foreground">{aiStatus?.available ? "متصل" : "غير مفعل"}</strong></span>
          </div>
        </div>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full text-xs cursor-pointer" aria-label="تحديث البيانات" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════
// Activity timeline — dots, hover expand, timestamps
// ═══════════════════════════════════════════

function ActivityTimeline({ activities, loading }) {
  if (loading) return (
    <div className="p-4 space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-2 rounded-full shrink-0" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-2.5 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>
  )

  if (!activities?.length) return (
    <div className="flex flex-col items-center py-10 px-4">
      <Inbox className="size-8 text-muted-foreground/20 mb-2" />
      <p className="text-sm text-muted-foreground">لا يوجد نشاط حديث</p>
      <p className="text-xs text-muted-foreground/50 mt-1">سيظهر النشاط هنا عند حدوثه</p>
    </div>
  )

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute right-[7px] top-3 bottom-3 w-px bg-border/50" />
      <div className="divide-y divide-border/30">
        {activities.slice(0, 5).map((a, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="group relative flex items-start gap-3 px-4 py-3 transition-colors duration-200 hover:bg-muted/40 cursor-default"
          >
            {/* Dot */}
            <div className={`relative z-10 mt-1.5 size-[6px] rounded-full shrink-0 ring-2 ring-card transition-colors duration-200 ${
              a.type === "reply" ? "bg-accent" : "bg-muted-foreground/30"
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground/90 leading-snug transition-colors duration-200 group-hover:text-foreground line-clamp-2">
                {a.text}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] text-muted-foreground/60 font-mono tabular-nums">
                  {a.time ? format(new Date(a.time), "HH:mm", { locale: arSA }) : ""}
                </span>
                {a.type === "reply" && (
                  <span className="text-[10px] text-accent/70 font-medium">رد</span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// Premium chart — gradient fill, clean axis, interactive tooltip
// ═══════════════════════════════════════════

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border bg-card/90 backdrop-blur-md px-3.5 py-2.5 text-sm shadow-xl shadow-black/5">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="font-bold font-mono tabular-nums text-foreground text-lg leading-tight">
        {payload[0].value?.toLocaleString()}
      </p>
      <p className="text-[10px] text-muted-foreground/50 mt-0.5">ردود</p>
    </div>
  )
}

function PremiumChart({ chartData, isLoading }) {
  if (isLoading) return <Skeleton className="h-[280px] w-full rounded-xl" />

  if (chartData.length < 2) return (
    <div className="flex flex-col items-center py-16">
      <BarChart3 className="size-10 text-muted-foreground/15 mb-3" />
      <p className="text-sm text-muted-foreground">بيانات غير كافية بعد</p>
      <p className="text-xs text-muted-foreground/50 mt-1">سيظهر الرسم البياني عند توفر بيانات كافية</p>
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="af" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.25} />
            <stop offset="50%" stopColor="hsl(var(--accent))" stopOpacity={0.08} />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="afStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--accent))" />
            <stop offset="100%" stopColor="hsl(var(--primary))" />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          dy={10}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeDasharray: "4 4" }} />
        <Area
          type="monotone"
          dataKey="replies"
          stroke="url(#afStroke)"
          strokeWidth={2.5}
          fill="url(#af)"
          activeDot={{ r: 6, fill: "hsl(var(--accent))", stroke: "hsl(var(--card))", strokeWidth: 3 }}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ═══════════════════════════════════════════
// Replies table — full-width, minimal, clean
// ═══════════════════════════════════════════

function RepliesTable({ replies, isLoading }) {
  if (isLoading) return (
    <div className="p-4 space-y-3">
      {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
    </div>
  )

  if (!replies?.length) return (
    <div className="flex flex-col items-center py-14">
      <MessageSquare className="size-10 text-muted-foreground/15 mb-3" />
      <p className="text-sm text-muted-foreground">لا توجد ردود بعد</p>
      <p className="text-xs text-muted-foreground/50 mt-1">عندما يرد البوت على التعليقات، ستظهر هنا</p>
    </div>
  )

  return (
    <div className="overflow-x-auto data-table-card-view">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-8"><span className="size-1.5 rounded-full bg-muted-foreground/30 block mx-auto" /></th>
            <th>صاحب التعليق</th>
            <th>التعليق</th>
            <th>الرد</th>
            <th className="w-28">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {replies.map((r, i) => (
            <motion.tr
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.25 }}
              className="group transition-colors cursor-default"
            >
              <td data-label=""><span className="size-1.5 rounded-full bg-accent block mx-auto" /></td>
              <td data-label="صاحب التعليق" className="font-medium">{r.commenter_name}</td>
              <td data-label="التعليق" className="text-muted-foreground max-w-[220px] truncate text-sm">
                <span className="group-hover:text-foreground transition-colors">{r.comment_text}</span>
              </td>
              <td data-label="الرد" className="text-muted-foreground max-w-[220px] truncate text-xs font-mono">
                {r.reply_text}
              </td>
              <td data-label="التاريخ" className="text-muted-foreground text-xs whitespace-nowrap font-mono tabular-nums tracking-tight">
                {r.created_at ? format(new Date(r.created_at), "yyyy/MM/dd HH:mm", { locale: arSA }) : "-"}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════
// Error state
// ═══════════════════════════════════════════

function ErrorState({ message, onRetry }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardContent className="flex flex-col items-center py-16">
          <div className="size-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="size-8 text-destructive/60" />
          </div>
          <p className="text-base font-semibold text-foreground mb-1">حدث خطأ في التحميل</p>
          <p className="text-sm text-muted-foreground mb-6 text-center max-w-xs">{message || "تعذر تحميل بيانات لوحة التحكم"}</p>
          <Button variant="outline" onClick={onRetry} className="gap-2 rounded-full">
            <RefreshCw className="size-3.5" />
            إعادة المحاولة
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ═══════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════

export function Dashboard(_p) {
  useEffect(() => { document.title = "SmartBot — لوحة التحكم" }, [])

  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ["stats"], queryFn: fetchStats, refetchInterval: 10000,
  })
  const { data: rules = [] } = useQuery({ queryKey: ["rules"], queryFn: fetchRules })
  const { data: botStatus } = useQuery({
    queryKey: ["bot-status"], queryFn: fetchBotStatus, refetchInterval: 10000,
  })
  const { data: aiStatus } = useQuery({ queryKey: ["ai-status"], queryFn: fetchAiStatus })
  const { data: activities, isLoading: actLoading } = useQuery({
    queryKey: ["recent-activity"], queryFn: () => fetchRecentActivity(8), refetchInterval: 15000,
  })
  const { data: recent } = useQuery({
    queryKey: ["replies-recent"], queryFn: () => fetchReplies(1, 5),
  })

  const chartData = useMemo(() => stats?.chart
    ? Object.entries(stats.chart).map(([d, c]) => ({
        date: (() => { try { return new Date(d).toLocaleDateString("ar-SA", { weekday: "short", day: "numeric" }) } catch { return d } })(),
        replies: c,
      }))
    : [], [stats])

  const activeRules = rules.filter(r => r.enabled).length
  const recentReplies = recent?.items || []

  // Animated entry for the grid
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.07, delayChildren: 0.15 },
    },
  }

  // ── Global error state ──
  if (error && !isLoading) {
    return (
      <div className="content-container space-y-5">
        <WelcomeHeader botStatus={botStatus} aiStatus={aiStatus} isLoading={isLoading} onRefresh={() => refetch()} />
        <ErrorState message={error?.message} onRetry={() => refetch()} />
        <div className="mobile-nav-spacer" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="content-container space-y-6 animate-fade-in" dir="rtl">
      {/* ── Welcome header ── */}
      <WelcomeHeader botStatus={botStatus} aiStatus={aiStatus} isLoading={isLoading} onRefresh={() => refetch()} />

      {/* ── Metric cards (4-column, responsive) ── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
          <MetricCard
            title="إجمالي الردود"
            value={stats?.total_replies?.toLocaleString() || "0"}
            subtitle="كل الردود"
            icon={MessageSquare}
            color="accent"
            loading={isLoading}
            change={12}
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
          <MetricCard
            title="ردود اليوم"
            value={stats?.today_replies?.toLocaleString() || "0"}
            subtitle="آخر 24 ساعة"
            icon={Activity}
            color="info"
            loading={isLoading}
            change={8}
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
          <MetricCard
            title="المتابعون"
            value={stats?.fan_count?.toLocaleString() || "—"}
            subtitle="متابعي الصفحة"
            icon={Users}
            color="warning"
            loading={isLoading}
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
          <MetricCard
            title="القواعد النشطة"
            value={activeRules || "0"}
            subtitle={`من ${rules.length}`}
            icon={Bot}
            color="primary"
            loading={isLoading}
          />
        </motion.div>
      </motion.div>

      {/* ── Main grid: chart + activity ── */}
      {!error && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Chart — 3/5 span */}
          <Card className="lg:col-span-3 overflow-hidden">
            <CardHeader className="pb-2 px-5 pt-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-7 rounded-lg bg-accent/10 flex items-center justify-center">
                    <BarChart3 className="size-3.5 text-accent" />
                  </div>
                  <CardTitle className="text-sm font-semibold">النشاط اليومي</CardTitle>
                </div>
                <Badge variant="outline" className="text-[11px] rounded-full font-mono tabular-nums gap-1 px-2.5">
                  <span className="size-1.5 rounded-full bg-accent" />
                  {stats?.total_replies || 0} رد
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-4 pt-2">
              <PremiumChart chartData={chartData} isLoading={isLoading} />
            </CardContent>
          </Card>

          {/* Activity — 2/5 span */}
          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader className="pb-1 px-5 pt-5">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="size-3.5 text-primary" />
                </div>
                <CardTitle className="text-sm font-semibold">آخر النشاطات</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ActivityTimeline activities={activities} loading={actLoading} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Recent replies table ── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 px-5 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <MessageSquare className="size-3.5 text-primary" />
              </div>
              <CardTitle className="text-sm font-semibold">آخر الردود</CardTitle>
            </div>
            <Badge variant="outline" className="text-[11px] rounded-full font-mono tabular-nums">
              {recentReplies.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <RepliesTable replies={recentReplies} isLoading={isLoading} stats={stats} />
        </CardContent>
      </Card>

      <div className="mobile-nav-spacer" />
    </motion.div>
  )
}
