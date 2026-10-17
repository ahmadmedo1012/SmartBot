"use client"

/**
 * W2-C2a — TickerStrip: the ticker-style compact summary cards (≈57px,
 * spec §1/§3) for the dashboard OVERVIEW route — the ChainGPT ticker
 * grammar (symbol · value · muted Δ% · 24h-style qualifier) translated to
 * REAL SmartBot KPIs from the existing /api/dashboard/bundle payload the
 * overview page already consumes (routers/dashboard_stats.py). No
 * fabricated metrics: every value below is a field of DashboardBundle
 * (stats/messages/connection/rules), with the bundle's real trend
 * percentages as the muted deltas.
 */

import { countPhrase } from "@/lib/format"
import type { DashboardBundle } from "@/lib/types"
import "./dashboard-shell.css"

type Delta = { dir: "up" | "down" | "warn"; text: string }

interface TickerCardProps {
  label: string
  value: string
  delta?: Delta
  qual?: string
}

function TickerCard({ label, value, delta, qual }: TickerCardProps) {
  return (
    <div className="sb-ticker-card" role="listitem">
      <span className="sb-ticker-label">{label}</span>
      <span className="sb-ticker-value-row">
        <span className="sb-ticker-value" dir="ltr">{value}</span>
        {delta && <span className="sb-ticker-delta" data-dir={delta.dir} dir="ltr">{delta.text}</span>}
        {qual && <span className="sb-ticker-qual">{qual}</span>}
      </span>
    </div>
  )
}

/* bundle.trend percentages → muted delta chip (spec §2 colors).
 * undefined = the bundle has no trend field yet → NO delta shown. */
function trendDelta(pct?: number): Delta | undefined {
  if (pct === undefined || pct === null || Number.isNaN(pct)) return undefined
  if (pct > 0) return { dir: "up", text: `+${pct}%` }
  if (pct < 0) return { dir: "down", text: `${pct}%` }
  return { dir: "up", text: "0%" }
}

export function TickerStrip({ bundle, loading }: { bundle?: DashboardBundle; loading?: boolean }) {
  const stats = bundle?.stats
  const messages = bundle?.messages
  const connection = bundle?.connection
  const rules = bundle?.rules ?? []
  const activeRules = rules.filter((r) => r.enabled !== false).length
  const connected = connection?.connected !== false
  const fmt = (n?: number) => (n ?? 0).toLocaleString("en-US")

  if (loading && !bundle) {
    return (
      <div className="sb-ticker" role="status" aria-label="جارٍ تحميل المؤشرات">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="sb-ticker-card animate-pulse">
            <span className="sb-ticker-label">…</span>
            <span className="sb-ticker-value" dir="ltr">—</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="sb-ticker" role="list" aria-label="ملخص مؤشرات لوحة التحكم">
      {/* page health — the REAL connection verdict (alert-slot translation) */}
      <div className="sb-ticker-card" role="listitem">
        <span className="sb-ticker-label">صحة الصفحة</span>
        <span className="sb-ticker-value-row">
          <span
            className="sb-ticker-delta"
            data-dir={connected ? "up" : "warn"}
          >
            {connected ? "متصل" : "غير متصل"}
          </span>
          {connection?.page_name && (
            <span className="sb-ticker-qual truncate max-w-[160px]">{connection.page_name}</span>
          )}
        </span>
      </div>
      <TickerCard label="ردود اليوم" value={fmt(stats?.today_replies)} delta={trendDelta(stats?.trend?.today)} qual="مقارنة بالأمس" />
      <TickerCard label="جميع الردود" value={fmt(stats?.total_replies)} delta={trendDelta(stats?.trend?.week)} qual="هذا الأسبوع" />
      <TickerCard label="محادثات غير مقروءة" value={fmt(messages?.unread_conversations)} qual={countPhrase(messages?.unread_conversations ?? 0, "محادثة", "محادثتان", "محادثات")} />
      <TickerCard label="ردود البوت" value={fmt(messages?.bot_replies)} qual={`من ${fmt(messages?.total_messages)} رسالة`} />
      <TickerCard label="القواعد النشطة" value={fmt(activeRules)} qual={`من ${countPhrase(rules.length, "قاعدة", "قاعدتين", "قواعد")}`} />
      <TickerCard label="متابعو الصفحة" value={fmt(stats?.fan_count)} />
    </div>
  )
}
