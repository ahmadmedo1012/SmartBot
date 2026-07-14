import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchAnalyticsOverview } from "@/lib/api"

export function Marketing() {
  useEffect(() => { document.title = "التسويق | SmartBot" }, [])
  const { data: overview, isLoading, error } = useQuery({
    queryKey: ["analytics-overview", 30],
    queryFn: () => fetchAnalyticsOverview(30),
  })

  return (
    <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur">
        <h1 >التسويق</h1>
        <p>بيانات التحليلات والتسويق من الصفحة المتصلة</p>
      </div>

      {isLoading ? (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))"}}>
          {[1,2,3].map(i => <div key={i} className="stat-card glass glass-card card-premium card-hover-lift" style={{height:100,background:"var(--skeleton)"}} />)}
        </div>
      ) : error ? (
        <div className="content-card glass glass-card card-premium card-hover-lift" style={{textAlign:"center",padding:40}}>
          <p style={{color:"var(--muted)"}}>فشل تحميل بيانات التسويق — تأكد من اتصال الصفحة بفيسبوك</p>
        </div>
      ) : (
        <>
          <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))"}}>
            <div className="stat-card glass glass-card card-premium card-hover-lift">
              <div className="stat-label">معجبين الصفحة</div>
              <div className="stat-value" style={{color:"var(--accent)"}}>{overview?.fan_count?.toLocaleString() || "—"}</div>
            </div>
            <div className="stat-card glass glass-card card-premium card-hover-lift">
              <div className="stat-label">ردود (آخر 30 يوم)</div>
              <div className="stat-value" style={{color:"var(--success)"}}>{overview?.total_replies?.toLocaleString() || 0}</div>
            </div>
            <div className="stat-card glass glass-card card-premium card-hover-lift">
              <div className="stat-label">ردود اليوم</div>
              <div className="stat-value" style={{color:"var(--info)"}}>{overview?.today_replies || 0}</div>
            </div>
          </div>

          {overview?.top_rules?.length > 0 && (
            <div className="content-card glass glass-card card-premium card-hover-lift stagger-children" style={{marginBlockStart:16}}>
              <div className="cc-header">
                <div className="cc-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  أفضل قواعد الرد
                </div>
              </div>
              <div className="post-card">
                <div className="post-info">
                  <p style={{fontSize:13,color:"var(--muted)"}}>أكثر القواعد تفعيلاً في آخر 30 يوم — البيانات من لوحة التحليلات</p>
                </div>
              </div>
              {overview.top_rules.map((r, i) => (
                <div key={r.rule_id} className="activity-item" style={{transition:"background .15s var(--ease), border-color .15s var(--ease)"}}>
                  <div className="activity-dot" style={{background:["var(--accent)","var(--info)","var(--success)","var(--warn)","var(--danger)"][i%5]}} />
                  <div className="activity-text"><strong style={{fontWeight:600}}>القاعدة #{r.rule_id}</strong> — {r.count} رد</div>
                </div>
              ))}
            </div>
          )}

          {overview?.peak_hour != null && (
            <div className="content-card glass glass-card card-premium card-hover-lift" style={{marginBlockStart:16}}>
              <div className="cc-header">
                <div className="cc-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  ساعة الذروة
                </div>
              </div>
              <div className="post-card">
                <div className="post-info">
                  <h3>الساعة {overview.peak_hour}:00</h3>
                  <p>أكثر الأوقات نشاطاً في التفاعل — بيانات من التحليلات</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
