"use client"

import { useRouter } from "next/navigation"

import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { brandedToast } from "@/lib/premium-toast"
import { countPhrase, timeAgo } from "@/lib/format"
import {
  Bell,
  MessageSquare,
  MessageCircle,
  UserPlus,
  CreditCard,
  Rocket,
  TrendingUp,
  CheckCheck,
  BellRing,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
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
  payment: { icon: CreditCard, color: "text-warning", label: "دفع" },
  reply: { icon: MessageSquare, color: "text-accent-foreground", label: "رد" },
  support: { icon: MessageCircle, color: "text-info", label: "دعم" },
  marketing: { icon: TrendingUp, color: "text-success", label: "تسويق" },
  system: { icon: Rocket, color: "text-accent-foreground", label: "نظام" },
  mention: { icon: UserPlus, color: "text-bloom", label: "إشارة" },
}

/* v14-E5 (D2-M1): mention type used the raw Tailwind palette class
 * text-pink-500 (#EC4899 — measured 2.99:1 on the light-mode icon well,
 * below the 3:1 non-text minimum). The semantic brand-pink token --c-bloom
 * keeps the pink family: 3.66-3.85:1 dark / 4.34-4.39:1 light — AA-safe
 * for graphical objects (WCAG 1.4.11) in both modes. */


const TOGGLES = [
  {
    key: "new_comments",
    label: "تعليقات جديدة",
    desc: "عند إضافة تعليق جديد على منشوراتك",
    icon: MessageSquare,
    color: "text-accent-foreground",
  },
  {
    key: "new_messages",
    label: "رسائل جديدة",
    desc: "عند وصول رسالة جديدة للصفحة",
    icon: MessageCircle,
    color: "text-info",
  },
  {
    key: "new_leads",
    label: "عملاء متوقعون جدد",
    desc: "عند تسجيل عميل محتمل جديد",
    icon: UserPlus,
    color: "text-success",
  },
  {
    key: "payment_alerts",
    label: "تنبيهات الدفع",
    desc: "عند تأكيد أو رفض طلب دفع",
    icon: CreditCard,
    color: "text-warning",
  },
  {
    key: "system_updates",
    label: "تحديثات النظام",
    desc: "إشعارات حول تحسينات وصيانة المنصة",
    icon: Rocket,
    color: "text-accent-foreground",
  },
  {
    key: "marketing_reports",
    label: "تقارير التسويق",
    desc: "ملخصات دورية لأداء حملاتك",
    icon: TrendingUp,
    color: "text-accent-foreground",
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
      if (!res.ok) throw new Error("فشل تحديد الكل كمقروء")
      return unwrapApi(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-feed"] })
      brandedToast.success("تم تحديد جميع الإشعارات كمقروءة")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل تحديد الإشعارات كمقروءة"),
  })

  const markOneMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/notifications/${id}/read`, { method: "POST" })
      if (!res.ok) throw new Error("فشل التعليم كمقروء")
      return unwrapApi(res)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications-feed"] }),
    // v9-B11 — clicking a notification whose mark-read fails was completely
    // silent (stays unread forever with no feedback)
    onError: (e: Error) => brandedToast.error(e.message || "فشل تحديد الإشعار كمقروء"),
  })

  // v4 §2.2 — payload already unwrapped; extra .data hid the feed and unread badge
  const notifications: NotificationItem[] = feedQuery.data?.items || []
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
    // v8 C6 — carries the toggled key so ONLY the acting row's switch is
    // disabled/pending while the request is in flight (admin actionId pattern)
    mutationFn: async ({ key, prefs }: { key: string; prefs: Record<string, boolean> }) => {
      const res = await apiFetch("/api/notifications/settings", {
        method: "PUT",
        body: JSON.stringify({ preferences: prefs }),
      })
      return unwrapApi(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-settings"] })
      brandedToast.success("تم حفظ الإعدادات")
    },
    onError: (e: Error) => {
      brandedToast.error(e.message || "فشل حفظ الإعدادات")
    },
  })

  // v4 §2.2 — preferences live inside the unwrapped payload, not under a second .data
  const prefs: Record<string, boolean> = data?.preferences || {}

  const toggle = useCallback(
    (key: string) => {
      const next = { ...prefs, [key]: !prefs[key] }
      mutation.mutate({ key, prefs: next })
    },
    [prefs, mutation]
  )

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        icon={<Bell className="size-4" />}
        title="الإشعارات"
        /* v12-E4.13: unread count through countPhrase (dual/plural) instead
           of the raw «N غير مقروء» interpolation. */
        subtitle={`آخر التحديثات${unread > 0 ? ` — ${countPhrase(unread, "إشعار غير مقروء", "إشعاران غير مقروءان", "إشعارات غير مقروءة")}` : ""}`}
        compact
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Feed */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-sm flex items-center gap-2">
                <BellRing className="size-4 text-accent-foreground" />
                الإشعارات الأخيرة
                {unread > 0 && (
                  <span className="text-3xs font-bold bg-primary text-white rounded-full px-2 py-0.5 min-w-5 text-center">
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
                  تحديد الكل كمقروء
                </Button>
              )}
            </div>

            {feedQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}><CardContent className="p-4 flex items-start gap-3.5">
                    <Skeleton className="size-10 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            ) : feedQuery.isError ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  {(feedQuery.error as Error)?.message || "تعذر تحميل الإشعارات"}
                </CardContent>
              </Card>
            ) : notifications.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={Bell}
                    size="sm"
                    title="لا توجد إشعارات بعد"
                    description="ستظهر هنا تحديثات الدفع والدعم والتسويق فور وصولها."
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2" role="list">
                {notifications.map((n) => {
                  const meta = TYPE_ICONS[n.type] || TYPE_ICONS.system
                  const Icon = meta.icon
                  return (
                    /* B18 — listitem wrapper keeps the interactive Card's role="button" semantics intact */
                    <div role="listitem" key={n.id}>
                      <Card
                        interactive
                        className={[
                          "transition-all",
                          n.read ? "opacity-70 border-border/40" : "border-accent-foreground/25 bg-primary/[0.02]",
                        ].join(" ")}
                        aria-label={n.read ? `إشعار: ${n.title}` : `إشعار غير مقروء: ${n.title}`}
                        onClick={() => {
                          if (!n.read) markOneMutation.mutate(n.id)
                          if (n.link) router.push(n.link)  // real navigation (was location.hash — did nothing)
                        }}
                      >
                        <CardContent className="p-4 flex items-start gap-3.5">
                          <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${n.read ? "bg-muted" : "bg-accent-foreground/10"}`}>
                            <Icon className={`size-4.5 ${meta.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold truncate">{n.title}</p>
                              {!n.read && <span className="size-2 rounded-full bg-primary shrink-0" />}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                            {/* v14-E5 (D4 H-05): /70 timestamp measured 3.2:1 —
                                full muted passes (5.59/6.54:1) */}
                            <p className="text-3xs text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
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
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Card key={i}><CardContent className="p-4 flex items-center gap-3.5">
                      <Skeleton className="size-11 rounded-xl shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-1/3" />
                        <Skeleton className="h-2.5 w-2/5" />
                      </div>
                    </CardContent></Card>
                  ))}
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
              const isPending = mutation.isPending && mutation.variables?.key === t.key
              return (
                <Card
                  key={t.key}
                  className={[
                    "transition-all",
                    on ? "border-accent-foreground/25" : "opacity-70 border-border/40",
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
                        className={`size-11 rounded-xl flex items-center justify-center ${on ? "bg-accent-foreground/10" : "bg-muted"}`}
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
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-primary" : "bg-muted-foreground/30"}`}
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
          <p className="text-center text-2xs text-muted-foreground pt-2">
            تُحفظ إعداداتك تلقائياً وتُطبق على جميع المنصات
          </p>
        </div>
      </div>
    </div>
  )
}
