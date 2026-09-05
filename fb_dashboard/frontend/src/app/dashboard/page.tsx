"use client"

import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import Link from "next/link"
import {
  TrendingUp, Activity, AlertCircle, RefreshCw, MessageCircle,
  Users, Inbox, Bot, Link2, Zap,
} from "lucide-react"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/PageHeader"
import { KpiCard } from "@/components/shared/KpiCard"
import { ChartCard } from "@/components/shared/ChartCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { fadeUp, stagger } from "@/lib/motion"
import { ActivityBarChart } from "@/components/charts"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { toArabicNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

/* World-class launch plan v3 §7b: honest connection state, persisted-message
 * KPIs, Smart-Menu KpiCard/ChartCard components, token-only colors. */

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
        <div className="flex justify-between mt-2.5 text-[10px] text-muted-foreground tabular-nums">
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
          description="لم يتم ربط صفحة فيسبوك بهذا الحساب بعد. بعد الربط ستصل الرسائل والتعليقات فورًا ويعمل الرد التلقائي."
          action={{
            label: "ربط صفحة فيسبوك",
            icon: Link2,
            onClick: () => { window.location.href = "/connect" },
          }}
          secondaryAction={{
            label: "إنشاء قاعدة رد أولًا",
            onClick: () => { window.location.href = "/dashboard/autoreply" },
          }}
        />
      </CardContent>
    </Card>
  )
}

// ── Main Dashboard ──
export default function DashboardPage() {
  const { data: bundle, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard-bundle"],
    queryFn: () => apiFetch("/api/dashboard/bundle").then(unwrapApi),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  })

  const recentReplies = bundle?.recent_replies || []
  const rulesList = bundle?.rules || []
  const stats = bundle?.stats || {}
  const connection = bundle?.connection || {}
  const messages = bundle?.messages || {}
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
          title="لوحة البيانات"
          subtitle={pageName ? `متصل بـ ${pageName}` : undefined}
          status={connected
            ? { label: "متصل", tone: "success" }
            : { label: "غير متصل", tone: "warning" }}
          compact
        />

        <SectionContainer className="py-6">
          <motion.div variants={stagger} initial="hidden" animate="visible">
            {/* Not connected → the ONE honest empty state that explains everything */}
            {!connected && (
              <motion.div variants={fadeUp} className="mb-6">
                <NotConnectedCard />
              </motion.div>
            )}

            {/* Stats grid — Smart-Menu KpiCard (animated counter + stagger + stretched links) */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 mb-6">
              <KpiCard icon={TrendingUp} label="جميع الردود" value={stats?.total_replies || 0}
                trend={stats?.trend?.week} iconBg="bg-orange-muted" index={0}
                href="/dashboard/activity" />
              <KpiCard icon={Activity} label="ردود اليوم" value={stats?.today_replies || 0}
                trend={stats?.trend?.today} iconBg="bg-success/10" iconColor="text-success" index={1} />
              <KpiCard icon={Inbox} label="محادثات الماسنجر" value={messages.total_conversations || 0}
                subtitle={`${toArabicNumber(messages.unread_conversations || 0)} غير مقروءة`}
                iconBg="bg-info/10" iconColor="text-info" index={2}
                href="/dashboard/messages" />
              <KpiCard icon={Bot} label="القواعد النشطة" value={rulesList.filter((r: any) => r.enabled !== false).length}
                subtitle={`من ${toArabicNumber(rulesList.length)} قاعدة`}
                iconBg="bg-orange-muted" index={3}
                href="/dashboard/autoreply" />
            </div>

            {/* Secondary row — audience + persisted messages */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 mb-6">
              <KpiCard icon={Users} label="متابعو الصفحة" value={stats?.fan_count || 0}
                iconBg="bg-orange-muted" index={4} />
              <KpiCard icon={MessageCircle} label="الرسائل المخزنة" value={messages.total_messages || 0}
                subtitle="تصل لحظيًا عبر الويبهوك" iconBg="bg-info/10" iconColor="text-info" index={5}
                href="/dashboard/messages" />
              <KpiCard icon={Zap} label="ردود البوت على الرسائل" value={messages.bot_replies || 0}
                iconBg="bg-success/10" iconColor="text-success" index={6} />
            </div>

            {/* Activity chart */}
            <motion.div variants={fadeUp} custom={7} className="mb-6">
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
            </motion.div>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Recent replies */}
              <motion.div variants={fadeUp} custom={8}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageCircle className="size-4 text-orange" /> آخر الردود
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {recentReplies.length > 0 ? recentReplies.slice(0, 5).map((r: any) => (
                      <div key={r.id} className="flex items-start gap-3 px-(--card-spacing) py-3 border-b border-border last:border-0">
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

              {/* Rules — overflow-safe, token colors, no dead "keywords" column */}
              <motion.div variants={fadeUp} custom={9}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="size-4 text-orange" /> قواعد الرد
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {rulesList.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground text-xs">
                              <th className="text-start p-3 font-medium">القاعدة</th>
                              <th className="text-center p-3 font-medium">الحالة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rulesList.slice(0, 5).map((r: any) => (
                              <tr key={r.id} className="border-b border-border last:border-0">
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
                        description="أنشئ قاعدة رد أولى ليبدأ البوت بالرد تلقائيًا."
                        size="sm"
                        action={{
                          label: "إنشاء قاعدة",
                          onClick: () => { window.location.href = "/dashboard/autoreply" },
                        }}
                      />
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </motion.div>
        </SectionContainer>
    </div>
  )
}
