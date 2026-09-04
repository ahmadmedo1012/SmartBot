"use client"

import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Bell,
  MessageSquare,
  MessageCircle,
  UserPlus,
  CreditCard,
  Rocket,
  TrendingUp,
  Loader2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/PageHeader"
import { apiFetch } from "@/lib/csrf-client"

const TOGGLES = [
  {
    key: "new_comments",
    label: "تعليقات جديدة",
    desc: "عند إضافة تعليق جديد على منشوراتك",
    icon: MessageSquare,
    color: "text-orange",
  },
  {
    key: "new_messages",
    label: "رسائل جديدة",
    desc: "عند وصول رسالة جديدة للصفحة",
    icon: MessageCircle,
    color: "text-blue-500",
  },
  {
    key: "new_leads",
    label: "عملاء متوقعون جدد",
    desc: "عند تسجيل عميل محتمل جديد",
    icon: UserPlus,
    color: "text-green-500",
  },
  {
    key: "payment_alerts",
    label: "تنبيهات الدفع",
    desc: "عند تأكيد أو رفض طلب دفع",
    icon: CreditCard,
    color: "text-yellow-500",
  },
  {
    key: "system_updates",
    label: "تحديثات النظام",
    desc: "إشعارات حول تحسينات وصيانة المنصة",
    icon: Rocket,
    color: "text-purple-500",
  },
  {
    key: "marketing_reports",
    label: "تقارير التسويق",
    desc: "ملخصات دورية لأداء حملاتك",
    icon: TrendingUp,
    color: "text-orange",
  },
]

export default function NotificationsPage() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => {
      const res = await apiFetch("/api/notifications/settings")
      return res.json()
    },
    retry: 1,
  })

  const mutation = useMutation({
    mutationFn: async (prefs: Record<string, boolean>) => {
      const res = await apiFetch("/api/notifications/settings", {
        method: "PUT",
        body: JSON.stringify({ preferences: prefs }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-settings"] })
      toast.success("تم حفظ الإعدادات")
    },
    onError: (e: Error) => {
      toast.error(e.message || "فشل حفظ الإعدادات")
    },
  })

  const prefs: Record<string, boolean> = data?.data?.preferences || {}

  const toggle = useCallback(
    (key: string) => {
      const next = { ...prefs, [key]: !prefs[key] }
      mutation.mutate(next)
    },
    [prefs, mutation]
  )

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        icon={<Bell className="size-4" />}
        title="الإشعارات"
        subtitle="إعدادات التنبيهات"
        compact
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                {(error as Error)?.message || "تعذر تحميل الإعدادات"}
              </CardContent>
            </Card>
          ) : (
            TOGGLES.map((t) => {
              const Icon = t.icon
              const on = prefs[t.key] ?? true
              const isPending = mutation.isPending
              return (
                <Card
                  key={t.key}
                  className={[
                    "transition-all",
                    on ? "border-orange/25" : "opacity-70 border-border/40",
                    isPending && "opacity-60 pointer-events-none",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <CardContent
                    className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none"
                    onClick={() => !isPending && toggle(t.key)}
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`size-11 rounded-xl flex items-center justify-center ${on ? "bg-orange/10" : "bg-muted"}`}
                      >
                        <Icon className={`size-5 ${t.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-bold">{t.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                      </div>
                    </div>
                    <div
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-orange" : "bg-muted-foreground/30"}`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "right-0.5" : "right-[22px]"}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
          <p className="text-center text-[11px] text-muted-foreground pt-2">
            تُحفظ إعداداتك تلقائياً وتُطبق على جميع المنصات
          </p>
        </div>
      </div>
    </div>
  )
}
