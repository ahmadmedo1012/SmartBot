import { useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchRules, toggleRule, fetchBotStatus, fetchAiStatus } from "@/lib/api"

export function Autoreply() {
  useEffect(() => { document.title = "الردود التلقائية | SmartBot" }, [])
  const qc = useQueryClient()

  const { data: rules = [], isLoading: rulesLoading, error: rulesError, refetch: refetchRules } = useQuery({
    queryKey: ["rules"],
    queryFn: fetchRules,
  })
  const { data: botStatus } = useQuery({ queryKey: ["bot-status"], queryFn: fetchBotStatus })
  const { data: aiStatus } = useQuery({ queryKey: ["ai-status"], queryFn: fetchAiStatus })

  const toggleMut = useMutation({
    mutationFn: toggleRule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rules"] }) },
  })

  const enabledCount = rules.filter(r => r.enabled).length
  const todayReplies = 0 // ponytail: from bot status if available

  return (
    <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur">
        <h1>الردود التلقائية</h1>
        <p>إعدادات الرد الآلي للرسائل والتعليقات</p>
      </div>

      {rulesLoading ? (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
          {[1,2,3].map(i => <div key={i} className="stat-card glass" style={{height:100,background:"var(--skeleton)"}} />)}
        </div>
      ) : (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
          <div className="stat-card glass">
            <div className="stat-label">مفعلة</div>
            <div className="stat-value" style={{color:"var(--success)"}}>{enabledCount}</div>
          </div>
          <div className="stat-card glass">
            <div className="stat-label">إجمالي القواعد</div>
            <div className="stat-value">{rules.length}</div>
          </div>
          <div className="stat-card glass">
            <div className="stat-label">حالة البوت</div>
            <div className="stat-value" style={{color: botStatus?.running ? "var(--success)" : "var(--warn)"}}>
              {botStatus?.running ? "يعمل" : "متوقف"}
            </div>
            <div className="stat-change">الذكاء الاصطناعي: {aiStatus?.available ? "مفعل" : "غير مفعل"}</div>
          </div>
        </div>
      )}

      <div className="content-card glass" style={{marginBlockStart:16}}>
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            قواعد الرد
          </div>
        </div>
        {rulesLoading ? (
          [1,2,3].map(i => <div key={i} className="activity-item"><div style={{flex:1,height:32,background:"var(--skeleton)",borderRadius:6}} /></div>)
        ) : rulesError ? (
          <div className="activity-item" style={{justifyContent:"center"}}>
            <p style={{color:"var(--muted)",fontSize:13}}>فشل تحميل القواعد — <button className="btn btn-outline" style={{padding:"4px 12px",fontSize:12}} onClick={() => refetchRules()}>إعادة المحاولة</button></p>
          </div>
        ) : rules.length === 0 ? (
          <div className="empty-state" style={{padding:24}}>
            <p>لا توجد قواعد رد — أضف قاعدة جديدة من صفحة الإعدادات</p>
          </div>
        ) : (
          rules.map(r => (
            <div className="activity-item" key={r.id} style={{transition:"background .15s var(--ease), border-color .15s var(--ease)"}}>
              <label className="toggle">
                <input type="checkbox" checked={r.enabled} onChange={() => toggleMut.mutate(r.id)} />
                <span className="tgl-track" />
              </label>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{r.name}</div>
                <div style={{fontSize:11,color:"var(--muted)"}}>{r.reply_template?.slice(0,60)}{(r.reply_template?.length || 0) > 60 ? "..." : ""}</div>
                {r.replies_count > 0 && <div style={{fontSize:11,color:"var(--accent)",marginBlockStart:2}}>{r.replies_count} رد</div>}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
