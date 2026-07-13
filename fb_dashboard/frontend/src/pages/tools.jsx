import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchDiagnosticsPermissions, postDemoTestComment } from "@/lib/api"

export function Tools() {
  useEffect(() => { document.title = "الأدوات التشخيصية | SmartBot" }, [])
  const [testInput, setTestInput] = useState("")
  const [testResult, setTestResult] = useState(null)
  const [testLoading, setTestLoading] = useState(false)
  const [testError, setTestError] = useState("")

  const { data: perms, isLoading: permsLoading } = useQuery({
    queryKey: ["diagnostics-permissions"],
    queryFn: fetchDiagnosticsPermissions,
  })

  if (permsLoading) {
    return (
      <section className="page active" dir="rtl" style={{position:"relative"}}>
        <div className="mesh-bg"></div>
        <div className="page-header reveal-blur">
          <h1>الأدوات التشخيصية</h1>
          <p>اختبار وتحليل أداء النظام</p>
        </div>
        <div className="content-card glass">
          <div className="cc-header"><div className="cc-title" style={{height:18,width:120,background:"var(--skeleton)",borderRadius:6}} /></div>
          <div className="stat-card glass" style={{height:60,background:"var(--skeleton)",margin:8}} />
        </div>
      </section>
    )
  }

  const handleTest = async () => {
    if (!testInput.trim()) return
    setTestLoading(true)
    setTestError("")
    setTestResult(null)
    try {
      const res = await postDemoTestComment(testInput)
      setTestResult(res)
    } catch (e) {
      setTestError(e.message)
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur">
        <h1>الأدوات التشخيصية</h1>
        <p>اختبار وتحليل أداء النظام</p>
      </div>

      {/* Token Permissions */}
      <div className="content-card glass">
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            صلاحيات توكن فيسبوك
          </div>
        </div>
        {!perms?.has_token ? (
          <div className="post-card"><p style={{fontSize:13,color:"var(--muted)"}}>لم يتم تعيين توكن فيسبوك — قم بتعيين FACEBOOK_ACCESS_TOKEN</p></div>
        ) : (
          <div className="activity-list">
            {perms.permissions?.length > 0 ? perms.permissions.map((p, i) => (
              <div className="activity-item" key={i}>
                <div className="activity-dot" style={{background:"var(--success)"}} />
                <div className="activity-text" style={{fontSize:12,fontFamily:"monospace"}}>{typeof p === "string" ? p : p.permission || p.scope || JSON.stringify(p)}</div>
              </div>
            )) : (
              <div className="post-card"><p style={{fontSize:13,color:"var(--muted)"}}>تم تعيين التوكن — لكن لم نتمكن من جلب الصلاحيات</p></div>
            )}
          </div>
        )}
      </div>

      {/* Intent Classifier Test */}
      <div className="content-card glass" style={{marginBlockStart:16}}>
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            اختبار تصنيف النية
          </div>
        </div>
        <div className="post-card">
          <p style={{fontSize:13,color:"var(--muted)",marginBlockEnd:8}}>أدخل نص تعليق لاختبار التصنيف التلقائي للنية</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <input
              className="form-input"
              style={{flex:1,minWidth:200,background:"var(--bg)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px",color:"var(--text)"}}
              placeholder="مثال: كم سعر هذا المنتج؟"
              value={testInput}
              onChange={e => setTestInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleTest()}
            />
            <button className="btn btn-primary" style={{boxShadow:"var(--shadow-glow)"}} onClick={handleTest} disabled={testLoading || !testInput.trim()}>
              {testLoading ? "جارٍ..." : "اختبار"}
            </button>
          </div>
        </div>

        {testError && (
          <div className="post-card" style={{background:"var(--danger-soft)"}}>
            <p style={{fontSize:13,color:"var(--danger)"}}>{testError}</p>
          </div>
        )}

        {testResult && (
          <div className="activity-list">
            <div className="activity-item">
              <div className="activity-dot" style={{background:"var(--accent)"}} />
              <div className="activity-text"><strong>النص الأصلي:</strong> {testResult.original}</div>
            </div>
            <div className="activity-item">
              <div className="activity-dot" style={{background:"var(--info)"}} />
              <div className="activity-text"><strong>النص الطبيع:</strong> {testResult.normalized}</div>
            </div>
            <div className="activity-item">
              <div className="activity-dot" style={{background:"var(--success)"}} />
              <div className="activity-text"><strong>التصنيف:</strong> {JSON.stringify(testResult.classification)}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
