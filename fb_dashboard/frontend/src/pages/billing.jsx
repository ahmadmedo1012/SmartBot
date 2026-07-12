import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchSystemStats } from "@/lib/api"

export function Billing() {
  useEffect(() => { document.title = "إحصائيات النظام | SmartBot" }, [])
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["system-stats"],
    queryFn: fetchSystemStats,
  })

  return (
    <section className="page active" dir="rtl" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="page-header">
        <h1>إحصائيات النظام</h1>
        <p>ملخص استخدام النظام وإحصائيات الأداء</p>
      </div>

      {isLoading ? (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
          {[1,2,3].map(i => <div key={i} className="stat-card glass" style={{height:100,background:"var(--skeleton)"}} />)}
        </div>
      ) : error ? (
        <div className="card glass" style={{textAlign:"center",padding:40}}>
          <p style={{color:"var(--muted)"}}>فشل تحميل إحصائيات النظام</p>
        </div>
      ) : !stats ? (
        <div className="empty-state" role="status"><p>لا توجد إحصائيات متاحة بعد</p></div>
      ) : (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
          <div className="stat-card glass">
            <div className="stat-label">إجمالي الردود</div>
            <div className="stat-value" style={{fontSize:20,color:"var(--accent)"}}>{stats.reply_count?.toLocaleString() || 0}</div>
          </div>
          <div className="stat-card glass">
            <div className="stat-label">قواعد الرد</div>
            <div className="stat-value" style={{fontSize:20,color:"var(--success)"}}>{stats.rule_count || 0}</div>
          </div>
          <div className="stat-card glass">
            <div className="stat-label">المستخدمون</div>
            <div className="stat-value" style={{fontSize:20}}>{stats.user_count || 0}</div>
          </div>
        </div>
      )}

      <div className="card glass table-wrap" style={{marginBlockStart:16}}>
        <table>
          <thead><tr><th>الخاصية</th><th>القيمة</th></tr></thead>
          <tbody>
            <tr><td data-label="الخاصية">إصدار النظام</td><td data-label="القيمة">{stats?.version || "—"}</td></tr>
            <tr><td data-label="الخاصية">حجم قاعدة البيانات</td><td data-label="القيمة">{stats?.db_size || "—"}</td></tr>
            <tr><td data-label="الخاصية">إجمالي الردود</td><td data-label="القيمة">{stats?.reply_count?.toLocaleString() || 0}</td></tr>
            <tr><td data-label="الخاصية">قواعد الرد النشطة</td><td data-label="القيمة">{stats?.rule_count || 0}</td></tr>
            <tr><td data-label="الخاصية">المستخدمون المسجلون</td><td data-label="القيمة">{stats?.user_count || 0}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="content-card glass" style={{marginBlockStart:16}}>
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            ملاحظة
          </div>
        </div>
        <div className="post-card">
          <div className="post-info">
            <p style={{fontSize:13,color:"var(--muted)"}}>هذه الإحصائيات تعرض بيانات استخدام النظام الحقيقية. نظام الفوترة والاشتراكات قيد التطوير — سيتم إضافته في تحديث قادم.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
