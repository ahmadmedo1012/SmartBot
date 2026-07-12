import { useState, useEffect } from "react"
import { fetchSubscribers } from "@/lib/api"

const badgeClass = (s) => {
  if (s === "active" || s === "نشط") return "badge-s"
  if (s === "inactive" || s === "غير نشط") return "badge-w"
  if (s === "premium" || s === "مميز") return "badge-a"
  return "badge-w"
}

const statusText = (s) => {
  if (s === "active") return "نشط"
  if (s === "inactive") return "غير نشط"
  if (s === "premium") return "مميز"
  return s
}

export function Audience() {
  const [subs, setSubs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSubscribers({ per_page: 50 })
      .then((r) => { setSubs(r?.items || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <section className="page active" dir="rtl" style={{position:"relative"}}>
        <div className="mesh-bg"></div>
        <div className="page-header">
          <h1>الجمهور</h1>
          <p>قاعدة متابعيك – إدارة الجمهور</p>
        </div>
        <div className="content-card glass stagger-children">
          <div className="cc-header"><div className="cc-title" style={{height:18,width:100,background:"var(--skeleton)",borderRadius:6}} /></div>
          {[1,2,3].map(i => (
            <div className="person-row" key={i}>
              <div className="person-avatar" style={{background:"var(--skeleton)"}} />
              <div className="person-info">
                <div className="p-name" style={{height:14,width:"40%",background:"var(--skeleton)",borderRadius:6}} />
                <div className="p-detail" style={{height:12,width:"60%",background:"var(--skeleton)",borderRadius:6,marginBlockStart:4}} />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="page active" dir="rtl" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
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
      <div className="content-card glass stagger-children">
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            الجمهور النشط
          </div>
        </div>
        {subs.length === 0 ? (
          <p className="empty-state">لا يوجد مشتركون بعد</p>
        ) : subs.map((sub) => (
          <div className="person-row" key={sub.id || sub.name}>
            <div className="person-avatar" style={{ background: sub.avatar_color || "var(--accent)" }} />
            <div className="person-info">
              <div className="p-name">{sub.name}</div>
              <div className="p-detail">
                {sub.last_interaction_at
                  ? `آخر تفاعل: ${new Date(sub.last_interaction_at).toLocaleDateString("ar-EG")}`
                  : `${sub.reply_count || 0} تفاعل`}
              </div>
            </div>
            <span className={`badge ${badgeClass(sub.status)}`}>{statusText(sub.status)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
