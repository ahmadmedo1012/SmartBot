import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchAdAccounts, fetchCampaigns } from "@/lib/api"

const statusLabels = {
  1: "نشط", 2: "محظور", 3: "معلق", 4: "غير نشط", 7: "مؤرشف", 8: "حذف", 9: "قيد المراجعة",
}
const statusColors = {
  1: "badge-s", 2: "badge-d", 3: "badge-w", 4: "badge-w", 7: "badge-w", 8: "badge-d", 9: "badge-i",
}

export function Ads({ role }) {
  useEffect(() => { document.title = "الإعلانات | SmartBot" }, [])
  const isAdmin = role === "admin"
  const isEditor = role === "admin" || role === "editor"
  const { data: accounts = [], isLoading: acctsLoading, error: acctsError, refetch: refetchAccs } = useQuery({
    queryKey: ["ad-accounts"], queryFn: fetchAdAccounts, enabled: isAdmin,
  })
  const [selectedAccount, setSelectedAccount] = useState(null)
  const { data: campaigns = [], isLoading: campLoading, error: campError, refetch: refetchCamp } = useQuery({
    queryKey: ["ads-campaigns", selectedAccount],
    queryFn: () => fetchCampaigns(selectedAccount),
    enabled: !!selectedAccount && isEditor,
  })

  if (!isAdmin) {
    return (
      <section className="page active" dir="rtl" style={{position:"relative"}}>
        <div className="mesh-bg"></div>
        <div className="page-header"><h1>الإعلانات</h1><p>إدارة حملات فيسبوك الإعلانية</p></div>
        <div className="content-card glass" style={{textAlign:"center",padding:40}}>
          <p>غير مصرح — إدارة الإعلانات متاحة للمدير فقط</p>
        </div>
      </section>
    )
  }

  return (
    <section className="page active" dir="rtl" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="page-header">
        <h1>الإعلانات</h1>
        <p>إدارة حملات فيسبوك الإعلانية</p>
      </div>

      {acctsLoading ? (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))"}}>
          {[1,2].map(i => <div key={i} className="stat-card glass" style={{height:120,background:"var(--skeleton)"}} />)}
        </div>
      ) : acctsError ? (
        <div className="card glass" style={{textAlign:"center",padding:40}}>
          <p style={{color:"var(--muted)",marginBlockEnd:12}}>فشل تحميل حسابات الإعلانات</p>
          <button className="btn btn-outline" onClick={() => refetchAccs()}>إعادة المحاولة</button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="empty-state">
          <p>لا توجد حسابات إعلانات — يجب ربط حساب إعلانات فيسبوك أولاً</p>
        </div>
      ) : (
        <div className="stats-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))"}}>
          {accounts.map(acc => {
            const badgeCls = statusColors[acc.account_status] || "badge-w"
            const statusLbl = statusLabels[acc.account_status] || "غير معروف"
            const sel = selectedAccount === acc.id?.replace("act_", "")
            return (
              <div key={acc.id} className={`stat-card glass ${sel ? "stat-card-active" : ""}`}
                style={{cursor:"pointer",border: sel ? "2px solid var(--accent)" : undefined}}
                onClick={() => setSelectedAccount(acc.id?.replace("act_", ""))}>
                <div className="stat-label">{acc.name || "حساب إعلانات"}</div>
                <div className="stat-value" style={{fontSize:14,fontFamily:"monospace"}}>{acc.id}</div>
                <span className={`badge ${badgeCls}`} style={{marginBlockStart:8,display:"inline-block"}}>{statusLbl}</span>
                <div className="stat-change" style={{marginBlockStart:8}}>العملة: {acc.currency || "—"} · الإنفاق: {acc.amount_spent || "0"}</div>
              </div>
            )
          })}
        </div>
      )}

      {selectedAccount && (
        <>
          <div className="page-header" style={{marginBlockStart:24}}>
            <h2 style={{fontSize:16}}>الحملات الإعلانية</h2>
          </div>
          {campLoading ? (
            <div className="stats-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))"}}>
              {[1,2,3,4].map(i => <div key={i} className="stat-card glass" style={{height:100,background:"var(--skeleton)"}} />)}
            </div>
          ) : campError ? (
            <div className="card glass" style={{textAlign:"center",padding:40}}>
              <p style={{color:"var(--muted)",marginBlockEnd:12}}>فشل تحميل الحملات</p>
              <button className="btn btn-outline" onClick={() => refetchCamp()}>إعادة المحاولة</button>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="empty-state" role="status"><p>لا توجد حملات في هذا الحساب</p></div>
          ) : (
            <div className="stats-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))"}}>
              {campaigns.map(c => (
                <div key={c.id} className="stat-card glass">
                  <div className="stat-label">{c.name}</div>
                  <div className="stat-change">الهدف: {c.objective || "—"}</div>
                  <div className="stat-change">المجموعات: {c.adsets?.data?.length || 0}</div>
                  <div className="stat-change" style={{fontFamily:"monospace"}}>{c.created_time?.slice(0,10) || ""}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <div className="mobile-nav-spacer" />
    </section>
  )
}
