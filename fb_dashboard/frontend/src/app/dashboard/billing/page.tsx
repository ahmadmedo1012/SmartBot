"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { CreditCard, AlertCircle, RefreshCw, Zap, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { unwrapApi } from "@/lib/api"
import type { PaymentBalance, PaymentRecord } from "@/lib/types"
import { formatDate, formatNumber } from "@/lib/format"

const STATUS_LABELS: Record<string, string> = {
  completed: "مكتمل", pending: "قيد الانتظار", failed: "فاشل",
  confirmed: "مؤكد", cancelled: "ملغى", verified: "مُفعّل", rejected: "مرفوض",
}
const PROVIDER_LABELS: Record<string, string> = {
  liyana: "ليبيانا", madar: "مدار", bank: "تحويل بنكي",
}

export default function BillingPage() {
  const { data: balance, isLoading: balLoad, isError: balErr, refetch: balRefetch } = useQuery({
    queryKey: ["balance"],
    queryFn: async () => {
      const res = await apiFetch("/api/payments/balance")
      if (!res.ok) throw new Error(`فشل تحميل الرصيد (${res.status})`)
      return unwrapApi<PaymentBalance>(res)
    },
    retry: 1,
  })

  const { data: history = [], isLoading: histLoad, isError: histErr, error, refetch } = useQuery({
    queryKey: ["payment-history"],
    queryFn: async () => {
      const res = await apiFetch("/api/payments/history")
      if (!res.ok) throw new Error(`فشل تحميل سجل الدفع (${res.status})`)
      return unwrapApi<PaymentRecord[]>(res)
    },
    retry: 1,
  })

  const anyError = balErr || histErr

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <CreditCard className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الفواتير</h1>
            <p className="text-2xs text-muted-foreground">الرصيد وسجل الدفع</p>
          </div>
          {/* Recharge CTA (plan v3 §7c — support FAQ pointed here with no button before)
              v16-E3 (D1 C2): un-nested Link>Button — orange sm visuals moved to
              a span, the anchor is the single tab stop. */}
          <Link href="/subscribe" className="ms-auto">
            <span className="relative inline-flex shrink-0 items-center justify-center rounded-lg border-0 font-sans text-xs font-bold whitespace-nowrap select-none isolate overflow-hidden bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm shadow-accent-foreground/15 hover:shadow-xl hover:shadow-accent-foreground/40 dark:shadow-accent-foreground/35 dark:hover:shadow-accent-foreground/50 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 ease-smooth h-10 min-h-11 min-w-11 gap-1.5 px-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>*]:relative before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(105deg,transparent_30%,oklch(1_0_0_/_0.22)_50%,transparent_70%)] before:-translate-x-full before:transition-transform before:duration-700 before:ease-out hover:before:translate-x-full before:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-[radial-gradient(circle_at_50%_50%,oklch(1_0_0_/_0.16),transparent_45%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500">
              <Zap className="size-3.5" /> اشترك أو اشحن الرصيد
            </span>
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground mb-1">الرصيد الحالي</p>
            {balLoad ? (
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
            ) : balErr ? (
              /* v9-B11 — a balance load failure used to render "غير متاح"
                  as if the balance were genuinely absent */
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-destructive">فشل تحميل الرصيد</p>
                <Button size="sm" variant="outline" onClick={() => balRefetch()}>إعادة المحاولة</Button>
              </div>
            ) : balance ? (
              <p className="text-3xl font-bold">{formatNumber(balance.balance)} <span className="text-lg font-normal text-muted-foreground">{balance.currency}</span></p>
            ) : (
              <p className="text-sm text-muted-foreground">غير متاح</p>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" /> سجل الدفع
          </h2>
          {histLoad ? (
            <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-10" /></Card>)}</div>
          ) : anyError ? (
            <div className="text-center py-8">
              <AlertCircle className="size-8 mx-auto mb-2 text-destructive/50" />
              <p className="text-xs text-muted-foreground mb-3">{(error as Error)?.message || "تعذر الاتصال"}</p>
              {/* v9-B11 — retry BOTH queries: either one may be the failed one */}
              <Button size="sm" variant="outline" onClick={() => { balRefetch(); refetch() }}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
            </div>
          ) : history.length === 0 ? (
            <Card><CardContent className="p-0">
              <EmptyState icon={Receipt} size="sm" title="لا توجد معاملات سابقة" description="ستظهر عمليات الشحن والدفع هنا — يمكنك الاشتراك أو شحن رصيدك من زر الرصيد أعلى الصفحة." />
            </CardContent></Card>
          ) : (
            <div className="space-y-2" role="list">
              {history.map((p) => (
                <Card key={p.payment_id} role="listitem">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{formatNumber(p.amount)} د.ل</p>
                      <p className="text-xs text-muted-foreground" dir="auto">{PROVIDER_LABELS[p.provider] || p.provider} · {p.phone}</p>
                      <p className="text-3xs text-muted-foreground">{formatDate(p.created_at)}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.status === "completed" ? "bg-success-soft text-success" :
                      p.status === "pending" ? "bg-warning/10 text-warning" :
                      p.status === "failed" ? "bg-destructive-soft text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}>{STATUS_LABELS[p.status] || p.status}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
