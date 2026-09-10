"use client"

import { Fragment, useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, RefreshCw, Inbox, CheckCircle2, ChevronLeft, Send } from "lucide-react"
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
import { brandedToast } from "@/lib/premium-toast"
import { formatDateOnly, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Paginated } from "@/lib/types"
import "@/components/shared/enter-motion.css"

/**
 * v16-E3 (plan §1-E3-م6) — platform-admin support ticket queue.
 *
 * Consumes the E2 contract GET /api/admin/support/tickets →
 * ok({items: [{id, subject, body, replies, status, priority, tenant_name,
 * created_at, email}], total, page}) — the owner's live alerting channel
 * across ALL tenants (Telegram notifications stay the optional push channel).
 *
 * v22-D10 (W1-D10 BUG-1 + BUG-6): the loop is finally TWO-WAY. The queue row
 * used to show the subject only (body hidden despite the API returning it)
 * with a close button and NO reply box — the "سيتواصل معك فريق الدعم خلال
 * 24 ساعة" promise was a dead path. Rows are now expandable (grid-rows
 * disclosure, dashboard/support pattern): the full body, the whole thread
 * (replies[] rides on each queue row since v22-D10) and a reply box wired to
 * POST /api/admin/support/tickets/{id}/reply (platform-admin gated, CSRF via
 * apiFetch, Arabic errors surface as toasts). Reply → status=pending
 * «بانتظار العميل» + in-app notification for the ticket owner.
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

interface AdminSupportReply {
  id: number
  message?: string
  is_admin?: boolean
  created_at?: string | null
}

interface AdminSupportTicket {
  id: number
  subject: string
  body: string
  status: string
  priority: string
  tenant_name: string
  created_at: string
  email: string
  /** v22-D10: thread rides on the queue row — the admin answers with full
   * context (the customer's replies included), not from the subject alone. */
  replies?: AdminSupportReply[]
}

interface AdminReplyResult {
  id: number
  is_admin: boolean
  status: string
  message: string
  created_at?: string | null
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
  const [openTicketId, setOpenTicketId] = useState<number | null>(null)
  const [replyText, setReplyText] = useState("")
  const queryClient = useQueryClient()

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
    /* v24-C3 (A2 #5/Q5 — keepPreviousData): page/filter switches keep the
     * previous rows on screen (dimmed via the isFetching opacity-60 cue on
     * the table container below) instead of flashing the full skeleton —
     * the exact proven pattern from messages/page.tsx (v8 C8 / v23). */
    placeholderData: (prev) => prev,
    retry: 1,
  })

  const tickets = ticketsQuery.data?.items ?? []
  const total = ticketsQuery.data?.total ?? 0
  const shownPage = ticketsQuery.data?.page ?? page
  /* The contract exposes total + page but not per_page — an empty page is
   * the honest "no more rows" signal, so «التالي» stops there instead of
   * guessing a page size that may drift from the backend's. */
  const hasNextPage = tickets.length > 0

  /* v17-E-F8 (D6 #5): إغلاق التذكرة من طابور المنصة — POST
   * /api/admin/support/tickets/{id}/close (مسار منصة عابر للمستأجرين؛
   * مسار /api/support/tickets/{id}/close الخلفي محصور بالمستأجر
   * فيرد 404 لمدير المنصة — D4-H1). يخطر صاحب التذكرة داخل التطبيق
   * (نفس عقد مسار المستأجر). */
  const closeMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/support/tickets/${id}/close`, { method: "POST" })
        .then(unwrapApi<{ id: number; status: string }>),
    onSuccess: (d) => {
      brandedToast.success(`تم إغلاق التذكرة #${formatNumber(d.id)}`)
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل إغلاق التذكرة"),
  })

  /* v22-D10 (W1-D10 BUG-1): رد فريق الدعم — POST
   * /api/admin/support/tickets/{id}/reply (require_platform_admin عابر
   * للمستأجرين؛ مسار المستأجر يرد 404 لمدير المنصة). الرد يخطر صاحب
   * التذكرة داخل التطبيق ويقلب الحالة إلى pending «بانتظار العميل».
   * apiFetch يرفع X-CSRF-Token تلقائياً (مسار تحوّل عادي — ليس معفى). */
  const replyMut = useMutation({
    mutationFn: (vars: { id: number; message: string }) =>
      apiFetch(`/api/admin/support/tickets/${vars.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: vars.message }),
      }).then(unwrapApi<AdminReplyResult>),
    onSuccess: (d, vars) => {
      brandedToast.success(`تم إرسال رد الدعم على التذكرة #${formatNumber(vars.id)}`)
      setReplyText("")
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل إرسال الرد"),
  })

  return (
    <SectionContainer className="min-h-screen py-8">
      {/* Visually-hidden page heading — SectionHeader renders the visible title
          as h2, so heading navigation has an h1 target (v8-B5 pattern). */}
      <h1 className="sr-only">طابور تذاكر الدعم</h1>
      <SectionHeader
        title="تذاكر الدعم"
        description="كل تذاكر المستأجرين عبر المنصة في مكان واحد — اقرأ التذكرة كاملة، ردّ عليها، ثم أغلقها عند الحل"
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
                    <th scope="col" className="text-start p-3 font-medium">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    /* v22-D10: كل تذكرة = صف الجدول + صف توسيع بعرض كامل
                     * (colSpan) يحمل نص التذكرة والخيط ومربع الرد — نمط
                     * grid-rows الخاصية نفسه المستخدم في dashboard/support. */
                    <Fragment key={t.id}>
                      <tr className="border-b border-border hover:bg-muted/30 transition-colors sb-fade-up">
                        <td className="p-3 font-medium" data-label="الرقم">
                          #{formatNumber(t.id)}
                        </td>
                        <td className="p-3 font-medium" data-label="الموضوع">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between gap-3 text-start"
                            onClick={() => setOpenTicketId(openTicketId === t.id ? null : t.id)}
                            aria-expanded={openTicketId === t.id}
                            aria-controls={`admin-ticket-thread-${t.id}`}
                            aria-label={`عرض تفاصيل التذكرة رقم ${t.id}`}
                          >
                            <span dir="auto" className="min-w-0 truncate">{t.subject}</span>
                            {/* v7 §2.2 EXCEPTION (documented, not replaced):
                                disclosure chevron — an expand/collapse indicator
                                that ROTATES -90° when open, not a
                                reading-direction semantic. ChevronLeft is the
                                correct RTL glyph; flipping it would invert the
                                expand gesture (dashboard/support precedent). */}
                            <ChevronLeft
                              className={`size-4 text-muted-foreground shrink-0 transition-transform ${openTicketId === t.id ? "-rotate-90" : ""}`}
                              aria-hidden="true"
                            />
                          </button>
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
                        <td className="p-3" data-label="إجراء">
                          {/* v17-E-F8 (D6 #5): إغلاق التذكرة — يظهر للمفتوحة/
                              بانتظار العميل فقط (المغلقة لا تُغلق مرتين). */}
                          {t.status !== "closed" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => closeMut.mutate(t.id)}
                              disabled={closeMut.isPending && closeMut.variables === t.id}
                              loading={closeMut.isPending && closeMut.variables === t.id}
                              aria-label={`إغلاق التذكرة رقم ${t.id}`}
                            >
                              <CheckCircle2 className="size-3.5" aria-hidden="true" /> إغلاق
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      <tr aria-hidden={openTicketId !== t.id}>
                        <td colSpan={8} className="p-0 border-b-0">
                          {/* v17-E-F8 (D2-P1) pattern: حركة فتح/طي — grid-rows
                              [0fr→1fr] + transition-all؛ الغلاف موجود دائمًا
                              (مطابق aria-controls) ويُدار بـ data-open. */}
                          <div
                            id={`admin-ticket-thread-${t.id}`}
                            data-open={openTicketId === t.id || undefined}
                            aria-hidden={openTicketId !== t.id}
                            className="grid grid-rows-[0fr] data-open:grid-rows-[1fr] transition-all duration-300"
                          >
                            <div className="overflow-hidden">
                              {openTicketId === t.id && (
                                <div className="px-4 py-4 bg-muted/20 border-t border-border/40 space-y-3">
                                  {/* v22-D10 (BUG-6): نص التذكرة كاملاً — كان
                                      الجدول يخفيه رغم أن الـ API يعيده. */}
                                  <div>
                                    <p className="text-3xs font-bold text-muted-foreground mb-1">
                                      نص التذكرة
                                    </p>
                                    <p dir="auto" className="text-xs leading-relaxed whitespace-pre-wrap break-words">
                                      {t.body || "—"}
                                    </p>
                                  </div>

                                  {/* الخيط (replies[] من نفس الاستجابة) */}
                                  {(t.replies ?? []).length > 0 && (
                                    <div className="space-y-2">
                                      <p className="text-3xs font-bold text-muted-foreground">
                                        المحادثة ({formatNumber((t.replies ?? []).length)})
                                      </p>
                                      {(t.replies ?? []).map((r) => (
                                        <div
                                          key={r.id}
                                          className={`text-xs rounded-lg p-3 ${
                                            r.is_admin
                                              ? "bg-accent-foreground/5 border border-accent-foreground/20"
                                              : "bg-muted/50"
                                          }`}
                                        >
                                          <p className="font-bold mb-1 text-3xs">
                                            {r.is_admin ? "فريق الدعم" : "العميل"}
                                          </p>
                                          <p dir="auto" className="text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                                            {r.message}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {t.status !== "closed" ? (
                                    /* v22-D10 (BUG-1): مربع الرد — المسار
                                       المفقود كله. raw input + text-base
                                       md:text-sm (أرضية iOS 16px — v17 #4)
                                       و dir="auto" لعزل النص المختلط. */
                                    <div className="flex gap-2 pt-1">
                                      <input
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        placeholder="اكتب رد فريق الدعم…"
                                        aria-label={`نص رد الدعم على التذكرة رقم ${t.id}`}
                                        dir="auto"
                                        className="flex-1 h-9 rounded-sm border border-input bg-transparent px-3 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      />
                                      <Button
                                        size="sm"
                                        className="h-9 gap-1.5"
                                        disabled={replyMut.isPending || replyText.trim().length < 2}
                                        loading={replyMut.isPending && replyMut.variables?.id === t.id}
                                        onClick={() => {
                                          replyMut.mutate({ id: t.id, message: replyText.trim() })
                                        }}
                                        aria-label={`إرسال رد الدعم على التذكرة رقم ${t.id}`}
                                      >
                                        <Send className="size-3 rtl:-scale-x-100" aria-hidden="true" />
                                        رد
                                      </Button>
                                    </div>
                                  ) : (
                                    <p className="text-2xs text-success text-center py-1" role="status">
                                      هذه التذكرة مغلقة — لا يمكن الرد عليها
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination — prev/next over the backend's page window.
              v17-E-F8 (D6 #9): chevrons through DirectionalIcon (variant="chevron")
              — الشيفرون الخام كان استيرادًا مباشرًا يتحايل على مصدر الحقيقة
              الواحد لاتجاه القراءة (v7 §2.1). */}
          {!ticketsQuery.isLoading && !ticketsQuery.isError && (
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
                صفحة {formatNumber(shownPage)}
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
        </CardContent>
      </Card>
    </SectionContainer>
  )
}
