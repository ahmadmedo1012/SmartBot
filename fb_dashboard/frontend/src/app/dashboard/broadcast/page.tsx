"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Radio, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function BroadcastPage() {
  const { data: broadcasts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => apiFetch("/api/broadcasts").then(r => r.json()),
    refetchInterval: 30000,
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <Radio className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">البث الجماعي</h1>
            <p className="text-[11px] text-muted-foreground">إرسال رسائل جماعية</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل البثوث</h2>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-16" /></Card>)}</div>
        ) : (broadcasts as any[]).length === 0 ? (
          <div className="text-center py-16"><Radio className="size-12 mx-auto mb-3 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">لا توجد بثوث جماعية</p></div>
        ) : (
          (broadcasts as any[]).map((b: any) => (
            <Card key={b.id}>
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-1">{b.name || `بث #${b.id}`}</p>
                <p className="text-xs text-muted-foreground">{b.status} · {new Date(b.scheduled_at || b.created_at).toLocaleString("ar-LY")}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
