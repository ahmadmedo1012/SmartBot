import { useState, useEffect } from "react"
import { fetchStats, fetchAnalyticsOverview, fetchDailyTrend } from "@/lib/api"

function formatNum(n) {
  if (n == null) return "—"
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M"
  if (n >= 1000) return (n / 1000).toFixed(1) + "k"
  return n.toLocaleString()
}

export function Analytics() {
  const [stats, setStats] = useState(null)
  const [overview, setOverview] = useState(null)
  const [daily, setDaily] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchStats().catch(() => null),
      fetchAnalyticsOverview(30).catch(() => null),
      fetchDailyTrend(30).catch(() => null),
    ]).then(([s, o, d]) => {
      setStats(s)
      setOverview(o)
      setDaily(d || [])
      setLoading(false)
    })
  }, [])

  const chartData = daily.length ? daily : (() => {
    const raw = overview?.daily_breakdown || stats?.chart || {}
    return Object.entries(raw).map(([d, c]) => ({ label: d, count: c })).slice(-12)
  })()

  const maxCount = Math.max(...chartData.map(d => d.count || 0), 1)
  const peakHr = overview?.peak_hour != null ? `${overview.peak_hour}:00` : null

  return (
    <section className="page active" dir="rtl" data-od-id="page-analytics" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="page-header">
        <h1>التحليلات</h1>
        <p>بيانات وإحصائيات الأداء</p>
      </div>

      {loading ? (
        <div className="metrics-row" role="status">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="metric-card"><div className="skeleton skeleton-text" style={{ width: 40, height: 22, margin: "0 auto" }} /></div>
          ))}
        </div>
      ) : (
        <div className="metrics-row stagger-children">
          <div className="metric-card"><div className="mc-value" style={{ color: "var(--accent)" }}>{formatNum(stats?.total_replies || overview?.total_replies)}</div><div className="mc-label">إجمالي الردود</div></div>
          <div className="metric-card"><div className="mc-value">{formatNum(stats?.today_replies || overview?.today_replies)}</div><div className="mc-label">ردود اليوم</div></div>
          <div className="metric-card"><div className="mc-value" style={{ color: "var(--success)" }}>{formatNum(overview?.fan_count || stats?.fan_count)}</div><div className="mc-label">المتابعون</div></div>
          <div className="metric-card"><div className="mc-value" style={{ color: "var(--info)" }}>{peakHr || "—"}</div><div className="mc-label">ذروة النشاط</div></div>
          <div className="metric-card"><div className="mc-value">{formatNum(overview?.top_rules?.length || 0)}</div><div className="mc-label">القواعد النشطة</div></div>
        </div>
      )}

      <div className="row-2">
        <div className="card glass" data-od-id="card-analytics-followers">
          <div className="card-title">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            النشاط اليومي
          </div>
          {chartData.length >= 2 ? (
            <div className="chart-line">
              {chartData.map((d, i) => (
                <div key={i} className="cl-bar" style={{ height: `${Math.max((d.count / maxCount) * 100, 4)}%` }}>
                  <span className="cl-label" style={{ position: "absolute", bottom: -18, fontSize: 9, color: "var(--muted)", insetInline: 0, textAlign: "center" }}>{d.label?.slice?.(5) || d.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "32px 0" }}>
              <h2>بيانات غير كافية</h2>
              <p>سيظهر الرسم البياني عند توفر بيانات كافية</p>
            </div>
          )}
        </div>
        <div className="card glass" data-od-id="card-analytics-age">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            توزيع الردود — آخر 30 يوماً
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(overview?.top_rules || []).slice(0, 6).map((r, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBlockEnd: 4 }}>
                  <span>القاعدة #{r.rule_id}</span><span>{r.count} رد</span>
                </div>
                <div style={{ height: 6, background: "var(--border)", borderRadius: 6 }}>
                  <div style={{ width: `${Math.min((r.count / Math.max(overview?.top_rules?.[0]?.count || 1, 1)) * 100, 100)}%`, height: "100%", background: "var(--accent)", borderRadius: 6 }} />
                </div>
              </div>
            ))}
            {(!overview?.top_rules || overview.top_rules.length === 0) && (
              <div style={{ textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 13 }}>لا توجد بيانات كافية</div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
