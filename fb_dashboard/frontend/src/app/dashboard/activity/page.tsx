"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Activity, AlertCircle, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { Button } from "@/components/ui/button"
import { unwrapApi } from "@/lib/api"
import { formatDate } from "@/lib/format"

/* v8-B13: the level dot was color-only — render a small text chip next to it
 * so the level isn't lost to color-blind users / forced-colors modes. */
const LOG_LEVEL_LABEL: Record<string, string> = {
  error: "خطأ",
  warning: "تحذير",
  info: "معلومات",
}
const LOG_LEVEL_TEXT: Record<string, string> = {
  error: "text-destructive",
  warning: "text-warning",
  info: "text-info",
}


export default function ActivityPage() {
  const { data: logs = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: () => apiFetch("/api/logs?limit=100").then(unwrapApi),
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
                <AlertCircle className="size-8 mx-auto mb-2 text-destructive/50" />
                <p className="text-sm text-muted-foreground mb-3">فشل تحميل النشاطات</p>
                <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
              </div>
            ) : isLoading ? (
              <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>
            ) : logItems.length === 0 ? (
              <EmptyState icon={Activity} size="sm" title="لا توجد نشاطات بعد" description="ستظهر أحداث النظام هنا — الردود والتعليقات والإشعارات — فور حدوثها." />
            ) : (
              <div className="divide-y divide-border">
                {logItems.slice(0, 50).map((log: any, i: number) => (
                  <div key={log.id || i} className="p-3 text-sm flex items-start gap-3">
                    <div className="mt-0.5 flex items-center gap-1.5 shrink-0">
                      <div className={`size-2 rounded-full ${
                        log.level === "error" ? "bg-destructive" :
                        log.level === "warning" ? "bg-warning" : "bg-success"
                      }`} aria-hidden="true" />
                      <span className={`text-[10px] font-medium ${LOG_LEVEL_TEXT[log.level] || "text-muted-foreground"}`}>
                        {LOG_LEVEL_LABEL[log.level] || log.level}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{log.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {log.created_at ? formatDate(log.created_at) : ""}
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
