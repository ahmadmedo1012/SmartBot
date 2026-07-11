export function Tools() {
  return (
    <section className="page active">
      <div className="page-header">
        <h1>الأدوات</h1>
        <p>أدوات مساعدة لإدارة الصفحات</p>
      </div>
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <div className="stat-card glass" style={{ cursor: "pointer" }}>
          <div className="stat-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <div className="stat-label">تصميم صور</div>
          <div className="stat-change">أنشئ صوراً احترافية</div>
        </div>
        <div className="stat-card glass" style={{ cursor: "pointer" }}>
          <div className="stat-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>
            </svg>
          </div>
          <div className="stat-label">تقصير الروابط</div>
          <div className="stat-change">حوِّل روابطك إلى روابط قصيرة</div>
        </div>
        <div className="stat-card glass" style={{ cursor: "pointer" }}>
          <div className="stat-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </div>
          <div className="stat-label">محلل المنافسين</div>
          <div className="stat-change">حلل أداء منافسيك</div>
        </div>
        <div className="stat-card glass" style={{ cursor: "pointer" }}>
          <div className="stat-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <div className="stat-label">مُحسِّن النصوص</div>
          <div className="stat-change">كتابة إعلانية باحترافية</div>
        </div>
      </div>
    </section>
  )
}
