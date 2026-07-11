const people = [
  { name: "سارة أحمد", status: "نشط", badge: "badge-s", detail: "نشط منذ 5 دقائق · 23 تفاعل هذا الشهر", color: "var(--accent)" },
  { name: "محمد علي", status: "نشط", badge: "badge-s", detail: "نشط منذ ساعة · 15 تفاعل هذا الشهر", color: "var(--info)" },
  { name: "أحمد حسن", status: "غير نشط", badge: "badge-w", detail: "غير نشط منذ يومين · 3 تفاعلات هذا الشهر", color: "var(--muted)" },
  { name: "نورة خالد", status: "مميز", badge: "badge-a", detail: "نشط منذ 10 دقائق · 45 تفاعل هذا الشهر", color: "var(--success)" },
]

export function Audience() {
  return (
    <section className="page active">
      <div className="page-header">
        <h1>الجمهور</h1>
        <p>قاعدة متابعيك – إدارة الجمهور</p>
      </div>
      <div className="qactions">
        <button className="btn btn-outline" aria-label="تصدير البيانات">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          تصدير
        </button>
        <button className="btn btn-outline" aria-label="تصفية الجمهور">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          تصفية
        </button>
      </div>
      <div className="content-card glass">
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            الجمهور النشط
          </div>
        </div>
        {people.map((p) => (
          <div className="person-row" key={p.name}>
            <div className="person-avatar" style={{ background: p.color }} />
            <div className="person-info">
              <div className="p-name">{p.name}</div>
              <div className="p-detail">{p.detail}</div>
            </div>
            <span className={`badge ${p.badge}`}>{p.status}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
