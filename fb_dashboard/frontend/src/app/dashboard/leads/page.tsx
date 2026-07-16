"use client"

import { UserPlus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function LeadsPage() {
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <UserPlus className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">العملاء المتوقعون</h1>
            <p className="text-[11px] text-muted-foreground">إدارة العملاء المحتملين</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">بيانات العملاء المتوقعين ستظهر هنا</CardContent></Card>
      </div>
    </div>
  )
}
