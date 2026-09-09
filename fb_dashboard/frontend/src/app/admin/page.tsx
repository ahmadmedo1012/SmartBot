"use client"

import { useState, useEffect, useCallback } from "react"
import { brandedToast } from "@/lib/premium-toast"
/* v17-E-F4 (D3 #1): success unified on CheckCircle2 app-wide (the payment
   journey — toast → admin approval — renders ONE success glyph). */
import { CheckCircle2, XCircle, RefreshCw, AlertTriangle, Settings, CreditCard, Send, LifeBuoy } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
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
  const [role, setRole] = useState<string | null>(null)
  // v10-B4 (G2-02): platform admin = tenant_id 0 — gates the cron card
  const [tenantId, setTenantId] = useState<number | null>(null)
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
  const [roleLoading, setRoleLoading] = useState(true)

  useEffect(() => {
    const meta = document.createElement("meta")
    meta.name = "robots"
    meta.content = "noindex, nofollow"
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  useEffect(() => {
    apiFetch("/api/me")
      .then(unwrapApi)
      .then((d) => {
        setRole(d?.user?.role || null)
        setTenantId(typeof d?.user?.tenant_id === "number" ? d.user.tenant_id : null)
        setRoleLoading(false)
      })
      .catch(() => { setRole(null); setRoleLoading(false) })
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
  }, [fetchPayments])

  // Unauthorized state
  if (!roleLoading && role !== "admin") {
    return (
      <SectionContainer className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md sb-fade-up">
          <AlertTriangle className="size-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">غير مصرح</h1>
          <p className="text-muted-foreground mb-6">هذه الصفحة مخصصة للمشرفين فقط. ليس لديك صلاحيات كافية للوصول.</p>
          <Button onClick={() => window.location.href = "/dashboard"}>العودة للوحة التحكم</Button>
        </div>
      </SectionContainer>
    )
  }

  if (roleLoading) {
    return (
      <SectionContainer className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <span className="sr-only">جارٍ التحميل…</span>
        <div className="size-8 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
      </SectionContainer>
    )
  }

  return (
    <SectionContainer className="min-h-screen py-8">
      {/* Visually-hidden page heading — SectionHeader renders the visible title
          as h2, so heading navigation had no h1 target (v8-B5) */}
      <h1 className="sr-only">إدارة المنصة</h1>
      <SectionHeader title="إدارة الاشتراكات" description="مراجعة وإدارة طلبات الاشتراك" />

      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <DirectionalIcon semanticDirection="back" className="size-4" /> العودة للوحة التحكم
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/settings" className="inline-flex items-center gap-2 text-sm rounded-md border border-border/70 px-3 py-1.5 hover:bg-accent-foreground/8 hover:border-accent-foreground/40 transition-colors">
            <Settings className="size-4" /> إعدادات المنصة
          </Link>
          {/* v14-E4 (D1 ع-1): /admin/telegram was navigation-orphaned — no
              link anywhere in the UI reached it (manual URL typing only).
              Exposed here beside the platform settings so broadcast targets,
              approvers and diagnostics are discoverable for platform admins. */}
          <Link href="/admin/telegram" className="inline-flex items-center gap-2 text-sm rounded-md border border-border/70 px-3 py-1.5 hover:bg-accent-foreground/8 hover:border-accent-foreground/40 transition-colors">
            <Send className="size-4" /> إعدادات تليجرام
          </Link>
          {/* v16-E3 (D4-HIGH merge note): /admin/support was navigation-orphaned
              on landing — same defect class as /admin/telegram (v14-E4 D1 ع-1).
              The platform-admin ticket queue is the owner's only in-app channel
              to SEE support tickets (previously: zero channels — Telegram
              notify was spawn'd dead on Vercel and no queue route existed). */}
          <Link href="/admin/support" className="inline-flex items-center gap-2 text-sm rounded-md border border-border/70 px-3 py-1.5 hover:bg-accent-foreground/8 hover:border-accent-foreground/40 transition-colors">
            <LifeBuoy className="size-4" /> تذاكر الدعم
          </Link>
        </div>
      </div>

      {/* v6 §E — cron heartbeat truth at a glance (Telegram alerts fire on
          stalls; this card answers "are scheduled posts running?" instantly).
          v10-B4 (G2-02): /api/cron/status is platform-admin-only — tenant
          admins (tenant_id ≠ 0) got 403 + console/network noise; the card is
          now platform-admin exclusive. */}
      <div className="mb-6">
        <CronHeartbeatCard enabled={role === "admin" && tenantId === 0} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <Button key={f.key} variant={filter === f.key ? "orange" : "outline"} size="sm" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}>
            {f.label}
          </Button>
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
             * NOT the old false "no requests" EmptyState. */
            <div role="alert" className="py-12 px-4 text-center sb-fade-up">
              <AlertTriangle className="size-12 mx-auto mb-3 text-destructive/60" aria-hidden="true" />
              <h2 className="text-sm font-bold mb-1">فشل تحميل طلبات الاشتراك</h2>
              <p className="text-sm text-muted-foreground mb-4">
                تعذّر جلب الطلبات من الخادم — قد تكون هناك طلبات قيد الانتظار. تحقّق من الاتصال ثم أعد المحاولة.
              </p>
              <Button variant="outline" onClick={fetchPayments}>
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
              <table aria-labelledby="admin-payments-heading" className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th scope="col" className="text-start p-3 font-medium">المستخدم</th>
                    <th scope="col" className="text-start p-3 font-medium">الخطة</th>
                    <th scope="col" className="text-start p-3 font-medium">المبلغ</th>
                    <th scope="col" className="text-start p-3 font-medium">رقم الهاتف</th>
                    <th scope="col" className="text-start p-3 font-medium">الحالة</th>
                    <th scope="col" className="text-start p-3 font-medium">التاريخ</th>
                    <th scope="col" className="text-center p-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-border hover:bg-muted/30 transition-colors sb-fade-up">
                      {/* v15-E6 (D5-M7): usernames are live values (Latin/mixed) —
                          dir="auto" isolates bidi like the phone cell above. */}
                      <td className="p-3 font-medium" data-label="المستخدم" dir="auto">{p.username}</td>
                      <td className="p-3" data-label="الخطة">{p.plan}</td>
                      <td className="p-3" data-label="المبلغ">{formatNumber(p.amount)} د.ل</td>
                      <td className="p-3 text-muted-foreground" data-label="رقم الهاتف" dir="ltr">{p.phone}</td>
                      <td className="p-3" data-label="الحالة">
                        <Badge variant={statusConfig[p.status]?.variant}>{statusConfig[p.status]?.label}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs" data-label="التاريخ">
                        {p.created_at ? formatDateOnly(p.created_at) : "-"}
                      </td>
                      <td className="p-3 text-center" data-label="إجراءات">
                        <div className="flex items-center justify-center gap-2">
                          {p.status === "pending" && (
                            <>
                              <Button variant="orange" size="sm" loading={actionId === p.id}
                                onClick={() => handleAction(p.id, "verified")}>
                                <CheckCircle2 className="size-4" aria-hidden="true" /> قبول
                              </Button>
                              <Button variant="destructive" size="sm" loading={actionId === p.id}
                                onClick={() => handleAction(p.id, "cancelled")}>
                                 <XCircle className="size-4" /> رفض
                              </Button>
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
    </SectionContainer>
  )
}
