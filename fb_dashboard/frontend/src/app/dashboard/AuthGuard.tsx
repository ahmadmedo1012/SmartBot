"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"
import { unwrapApi } from "@/lib/api"

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
}: {
  children: React.ReactNode
  requiredRole?: string
}) {
  const [authorized, setAuthorized] = useState(false)
  const [userData, setUserData] = useState<Record<string, unknown> | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  // Plan §5.2: interactive dashboard tour (react-joyride) right after the wizard
  const [showTour, setShowTour] = useState(false)
  const pathname = usePathname()
  const attempts = useRef(0)
  const onboardingChecked = useRef(false)

  useEffect(() => {
    const ctrl = new AbortController()
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const check = () => {
      if (ctrl.signal.aborted) return
      const timer = setTimeout(() => {
        if (!ctrl.signal.aborted) ctrl.abort()
      }, 5000)

      fetch("/api/me", { signal: ctrl.signal })
        .then((r) => {
          clearTimeout(timer)
          if (!r.ok) throw new Error(r.statusText)
          return unwrapApi(r)
        })
        .then((d): void => {
          // unwrapApi already returned the payload: {user: {...}}
          // reaching here means 200 OK — i.e. authenticated
          const user = d?.user
          if (!user) {
            return void (window.location.href = "/login")
          }
          const role = user.role
          if (requiredRole && role !== requiredRole) {
            return void (window.location.href = "/dashboard")
          }
          setUserData({ ...user, role })
          // Check onboarding status: show wizard if not completed
          const completed = user.onboardingCompleted ?? true
          if (!completed && !onboardingChecked.current) {
            onboardingChecked.current = true
            setShowOnboarding(true)
          }
          setAuthorized(true)
        })
        .catch(() => {
          if (attempts.current < 1) {
            attempts.current++
            retryTimer = setTimeout(check, 500)
          } else {
            window.location.href = "/login"
          }
        })
    }
    check()
    return () => {
      ctrl.abort()
      if (retryTimer !== null) clearTimeout(retryTimer)
    }
  }, [pathname, requiredRole])

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-accent-foreground border-t-transparent" />
          <span className="text-sm text-muted-foreground">جارٍ التحميل...</span>
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
            // persist the dismissal so the wizard doesn't re-appear on every
            // page navigation (bug: skip was local-state only)
            fetch("/api/onboarding/skip", { method: "POST", credentials: "include" }).catch(() => {})
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
