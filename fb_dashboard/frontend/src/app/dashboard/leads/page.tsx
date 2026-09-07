"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { UserPlus, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { unwrapApi } from "@/lib/api"
import type { CrmCustomer } from "@/lib/types"
import { formatDateOnly } from "@/lib/format"

export default function LeadsPage() {
  const { data: customers = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["crm-customers"],
    queryFn: async () => {
      const res = await apiFetch("/api/crm/customers")
      if (!res.ok) throw new Error(`فشل تحميل العملاء (${res.status})`)
      // API returns a paginated envelope {total, page, per_page, items} —
      // this page maps the LIST. The old code mapped the envelope object
      // itself and crashed with "e.map is not a function" on first render.
      const d = await unwrapApi<{ items: CrmCustomer[]; total: number; page: number; per_page: number }>(res)
      return d?.items ?? []
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
            <p className="text-2xs text-muted-foreground">إدارة العملاء المحتملين</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-14" /></Card>)}</div>
        ) : isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل العملاء</h2>
            <p className="text-xs text-muted-foreground mb-4">{(error as Error)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : customers.length === 0 ? (
          <Card><CardContent className="p-0">
              <EmptyState icon={UserPlus} size="sm" title="لا يوجد عملاء متوقعون بعد" description="عند إضافة أول عميل محتمل ستظهر بياناته هنا مع سجل تواصلك معه." />
            </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {customers.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    {/* v14-E5 (D3-ج): name + notes are live CRM values —
                        dir="auto" isolates Latin/mixed names and free text. */}
                    <p className="text-sm font-bold" dir="auto">{c.name || "بدون اسم"}</p>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {/* v4 §2.3 — backend crm_routes returns notes/first_seen_at/
                        last_contacted_at; email was never in the serializer */}
                    {c.phone && <p>الهاتف: {c.phone}</p>}
                    {c.notes && <p dir="auto">{c.notes}</p>}
                    {c.first_seen_at && (
                      <p className="text-3xs">أول ظهور: {formatDateOnly(c.first_seen_at)}</p>
                    )}
                    {c.last_contacted_at && (
                      <p className="text-3xs">آخر تواصل: {formatDateOnly(c.last_contacted_at)}</p>
                    )}
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
