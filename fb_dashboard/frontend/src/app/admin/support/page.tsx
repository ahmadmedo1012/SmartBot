"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, RefreshCw, Inbox, CheckCircle2, ChevronLeft, Send, LifeBuoy } from "lucide-react"
import Link from "next/link"
import { DirectionalIcon } from "@/components/ui/directional-icon"
/* r131-F7 (A4 P2-6): PageHeader bar + AdminShell sidebar replace the
 * centered SectionHeader marketing rhythm on the admin surface. */
import { PageHeader } from "@/components/ui/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { SortableTh, useTableSort } from "@/components/ui/SortableTh"
/* r131-F7b (A4 P2-5 + P2-1): canonical ink-slab filter pills + the
 * numbered windowed pagination footer (fleet rulings). */
import { pillClasses } from "@/components/shared/pills"
import { TablePagination } from "@/components/shared/TablePagination"
/* r131-F7b (A4 P1-1a): the reply box raw <input> (h-9 / rounded-sm /
 * md:text-sm 14px desktop — the last h-9 sub-44/sub-16 site) rides the
 * shared Input recipe (h-11 / r-md / 16px floor / halo token). */
import { Input } from "@/components/ui/input"
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

/* r131-F7b (A4 P2-1): the queue API's page window rides an explicit
 * `limit` (backend default 20, ge=1 le=100 — routers/support.py:326) so
 * totalPages is EXACT for the numbered pagination footer; the old
 * «التالي»-until-empty-page probing is retired with it. */
const TICKETS_PER_PAGE = 20

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
      apiFetch(`/api/admin/support/tickets?status=${status}&page=${page}&limit=${TICKETS_PER_PAGE}`).then(
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
  /* v26-F4 (P4-A4 §2 P2): فرز أعمدة الجدول — محلي على صفحة النافذة
   * الحالية (عقد الخادم لا يفصح عن ?sort= بعد؛ الفرز لا يغيّر النافذة). */
  const sortAccessors = useMemo<Record<string, (t: AdminSupportTicket) => number | string | null>>(
    () => ({
      id: (t) => t.id,
      subject: (t) => t.subject,
      tenant: (t) => t.tenant_name,
      priority: (t) => t.priority,
      status: (t) => t.status,
      created: (t) => t.created_at ?? "",
    }),
    [],
  )
  const { sorted: sortedTickets, sort, toggleSort } = useTableSort(tickets, sortAccessors)
  const shownPage = ticketsQuery.data?.page ?? page
  /* r131-F7b (A4 P2-1): explicit limit → exact page math for the numbered
   * footer (was the «التالي»-until-empty heuristic). */
  const totalPages = Math.max(1, Math.ceil(total / TICKETS_PER_PAGE))

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
    <div className="flex-1">
      {/* r131-F7: PageHeader renders the page h1 (the sr-only h1 + centered
          SectionHeader pair is retired); the back-link rides the header
          actions (the sidebar owns the sibling navigation on desktop). */}
      <PageHeader
        icon={<LifeBuoy className="size-4" />}
        title="تذاكر الدعم"
        subtitle="كل تذاكر المستأجرين عبر المنصة في مكان واحد"
        compact
        actions={
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60"
          >
            <DirectionalIcon semanticDirection="back" className="size-4" /> العودة للوحة التحكم
          </Link>
        }
      />

      {/* r131-F7: dashboard content rhythm (p-6 under the sticky bar). */}
      <div className="p-6">

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          /* r131-F7b (A4 P2-5, fleet ruling "filter pills = ink-slab"): the
             gold/outline Button filters → the canonical .pill family
             (pillClasses — surface + hairline, .on = ink slab + 4px accent
             halo; messages:785 + admin/page twins). */
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            aria-pressed={status === f.key}
            className={pillClasses(status === f.key, "h-8 px-3.5")}
          >
            {f.label}
          </button>
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
            /* r131-F7b (A4 P2-8 completion): the bare-AlertCircle block joins
             * the ONE .state family (admin/page twin). */
            <div role="alert" className="state state-danger py-12 sb-fade-up">
              <div className="state-icon" aria-hidden="true">
                <AlertTriangle />
              </div>
              <h2 className="state-title">فشل تحميل التذاكر</h2>
              <p className="state-desc">
                {(ticketsQuery.error as Error)?.message || "تعذّر جلب التذاكر من الخادم — أعد المحاولة."}
              </p>
              <Button variant="outline" size="sm" onClick={() => ticketsQuery.refetch()}>
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
              {/* r131-F7b (A4 P2-1, fleet table canon — completing the F8
                  sweep): 13px cells (--fs-sm, was text-sm 14), 11px/600
                  surface-2 header band, quiet zebra-on-hover wash + 2px
                  first-cell accent dot. NOTE: this table deliberately does
                  NOT take .tbl-stack — its rows are Fragment-paired with a
                  colSpan disclosure <tr> (the thread + reply box), which
                  cannot nest inside a parent row-card under display:block;
                  the canonical overflow-x-auto fallback keeps it usable
                  (W1-I §3.5: "non-opted tables fall back to horizontal
                  scroll"). */}
              <table aria-labelledby="admin-support-heading" className="w-full text-(length:--fs-sm)">
                <thead>
                  <tr className="border-b border-border bg-muted text-muted-foreground text-[11px] font-semibold uppercase">
                    <SortableTh label="الرقم" column="id" sort={sort} onToggle={toggleSort} />
                    <SortableTh label="الموضوع" column="subject" sort={sort} onToggle={toggleSort} />
                    <SortableTh label="المستأجر" column="tenant" sort={sort} onToggle={toggleSort} />
                    <SortableTh label="الأولوية" column="priority" sort={sort} onToggle={toggleSort} />
                    <SortableTh label="الحالة" column="status" sort={sort} onToggle={toggleSort} />
                    <th scope="col" className="text-start px-4 py-3 font-semibold">البريد</th>
                    <SortableTh label="التاريخ" column="created" sort={sort} onToggle={toggleSort} />
                    <th scope="col" className="text-start px-4 py-3 font-semibold">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTickets.map((t) => (
                    /* v22-D10: كل تذكرة = صف الجدول + صف توسيع بعرض كامل
                     * (colSpan) يحمل نص التذكرة والخيط ومربع الرد — نمط
                     * grid-rows الخاصية نفسه المستخدم في dashboard/support. */
                    <Fragment key={t.id}>
                      <tr className="group/row border-b border-border transition-colors hover:bg-muted/40 sb-fade-up">
                        {/* r131-F7b: 2px accent leading-edge dot (scaleY
                            spring, RTL-flipped radius) on the first cell. */}
                        <td data-label="الرقم" className="relative p-3 px-4 font-medium before:pointer-events-none before:absolute before:start-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:origin-center before:scale-y-0 before:rounded-e-sm before:bg-primary before:transition-transform before:duration-(--t-slow) before:ease-spring-soft group-hover/row:before:scale-y-100">
                          #{formatNumber(t.id)}
                        </td>
                        <td className="p-3 px-4 font-medium" data-label="الموضوع">
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
                        <td className="p-3 px-4 text-muted-foreground" data-label="المستأجر" dir="auto">
                          {t.tenant_name}
                        </td>
                        <td className="p-3 px-4" data-label="الأولوية">
                          <Badge variant={PRIORITY_CONFIG[t.priority]?.variant}>
                            {PRIORITY_CONFIG[t.priority]?.label ?? t.priority}
                          </Badge>
                        </td>
                        <td className="p-3 px-4" data-label="الحالة">
                          <Badge variant={STATUS_CONFIG[t.status]?.variant}>
                            {STATUS_CONFIG[t.status]?.label ?? t.status}
                          </Badge>
                        </td>
                        <td className="p-3 px-4 text-muted-foreground text-xs" data-label="البريد" dir="auto">
                          {t.email}
                        </td>
                        <td className="p-3 px-4 text-muted-foreground text-xs" data-label="التاريخ">
                          {t.created_at ? formatDateOnly(t.created_at) : "-"}
                        </td>
                        <td className="p-3 px-4" data-label="إجراء">
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
                            className="grid grid-rows-[0fr] data-open:grid-rows-[1fr] transition-all duration-(--t-base)"
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
                                       المفقود كله. r131-F7b (A4 P1-1a): the
                                       raw <input> (h-9/rounded-sm/md:text-sm)
                                       → the shared Input recipe (h-11 / r-md
                                       / 16px floor / halo token — the last
                                       h-9 sub-44/sub-16 site in the app). */
                                    <div className="flex gap-2 pt-1">
                                      <Input
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        placeholder="اكتب رد فريق الدعم…"
                                        aria-label={`نص رد الدعم على التذكرة رقم ${t.id}`}
                                        className="flex-1"
                                      />
                                      <Button
                                        size="sm"
                                        className="self-start mt-2"
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
                                    <p className="text-2xs text-success-ink text-center py-1" role="status">
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

          {/* Pagination — r131-F7b (A4 P2-1, fleet ruling "numbered
              pagination"): the «السابق/التالي» link row → the canonical
              TablePagination footer (hairline-topped, count on the start
              side, windowed page-number buttons + ellipsis gaps, 44px touch
              below sm; audience:197 twin). The explicit `limit` above makes
              totalPages exact; the page status line stays as the polite
              live region for the current window. */}
          {!ticketsQuery.isLoading && !ticketsQuery.isError && total > 0 && (
            <>
              <p className="sr-only" role="status">
                صفحة {formatNumber(shownPage)} من {formatNumber(totalPages)}
              </p>
              <TablePagination
                page={shownPage}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
                unitLabel="تذكرة"
              />
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
