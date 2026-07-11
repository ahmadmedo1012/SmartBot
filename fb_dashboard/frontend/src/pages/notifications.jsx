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
        <button className="btn btn-outline">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          تحديد الكل كمقروء
        </button>
      </div>
      <div className="card glass">
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
