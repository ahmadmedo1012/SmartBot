"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { countPhrase } from "@/lib/format"
import {
  BarChart3, MessageSquare, Activity, Clock, Users, AlertCircle, RefreshCw, Smile,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { unwrapApi } from "@/lib/api"
import type { AnalyticsOverview } from "@/lib/types"
/* v9-B14 — lazy recharts: the direct import pulled the ~344KB recharts chunk
 * into this route's first-load JS; the lazy barrel defers it until render. */
import { ActivityBarChart, ComparisonBars } from "@/components/charts/lazy"

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "إيجابي", negative: "سلبي", neutral: "محايد", mixed: "مختلط",
}
export default function AnalyticsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => apiFetch("/api/analytics/overview?days=30").then(unwrapApi<AnalyticsOverview>),
    refetchInterval: 60000,
  })

  const stats = [
    { label: "إجمالي الردود", value: data?.total_replies ?? "—", icon: MessageSquare, color: "bg-accent-foreground/10 text-accent-foreground" },
    { label: "ردود اليوم", value: data?.today_replies ?? "—", icon: Activity, color: "bg-info-soft text-info" },
    { label: "المتابعين", value: data?.fan_count ?? "—", icon: Users, color: "bg-success-soft text-success" },
    { label: "ذروة النشاط", value: data?.peak_hour != null ? `${data.peak_hour}:00` : "—", icon: Clock, color: "bg-accent text-accent-foreground" },
  ]

  const daily = data?.daily_breakdown ? Object.entries(data.daily_breakdown) : []
  const maxVal = Math.max(...daily.map(([,v]) => v as number), 1)

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <BarChart3 className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">التحليلات</h1>
            <p className="text-2xs text-muted-foreground">إحصائيات الأداء</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل التحليلات</h2>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : (<><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`size-8 rounded-lg flex items-center justify-center ${s.color}`}>
                    <s.icon className="size-4" />
                  </div>
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-4">
            <h2 className="font-bold text-sm mb-4">الردود اليومية (آخر 30 يوم)</h2>
            {isLoading ? (
              <div className="h-32 bg-muted rounded animate-pulse" />
            ) : daily.length === 0 ? (
              <EmptyState icon={BarChart3} size="sm" title="لا توجد بيانات بعد" description="ستظهر حركة الردود اليومية هنا بعد أول تفاعل على صفحتك." />
            ) : (
              <ActivityBarChart
                height={128}
                summary="مخطط أعمدة للردود اليومية خلال آخر 30 يوماً"
                data={daily.slice(-30).map(([d, v]: [string, unknown]) => ({ label: d, value: Number(v) ?? 0, hint: d }))}
              />
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <h2 className="font-bold text-sm mb-3">أفضل القواعد</h2>
              {data?.top_rules?.length > 0 ? (
                <div className="space-y-2">
                  {data.top_rules.map((r, i) => (
                    /* v9-B12 — sorted list: positional keys corrupt React's
                        diffing when the order shifts; rule_id is the identity */
                    <div key={r.rule_id ?? r.name ?? i} className="flex items-center justify-between text-sm">
                      {/* v4 §7.24 — backend now sends rule names (incl. DM replies) */}
                      <span>{r.name || `القاعدة #${r.rule_id}`}</span>
                      <span className="text-muted-foreground">{countPhrase(r.count, "رد", "ردين", "ردود")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Activity} size="sm" title="لا توجد قواعد بعد" description="أنشئ قواعد رد من صفحة الردود التلقائية وستظهر الأكثر فاعلية هنا." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h2 className="font-bold text-sm mb-3">توزيع المشاعر</h2>
              {data?.sentiment_distribution && Object.keys(data.sentiment_distribution).length > 0 ? (
                <ComparisonBars
                  summary="أشرطة أفقية تقارن عدد رسائل كل فئة شعور: إيجابي، سلبي، محايد، مختلط"
                  data={Object.entries(data.sentiment_distribution as Record<string, number>).map(([k, v]) => ({ label: SENTIMENT_LABELS[k] || k, value: Number(v) ?? 0 }))}
                />
              ) : (
                <EmptyState icon={Smile} size="sm" title="لا توجد بيانات مشاعر" description="سيُحلَّل شعور التعليقات هنا فور وصول أول تعليق على منشوراتك." />
              )}
            </CardContent>
          </Card>
        </div>
      </>
      )}
      </div>
    </div>
  )
}
