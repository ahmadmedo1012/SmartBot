"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Megaphone, AlertCircle, RefreshCw, ToggleLeft, ToggleRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function MarketingPage() {
  const { data: sequences = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["sequences"],
    queryFn: async () => {
      const res = await apiFetch("/api/sequences")
      if (!res.ok) throw new Error(`فشل تحميل التسلسلات (${res.status})`)
      return res.json()
    },
    retry: 1,
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <Megaphone className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">التسويق</h1>
            <p className="text-[11px] text-muted-foreground">أدوات التسويق</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-12" /></Card>)}</div>
        ) : isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل التسلسلات</h2>
            <p className="text-xs text-muted-foreground mb-4">{(error as any)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : (sequences as any[]).length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد تسلسلات تسويقية بعد</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {(sequences as any[]).map((s: any) => (
              <Card key={s.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`size-8 rounded-lg flex items-center justify-center ${s.is_active ? "bg-green-500/10" : "bg-muted"}`}>
                      {s.is_active ? <ToggleRight className="size-4 text-green-500" /> : <ToggleLeft className="size-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground">{s.is_active ? "نشط" : "متوقف"}</p>
                    </div>
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
