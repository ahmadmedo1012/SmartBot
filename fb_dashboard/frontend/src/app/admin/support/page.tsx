"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, RefreshCw, Inbox, ChevronRight, ChevronLeft } from "lucide-react"
import Link from "next/link"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { formatDateOnly, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Paginated } from "@/lib/types"
import "@/components/shared/enter-motion.css"

/**
 * v16-E3 (plan §1-E3-م6) — platform-admin support ticket queue.
 *
 * Consumes the E2 contract GET /api/admin/support/tickets →
 * ok({items: [{id, subject, status, priority, tenant_name, created_at,
 * email}], total, page}) — the owner's live alerting channel across ALL
 * tenants (Telegram notifications stay the optional push channel).
 *
 * Statuses/priorities mirror routers/support.py: status open | pending
 * (admin replied, awaiting the customer) | closed; priority low | medium |
 * high | urgent. Conventions mirror src/app/admin/page.tsx (filters,
 * skeleton-first-load, honest error+retry, aria-labelled table, sr-only h1)
 * and the QueryProvider in admin/layout.tsx owns the react-query scope.
 * Envelope discipline (v13 #3): apiFetch throws ApiError on non-2xx and
 * unwrapApi throws on success:false — both land in useQuery's error state.
 * NO dual-shape guards anywhere.
 */

interface AdminSupportTicket {
  id: number
  subject: string
  status: string
  priority: string
  tenant_name: string
  created_at: string
  email: string
}

type TicketsPage = Paginated<AdminSupportTicket>

const STATUS_FILTERS = [
  { key: "all", label: "الكل" },
  { key: "open", label: "مفتوحة" },
  { key: "pending", label: "بانتظار العميل" },
  { key: "closed", label: "مغلقة" },
]

const STATUS_CONFIG: Record<string, { label: string; variant: "warning" | "info" | "success" }> = {
  open: { label: "مفتوحة", variant: "warning" },
  pending: { label: "بانتظار العميل", variant: "info" },
  closed: { label: "مغلقة", variant: "success" },
}

const PRIORITY_CONFIG: Record<
  string,
  { label: string; variant: "outline" | "info" | "warning" | "danger" }
> = {
  low: { label: "منخفضة", variant: "outline" },
  medium: { label: "متوسطة", variant: "info" },
  high: { label: "عالية", variant: "warning" },
  urgent: { label: "عاجلة", variant: "danger" },
}

export default function AdminSupportPage() {
  const [status, setStatus] = useState("all")
  const [page, setPage] = useState(1)

  useEffect(() => {
    const meta = document.createElement("meta")
    meta.name = "robots"
    meta.content = "noindex, nofollow"
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  // any filter switch restarts the pagination window
  useEffect(() => {
    setPage(1)
  }, [status])

  const ticketsQuery = useQuery({
    queryKey: ["admin-support-tickets", status, page],
    queryFn: () =>
      apiFetch(`/api/admin/support/tickets?status=${status}&page=${page}`).then(
        unwrapApi<TicketsPage>,
      ),
    retry: 1,
  })

  const tickets = ticketsQuery.data?.items ?? []
  const total = ticketsQuery.data?.total ?? 0
  const shownPage = ticketsQuery.data?.page ?? page
  /* The contract exposes total + page but not per_page — an empty page is
   * the honest "no more rows" signal, so «التالي» stops there instead of
   * guessing a page size that may drift from the backend's. */
  const hasNextPage = tickets.length > 0

  return (
    <SectionContainer className="min-h-screen py-8">
      {/* Visually-hidden page heading — SectionHeader renders the visible title
          as h2, so heading navigation has an h1 target (v8-B5 pattern). */}
      <h1 className="sr-only">طابور تذاكر الدعم</h1>
      <SectionHeader
        title="تذاكر الدعم"
        description="كل تذاكر المستأجرين عبر المنصة في مكان واحد — قناة اطلاع حية لمالك المنصة"
      />

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <DirectionalIcon semanticDirection="back" className="size-4" /> العودة للوحة التحكم
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={status === f.key ? "orange" : "outline"}
            size="sm"
            onClick={() => setStatus(f.key)}
            aria-pressed={status === f.key}
          >
            {f.label}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground" role="status">
          {formatNumber(total)} تذكرة
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto"
          onClick={() => ticketsQuery.refetch()}
          loading={ticketsQuery.isRefetching}
          aria-label="تحديث قائمة التذاكر"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {ticketsQuery.isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-3 w-10 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : ticketsQuery.isError ? (
            <div role="alert" className="py-12 px-4 text-center sb-fade-up">
              <AlertTriangle className="size-12 mx-auto mb-3 text-destructive/60" aria-hidden="true" />
              <h2 className="text-sm font-bold mb-1">فشل تحميل التذاكر</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {(ticketsQuery.error as Error)?.message || "تعذّر جلب التذاكر من الخادم — أعد المحاولة."}
              </p>
              <Button variant="outline" onClick={() => ticketsQuery.refetch()}>
                <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
              </Button>
            </div>
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={Inbox}
              size="sm"
              title={status === "all" ? "لا توجد تذاكر دعم" : "لا توجد تذاكر بهذه الحالة"}
              description="ستظهر تذاكر الدعم الجديدة من كل المستأجرين هنا فور إنشائها."
            />
          ) : (
            <div
              className={cn(
                "overflow-x-auto transition-opacity",
                ticketsQuery.isFetching && "opacity-60",
              )}
            >
              <h2 id="admin-support-heading" className="sr-only">
                جدول تذاكر الدعم
              </h2>
              <table aria-labelledby="admin-support-heading" className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th scope="col" className="text-start p-3 font-medium">الرقم</th>
                    <th scope="col" className="text-start p-3 font-medium">الموضوع</th>
                    <th scope="col" className="text-start p-3 font-medium">المستأجر</th>
                    <th scope="col" className="text-start p-3 font-medium">الأولوية</th>
                    <th scope="col" className="text-start p-3 font-medium">الحالة</th>
                    <th scope="col" className="text-start p-3 font-medium">البريد</th>
                    <th scope="col" className="text-start p-3 font-medium">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-border hover:bg-muted/30 transition-colors sb-fade-up"
                    >
                      <td className="p-3 font-medium" data-label="الرقم">
                        #{formatNumber(t.id)}
                      </td>
                      {/* v15-E6 (D5-M7) pattern: subject/tenant/email are live
                          values (Arabic/Latin/mixed) — dir="auto" isolates
                          bidi per cell. */}
                      <td className="p-3 font-medium" data-label="الموضوع" dir="auto">
                        {t.subject}
                      </td>
                      <td className="p-3 text-muted-foreground" data-label="المستأجر" dir="auto">
                        {t.tenant_name}
                      </td>
                      <td className="p-3" data-label="الأولوية">
                        <Badge variant={PRIORITY_CONFIG[t.priority]?.variant}>
                          {PRIORITY_CONFIG[t.priority]?.label ?? t.priority}
                        </Badge>
                      </td>
                      <td className="p-3" data-label="الحالة">
                        <Badge variant={STATUS_CONFIG[t.status]?.variant}>
                          {STATUS_CONFIG[t.status]?.label ?? t.status}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs" data-label="البريد" dir="auto">
                        {t.email}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs" data-label="التاريخ">
                        {t.created_at ? formatDateOnly(t.created_at) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination — prev/next over the backend's page window */}
          {!ticketsQuery.isLoading && !ticketsQuery.isError && (
            <div className="flex items-center justify-center gap-3 p-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="الصفحة السابقة"
              >
                <ChevronRight className="size-4" aria-hidden="true" /> السابق
              </Button>
              <span className="text-xs text-muted-foreground" role="status">
                صفحة {formatNumber(shownPage)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNextPage}
                aria-label="الصفحة التالية"
              >
                التالي <ChevronLeft className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </SectionContainer>
  )
}
