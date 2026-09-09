"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Target, AlertCircle, RefreshCw, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { unwrapApi } from "@/lib/api"
import type { AdsAccountsResponse } from "@/lib/types"
import { formatNumber } from "@/lib/format"

export default function AdsPage() {
  /* v19 Step 2 — DB-first envelope: {items, source, synced}. The old bare
   * array made a FAILING Graph call indistinguishable from «no accounts»
   * (the empty-state lie). synced=false now tells this page the refresh
   * itself failed: empty+failed → real error state; rows+failed → rows
   * with a "last synced" notice. */
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ads-accounts"],
    queryFn: async () => {
      const res = await apiFetch("/api/ads/accounts")
      if (!res.ok) throw new Error(`فشل تحميل حسابات الإعلانات (${res.status})`)
      return unwrapApi<AdsAccountsResponse>(res)
    },
    retry: 1,
  })
  const accounts = data?.items ?? []
  const syncFailed = data ? data.synced === false : false

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<Target className="size-4" />}
        title="الإعلانات"
        subtitle="إدارة الإعلانات"
        compact
      />

      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-5xl mx-auto w-full">
        {/* Plan §4.5: Facebook Marketing API requires app review + business
            verification — show honest "coming soon" until approved. */}
        <Card>
          <CardContent className="p-4 flex items-start gap-3.5 border border-accent-foreground/25 bg-primary/[0.03]">
            <div className="size-10 rounded-xl bg-accent-foreground/10 flex items-center justify-center shrink-0">
              <Target className="size-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold">إدارة الإعلانات — قريباً</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                تتطلب واجهة Facebook Marketing مراجعة التطبيق وتوثيق النشاط التجاري من فيسبوك
                قبل التفعيل. عند اكتمال الموافقة ستظهر هنا إدارة الحملات الإعلانية كاملة.
              </p>
            </div>
          </CardContent>
        </Card>
        {isLoading ? (
          <div className="space-y-2">{[1,2].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-14" /></Card>)}</div>
        ) : isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل الحسابات</h2>
            <p className="text-xs text-muted-foreground mb-4">{(error as Error)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : syncFailed && accounts.length === 0 ? (
          /* v19: Graph refresh failed AND nothing stored — the OLD UI showed
           * «لا توجد حسابات إعلانية مرتبطة» here (data looked empty instead
           * of broken). Say the truth + offer retry. */
          <div className="text-center py-16">
            <WifiOff className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">فشل الاتصال بفيسبوك</h2>
            <p className="text-xs text-muted-foreground mb-4">
              تعذر تحديث حساباتك الإعلانية من فيسبوك — تحقق من صلاحية رمز الوصول ثم أعد المحاولة.
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : accounts.length === 0 ? (
          <Card><CardContent className="p-0">
              <EmptyState icon={Target} size="sm" title="لا توجد حسابات إعلانية مرتبطة" description="اربط حسابك الإعلاني بفيسبوك وستظهر حملاتك وأرصدتها هنا." />
            </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {syncFailed && (
              /* rows ARE stored + refresh failed → serve them, but honestly
               * (v19: no silent stale data). */
              <div className="flex items-center gap-2 text-2xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
                <WifiOff className="size-3.5 shrink-0" />
                <span>فشل التحديث من فيسبوك — يتم عرض آخر بيانات محفوظة.</span>
              </div>
            )}
            {accounts.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold">{a.name}</p>
                    {/* v4 §7.26 — backend returns account_status as an INT (FB
                        Marketing API codes); the old a.status === "ACTIVE"
                        string check never matched → badge rendered a raw number */}
                    <span className={`text-2xs px-2 py-0.5 rounded-full ${
                      a.account_status === 1 ? "bg-success/15 text-success" :
                      a.account_status === 2 ? "bg-destructive/15 text-destructive" :
                      "bg-warning/15 text-warning"
                    }`}>{
                      a.account_status === 1 ? "نشطة" :
                      a.account_status === 2 ? "معطّلة" :
                      a.account_status === 3 ? "معلّقة (مبالغ مستحقة)" :
                      a.account_status === 9 ? "غير مفعّلة" :
                      a.account_status === 100 ? "معلّقة" :
                      `حالة ${a.account_status ?? "—"}`
                    }</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {a.currency && <p>العملة: {a.currency}</p>}
                    {a.amount_spent != null && <p>المصروف: {formatNumber(a.amount_spent)}</p>}
                    {a.balance != null && <p>الرصيد: {formatNumber(a.balance)}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
