"use client"

import { Bell } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function NotificationsPage() {
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <Bell className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الإشعارات</h1>
            <p className="text-[11px] text-muted-foreground">إشعارات النظام</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد إشعارات جديدة</CardContent></Card>
      </div>
    </div>
  )
}
