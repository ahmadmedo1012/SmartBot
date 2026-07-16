"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { FileText , AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function PagesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["facebook-settings"],
    queryFn: () => apiFetch("/api/facebook/settings").then(r => r.json()),
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <FileText className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الصفحات</h1>
            <p className="text-[11px] text-muted-foreground">إدارة صفحات فيسبوك</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <Card><CardContent className="p-4 animate-pulse h-20" /></Card>
        ) : data?.page_id ? (
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="size-10 rounded-lg bg-blue-600/10 flex items-center justify-center">
                <span className="size-5 text-blue-600 flex items-center justify-center font-bold text-sm">f</span>
              </div>
              <div>
                <p className="font-bold text-sm">صفحة متصلة</p>
                <p className="text-xs text-muted-foreground">المعرف: {data.page_id}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لم يتم ربط أي صفحة بعد</CardContent></Card>
        )}
      </div>
    </div>
  )
}
