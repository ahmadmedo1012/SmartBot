"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { apiFetch } from "@/lib/csrf-client"
import { premiumToast } from "@/lib/premium-toast"
import { isTenantSuspended } from "@/lib/tenant-suspended"
import { useMe } from "@/hooks/useMe"
import { ShieldAlert, LogOut } from "lucide-react"

/* v9-E5: react-joyride (~116KB) was statically imported here → it landed in
 * EVERY dashboard route bundle (26 routes) even though the tour only runs
 * once per fresh tenant. dynamic(ssr:false) keeps the same conditional
 * render below, but the joyride chunk loads only when the tour shows.
 *
 * v11-A7: same treatment for OnboardingWizard — its statically imported
 * 43KB chunk (framer-motion wizard steps, Arabic copy, lucide icons) shipped
 * on every dashboard route despite only rendering for fresh tenants
 * (onboardingCompleted === false). It mounts only AFTER the /api/me fetch
 * resolves, so the chunk streams in parallel with that request — no
 * visible wait, and `loading: null` matches the tour pattern (a modal that
 * isn't on screen yet renders nothing). */
const OnboardingTour = dynamic(
  () => import("@/components/onboarding/OnboardingTour").then((m) => m.OnboardingTour),
  { ssr: false, loading: () => null }
)
const OnboardingWizard = dynamic(
  () => import("@/app/onboarding/OnboardingWizard"),
  { ssr: false, loading: () => null }
)

const TOUR_SEEN_KEY = "smartbot-tour-completed"

export default function AuthGuard({
  children,
  requiredRole,
  requirePlatformAdmin,
}: {
  children: React.ReactNode
  requiredRole?: string
  /** v22-D6 (W1-D6 #7-م1): /admin shell gate — UX only. The API 403s
   * behind require_platform_admin stay the real security layer; this just
   * keeps tenant admins (every self-registered user has role="admin")
   * out of a shell whose pages all 403 for them anyway. */
  requirePlatformAdmin?: boolean
}) {
  const [showOnboarding, setShowOnboarding] = useState(false)
  // Plan §5.2: interactive dashboard tour (react-joyride) right after the wizard
  const [showTour, setShowTour] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const onboardingChecked = useRef(false)

  /* v24-C3 (A2 #1 — un-block the auth gate + de-dupe /api/me): the guard's
   * session check now runs through the SHARED react-query ["me"] entry
   * (hooks/useMe.ts) instead of a raw fetch + local state re-fired on every
   * pathname change. One /api/me now serves the guard AND the sidebar CTA
   * (useSubscriptionStatus) AND billing; within the 5-minute staleTime an
   * in-shell navigation renders children from cache with zero extra
   * round-trips (the old per-tap serial waterfall: spinner → /api/me →
   * children → page query). The gate semantics are unchanged: children only
   * mount once a real (cached or freshly fetched) user passed the role
   * checks; 401/network failure still lands on /login?redirect=<pathname>.
   * Transient failures retry exactly once (react-query retry: 1). */
  const { data, isLoading, isError, error } = useMe()
  const user = data?.user
  /* W2-BOT-4 (P42-2، تدقيق 3a): إيقاف المنظمة ليس مشكلة جلسة — كل نداء
   * للتاجر الموقوف يرفعه حارس الجلسة (auth.py:115) بـ403. الرحلة
   * القديمة (isError → إعادة توجيه للدخول) كانت حلقة: الدخول ينجح ثم
   * كل /api/me يفشل من جديد. الحالة الصادقة: صفحة كاملة داخل الغلاف
   * تشرح الإيقاف وتنقض «أعد المحاولة»، وبقناة الدعم كطريق وحيد. */
  const suspended = isError && isTenantSuspended(error)

  useEffect(() => {
    if (isLoading) return
    if (isError) {
      /* W2-BOT-4: الإيقاف يُعرض حالةً كاملة (أدناه) — لا إعادة توجيه.
       * بقية الأخطاء (401 انتهاء جلسة/شبكة) تبقى رحلة الدخول كما كانت. */
      if (suspended) return
      /* v12-E4.10: carry the current path — /login's safeRedirect
       * (login/page.tsx) validates it and lands the user back here
       * after re-authenticating instead of the bare /dashboard. */
      window.location.href = "/login?redirect=" + encodeURIComponent(pathname)
      return
    }
    if (!user) {
      return void (window.location.href = "/login")
    }
    if (requiredRole && user.role !== requiredRole) {
      return void (window.location.href = "/dashboard")
    }
    // v22-D6: soft redirect (router.replace) so the toast survives the
    // layout swap — sonner's state is global and the dashboard layout's
    // AppToaster re-renders it after the navigation. A hard
    // window.location reload would kill the toast before paint.
    if (requirePlatformAdmin && user.is_platform_admin !== true) {
      premiumToast(
        "error",
        "لوحة الإدارة متاحة لمسؤول المنصة فقط",
        "تم إعادتك إلى لوحة التحكم — هذه المنطقة تتطلب صلاحيات مسؤول المنصة",
      )
      return void router.replace("/dashboard")
    }
    // Check onboarding status: show wizard if not completed
    const completed = user.onboardingCompleted ?? true
    if (!completed && !onboardingChecked.current) {
      onboardingChecked.current = true
      setShowOnboarding(true)
    }
    // W2-BOT-4: suspended في المصفوفة — مشتقة من isError/error فتتزامن
    // مع أي إعادة جلب للجلسة (60s refetchInterval).
  }, [isLoading, isError, suspended, user, requiredRole, requirePlatformAdmin, router, pathname])

  // v24-C3: same authorized contract as the old setAuthorized gate — the
  // spinner shows ONLY while the session is genuinely unresolved (cold
  // load); cached /api/me data renders children on the first paint.
  const authorized =
    !isLoading &&
    !isError &&
    !!user &&
    (!requiredRole || user.role === requiredRole) &&
    (!requirePlatformAdmin || user.is_platform_admin === true)

  if (suspended) {
    /* الحالة الصادقة للإيقاف — نفس قواعد عائلة .state لكن صفحةً كاملة:
     * الإيقاف يمنع كل مسارات اللوحة فلا معنى لعرضها. */
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-border/70 bg-card/60 p-6 text-center space-y-4" role="alert">
          <div className="mx-auto size-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="size-6 text-destructive" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold">حساب منظمتك موقوف</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              لا يمكنك استخدام لوحة التحكم حتى يُرفع الإيقاف. بياناتك محفوظة
              كما هي — تواصل مع الدعم لمعرفة السبب وخطوات استعادة الحساب.
            </p>
          </div>
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            إعادة المحاولة لن تنجح — الإيقاف حالة على الخادم تُرفع من جانب
            الدعم فقط.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            {/* نفس عقد تسجيل الخروج في DashboardShell: CSRF POST ثم انتقال */}
            <button
              type="button"
              onClick={() => {
                apiFetch("/api/logout", { method: "POST" })
                  .catch(() => {})
                  .finally(() => { window.location.href = "/login" })
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <LogOut className="size-3.5" aria-hidden="true" /> تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-accent-foreground border-t-transparent" />
          <span className="text-sm text-muted-foreground">جارٍ التحميل…</span>
        </div>
      </div>
    )
  }

  return (
    <>
      {children}
      {showOnboarding && (
        <OnboardingWizard
          onComplete={() => {
            setShowOnboarding(false)
            // ابدأ جولة اللوحة (react-joyride) بعد إتمام المعالج — مرة واحدة فقط
            if (typeof window !== "undefined" && !window.localStorage.getItem(TOUR_SEEN_KEY)) {
              setShowTour(true)
            }
          }}
          onSkip={() => {
            setShowOnboarding(false)
            /* v15-E5 (D4-H1): the skip was a RAW fetch() with no
             * X-CSRF-Token — app/middleware.py's double-submit layer 403'd
             * every «تخطي» POST and the .catch() swallowed it, so
             * onboarding_completed never persisted and the wizard re-appeared
             * after every refresh. apiFetch echoes the csrf cookie the guard's
             * own /api/me GET just planted; a non-401 failure is now a visible
             * Arabic toast instead of silence (a 401 flows through apiFetch's
             * global session-expiry redirect — see csrf-client D4-H3). */
            apiFetch("/api/onboarding/skip", { method: "POST" }).catch(() => {
              premiumToast(
                "error",
                "تعذّر حفظ تخطي المعالج",
                "قد تظهر خطوات التهيئة مجدداً عند تحديث الصفحة — أعد المحاولة أو أكملها من لوحة التحكم",
              )
            })
          }}
        />
      )}
      {showTour && (
        <OnboardingTour
          autoStart
          onComplete={() => {
            setShowTour(false)
            if (typeof window !== "undefined") {
              window.localStorage.setItem(TOUR_SEEN_KEY, "1")
            }
          }}
        />
      )}
    </>
  )
}
