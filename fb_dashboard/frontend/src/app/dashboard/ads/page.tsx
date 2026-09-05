"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Target, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { unwrapApi } from "@/lib/api"

export default function AdsPage() {
  const { data: accounts = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ads-accounts"],
    queryFn: async () => {
      const res = await apiFetch("/api/ads/accounts")
      if (!res.ok) throw new Error(`فشل تحميل حسابات الإعلانات (${res.status})`)
      return unwrapApi(res)
    },
    retry: 1,
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <Target className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الإعلانات</h1>
            <p className="text-[11px] text-muted-foreground">إدارة الإعلانات</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Plan §4.5: Facebook Marketing API requires app review + business
            verification — show honest "coming soon" until approved. */}
        <Card>
          <CardContent className="p-4 flex items-start gap-3.5 border border-orange/25 bg-orange/[0.03]">
            <div className="size-10 rounded-xl bg-orange/10 flex items-center justify-center shrink-0">
              <Target className="size-5 text-orange" />
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
            <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل الحسابات</h2>
            <p className="text-xs text-muted-foreground mb-4">{(error as any)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : (accounts as any[]).length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد حسابات إعلانية مرتبطة</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {(accounts as any[]).map((a: any) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold">{a.name}</p>
                    {/* v4 §7.26 — backend returns account_status as an INT (FB
                        Marketing API codes); the old a.status === "ACTIVE"
                        string check never matched → badge rendered a raw number */}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${
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
                    {a.amount_spent != null && <p>المصروف: {Number(a.amount_spent).toLocaleString("ar-LY")}</p>}
                    {a.balance != null && <p>الرصيد: {Number(a.balance).toLocaleString("ar-LY")}</p>}
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
