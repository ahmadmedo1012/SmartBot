"use client"

import { useRouter } from "next/navigation"

import { useState, useCallback, useMemo } from "react"
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
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState, ErrorState } from "@/components/ui/EmptyState"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { formatNumber } from "@/lib/format"

/* v25 (W-07): عقد /api/notifications (routers/notifications.py:97) — حد أقصى
 * le=200 بلا offset/صفحات؛ «تحميل المزيد» يوسّع النافذة بزيادة limit
 * (50 → 100 → … → 200) حتى سقف الخلفية — نفس نهج التعليقات. */
const NOTIFICATIONS_INITIAL = 50
const NOTIFICATIONS_STEP = 50
const NOTIFICATIONS_MAX = 200

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
    label: "إشعارات الدفع",
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
  /* v25 (W-07): حجم نافذة الخلاصة — يبدأ 50 ويتوسع بـ«تحميل المزيد» حتى
   * سقف الخلفية (200). مفتاح الاستعلام يتبع limit فتُجلب النافذة الأوسع. */
  const [feedLimit, setFeedLimit] = useState(NOTIFICATIONS_INITIAL)

  // ── Notification feed (plan §4.2) ──
  const feedQuery = useQuery({
    queryKey: ["notifications-feed", feedLimit],
    queryFn: async () => {
      const res = await apiFetch(`/api/notifications?limit=${feedLimit}`)
      if (!res.ok) throw new Error(`تعذّر تحميل الإشعارات (${res.status})`)
      /* r133 (eslint adoption): explicit unwrapApi type — {items, unread}
         per the v4 §2.2 unwrapped payload. */
      return unwrapApi<{ items: NotificationItem[]; unread: number }>(res)
    },
    /* v25 (W-07): توسيع النافذة يُبقي الصفوف السابقة معروضة (بهتة
     * isFetching) بدل وميض الهيكل الكامل — نمط admin/support v24-C3. */
    placeholderData: (prev) => prev,
    retry: 1,
  })

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/notifications/read-all", { method: "POST" })
      if (!res.ok) throw new Error("تعذّر تحديد الكل كمقروء")
      return unwrapApi(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-feed"] })
      brandedToast.success("تم تحديد جميع الإشعارات كمقروءة")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر تحديد الإشعارات كمقروءة"),
  })

  const markOneMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/notifications/${id}/read`, { method: "POST" })
      if (!res.ok) throw new Error("تعذّر التعليم كمقروء")
      return unwrapApi(res)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications-feed"] }),
    // v9-B11 — clicking a notification whose mark-read fails was completely
    // silent (stays unread forever with no feedback)
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر تحديد الإشعار كمقروء"),
  })

  // v4 §2.2 — payload already unwrapped; extra .data hid the feed and unread badge
  const notifications: NotificationItem[] = feedQuery.data?.items || []
  const unread: number = feedQuery.data?.unread || 0

  // ── Preferences ──
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => {
      const res = await apiFetch("/api/notifications/settings")
      /* r133 (eslint adoption): explicit unwrapApi type — {preferences}
         (v4 §2.2). */
      return unwrapApi<{ preferences: Record<string, boolean> }>(res)
    },
    retry: 1,
  })

  const mutation = useMutation({
    // v8 C6 — carries the toggled key so ONLY the acting row's switch is
    // disabled/pending while the request is in flight (admin actionId pattern)
    mutationFn: async ({ key: _key, prefs }: { key: string; prefs: Record<string, boolean> }) => {
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
      brandedToast.error(e.message || "تعذّر حفظ الإعدادات")
    },
  })

  // v4 §2.2 — preferences live inside the unwrapped payload, not under a second .data
  /* r133 (eslint adoption): memoized — the bare `|| {}` gave every render
     a fresh object identity and churned the useCallback dep below. */
  const prefs: Record<string, boolean> = useMemo(() => data?.preferences || {}, [data])

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
              <h2 className="sb-section-title flex items-center gap-2">
                <BellRing className="size-4 text-accent-foreground" />
                الإشعارات الأخيرة
                {unread > 0 && (
                  /* r131-F8 (A4 P2-3): hand-rolled unread counter → Badge
                     (compact overrides preserve the min-width bubble). */
                  <Badge className="min-w-5 justify-center px-2 py-0.5 text-3xs tabular-nums">{unread}</Badge>
                )}
              </h2>
              {unread > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => markAllMutation.mutate()}
                  disabled={markAllMutation.isPending}
                  /* v25 (W-09): h-11 — هدف لمس 44px صريح (كان h-7؛ النص
                      والأيقونة يبقيان بنفس الكثافة البصرية). */
                  className="text-xs h-11 gap-1.5"
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
            /* v17-E-F3 (D1 §5.3): the feed error was a text-only card with no
             * way back — on a page with no refetchInterval the failure hung
             * until a manual browser reload. Shared ErrorState (same Card +
             * p-0 wrapper the empty state uses on this page) adds the retry
             * CTA wired to feedQuery.refetch(). */
            ) : feedQuery.isError ? (
              <Card>
                <CardContent className="p-0">
                  <ErrorState
                    size="sm"
                    title="تعذّر تحميل الإشعارات"
                    onRetry={() => feedQuery.refetch()}
                  />
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
                          "transition-[transform,box-shadow,border-color,background-color,opacity]",
                          /* v15-E6 (D5-H4): read state is marked by the quiet border
                              + muted icon well ONLY — the old opacity-70 dimmed
                              the whole card and dropped muted-foreground body
                              text to 3.20:1 (dark) / 3.28:1 (light); the full
                              text token measures 5.59/6.54:1. */
                          n.read ? "border-border/40" : "border-accent-foreground/25 bg-primary/[0.02]",
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
                            <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )
                })}
              </div>
            )}

            {/* v25 (W-07): «تحميل المزيد» — الخلاصة كانت محصورة في أحدث 50
                إشعاراً للأبد؛ النافذة تتوسع حتى سقف الخلفية (200) مع عدّاد
                صادق للمعروض. آخر نافذة غير ممتلئة أو بلوغ السقف = لا زر. */}
            {!feedQuery.isLoading && !feedQuery.isError && notifications.length > 0 && (
              <div className="flex flex-col items-center gap-2 pt-1">
                {notifications.length >= feedLimit && feedLimit < NOTIFICATIONS_MAX ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFeedLimit((l) => Math.min(NOTIFICATIONS_MAX, l + NOTIFICATIONS_STEP))}
                    disabled={feedQuery.isFetching && feedQuery.isPlaceholderData}
                  >
                    تحميل المزيد
                  </Button>
                ) : feedLimit >= NOTIFICATIONS_MAX ? (
                  <p className="text-xs text-muted-foreground">
                    تم الوصول للحد الأقصى للعرض ({formatNumber(NOTIFICATIONS_MAX)} إشعار)
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground" role="status">
                  {formatNumber(notifications.length)} إشعار معروض
                </p>
              </div>
            )}
          </section>

          {/* Settings */}
          <section>
            <h2 className="sb-section-title mb-3">إعدادات الإشعارات</h2>
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
              /* v17-E-F3 (D1 §5.3): same treatment as the feed error above —
                 shared ErrorState + refetch instead of hanging text. */
              ) : isError ? (
                <Card>
                  <CardContent className="p-0">
                    <ErrorState
                      size="sm"
                      title="تعذّر تحميل الإعدادات"
                      onRetry={() => refetch()}
                    />
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
                    "transition-[transform,box-shadow,border-color,background-color,opacity]",
                    /* v15-E6 (D5-H4 sibling): same container-opacity pattern on
                        the SAME page — off state is already distinguished by
                        the quiet border + bg-muted icon well + switch position;
                        opacity-70 dropped the muted description to 3.20:1. */
                    on ? "border-accent-foreground/25" : "border-border/40",
                    isPending && "opacity-60 pointer-events-none",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* r131-F8 (A4 P2-7): the hand-rolled aria-hidden span switch →
                      the shared ui/Switch primitive (real role=switch + 44px hit
                      box + RTL thumb math). The row stays a plain container —
                      the Switch itself is the keyboard-accessible control. */}
                  <div className="p-4 flex w-full items-center justify-between gap-4 text-start">
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
                    <Switch
                      checked={on}
                      onCheckedChange={() => toggle(t.key)}
                      disabled={isPending}
                      aria-label={`${t.label} — ${on ? "مفعّل" : "معطّل"}`}
                    />
                  </div>
                </Card>
              )
            })
          )}
            </div>
          </section>
          <p className="text-center text-xs text-muted-foreground pt-2">
            {/* v17-S2 (E-B3 §3-ج honesty): preferences gate only the notifications
                directed to the acting user (push_notification consults
                NotificationPreference by user_id); tenant-wide marketing
                broadcasts land on the shared tenant feed and reach every member —
                the old «تُطبق على جميع المنصات» promised a scope the backend
                never had. */}
            تُحفظ إعداداتك تلقائياً وتتحكم في الإشعارات الموجّهة إلى حسابك الشخصي، بينما تصل إشعارات التسويق العامة إلى جميع أعضاء الفريق
          </p>
        </div>
      </div>
    </div>
  )
}
