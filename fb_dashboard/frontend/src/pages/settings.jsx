import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchBotStatus, restartBot, fetchLogs, fetchFacebookSettings, fetchEnv, fetchSystemStats, clearLogs } from "@/lib/api"
import { toast } from "sonner"
import { format } from "date-fns"
import { useRef, useState, useEffect } from "react"
import { ConfirmDialog } from "@/components/ConfirmDialog"

const levelBadgeClass = {
  INFO: "badge-s",
  WARNING: "badge-w",
  ERROR: "badge-d",
}

function ErrorState({ error, onRetry }) {
  return (
    <div style={{textAlign:"center",padding:32}}>
      <p style={{color:"var(--muted)",fontSize:13,marginBlockEnd:12}}>{error?.message || "فشل التحميل"}</p>
      <button className="btn btn-outline" style={{fontSize:12}} onClick={onRetry}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        إعادة المحاولة
      </button>
    </div>
  )
}

const tabItems = [
  { value: "bot", label: "إعدادات البوت" },
  { value: "facebook", label: "فيسبوك" },
  { value: "api", label: "إعدادات API" },
  { value: "theme", label: "المظهر" },
  { value: "system", label: "النظام" },
]

function FacebookTab() {
  const { data: fbSettings, isLoading, isError, refetch } = useQuery({ queryKey: ["facebook-settings"], queryFn: fetchFacebookSettings })
  const { data: status } = useQuery({ queryKey: ["bot-status"], queryFn: fetchBotStatus, refetchInterval: 10000 })
  const queryClient = useQueryClient()
  const [newInterval, setNewInterval] = useState("")
  useEffect(() => { if (status?.interval) setNewInterval(String(status.interval)) }, [status?.interval])
  const updateIntervalMut = useMutation({
    mutationFn: async (sec) => {
      const fd = new FormData(); fd.append("interval", String(sec))
      const r = await fetch("/api/bot/interval", { method: "POST", body: fd })
      if (!r.ok) throw new Error("فشل التحديث")
      return r.json()
    },
    onSuccess: (_, sec) => { queryClient.invalidateQueries({ queryKey: ["bot-status"] }); toast.success(`تم تحديث الفاصل الزمني إلى ${sec} ثانية`) },
    onError: (e) => toast.error(e.message || "فشل تحديث الفاصل الزمني"),
  })
  if (isLoading) return <div className="stat-card glass skel-card" style={{height:80}} />
  if (isError) return <ErrorState onRetry={() => refetch()} />
  return (
    <div className="stats-grid" style={{gridTemplateColumns:"repeat(2,1fr)"}}>
      <div className="card glass card-inset">
        <div className="cc-header card-header-flush">
          <div className="cc-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" x2="10"/><path d="M12 22V8"/><path d="M12 8H5a3 3 0 0 0-3 3v8"/><path d="M12 8h7a3 3 0 0 1 3 3v8"/></svg>
            اتصال فيسبوك
          </div>
        </div>
        <div className="fld mb-8">
          <span className={`badge ${fbSettings?.connected ? "badge-s" : "badge-d"}`} style={{fontSize:11}}>
            <span className="stat-dot" style={{background:fbSettings?.connected ? "var(--success)" : "var(--muted)",display:"inline-block",marginInlineEnd:4}} />
            {fbSettings?.connected ? "متصل" : "غير متصل"}
          </span>
        </div>
        {fbSettings?.page_name && <p style={{fontSize:13,color:"var(--muted)",marginBlockEnd:4}}>اسم الصفحة: <strong style={{color:"var(--text)"}}>{fbSettings.page_name}</strong></p>}
        {fbSettings?.page_id && <p className="text-muted-md">معرف الصفحة: <code className="code-inline">{fbSettings.page_id}</code></p>}
        <p style={{fontSize:12,color:"var(--muted)",marginBlockStart:4}}>
          Token: {fbSettings?.has_token ? <code className="code-inline">{fbSettings.token_preview}</code> : <span className="badge badge-d" style={{fontSize:10}}>غير مضبوط</span>}
        </p>
      </div>
      <div className="card glass card-inset">
        <div className="cc-header card-header-flush">
          <div className="cc-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            حالة البوت
          </div>
        </div>
        <div className="fld" style={{display:"flex",alignItems:"center",gap:8,marginBlockEnd:12}}>
          <span className={`badge ${status?.running ? "badge-s" : "badge-d"}`} style={{fontSize:11}}>
            <span className="stat-dot" style={{background:status?.running ? "var(--success)" : "var(--muted)",display:"inline-block",marginInlineEnd:4}} />
            {status?.running ? "شغال" : "متوقف"}
          </span>
          <span style={{fontSize:12,color:"var(--muted)",display:"flex",alignItems:"center",gap:4}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            الفحص كل: {status?.interval ?? 10} ث
          </span>
        </div>
        <div className="fld flex-center" style={{alignItems:"flex-end",gap:8}}>
          <div style={{flex:1}}>
            <label style={{fontSize:11,color:"var(--muted)",display:"block",marginBlockEnd:4}}>الفاصل الزمني (ثواني)</label>
            <input type="number" min={1} className="fld" value={newInterval} onChange={e => setNewInterval(e.target.value)} style={{width:"100%"}} />
          </div>
          <button className="btn btn-outline" style={{fontSize:11,padding:"6px 12px"}} onClick={() => { const sec = parseInt(newInterval); if (!sec || sec < 1) { toast.error("أدخل رقماً صالحاً"); return } updateIntervalMut.mutate(sec) }} disabled={updateIntervalMut.isPending}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            {updateIntervalMut.isPending ? "..." : "تحديث"}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Settings({ role }) {
  useEffect(() => { document.title = "الإعدادات | SmartBot" }, [])
  const queryClient = useQueryClient()
  const [tab, setTab] = useState("bot")
  const [newInterval, setNewInterval] = useState("")
  const [cleared, setCleared] = useState(false)

  const { data: status, isLoading: statusLoading, isError: statusError, refetch: refetchStatus } = useQuery({
    queryKey: ["bot-status"], queryFn: fetchBotStatus, staleTime: 5000, refetchOnWindowFocus: true, refetchInterval: 10000, retry: 2,
    placeholderData: (prev) => prev,
  })

  const { data: logs = [], isLoading: logsLoading, isError: logsError, refetch: refetchLogs } = useQuery({
    queryKey: ["logs"], queryFn: () => fetchLogs(50), enabled: tab === "bot",
  })

  const { data: env, isLoading: envLoading } = useQuery({
    queryKey: ["env"], queryFn: fetchEnv, enabled: tab === "api",
  })

  const { data: sysStats, isLoading: sysStatsLoading } = useQuery({
    queryKey: ["system-stats"], queryFn: fetchSystemStats, enabled: tab === "system",
  })

  const logsEndRef = useRef(null)
  const logsContainerRef = useRef(null)

  useEffect(() => {
    if (logsEndRef.current && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [logs])

  useEffect(() => {
    if (status?.interval) setNewInterval(String(status.interval))
  }, [status?.interval])

  const [confirmClear, setConfirmClear] = useState(false)

  const restartMut = useMutation({
    mutationFn: restartBot,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bot-status"] }); toast.success("تم إعادة تشغيل البوت") },
    onError: (e) => toast.error(e.message),
  })

  const updateIntervalMut = useMutation({
    mutationFn: async (sec) => {
      const fd = new FormData(); fd.append("interval", String(sec))
      const r = await fetch("/api/bot/interval", { method: "POST", body: fd })
      if (!r.ok) throw new Error("فشل التحديث")
      return r.json()
    },
    onSuccess: (_, sec) => { queryClient.invalidateQueries({ queryKey: ["bot-status"] }); toast.success(`تم تحديث الفاصل الزمني إلى ${sec} ثانية`) },
    onError: (e) => toast.error(e.message || "فشل تحديث الفاصل الزمني"),
  })

  const clearLogsMut = useMutation({
    mutationFn: () => clearLogs(30),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["logs"] }); toast.success("تم تنظيف السجلات") },
    onError: (e) => toast.error(e.message),
  })

  const envConfig = env
    ? [
        { key: "DATABASE_URL", value: env.db_type === "postgres" ? "postgresql://***" : "sqlite:///data.db", hidden: true },
        { key: "FACEBOOK_ACCESS_TOKEN", value: env.has_fb_token ? "مُعد" : "غير مُعد" },
        { key: "WEBHOOK_URL", value: env.webhook_url || "غير مُعد" },
        { key: "BOT_INTERVAL", value: `${env.bot_interval}s` },
        { key: "DEBUG", value: env.debug ? "نعم" : "لا" },
        { key: "VERSION", value: env.version },
      ]
    : []

  const systemStats = [
    { label: "الإصدار", value: sysStats?.version || "—" },
    { label: "عدد القواعد", value: sysStats?.rule_count ?? "—" },
    { label: "عدد الردود", value: sysStats?.reply_count ?? "—" },
    { label: "عدد المستخدمين", value: sysStats?.user_count ?? "—" },
    { label: "حجم قاعدة البيانات", value: sysStats?.db_size || "—" },
    { label: "حالة البوت", value: status?.running ? "شغال" : "متوقف" },
  ]

  return (
    <section className="page active" dir="rtl">
      <div className="page-header">
        <h1>الإعدادات</h1>
        <p>إعدادات البوت، API، المظهر وإحصائيات النظام</p>
      </div>

      <div className="qactions" style={{gap:4,marginBlockEnd:16,flexWrap:"wrap"}}>
        {tabItems.map(t => (
          <button key={t.value} className={`btn ${tab === t.value ? "btn-primary" : "btn-outline"}`} style={{padding:"6px 14px",fontSize:12}} onClick={() => setTab(t.value)}>{t.label}</button>
        ))}
      </div>

      {tab === "bot" && (
        <div className="flex-col" style={{gap:16}}>
          <div className="stats-grid" style={{gridTemplateColumns:"repeat(2,1fr)"}}>
            <div className="card glass card-inset">
              <div className="cc-header card-header-flush">
                <div className="cc-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                  حالة البوت
                </div>
              </div>
              {statusLoading ? (
                <div className="flex-col" style={{gap:8}}>
                  <div className="stat-card glass skel-card" style={{height:24}} />
                  <div className="stat-card glass skel-card" style={{height:24,width:"60%"}} />
                </div>
              ) : statusError ? (
                <ErrorState onRetry={() => refetchStatus()} />
              ) : (
                <>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBlockEnd:12}}>
                    <span className={`badge ${status?.running ? "badge-s" : "badge-d"}`} style={{fontSize:11}}>
                      <span className="stat-dot" style={{background:status?.running ? "var(--success)" : "var(--muted)",display:"inline-block",marginInlineEnd:4}} />
                      {status?.running ? "شغال" : "متوقف"}
                    </span>
                    <span style={{fontSize:12,color:"var(--muted)",display:"flex",alignItems:"center",gap:4}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      الفحص كل: {status?.interval ?? 10} ثانية
                    </span>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:8,marginBlockEnd:12}}>
                    <div style={{flex:1}}>
                      <label style={{fontSize:11,color:"var(--muted)",display:"block",marginBlockEnd:4}}>الفاصل الزمني (ثواني)</label>
                      <input type="number" min={1} className="fld" value={newInterval} onChange={e => setNewInterval(e.target.value)} style={{width:"100%"}} />
                    </div>
                    <button className="btn btn-outline" style={{fontSize:11,padding:"6px 12px"}} onClick={() => { const sec = parseInt(newInterval); if (!sec || sec < 1) { toast.error("أدخل رقماً صالحاً"); return } updateIntervalMut.mutate(sec) }} disabled={updateIntervalMut.isPending}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                      {updateIntervalMut.isPending ? "..." : "تحديث"}
                    </button>
                  </div>
                  <div className="qactions">
                    <button className="btn btn-outline" style={{color:"var(--danger)",fontSize:12}} onClick={() => restartMut.mutate()} disabled={restartMut.isPending || role !== "admin"}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                      {restartMut.isPending ? "جاري..." : "إعادة تشغيل البوت"}
                    </button>
                    {role !== "admin" && <span className="text-muted-sm">متاح للمدير فقط</span>}
                  </div>
                </>
              )}
            </div>

            <div className="card glass card-inset">
              <div className="cc-header card-header-flush">
                <div className="cc-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  اتصال فيسبوك
                </div>
              </div>
              {statusLoading ? (
                <div className="stat-card glass skel-card" style={{height:24}} />
              ) : (
                <>
                  <p style={{fontSize:12,color:"var(--muted)",marginBlockEnd:8}}>معرف الصفحة: <code className="code-inline">مُعد في الإعدادات</code></p>
                  <div className="flex-center-gap8">
                    <span>الحالة:</span>
                    <span className={`badge ${status?.running ? "badge-s" : "badge-w"}`} style={{fontSize:11}}>
                      <span className="stat-dot" style={{background:status?.running ? "var(--success)" : "var(--muted)",display:"inline-block",marginInlineEnd:4}} />
                      {status?.running ? "متصل" : "غير متصل"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card glass card-inset">
            <div className="cc-header card-header-flush">
              <div className="cc-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                سجل البوت
              </div>
            </div>
            {logsLoading ? (
              <div className="flex-col" style={{gap:8}}>
                {[1,2,3,4,5].map(i => <div key={i} className="stat-card glass skel-card" style={{height:24}} />)}
              </div>
            ) : logsError ? (
              <ErrorState onRetry={() => refetchLogs()} />
            ) : logs.length === 0 || cleared ? (
              <div style={{textAlign:"center",padding:24}}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{color:"var(--muted)",opacity:0.3}}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <p style={{fontSize:13,color:"var(--muted)",marginBlockStart:8}}>لا توجد سجلات بعد</p>
              </div>
            ) : (
              <>
                <div ref={logsContainerRef} style={{maxHeight:240,overflowY:"auto",marginBlockEnd:8}} dir="ltr">
                  {logs.map((log, i) => (
                    <div key={log.id ?? i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--border)",fontSize:12}}>
                      <span className={`badge ${levelBadgeClass[log.level] ?? "badge-w"}`} style={{fontSize:9,padding:"1px 6px",flexShrink:0}}>{log.level}</span>
                      <span style={{color:"var(--muted)",fontSize:11,fontFamily:"monospace",flexShrink:0}}>{log.created_at ? format(new Date(log.created_at), "HH:mm:ss") : "—"}</span>
                      <span style={{wordBreak:"break-word"}}>{log.message}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
                <div className="qactions" style={{gap:4}}>
                  <button className="btn btn-outline" style={{fontSize:11}} onClick={() => setConfirmClear(true)} disabled={clearLogsMut.isPending}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    {clearLogsMut.isPending ? "جاري..." : "تنظيف السجلات القديمة"}
                  </button>
                  <button className="btn btn-outline" style={{fontSize:11}} onClick={() => setCleared(true)}>مسح السجلات</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "facebook" && <FacebookTab />}

      {tab === "api" && (
        <div className="card glass card-inset">
          <div className="cc-header" style={{padding:0,marginBlockEnd:8}}>
            <div className="cc-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              إعدادات API
            </div>
            <p style={{fontSize:11,color:"var(--muted)",marginBlockStart:4}}>متغيرات البيئة — للقراءة فقط</p>
          </div>
          {envLoading ? (
            <div className="flex-col" style={{gap:8}}>
              {[1,2,3,4,5,6].map(i => <div key={i} className="stat-card glass skel-card" style={{height:40}} />)}
            </div>
          ) : !env ? (
            <ErrorState error={new Error("فشل تحميل الإعدادات")} onRetry={() => queryClient.invalidateQueries({ queryKey: ["env"] })} />
          ) : (
            <>
              <div style={{borderRadius:8,border:"1px solid var(--border)",overflow:"hidden"}}>
                {envConfig.map(({ key, value, hidden }) => (
                  <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
                    <div className="flex-center" style={{gap:12}}>
                      <div style={{fontSize:13}}>
                        <p style={{fontWeight:600}}>{key}</p>
                        <p style={{fontSize:11,color:"var(--muted)",fontFamily:"monospace",direction:"ltr",textAlign:"left"}}>{hidden ? "******" : value}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:12,marginBlockStart:12,borderRadius:8,background:"var(--warning-soft)",border:"1px solid var(--warning)"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color:"var(--warning)",flexShrink:0}}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <div style={{fontSize:12,color:"var(--warning)"}}>
                  <p style={{fontWeight:600}}>تعديل هذه الإعدادات</p>
                  <p style={{marginBlockStart:4}}>تتم إدارة متغيرات البيئة من خلال لوحة تحكم Render Dashboard.</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "theme" && (
        <div className="stats-grid" style={{gridTemplateColumns:"repeat(2,1fr)"}}>
          <div className="card glass card-inset">
            <div className="cc-header card-header-flush">
              <div className="cc-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                المظهر
              </div>
            </div>
            <div className="fld">
              <p style={{fontSize:12,color:"var(--muted)",marginBlockEnd:8}}>اختر نمط العرض:</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
                <button onClick={() => { document.documentElement.style.colorScheme = "light"; document.documentElement.removeAttribute("data-theme") }}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:16,borderRadius:8,border:"2px solid var(--border)",cursor:"pointer",background:"var(--bg)"}}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  <span style={{fontSize:12}}>فاتح</span>
                </button>
                <button onClick={() => { document.documentElement.style.colorScheme = "dark"; document.documentElement.setAttribute("data-theme", "dark") }}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:16,borderRadius:8,border:"2px solid var(--border)",cursor:"pointer",background:"var(--bg)"}}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  <span style={{fontSize:12}}>داكن</span>
                </button>
              </div>
            </div>
          </div>
          <div className="card glass card-inset">
            <div className="cc-header card-header-flush">
              <div className="cc-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                معاينة حية
              </div>
            </div>
            <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden"}}>
              <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
                <div className="flex-center-gap8">
                  <div style={{width:12,height:12,borderRadius:"50%",background:"var(--accent)"}} />
                  <div style={{height:8,width:80,background:"var(--skeleton)",borderRadius:4}} />
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {[1,2,3,4].map(i => <div key={i} style={{height:32,borderRadius:4,background:"var(--skeleton)"}} />)}
                </div>
                <div style={{height:12,width:120,borderRadius:4,background:"var(--skeleton)"}} />
                <div style={{height:12,width:80,borderRadius:4,background:"var(--skeleton)"}} />
                <button className="btn btn-primary" style={{width:"100%",textAlign:"center"}}>زر تجريبي</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "system" && (
        <div className="flex-col" style={{gap:16}}>
          <div className="card glass card-inset">
            <div className="cc-header card-header-flush">
              <div className="cc-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                إحصائيات النظام
              </div>
            </div>
            {sysStatsLoading ? (
              <div className="stats-grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
                {[1,2,3,4,5,6].map(i => <div key={i} className="stat-card glass skel-card" style={{height:60}} />)}
              </div>
            ) : (
              <div className="stats-grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
                {systemStats.map(s => (
                  <div key={s.label} className="stat-card glass card-inset">
                    <div className="stat-label">{s.label}</div>
                    <div className="stat-value" style={{fontSize:18}}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card glass card-inset">
            <div className="cc-header" style={{padding:0,marginBlockEnd:8}}>
              <div className="cc-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                صيانة
              </div>
            </div>
            <p style={{fontSize:13,color:"var(--muted)",marginBlockEnd:12}}>تنظيف السجلات التي مضى عليها أكثر من 30 يوماً.</p>
            <button className="btn btn-outline" style={{fontSize:12}} onClick={() => setConfirmClear(true)} disabled={clearLogsMut.isPending}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              {clearLogsMut.isPending ? "جاري التنظيف..." : "تنظيف السجلات القديمة"}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="تأكيد التنظيف"
        message="تنظيف السجلات التي مضى عليها أكثر من 30 يوماً؟ لا يمكن التراجع."
        confirmLabel="تنظيف"
        isLoading={clearLogsMut.isPending}
        onConfirm={() => { clearLogsMut.mutate(); setConfirmClear(false) }}
        onCancel={() => setConfirmClear(false)}
      />

      <div className="mobile-nav-spacer" />
    </section>
  )
}
