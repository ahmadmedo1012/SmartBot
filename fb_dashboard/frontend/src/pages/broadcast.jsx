import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchBroadcasts, createBroadcast, sendBroadcast, cancelBroadcast, deleteBroadcast, estimateAudience, fetchTags } from "@/lib/api"
import { toast } from "sonner"

const STATUS_MAP = {
  draft: { label: "مسودة", cls: "badge-w" },
  sending: { label: "جارٍ الإرسال", cls: "badge-i" },
  sent: { label: "تم الإرسال", cls: "badge-s" },
  cancelled: { label: "ملغي", cls: "badge-d" },
  partial: { label: "جزئي", cls: "badge-w" },
}
const PLATFORMS = [
  { value: "all", label: "الكل" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
]
const LAST_INTERACTION = [
  { value: "any", label: "في أي وقت" },
  { value: "7d", label: "آخر 7 أيام" },
  { value: "30d", label: "آخر 30 يوم" },
  { value: "90d", label: "آخر 90 يوم" },
]

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.draft
  return <span className={`badge ${s.cls}`} style={{fontSize:11}}>{s.label}</span>
}

function Composer({ onBack, queryClient }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [platform, setPlatform] = useState("all")
  const [hasTags, setHasTags] = useState([])
  const [notTags, setNotTags] = useState([])
  const [lastInteraction, setLastInteraction] = useState("any")
  const [minReplies, setMinReplies] = useState("")
  const [estimatedCount, setEstimatedCount] = useState(null)
  const [message, setMessage] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [schedule, setSchedule] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [estLoading, setEstLoading] = useState(false)

  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: fetchTags })

  const createMut = useMutation({
    mutationFn: (data) => createBroadcast(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); toast.success("تم إنشاء البث"); onBack() },
    onError: (e) => toast.error(e.message),
  })

  const filters = {
    platform: platform !== "all" ? platform : undefined,
    has_tags: hasTags.length > 0 ? hasTags : undefined,
    not_tags: notTags.length > 0 ? notTags : undefined,
    last_interaction: lastInteraction !== "any" ? lastInteraction : undefined,
    min_replies: minReplies ? parseInt(minReplies) : undefined,
  }

  const handleEstimate = async () => {
    setEstLoading(true)
    try { const res = await estimateAudience(filters); setEstimatedCount(res?.count ?? res?.estimated ?? 0) }
    catch (e) { toast.error(e.message) } finally { setEstLoading(false) }
  }

  const handleSend = () => {
    createMut.mutate({ name, platform, filters, message, image_url: imageUrl || undefined, scheduled_at: schedule || undefined })
  }

  const canProceed = () => { if (step === 0) return !!name.trim(); if (step === 2) return !!message.trim(); return true }

  const tagSelect = (list, setList) => (
    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBlockStart:4}}>
      <select className="fld" onChange={e => { const v = e.target.value; if (!v) return; setList(list.includes(v) ? list.filter(t => t !== v) : [...list, v]); e.target.value="" }} style={{fontSize:12}}>
        <option value="">اختر الوسوم</option>
        {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {list.map(tid => {
        const t = tags.find(tt => tt.id === tid)
        return t ? <span key={tid} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,padding:"2px 8px",borderRadius:6,background:"var(--accent-soft)",color:"var(--accent)"}}>{t.name}<button onClick={() => setList(list.filter(x => x !== tid))} style={{background:"none",border:"none",cursor:"pointer",padding:0,color:"inherit",fontSize:14}}>&times;</button></span> : null
      })}
    </div>
  )

  const steps = [{ label: "معلومات أساسية" }, { label: "تصفية الجمهور" }, { label: "الرسالة" }, { label: "مراجعة" }]

  return (
    <section className="page active" dir="rtl" style={{position:"relative", animation: "pageIn 0.35s var(--ease)"}}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur" style={{ animation: "reveal-blur 0.5s cubic-bezier(0.16,1,0.3,1) both" }}><h1 className="shiny-text">بث جماعي جديد</h1></div>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBlockEnd:20}}>
        {steps.map((s, i) => {
          const active = i === step; const done = i < step
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
              <button onClick={() => done && setStep(i)}
                style={{padding:"6px 14px",borderRadius:8,fontSize:12,border:"none",fontWeight:600,boxShadow: active ? "var(--shadow-glow)" : "none",
                  background: active ? "var(--accent)" : done ? "var(--accent-soft)" : "var(--skeleton)",
                  color: active || done ? "#fff" : "var(--muted)",cursor: done ? "pointer" : "default"}}>
                {s.label}
              </button>
              {i < steps.length - 1 && <div style={{flex:1,height:2,background: done ? "var(--accent)" : "var(--skeleton)"}} />}
            </div>
          )
        })}
      </div>

      <div className="card glass" style={{padding:24}}>
        {step === 0 && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div className="fld" style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:12,color:"var(--muted)"}}>اسم البث</label>
              <input className="fld" value={name} onChange={e => setName(e.target.value)} placeholder="مثال: عروض الأسبوع" autoFocus style={{width:"100%"}} />
            </div>
            <div className="fld" style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:12,color:"var(--muted)"}}>المنصة</label>
              <select className="fld" value={platform} onChange={e => setPlatform(e.target.value)} style={{width:"100%"}}>
                {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
        )}
        {step === 1 && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div className="fld" style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:12,color:"var(--muted)"}}>يحتوي على الوسوم</label>
              {tagSelect(hasTags, setHasTags, "accent-soft")}
            </div>
            <div className="fld" style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:12,color:"var(--muted)"}}>لا يحتوي على الوسوم</label>
              {tagSelect(notTags, setNotTags, "info-soft")}
            </div>
            <div className="fld" style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:12,color:"var(--muted)"}}>آخر تفاعل</label>
              <select className="fld" value={lastInteraction} onChange={e => setLastInteraction(e.target.value)} style={{width:"100%"}}>
                {LAST_INTERACTION.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
            <div className="fld" style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:12,color:"var(--muted)"}}>الحد الأدنى للردود</label>
              <input type="number" min={0} className="fld" value={minReplies} onChange={e => setMinReplies(e.target.value)} placeholder="0" style={{width:120}} />
            </div>
            <div className="qactions">
              <button className="btn btn-outline" style={{fontSize:12}} onClick={handleEstimate} disabled={estLoading}>
                {estLoading ? "جاري التقدير..." : "تقدير الجمهور"}
              </button>
              {estimatedCount !== null && <span style={{fontSize:13,fontWeight:600,color:"var(--accent)"}}>~{estimatedCount.toLocaleString()} مشترك</span>}
            </div>
          </div>
        )}
        {step === 2 && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div className="fld" style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:12,color:"var(--muted)"}}>نص الرسالة</label>
              <textarea className="fld" rows={6} value={message} onChange={e => setMessage(e.target.value)} placeholder={"أدخل نص الرسالة...\nالمتغيرات: {name} - اسم المشترك\n{full_name} - الاسم الكامل\n{platform} - اسم المنصة"} style={{width:"100%"}} />
              <p style={{fontSize:11,color:"var(--muted)"}}>المتغيرات: <code style={{background:"var(--skeleton)",padding:"1px 6px",borderRadius:4,fontSize:10}}>{'{name}'}</code> <code style={{background:"var(--skeleton)",padding:"1px 6px",borderRadius:4,fontSize:10}}>{'{full_name}'}</code> <code style={{background:"var(--skeleton)",padding:"1px 6px",borderRadius:4,fontSize:10}}>{'{platform}'}</code></p>
            </div>
            <div className="fld" style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:12,color:"var(--muted)"}}>رابط الصورة (اختياري)</label>
              <input className="fld" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" dir="ltr" style={{width:"100%"}} />
            </div>
            <div className="card glass" style={{padding:16}}>
              <p style={{fontSize:12,fontWeight:600,color:"var(--muted)",marginBlockEnd:8}}>معاينة الرسالة</p>
              <div className="card glass" style={{padding:12}}>
                <p style={{fontSize:13,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{message || <span style={{color:"var(--muted)",opacity:0.4}}>سيظهر نص الرسالة هنا</span>}</p>
                {imageUrl && <img src={imageUrl} alt="" style={{maxHeight:160,borderRadius:8,objectFit:"cover",marginBlockStart:8}} onError={e => e.target.style.display = "none"} />}
              </div>
            </div>
          </div>
        )}
        {step === 3 && (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <p style={{fontSize:14,fontWeight:600}}>مراجعة البث</p>
            <div className="card glass" style={{padding:0,overflow:"hidden"}}>
              {[
                { l: "الاسم", v: name },
                { l: "المنصة", v: PLATFORMS.find(p => p.value === platform)?.label },
                ...(hasTags.length > 0 ? [{ l: "الوسوم (يحتوي)", v: hasTags.map(tid => tags.find(t => t.id === tid)?.name).join("، ") }] : []),
                ...(notTags.length > 0 ? [{ l: "الوسوم (لا يحتوي)", v: notTags.map(tid => tags.find(t => t.id === tid)?.name).join("، ") }] : []),
                ...(estimatedCount !== null ? [{ l: "الجمهور المقدر", v: `${estimatedCount.toLocaleString()} مشترك` }] : []),
              ].map((r, i) => (
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 16px",borderBottom:"1px solid var(--border)"}}>
                  <span style={{color:"var(--muted)",fontSize:13}}>{r.l}</span>
                  <span style={{fontWeight:500,fontSize:13}}>{r.v}</span>
                </div>
              ))}
              <div style={{padding:"10px 16px"}}>
                <p style={{color:"var(--muted)",fontSize:12,marginBlockEnd:6}}>الرسالة</p>
                <p style={{fontSize:12,whiteSpace:"pre-wrap",wordBreak:"break-word",background:"var(--skeleton)",padding:12,borderRadius:8}}>{message}</p>
              </div>
            </div>
            <div className="fld" style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:12,color:"var(--muted)",display:"flex",alignItems:"center",gap:6}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                جدولة لوقت لاحق
              </label>
              <input type="datetime-local" className="fld" value={schedule} onChange={e => setSchedule(e.target.value)} style={{width:260}} />
            </div>
          </div>
        )}
      </div>

      <div className="qactions" style={{justifyContent:"space-between",marginBlockStart:16}}>
        <button className="btn btn-outline" onClick={() => step > 0 ? setStep(s => s - 1) : onBack()}>{step > 0 ? "السابق" : "إلغاء"}</button>
        {step < 3 ? (
          <button className="btn btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>التالي</button>
        ) : (
          <button className="btn btn-primary" onClick={() => setConfirmOpen(true)} disabled={createMut.isPending}>
            {createMut.isPending ? "جاري..." : schedule ? "جدولة" : "إرسال"}
          </button>
        )}
      </div>

      {confirmOpen && (
        <div className="modal-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:400}}>
            <div className="cc-header"><div className="cc-title">تأكيد الإرسال</div></div>
            <div style={{padding:16}}>
              <p style={{fontSize:13,color:"var(--muted)",marginBlockEnd:16}}>
                سيتم إرسال الرسالة إلى <strong style={{color:"var(--text)"}}>{estimatedCount?.toLocaleString() || "..."} مشترك</strong>.
                {schedule ? ` مجدولة في ${new Date(schedule).toLocaleString("ar-SA")}.` : " هل أنت متأكد؟"}
              </p>
              <div className="qactions" style={{justifyContent:"flex-end"}}>
                <button className="btn btn-outline" onClick={() => setConfirmOpen(false)}>إلغاء</button>
                <button className="btn btn-primary" onClick={handleSend} disabled={createMut.isPending}>
                  {createMut.isPending ? "جاري..." : schedule ? "تأكيد الجدولة" : "إرسال"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function BroadcastDetail({ broadcastId, onBack }) {
  const [collapsedFailed, setCollapsedFailed] = useState(true)
  const { data: broadcasts = [] } = useQuery({ queryKey: ["broadcasts"], queryFn: fetchBroadcasts })
  const b = broadcasts.find(x => x.id === broadcastId)
  const queryClient = useQueryClient()

  const cancelMut = useMutation({
    mutationFn: () => cancelBroadcast(broadcastId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); toast.success("تم إلغاء البث") },
    onError: (e) => toast.error(e.message),
  })

  if (!b) return <div className="card glass" style={{textAlign:"center",padding:40,height:200,background:"var(--skeleton)"}} />

  const total = (b.sent_count || 0) + (b.failed_count || 0) + (b.pending_count || 0)
  const sentPct = total ? Math.round(((b.sent_count || 0) / total) * 100) : 0
  const failedPct = total ? Math.round(((b.failed_count || 0) / total) * 100) : 0
  const pendPct = total ? Math.round(((b.pending_count || 0) / total) * 100) : 0

  return (
    <section className="page active" dir="rtl" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="qactions" style={{marginBlockEnd:16}}>
        <button className="btn btn-outline" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          عودة
        </button>
      </div>
      <div className="page-header reveal-blur"><h1>{b.name}</h1><StatusBadge status={b.status} /></div>

      <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
        <div className="stat-card glass-card card-premium card-hover-lift reveal-card" style={{textAlign:"center"}}>
          <div className="stat-value" style={{color:"var(--success)"}}>{b.sent_count || 0}</div>
          <div className="stat-label">تم الإرسال</div>
        </div>
        <div className="stat-card glass-card card-premium card-hover-lift reveal-card" style={{textAlign:"center"}}>
          <div className="stat-value" style={{color:"var(--danger)"}}>{b.failed_count || 0}</div>
          <div className="stat-label">فشل</div>
        </div>
        <div className="stat-card glass-card card-premium card-hover-lift reveal-card" style={{textAlign:"center"}}>
          <div className="stat-value" style={{color:"var(--warning)"}}>{b.pending_count || 0}</div>
          <div className="stat-label">قيد الانتظار</div>
        </div>
      </div>

      <div className="card glass" style={{padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--muted)",marginBlockEnd:8}}>
          <span>{sentPct}% تم · {failedPct}% فشل · {pendPct}% معلق</span>
          {b.scheduled_at && <span>{new Date(b.scheduled_at).toLocaleString("ar-SA")}</span>}
        </div>
        <div style={{height:12,borderRadius:8,background:"var(--skeleton)",overflow:"hidden",display:"flex"}}>
          <div style={{height:"100%",background:"var(--success)",width:`${sentPct}%`,transition:"width 0.3s"}} />
          {failedPct > 0 && <div style={{height:"100%",background:"var(--danger)",width:`${failedPct}%`,transition:"width 0.3s"}} />}
          {pendPct > 0 && <div style={{height:"100%",background:"var(--warning)",width:`${pendPct}%`,transition:"width 0.3s"}} />}
        </div>
      </div>

      <div className="card glass" style={{padding:16}}>
        <p style={{fontSize:12,fontWeight:600,color:"var(--muted)",marginBlockEnd:12}}>تفاصيل البث</p>
        {[
          { l: "المنصة", v: b.platform ? PLATFORMS.find(p => p.value === b.platform)?.label || b.platform : "الكل" },
          ...(b.scheduled_at ? [{ l: "مجدول في", v: new Date(b.scheduled_at).toLocaleString("ar-SA") }] : []),
          ...(b.sent_at ? [{ l: "تاريخ الإرسال", v: new Date(b.sent_at).toLocaleString("ar-SA") }] : []),
        ].map((r, i) => (
          <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
            <span style={{color:"var(--muted)"}}>{r.l}</span><span>{r.v}</span>
          </div>
        ))}
        <div style={{marginBlockStart:12}}>
          <p style={{color:"var(--muted)",fontSize:12,marginBlockEnd:6}}>الرسالة</p>
          <p style={{fontSize:13,whiteSpace:"pre-wrap",background:"var(--skeleton)",padding:12,borderRadius:8}}>{b.message}</p>
        </div>
      </div>

      {b.failed_recipients?.length > 0 && (
        <div className="card glass" style={{padding:16}}>
          <div onClick={() => setCollapsedFailed(!collapsedFailed)} style={{display:"flex",justifyContent:"space-between",cursor:"pointer",marginBlockEnd:collapsedFailed ? 0 : 12}}>
            <p style={{fontSize:12,fontWeight:600,color:"var(--muted)"}}>المستلمون الفاشلون ({b.failed_recipients.length})</p>
            <span className="badge badge-w" style={{fontSize:10}}>{collapsedFailed ? "عرض" : "إخفاء"}</span>
          </div>
          {!collapsedFailed && b.failed_recipients.map((r, i) => (
            <div key={i} style={{fontSize:12,color:"var(--muted)",display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{color:"var(--danger)"}}>&times;</span>
              <span>{r.name || r.user_id || `#${r.id || i}`}</span>
              {r.error && <span style={{color:"var(--danger)",fontSize:11}}>— {r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {(b.status === "sending" || b.status === "draft") && (
        <button className="btn btn-outline" style={{color:"var(--danger)"}} onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
          {cancelMut.isPending ? "جاري..." : "إلغاء البث"}
        </button>
      )}
    </section>
  )
}

export function Broadcast({ role }) {
  useEffect(() => { document.title = "البث الجماعي | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const canSend = role === "admin"
  const queryClient = useQueryClient()
  const [view, setView] = useState("list")
  const [selectedId, setSelectedId] = useState(null)

  const { data: broadcasts = [], isLoading, error, refetch } = useQuery({
    queryKey: ["broadcasts"], queryFn: fetchBroadcasts,
    staleTime: 15000, refetchOnWindowFocus: true, retry: 2,
    placeholderData: (prev) => prev,
  })

  const sendMut = useMutation({
    mutationFn: (id) => sendBroadcast(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); toast.success("بدأ الإرسال") },
    onError: (e) => toast.error(e.message),
  })
  const cancelMut = useMutation({
    mutationFn: (id) => cancelBroadcast(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); toast.success("تم إلغاء البث") },
    onError: (e) => toast.error(e.message),
  })
  const [deleteTarget, setDeleteTarget] = useState(null)
  const deleteMut = useMutation({
    mutationFn: (id) => deleteBroadcast(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); setDeleteTarget(null); toast.success("تم الحذف") },
    onError: (e) => toast.error(e.message),
  })

  if (view === "composer") return <Composer onBack={() => setView("list")} queryClient={queryClient} />
  if (view === "detail" && selectedId) return <BroadcastDetail broadcastId={selectedId} onBack={() => { setView("list"); setSelectedId(null) }} />

  return (
    <section className="page active" dir="rtl" style={{position:"relative"}}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur"><h1 className="gradient-text">البث الجماعي</h1>
        <p>{broadcasts.length} بث{broadcasts.length > 0 && ` · ${broadcasts.filter(b => b.status === "sent").length} تم`}</p>
      </div>

      <div className="qactions">
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setView("composer")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            إنشاء بث جديد
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="stats-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))"}}>
          {[1,2,3,4].map(i => <div key={i} className="stat-card glass-card card-premium card-hover-lift" style={{height:80,background:"var(--skeleton)"}} />)}
        </div>
      ) : error ? (
        <div className="card glass" style={{textAlign:"center",padding:40}}>
          <p style={{color:"var(--muted)",marginBlockEnd:12}}>{error?.message || "فشل تحميل البثات"}</p>
          <button className="btn btn-outline" onClick={refetch}>إعادة المحاولة</button>
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="empty-state">
          <p>لا توجد بثات بعد</p>
          {canEdit && <button className="btn btn-primary" style={{marginBlockStart:12}} onClick={() => setView("composer")}>إنشاء بث جديد</button>}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>الاسم</th><th>الحالة</th><th>الجمهور</th><th>التاريخ</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {broadcasts.map(b => {
                const total = (b.sent_count || 0) + (b.failed_count || 0)
                return (
                  <tr key={b.id} style={{cursor:"pointer"}} onClick={() => { setSelectedId(b.id); setView("detail") }}>
                    <td data-label="الاسم" style={{fontWeight:500}}>{b.name}</td>
                    <td data-label="الحالة"><StatusBadge status={b.status} /></td>
                    <td data-label="الجمهور" style={{fontSize:12,color:"var(--muted)"}}>{b.sent_count || 0}/{b.failed_count || 0}/{total || "-"}</td>
                    <td data-label="التاريخ" style={{fontSize:12,color:"var(--muted)"}}>
                      {b.sent_at ? new Date(b.sent_at).toLocaleDateString("ar-SA") : b.created_at ? new Date(b.created_at).toLocaleDateString("ar-SA") : "—"}
                    </td>
                    <td data-label="إجراءات">
                      <div style={{display:"flex",gap:4}} onClick={e => e.stopPropagation()}>
                        {b.status === "draft" && canSend && (
                          <button className="btn btn-outline" style={{padding:"4px 8px",fontSize:11,color:"var(--success)"}} onClick={() => sendMut.mutate(b.id)} disabled={sendMut.isPending} aria-label="إرسال البث">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                          </button>
                        )}
                        {b.status === "sending" && canSend && (
                          <button className="btn btn-outline" style={{padding:"4px 8px",fontSize:11,color:"var(--danger)"}} onClick={() => cancelMut.mutate(b.id)} disabled={cancelMut.isPending}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        )}
                        {(b.status === "draft" || b.status === "cancelled") && canEdit && (
                          <button className="btn btn-outline" style={{padding:"4px 8px",fontSize:11,color:"var(--danger)"}} onClick={() => setDeleteTarget(b)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:400}}>
            <div className="cc-header"><div className="cc-title">تأكيد حذف البث</div></div>
            <div style={{padding:16}}>
              <p style={{fontSize:13,color:"var(--muted)",marginBlockEnd:16}}>هل أنت متأكد من حذف <strong>{deleteTarget?.name}</strong>؟ لا يمكن التراجع.</p>
              <div className="qactions" style={{justifyContent:"flex-end"}}>
                <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>إلغاء</button>
                <button className="btn btn-primary" onClick={() => deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}>
                  {deleteMut.isPending ? "جاري..." : "حذف"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="mobile-nav-spacer" />
    </section>
  )
}
