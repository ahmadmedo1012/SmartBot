const items = [
  { text: "تفاعل جديد – 34 إعجاب جديد على منشور مقهى الواحة", time: "منذ 5 د", color: "var(--accent)" },
  { text: "رسالة جديدة – وردت رسالة جديدة من محمد علي", time: "منذ 12 د", color: "var(--info)" },
  { text: "تقرير – 3 تعليقات تحتاج مراجعة في صفحة بيتزا روما", time: "منذ 20 د", color: "var(--danger)" },
  { text: "إعلان – حملة خصم الصيف أوشكت على الانتهاء", time: "منذ ساعة", color: "var(--warn)" },
  { text: "اكتمال – تم نشر جميع المنشورات المجدولة لليوم", time: "منذ ساعتين", color: "var(--success)" },
]

export function Notifications() {
  return (
    <section className="page active">
      <div className="page-header">
        <h1>الإشعارات</h1>
        <p>آخر الإشعارات والتنبيهات</p>
      </div>
      <div className="qactions">
        <button className="btn btn-outline" aria-label="تحديد الكل كمقروء">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          تحديد الكل كمقروء
        </button>
      </div>
      <div className="content-card glass">
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            آخر الإشعارات
          </div>
        </div>
        <div className="activity-list">
          {items.map((n, i) => (
            <div className="activity-item" key={i}>
              <div className="activity-dot" style={{ background: n.color }} />
              <div className="activity-text"><strong style={{ fontWeight: 600 }}>{n.text}</strong></div>
              <div className="activity-time">{n.time}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
