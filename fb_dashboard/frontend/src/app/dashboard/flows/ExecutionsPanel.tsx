"use client"

/**
 * P43-C-2 — لوحة سجل التنفيذات لاستوديو الأتمتة.
 *
 * GET /api/flows/{id}/executions (غلاف {success,data}):
 *   data {items: [{id, status(active/completed/failed/expired), steps,
 *   error, current_node_id, resume_at, started_at, completed_at, …}],
 *   total, page, per_page} — تُقرأ دفاعيًا (قد تتطور استجابة الخدمة).
 *
 * كل صف: شريحة حالة عربية (نشطة/مكتملة/فاشلة/منتهية) + عدد الخطوات +
 * الختم الزمني (تنسيق التاريخ العربي الموحد lib/format) + موضع الاستئناف
 * + مقتطف الخطأ كما أعاده الخادم (رصد لماذا مات التنفيذ لا مجرد أنه مات).
 */
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, History, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { countPhrase, formatDate } from "@/lib/format"

/** صف تنفيذ واحد — الحقول الدفاعية (استجابة الخدمة قد تنمو). */
export interface ExecutionRow {
  id?: number
  status?: string
  steps?: number | null
  error?: unknown
  current_node_id?: string | null
  resume_at?: string | null
  started_at?: string | null
  completed_at?: string | null
  subscriber_id?: number | string | null
  trigger_type?: string | null
}

interface ExecutionsData {
  items?: ExecutionRow[]
  total?: number
  page?: number
  per_page?: number
}

const EXEC_LABEL: Record<string, string> = {
  active: "نشطة",
  completed: "مكتملة",
  failed: "فاشلة",
  expired: "منتهية",
}

const EXEC_VARIANT: Record<string, "info" | "success" | "destructive" | "secondary"> = {
  active: "info",
  completed: "success",
  failed: "destructive",
  expired: "secondary",
}

/** مقتطف الخطأ: error_log كائن ({error, node_id}) أو نص — كما أعاده الخادم. */
function errorExcerpt(row: ExecutionRow): string {
  const e = row.error
  let text = ""
  if (typeof e === "string") {
    text = e
  } else if (e && typeof e === "object") {
    const rec = e as Record<string, unknown>
    text = typeof rec.error === "string" ? rec.error : ""
    const nodeId = typeof rec.node_id === "string" ? rec.node_id : ""
    if (nodeId) text = text ? `${text} (${nodeId})` : `(${nodeId})`
  }
  return text.length > 140 ? `${text.slice(0, 139)}…` : text
}

export function ExecutionsPanel({ flowId }: { flowId: number }) {
  const q = useQuery({
    queryKey: ["flow-executions", flowId],
    queryFn: () => apiFetch(`/api/flows/${flowId}/executions`).then(unwrapApi<ExecutionsData>),
    retry: 1,
  })
  const items = Array.isArray(q.data?.items) ? (q.data?.items ?? []) : []
  const total = Number(q.data?.total ?? items.length) || 0

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <History className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <h2 className="sb-section-title">سجل التنفيذات</h2>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {countPhrase(total, "تنفيذ", "تنفيذين", "تنفيذات")}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="size-11 p-0"
            onClick={() => q.refetch()}
            aria-label="تحديث سجل التنفيذات"
          >
            <RefreshCw className={q.isFetching ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
          </Button>
        </div>

        {q.isError ? (
          <div className="state state-danger py-8" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <h3 className="state-title">تعذّر تحميل السجل</h3>
            <p className="state-desc">
              {(q.error as Error)?.message || "تعذّر جلب تنفيذات هذا التدفق"}
            </p>
          </div>
        ) : q.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-10 rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed text-center">
            لا تنفيذات بعد — انشر التدفق ليعمل على الرسائل الواردة، أو شغّل اختبارًا
            من شريط الأدوات.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-border/50" role="log" aria-label="قائمة التنفيذات">
            {items.map((row, i) => {
              const key = row.id ?? i
              const status = String(row.status ?? "")
              const excerpt = errorExcerpt(row)
              return (
                <div key={key} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <Badge variant={EXEC_VARIANT[status] ?? "secondary"} className="shrink-0">
                      {EXEC_LABEL[status] ?? (status || "—")}
                    </Badge>
                    <span className="font-mono tabular-nums text-muted-foreground" dir="ltr">#{row.id ?? key}</span>
                    <span>{countPhrase(Number(row.steps ?? 0) || 0, "خطوة")}</span>
                    <span className="text-muted-foreground">{formatDate(row.started_at) || "—"}</span>
                    {row.current_node_id && (
                      <span className="font-mono text-2xs text-muted-foreground" dir="ltr" title="العقدة التالية عند الاستئناف">
                        {row.current_node_id}
                      </span>
                    )}
                    {status === "active" && row.resume_at && (
                      <span className="text-2xs text-muted-foreground">يستأنف {formatDate(row.resume_at)}</span>
                    )}
                  </div>
                  {excerpt && (
                    <p className="text-xs text-destructive-ink leading-relaxed" dir="auto" title={excerpt}>
                      {excerpt}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
