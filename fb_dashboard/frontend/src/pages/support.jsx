import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchDiagnosticsStatus, fetchHealthAlerts } from "@/lib/api"

const resourceLinks = [
  { label: "توثيق فيسبوك للمطورين", url: "https://developers.facebook.com/docs/pages/", color: "var(--accent)" },
  { label: "دليل إعداد Webhook", url: "https://developers.facebook.com/docs/graph-api/webhooks/getting-started/", color: "var(--info)" },
  { label: "مركز مساعدة فيسبوك للصفحات", url: "https://www.facebook.com/help/pages", color: "var(--success)" },
  { label: "توثيق Graph API", url: "https://developers.facebook.com/docs/graph-api/", color: "var(--warn)" },
  { label: "الإبلاغ عن مشكلة", url: "https://www.facebook.com/help/contact/", color: "var(--danger)" },
]

export function Support() {
  useEffect(() => { document.title = "الدعم الفني | SmartBot" }, [])
  const { data: diag, isLoading: diagLoading } = useQuery({
    queryKey: ["diagnostics-status"],
    queryFn: fetchDiagnosticsStatus,
  })
  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["health-alerts"],
    queryFn: fetchHealthAlerts,
  })

  const isLoading = diagLoading || alertsLoading

  return (
    <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
      <div className="mesh-bg"></div>
      <div className="page-header" style={{animation:"reveal-blur 0.5s cubic-bezier(0.16,1,0.3,1) both"}}>
        <h1 className="gradient-text">الدعم الفني</h1>
        <p>حالة النظام وموارد المساعدة</p>
      </div>

      {isLoading ? (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
          {[1,2,3].map(i => <div key={i} className="stat-card glass" style={{height:100,background:"var(--skeleton)"}} />)}
        </div>
      ) : (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
          <div className="stat-card glass glass-card card-premium card-hover-lift" style={{animation:"reveal-card 0.5s cubic-bezier(0.16,1,0.3,1) both"}}>
            <div className="stat-label">حالة النظام</div>
            <div className="stat-value" style={{color:"var(--success)",fontSize:18}}>
              {diag?.system?.python ? "متصل" : "—"}
            </div>
            <div className="stat-change">بايثون {diag?.system?.python || "—"}</div>
          </div>
          <div className="stat-card glass glass-card card-premium card-hover-lift" style={{animation:"reveal-card 0.5s cubic-bezier(0.16,1,0.3,1) both"}}>
            <div className="stat-label">دورات البوت</div>
            <div className="stat-value" style={{color:"var(--accent)"}}>{diag?.cycles?.count || 0}</div>
            <div className="stat-change">آخر دورة: {diag?.cycles?.last_ms || 0}ms</div>
          </div>
          <div className="stat-card glass glass-card card-premium card-hover-lift" style={{animation:"reveal-card 0.5s cubic-bezier(0.16,1,0.3,1) both"}}>
            <div className="stat-label">معدل الأخطاء</div>
            <div className="stat-value" style={{color: (diag?.errors?.rate_pct || 0) > 5 ? "var(--danger)" : "var(--success)"}}>
              {diag?.errors?.rate_pct || 0}%
            </div>
            <div className="stat-change">{diag?.errors?.recent?.length || 0} خطأ حديث</div>
          </div>
        </div>
      )}

      {alerts && alerts.length > 0 && (
        <div className="content-card glass" style={{marginBlockStart:16}}>
          <div className="cc-header">
            <div className="cc-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              التنبيهات النشطة
            </div>
          </div>
          <div className="activity-list">
            {alerts.map(a => (
              <div key={a.id} className="activity-item">
                <div className="activity-dot" style={{background: a.severity === "critical" ? "var(--danger)" : "var(--warn)"}} />
                <div className="activity-text"><strong style={{fontWeight:600}}>{a.alert_type}</strong> — {a.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="content-card glass" style={{marginBlockStart:16}}>
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            روابط مفيدة
          </div>
        </div>
        <div className="activity-list">
          {resourceLinks.map((l, i) => (
            <div className="activity-item" key={i} style={{transition:"background .15s var(--ease), border-color .15s var(--ease)"}}>
              <div className="activity-dot" style={{background:l.color}} />
              <div className="activity-text">
                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{fontWeight:600,color:"var(--text)"}}>
                  {l.label}
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
