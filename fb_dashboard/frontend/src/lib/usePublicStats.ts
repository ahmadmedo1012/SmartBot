"use client"

import { useState, useEffect } from "react"
import { unwrapApi } from "@/lib/api"
import { formatNumber } from "@/lib/format"

interface PublicStats {
  activeTenants?: number
  totalReplies?: number
  totalPages?: number
  activeUsers30d?: number
  uptimePercent?: number
}

/* v10-C2 (G3 rec §8-2) — the hook's doc-comment always claimed a "single
 * shared fetch", but each of the three mounting consumers (LandingIslands
 * + StatsSection + FinalCTASection) ran its own useEffect → THREE identical
 * /api/public/stats requests on every home load (G3 measured 380–1339ms
 * each, back-to-back, local and prod). One module-level in-flight promise
 * now serves every consumer on the page; a 60s freshness window lets a
 * re-mount (navigate away and back) reuse the settled result instead of
 * re-firing. A failure is NOT cached — the next page load retries, exactly
 * the old per-pageload retry semantics. */
const STATS_FRESH_MS = 60_000
let settledStats: { at: number; value: PublicStats | null } | null = null
let statsInFlight: Promise<PublicStats | null> | null = null

function loadPublicStats(): Promise<PublicStats | null> {
  if (settledStats && Date.now() - settledStats.at < STATS_FRESH_MS) {
    return Promise.resolve(settledStats.value)
  }
  if (!statsInFlight) {
    statsInFlight = fetch("/api/public/stats")
      .then(unwrapApi<PublicStats>)
      .then((d) => {
        settledStats = { at: Date.now(), value: d ?? null }
        return settledStats.value
      })
      /* leave any previous settled value untouched — a failed attempt is
       * not cached, so the next page load retries */
      .catch((): PublicStats | null => null)
      .finally(() => {
        statsInFlight = null
      })
  }
  return statsInFlight
}

/**
 * Plan §3.1 — landing page numbers must be REAL or ABSENT, never fake.
 * Single shared fetch for /api/public/stats so the hero, stats band and
 * CTA all display the same source of truth. (v10-C2: actually single now —
 * see loadPublicStats above.)
 */
export function usePublicStats() {
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    loadPublicStats().then((d) => {
      if (!alive) return
      if (d) setStats(d)
      setReady(true) /* also on failure — qualitative copy is shown */
    })
    return () => {
      alive = false /* the shared fetch itself is never aborted on unmount —
        other consumers (and the cache) still need the result */
    }
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
    const n = formatNumber(tenants) // v6 §A — was ar-EG (Arabic-Indic digits), inconsistent with the ar-LY convention everywhere else
    return `أكثر من ${n} صفحة تثق بنا`
  }
  return "أتمتة ذكية لصفحات فيسبوك"
}
