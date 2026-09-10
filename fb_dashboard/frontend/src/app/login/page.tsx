"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { apiFetch, ApiError } from "@/lib/csrf-client"
import { clearQueryPersistedCache } from "@/lib/query-persist"
import { brandedToast } from "@/lib/premium-toast"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import Link from "next/link"
import { LogIn, Eye, EyeOff } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { unwrapApi } from "@/lib/api"
import type { ApiErrorBody } from "@/lib/types"

function FloatingShapes() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full border border-border/30" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full border border-border/20" />
    </div>
  )
}

/* v14-E4 (D1 security review): the old guard rejected "//" but browsers
 * normalize WHATWG backslashes to slashes — "/\evil.com" IS "//evil.com"
 * to the location parser (protocol-relative foreign host). Hardened:
 *   1. normalize every "\" → "/" BEFORE any check;
 *   2. relative paths must start with exactly ONE non-repeated "/";
 *   3. absolute URLs pass only when their host equals THIS origin's host
 *      (allowlist of exactly one trusted host — the current one), and are
 *      returned as origin-relative paths so the browser can never read
 *      them as cross-site.
 */
function safeRedirect(value: string | null) {
  if (!value) return null
  const normalized = value.replace(/\\/g, "/")
  // "/" itself and "/path…" (second char NOT a slash) stay relative
  if (normalized === "/") return "/"
  if (/^\/[^/]/.test(normalized)) return value
  // Anything else must prove it is THIS origin before it is trusted
  if (typeof window !== "undefined") {
    try {
      const u = new URL(normalized, window.location.origin)
      if (u.host === window.location.host) {
        return u.pathname + u.search + u.hash
      }
    } catch {
      /* malformed — fall through to rejection */
    }
  }
  return null
}

/* v12-E4.8: 429 lockout window — parse the backend's remaining seconds from
 * its Arabic message ("… بعد 60 ثانية") when present, else assume 60s. */
function parseLockoutSeconds(message: string): number {
  const seconds = /(\d+)\s*(?:ثانية|ثوانٍ|ثواني)/.exec(message)
  if (seconds) return Math.min(900, Math.max(1, Number(seconds[1])))
  const minutes = /(\d+)\s*(?:دقيقة|دقائق)/.exec(message)
  if (minutes) return Math.min(900, Math.max(1, Number(minutes[1]) * 60))
  return 60
}

/* v10-B5 (G2-04): only the PLATFORM admin (role "admin" AND tenant_id 0)
 * lands on /admin. Registered business owners are role "admin" with a real
 * tenant (tenant_id > 0) — they land on /dashboard, consistent with the
 * post-register landing, and both flows honor ?redirect= alike. */
function landingFor(
  user: { role?: string; tenant_id?: number } | null | undefined,
  redirect: string | null,
) {
  const isPlatformAdmin =
    user?.role === "admin" && typeof user.tenant_id === "number" && user.tenant_id === 0
  return safeRedirect(redirect) || (isPlatformAdmin ? "/admin" : "/dashboard")
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
  // v12-E4.8: 429 rate-limit lockout — seconds remaining before submit
  // re-enables (backend 429 detail drives the window; 60s fallback).
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  useEffect(() => {
    if (lockoutSeconds <= 0) return
    const t = setInterval(() => setLockoutSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [lockoutSeconds])

  useEffect(() => {
    // v24-R4 F2 (belt-and-braces): the persisted react-query cache is
    // user-scoped and must never outlive its session in this tab. The 401
    // path and manual logout wipe it too — this mount-time wipe covers any
    // OTHER forced exit (tab crash + restore, direct URL entry) AND any
    // debounce straggler that raced the navigation here. Anonymous mount =
    // nothing of value is lost; the store rebuilds after this login.
    clearQueryPersistedCache()
  }, [])

  useEffect(() => {
    apiFetch("/api/me")
      .then(unwrapApi)
      .then(d => {
        if (d?.user) {
          window.location.replace(landingFor(d.user, rawRedirect))
        } else {
          setCheckingAuth(false)
        }
      })
      .catch(() => setCheckingAuth(false))
  }, [])

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-accent/20 to-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 animate-pulse rounded-full bg-accent-foreground/40" />
          <span className="animate-breath text-sm text-muted-foreground">جارٍ التحميل…</span>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setFormError("")
    if (lockoutSeconds > 0) return
    if (!username.trim()) { setFormError("يرجى إدخال اسم المستخدم"); return }
    if (!password.trim()) { setFormError("يرجى إدخال كلمة المرور"); return }
    setLoading(true)
    try {
      const res = await apiFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        // v10-B7 (G2-07): inline alert only — the error toast was a second,
        // simultaneous copy of the same message on /login
        setFormError(data.detail || "فشل تسجيل الدخول")
        return
      }
      // apiFetch throws ApiError on non-2xx — surface the backend's Arabic
      // message (e.g. "بيانات تسجيل الدخول غير صحيحة") instead of a generic one.
      brandedToast.success("تم تسجيل الدخول")
      // v10-B5: platform admin (tenant_id 0) → /admin, tenant admin → /dashboard
      const target = landingFor(data.data?.user, rawRedirect)
      setTimeout(() => window.location.replace(target), 150)
    } catch (e) {
      const msg = e instanceof ApiError
        ? ((e.body as ApiErrorBody)?.detail || (e.body as ApiErrorBody)?.error || "فشل تسجيل الدخول")
        : "خطأ في الاتصال بالخادم"
      // v10-B7 (G2-07): one message, one place — the inline role=alert above
      // the submit button (the parallel error toast doubled it visually)
      setFormError(msg)
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
              5.59/6.54:1 (same family as the v14-E4 footer fix two lines down).
              v16-E3 (D1 C2): un-nested Link>Button — ghost-variant visuals
              moved to a span, the anchor is the single tab stop. */}
          <span className="relative inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/10 dark:hover:bg-foreground/15 font-sans text-xs font-bold whitespace-nowrap select-none isolate overflow-hidden transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 ease-smooth h-10 min-h-11 min-w-11 gap-1 px-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>*]:relative before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(105deg,transparent_30%,oklch(1_0_0_/_0.22)_50%,transparent_70%)] before:-translate-x-full before:transition-transform before:duration-700 before:ease-out hover:before:translate-x-full before:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-[radial-gradient(circle_at_50%_50%,oklch(1_0_0_/_0.16),transparent_45%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500">
            <DirectionalIcon semanticDirection="back" className="size-3.5" />
            العودة للرئيسية
          </span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="fixed top-0 inset-x-0 z-10 h-1 bg-gradient-to-r from-[var(--accent-foreground)] via-[var(--accent-foreground)]/80 to-[var(--accent-foreground)]/60" />

      {/* v9-D3: skip-link target (was missing — the skip link was a no-op on
          this page; same sr-only anchor pattern as the landing). */}
      <span id="page-content" className="sr-only" tabIndex={-1} />

      <Card className="animate-scale-in relative z-10 w-full max-w-sm border border-border/60 bg-card/85 shadow-2xl shadow-accent-foreground/5 backdrop-blur-2xl backdrop-saturate-150 sm:max-w-md">
        {/* Visually-hidden page heading — CardTitle is a div, so heading
            navigation had no target on this route (v8-B5) */}
        <h1 className="sr-only">تسجيل الدخول</h1>
        <CardHeader className="pb-2 pt-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center">
            {/* v6 §D — next/image (was raw <img>): intrinsic 160×160 reserving
                layout space, no CLS on the auth screens' hero icon */}
            <Image src="/brand-icon.png" alt="الربط الذكي" width={160} height={160} className="size-full object-contain drop-shadow-lg" priority />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">SmartBot</CardTitle>
          <CardDescription className="text-base text-muted-foreground">لوحة التحكم الذكية</CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-8 pt-4 sm:px-8">
          {/* v10-B6 (G2-03): noValidate — the browser's native bubbles are
              English; the Arabic checks in handleSubmit own the messaging. */}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">اسم المستخدم أو البريد الإلكتروني</Label>
              <div className="rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-accent-foreground/50 focus-within:ring-2 focus-within:ring-accent-foreground/20">
                <Input id="username" type="text" autoComplete="username" dir="auto" placeholder="مثال: ahmed أو ahmed@example.com"
                  value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus
                  aria-invalid={formError ? true : undefined}
                  aria-describedby={formError ? "login-form-error" : undefined}
                  className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">كلمة المرور</Label>
              <div className="relative rounded-lg border border-input/60 bg-background/50 transition-all duration-300 focus-within:border-accent-foreground/50 focus-within:ring-2 focus-within:ring-accent-foreground/20">
                <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" dir="auto"
                  placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required
                  aria-invalid={formError ? true : undefined}
                  aria-describedby={formError ? "login-form-error" : undefined}
                  className="border-0 bg-transparent ps-9 pe-14 focus-visible:ring-0 focus-visible:ring-offset-0" />
                {/* v24-C1: size-11 (44px) touch target — size-7 (28px) was a
                    sub-44px target (A1 S3); pe-14 on the input keeps the
                    typed text clear of the wider button. aria-label intact. */}
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 size-11 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>
                  {/* v12-E4.1: tabIndex={-1} removed — the reveal toggle is an
                      interactive control and must sit in the tab order (the
                      only Level-A keyboard failure in the a11y audit). */}
                  {/* v17-S3 (D2 §3.3#7 / rec #8): Eye↔EyeOff was an instant
                      mount/unmount swap. Both icons now stack in one grid
                      cell and crossfade via the shared .icon-swap class
                      (globals.css) — the ThemeToggle tt-icon recipe
                      generalized; data-active picks the visible glyph and
                      prefers-reduced-motion is guarded in the class. */}
                  <span className="icon-swap" data-active={showPassword ? "b" : "a"} aria-hidden="true">
                    <Eye className="size-4" />
                    <EyeOff className="size-4" />
                  </span>
                </button>
              </div>
            </div>

            {formError && (
              <p id="login-form-error" role="alert" className="text-xs text-destructive text-center bg-destructive/10 border border-destructive/20 rounded-md py-2 px-3">
                {formError}
              </p>
            )}
            {lockoutSeconds > 0 && (
              <p id="login-lockout" role="status" aria-live="polite" className="text-xs text-warning text-center">
                يمكنك إعادة المحاولة بعد {lockoutSeconds} ثانية
              </p>
            )}
            <Button type="submit" className="mt-2 h-11 w-full rounded-xl text-base font-semibold shadow-md shadow-accent-foreground/20 hover:shadow-lg hover:shadow-accent-foreground/30" disabled={loading || lockoutSeconds > 0}>
              {loading ? (
                /* v17-E-F4 (D3 #5): LogIn is directional (arrow into a door
                    bracket) — mirrored in RTL via the §2.2 allowlist class,
                    same mechanism as the sidebar's LogOut. */
                <span className="flex items-center gap-2"><LogIn className="size-4 animate-pulse rtl:-scale-x-100" aria-hidden="true" /> جارٍ تسجيل الدخول…</span>
              ) : (
                <span className="flex items-center gap-2"><LogIn className="size-4 rtl:-scale-x-100" aria-hidden="true" /> تسجيل الدخول</span>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            {/* v15-E6 (D5-H5): /80 on accent-foreground measured 3.76:1 dark
                (light passed by a 0.03 margin) — the full token measures
                5.41:1 dark / 6.47:1 light. */}
            <Link href="/register" className="text-xs text-accent-foreground hover:underline transition-colors">
              ليس لديك حساب؟ إنشاء حساب جديد
            </Link>
          </div>
          {/* v14-E4 (D4 H-03): /80 on muted-foreground measured 3.89:1 dark /
              4.08:1 light — under the 4.5:1 AA floor; the full token passes
              5.59/6.54:1. */}
          <p className="mt-4 text-center text-xs text-muted-foreground">SmartBot - منصة إدارة التفاعل الذكية</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return <LoginForm />
}
