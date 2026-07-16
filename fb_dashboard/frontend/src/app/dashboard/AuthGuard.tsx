"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname } from "next/navigation"

export default function AuthGuard({
  children,
  requiredRole,
}: {
  children: React.ReactNode
  requiredRole?: string
}) {
  const [authorized, setAuthorized] = useState(false)
  const pathname = usePathname()
  const attempts = useRef(0)

  useEffect(() => {
    const check = () => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)

      fetch("/api/me", { signal: ctrl.signal })
        .then((r) => {
          clearTimeout(timer)
          if (!r.ok) throw new Error(r.statusText)
          return r.json()
        })
        .then((d) => {
          if (!d.authenticated) return void window.location.replace("/login")
          if (requiredRole && d.role !== requiredRole)
            return void window.location.replace("/dashboard")
          setAuthorized(true)
        })
        .catch(() => {
          if (attempts.current < 1) {
            attempts.current++
            check()
          } else {
            window.location.replace("/login")
          }
        })
    }
    check()
  }, [pathname, requiredRole])

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          <span className="text-sm text-muted-foreground">جاري التحميل...</span>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
