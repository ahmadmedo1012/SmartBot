import { useState, useEffect } from "react"
import { fetchCrmCustomers } from "@/lib/api"

const stageBadge = { lead: "badge-w", prospect: "badge-i", active: "badge-s", churned: "badge-d" }
const stageLabel = { lead: "جديد", prospect: "قيد المتابعة", active: "تم التحويل", churned: "ملغي" }

export function Leads() {
  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCrmCustomers({ per_page: 25 }).then(r => {
      setCustomers(r?.items || [])
      setTotal(r?.total || 0)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
        <div className="mesh-bg"></div>
        <div className="page-header reveal-blur">
          <h1 className="gradient-text">العملاء المتوقعون</h1>
          <p>قائمة العملاء المحتملين من الصفحات</p>
        </div>
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))"}}>
          {[1,2,3].map(i => <div key={i} className="stat-card glass glass-card card-premium card-hover-lift" style={{height:100,background:"var(--skeleton)"}} />)}
        </div>
      </section>
    )
  }

  const newThisWeek = customers.filter(c => c.stage === "lead").length
  const converted = customers.filter(c => c.stage === "active").length

  if (customers.length === 0) {
    return (
      <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
        <div className="mesh-bg"></div>
        <div className="page-header reveal-blur">
          <h1 className="gradient-text">العملاء المتوقعون</h1>
          <p>قائمة العملاء المحتملين من الصفحات</p>
        </div>
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))"}}>
          <div className="stat-card glass glass-card card-premium card-hover-lift"><div className="stat-label">إجمالي</div><div className="stat-value">{total}</div></div>
          <div className="stat-card glass glass-card card-premium card-hover-lift"><div className="stat-label">جديد هذا الأسبوع</div><div className="stat-value" style={{color:"var(--accent)"}}>{newThisWeek}</div></div>
          <div className="stat-card glass glass-card card-premium card-hover-lift"><div className="stat-label">تم التحويل</div><div className="stat-value" style={{color:"var(--success)"}}>{converted}</div></div>
        </div>
        <div className="empty-state" role="status"><p>لا توجد بيانات</p></div>
      </section>
    )
  }

  return (
    <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur">
        <h1 className="gradient-text">العملاء المتوقعون</h1>
        <p>قائمة العملاء المحتملين من الصفحات</p>
      </div>
      <div className="stats-grid stagger-children" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="stat-card glass"><div className="stat-label">إجمالي</div><div className="stat-value">{total}</div></div>
        <div className="stat-card glass"><div className="stat-label">جديد هذا الأسبوع</div><div className="stat-value" style={{ color: "var(--accent)" }}>{newThisWeek}</div></div>
        <div className="stat-card glass"><div className="stat-label">تم التحويل</div><div className="stat-value" style={{ color: "var(--success)" }}>{converted}</div></div>
      </div>
      <div className="card glass glass-card card-premium card-hover-lift table-wrap stagger-children">
        <table>
          <thead><tr><th>الاسم</th><th>الهاتف</th><th>المصدر</th><th>الحالة</th></tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id || c.phone || c.name} style={{transition:"background .15s var(--ease), border-color .15s var(--ease)"}}>
                <td data-label="الاسم">{c.name}</td>
                <td data-label="الهاتف">{c.phone}</td>
                <td data-label="المصدر">{c.source}</td>
                <td data-label="الحالة"><span className={`badge ${stageBadge[c.stage] || "badge-w"}`}>{stageLabel[c.stage] || c.stage}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
