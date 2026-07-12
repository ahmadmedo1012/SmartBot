const ageGroups = [
  { label: "18–24 سنة", pct: 25, color: "var(--accent)" },
  { label: "25–34 سنة", pct: 38, color: "var(--info)" },
  { label: "35–44 سنة", pct: 22, color: "var(--success)" },
  { label: "45+ سنة", pct: 15, color: "var(--warn)" },
]

export function Analytics() {
  return (
    <section className="page active" dir="rtl" data-od-id="page-analytics" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="page-header">
        <h1>التحليلات</h1>
        <p>بيانات وإحصائيات الأداء</p>
      </div>
      <div className="metrics-row stagger-children">
        <div className="metric-card"><div className="mc-value" style={{ color: "var(--accent)" }}>128.4ك</div><div className="mc-label">إجمالي التفاعلات</div></div>
        <div className="metric-card"><div className="mc-value">8.7ك</div><div className="mc-label">المتابعون</div></div>
        <div className="metric-card"><div className="mc-value" style={{ color: "var(--success)" }}>92%</div><div className="mc-label">معدل التفاعل</div></div>
        <div className="metric-card"><div className="mc-value" style={{ color: "var(--info)" }}>3.2د</div><div className="mc-label">متوسط وقت الرد</div></div>
        <div className="metric-card"><div className="mc-value">64</div><div className="mc-label">منشور هذا الشهر</div></div>
      </div>
      <div className="row-2">
        <div className="card glass" data-od-id="card-analytics-followers">
          <div className="card-title">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="6.5" r="3"/><path d="M2 16.5v-1a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5v1"/><circle cx="13.5" cy="5" r="2.5"/><path d="M18 16.5v-1a4 4 0 0 0-3.5-3.97"/></svg>
            نمو المتابعين
          </div>
          <div className="chart-line">
            <div className="cl-bar" style={{ height: "30%" }}><span className="cl-value">30</span></div>
            <div className="cl-bar" style={{ height: "45%" }}><span className="cl-value">45</span></div>
            <div className="cl-bar" style={{ height: "35%" }}><span className="cl-value">35</span></div>
            <div className="cl-bar" style={{ height: "60%" }}><span className="cl-value">60</span></div>
            <div className="cl-bar" style={{ height: "50%" }}><span className="cl-value">50</span></div>
            <div className="cl-bar" style={{ height: "78%" }}><span className="cl-value">78</span></div>
            <div className="cl-bar" style={{ height: "55%" }}><span className="cl-value">55</span></div>
            <div className="cl-bar" style={{ height: "85%" }}><span className="cl-value">85</span></div>
            <div className="cl-bar" style={{ height: "65%" }}><span className="cl-value">65</span></div>
            <div className="cl-bar" style={{ height: "100%" }}><span className="cl-value">100</span></div>
          </div>
        </div>
        <div className="card glass" data-od-id="card-analytics-age">
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            توزيع الجمهور
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ageGroups.map((b) => (
              <div key={b.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBlockEnd: 4 }}>
                  <span>{b.label}</span><span>{b.pct}%</span>
                </div>
                <div style={{ height: 6, background: "var(--border)", borderRadius: 6 }}>
                  <div style={{ width: `${b.pct}%`, height: "100%", background: b.color, borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
