"use client"

import { useRouter } from "next/navigation"

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
  CheckCheck,
  BellRing,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/PageHeader"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"

interface NotificationItem {
  id: number
  type: string
  title: string
  body: string
  link: string
  read: boolean
  created_at: string | null
}

const TYPE_ICONS: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  payment: { icon: CreditCard, color: "text-yellow-500", label: "دفع" },
  reply: { icon: MessageSquare, color: "text-orange", label: "رد" },
  support: { icon: MessageCircle, color: "text-blue-500", label: "دعم" },
  marketing: { icon: TrendingUp, color: "text-green-500", label: "تسويق" },
  system: { icon: Rocket, color: "text-purple-500", label: "نظام" },
  mention: { icon: UserPlus, color: "text-pink-500", label: "إشارة" },
}

function timeAgo(iso: string | null): string {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "الآن"
  if (m < 60) return `قبل ${m} دقيقة`
  const h = Math.floor(m / 60)
  if (h < 24) return `قبل ${h} ساعة`
  const d = Math.floor(h / 24)
  return `قبل ${d} يوم`
}

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
  const router = useRouter()

  // ── Notification feed (plan §4.2) ──
  const feedQuery = useQuery({
    queryKey: ["notifications-feed"],
    queryFn: async () => {
      const res = await apiFetch("/api/notifications")
      if (!res.ok) throw new Error(`فشل تحميل الإشعارات (${res.status})`)
      return unwrapApi(res)
    },
    retry: 1,
  })

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/notifications/read-all", { method: "POST" })
      if (!res.ok) throw new Error("فشل تعليم الكل كمقروء")
      return unwrapApi(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-feed"] })
      toast.success("تم تعليم جميع الإشعارات كمقروءة")
    },
    onError: (e: Error) => toast.error(e.message || "فشل تعليم الإشعارات"),
  })

  const markOneMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/notifications/${id}/read`, { method: "POST" })
      if (!res.ok) throw new Error("فشل التعليم كمقروء")
      return unwrapApi(res)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications-feed"] }),
  })

  const notifications: NotificationItem[] = feedQuery.data?.data || []
  const unread: number = feedQuery.data?.unread || 0

  // ── Preferences ──
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => {
      const res = await apiFetch("/api/notifications/settings")
      return unwrapApi(res)
    },
    retry: 1,
  })

  const mutation = useMutation({
    mutationFn: async (prefs: Record<string, boolean>) => {
      const res = await apiFetch("/api/notifications/settings", {
        method: "PUT",
        body: JSON.stringify({ preferences: prefs }),
      })
      return unwrapApi(res)
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
        subtitle={`آخر التحديثات${unread > 0 ? ` — ${unread} غير مقروء` : ""}`}
        compact
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Feed */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-sm flex items-center gap-2">
                <BellRing className="size-4 text-orange" />
                الإشعارات الأخيرة
                {unread > 0 && (
                  <span className="text-[10px] font-bold bg-orange text-white rounded-full px-2 py-0.5 min-w-5 text-center">
                    {unread}
                  </span>
                )}
              </h2>
              {unread > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => markAllMutation.mutate()}
                  disabled={markAllMutation.isPending}
                  className="text-xs h-7 gap-1.5"
                >
                  <CheckCheck className="size-3.5" />
                  تعليم الكل كمقروء
                </Button>
              )}
            </div>

            {feedQuery.isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : feedQuery.isError ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  {(feedQuery.error as Error)?.message || "تعذر تحميل الإشعارات"}
                </CardContent>
              </Card>
            ) : notifications.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center space-y-2">
                  <Bell className="size-8 mx-auto text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    لا توجد إشعارات بعد — ستظهر هنا تحديثات الدفع والدعم والتسويق
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {notifications.map((n) => {
                  const meta = TYPE_ICONS[n.type] || TYPE_ICONS.system
                  const Icon = meta.icon
                  return (
                    <Card
                      key={n.id}
                      className={[
                        "transition-all cursor-pointer",
                        n.read ? "opacity-70 border-border/40" : "border-orange/25 bg-orange/[0.02]",
                      ].join(" ")}
                      onClick={() => {
                        if (!n.read) markOneMutation.mutate(n.id)
                        if (n.link) router.push(n.link)  // real navigation (was location.hash — did nothing)
                      }}
                    >
                      <CardContent className="p-4 flex items-start gap-3.5">
                        <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${n.read ? "bg-muted" : "bg-orange/10"}`}>
                          <Icon className={`size-4.5 ${meta.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold truncate">{n.title}</p>
                            {!n.read && <span className="size-2 rounded-full bg-orange shrink-0" />}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(n.created_at)}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>

          {/* Settings */}
          <section>
            <h2 className="font-bold text-sm mb-3">إعدادات التنبيهات</h2>
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : isError ? (
                <Card>
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
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
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${t.label} — ${on ? "مفعّل" : "معطّل"}`}
                    disabled={isPending}
                    onClick={() => !isPending && toggle(t.key)}
                    className="p-4 flex w-full items-center justify-between gap-4 cursor-pointer select-none text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
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
                    <span
                      aria-hidden="true"
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-orange" : "bg-muted-foreground/30"}`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "start-[calc(100%-1.375rem)]" : "start-0.5"}`}
                      />
                    </span>
                  </button>
                </Card>
              )
            })
          )}
            </div>
          </section>
          <p className="text-center text-[11px] text-muted-foreground pt-2">
            تُحفظ إعداداتك تلقائياً وتُطبق على جميع المنصات
          </p>
        </div>
      </div>
    </div>
  )
}
