import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: opts.body instanceof FormData ? {} : { "Content-Type": "application/json", ...opts.headers },
  }).then((r) => { if (!r.ok) throw new Error("Request failed"); return r.json() })
}

function fetchTeamMembers() { return api("/api/team/members") }
function fetchTeamActivity(days) { return api(`/api/team/activity?days=${days}`) }
function fetchRoleSummary() { return api("/api/team/role-summary") }

const ROLE_LABELS = { admin: "مدير", editor: "محرر", viewer: "مشاهد" }

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (diff < 60) return "الآن"
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`
  return `منذ ${Math.floor(diff / 86400)} ي`
}

const ACT_COLORS = {
  reply: { bg: "var(--accent-soft)", color: "var(--accent)" },
  comment: { bg: "var(--info-soft)", color: "var(--info)" },
  mention: { bg: "#f0f0ff", color: "#8b5cf6" },
  login: { bg: "var(--accent-soft)", color: "var(--accent)" },
  edit: { bg: "var(--warning-soft)", color: "var(--warning)" },
  remove: { bg: "var(--danger-soft)", color: "var(--danger)" },
  invite: { bg: "var(--accent-soft)", color: "var(--accent)" },
}

const ACT_SVG = {
  reply: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>,
  comment: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  mention: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>,
  login: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>,
  edit: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  remove: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  invite: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="20 8 20 14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
}

function InviteDialog({ isAdmin }) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("viewer")
  const queryClient = useQueryClient()
  const inviteMut = useMutation({
    mutationFn: () => api("/api/team/members", { method: "POST", body: JSON.stringify({ username, password, role }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["team-members"] }); queryClient.invalidateQueries({ queryKey: ["role-summary"] }); setOpen(false); setUsername(""); setPassword(""); setRole("viewer"); toast.success("تمت إضافة العضو") },
    onError: (e) => toast.error(e.message),
  })
  const handleSubmit = (e) => { e.preventDefault(); if (!username || !password) return toast.error("يرجى تعبئة جميع الحقول"); inviteMut.mutate() }
  return (
    <>
      <button className="btn btn-primary" style={{boxShadow:"var(--shadow-glow)"}} disabled={!isAdmin} onClick={() => isAdmin && setOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="20 8 20 14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        دعوة عضو
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:420}}>
            <div className="cc-header"><div className="cc-title">دعوة عضو جديد</div></div>
            <form onSubmit={handleSubmit} style={{padding:16}}>
              <div className="fld" style={{marginBlockEnd:12}}>
                <label style={{fontSize:12,color:"var(--muted)",display:"block",marginBlockEnd:4}}>اسم المستخدم</label>
                <input className="fld" value={username} onChange={e => setUsername(e.target.value)} required dir="ltr" style={{width:"100%"}} />
              </div>
              <div className="fld" style={{marginBlockEnd:12}}>
                <label style={{fontSize:12,color:"var(--muted)",display:"block",marginBlockEnd:4}}>كلمة المرور</label>
                <input type="password" className="fld" value={password} onChange={e => setPassword(e.target.value)} required style={{width:"100%"}} />
              </div>
              <div className="fld" style={{marginBlockEnd:16}}>
                <label style={{fontSize:12,color:"var(--muted)",display:"block",marginBlockEnd:4}}>الدور</label>
                <select className="fld" value={role} onChange={e => setRole(e.target.value)} style={{width:"100%"}}>
                  <option value="viewer">مشاهد</option>
                  <option value="editor">محرر</option>
                  <option value="admin">مدير</option>
                </select>
              </div>
              <div className="qactions" style={{justifyContent:"flex-end"}}>
                <button className="btn btn-outline" type="button" onClick={() => setOpen(false)}>إلغاء</button>
                <button className="btn btn-primary" style={{boxShadow:"var(--shadow-glow)"}} type="submit" disabled={inviteMut.isPending}>{inviteMut.isPending ? "جاري..." : "دعوة"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export function Team({ role }) {
  useEffect(() => { document.title = "فريق العمل | SmartBot" }, [])
  const isAdmin = role === "admin"
  const [activityDays, setActivityDays] = useState(7)

  const { data: members = [], isLoading: membersLoading, error: membersErr, refetch: refetchMembers } = useQuery({
    queryKey: ["team-members"], queryFn: fetchTeamMembers, staleTime: 15000, refetchOnWindowFocus: true,
  })
  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["team-activity", activityDays], queryFn: () => fetchTeamActivity(activityDays), staleTime: 15000, refetchOnWindowFocus: true,
  })
  const { data: roleSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ["role-summary"], queryFn: fetchRoleSummary, staleTime: 30000, refetchOnWindowFocus: true,
  })

  const summary = roleSummary || {}
  const totalMembers = members.length || summary.total || 0
  const totalRoles = Object.keys(ROLE_LABELS).filter(r => (summary[r] || 0) > 0 || members.some(m => m.role === r)).length

  return (
    <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur">
        <h1 className="gradient-text">فريق العمل</h1>
        <p>{totalMembers} عضو · {totalRoles} أدوار</p>
      </div>

      <div className="qactions">
        <InviteDialog isAdmin={isAdmin} />
      </div>

      {summaryLoading ? (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
          {[1,2,3,4].map(i => <div key={i} className="stat-card glass" style={{height:72,background:"var(--skeleton)"}} />)}
        </div>
      ) : (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
          {[
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: "إجمالي الأعضاء", value: summary.total ?? totalMembers, color: "var(--accent)" },
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3m0 12l-4-4m4 4l4-4"/><path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/></svg>, label: "مدير", value: summary.admin ?? 0, color: "var(--warning)" },
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: "محرر", value: summary.editor ?? 0, color: "var(--info)" },
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: "مشاهد", value: summary.viewer ?? 0, color: "var(--muted)" },
          ].map(s => (
            <div key={s.label} className="stat-card glass card-premium card-hover-lift" style={{display:"flex",alignItems:"center",gap:12,padding:16}}>
              <div style={{width:40,height:40,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:s.color,color:"#fff",flexShrink:0}}>{s.icon}</div>
              <div><div className="stat-value" style={{fontSize:22}}>{s.value}</div><div className="stat-label">{s.label}</div></div>
            </div>
          ))}
        </div>
      )}

      <div className="page-header" style={{marginBlockStart:12}}><h2 style={{fontSize:14,fontWeight:600}}>الأعضاء</h2></div>

      {membersLoading ? (
        <div className="stats-grid" style={{gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))"}}>
          {[1,2,3,4].map(i => <div key={i} className="stat-card glass" style={{height:100,background:"var(--skeleton)"}} />)}
        </div>
      ) : membersErr ? (
        <div className="card glass" style={{textAlign:"center",padding:40}}>
          <p style={{color:"var(--muted)",marginBlockEnd:12}}>فشل تحميل الأعضاء</p>
          <button className="btn btn-outline" onClick={() => refetchMembers()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            إعادة المحاولة
          </button>
        </div>
      ) : members.length === 0 ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{color:"var(--muted)",opacity:0.3,marginBlockEnd:12}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <p>لا يوجد أعضاء — قم بدعوة أول عضو</p>
          <div className="qactions" style={{marginBlockStart:12}}><InviteDialog isAdmin={isAdmin} /></div>
        </div>
      ) : (
        <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))"}}>
          {members.map(m => {
            const initial = (m.username || "?").charAt(0).toUpperCase()
            const gradient = `hsl(${m.id * 37 % 360}, 55%, 45%)`
            const rs = m.role === "admin" ? {bg:"var(--accent-soft)",color:"var(--accent)"} : m.role === "editor" ? {bg:"var(--info-soft)",color:"var(--info)"} : {bg:"var(--skeleton)",color:"var(--muted)"}
            return (
              <div key={m.id} className="stat-card glass card-premium card-hover-lift">
                <div className="person-row">
                  <div className="person-avatar" style={{background:gradient}}>{initial}</div>
                  <div className="person-info">
                    <div className="p-name">{m.username}</div>
                    <div className="p-detail">{m.replies_count != null && `${m.replies_count} ردود`}{m.last_active && ` · ${timeAgo(m.last_active)}`}</div>
                  </div>
                </div>
                <span className="badge badge-s" style={{fontSize:10,background:rs.bg,color:rs.color,border:"none",marginBlockStart:8,display:"inline-flex",alignItems:"center",gap:4}}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  {ROLE_LABELS[m.role] || m.role}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div style={{marginBlockStart:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBlockEnd:12}}>
          <h2 style={{fontSize:14,fontWeight:600}}>النشاطات</h2>
          <div className="qactions" style={{gap:4}}>
            {[{v:1,l:"اليوم"},{v:7,l:"7 أيام"},{v:30,l:"30 يوم"}].map(f => (
              <button key={f.v} className={`btn ${activityDays === f.v ? "btn-primary" : "btn-outline"}`} style={{padding:"4px 10px",fontSize:11}} onClick={() => setActivityDays(f.v)}>{f.l}</button>
            ))}
          </div>
        </div>

        {activitiesLoading ? (
          <div className="card glass" style={{padding:16}}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:"var(--skeleton)",flexShrink:0}} />
                <div style={{flex:1}}><div style={{height:12,width:"60%",background:"var(--skeleton)",borderRadius:6,marginBlockEnd:6}} /><div style={{height:10,width:"30%",background:"var(--skeleton)",borderRadius:6}} /></div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="card glass" style={{textAlign:"center",padding:40}}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{color:"var(--muted)",opacity:0.3,marginBlockEnd:8}}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <p style={{fontSize:13,color:"var(--muted)"}}>لا توجد نشاطات خلال هذه الفترة</p>
          </div>
        ) : (
          <div className="card glass" style={{padding:"8px 16px"}}>
            {activities.map((a, i) => {
              const icon = ACT_SVG[a.type] || <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              const c = ACT_COLORS[a.type] || {bg:"var(--skeleton)",color:"var(--muted)"}
              return (
                <div key={a.id || i} style={{display:"flex",gap:12,padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
                  <div style={{width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:c.bg,color:c.color}}>{icon}</div>
                  <div style={{minWidth:0,flex:1}}>
                    <p style={{fontSize:13}}><strong>{a.user}</strong><span style={{color:"var(--muted)"}}> {a.action}</span></p>
                    <p style={{fontSize:11,color:"var(--muted)",marginBlockStart:4,display:"flex",alignItems:"center",gap:4}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {timeAgo(a.created_at || a.timestamp)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mobile-nav-spacer" />
    </section>
  )
}
