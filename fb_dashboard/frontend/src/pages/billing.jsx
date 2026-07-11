const invoices = [
  { date: "1 يوليو 2026", desc: "الباقة الاحترافية – يوليو", amount: "150 ل.د", badge: "badge-s", status: "مدفوع" },
  { date: "1 يونيو 2026", desc: "الباقة الاحترافية – يونيو", amount: "150 ل.د", badge: "badge-s", status: "مدفوع" },
  { date: "1 مايو 2026", desc: "الباقة التأسيسية – مايو", amount: "75 ل.د", badge: "badge-s", status: "مدفوع" },
]

export function Billing() {
  return (
    <section className="page active">
      <div className="page-header">
        <h1>الفواتير</h1>
        <p>إدارة الاشتراكات والمدفوعات</p>
      </div>
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="stat-card glass"><div className="stat-label">الباقة الحالية</div><div className="stat-value" style={{ fontSize: 20 }}>الباقة الاحترافية</div></div>
        <div className="stat-card glass"><div className="stat-label">تاريخ التجديد</div><div className="stat-value" style={{ fontSize: 20 }}>1 أغسطس 2026</div></div>
        <div className="stat-card glass"><div className="stat-label">المبلغ</div><div className="stat-value" style={{ fontSize: 20 }}>150 ل.د/شهر</div></div>
      </div>
      <div className="card glass table-wrap">
        <table>
          <thead><tr><th>التاريخ</th><th>الوصف</th><th>المبلغ</th><th>الحالة</th></tr></thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.date + inv.desc}>
                <td data-label="التاريخ">{inv.date}</td>
                <td data-label="الوصف">{inv.desc}</td>
                <td data-label="المبلغ">{inv.amount}</td>
                <td data-label="الحالة"><span className={`badge ${inv.badge}`}>{inv.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
