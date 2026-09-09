"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import {
  TrendingUp, Activity, AlertCircle, AlertTriangle, CheckCircle2, RefreshCw, MessageCircle,
  Users, Inbox, Bot, Link2, Zap,
} from "lucide-react"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/PageHeader"
import { KpiCard } from "@/components/shared/KpiCard"
import { ChartCard } from "@/components/shared/ChartCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
/* v11-A7 — framer-free entrances. The fadeUp/stagger choreography below was
 * this page's only eager framer-motion import; the section reveals now run
 * as CSS twins (.sb-fade-up — identical 0.5s cubic-bezier(0.165,0.84,0.44,1)
 * curve, translateY(24px)→0, inline animationDelay replacing `custom={n}`
 * + the old stagger container's 0.08s delayChildren, reduced-motion
 * guarded) so the ~116KB motion engine no longer ships in first-load JS. */
import "@/components/shared/enter-motion.css"
/* v9-B14 — lazy recharts: the direct import pulled the ~344KB recharts chunk
 * into /dashboard's first-load JS; the lazy barrel defers it until render. */
import { ActivityBarChart } from "@/components/charts/lazy"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { brandedToast } from "@/lib/premium-toast"
import type {
  BundleRule,
  DashboardBundle,
  DashboardConnection,
  DashboardMessages,
  DashboardStats,
  RecentReply,
} from "@/lib/types"
import { countPhrase, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

/* World-class launch plan v3 §7b: honest connection state, persisted-message
 * KPIs, Smart-Menu KpiCard/ChartCard components, token-only colors. */

// ── Skeleton ──
function LoadingSkeleton() {
  return (
    <SectionContainer className="py-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-12" />
          </CardContent></Card>
        ))}
      </div>
      <Skeleton className="h-48" />
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

// ── Bar Chart ──
function ChartBars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).slice(-24)
  return (
    <div>
      <ActivityBarChart
        height={128}
        data={entries.map(([d, v]) => ({ label: d.slice(5), value: v, hint: d }))}
      />
      {entries.length > 1 && (
        <div className="flex justify-between mt-2.5 text-3xs text-muted-foreground tabular-nums">
          <span>{entries[0]?.[0]?.slice(5) || ""}</span>
          <span>{entries[entries.length - 1]?.[0]?.slice(5) || ""}</span>
        </div>
      )}
    </div>
  )
}

// ── Not connected ──
function NotConnectedCard() {
  return (
    <Card className="border-dashed">
      <CardContent className="py-2">
        <EmptyState
          icon={Link2}
          title="اربط صفحتك لتبدأ"
          description="لم يتم ربط صفحة فيسبوك بهذا الحساب بعد. بعد الربط ستصل الرسائل والتعليقات فوراً ويعمل الرد التلقائي."
          action={{
            label: "ربط صفحة فيسبوك",
            icon: Link2,
            onClick: () => { window.location.href = "/connect" },
          }}
          secondaryAction={{
            label: "إنشاء قاعدة رد أولاً",
            onClick: () => { window.location.href = "/dashboard/autoreply" },
          }}
        />
      </CardContent>
    </Card>
  )
}

// ── Bot health (D6-9) ──
/* Contract: GET /api/health/bot-check (routers/health_alerts_routes.py) →
 * ok() envelope → data: { status: "ok"|"warning", running, fan_count,
 * replies_last_hour, rule_count, issues: [{type, severity, message}],
 * alerts_count }. The check runs LIVE (it pings the page's fan count), so
 * there is no polling — the owner triggers re-runs via «فحص فوري». Visual
 * mirror of CronHeartbeatCard (admin): icon tile + title + one status line,
 * border tinted by severity, last-check timestamp. */
interface BotCheckIssue {
  type: string
  severity: "warning" | "critical"
  message: string
}

interface BotCheckData {
  status: "ok" | "warning"
  running: boolean
  fan_count: number | null
  replies_last_hour: number
  rule_count: number
  issues: BotCheckIssue[]
  alerts_count: number
}

function BotHealthCard() {
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["bot-health"],
    queryFn: () => apiFetch("/api/health/bot-check").then(unwrapApi<BotCheckData>),
    // Live FB connectivity check → keep it at least a minute fresh, manual re-runs otherwise.
    staleTime: 60_000,
  })

  /* «فحص فوري» — the owner-triggered re-run; toast feedback on the outcome
   * (same pattern as the connect page's test-connect button). */
  const runCheck = async () => {
    const res = await refetch()
    if (res.error) {
      brandedToast.error("تعذر فحص صحة البوت", "تحقق من الاتصال ثم أعد المحاولة")
      return
    }
    const d = res.data
    if (!d) return
    if (!d.running || d.issues.some((i) => i.severity === "critical")) {
      brandedToast.error("الفحص وجد مشاكل تتطلب تدخلك", d.issues[0]?.message || "البوت غير مشغّل حالياً")
    } else if (d.issues.length > 0) {
      brandedToast.warning("تنبيه صحة البوت", d.issues[0].message)
    } else {
      brandedToast.success("البوت يعمل بشكل طبيعي")
    }
  }

  // Loading — skeleton mirroring the card's shape
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-48" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error — the page's ErrorState pattern, scoped to the card
  if (isError || !data) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">صحة البوت</p>
              <p className="text-xs text-muted-foreground truncate">تعذر جلب حالة البوت</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="size-4" aria-hidden="true" /> إعادة المحاولة
          </Button>
        </CardContent>
      </Card>
    )
  }

  const critical = !data.running || data.issues.some((i) => i.severity === "critical")
  const warning = !critical && data.issues.length > 0
  const first = data.issues[0]
  const rest = data.issues.length - 1
  const statusLine = !data.running || first
    ? [
        !data.running ? "البوت غير مشغّل حالياً" : "",
        first?.message ?? "",
        rest > 0 ? ` · و${countPhrase(rest, "مشكلة أخرى", "مشكلتان أخريان", "مشاكل أخرى")}` : "",
      ].filter(Boolean).join(" ")
    : `يعمل بشكل طبيعي · ${countPhrase(data.replies_last_hour, "رد", "ردين", "ردود")} خلال الساعة الأخيرة`

  return (
    <Card className={critical ? "border-destructive/40" : warning ? "border-warning/40" : undefined}>
      <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn("size-9 rounded-lg flex items-center justify-center shrink-0", critical ? "bg-destructive/10" : warning ? "bg-warning/10" : "bg-success/10")}>
            {critical || warning ? (
              <AlertTriangle className={cn("size-4", critical ? "text-destructive" : "text-warning")} aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">صحة البوت</p>
            <p className="text-xs text-muted-foreground truncate">{statusLine}</p>
            <p className="text-3xs text-muted-foreground" dir="auto">آخر فحص {timeAgo(dataUpdatedAt)}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={runCheck} loading={isFetching}>
          <RefreshCw className="size-4" aria-hidden="true" /> فحص فوري
        </Button>
      </CardContent>
    </Card>
  )
}

// ── Main Dashboard ──
export default function DashboardPage() {
  const { data: bundle, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-bundle"],
    queryFn: () => apiFetch("/api/dashboard/bundle").then(unwrapApi<DashboardBundle>),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  })

  const recentReplies: RecentReply[] = bundle?.recent_replies || []
  const rulesList: BundleRule[] = bundle?.rules || []
  const stats: Partial<DashboardStats> = bundle?.stats || {}
  const connection: Partial<DashboardConnection> = bundle?.connection || {}
  const messages: Partial<DashboardMessages> = bundle?.messages || {}
  const connected = connection.connected !== false // absent flag = legacy assume true

  if (error && !isLoading) {
    return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
  }

  if (isLoading && !bundle) return <LoadingSkeleton />

  const pageName: string = connection.page_name || ""

  return (
    <div className="min-h-screen bg-background">
        {/* Header — REAL connection state (was hardcoded "متصل") */}
        <PageHeader
          icon={<TrendingUp className="size-4" />}
          title="لوحة التحكم"
          subtitle={pageName ? `متصل بـ ${pageName}` : undefined}
          status={connected
            ? { label: "متصل", tone: "success" }
            : { label: "غير متصل", tone: "warning" }}
          compact
        />

        <SectionContainer className="py-6">
          <div>
            {/* Not connected → the ONE honest empty state that explains everything */}
            {!connected && (
              <div className="sb-fade-up mb-6">
                <NotConnectedCard />
              </div>
            )}

            {/* v17-E-F11 (D6-9) — bot health at a glance: «فحص فوري» + last
                status/alert (visual mirror of the admin CronHeartbeatCard). */}
            <div className="sb-fade-up mb-6">
              <BotHealthCard />
            </div>

            {/* Stats grid — Smart-Menu KpiCard (animated counter + stagger + stretched links) */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 mb-6">
              <KpiCard icon={TrendingUp} label="جميع الردود" value={stats?.total_replies || 0}
                trend={stats?.trend?.week} iconBg="bg-accent" index={0}
                href="/dashboard/activity" />
              <KpiCard icon={Activity} label="ردود اليوم" value={stats?.today_replies || 0}
                trend={stats?.trend?.today} iconBg="bg-success/10" iconColor="text-success" index={1} />
              <KpiCard icon={Inbox} label="محادثات الماسنجر" value={messages.total_conversations || 0}
                /* v17-E-F11 (D9): unread count through countPhrase (dual/plural)
                   instead of the raw "N غير مقروءة" interpolation. */
                subtitle={countPhrase(messages.unread_conversations || 0, "محادثة غير مقروءة", "محادثتان غير مقروءتان", "محادثات غير مقروءة")}
                iconBg="bg-info/10" iconColor="text-info" index={2}
                href="/dashboard/messages" />
              <KpiCard icon={Bot} label="القواعد النشطة" value={rulesList.filter((r) => r.enabled !== false).length}
                subtitle={`من ${countPhrase(rulesList.length, "قاعدة", "قاعدتين", "قواعد")}`}
                iconBg="bg-accent" index={3}
                href="/dashboard/autoreply" />
            </div>

            {/* Secondary row — audience + persisted messages */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 mb-6">
              <KpiCard icon={Users} label="متابعو الصفحة" value={stats?.fan_count || 0}
                iconBg="bg-accent" index={4} />
              <KpiCard icon={MessageCircle} label="الرسائل المخزنة" value={messages.total_messages || 0}
                subtitle="تصل لحظياً عبر الويبهوك" iconBg="bg-info/10" iconColor="text-info" index={5}
                href="/dashboard/messages" />
              <KpiCard icon={Zap} label="ردود البوت على الرسائل" value={messages.bot_replies || 0}
                iconBg="bg-success/10" iconColor="text-success" index={6} />
            </div>

            {/* Activity chart */}
            <div className="sb-fade-up mb-6" style={{ animationDelay: "0.43s" }}>
              <ChartCard
                title="النشاط اليومي"
                description="ردود البوت خلال آخر 7 أيام"
                icon={TrendingUp}
                empty={!stats?.chart || Object.keys(stats.chart).length === 0}
                emptyTitle="لا توجد ردود بعد"
                emptyDescription="ستظهر حركة الردود هنا بعد أول تفاعل على صفحتك."
                summary="مخطط أعمدة للردود اليومية خلال آخر سبعة أيام"
              >
                <ChartBars data={stats.chart || {}} />
              </ChartCard>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Recent replies */}
              <div className="sb-fade-up" style={{ animationDelay: "0.48s" }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageCircle className="size-4 text-accent-foreground" /> آخر الردود
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {recentReplies.length > 0 ? recentReplies.slice(0, 5).map((r) => (
                      <div key={r.id} className="flex items-start gap-3 px-(--card-spacing) py-3 border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                        <div className="size-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                          {(r.commenter_name || r.commenter || "?")[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{r.commenter_name || r.commenter}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.comment_text || r.text}</p>
                          <p className="text-xs text-accent-foreground truncate">{r.reply_text || r.reply}</p>
                        </div>
                      </div>
                    )) : (
                      <EmptyState
                        icon={MessageCircle}
                        size="sm"
                        title="لا توجد ردود بعد"
                        description="ستظهر آخر ردود البوت هنا فور وصول تعليقات جديدة على منشوراتك."
                      />
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Rules — overflow-safe, token colors, no dead "keywords" column */}
              <div className="sb-fade-up" style={{ animationDelay: "0.53s" }}>
                <Card>
                  <CardHeader>
                    <CardTitle id="dashboard-rules-title" className="flex items-center gap-2">
                      <Activity className="size-4 text-accent-foreground" /> قواعد الرد
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {rulesList.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table aria-labelledby="dashboard-rules-title" className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground text-xs">
                              <th scope="col" className="text-start p-3 font-medium">القاعدة</th>
                              <th scope="col" className="text-center p-3 font-medium">الحالة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rulesList.slice(0, 5).map((r) => (
                              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                                <td className="p-3 font-medium">{r.name}</td>
                                <td className="p-3 text-center">
                                  <span className={cn("inline-flex items-center gap-1 text-xs", r.enabled !== false ? "text-success" : "text-muted-foreground")}>
                                    <span className={cn("size-1.5 rounded-full", r.enabled !== false ? "bg-success" : "bg-muted-foreground")} />
                                    {r.enabled !== false ? "نشط" : "متوقف"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState
                        icon={Activity}
                        title="لا توجد قواعد بعد"
                        description="أنشئ قاعدة رد أولى ليبدأ البوت بالرد تلقائياً."
                        size="sm"
                        action={{
                          label: "إنشاء قاعدة",
                          onClick: () => { window.location.href = "/dashboard/autoreply" },
                        }}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </SectionContainer>
    </div>
  )
}
