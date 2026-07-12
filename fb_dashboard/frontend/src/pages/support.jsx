const faqs = [
  { q: "كيف أربط صفحة جديدة؟", a: "اذهب إلى الصفحات ← إضافة صفحة", color: "var(--accent)" },
  { q: "كم عدد الصفحات المسموح بها؟", a: "حتى 10 صفحات في الباقة الاحترافية", color: "var(--info)" },
  { q: "كيف ألغي الاشتراك؟", a: "الإعدادات ← إدارة الاشتراك", color: "var(--success)" },
]

export function Support() {
  return (
    <section className="page active" dir="rtl" data-od-id="page-support" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="page-header">
        <h1>الدعم الفني</h1>
        <p>تواصل مع فريق الدعم والمساعدة</p>
      </div>
      <div className="stats-grid stagger-children" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="stat-card glass" data-od-id="support-tickets"><div className="stat-label">التذاكر المفتوحة</div><div className="stat-value" style={{ color: "var(--accent)" }}>2</div></div>
        <div className="stat-card glass" data-od-id="support-resolved"><div className="stat-label">تم الحل هذا الأسبوع</div><div className="stat-value" style={{ color: "var(--success)" }}>5</div></div>
        <div className="stat-card glass" data-od-id="support-response-time"><div className="stat-label">متوسط وقت الرد</div><div className="stat-value" style={{ color: "var(--info)" }}>3 ساعات</div></div>
      </div>
      <div className="content-card glass" data-od-id="card-support-faq">
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            الأسئلة الشائعة
          </div>
        </div>
        <div className="activity-list">
          {faqs.map((f, i) => (
            <div className="activity-item" key={i}>
              <div className="activity-dot" style={{ background: f.color }} />
              <div className="activity-text"><strong style={{ fontWeight: 600 }}>{f.q}</strong> – {f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
