"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Users, Activity, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function AudiencePage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => apiFetch("/api/analytics/overview?days=30").then(r => r.json()),
    refetchInterval: 60000,
  })
  const topQuery = useQuery({
    queryKey: ["top-commenters"],
    queryFn: () => apiFetch("/api/analytics/top-commenters?limit=5").then(r => r.json()),
    refetchInterval: 60000,
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <Users className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الجمهور</h1>
            <p className="text-[11px] text-muted-foreground">تحليل الجمهور والمتابعين</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل بيانات الجمهور</h2>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : (<>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="size-8 rounded-lg bg-orange/10 flex items-center justify-center mb-2">
                <Users className="size-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{data?.fan_count ?? "—"}</p>
              <p className="text-xs text-muted-foreground">إجمالي المعجبين</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
                <Activity className="size-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold">{data?.total_replies ?? "—"}</p>
              <p className="text-xs text-muted-foreground">إجمالي التفاعل</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="size-8 rounded-lg bg-green-500/10 flex items-center justify-center mb-2">
                <Activity className="size-4 text-green-500" />
              </div>
              <p className="text-2xl font-bold">{data?.today_replies ?? "—"}</p>
              <p className="text-xs text-muted-foreground">نشاط اليوم</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-sm mb-2">المعلقون الأكثر نشاطاً</h3>
            {isLoading ? (
              <div className="space-y-2">
                {[1,2,3,4,5].map(i => <div key={i} className="h-5 bg-muted rounded animate-pulse" />)}
              </div>
            ) : topQuery.data?.length > 0 ? (
              <div className="space-y-2">
                {topQuery.data.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                    <span>{c.name || `معلق #${c.commenter_id}`}</span>
                    <span className="text-muted-foreground">{c.count} تعليق</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">بيانات الجمهور ستظهر هنا</p>
            )}
          </CardContent>
        </Card>
      </>
      )}
      </div>
    </div>
  )
}
