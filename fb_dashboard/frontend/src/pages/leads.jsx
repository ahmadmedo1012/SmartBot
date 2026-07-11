const leads = [
  { name: "خالد عمران", phone: "0912345678", source: "فيسبوك ماسنجر", statusBadge: "badge-w", status: "جديد" },
  { name: "سليم العربي", phone: "0922334455", source: "إعلان فيسبوك", statusBadge: "badge-i", status: "تم التواصل" },
  { name: "مريم الفيتوري", phone: "0911223344", source: "تعليق على منشور", statusBadge: "badge-s", status: "تم التحويل" },
  { name: "عبدالله الزوي", phone: "0933445566", source: "فيسبوك ماسنجر", statusBadge: "badge-w", status: "جديد" },
]

export function Leads() {
  return (
    <section className="page active" dir="rtl">
      <div className="page-header">
        <h1>العملاء المتوقعون</h1>
        <p>قائمة العملاء المحتملين من الصفحات</p>
      </div>
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="stat-card glass"><div className="stat-label">إجمالي</div><div className="stat-value">37</div></div>
        <div className="stat-card glass"><div className="stat-label">جديد هذا الأسبوع</div><div className="stat-value" style={{ color: "var(--accent)" }}>12</div></div>
        <div className="stat-card glass"><div className="stat-label">تم التحويل</div><div className="stat-value" style={{ color: "var(--success)" }}>8</div></div>
      </div>
      <div className="card glass table-wrap">
        <table>
          <thead><tr><th>الاسم</th><th>الهاتف</th><th>المصدر</th><th>الحالة</th></tr></thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.name}>
                <td data-label="الاسم">{l.name}</td>
                <td data-label="الهاتف">{l.phone}</td>
                <td data-label="المصدر">{l.source}</td>
                <td data-label="الحالة"><span className={`badge ${l.statusBadge}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
