"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import {
  BarChart3, MessageSquare, Activity, Clock, Users, AlertCircle, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function AnalyticsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => apiFetch("/api/analytics/overview?days=30").then(r => r.json()),
    refetchInterval: 60000,
  })

  const stats = [
    { label: "إجمالي الردود", value: data?.total_replies ?? "—", icon: MessageSquare, color: "bg-orange/10 text-orange" },
    { label: "ردود اليوم", value: data?.today_replies ?? "—", icon: Activity, color: "bg-blue-500/10 text-blue-500" },
    { label: "المعجبين", value: data?.fan_count ?? "—", icon: Users, color: "bg-green-500/10 text-green-500" },
    { label: "ذروة النشاط", value: data?.peak_hour != null ? `${data.peak_hour}:00` : "—", icon: Clock, color: "bg-purple-500/10 text-purple-500" },
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
            <p className="text-[11px] text-muted-foreground">إحصائيات الأداء</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
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
            <h3 className="font-bold text-sm mb-4">الردود اليومية (آخر 30 يوم)</h3>
            {isLoading ? (
              <div className="h-32 bg-muted rounded animate-pulse" />
            ) : daily.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد بيانات بعد</p>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {daily.slice(-30).map(([d, v]: [string, unknown]) => (
                  <div key={d} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      className="w-full rounded-t bg-orange/70 hover:bg-orange transition-colors min-h-[2px]"
                      style={{ height: `${((v as number) / maxVal) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-bold text-sm mb-3">أفضل القواعد</h3>
              {data?.top_rules?.length > 0 ? (
                <div className="space-y-2">
                  {data.top_rules.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span>القاعدة #{r.rule_id}</span>
                      <span className="text-muted-foreground">{r.count} رد</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد قواعد بعد</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-bold text-sm mb-3">توزيع المشاعر</h3>
              {data?.sentiment_distribution && Object.keys(data.sentiment_distribution).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(data.sentiment_distribution as Record<string, number>).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 text-sm">
                      <span className="w-16">{k}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-orange rounded-full" style={{ width: `${(v as number) / Math.max(...Object.values(data.sentiment_distribution) as number[]) * 100}%` }} />
                      </div>
                      <span className="text-muted-foreground">{v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد بيانات مشاعر</p>
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
