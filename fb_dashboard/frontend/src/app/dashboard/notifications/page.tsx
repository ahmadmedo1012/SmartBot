"use client"

import { useState } from "react"
import { Bell, MessageSquare, MessageCircle, UserPlus, CreditCard, Rocket, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const TOGGLES = [
  { key: "new_comments", label: "تعليقات جديدة", desc: "عند إضافة تعليق جديد على منشوراتك", icon: MessageSquare, color: "text-orange" },
  { key: "new_messages", label: "رسائل جديدة", desc: "عند وصول رسالة جديدة للصفحة", icon: MessageCircle, color: "text-info" },
  { key: "new_leads", label: "عملاء متوقعون جدد", desc: "عند تسجيل عميل محتمل جديد", icon: UserPlus, color: "text-success" },
  { key: "payment_alerts", label: "تنبيهات الدفع", desc: "عند تأكيد أو رفض طلب دفع", icon: CreditCard, color: "text-warning" },
  { key: "system_updates", label: "تحديثات النظام", desc: "إشعارات حول تحسينات وصيانة المنصة", icon: Rocket, color: "text-primary" },
  { key: "marketing_reports", label: "تقارير التسويق", desc: "ملخصات دورية لأداء حملاتك", icon: TrendingUp, color: "text-orange" },
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
        <div className="max-w-3xl mx-auto space-y-3">
          {TOGGLES.map(t => {
            const Icon = t.icon
            const on = settings[t.key]
            return (
              <Card key={t.key} className={on ? "border-orange/25" : "opacity-70 border-border/40"}>
                <CardContent
                  className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none"
                  onClick={() => toggle(t.key)}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`size-11 rounded-xl flex items-center justify-center ${on ? "bg-orange/10" : "bg-muted"}`}>
                      <Icon className={`size-5 ${t.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                    </div>
                  </div>
                  <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-orange" : "bg-muted-foreground/30"}`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "right-0.5" : "right-[22px]"}`} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
          <p className="text-center text-[11px] text-muted-foreground pt-2">
            تُحفظ إعداداتك تلقائياً وتُطبق على جميع المنصات
          </p>
        </div>
      </div>
    </div>
  )
}
