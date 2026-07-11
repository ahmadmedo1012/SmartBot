const activities = [
  { text: "تم نشر منشور – عرض نهاية الأسبوع على صفحة مقهى الواحة", time: "منذ 10 د", color: "var(--accent)" },
  { text: "تم الرد على رسالة – سارة أحمد عبر ماسنجر", time: "منذ 25 د", color: "var(--info)" },
  { text: "تم جدولة منشور – وصفة جديدة ليوم الجمعة", time: "منذ ساعة", color: "var(--success)" },
  { text: "تم حظر تعليق – تعليق غير مناسب على صفحة مطعم الأصيل", time: "منذ ساعتين", color: "var(--warn)" },
  { text: "فشل إرسال رسالة – البث الجماعي: خطأ في الاتصال", time: "منذ 3 ساعات", color: "var(--danger)" },
]

export function Activity() {
  return (
    <section className="page active">
      <div className="page-header">
        <h1>سجل النشاطات</h1>
        <p>جميع الأحداث والنشاطات على الصفحات</p>
      </div>
      <div className="content-card glass">
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            آخر الأحداث
          </div>
        </div>
        <div className="activity-list">
          {activities.map((a, i) => (
            <div className="activity-item" key={i}>
              <div className="activity-dot" style={{ background: a.color }} />
              <div className="activity-text"><strong style={{ fontWeight: 600 }}>{a.text}</strong></div>
              <div className="activity-time">{a.time}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
