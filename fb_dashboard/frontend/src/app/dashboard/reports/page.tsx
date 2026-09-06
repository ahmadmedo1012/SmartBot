"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { FileBarChart, AlertCircle, RefreshCw, MessageSquare, Bot, Users, MessagesSquare, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { unwrapApi } from "@/lib/api"
import type { AnalyticsDashboard, TopCommenter } from "@/lib/types"
import { formatNumber } from "@/lib/format"

export default function ReportsPage() {
  const { data: dashboard, isLoading: dbLoad, isError: dbErr, error: dbError, refetch: dbRefetch } = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: async () => {
      const res = await apiFetch("/api/analytics/dashboard?days=30")
      if (!res.ok) throw new Error(`فشل تحميل الإحصائيات (${res.status})`)
      return unwrapApi<AnalyticsDashboard>(res)
    },
    retry: 1,
  })

  const { data: topCommenters = [], isLoading: tcLoad, isError: tcErr } = useQuery({
    queryKey: ["analytics-top-commenters"],
    queryFn: async () => {
      const res = await apiFetch("/api/analytics/top-commenters?limit=10")
      if (!res.ok) throw new Error(`فشل تحميل المعلقين (${res.status})`)
      return unwrapApi<TopCommenter[]>(res)
    },
    retry: 1,
  })

  const loading = dbLoad || tcLoad
  const anyError = dbErr || tcErr

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <FileBarChart className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">التقارير</h1>
            <p className="text-2xs text-muted-foreground">التقارير والإحصائيات</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-16" /></Card>)}</div>
        ) : anyError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل التقارير</h2>
            <p className="text-xs text-muted-foreground mb-4">{(dbError as Error)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => dbRefetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* v4 §2.3 (G3) — these KPIs now read fields the backend actually
                  returns (analytics_engine.get_dashboard_overview). The old cards
                  read total_comments/likes/views/shares — fields that never
                  existed in any response, so every card was permanently 0. */}
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-info-soft flex items-center justify-center"><MessageSquare className="size-4 text-info" /></div>
                  <div>
                    <p className="text-xl font-bold">{formatNumber(dashboard?.total_messages ?? 0)}</p>
                    <p className="text-3xs text-muted-foreground">إجمالي الرسائل</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-accent-foreground/10 flex items-center justify-center"><Bot className="size-4 text-accent-foreground" /></div>
                  <div>
                    <p className="text-xl font-bold">{formatNumber(dashboard?.total_replies ?? 0)}</p>
                    <p className="text-3xs text-muted-foreground">ردود البوت التلقائية</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-success-soft flex items-center justify-center"><MessagesSquare className="size-4 text-success" /></div>
                  <div>
                    <p className="text-xl font-bold">{formatNumber(dashboard?.total_conversations ?? 0)}</p>
                    <p className="text-3xs text-muted-foreground">المحادثات</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-accent flex items-center justify-center"><Users className="size-4 text-accent-foreground" /></div>
                  <div>
                    <p className="text-xl font-bold">{formatNumber(dashboard?.total_customers ?? 0)}</p>
                    <p className="text-3xs text-muted-foreground">عملاء محفوظون (CRM)</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-muted/50 flex items-center justify-center"><TrendingUp className="size-4 text-muted-foreground" /></div>
                  <div>
                    <p className="text-sm font-bold">
                      {formatNumber(dashboard?.today_replies ?? 0)}
                      <span className="text-3xs text-muted-foreground font-normal"> رد اليوم</span>
                    </p>
                    <p className="text-3xs text-muted-foreground">
                      {formatNumber(dashboard?.unique_commenters ?? 0)} معلّق فريد · {formatNumber(dashboard?.active_rules ?? 0)} قاعدة نشطة · آخر {formatNumber(dashboard?.period_days ?? 30)} يوماً
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${(dashboard?.change_pct ?? 0) >= 0 ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"}`}>
                  {(dashboard?.change_pct ?? 0) >= 0 ? "↑" : "↓"} {Math.abs(dashboard?.change_pct ?? 0)}%
                </span>
              </CardContent>
            </Card>

            <section>
              <h2 className="font-bold text-sm mb-3">أكثر المعلقين تفاعلاً</h2>
              {tcLoad ? (
                <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-3 animate-pulse h-10" /></Card>)}</div>
              ) : tcErr ? (
                <Card><CardContent className="p-4 text-center text-xs text-muted-foreground">تعذر تحميل المعلقين</CardContent></Card>
              ) : topCommenters.length === 0 ? (
                <Card><CardContent className="p-0">
                  <EmptyState icon={MessageSquare} size="sm" title="لا توجد بيانات كافية" description="ستظهر أسماء أكثر المعلقين تفاعلاً هنا بعد وصول تعليقات على منشوراتك." />
                </CardContent></Card>
              ) : (
                <div className="space-y-1">
                  {topCommenters.map((c, i) => (
                    /* v9-B12 — ranked list: positional keys corrupt React's
                        diffing when the ranking shifts; commenter_id is stable */
                    <Card key={c.commenter_id ?? c.name ?? i}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-4 text-center">{i + 1}</span>
                          <span className="text-sm">{c.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{c.count} تعليق</span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
