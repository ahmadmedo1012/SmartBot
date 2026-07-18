"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { UserPlus, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function LeadsPage() {
  const { data: customers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["crm-customers"],
    queryFn: async () => {
      const res = await apiFetch("/api/crm/customers")
      if (!res.ok) throw new Error(`فشل تحميل العملاء (${res.status})`)
      return res.json()
    },
    retry: 1,
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <UserPlus className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">العملاء المتوقعون</h1>
            <p className="text-[11px] text-muted-foreground">إدارة العملاء المحتملين</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-14" /></Card>)}</div>
        ) : isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل العملاء</h2>
            <p className="text-xs text-muted-foreground mb-4">{(error as any)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : (customers as any[]).length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا يوجد عملاء متوقعون بعد</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {(customers as any[]).map((c: any) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold">{c.name || "بدون اسم"}</p>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {c.email && <p>البريد: {c.email}</p>}
                    {c.phone && <p>الهاتف: {c.phone}</p>}
                    {c.note && <p>{c.note}</p>}
                    {c.created_at && <p className="text-[10px]">{new Date(c.created_at).toLocaleDateString("ar-LY")}</p>}
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
