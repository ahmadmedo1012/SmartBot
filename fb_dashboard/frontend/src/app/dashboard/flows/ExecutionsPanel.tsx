"use client"

/**
 * P43-C-2 — لوحة سجل التنفيذات لاستوديو الأتمتة.
 * P45-W1 (المبادرة A) — عمق المراقبة: كانت الصفحة الأولى بلا فلاتر أو
 * ترقيم أو اسم مشترك أو رابط محادثة. الآن:
 *   * رقائق فلترة الحالة (الكل/نشطة/مكتملة/فاشلة/منتهية) → ?status=
 *   * ترقيم (TablePagination المشتركة) → ?page= (per_page=10)
 *   * اسم المشترك (subscriber_name — وصل P45-W1 الخلفي)
 *   * زر «افتح في الوارد» يصل المحادثة عبر ?c=<fb_conversation_id>
 *     (نفس مسار الوارد العميق v24-C2)
 *
 * GET /api/flows/{id}/executions (غلاف {success,data}):
 *   data {items: [{id, status(active/completed/failed/expired),
 *   subscriber_name, fb_conversation_id, steps, error, current_node_id,
 *   resume_at, started_at, completed_at, …}], total, page, per_page} —
 * تُقرأ دفاعيًا (قد تتطور استجابة الخدمة).
 *
 * كل صف: شريحة حالة عربية + المشترك + عدد الخطوات + الختم الزمني
 * (تنسيق التاريخ العربي الموحد lib/format) + موضع الاستئناف + مقتطف
 * الخطأ كما أعاده الخادم (رصد لماذا مات التنفيذ لا مجرد أنه مات).
 */
import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, ExternalLink, History, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TablePagination } from "@/components/shared/TablePagination"
import { pillClasses } from "@/components/shared/pills"
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
  /** P45-W1 — الوصل الخلفي: اسم المشترك ("" حين حُذف صفه). */
  subscriber_name?: string | null
  trigger_type?: string | null
  /** P45-W1 — الوصل الخلفي: معرّف محادثة فيسبوك (رابط الوارد العميق). */
  fb_conversation_id?: string | null
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

/** P45-W1 — رقائق الفلترة: "" = الكل (عقد الخادم: الحالة الفارغة بلا فلتر). */
const EXEC_FILTERS = [
  { value: "", label: "الكل" },
  { value: "active", label: "نشطة" },
  { value: "completed", label: "مكتملة" },
  { value: "failed", label: "فاشلة" },
  { value: "expired", label: "منتهية" },
] as const

const PER_PAGE = 10

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

/** اسم المشترك الصادق: الوصل الخلفي، وإلا المعرّف، وإلا «—». */
function subscriberLabel(row: ExecutionRow): string {
  const name = (row.subscriber_name ?? "").trim()
  if (name) return name
  if (row.subscriber_id != null && row.subscriber_id !== "") return `مشترك #${row.subscriber_id}`
  return "—"
}

export function ExecutionsPanel({ flowId }: { flowId: number }) {
  /* P45-W1: الفلتر + الصفحة حالة محلية — تغيير الفلتر يعيد الصفحة إلى 1 */
  const [statusFilter, setStatusFilter] = useState("")
  const [page, setPage] = useState(1)

  const q = useQuery({
    queryKey: ["flow-executions", flowId, statusFilter, page],
    /* NOTE: the executions URL stays ONE leading literal (…/executions` +
     * query) — the W6-B1 parity pin greps the family surface literally. */
    queryFn: () => apiFetch(
      `/api/flows/${flowId}/executions` +
      `?per_page=${PER_PAGE}&page=${page}` +
      (statusFilter ? `&status=${statusFilter}` : ""),
    ).then(unwrapApi<ExecutionsData>),
    placeholderData: (prev) => prev,
    retry: 1,
  })
  const items = Array.isArray(q.data?.items) ? (q.data?.items ?? []) : []
  const total = Number(q.data?.total ?? items.length) || 0
  const perPage = Number(q.data?.per_page ?? PER_PAGE) || PER_PAGE
  const totalPages = Math.max(1, Math.ceil(total / perPage))

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

        {/* P45-W1: رقائق فلترة الحالة — أرقام الصفحة تعود إلى 1 عند التبديل */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="فلترة التنفيذات حسب الحالة">
          {EXEC_FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              onClick={() => {
                if (statusFilter !== f.value) {
                  setStatusFilter(f.value)
                  setPage(1)
                }
              }}
              aria-pressed={statusFilter === f.value}
              className={pillClasses(statusFilter === f.value, "min-h-11 px-3.5")}
            >
              {f.label}
            </button>
          ))}
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
            {statusFilter
              ? `لا تنفيذات بحالة «${EXEC_LABEL[statusFilter] ?? statusFilter}» — جرّب فلترًا آخر.`
              : "لا تنفيذات بعد — انشر التدفق ليعمل على الرسائل الواردة، أو شغّل اختبارًا من شريط الأدوات."}
          </p>
        ) : (
          <div className="divide-y divide-border/50" role="log" aria-label="قائمة التنفيذات">
            {items.map((row, i) => {
              const key = row.id ?? i
              const status = String(row.status ?? "")
              const excerpt = errorExcerpt(row)
              const subName = subscriberLabel(row)
              const fbConv = (row.fb_conversation_id ?? "").trim()
              return (
                <div key={key} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <Badge variant={EXEC_VARIANT[status] ?? "secondary"} className="shrink-0">
                      {EXEC_LABEL[status] ?? (status || "—")}
                    </Badge>
                    <span className="font-mono tabular-nums text-muted-foreground" dir="ltr">#{row.id ?? key}</span>
                    {/* P45-W1: المشترك — من كان يتنفّذ فعلاً */}
                    <span className="min-w-0 truncate font-medium" dir="auto" title={subName}>
                      {subName}
                    </span>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {excerpt ? (
                      <p className="min-w-0 flex-1 text-xs text-destructive-ink leading-relaxed" dir="auto" title={excerpt}>
                        {excerpt}
                      </p>
                    ) : <span className="flex-1" aria-hidden="true" />}
                    {/* P45-W1: الوصلة العميقة للمحادثة — مسار الوارد نفسه (?c=) */}
                    {fbConv && (
                      <Link
                        href={`/dashboard/messages?c=${encodeURIComponent(fbConv)}`}
                        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:underline focus-visible:outline-2"
                        aria-label={`فتح محادثة ${subName} في صندوق الوارد`}
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        افتح في الوارد
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* P45-W1: الترقيم — المكوّن المشترك نفسه (أزرار مرقّمة + السابق/التالي) */}
        <TablePagination
          page={page}
          totalPages={totalPages}
          total={total}
          unitLabel="تنفيذ"
          onPageChange={setPage}
          className="border-t-0 px-0 pt-0 pb-0"
        />
      </CardContent>
    </Card>
  )
}
