"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { UserPlus, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { unwrapApi } from "@/lib/api"
import type { CrmCustomer } from "@/lib/types"
import { formatDateOnly, formatNumber } from "@/lib/format"

/* v26-F4 (P4-A4 §2 P2): مرشّح مرحلة العميل — الخادم يدعم ?stage= منذ v25
 * (routers/crm_routes.py:27) والصفحة لم تكن تمرّره قط؛ المراحل من
 * models.py:940 (stage = lead/prospect/trial/active/churned). */
const STAGE_FILTERS = [
  { key: "all", label: "الكل" },
  { key: "lead", label: "محتمل" },
  { key: "prospect", label: "مهتم" },
  { key: "trial", label: "تجريبي" },
  { key: "active", label: "نشط" },
  { key: "churned", label: "متوقف" },
] as const

const STAGE_BADGE: Record<string, { label: string; variant: "info" | "gold" | "success" | "warning" | "danger" | "outline" }> = {
  lead: { label: "محتمل", variant: "info" },
  prospect: { label: "مهتم", variant: "gold" },
  trial: { label: "تجريبي", variant: "warning" },
  active: { label: "نشط", variant: "success" },
  churned: { label: "متوقف", variant: "danger" },
}

export default function LeadsPage() {
  /* v25 (W-07): صفحة العملاء الحالية — /api/crm/customers (routers/
   * crm_routes.py:26) يقبل page ge=1 وper_page (افتراضي 25) ويُرجع
   * {items,total,page,per_page}؛ الصفحة كانت تعرض أول نافذة فقط بلا أي
   * سبيل للصفحات التالية. */
  const [page, setPage] = useState(1)
  const [stage, setStage] = useState<string>("all")
  /* أي تبديل مرحلة يعيد نافذة الصفحات للبداية (نمط admin/support v24-C3). */
  useEffect(() => {
    setPage(1)
  }, [stage])
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["crm-customers", page, stage],
    queryFn: async () => {
      const stageQ = stage === "all" ? "" : `&stage=${encodeURIComponent(stage)}`
      const res = await apiFetch(`/api/crm/customers?page=${page}${stageQ}`)
      if (!res.ok) throw new Error(`فشل تحميل العملاء (${res.status})`)
      // API returns a paginated envelope {total, page, per_page, items} —
      // this page maps the LIST. The old code mapped the envelope object
      // itself and crashed with "e.map is not a function" on first render.
      return unwrapApi<{ items: CrmCustomer[]; total: number; page: number; per_page: number }>(res)
    },
    /* v25 (W-07): تبديل الصفحة يُبقي الصفوف السابقة معروضة (بهتة
     * isFetching) بدل وميض الهيكل — نمط admin/support v24-C3. */
    placeholderData: (prev) => prev,
    retry: 1,
  })
  const customers = data?.items ?? []
  /* v25 (W-07): المؤشرات من الظرف — الصفحة الفعلية من data.page، وعدد
   * الصفحات من total/per_page (عقد admin/support نفسه مع «من Y» الإضافي
   * لأن هذا الظرف يفصح عن per_page). */
  const shownPage = data?.page ?? page
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.per_page ?? 25)))
  const hasNextPage = shownPage < totalPages

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي (أيقونة القسم
          نفسها من AdminSidebar + subtitle الجملة الموجودة نصاً). */}
      <PageHeader
        icon={<UserPlus className="size-4" />}
        title="العملاء المتوقعون"
        subtitle="إدارة العملاء المحتملين"
        compact
      />

      {/* v26-F4: مرشّح المرحلة — نفس نمط أزرار admin/support (aria-pressed +
          variant=gold للمفعّل)؛ يمرّر ?stage= للخادم فيُرشّح على كل الصفحات
          لا الصفحة الحالية فقط، مع عدّاد الصفوف من الظرف. */}
      <div className="px-6 pt-2 max-w-5xl mx-auto w-full">
        <div className="flex flex-wrap items-center gap-2">
          {STAGE_FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={stage === f.key ? "gold" : "outline"}
              size="sm"
              onClick={() => setStage(f.key)}
              aria-pressed={stage === f.key}
            >
              {f.label}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground" role="status">
            {formatNumber(data?.total ?? 0)} عميل
          </span>
        </div>
      </div>

      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-5xl mx-auto w-full">
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-14" /></Card>)}</div>
        ) : isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="sb-section-title mb-1">فشل تحميل العملاء</h2>
            <p className="text-xs text-muted-foreground mb-4">{(error as Error)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : customers.length === 0 ? (
          <Card><CardContent className="p-0">
              <EmptyState icon={UserPlus} size="sm" title="لا يوجد عملاء متوقعون بعد" description="عند إضافة أول عميل محتمل ستظهر بياناته هنا مع سجل تواصلك معه." />
            </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {customers.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    {/* v14-E5 (D3-ج): name + notes are live CRM values —
                        dir="auto" isolates Latin/mixed names and free text. */}
                    <p className="text-sm font-bold" dir="auto">{c.name || "بدون اسم"}</p>
                    {/* v26-F4: شارة المرحلة — المرشّح أعلاه بلا عرضها كان
                        يرشّح حقلًا لا يراه المستخدم. */}
                    {c.stage && STAGE_BADGE[c.stage] && (
                      <Badge variant={STAGE_BADGE[c.stage].variant}>{STAGE_BADGE[c.stage].label}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {/* v4 §2.3 — backend crm_routes returns notes/first_seen_at/
                        last_contacted_at; email was never in the serializer */}
                    {c.phone && <p>الهاتف: {c.phone}</p>}
                    {c.notes && <p dir="auto">{c.notes}</p>}
                    {c.first_seen_at && (
                      <p className="text-3xs">أول ظهور: {formatDateOnly(c.first_seen_at)}</p>
                    )}
                    {c.last_contacted_at && (
                      <p className="text-3xs">آخر تواصل: {formatDateOnly(c.last_contacted_at)}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* v25 (W-07): مِرقاة الصفحات — مرآة لنمط admin/support (v24-C3:
            السابق/التالي عبر DirectionalIcon chevrons + مؤشر «صفحة X من Y»
            role=status)؛ تُخفى عند التحميل/الخطأ. */}
        {!isLoading && !isError && (
          <div className="flex items-center justify-center gap-3 p-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="الصفحة السابقة"
            >
              <DirectionalIcon semanticDirection="back" variant="chevron" className="size-4" /> السابق
            </Button>
            <span className="text-xs text-muted-foreground" role="status">
              صفحة {formatNumber(shownPage)} من {formatNumber(totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNextPage}
              aria-label="الصفحة التالية"
            >
              التالي <DirectionalIcon semanticDirection="forward" variant="chevron" className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
