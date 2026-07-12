import { useNotifications } from "@/hooks/use-notifications"

const TYPE_COLORS = {
  reply: "var(--accent)",
  bot_started: "var(--accent)",
  error: "var(--danger)",
  bot_stopped: "var(--danger)",
  warning: "var(--warn)",
  alert: "var(--warn)",
  success: "var(--success)",
  info: "var(--info)",
  webhook: "var(--info)",
}

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

export function Notifications() {
  const { notifications, markAllRead } = useNotifications()

  return (
    <section className="page active" dir="rtl" data-od-id="page-notifications" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="page-header">
        <h1>الإشعارات</h1>
        <p>آخر الإشعارات والتنبيهات</p>
      </div>
      <div className="qactions">
        <button className="btn btn-outline" aria-label="تحديد الكل كمقروء" onClick={markAllRead}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          تحديد الكل كمقروء
        </button>
      </div>
      <div className="content-card glass stagger-children" data-od-id="card-notifications-list">
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            آخر الإشعارات
          </div>
        </div>
        {notifications.length === 0 ? (
          <div className="activity-empty" role="status">لا توجد إشعارات</div>
        ) : (
          <div className="activity-list">
            {notifications.map(n => (
              <div className="activity-item" key={n.id} data-od-id={`notification-${n.id}`}>
                <div className="activity-dot" style={{ background: TYPE_COLORS[n.type] || "var(--info)" }} />
                <div className="activity-text">
                  <strong style={{ fontWeight: 600 }}>
                    {n.title}{n.title && n.message ? " – " : ""}{n.message}
                  </strong>
                </div>
                <div className="activity-time">{relativeTime(n.timestamp)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
