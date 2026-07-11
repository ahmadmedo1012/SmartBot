const connectedPages = [
  { name: "مقهى الواحة", followers: "4,200", lastActive: "منذ ساعة", status: "نشطة", color: "var(--accent)" },
  { name: "مطعم الأصيل", followers: "3,800", lastActive: "منذ 3 ساعات", status: "نشطة", color: "var(--info)" },
  { name: "بيتزا روما", followers: "2,900", lastActive: "منذ يوم", status: "نشطة", color: "var(--success)" },
]

export function Pages() {
  return (
    <section className="page active">
      <div className="page-header">
        <h1>الصفحات</h1>
        <p>إدارة صفحات فيسبوك المتصلة</p>
      </div>
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <div className="stat-card glass"><div className="stat-label">متصلة</div><div className="stat-value" style={{ color: "var(--success)" }}>4</div></div>
        <div className="stat-card glass"><div className="stat-label">إجمالي المتابعين</div><div className="stat-value">12.5ك</div></div>
        <div className="stat-card glass"><div className="stat-label">الإجمالي التفاعل</div><div className="stat-value" style={{ color: "var(--accent)" }}>28%</div></div>
        <div className="stat-card glass"><div className="stat-label">معلقة</div><div className="stat-value">1</div></div>
      </div>
      <div className="content-card glass">
        {connectedPages.map((p) => (
          <div className="post-card" key={p.name}>
            <div className="post-img" style={{ background: p.color }} />
            <div className="post-info">
              <h4>{p.name}</h4>
              <p>{p.followers} متابع · آخر نشاط: {p.lastActive}</p>
            </div>
            <span className="badge badge-s">{p.status}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
