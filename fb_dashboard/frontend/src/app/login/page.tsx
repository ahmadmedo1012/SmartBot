"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { csrfFetch } from "@/lib/csrf-client"
import { toast } from "sonner"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import Link from "next/link"
import { LogIn, Eye, EyeOff, ArrowLeft } from "lucide-react"

function FloatingShapes() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -top-20 -right-20 h-72 w-72 animate-spin-slow rounded-full bg-gradient-to-br from-orange/15 to-orange/5 blur-3xl duration-[20s]" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 animate-spin-slow rounded-full bg-gradient-to-tr from-orange/10 to-orange/5 blur-3xl duration-[25s]" />
      <div className="absolute left-1/3 top-1/4 h-48 w-48 animate-float-delayed rounded-full bg-gradient-to-b from-orange/15 to-transparent blur-2xl delay-[1s] duration-[8s]" />
    </div>
  )
}

function safeRedirect(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null
  return value
}

function LoginForm() {
  const [rawRedirect] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("redirect") : null
  )

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [formError, setFormError] = useState("")

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then(d => {
        if (d.authenticated) {
          window.location.replace(d.role === "admin" ? (safeRedirect(rawRedirect) || "/admin") : "/dashboard")
        } else {
          setCheckingAuth(false)
        }
      })
      .catch(() => setCheckingAuth(false))
  }, [])

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-orange-muted/20 to-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 animate-pulse rounded-full bg-orange/40" />
          <span className="animate-breath text-sm text-muted-foreground">جاري التحميل...</span>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setFormError("")
    if (!username.trim()) { setFormError("يرجى إدخال اسم المستخدم"); return }
    if (!password.trim()) { setFormError("يرجى إدخال كلمة المرور"); return }
    setLoading(true)
    try {
      const res = await csrfFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, password }).toString(),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.detail || "فشل تسجيل الدخول")
        return
      }
      toast.success("تم تسجيل الدخول بنجاح")
      const target = data.role === "admin" ? (safeRedirect(rawRedirect) || "/admin") : "/dashboard"
      setTimeout(() => window.location.replace(target), 150)
    } catch {
      toast.error("خطأ في الاتصال بالخادم")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 sm:px-6">
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-background via-orange-muted/20 to-background" />
      <FloatingShapes />

      <div className="fixed start-4 top-4 z-50 flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground/60 hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            العودة للرئيسية
          </Button>
        </Link>
        <ThemeToggle />
      </div>

      <div className="fixed top-0 inset-x-0 z-10 h-1 bg-gradient-to-r from-[var(--orange)] via-[var(--orange)]/80 to-[var(--orange)]/60" />

      <Card className="animate-scale-in relative z-10 w-full max-w-sm border border-orange/20 bg-card/80 shadow-2xl shadow-orange/5 backdrop-blur-2xl backdrop-saturate-150 sm:max-w-md">
        <CardHeader className="pb-2 pt-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center">
            <img src="/static/brand-icon.png" alt="الربط الذكي" className="size-full object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">SmartBot</CardTitle>
          <CardDescription className="text-base text-muted-foreground/80">لوحة التحكم الذكية</CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-8 pt-4 sm:px-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">اسم المستخدم أو البريد الإلكتروني</Label>
              <div className="rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-orange/50 focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,_var(--orange)_10%,_transparent)]">
                <Input id="username" type="text" autoComplete="username" placeholder="اسم المستخدم"
                  value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus
                  className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">كلمة المرور</Label>
              <div className="relative rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-orange/50 focus-within:shadow-[0_0_0_3px_color-mix(in_oklch,_var(--orange)_10%,_transparent)]">
                <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                  placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="border-0 bg-transparent ps-9 focus-visible:ring-0 focus-visible:ring-offset-0" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {formError && <p className="text-xs text-destructive text-center">{formError}</p>}
            <Button type="submit" className="mt-2 h-10 w-full rounded-xl text-base font-semibold" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2"><LogIn className="size-4 animate-pulse" /> جاري تسجيل الدخول...</span>
              ) : (
                <span className="flex items-center gap-2"><LogIn className="size-4" /> تسجيل الدخول</span>
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground/60">SmartBot - منصة إدارة التفاعل الذكية</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return <LoginForm />
}
