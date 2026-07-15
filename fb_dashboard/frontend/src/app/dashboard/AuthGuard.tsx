"use client"

import { useEffect, useState } from "react"

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) setAuthorized(true)
        else window.location.replace("/login")
      })
      .catch(() => window.location.replace("/login"))
  }, [])

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
