const rules = [
  { name: "رد ترحيبي للرسائل الجديدة", preview: "مرحباً بك! شكراً لتواصلك معنا...", active: true },
  { name: "إشعار استلام الطلب", preview: "تم استلام طلبك، سنقوم بالرد بأسرع وقت...", active: true },
  { name: "رد تلقائي على التعليقات", preview: "شكراً لتعليقك! سنتواصل معك قريباً...", active: false },
]

export function Autoreply() {
  return (
    <section className="page active" dir="rtl" data-od-id="page-autoreply" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="page-header">
        <h1>الردود التلقائية</h1>
        <p>إعدادات الرد الآلي للرسائل والتعليقات</p>
      </div>
      <div className="stats-grid stagger-children" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="stat-card glass"><div className="stat-label">مفعلة</div><div className="stat-value" style={{ color: "var(--success)" }}>12</div></div>
        <div className="stat-card glass"><div className="stat-label">معلقة</div><div className="stat-value">4</div></div>
        <div className="stat-card glass"><div className="stat-label">تم الرد اليوم</div><div className="stat-value" style={{ color: "var(--accent)" }}>89</div></div>
      </div>
      <div className="content-card glass" data-od-id="card-autoreply-rules">
        {rules.map((r) => (
          <div className="activity-item" key={r.name}>
            <label className="toggle">
              <input type="checkbox" defaultChecked={r.active} />
              <span className="tgl-track" />
            </label>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.preview}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
