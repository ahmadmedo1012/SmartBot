"use client"

import { useEffect, useState } from "react"
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { formatDate, formatNumber, timeAgo } from "@/lib/format"

interface CronStatus {
  last_heartbeat: string | null
  age_seconds: number | null
  stale: boolean | null
  never_beaten?: boolean
  stale_after_seconds: number
  expected_interval: string
}

/**
 * v6 §E — cron heartbeat truth, visible in the platform-admin console.
 * The backend also alerts Telegram on stalls; this card gives the operator
 * an at-a-glance answer to "are the scheduled posts actually running?".
 *
 * v10-B4 (G2-02): `enabled` gates both the /api/cron/status polling and the
 * render — the endpoint is platform-admin-only (403 for tenant admins),
 * so the page passes `enabled={tenant_id === 0}` from /api/me.
 */
export function CronHeartbeatCard({ enabled = true }: { enabled?: boolean }) {
  const [status, setStatus] = useState<CronStatus | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    apiFetch("/api/cron/status")
      .then(unwrapApi)
      .then((d) => { if (alive) setStatus(d) })
      .catch(() => { if (alive) setFailed(true) })
    const t = setInterval(() => {
      apiFetch("/api/cron/status")
        .then(unwrapApi)
        .then((d) => { if (alive) { setStatus(d); setFailed(false) } })
        .catch(() => { if (alive) setFailed(true) })
    }, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [enabled])

  if (!enabled) return null
  if (failed && !status) return null // silent when the operator lacks platform-admin rights

  const ageMin = status?.age_seconds != null ? Math.floor(status.age_seconds / 60) : null
  const healthy = status?.stale === false
  const stale = status?.stale === true

  return (
    <Card className={stale ? "border-destructive/40" : undefined}>
      <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {stale ? (
            <div className="size-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
            </div>
          ) : (
            <div className="size-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              {status?.never_beaten ? (
                <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              )}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">نبض الجدولة (الكرون)</p>
            <p className="text-xs text-muted-foreground truncate">
              {failed
                ? "تعذر جلب الحالة"
                : status?.never_beaten
                  ? "لم يسجل أي نبض بعد — شغّل /api/cron/heartbeat أو اضبط cron-job.org"
                  : stale
                    ? `متوقف ${timeAgo(status?.last_heartbeat ?? null)} (الحد: ${formatNumber(Math.floor((status?.stale_after_seconds ?? 900) / 60))} دقيقة) — تحقق من cron-job.org`
                    /* v12-E4.13: «5 د» abbreviation dropped for the full word;
                       the minutes count flows through formatNumber. */
                    : `حديث — آخر نبض ${timeAgo(status?.last_heartbeat ?? null)} (متوقع كل ${status?.expected_interval ?? "5 دقائق"})`}
            </p>
          </div>
        </div>
        <p className="text-3xs text-muted-foreground" dir="auto">
          {status?.last_heartbeat ? `آخر نبض: ${formatDate(status.last_heartbeat)}` : "—"}
        </p>
      </CardContent>
    </Card>
  )
}
