import { useState, useEffect } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { fetchStats, fetchAnalyticsOverview, fetchDailyTrend } from "@/lib/api"

function formatNum(n) {
  if (n == null) return "—"
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M"
  if (n >= 1000) return (n / 1000).toFixed(1) + "k"
  return n.toLocaleString()
}

const barProps = { radius: [4, 4, 0, 0], maxBarSize: 32 }

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
    return Object.entries(raw).map(([d, c]) => ({ label: d.slice(5), count: c })).slice(-14)
  })()

  const topRules = (overview?.top_rules || []).slice(0, 6)
  const peakHr = overview?.peak_hour != null ? `${overview.peak_hour}:00` : null

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload?.length) {
      return <div className="glass" style={{ padding: "6px 10px", fontSize: 12, borderRadius: 8 }}>{label}: {payload[0].value}</div>
    }
    return null
  }

  return (
    <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur">
        <h1 className="gradient-text">التحليلات</h1>
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
          <div className="metric-card"><div className="mc-value">{formatNum(topRules.length)}</div><div className="mc-label">القواعد النشطة</div></div>
        </div>
      )}

      <div className="row-2 stagger-children">
        <div className="card glass glass-card card-premium card-hover-lift reveal-up">
          <div className="cc-header">
            <div className="cc-title">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              النشاط اليومي
            </div>
          </div>
          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 8, right: 0, bottom: 4, left: 0 }} barCategoryGap="25%">
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--border)" }} />
                <Bar dataKey="count" fill="var(--accent)" {...barProps} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: "32px 0" }}>
              <h2>بيانات غير كافية</h2>
              <p>سيظهر الرسم البياني عند توفر بيانات كافية</p>
            </div>
          )}
        </div>
        <div className="card glass glass-card card-premium card-hover-lift reveal-up">
          <div className="cc-header">
            <div className="cc-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              توزيع الردود — آخر 30 يوماً
            </div>
          </div>
          {topRules.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={topRules.map(r => ({ name: `#${r.rule_id}`, count: r.count }))} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }} barCategoryGap={8}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--border)" }} />
                <Bar dataKey="count" fill="var(--accent)" {...barProps} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 13 }}>لا توجد بيانات كافية</div>
          )}
        </div>
      </div>
    </section>
  )
}
