"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Activity, AlertCircle, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"


export default function ActivityPage() {
  const { data: logs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: () => apiFetch("/api/logs?limit=100").then(r => r.json()),
    refetchInterval: 15000,
  })

  const logItems = Array.isArray(logs) ? logs : (logs.items || [])

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <Activity className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">سجل النشاطات</h1>
            <p className="text-[11px] text-muted-foreground">سجل أحداث النظام</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <Card>
          <CardContent className="p-0">
            {isError ? (
              <div className="p-8 text-center">
                <AlertCircle className="size-8 mx-auto mb-2 text-red-500/50" />
                <p className="text-sm text-muted-foreground mb-3">فشل تحميل النشاطات</p>
                <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
              </div>
            ) : isLoading ? (
              <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>
            ) : logItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">لا توجد نشاطات بعد</div>
            ) : (
              <div className="divide-y divide-border">
                {logItems.slice(0, 50).map((log: any, i: number) => (
                  <div key={log.id || i} className="p-3 text-sm flex items-start gap-3">
                    <div className={`mt-0.5 size-2 rounded-full shrink-0 ${
                      log.level === "error" ? "bg-red-500" :
                      log.level === "warning" ? "bg-yellow-500" : "bg-green-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{log.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {log.created_at ? new Date(log.created_at).toLocaleString("ar-LY") : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
