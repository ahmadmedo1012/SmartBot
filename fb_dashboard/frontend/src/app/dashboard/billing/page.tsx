"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { CreditCard, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function BillingPage() {
  const { data: balance, isLoading: balLoad, isError: balErr } = useQuery({
    queryKey: ["balance"],
    queryFn: async () => {
      const res = await apiFetch("/api/payments/balance")
      if (!res.ok) throw new Error(`فشل تحميل الرصيد (${res.status})`)
      return res.json()
    },
    retry: 1,
  })

  const { data: history = [], isLoading: histLoad, isError: histErr, error, refetch } = useQuery({
    queryKey: ["payment-history"],
    queryFn: async () => {
      const res = await apiFetch("/api/payments/history")
      if (!res.ok) throw new Error(`فشل تحميل سجل الدفع (${res.status})`)
      return res.json()
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
            <p className="text-[11px] text-muted-foreground">الرصيد وسجل الدفع</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-xs text-muted-foreground mb-1">الرصيد الحالي</p>
            {balLoad ? (
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
            ) : balance ? (
              <p className="text-3xl font-bold">{balance.balance?.toLocaleString()} <span className="text-lg font-normal text-muted-foreground">{balance.currency}</span></p>
            ) : (
              <p className="text-sm text-muted-foreground">غير متاح</p>
            )}
          </CardContent>
        </Card>

        <div>
          <h3 className="font-bold text-sm mb-3">سجل الدفع</h3>
          {histLoad ? (
            <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-10" /></Card>)}</div>
          ) : anyError ? (
            <div className="text-center py-8">
              <AlertCircle className="size-8 mx-auto mb-2 text-red-500/50" />
              <p className="text-xs text-muted-foreground mb-3">{(error as any)?.message || "تعذر الاتصال"}</p>
              <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
            </div>
          ) : (history as any[]).length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد معاملات سابقة</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {(history as any[]).map((p: any) => (
                <Card key={p.payment_id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{p.amount?.toLocaleString()} LYD</p>
                      <p className="text-xs text-muted-foreground">{p.provider} · {p.phone}</p>
                      <p className="text-[10px] text-muted-foreground">{p.created_at ? new Date(p.created_at).toLocaleString("ar-LY") : ""}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.status === "completed" ? "bg-green-500/10 text-green-500" :
                      p.status === "pending" ? "bg-yellow-500/10 text-yellow-500" :
                      p.status === "failed" ? "bg-red-500/10 text-red-500" :
                      "bg-muted text-muted-foreground"
                    }`}>{p.status}</span>
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
