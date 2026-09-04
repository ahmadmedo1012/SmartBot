"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname } from "next/navigation"
import OnboardingWizard from "@/app/onboarding/OnboardingWizard"

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
          return r.json()
        })
        .then((d) => {
          const data = d.data || d
          if (!(data.authenticated || d.authenticated)) {
            return void (window.location.href = "/login")
          }
          const role = data.role || d.role
          if (requiredRole && role !== requiredRole) {
            return void (window.location.href = "/dashboard")
          }
          setUserData(data)
          // Check onboarding status: show wizard if not completed
          const completed = data.onboardingCompleted ?? data.user?.onboardingCompleted ?? true
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
          <div className="size-8 animate-spin rounded-full border-2 border-orange border-t-transparent" />
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
          onComplete={() => setShowOnboarding(false)}
          onSkip={() => setShowOnboarding(false)}
        />
      )}
    </>
  )
}
