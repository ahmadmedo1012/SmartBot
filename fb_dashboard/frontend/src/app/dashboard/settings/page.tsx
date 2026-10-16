"use client"

import { useCallback, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { brandedToast } from "@/lib/premium-toast"
import { apiFetch, ApiError } from "@/lib/csrf-client"
/* v25 (W-10): استعلام /api/me الخاص بالصفحة (مفتاح ["current-user"] منفصل)
   * استُبدل بالخطاف المشترك useMe() (v24-C3) — مدخل واحد في الكاش يخدم
   * AuthGuard وCTA الاشتراك وهذه الصفحة؛ طلبات مكررة أقل واتساق
   * انتهاء الصلاحية. نفس الواجهة البصرية — بيانات {user} نفسها. */
import { useMe } from "@/hooks/useMe"
import {
  Settings, User, Shield, Mail, Lock, KeyRound, Loader2, Bell, MessageSquare,
  MessageCircle, UserPlus, CreditCard, Rocket, TrendingUp, RadioTower, Languages,
  RefreshCw, AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ui/PageHeader"
import { LoadingState, ErrorState } from "@/components/ui/EmptyState"
import { unwrapApi } from "@/lib/api"
import type { WebhookCheck } from "@/lib/types"
import Link from "next/link"

/* P18-W4-b — the settings sections ride REAL backend contracts only:
 *   - GET/PUT /api/notifications/settings (alerts_routes.py:88-131) — the
 *     6-key preference schema (DEFAULT_NOTIF_PREFS), the SAME query key
 *     ["notification-settings"] as the notifications page so both surfaces
 *     share one cache entry and stay in sync.
 *   - GET /api/webhook/check (webhooks.py:57-120) — read-only webhook
 *     health (url/secret/subscribed fields); the repair actions live on
 *     /connect + /dashboard/pages (linked, not duplicated).
 *   - اللغة والاتجاه — display-only (the product is Arabic RTL-first by
 *     design; no language endpoint exists — documented, not faked).
 * Documented GAPS (no endpoints — deliberately NOT built here):
 *   - session/token management (auth.py has no session list/revoke route;
 *     token_ver bumps exist server-side only)
 *   - self profile editing (PUT /api/users/{id} is admin role/password
 *     management, not a self-service profile endpoint). */

/* The 6-key preference schema — alerts_routes.DEFAULT_NOTIF_PREFS keys
 * (same labels as the notifications page's toggles). */
const NOTIF_TOGGLES = [
  { key: "new_comments", label: "تعليقات جديدة", desc: "عند إضافة تعليق جديد على منشوراتك", icon: MessageSquare, color: "text-accent-foreground" },
  { key: "new_messages", label: "رسائل جديدة", desc: "عند وصول رسالة جديدة للصفحة", icon: MessageCircle, color: "text-info-ink" },
  { key: "new_leads", label: "عملاء متوقعون جدد", desc: "عند تسجيل عميل محتمل جديد", icon: UserPlus, color: "text-success-ink" },
  { key: "payment_alerts", label: "إشعارات الدفع", desc: "عند تأكيد أو رفض طلب دفع", icon: CreditCard, color: "text-warning-ink" },
  { key: "system_updates", label: "تحديثات النظام", desc: "إشعارات حول تحسينات وصيانة المنصة", icon: Rocket, color: "text-accent-foreground" },
  { key: "marketing_reports", label: "تقارير التسويق", desc: "ملخصات دورية لأداء حملاتك", icon: TrendingUp, color: "text-accent-foreground" },
] as const

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: raw, isLoading, isError, refetch } = useMe()
  // v13-L3: /api/me answers ok({user}) (auth.py, v12-E2.10) — unwrapApi
  // returns {user}; the optional chain only covers the react-query
  // loading window. Same typed pattern as admin/telegram/page.tsx:57.
  const user = raw?.user

  // Self-service password change (plan v3 §7c — the الأمان card was a
  // decorative shell; the endpoint existed but had no UI).
  const [showPw, setShowPw] = useState(false)
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [pwBusy, setPwBusy] = useState(false)

  const changePassword = async () => {
    if (newPw.length < 8) {
      brandedToast.error("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل")
      return
    }
    setPwBusy(true)
    try {
      /* v15-E5 (D4-H5): apiFetch THROWS ApiError on any non-2xx — the old
       * `if (r.ok) … else …` branch below it was unreachable dead code, and
       * the generic catch replaced the backend's Arabic detail («كلمة
       * المرور الحالية غير صحيحة» — auth.py:364) with the misleading
       * «خطأ في الاتصال» network message. The detail now surfaces verbatim.
       * (The endpoint is in apiFetch's local-401 skip-list: its 401 means a
       * wrong CURRENT password, not an expired session — no bogus redirect.) */
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      })
      brandedToast.success("تم تغيير كلمة المرور")
      setCurrentPw("")
      setNewPw("")
      setShowPw(false)
    } catch (e) {
      brandedToast.error(e instanceof ApiError ? e.message : "تعذّر تغيير كلمة المرور")
    }
    setPwBusy(false)
  }

  // ── P18-W4-b: notification preferences (GET/PUT /api/notifications/settings) ──
  // Same query key as the notifications page — one cache entry, two surfaces.
  const {
    data: prefData, isLoading: prefLoading, isError: prefIsError, refetch: refetchPrefs,
  } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: async () => {
      const res = await apiFetch("/api/notifications/settings")
      if (!res.ok) throw new Error(`تعذّر تحميل تفضيلات الإشعارات (${res.status})`)
      return unwrapApi<{ preferences: Record<string, boolean> }>(res)
    },
    retry: 1,
  })
  /* r133 (eslint adoption) twin: memoized — the bare `|| {}` gave every
   * render a fresh object identity and churned the useCallback dep below. */
  const prefs = useMemo(() => prefData?.preferences || {}, [prefData])

  const prefMut = useMutation({
    /* v8 C6 twin: carries the toggled key so ONLY the acting row's switch is
     * pending while the request is in flight (notifications-page pattern). */
    mutationFn: async ({ key: _key, prefs: next }: { key: string; prefs: Record<string, boolean> }) => {
      const res = await apiFetch("/api/notifications/settings", {
        method: "PUT",
        body: JSON.stringify({ preferences: next }),
      })
      if (!res.ok) throw new Error("تعذّر حفظ التفضيلات")
      return unwrapApi(res)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-settings"] })
      brandedToast.success("تم حفظ تفضيلات الإشعارات")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر حفظ التفضيلات"),
  })

  const togglePref = useCallback(
    (key: string) => {
      prefMut.mutate({ key, prefs: { ...prefs, [key]: !prefs[key] } })
    },
    [prefs, prefMut],
  )

  // ── P18-W4-b: webhook health (GET /api/webhook/check — read-only display) ──
  const {
    data: wh, isLoading: whLoading, isError: whIsError, refetch: refetchWh,
  } = useQuery({
    queryKey: ["webhook-check"],
    queryFn: async () => {
      const res = await apiFetch("/api/webhook/check")
      if (!res.ok) throw new Error(`تعذّر تحميل حالة الويبهوك (${res.status})`)
      return unwrapApi<WebhookCheck>(res)
    },
    retry: 1,
  })

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        icon={<Settings className="size-4" />}
        title="الإعدادات"
        subtitle="إعدادات الحساب"
        compact
        /* phase6 r154 — فاصل الأثر تحت الشريط (توقيع غرفة الآلة؛ الأثر
            الساكن — نموذج حساب ليس دفق أتمتة حيًا). */
        trace="static"
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-3xl mx-auto w-full">
        {isLoading ? (
          <LoadingState count={2} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : user ? (
          <>
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="size-4 text-accent-foreground" /> معلومات الحساب
                </CardTitle>
                <CardDescription>البيانات الأساسية لحسابك في SmartBot</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                  <div className="size-9 rounded-lg bg-accent-foreground/10 text-accent-foreground flex items-center justify-center shrink-0">
                    <User className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">اسم المستخدم</p>
                    {/* phase6 r154 — هوية الآلة (اسم المستخدم) تُعرض على
                        السجل المونو — قيمة لاتينية تُقرأ رقمَ دارة. */}
                    <p className="font-medium truncate font-mono" dir="ltr">{user.username}</p>
                  </div>
                </div>
                {user.email && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                    <div className="size-9 rounded-lg bg-info-soft text-info-ink flex items-center justify-center shrink-0">
                      <Mail className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">البريد الإلكتروني</p>
                      <p className="font-medium truncate" dir="ltr">{user.email}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                  <div className="size-9 rounded-lg bg-success-soft text-success-ink flex items-center justify-center shrink-0">
                    <Shield className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">الصلاحية</p>
                    <p className="font-medium capitalize">{user.role === "admin" ? "مدير" : user.role === "owner" ? "مالك" : "مستخدم"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="size-4 text-accent-foreground" /> الأمان
                </CardTitle>
                <CardDescription>إعدادات المصادقة والحماية</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/50">
                  <div className="size-9 rounded-lg bg-accent-foreground/10 text-accent-foreground flex items-center justify-center shrink-0">
                    <Lock className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">كلمة المرور والتشفير</p>
                    <p className="text-xs text-muted-foreground">كلمات المرور مُعمّاة بـ Argon2id وجلساتك محمية بنطاق واحد</p>
                  </div>
                  {/* v8-B13: aria-label on a bare span is ignored by AT — role="status"
                      exposes the state (the dot itself is decorative) */}
                  <span role="status" className="size-2 rounded-full bg-success shrink-0" aria-label="مفعّل" />
                </div>

                {showPw ? (
                  <div
                    className="space-y-3 mt-3"
                    /* v10-B7 (G2-05/06): Escape closes the form (same as «إلغاء»);
                       autoFocus on the first field moves focus INTO the form on
                       open (was falling on BODY) and makes the Escape key land */
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && !pwBusy) {
                        e.preventDefault();
                        setShowPw(false)
                      }
                    }}
                  >
                    <Input
                      id="current-password"
                      type="password"
                      label="كلمة المرور الحالية"
                      autoComplete="current-password"
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      traceField
                      autoFocus
                    />
                    <Input
                      id="new-password"
                      type="password"
                      label="كلمة المرور الجديدة"
                      hint="8 أحرف على الأقل — مختلفة عن الحالية"
                      autoComplete="new-password"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      traceField
                    />
                    <div className="flex gap-2">
                      <Button onClick={changePassword} disabled={pwBusy || !currentPw || newPw.length < 8}>
                        {pwBusy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                        {pwBusy ? "جارٍ التغيير…" : "تغيير كلمة المرور"}
                      </Button>
                      <Button variant="ghost" onClick={() => setShowPw(false)} disabled={pwBusy}>
                        إلغاء
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowPw(true)}>
                    <KeyRound className="size-3.5" /> تغيير كلمة المرور
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* P18-W4-b — تفضيلات الإشعارات (real: GET/PUT
                /api/notifications/settings). نفس مفتاح الكاش
                ["notification-settings"] كصفحة الإشعارات — تبديل هنا
                ينعكس هناك والعكس. */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="size-4 text-accent-foreground" /> تفضيلات الإشعارات
                </CardTitle>
                <CardDescription>ما يصلك من تنبيهات داخل حسابك الشخصي</CardDescription>
              </CardHeader>
              <CardContent>
                {prefLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                        <Skeleton className="size-10 rounded-xl shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3.5 w-1/3" />
                          <Skeleton className="h-2.5 w-2/5" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : prefIsError ? (
                  <ErrorState size="sm" title="تعذّر تحميل التفضيلات" onRetry={() => refetchPrefs()} />
                ) : (
                  <div className="space-y-2">
                    {NOTIF_TOGGLES.map((t) => {
                      const Icon = t.icon
                      const on = prefs[t.key] ?? true
                      const isPending = prefMut.isPending && prefMut.variables?.key === t.key
                      return (
                        <div key={t.key} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/40">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${on ? "bg-accent-foreground/10" : "bg-muted"}`}
                            >
                              <Icon className={`size-4.5 ${t.color}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{t.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                            </div>
                          </div>
                          <Switch
                            checked={on}
                            onCheckedChange={() => togglePref(t.key)}
                            disabled={isPending}
                            aria-label={`${t.label} — ${on ? "مفعّل" : "معطّل"}`}
                          />
                        </div>
                      )
                    })}
                    <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
                      {/* v17-S2 (E-B3 §3-ج) honesty twin: the preferences gate
                          the notifications directed to YOUR account; tenant-wide
                          marketing broadcasts reach every member. */}
                      تتحكم هذه التفضيلات في الإشعارات الموجّهة إلى حسابك الشخصي، بينما تصل إشعارات التسويق العامة إلى جميع أعضاء الفريق.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* P18-W4-b — حالة الويبهوك (real: GET /api/webhook/check).
                عرض للقراءة فقط: عنوان الرد والحقول المشتركة وحالة الاشتراك؛
                إجراءات الإصلاح تبقى في صفحتي الربط/الصفحة (روابط لا ازدواج). */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <RadioTower className="size-4 text-accent-foreground" /> حالة الويبهوك
                </CardTitle>
                <CardDescription>قناة الأحداث اللحظية من فيسبوك (الرسائل والتعليقات)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {whLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                ) : whIsError ? (
                  <ErrorState size="sm" title="تعذّر تحميل حالة الويبهوك" onRetry={() => refetchWh()} />
                ) : wh ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-medium">اشتراك الأحداث</p>
                        {/* phase6 r154 — عقدة اللايم الحية: الويبهوك السليم
                            يستمع الآن (توأم صفحة الصفحات). */}
                        {wh.subscribed ? (
                          <span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />
                        ) : null}
                      </div>
                      {wh.subscribed ? (
                        <Badge variant="success">مشترك</Badge>
                      ) : (
                        <Badge variant="warning">غير مشترك</Badge>
                      )}
                    </div>
                    {wh.webhook_url && (
                      <div className="p-2.5 rounded-lg bg-muted/40">
                        <p className="text-xs text-muted-foreground">عنوان الرد (Callback URL)</p>
                        {/* phase6 r154 — عنوان الويبهوك (قيمة آلة لاتينية)
                            يركب السجل المونو dir=ltr — مرآة /connect. */}
                        <p className="font-medium truncate font-mono text-xs" dir="ltr">{wh.webhook_url}</p>
                      </div>
                    )}
                    {/* v4 §7.26 twin: the check endpoint returns
                        messages_field_subscribed/feed_field_subscribed as
                        explicit booleans — the two fields the automation
                        depends on. */}
                    {(wh.messages_field_subscribed != null || wh.feed_field_subscribed != null) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">الحقول:</span>
                        {wh.messages_field_subscribed ? (
                          <Badge variant="success">الرسائل</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-(--c-grey-bg) text-(--c-grey-ink)">الرسائل (غير مشترك)</Badge>
                        )}
                        {wh.feed_field_subscribed ? (
                          <Badge variant="success">التعليقات</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-(--c-grey-bg) text-(--c-grey-ink)">التعليقات (غير مشترك)</Badge>
                        )}
                        {wh.configured === false && (
                          <Badge variant="warning">مفتاح التحقق غير مُهيأ</Badge>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      {/* r132 (A8 F-SB-4) twin: SPA navigation — the app's CTA
                          contract (pricing/admin/analytics), not full-reload
                          anchors. */}
                      <Link
                        className="text-accent-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
                        href="/connect"
                      >
                        إدارة الربط وإعادة الاشتراك
                      </Link>
                      <Link
                        className="text-accent-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
                        href="/dashboard/pages"
                      >
                        إعدادات الصفحة
                      </Link>
                    </div>
                  </>
                ) : (
                  /* unwrapApi returned an empty payload (unknown state) —
                     honest placeholder, not a fabricated verdict. */
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="size-3.5" aria-hidden="true" />
                    حالة الويبهوك غير معروفة حالياً.
                    <Button size="sm" variant="outline" onClick={() => refetchWh()}>
                      <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* P18-W4-b — اللغة والاتجاه: عرض صادق فقط. لا نقطة نهاية
                للغة في الخلفية (المنتج عربي RTL بالتصميم) — لا مفاتيح
                وهمية ولا محدد لغة يعد بما لا يملكه الخادم. */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Languages className="size-4 text-accent-foreground" /> اللغة والاتجاه
                </CardTitle>
                <CardDescription>لغة الواجهة واتجاه العرض</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                  <div className="size-9 rounded-lg bg-accent-foreground/10 text-accent-foreground flex items-center justify-center shrink-0">
                    <Languages className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">لغة الواجهة</p>
                    <p className="font-medium">العربية</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40">
                  <div className="size-9 rounded-lg bg-info-soft text-info-ink flex items-center justify-center shrink-0">
                    <Settings className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">اتجاه العرض</p>
                    <p className="font-medium">من اليمين إلى اليسار (RTL)</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  واجهة SmartBot عربية أولاً باتجاه من اليمين إلى اليسار — الوضع النهاري/الليلي متاح من مبدّل الثيم في الشريط الجانبي.
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  )
}
