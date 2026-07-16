"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { FileBarChart, AlertCircle, RefreshCw, MessageSquare, ThumbsUp, Eye, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function ReportsPage() {
  const { data: dashboard, isLoading: dbLoad, isError: dbErr, error: dbError, refetch: dbRefetch } = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: async () => {
      const res = await apiFetch("/api/analytics/dashboard?days=30")
      if (!res.ok) throw new Error(`فشل تحميل الإحصائيات (${res.status})`)
      return res.json()
    },
    retry: 1,
  })

  const { data: topCommenters = [], isLoading: tcLoad, isError: tcErr } = useQuery({
    queryKey: ["analytics-top-commenters"],
    queryFn: async () => {
      const res = await apiFetch("/api/analytics/top-commenters?limit=10")
      if (!res.ok) throw new Error(`فشل تحميل المعلقين (${res.status})`)
      return res.json()
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
            <p className="text-[11px] text-muted-foreground">التقارير والإحصائيات</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-16" /></Card>)}</div>
        ) : anyError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل التقارير</h2>
            <p className="text-xs text-muted-foreground mb-4">{(dbError as any)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => dbRefetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-blue-500/10 flex items-center justify-center"><MessageSquare className="size-4 text-blue-500" /></div>
                  <div>
                    <p className="text-xl font-bold">{dashboard?.total_comments?.toLocaleString() || 0}</p>
                    <p className="text-[10px] text-muted-foreground">إجمالي التعليقات</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-green-500/10 flex items-center justify-center"><ThumbsUp className="size-4 text-green-500" /></div>
                  <div>
                    <p className="text-xl font-bold">{dashboard?.total_likes?.toLocaleString() || 0}</p>
                    <p className="text-[10px] text-muted-foreground">إجمالي الإعجابات</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-purple-500/10 flex items-center justify-center"><Eye className="size-4 text-purple-500" /></div>
                  <div>
                    <p className="text-xl font-bold">{dashboard?.total_views?.toLocaleString() || 0}</p>
                    <p className="text-[10px] text-muted-foreground">إجمالي المشاهدات</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-orange-500/10 flex items-center justify-center"><Share2 className="size-4 text-orange-500" /></div>
                  <div>
                    <p className="text-xl font-bold">{dashboard?.total_shares?.toLocaleString() || 0}</p>
                    <p className="text-[10px] text-muted-foreground">إجمالي المشاركات</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <section>
              <h2 className="font-bold text-sm mb-3">أكثر المعلقين تفاعلاً</h2>
              {tcLoad ? (
                <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-3 animate-pulse h-10" /></Card>)}</div>
              ) : tcErr ? (
                <Card><CardContent className="p-4 text-center text-xs text-muted-foreground">تعذر تحميل المعلقين</CardContent></Card>
              ) : (topCommenters as any[]).length === 0 ? (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">لا توجد بيانات كافية</CardContent></Card>
              ) : (
                <div className="space-y-1">
                  {(topCommenters as any[]).map((c: any, i: number) => (
                    <Card key={i}>
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
