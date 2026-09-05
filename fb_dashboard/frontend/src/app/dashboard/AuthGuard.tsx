"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname } from "next/navigation"
import OnboardingWizard from "@/app/onboarding/OnboardingWizard"
import { OnboardingTour } from "@/components/onboarding/OnboardingTour"
import { unwrapApi } from "@/lib/api"

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
        .then((d) => {
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
          <span className="text-sm text-muted-foreground">جاري التحميل...</span>
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
