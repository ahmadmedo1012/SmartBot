import { useState, useEffect } from "react"
import { fetchRecentActivity, fetchLogs } from "@/lib/api"

function relativeTime(iso) {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return "الآن"
  const m = Math.floor(s / 60)
  if (m < 60) return `منذ ${m} د`
  const h = Math.floor(m / 60)
  if (h < 24) return `منذ ${h} س`
  const d = Math.floor(h / 24)
  if (d < 30) return `منذ ${d} ي`
  return new Date(iso).toLocaleDateString("ar-SA")
}

const TYPE_COLORS = {
  reply: "var(--accent)",
  log: "var(--muted)",
  ERROR: "var(--danger)",
  WARN: "var(--warn)",
  INFO: "var(--info)",
  bot_status: "var(--success)",
}

export function Activity() {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchRecentActivity(25).catch(() => []),
      fetchLogs(25).catch(() => []),
    ]).then(([recent, logs]) => {
      const merged = [
        ...(recent || []).map(a => ({ ...a, _src: "activity" })),
        ...(logs || []).map(l => ({
          type: "log",
          level: l.level,
          text: l.message,
          time: l.created_at,
          _src: "log",
        })),
      ]
      merged.sort((a, b) => ((b.time || "") > (a.time || "") ? 1 : -1))
      setActivities(merged.slice(0, 50))
      setLoading(false)
    })
  }, [])

  return (
    <section className="page active" dir="rtl" data-od-id="page-activity" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="page-header">
        <h1>سجل النشاطات</h1>
        <p>جميع الأحداث والنشاطات على الصفحات</p>
      </div>
      <div className="content-card glass stagger-children" data-od-id="card-activity-log">
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            آخر الأحداث
          </div>
        </div>
        {loading ? (
          <div className="activity-list" role="status">
            {[1,2,3,4,5].map(i => (
              <div className="activity-item" key={i}>
                <div className="skeleton skeleton-circle" style={{ width: 8, height: 8, borderRadius: "50%", marginBlockStart: 6 }} />
                <div className="skeleton skeleton-text" style={{ width: `${60 + i * 8}%` }} />
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="empty-state" style={{ padding: "32px 0" }}>
            <h2>لا توجد نشاطات بعد</h2>
            <p>عند حدوث نشاط على صفحتك، سيظهر هنا</p>
          </div>
        ) : (
          <div className="activity-list">
            {activities.map((a, i) => (
              <div className="activity-item" key={i} data-od-id={`activity-${i}`}>
                <div className="activity-dot" style={{ background: TYPE_COLORS[a.level] || TYPE_COLORS[a.type] || "var(--muted)" }} />
                <div className="activity-text">
                  <strong style={{ fontWeight: 600 }}>{a.level === "ERROR" ? "⚠️ " : ""}{a.text}</strong>
                  {a.detail ? <span style={{ color: "var(--muted)", fontSize: 12, display: "block" }}>{a.detail}</span> : null}
                </div>
                <div className="activity-time">{relativeTime(a.time)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
