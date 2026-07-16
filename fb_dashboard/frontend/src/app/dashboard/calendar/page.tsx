"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { CalendarDays } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function CalendarPage() {
  const now = new Date()
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["calendar", now.getFullYear(), now.getMonth() + 1],
    queryFn: () => apiFetch(`/api/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`).then(r => r.json()),
    refetchInterval: 60000,
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <CalendarDays className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">تقويم المحتوى</h1>
            <p className="text-[11px] text-muted-foreground">جدول المحتوى الشهري</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-sm mb-3">{now.toLocaleDateString("ar-LY", { year: "numeric", month: "long" })}</h3>
            {isLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
            ) : posts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد منشورات في هذا الشهر</p>
            ) : (
              <div className="space-y-2">
                {posts.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
                    <span className="truncate">{p.message?.slice(0, 50)}...</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {p.scheduled_at ? new Date(p.scheduled_at).toLocaleDateString("ar-LY") : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
