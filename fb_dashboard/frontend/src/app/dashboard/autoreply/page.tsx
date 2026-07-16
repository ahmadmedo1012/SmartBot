"use client"

import { Bot } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function AutoreplyPage() {
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <Bot className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الردود التلقائية</h1>
            <p className="text-[11px] text-muted-foreground">قواعد الرد الذكية</p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">قواعد الردود التلقائية قيد التطوير</CardContent></Card>
      </div>
    </div>
  )
}
