"use client"

import { useState, useEffect } from "react"

export interface PublicStats {
  activeTenants?: number
  totalReplies?: number
  totalPages?: number
  activeUsers30d?: number
  uptimePercent?: number
}

/**
 * Plan §3.1 — landing page numbers must be REAL or ABSENT, never fake.
 * Single shared fetch for /api/public/stats so the hero, stats band and
 * CTA all display the same source of truth.
 */
export function usePublicStats() {
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/public/stats", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) setStats(d.data)
      })
      .catch(() => {/* leave null — qualitative copy is shown */})
      .finally(() => setReady(true))
    return () => controller.abort()
  }, [])

  return { stats, ready }
}

/**
 * Honest social-proof text: real tenant count when we have one,
 * qualitative copy when the platform is young. Never a hardcoded number.
 */
export function trustCopy(stats: PublicStats | null, ready: boolean): string {
  const tenants = stats?.activeTenants ?? 0
  if (!ready) return "أتمتة ذكية لصفحات فيسبوك"
  if (tenants >= 1) {
    const n = tenants.toLocaleString("ar-EG")
    return `أكثر من ${n} صفحة تثق بنا`
  }
  return "أتمتة ذكية لصفحات فيسبوك"
}
