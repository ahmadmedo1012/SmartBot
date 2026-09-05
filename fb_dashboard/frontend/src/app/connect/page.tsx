"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Check, X, Loader2, ArrowLeft, Shield, Zap, MessageCircle, Webhook, Copy, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/csrf-client"
import Link from "next/link"
import { unwrapApi } from "@/lib/api"

type Status = "idle" | "testing" | "saving" | "connected" | "error"

export default function ConnectPage() {
  const [pageId, setPageId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [fanCount, setFanCount] = useState(0)
  const [scopeWarnings, setScopeWarnings] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState("")
  const [existing, setExisting] = useState<{ page_id: string; connected: boolean; page_name?: string } | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(true)
  const [wh, setWh] = useState<any>(null)

  useEffect(() => {
    apiFetch("/api/facebook/settings")
      .then(unwrapApi)
      .then((d) => {
        setExisting(d)
        if (d.page_id) setPageId(d.page_id)
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false))
    // Real webhook health (plan v3 §4.6) — shows the owner exactly what's
    // missing instead of the old "كل شيء يعمل" while events were rejected.
    apiFetch("/api/webhook/check")
      .then(unwrapApi)
      .then(setWh)
      .catch(() => {})
  }, [])

  const handleTest = async () => {
    if (!pageId.trim() || !accessToken.trim()) {
      toast.error("يرجى إدخال معرف الصفحة ورمز الوصول")
      return
    }
    setStatus("testing")
    setErrorMsg("")
    setScopeWarnings([])
    try {
      const r = await apiFetch("/api/facebook/settings", {
        method: "PUT",
        body: JSON.stringify({ page_id: pageId.trim(), access_token: accessToken.trim(), subscribe_webhook: false }),
      })
      if (!r.ok) { toast.error("فشل حفظ البيانات المؤقت"); setStatus("idle"); return }
      const tr = await apiFetch("/api/facebook/test", { method: "POST" })
      const td = await tr.json()
      if (td.connected) {
        setFanCount(td.fan_count)
        setStatus("saving")
        if (td.scopes?.missing?.length) setScopeWarnings(td.scopes.missing)
        toast.success(`✅ الاتصال ناجح! عدد المعجبين: ${td.fan_count}`)
      } else {
        setStatus("idle")
        setErrorMsg(td.error || "فشل الاتصال — تحقق من التوكن والصفحة")
        toast.error(td.error || "فشل الاتصال")
      }
    } catch {
      setStatus("idle")
      toast.error("خطأ في الاتصال بالخادم")
    }
  }

  const handleSave = async () => {
    setStatus("saving")
    try {
      const r = await apiFetch("/api/facebook/settings", {
        method: "PUT",
        body: JSON.stringify({ page_id: pageId.trim(), access_token: accessToken.trim(), subscribe_webhook: true }),
      })
      if (!r.ok) { toast.error("فشل الحفظ"); setStatus("idle"); return }
      await r.json()
      setStatus("connected")
      toast.success("✅ تم حفظ البيانات وتفعيل webhook")
    } catch {
      setStatus("idle")
      toast.error("خطأ في الاتصال بالخادم")
    }
  }

  if (loadingExisting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
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
        <Card className="w-full max-w-md border-accent-foreground/20 bg-card/80 shadow-2xl shadow-accent-foreground/5 backdrop-blur-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
              <Check className="h-8 w-8 text-success" />
            </div>
            <CardTitle className="text-2xl">{existing.page_name || "الصفحة متصلة"}</CardTitle>
            <CardDescription>{allOk ? "الحساب مرتبط والويبهوك يعمل بكامل قدرته" : "الحساب مرتبط — أكمل خطوات الويبهوك لاستقبال الأحداث لحظيًا"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <span className="flex justify-center">
              <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-4 py-1.5 text-sm text-success">
                {existing?.page_id ? `معرف الصفحة: ${existing.page_id}` : "متصل"}
              </span>
            </span>

            {/* Webhook health checklist — honest state (plan v3) */}
            {wh && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground"><Webhook className="size-3.5" /> عنوان الويبهوك</span>
                  <button
                    className="flex items-center gap-1.5 font-mono text-[11px] text-foreground hover:text-accent-foreground transition-colors"
                    onClick={() => { navigator.clipboard?.writeText(wh.webhook_url); toast.success("تم نسخ عنوان الويبهوك") }}
                  >
                    {wh.webhook_url} <Copy className="size-3" />
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
                  <div className="rounded-md bg-accent-foreground/10 border border-accent-foreground/20 p-2.5 text-[11px] leading-relaxed text-foreground/80">
                    سجّل في <span className="font-medium">developers.facebook.com → تطبيقك → Webhooks → Page</span> بالعنوان أعلاه،
                    واشترك في حقلي <span className="font-medium" dir="ltr">feed</span> و<span className="font-medium" dir="ltr">messages</span>.
                    بدون ذلك لا تصل الرسائل/التعليقات لحظيًا ولن يرد البوت تلقائيًا.
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
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-accent/20 to-background dark:from-zinc-900 dark:via-zinc-900 dark:to-background">
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
          <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
          العودة للوحة التحكم
        </Link>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-16">
        <motion.div
          className="w-full max-w-lg"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.2, 1] }}
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
                  <span className="text-[11px] font-medium text-foreground/80">ردود تلقائية</span>
                </div>
                <div className="group flex flex-col items-center gap-1.5 rounded-xl border border-accent-foreground/20 bg-accent-foreground/5 p-3 text-center transition-all duration-200 hover:border-accent-foreground/40 hover:bg-accent-foreground/10">
                  <Zap className="h-5 w-5 text-accent-foreground transition-transform duration-200 group-hover:scale-110" />
                  <span className="text-[11px] font-medium text-foreground/80">بوت ذكي</span>
                </div>
                <div className="group flex flex-col items-center gap-1.5 rounded-xl border border-accent-foreground/20 bg-accent-foreground/5 p-3 text-center transition-all duration-200 hover:border-accent-foreground/40 hover:bg-accent-foreground/10">
                  <Shield className="h-5 w-5 text-accent-foreground transition-transform duration-200 group-hover:scale-110" />
                  <span className="text-[11px] font-medium text-foreground/80">بيانات مشفرة</span>
                </div>
              </div>

              {/* Page ID */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">معرف الصفحة (Page ID)</Label>
                <div className="rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-accent-foreground/50 focus-within:ring-2 focus-within:ring-accent-foreground/20">
                  <Input
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
                  <Label className="text-sm font-medium">رمز الوصول (Access Token)</Label>
                </div>
                <div className="rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-accent-foreground/50 focus-within:ring-2 focus-within:ring-accent-foreground/20">
                  <Input
                    dir="ltr"
                    type="password"
                    placeholder="EAAx..."
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="h-11 border-0 bg-transparent font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  التوكن يحتاج الصلاحيات: <code className="text-accent-foreground/80 bg-accent-foreground/10 px-1 rounded">pages_messaging</code>, <code className="text-accent-foreground/80 bg-accent-foreground/10 px-1 rounded">pages_manage_metadata</code>, <code className="text-accent-foreground/80 bg-accent-foreground/10 px-1 rounded">pages_read_engagement</code>
                </p>
              </div>

              {/* Scope warnings */}
              {scopeWarnings.length > 0 && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    تحذير: التوكن ينقصه الصلاحيات التالية:
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {scopeWarnings.map((s) => (
                      <li key={s} className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
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
                    <><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري الاختبار...</>
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
                    <><Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري الحفظ...</>
                  ) : (
                    "حفظ وتفعيل"
                  )}
                </Button>
              </div>

              {/* Fan count */}
              {fanCount > 0 && status !== "connected" && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-center">
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                    ✅ اتصال ناجح — {fanCount.toLocaleString("ar-LY")} متابع
                  </p>
                </div>
              )}

              {status === "connected" && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-center space-y-3">
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                    ✅ تم التفعيل بنجاح — البوت جاهز للعمل
                  </p>
                  <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-lg bg-green-600 px-6 text-sm font-medium text-white hover:bg-green-700 transition-colors">
                    الذهاب للوحة التحكم
                  </Link>
                </div>
              )}

              <p className="text-center text-xs text-muted-foreground">
                SmartBot — جميع البيانات مشفرة ومحمية
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
