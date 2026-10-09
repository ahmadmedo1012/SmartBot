"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { brandedToast } from "@/lib/premium-toast"
/* v17-E-F4 (D3 #1): success unified on CheckCircle2 app-wide (the payment
   journey — toast → admin approval — renders ONE success glyph). */
import { CheckCircle2, XCircle, RefreshCw, AlertTriangle, CreditCard } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"

/* r131-F7 (A4 P2-6): the admin chrome joins the dashboard grammar —
 * PageHeader sticky bar (h1 + subtitle + the mobile back affordance) +
 * AdminShell's sidebar (layout). SectionContainer/SectionHeader (the
 * centered marketing rhythm) leave the admin surface; the sibling links
 * the old header row carried are now the sidebar/bottom-nav slots. */
import { PageHeader } from "@/components/ui/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { SortableTh, useTableSort } from "@/components/ui/SortableTh"
/* r131-F7b (A4 P2-5): canonical ink-slab filter pills (fleet ruling). */
import { pillClasses } from "@/components/shared/pills"
/* v12-E5.1: framer-motion left this route — the entrance is now the CSS
 * twin .sb-fade-up (components/shared/enter-motion.css), the 1:1 copy of
 * lib/motion.ts fadeUp (0.5s cubic-bezier(0.165,0.84,0.44,1), y24→0),
 * guarded by prefers-reduced-motion. */
import "@/components/shared/enter-motion.css"
import { apiFetch, ApiError } from "@/lib/csrf-client"
import Link from "next/link"
import { unwrapApi } from "@/lib/api"
import { formatDateOnly, formatNumber } from "@/lib/format"
import { CronHeartbeatCard } from "@/components/shared/CronHeartbeatCard"
/* v25 (W-10): جلب /api/me الخام عبر useEffect استُبدل بالخطاف المشترك
 * useMe() (v24-C3) — مدخل كاش واحد (AuthGuard/CTA/هذه الصفحة) بلا طلب
 * مكرر لكل تحميل؛ نفس بيانات {user} (role + tenant_id). */
import { useMe } from "@/hooks/useMe"

interface Payment {
  id: number
  username: string
  plan: string
  amount: number
  status: "pending" | "verified" | "cancelled"
  created_at: string
  phone: string
}

const STATUS_FILTERS = [
  { key: "pending", label: "قيد الانتظار", variant: "warning" as const },
  { key: "verified", label: "مؤكد", variant: "success" as const },
  { key: "cancelled", label: "ملغي", variant: "danger" as const },
  { key: "all", label: "الكل", variant: "outline" as const },
]

const statusConfig: Record<string, { label: string; variant: "warning" | "success" | "destructive" }> = {
  pending: { label: "قيد الانتظار", variant: "warning" },
  verified: { label: "مؤكد", variant: "success" },
  cancelled: { label: "ملغي", variant: "destructive" },
}

export default function AdminPage() {
  const router = useRouter()
  /* v25 (W-10): useMe() بدل useEffect خام — نفس دور "جارٍ التحميل" أثناء
   * الجلب الأول، والفشل يهبط لـ role=null (نفس سلوك catch القديم: عرض
   * «غير مصرح» بدل البقاء في حالة تحميل أبدية). */
  const meQuery = useMe()
  const role = meQuery.data?.user?.role ?? null
  // v10-B4 (G2-02): platform admin = tenant_id 0 — gates the cron card
  const tenantId =
    typeof meQuery.data?.user?.tenant_id === "number" ? meQuery.data.user.tenant_id : null
  const roleLoading = meQuery.isLoading
  const [payments, setPayments] = useState<Payment[]>([])
  const [filter, setFilter] = useState("pending")
  const [loading, setLoading] = useState(true)
  /* v14-E4 (D1 ع-2): fetch failure is no longer swallowed into an empty
   * list — the admin used to see "لا توجد طلبات اشتراك" while /api/admin/
   * subscriptions was erroring, potentially leaving real pending payments
   * unreviewed. Failure now renders an honest error + retry (the same
   * isError/retry pattern as every other page). */
  const [loadError, setLoadError] = useState(false)
  const [actionId, setActionId] = useState<number | null>(null)
  /* r132 (A8 F-SB-2): «رفض» is the money-path destructive action — a
   * misclick permanently cancelled a customer's subscription request in
   * ONE click. The 7-page two-step doctrine (tools/posts/marketing/
   * scheduled/autoreply/sequences/team — «تأكيد الحذف/إلغاء») now guards
   * it too: the first tap arms the row (confirm + cancel pair), the second
   * tap is the only path to POST status="cancelled". «قبول» stays
   * one-click (the money-positive action, not destructive). */
  const [confirmRejectId, setConfirmRejectId] = useState<number | null>(null)

  useEffect(() => {
    const meta = document.createElement("meta")
    meta.name = "robots"
    meta.content = "noindex, nofollow"
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      /* apiFetch throws ApiError on non-2xx; unwrapApi throws on a
       * success:false envelope (fail() is HTTP 200 by design) — every
       * backend failure lands in the catch below. `?? []` is null-safety
       * for a body that parsed to null, not a dual-shape guard. */
      const r = await apiFetch(`/api/admin/subscriptions?status=${filter}`)
      setPayments((await unwrapApi<Payment[]>(r)) ?? [])
    } catch {
      // v14-E4 (D1 ع-2): record the failure — do NOT fall back to []
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { if (role === "admin") fetchPayments() }, [role, fetchPayments])

  /* v26-F4 (P4-A4 §2 P2): فرز أعمدة طلبات الاشتراك — محلي على القائمة
   * المجلوبة (لا صفحات هنا: /api/admin/subscriptions يعيد كل الصفوف). */
  const sortAccessors = useMemo<Record<string, (p: Payment) => number | string | null>>(
    () => ({
      user: (p) => p.username,
      plan: (p) => p.plan,
      amount: (p) => p.amount,
      phone: (p) => p.phone,
      status: (p) => p.status,
      created: (p) => p.created_at,
    }),
    [],
  )
  const { sorted: sortedPayments, sort, toggleSort } = useTableSort(payments, sortAccessors)

  const handleAction = useCallback(async (id: number, status: string) => {
    setActionId(id)
    try {
      /* v15-E5 (D4-H5): apiFetch throws ApiError on any non-2xx — the old
       * `if (!r.ok)` branch was unreachable dead code and the generic catch
       * showed «خطأ في الاتصال» instead of the backend's Arabic detail
       * (e.g. «الدفعة غير موجودة أو تمت معالجتها» for a double-click on a
       * payment another admin already resolved). */
      await apiFetch("/api/admin/subscriptions", {
        method: "POST",
        body: JSON.stringify({ id, status }),
      })
      brandedToast.success(status === "verified" ? "تم تأكيد الاشتراك" : "تم رفض الطلب")
      fetchPayments()
    } catch (e) {
      brandedToast.error(e instanceof ApiError ? e.message : "خطأ في الاتصال")
    }
    setActionId(null)
    /* r132 (A8 F-SB-2): the resolved row leaves the two-step state with the
     * action — success refetches (status flips off pending), failure keeps
     * the row so the cluster returns to its un-armed shape either way. */
    setConfirmRejectId(null)
  }, [fetchPayments])

  // Unauthorized state — r131-F7: the .state family (was a bare
  // AlertTriangle + ad-hoc heading — one of the three retired error skins).
  // r131-F7c: role="alert" restored — every other state-danger block in the
  // app carries it (telegram:241, calendar:92 …); the swap dropped the live
  // region here and in admin/settings.
  if (!roleLoading && role !== "admin") {
    return (
      <div className="state state-danger flex-1 py-16" role="alert">
        <div className="state-icon" aria-hidden="true"><AlertTriangle /></div>
        <h1 className="state-title">غير مصرح</h1>
        <p className="state-desc">هذه الصفحة مخصصة للمشرفين فقط. ليس لديك صلاحيات كافية للوصول.</p>
        {/* v24-C3 (A2 #8): العودة للوحة التحكم كانت window.location.href —
            إعادة تحميل كاملة؛ router.push يبقيها انتقال SPA. */}
        <Button onClick={() => router.push("/dashboard")}>العودة للوحة التحكم</Button>
      </div>
    )
  }

  if (roleLoading) {
    return (
      <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center" role="status" aria-live="polite">
        <span className="sr-only">جارٍ التحميل…</span>
        <div className="size-8 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1">
      {/* r131-F7: PageHeader renders the page h1 (the sr-only h1 + centered
          SectionHeader pair is retired); the back-to-dashboard link lives in
          the header actions — the ONE cross-shell affordance AdminMobileNav
          doesn't carry (sidebar owns it on desktop). */}
      <PageHeader
        icon={<CreditCard className="size-4" />}
        title="إدارة الاشتراكات"
        subtitle="مراجعة وإدارة طلبات الاشتراك"
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

      {/* v6 §E — cron heartbeat truth at a glance (Telegram alerts fire on
          stalls; this card answers "are scheduled posts running?" instantly).
          v10-B4 (G2-02): /api/cron/status is platform-admin-only — tenant
          admins (tenant_id ≠ 0) got 403 + console/network noise; the card is
          now platform-admin exclusive. */}
      <div className="p-6">
      <div className="mb-6">
        <CronHeartbeatCard enabled={role === "admin" && tenantId === 0} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          /* r131-F7b (A4 P2-5, fleet ruling "filter pills = ink-slab"): the
             gold/outline Button filters → the canonical .pill family
             (pillClasses — surface + hairline, .on = ink slab + 4px accent
             halo; messages:785 twin). */
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={pillClasses(filter === f.key, "h-8 px-3.5")}
          >
            {f.label}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto"
          onClick={fetchPayments}
          loading={loading}
          aria-label="تحديث قائمة المدفوعات"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading && payments.length === 0 ? (
            /* v8 C5/C8 — skeleton rows only on the very first load; later
               refetches/filter switches keep the previous rows visible (dimmed
               below) instead of wiping the table — keepPreviousData equivalent */
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="size-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            /* v14-E4 (D1 ع-2): real fetch failure — honest error with retry,
             * NOT the old false "no requests" EmptyState.
             * r131-F7b (A4 P2-8 completion): the bare-AlertCircle block joins
             * the ONE .state family (audience:73 twin — was the third skin:
             * bare 48px /60 icon, no well). */
            <div role="alert" className="state state-danger py-12 sb-fade-up">
              <div className="state-icon" aria-hidden="true">
                <AlertTriangle />
              </div>
              <h2 className="state-title">تعذّر تحميل طلبات الاشتراك</h2>
              <p className="state-desc">
                تعذّر جلب الطلبات من الخادم — قد تكون هناك طلبات قيد الانتظار. تحقّق من الاتصال ثم أعد المحاولة.
              </p>
              <Button variant="outline" size="sm" onClick={fetchPayments}>
                <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
              </Button>
            </div>
          ) : payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              size="sm"
              title="لا توجد طلبات اشتراك"
              description="ستظهر طلبات الاشتراك الجديدة هنا فور تقديمها من المستخدمين."
            />
          ) : (
            <div className={cn("overflow-x-auto transition-opacity", loading && "opacity-60")}>
              {/* v12-E5.5 (E4.7 parity): table gets an accessible name via
                  aria-labelledby — sr-only h2 because SectionHeader's visible
                  h2 has no id we can reference. */}
              <h2 id="admin-payments-heading" className="sr-only">جدول طلبات الاشتراك</h2>
              {/* r131-F7b (A4 P2-1, fleet table canon — completing the F8
                  sweep that landed dashboard + demo): 13px cells (--fs-sm,
                  was text-sm 14), 11px/600 surface-2 header band (was
                  bg-muted/50 inheriting 14px/500), quiet zebra-on-hover wash
                  + 2px first-cell accent dot, tbl-stack mobile collapse via
                  data-label. SortableTh now carries px-4/py-3/600 itself. */}
              <table aria-labelledby="admin-payments-heading" className="tbl-stack w-full text-(length:--fs-sm)">
                <thead>
                  <tr className="border-b border-border bg-muted text-muted-foreground text-[11px] font-semibold uppercase">
                    <SortableTh label="المستخدم" column="user" sort={sort} onToggle={toggleSort} />
                    <SortableTh label="الخطة" column="plan" sort={sort} onToggle={toggleSort} />
                    <SortableTh label="المبلغ" column="amount" sort={sort} onToggle={toggleSort} />
                    <SortableTh label="رقم الهاتف" column="phone" sort={sort} onToggle={toggleSort} />
                    <SortableTh label="الحالة" column="status" sort={sort} onToggle={toggleSort} />
                    <SortableTh label="التاريخ" column="created" sort={sort} onToggle={toggleSort} />
                    <th scope="col" className="text-center px-4 py-3 font-semibold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPayments.map((p) => (
                    <tr key={p.id} className="group/row border-b border-border last:border-0 transition-colors hover:bg-muted/40 sb-fade-up">
                      {/* v15-E6 (D5-M7): usernames are live values (Latin/mixed) —
                          dir="auto" isolates bidi like the phone cell above.
                          r131-F7b: 2px accent leading-edge dot (scaleY spring,
                          RTL-flipped radius) on the first cell. */}
                      <td data-label="المستخدم" dir="auto" className="relative p-3 px-4 font-medium before:pointer-events-none before:absolute before:start-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:origin-center before:scale-y-0 before:rounded-e-sm before:bg-primary before:transition-transform before:duration-(--t-slow) before:ease-spring-soft group-hover/row:before:scale-y-100">{p.username}</td>
                      <td className="p-3 px-4" data-label="الخطة">{p.plan}</td>
                      <td className="p-3 px-4 tabular-nums" data-label="المبلغ">{formatNumber(p.amount)} د.ل</td>
                      <td className="p-3 px-4 text-muted-foreground" data-label="رقم الهاتف" dir="ltr">{p.phone}</td>
                      <td className="p-3 px-4" data-label="الحالة">
                        <Badge variant={statusConfig[p.status]?.variant}>{statusConfig[p.status]?.label}</Badge>
                      </td>
                      <td className="p-3 px-4 text-muted-foreground text-xs" data-label="التاريخ">
                        {p.created_at ? formatDateOnly(p.created_at) : "-"}
                      </td>
                      <td className="p-3 px-4 text-center" data-label="إجراءات">
                        <div className="flex items-center justify-center gap-2">
                          {p.status === "pending" && (
                            <>
                              <Button variant="gold" size="sm" loading={actionId === p.id}
                                onClick={() => handleAction(p.id, "verified")}>
                                <CheckCircle2 className="size-4" aria-hidden="true" /> قبول
                              </Button>
                              {/* r132 (A8 F-SB-2): same cluster swap as the
                                  sequences/posts two-step — the armed row
                                  trades «رفض» for «تأكيد الرفض / إلغاء». */}
                              {confirmRejectId === p.id ? (
                                <>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    loading={actionId === p.id}
                                    onClick={() => handleAction(p.id, "cancelled")}
                                  >
                                    <XCircle className="size-4" aria-hidden="true" /> تأكيد الرفض
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setConfirmRejectId(null)}
                                    aria-label="إلغاء رفض الطلب"
                                  >
                                    إلغاء
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => setConfirmRejectId(p.id)}
                                  aria-label={`رفض طلب الاشتراك للمستخدم ${p.username}`}
                                >
                                  <XCircle className="size-4" aria-hidden="true" /> رفض
                                </Button>
                              )}
                            </>
                          )}
                          {p.status !== "pending" && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
