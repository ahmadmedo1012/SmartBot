"use client"

import { useState, useEffect } from "react"
import { brandedToast } from "@/lib/premium-toast"
import { Check, X, Loader2, Shield, Zap, MessageCircle, Webhook, Copy, AlertTriangle, CheckCircle2 } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch, ApiError } from "@/lib/csrf-client"
import type { FacebookTokenCheck, WebhookCheck } from "@/lib/types"
import Link from "next/link"
import { unwrapApi } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp"

type Status = "idle" | "testing" | "saving" | "connected" | "error"

/* v14-E4 (C-FE1): POST /api/facebook/test answers with the ok() envelope —
 * {connected, fan_count, error?, warning?, scopes:{scopes,missing}}. The old
 * code read `td.connected` off the RAW response body (i.e. off the envelope
 * itself), so it was always undefined: the test button failed forever and
 * "حفظ وتفعيل" never enabled. unwrapApi is the single envelope path (the
 * exact pattern of the healthy mirror dashboard/pages/page.tsx:61-68).
 * `missing` is documented here because /connect surfaces scope warnings
 * (FacebookTestResult in lib/types omits it — kept local to this route). */
type ConnectTestResult = {
  connected: boolean
  fan_count?: number
  error?: string
  warning?: string
  scopes?: { scopes?: string[]; missing?: string[] }
  /** v20: "page" | "user" | "unknown" — a USER token passes the old
   * public-field probes while every data path is dead; surfaced honestly. */
  token_type?: string
  /** v20: the backend exchanged a user token for the PAGE token and
   * persisted it — the stored credentials are repaired by this very click. */
  token_exchanged?: boolean
}

export default function ConnectPage() {
  const [pageId, setPageId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [fanCount, setFanCount] = useState(0)
  const [scopeWarnings, setScopeWarnings] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState("")
  const [existing, setExisting] = useState<{ page_id: string; connected: boolean; page_name?: string; token_check?: FacebookTokenCheck | null; token_ok?: boolean } | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(true)
  const [wh, setWh] = useState<WebhookCheck | null>(null)

  useEffect(() => {
    apiFetch("/api/facebook/settings")
      .then(unwrapApi<{ page_id: string; connected: boolean; page_name?: string; token_check?: FacebookTokenCheck | null; token_ok?: boolean }>)
      .then((d) => {
        setExisting(d)
        if (d.page_id) setPageId(d.page_id)
        setLoadingExisting(false)
      })
      .catch((e: unknown) => {
        /* v14-E4 (D1 م-1): anonymous visitor — every /api/facebook/* call
         * requires auth, so the form can never succeed (PUT would 401 into
         * "خطأ في الاتصال بالخادم"). Send to login with a return path (the
         * same 401→login pattern as the payment dialog) and keep the loader
         * on screen until the navigation lands — no dead-end form flash. */
        if (e instanceof ApiError && e.status === 401) {
          window.location.replace("/login?redirect=/connect")
          return
        }
        setLoadingExisting(false)
      })
    // Real webhook health (plan v3 §4.6) — shows the owner exactly what's
    // missing instead of the old "كل شيء يعمل" while events were rejected.
    apiFetch("/api/webhook/check")
      .then(unwrapApi<WebhookCheck>)
      .then(setWh)
      .catch(() => {})
  }, [])

  const handleTest = async () => {
    if (!pageId.trim() || !accessToken.trim()) {
      brandedToast.error("يرجى إدخال معرف الصفحة ورمز الوصول")
      return
    }
    setStatus("testing")
    setErrorMsg("")
    setScopeWarnings([])
    try {
      /* v14-E4 (C-FE1): unwrapApi on BOTH calls — apiFetch throws ApiError
       * on non-2xx, unwrapApi throws on success:false (fail() is HTTP 200
       * by design), so every backend failure lands in the catch below with
       * the Arabic detail attached. The old dead `if (!r.ok)` branches
       * (unreachable after apiFetch) are retired. */
      await unwrapApi(
        await apiFetch("/api/facebook/settings", {
          method: "PUT",
          body: JSON.stringify({ page_id: pageId.trim(), access_token: accessToken.trim(), subscribe_webhook: false }),
        }),
      )
      const tr = await apiFetch("/api/facebook/test", { method: "POST" })
      const td = await unwrapApi<ConnectTestResult>(tr)
      if (td.token_exchanged) {
        /* v20: the backend detected a stored USER token, exchanged it for
         * the page token AND persisted the repair — tell the user their data
         * paths just came alive instead of a bare fan-count toast. */
        brandedToast.success("تم اكتشاف رمز مستخدم واستبداله برمز صفحة تلقائياً — اتصال البيانات أصبح فعّالاً")
      }
      if (td.connected) {
        setFanCount(td.fan_count ?? 0)
        setStatus("saving")
        if (td.scopes?.missing?.length) setScopeWarnings(td.scopes.missing)
        /* v12-E4.13 → v17-S2 (D9 §2-ب): fan_count now renders through the
           unified «متابعو الصفحة» label + the formatNumber seam (same pattern
           as pages/page.tsx:65) — the toast follows «تم X» with no «!».
           v17-E-F4 (D3 #7): leading ✅ emoji dropped — the branded toast's
           success chip already renders the unified CheckCircle2 glyph. */
        brandedToast.success(`تم الاتصال — متابعو الصفحة: ${formatNumber(td.fan_count ?? 0)}`)
      } else {
        setStatus("idle")
        setErrorMsg(td.error || "فشل الاتصال — تحقق من رمز الوصول والصفحة")
        brandedToast.error(td.error || "فشل الاتصال")
      }
    } catch (e) {
      setStatus("idle")
      /* v14-E4 (D1 م-2): surface the backend's Arabic ApiError detail
       * instead of the generic connection message. */
      brandedToast.error(e instanceof ApiError ? e.message : "خطأ في الاتصال بالخادم")
    }
  }

  const handleSave = async () => {
    setStatus("saving")
    try {
      await unwrapApi(
        await apiFetch("/api/facebook/settings", {
          method: "PUT",
          body: JSON.stringify({ page_id: pageId.trim(), access_token: accessToken.trim(), subscribe_webhook: true }),
        }),
      )
      setStatus("connected")
      /* v17-E-F4 (D3 #7): ✅ emoji dropped — the toast chip carries the
         success glyph (CheckCircle2); the title stays clean Arabic text. */
      brandedToast.success("تم حفظ البيانات وتفعيل الويبهوك")
    } catch (e) {
      setStatus("idle")
      // v14-E4 (D1 م-2): the backend's Arabic detail (e.g. a rejected token)
      // beats the generic message.
      brandedToast.error(e instanceof ApiError ? e.message : "خطأ في الاتصال بالخادم")
    }
  }

  if (loadingExisting) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
        {/* v14-E4 (D4 M-03): skip-link target — rendered in EVERY branch
            (loader, connected, form) so #page-content is never a no-op on
            this route. */}
        <span id="page-content" className="sr-only" tabIndex={-1} />
        <span className="sr-only">جارٍ التحميل…</span>
        <Loader2 className="h-8 w-8 animate-spin text-accent-foreground" />
      </div>
    )
  }

  if (existing?.connected) {
    const secretOk = !!wh?.configured
    const messagesOk = !!wh?.messages_field_subscribed
    const feedOk = !!wh?.feed_field_subscribed
    const allOk = secretOk && messagesOk && feedOk
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        {/* v14-E4 (D4 M-03): skip-link target in the connected branch too
            (was form-only — the skip link jumped nowhere here). */}
        <span id="page-content" className="sr-only" tabIndex={-1} />
        <Card className="w-full max-w-md border-accent-foreground/20 bg-card/80 shadow-2xl shadow-accent-foreground/5 backdrop-blur-2xl">
          <h1 className="sr-only">حالة اتصال صفحة فيسبوك</h1>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
              <Check className="h-8 w-8 text-success" />
            </div>
            <CardTitle className="text-2xl">{existing.page_name || "الصفحة متصلة"}</CardTitle>
            <CardDescription>{allOk ? "الحساب مرتبط والويبهوك يعمل بكامل قدرته" : "الحساب مرتبط — أكمل خطوات الويبهوك لاستقبال الأحداث لحظياً"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <span className="flex justify-center">
              <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-4 py-1.5 text-sm text-success">
                {existing?.page_id ? `معرف الصفحة: ${existing.page_id}` : "متصل"}
              </span>
            </span>

            {/* v20 §5.2 — a stored token that is known-bad must never render as
                a silently-empty dashboard: the verdict from the backend
                self-heal gets a loud banner with a re-connect path. */}
            {existing?.token_ok === false && existing.token_check && (
              <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="leading-relaxed">
                  <p className="font-medium">تعذّر الاتصال بصفحة فيسبوك — أعد الربط</p>
                  <p className="mt-1 text-2xs text-destructive/85">
                    {existing.token_check.detail || "الرمز المخزّن لا يعمل مع بيانات الصفحة."}
                  </p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => setExisting({ ...existing, connected: false })}>
                    إعادة الربط الآن
                  </Button>
                </div>
              </div>
            )}

            {/* Webhook health checklist — honest state (plan v3) */}
            {wh && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground"><Webhook className="size-3.5" /> عنوان الويبهوك</span>
                  <button
                    dir="ltr"
                    aria-label="نسخ عنوان الويبهوك"
                    className="flex items-center gap-1.5 font-mono text-2xs text-foreground hover:text-accent-foreground transition-colors"
                    onClick={() => { navigator.clipboard?.writeText(wh.webhook_url); brandedToast.success("تم نسخ عنوان الويبهوك") }}
                  >
                    {wh.webhook_url} <Copy className="size-3" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground"><Shield className="size-3.5" /> سر التطبيق (توقيع الأحداث)</span>
                  {secretOk ? (
                    <span className="flex items-center gap-1 text-success text-xs"><Check className="size-3.5" /> مُفعّل {wh.secret_source === "db" ? "(من الإعدادات)" : ""}</span>
                  ) : (
                    <Link href="/admin/settings" className="flex items-center gap-1 text-warning text-xs underline underline-offset-2 hover:text-foreground">
                      <AlertTriangle className="size-3.5" /> غير مضبوط — أضفه من إعدادات المنصة
                    </Link>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground"><MessageCircle className="size-3.5" /> استقبال الرسائل</span>
                  <span className={`flex items-center gap-1 text-xs ${messagesOk ? "text-success" : "text-warning"}`}>
                    {messagesOk ? <><Check className="size-3.5" /> مشترك</> : <><AlertTriangle className="size-3.5" /> غير مشترك</>}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground"><Zap className="size-3.5" /> استقبال التعليقات</span>
                  <span className={`flex items-center gap-1 text-xs ${feedOk ? "text-success" : "text-warning"}`}>
                    {feedOk ? <><Check className="size-3.5" /> مشترك</> : <><AlertTriangle className="size-3.5" /> غير مشترك</>}
                  </span>
                </div>
                {(!secretOk || !messagesOk || !feedOk) && (
                  <div className="rounded-md bg-accent-foreground/10 border border-accent-foreground/20 p-2.5 text-2xs leading-relaxed text-foreground/80">
                    سجّل في <span className="font-medium">developers.facebook.com ← تطبيقك ← Webhooks ← Page</span> بالعنوان أعلاه،
                    واشترك في حقلي <span className="font-medium" dir="ltr">feed</span> و<span className="font-medium" dir="ltr">messages</span>.
                    بدون ذلك لا تصل الرسائل/التعليقات لحظياً ولن يرد البوت تلقائياً.
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Link href="/dashboard" className="inline-flex items-center justify-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
                الذهاب للوحة التحكم
              </Link>
              <Button variant="ghost" onClick={() => setExisting({ ...existing, connected: false })}>
                تغيير الصفحة
              </Button>
            </div>
          </CardContent>
        </Card>
        {/* v12-E4.12 (WCAG 3.2.6 Consistent Help): mounted on BOTH connect
            states — the route keeps its help entry point whichever it
            renders (same fixed slot as the landing). */}
        <FloatingWhatsApp />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-accent/20 to-background">
      {/* Visually-hidden page heading — the visible card title is a div (CardTitle),
          so heading navigation had no target on this route (v8-B5) */}
      <h1 className="sr-only">ربط صفحة فيسبوك</h1>
      {/* v9-D3: skip-link target (was missing — the skip link was a no-op on
          this page; same sr-only anchor pattern as the landing). */}
      <span id="page-content" className="sr-only" tabIndex={-1} />
      {/* Floating shapes */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-48 -top-48 h-72 w-72 animate-float rounded-full bg-gradient-to-br from-accent-foreground/15 to-accent-foreground/5 blur-3xl" />
        <div className="absolute -bottom-48 -left-48 h-96 w-96 animate-float-delayed rounded-full bg-gradient-to-br from-accent-foreground/10 to-accent-foreground/5 blur-3xl" style={{ animationDelay: "-2s" }} />
        <div className="absolute left-1/3 top-1/2 h-48 w-48 animate-float rounded-full bg-gradient-to-br from-accent-foreground/15 to-transparent blur-2xl" style={{ animationDelay: "-4s" }} />
      </div>

      {/* Top gradient bar */}
      <div className="fixed top-0 inset-x-0 z-10 h-1 bg-gradient-to-r from-accent-foreground via-accent-foreground/80 to-accent-foreground/60" />

      {/* Header */}
      <div className="fixed left-4 right-4 top-4 z-10 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <DirectionalIcon semanticDirection="back" className="h-4 w-4" />
          العودة للوحة التحكم
        </Link>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-16">
        <div
          className="w-full max-w-lg animate-fade-in"
        >
          <Card className="border-accent-foreground/20 bg-card/85 shadow-2xl shadow-accent-foreground/10 backdrop-blur-2xl backdrop-saturate-150">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-foreground to-accent-foreground/70 text-white shadow-lg shadow-accent-foreground/30">
                <span className="text-3xl font-bold">f</span>
              </div>
              <CardTitle className="text-2xl">ربط صفحة فيسبوك</CardTitle>
              <CardDescription className="text-base">
                أدخل بيانات صفحتك لتفعيل البوت التلقائي
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Info badges */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="group flex flex-col items-center gap-1.5 rounded-xl border border-accent-foreground/20 bg-accent-foreground/5 p-3 text-center transition-all duration-200 hover:border-accent-foreground/40 hover:bg-accent-foreground/10">
                  <MessageCircle className="h-5 w-5 text-accent-foreground transition-transform duration-200 group-hover:scale-110" />
                  <span className="text-2xs font-medium text-foreground/80">ردود تلقائية</span>
                </div>
                <div className="group flex flex-col items-center gap-1.5 rounded-xl border border-accent-foreground/20 bg-accent-foreground/5 p-3 text-center transition-all duration-200 hover:border-accent-foreground/40 hover:bg-accent-foreground/10">
                  <Zap className="h-5 w-5 text-accent-foreground transition-transform duration-200 group-hover:scale-110" />
                  <span className="text-2xs font-medium text-foreground/80">بوت ذكي</span>
                </div>
                <div className="group flex flex-col items-center gap-1.5 rounded-xl border border-accent-foreground/20 bg-accent-foreground/5 p-3 text-center transition-all duration-200 hover:border-accent-foreground/40 hover:bg-accent-foreground/10">
                  <Shield className="h-5 w-5 text-accent-foreground transition-transform duration-200 group-hover:scale-110" />
                  <span className="text-2xs font-medium text-foreground/80">بيانات مشفرة</span>
                </div>
              </div>

              {/* Page ID */}
              <div className="space-y-2">
                <Label htmlFor="page-id" className="text-sm font-medium">معرف الصفحة (Page ID)</Label>
                <div className="rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-accent-foreground/50 focus-within:ring-2 focus-within:ring-accent-foreground/20">
                  <Input
                    id="page-id"
                    dir="ltr"
                    placeholder="123456789012345"
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    className="h-11 border-0 bg-transparent text-end focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>

              {/* Access Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="access-token" className="text-sm font-medium">رمز الوصول (Access Token)</Label>
                </div>
                <div className="rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-accent-foreground/50 focus-within:ring-2 focus-within:ring-accent-foreground/20">
                  <Input
                    id="access-token"
                    dir="ltr"
                    type="password"
                    placeholder="EAAx..."
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="h-11 border-0 bg-transparent font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  رمز الوصول يحتاج الصلاحيات: <code className="text-accent-foreground/80 bg-accent-foreground/10 px-1 rounded">pages_messaging</code>, <code className="text-accent-foreground/80 bg-accent-foreground/10 px-1 rounded">pages_manage_metadata</code>, <code className="text-accent-foreground/80 bg-accent-foreground/10 px-1 rounded">pages_read_engagement</code>
                </p>
              </div>

              {/* Scope warnings */}
              {scopeWarnings.length > 0 && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="text-xs text-warning">
                    تحذير: رمز الوصول ينقصه الصلاحيات التالية:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {scopeWarnings.map((s) => (
                      <li key={s} className="flex items-center gap-1.5 text-xs text-warning">
                        <X className="h-3 w-3" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Error */}
              {errorMsg && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs text-destructive">{errorMsg}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 h-12 rounded-xl"
                  disabled={status === "testing" || status === "saving"}
                  onClick={handleTest}
                >
                  {status === "testing" ? (
                    <><Loader2 className="me-2 h-4 w-4 animate-spin" /> جارٍ الاختبار…</>
                  ) : (
                    "اختبار الاتصال"
                  )}
                </Button>
                <Button
                  className="flex-1 h-12 rounded-xl shadow-lg shadow-accent-foreground/25 hover:shadow-accent-foreground/40"
                  disabled={status !== "saving" && fanCount === 0}
                  onClick={handleSave}
                >
                  {status === "saving" ? (
                    <><Loader2 className="me-2 h-4 w-4 animate-spin" /> جارٍ الحفظ…</>
                  ) : (
                    "حفظ وتفعيل"
                  )}
                </Button>
              </div>

              {/* Fan count */}
              {fanCount > 0 && status !== "connected" && (
                <div role="status" aria-live="polite" className="rounded-lg border border-success/30 bg-success/5 p-3 text-center">
                  {/* v17-E-F4 (D3 #7): ✅ emoji → the app's state verdict icon
                      (CheckCircle2, aria-hidden — the live region announces
                      clean text only). */}
                  <p className="flex items-center justify-center gap-1.5 text-sm text-success font-medium">
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                    تم الاتصال — متابعو الصفحة: {formatNumber(fanCount)}
                  </p>
                </div>
              )}

              {status === "connected" && (
                <div role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-center space-y-3">
                  {/* v17-E-F4 (D3 #7): ✅ emoji → CheckCircle2 (aria-hidden). */}
                  <p className="flex items-center justify-center gap-1.5 text-sm text-success font-medium">
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                    تم التفعيل — البوت جاهز للعمل
                  </p>
                  <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-lg bg-success px-6 text-sm font-medium text-success-foreground hover:bg-success/90 transition-colors">
                    الذهاب للوحة التحكم
                  </Link>
                </div>
              )}

              <p className="text-center text-xs text-muted-foreground">
                SmartBot — جميع البيانات مشفرة ومحمية
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* v12-E4.12 (WCAG 3.2.6 Consistent Help): same one-tap WhatsApp help
          affordance as the landing — same component, same fixed slot.
          (Also on the "already connected" state above.) */}
      <FloatingWhatsApp />
    </div>
  )
}
