"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Activity, AlertCircle, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { Button } from "@/components/ui/button"
import { unwrapApi } from "@/lib/api"
import { usePollingWhenVisible } from "@/hooks/usePollingWhenVisible"
import type { LogEntry } from "@/lib/types"
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

/* v24-R2 (A2 #6/#7): مفتاح مستقر للاستطلاع المرئي — نفس مفتاح useQuery. */
const LOGS_KEY = ["activity-logs"]


export default function ActivityPage() {
  /* v24-R2 (A2 #6/#7): 15s → استطلاع مرئي — المؤقّت يتوقف تمامًا في تبويب
   * الخلفية (false) ويعود فور العودة مع تجديد فوري متى تقادمت البيانات. */
  const refetchInterval = usePollingWhenVisible(15_000, LOGS_KEY)
  const { data: logs = [], isLoading, isError, refetch } = useQuery({
    queryKey: LOGS_KEY,
    // v13-L3 (dec-envelope-prune): /api/logs returns ok([...]) — single
    // envelope via unwrapApi; `?? []` is null-safety only (bad JSON → null).
    queryFn: () => apiFetch("/api/logs?limit=100").then((res) => unwrapApi<LogEntry[]>(res)),
    refetchInterval,
  })

  const logItems = logs ?? []

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<Activity className="size-4" />}
        title="سجل النشاطات"
        subtitle="سجل أحداث النظام"
        compact
      />
      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
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
              <div className="divide-y divide-border" role="list">
                {logItems.slice(0, 50).map((log, i) => (
                  <div key={log.id || i} role="listitem" className="p-3 text-sm flex items-start gap-3">
                    <div className="mt-0.5 flex items-center gap-1.5 shrink-0">
                      <div className={`size-2 rounded-full ${
                        log.level === "error" ? "bg-destructive" :
                        log.level === "warning" ? "bg-warning" : "bg-success"
                      }`} aria-hidden="true" />
                      {/* v24-R2 (B4 floor): text-3xs (10px) → text-xs — حده أدنى 12px */}
                      <span className={`text-xs font-medium ${LOG_LEVEL_TEXT[log.level] || "text-muted-foreground"}`}>
                        {LOG_LEVEL_LABEL[log.level] || log.level}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{log.message}</p>
                      {/* v24-R2 (B4 floor): text-2xs (11px) → text-xs — حده أدنى 12px */}
                      <p className="text-xs text-muted-foreground mt-0.5">
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
