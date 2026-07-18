"use client"

import { useState } from "react"
import { Bell } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const TOGGLES = [
  { key: "new_comments", label: "تعليقات جديدة" },
  { key: "new_messages", label: "رسائل جديدة" },
  { key: "new_leads", label: "عملاء متوقعون جدد" },
  { key: "payment_alerts", label: "تنبيهات الدفع" },
  { key: "system_updates", label: "تحديثات النظام" },
  { key: "marketing_reports", label: "تقارير التسويق" },
]

export default function NotificationsPage() {
  const [settings, setSettings] = useState<Record<string, boolean>>(
    Object.fromEntries(TOGGLES.map(t => [t.key, true]))
  )

  const toggle = (key: string) => setSettings(prev => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <Bell className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الإشعارات</h1>
            <p className="text-[11px] text-muted-foreground">إعدادات التنبيهات</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <Card>
          <CardContent className="p-5 space-y-4">
            <h2 className="font-bold text-sm">التنبيهات</h2>
            <p className="text-xs text-muted-foreground">تحكم في التنبيهات التي ترغب في استلامها</p>
            <div className="space-y-1">
              {TOGGLES.map(t => (
                <div key={t.key} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => toggle(t.key)}>
                  <span className="text-sm">{t.label}</span>
                  <div className={`relative w-9 h-5 rounded-full transition-colors ${settings[t.key] ? "bg-orange" : "bg-muted-foreground/30"}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings[t.key] ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
