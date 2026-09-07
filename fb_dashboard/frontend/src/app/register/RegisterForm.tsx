"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { apiFetch, ApiError } from "@/lib/csrf-client"
import type { ApiErrorBody } from "@/lib/types"
import { brandedToast } from "@/lib/premium-toast"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import Link from "next/link"
import { UserPlus, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* v12-E4.8: 429 lockout window — parse the backend's remaining seconds from
 * its Arabic message ("… بعد 60 ثانية") when present, else assume 60s. */
function parseLockoutSeconds(message: string): number {
  const seconds = /(\d+)\s*(?:ثانية|ثوانٍ|ثواني)/.exec(message)
  if (seconds) return Math.min(900, Math.max(1, Number(seconds[1])))
  const minutes = /(\d+)\s*(?:دقيقة|دقائق)/.exec(message)
  if (minutes) return Math.min(900, Math.max(1, Number(minutes[1]) * 60))
  return 60
}

/* v12-E4.14: compose aria-describedby — the form-level error id plus the
 * per-field validity icon id (so the check/x verdict is announced). */
function describedBy(...ids: (string | false | undefined)[]) {
  const list = ids.filter(Boolean).join(" ")
  return list || undefined
}

function FloatingShapes() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full border border-border/30" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full border border-border/20" />
    </div>
  )
}

function validate(fields: { username: string; email: string; password: string; confirm: string }) {
  /* v10-B6 (G2-03): Arabic-first checks — the form is noValidate, so these
   * replace the browser's native English bubbles. Empty fields get their
   * own message before the format/length checks. */
  if (!fields.username.trim()) return "يرجى إدخال اسم المستخدم"
  if (fields.username.trim().length < 3) return "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"
  if (!fields.email.trim()) return "يرجى إدخال البريد الإلكتروني"
  if (!EMAIL_RE.test(fields.email.trim())) return "أدخل بريداً إلكترونياً صالحاً"
  if (!fields.password) return "يرجى إدخال كلمة المرور"
  /* v12-E4.9: minimum 8 characters (was 6) — aligns the client gate with
   * the backend's password policy. */
  if (fields.password.length < 8) return "كلمة المرور يجب أن تكون 8 أحرف على الأقل"
  if (!fields.confirm) return "يرجى تأكيد كلمة المرور"
  if (fields.password !== fields.confirm) return "كلمتا المرور غير متطابقتين"
  return ""
}

function RegisterForm() {
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [formError, setFormError] = useState("")
  // v12-E4.8: 429 rate-limit lockout — seconds remaining before submit
  // re-enables (backend 429 detail drives the window; 60s fallback).
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  useEffect(() => {
    if (lockoutSeconds <= 0) return
    const t = setInterval(() => setLockoutSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [lockoutSeconds])

  const usernameOk = username.length >= 3
  const emailOk = EMAIL_RE.test(email)
  const passwordOk = password.length >= 8

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (lockoutSeconds > 0) return
    const err = validate({ username, email, password, confirm })
    if (err) { setFormError(err); return }
    setFormError("")
    setLoading(true)
    try {
      const res = await apiFetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.detail || data.error || "فشل إنشاء الحساب")
        brandedToast.error(data.detail || data.error || "فشل إنشاء الحساب")
        return
      }
      // apiFetch throws ApiError on non-2xx — surface the backend's Arabic
      // validation message instead of a generic connection error.
      brandedToast.success("تم إنشاء الحساب بنجاح")
      setTimeout(() => window.location.replace("/dashboard"), 150)
    } catch (e) {
      const msg = e instanceof ApiError
        ? ((e.body as ApiErrorBody)?.detail || (e.body as ApiErrorBody)?.error || "فشل إنشاء الحساب")
        : "خطأ في الاتصال بالخادم"
      setFormError(msg)
      brandedToast.error(msg)
      // v12-E4.8: rate-limited (429) → show the Arabic detail and lock the
      // submit button for the remaining window with a live countdown.
      if (e instanceof ApiError && e.status === 429) {
        setLockoutSeconds(parseLockoutSeconds(msg))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 sm:px-6">
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-background via-accent/20 to-background" />
      <FloatingShapes />

      <div className="fixed start-4 top-4 z-50 flex items-center gap-2">
        <Link href="/">
          {/* v15-E6 (D5-H1): the /80 on muted-foreground measured 3.89:1 dark /
              4.08:1 light — under the 4.5:1 AA floor; the full token passes
              5.59/6.54:1. */}
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
            <DirectionalIcon semanticDirection="back" className="size-3.5" />
            العودة للرئيسية
          </Button>
        </Link>
        <ThemeToggle />
      </div>

      <div className="fixed top-0 inset-x-0 z-10 h-1 bg-gradient-to-r from-[var(--accent-foreground)] via-[var(--accent-foreground)]/80 to-[var(--accent-foreground)]/60" />

      <Card className="animate-scale-in relative z-10 w-full max-w-sm border border-border/60 bg-card/85 shadow-2xl shadow-accent-foreground/5 backdrop-blur-2xl backdrop-saturate-150 sm:max-w-md">
        {/* Visually-hidden page heading — CardTitle is a div, so heading
            navigation had no target on this route (v8-B5) */}
        <h1 className="sr-only">إنشاء حساب جديد</h1>
        <CardHeader className="pb-2 pt-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center">
            {/* v6 §D — next/image: 160×160 intrinsic dims, no CLS */}
            <Image src="/brand-icon.png" alt="الربط الذكي" width={160} height={160} className="size-full object-contain drop-shadow-lg" priority />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">إنشاء حساب جديد</CardTitle>
          {/* v14-E4 (D4 H-03): /80 on muted-foreground measured 3.89:1 dark /
              4.08:1 light — under the 4.5:1 AA floor; the full token passes
              5.59/6.54:1. */}
          <CardDescription className="text-base text-muted-foreground">انضم إلى SmartBot</CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-8 pt-4 sm:px-8">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">اسم المستخدم</Label>
              <div className="relative rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-accent-foreground/50 focus-within:ring-2 focus-within:ring-accent-foreground/20">
                <Input id="username" type="text" autoComplete="username" placeholder="اسم المستخدم" dir="auto"
                  value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus
                  aria-invalid={formError ? true : undefined}
                  aria-describedby={describedBy(formError && "register-form-error", username.length > 0 && "username-validity")}
                  className="border-0 bg-transparent pe-9 focus-visible:ring-0 focus-visible:ring-offset-0" />
                {username.length > 0 && (
                  <span id="username-validity" className="absolute end-2 top-1/2 -translate-y-1/2">
                    {usernameOk ? <CheckCircle aria-label="صالح" role="img" className="size-4 text-success" /> : <XCircle aria-label="غير صالح" role="img" className="size-4 text-destructive" />}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">البريد الإلكتروني</Label>
              <div className="relative rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-accent-foreground/50 focus-within:ring-2 focus-within:ring-accent-foreground/20">
                <Input id="email" type="email" autoComplete="email" placeholder="البريد الإلكتروني" dir="auto"
                  value={email} onChange={(e) => setEmail(e.target.value)} required
                  aria-invalid={formError ? true : undefined}
                  aria-describedby={describedBy(formError && "register-form-error", email.length > 0 && "email-validity")}
                  className="border-0 bg-transparent pe-9 focus-visible:ring-0 focus-visible:ring-offset-0" />
                {email.length > 0 && (
                  <span id="email-validity" className="absolute end-2 top-1/2 -translate-y-1/2">
                    {emailOk ? <CheckCircle aria-label="صالح" role="img" className="size-4 text-success" /> : <XCircle aria-label="غير صالح" role="img" className="size-4 text-destructive" />}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">كلمة المرور</Label>
              <div className="relative rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-accent-foreground/50 focus-within:ring-2 focus-within:ring-accent-foreground/20">
                <Input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" dir="auto"
                  placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} required
                  aria-invalid={formError ? true : undefined}
                  aria-describedby={describedBy(formError && "register-form-error", password.length > 0 && "password-validity")}
                  className="border-0 bg-transparent ps-9 focus-visible:ring-0 focus-visible:ring-offset-0" />
                {password.length > 0 && (
                  <span id="password-validity" className="absolute end-8 top-1/2 -translate-y-1/2">
                    {passwordOk ? <CheckCircle aria-label="صالح" role="img" className="size-4 text-success" /> : <XCircle aria-label="غير صالح" role="img" className="size-4 text-destructive" />}
                  </span>
                )}
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 size-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>
                  {/* v12-E4.1: tabIndex={-1} removed — the reveal toggle is an
                      interactive control and must sit in the tab order. */}
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-sm font-medium">تأكيد كلمة المرور</Label>
              <div className="relative rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-accent-foreground/50 focus-within:ring-2 focus-within:ring-accent-foreground/20">
                <Input id="confirm" type={showConfirm ? "text" : "password"} autoComplete="new-password" dir="auto"
                  placeholder="تأكيد كلمة المرور" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
                  aria-invalid={formError ? true : undefined}
                  aria-describedby={describedBy(formError && "register-form-error", confirm.length > 0 && "confirm-validity")}
                  className="border-0 bg-transparent ps-9 focus-visible:ring-0 focus-visible:ring-offset-0" />
                {confirm.length > 0 && (
                  <span id="confirm-validity" className="absolute end-8 top-1/2 -translate-y-1/2">
                    {password === confirm ? <CheckCircle aria-label="صالح" role="img" className="size-4 text-success" /> : <XCircle aria-label="غير صالح" role="img" className="size-4 text-destructive" />}
                  </span>
                )}
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 size-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  aria-label={showConfirm ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>
                  {/* v12-E4.1: tabIndex={-1} removed — the reveal toggle is an
                      interactive control and must sit in the tab order. */}
                  {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {formError && (
              <p id="register-form-error" role="alert" className="text-xs text-destructive text-center bg-destructive/10 border border-destructive/20 rounded-md py-2 px-3">
                {formError}
              </p>
            )}
            {lockoutSeconds > 0 && (
              <p id="register-lockout" role="status" aria-live="polite" className="text-xs text-warning text-center">
                يمكنك إعادة المحاولة بعد {lockoutSeconds} ثانية
              </p>
            )}
            <Button type="submit" className="mt-2 h-11 w-full rounded-xl text-base font-semibold shadow-md shadow-accent-foreground/20 hover:shadow-lg hover:shadow-accent-foreground/30" disabled={loading || lockoutSeconds > 0}>
              {loading ? (
                <span className="flex items-center gap-2"><UserPlus className="size-4 animate-pulse" /> جارٍ إنشاء الحساب…</span>
              ) : (
                <span className="flex items-center gap-2"><UserPlus className="size-4" /> إنشاء حساب</span>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            {/* v15-E6 (D5-H5): /80 on accent-foreground measured 3.76:1 dark
                (light passed by a 0.03 margin) — the full token measures
                5.41:1 dark / 6.47:1 light. */}
            <Link href="/login" className="text-xs text-accent-foreground hover:underline transition-colors">
              لديك حساب؟ تسجيل الدخول
            </Link>
          </div>

          {/* v14-E4 (D4 H-03): same /80 → full-token fix (AA 4.5:1). */}
          <p className="mt-4 text-center text-xs text-muted-foreground">SmartBot — منصة إدارة التفاعل الذكية</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function RegisterPage() {
  return <RegisterForm />
}
