"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Check, X, Loader2, ArrowLeft, Shield, Zap, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/csrf-client"
import Link from "next/link"

type Status = "idle" | "testing" | "saving" | "connected" | "error"

export default function ConnectPage() {
  const [pageId, setPageId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [fanCount, setFanCount] = useState(0)
  const [scopeWarnings, setScopeWarnings] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState("")
  const [existing, setExisting] = useState<{ page_id: string; connected: boolean } | null>(null)
  const [loadingExisting, setLoadingExisting] = useState(true)

  useEffect(() => {
    apiFetch("/api/facebook/settings")
      .then((r) => r.json())
      .then((d) => {
        setExisting(d)
        if (d.page_id) setPageId(d.page_id)
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false))
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
        <Loader2 className="h-8 w-8 animate-spin text-orange" />
      </div>
    )
  }

  if (existing?.connected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md border-orange/20 bg-card/80 shadow-2xl shadow-orange/5 backdrop-blur-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl">الصفحة متصلة</CardTitle>
            <CardDescription>حسابك مرتبط بصفحة فيسبوك وكل شيء يعمل</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <span className="inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-4 py-1.5 text-sm text-green-600 dark:text-green-400">
              {existing?.page_id ? `معرف الصفحة: ${existing.page_id}` : "متصل"}
            </span>
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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-background via-orange-muted/20 to-background dark:from-zinc-900 dark:via-zinc-900 dark:to-background">
      {/* Floating shapes */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-48 -top-48 h-72 w-72 animate-float rounded-full bg-gradient-to-br from-orange/15 to-orange/5 blur-3xl" />
        <div className="absolute -bottom-48 -left-48 h-96 w-96 animate-float-delayed rounded-full bg-gradient-to-br from-orange/10 to-orange/5 blur-3xl" style={{ animationDelay: "-2s" }} />
        <div className="absolute left-1/3 top-1/2 h-48 w-48 animate-float rounded-full bg-gradient-to-br from-orange/15 to-transparent blur-2xl" style={{ animationDelay: "-4s" }} />
      </div>

      {/* Top gradient bar */}
      <div className="fixed top-0 inset-x-0 z-10 h-1 bg-gradient-to-r from-orange via-orange/80 to-orange/60" />

      {/* Header */}
      <div className="fixed left-4 right-4 top-4 z-10 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
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
          <Card className="border-orange/20 bg-card/80 shadow-2xl shadow-orange/5 backdrop-blur-2xl backdrop-saturate-150">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange/10 text-orange">
                <span className="text-2xl font-bold">f</span>
              </div>
              <CardTitle className="text-2xl">ربط صفحة فيسبوك</CardTitle>
              <CardDescription className="text-base">
                أدخل بيانات صفحتك لتفعيل البوت التلقائي
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Info badges */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-orange/20 bg-orange/5 p-3 text-center">
                  <MessageCircle className="h-5 w-5 text-orange" />
                  <span className="text-xs text-muted-foreground">ردود تلقائية</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-orange/20 bg-orange/5 p-3 text-center">
                  <Zap className="h-5 w-5 text-orange" />
                  <span className="text-xs text-muted-foreground">بوت ذكي</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 rounded-lg border border-orange/20 bg-orange/5 p-3 text-center">
                  <Shield className="h-5 w-5 text-orange" />
                  <span className="text-xs text-muted-foreground">بيانات مشفرة</span>
                </div>
              </div>

              {/* Page ID */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">معرف الصفحة (Page ID)</Label>
                <Input
                  dir="ltr"
                  placeholder="123456789012345"
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  className="h-11 rounded-lg border-input/60 bg-background/50 text-end focus-within:border-orange/50"
                />
              </div>

              {/* Access Token */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">رمز الوصول (Access Token)</Label>
                </div>
                <Input
                  dir="ltr"
                  type="password"
                  placeholder="EAAx..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="h-11 rounded-lg border-input/60 bg-background/50 font-mono focus-within:border-orange/50"
                />
                <p className="text-xs text-muted-foreground">
                  التوكن لازم يكون عنده صلاحيات: pages_messaging, pages_manage_metadata, pages_read_engagement
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
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 h-12 rounded-lg"
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
                  className="flex-1 h-12 rounded-lg bg-orange hover:bg-orange/90 shadow-lg shadow-orange/20"
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
