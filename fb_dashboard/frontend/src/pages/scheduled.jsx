import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import { fetchScheduledPosts, createScheduledPost, publishScheduledPost, deleteScheduledPost } from "@/lib/api"
import { toast } from "sonner"
import { format } from "date-fns"
import { arSA } from "date-fns/locale"

const statusMap = {
  draft: { label: "مسودة", cls: "badge-w" },
  scheduled: { label: "مجدول", cls: "badge-i" },
  published: { label: "منشور", cls: "badge-s" },
  failed: { label: "فشل", cls: "badge-d" },
}

export function ScheduledPosts({ role }) {
  useEffect(() => { document.title = "المنشورات المجدولة | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [message, setMessage] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")

  const schedInterval = useAdaptiveInterval("normal")
  const { data: posts = [], isLoading, error, refetch } = useQuery({
    queryKey: ["scheduled-posts", filter], queryFn: () => fetchScheduledPosts(filter),
    staleTime: 15000, refetchOnWindowFocus: true, refetchInterval: schedInterval, retry: 2,
    placeholderData: (prev) => prev,
  })

  const createMut = useMutation({
    mutationFn: () => createScheduledPost(message, imageUrl, scheduledAt),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] }); setShowAdd(false); setMessage(""); setImageUrl(""); setScheduledAt(""); toast.success("تم إنشاء المنشور") },
    onError: (e) => toast.error(e.message),
  })
  const publishMut = useMutation({
    mutationFn: (id) => publishScheduledPost(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] }); toast.success("تم النشر") },
    onError: (e) => toast.error(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteScheduledPost(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] }); toast.success("تم الحذف") },
    onError: (e) => toast.error(e.message),
  })

  return (
    <section className="page active">
      <div className="page-header">
        <h1>المنشورات المجدولة</h1>
        <p>إنشاء وجدولة ونشر منشورات فيسبوك</p>
      </div>

      <div className="qactions">
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            منشور جديد
          </button>
        )}
      </div>

      <div className="qactions" style={{gap:4}}>
        {[{ v: "", l: "الكل" }, { v: "draft", l: "مسودة" }, { v: "scheduled", l: "مجدول" }, { v: "published", l: "منشور" }].map(f => (
          <button key={f.v} className={`btn ${filter === f.v ? "btn-primary" : "btn-outline"}`} style={{padding:"4px 12px",fontSize:12}} onClick={() => setFilter(f.v)}>
            {f.l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="stats-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))"}}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="stat-card glass" style={{height:160,background:"var(--skeleton)"}} />)}
        </div>
      ) : error ? (
        <div className="card glass" style={{textAlign:"center",padding:40}}>
          <p style={{color:"var(--muted)",marginBlockEnd:12}}>فشل تحميل المنشورات</p>
          <button className="btn btn-outline" onClick={refetch}>إعادة المحاولة</button>
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-state"><p>لا توجد منشورات</p></div>
      ) : (
        <div className="stats-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))"}}>
          {posts.map(p => {
            const st = statusMap[p.status] || statusMap.draft
            return (
              <div key={p.id} className="stat-card glass">
                <div className="stat-label" style={{fontWeight:400,fontSize:13,lineHeight:1.5}}>{p.message}</div>
                <span className={`badge ${st.cls}`} style={{marginBlock:"8px",display:"inline-block"}}>{st.label}</span>
                {p.scheduled_at && (
                  <div className="stat-change" style={{fontSize:11}}>{format(new Date(p.scheduled_at), "yyyy/MM/dd HH:mm", { locale: arSA })}</div>
                )}
                {canEdit && p.status !== "published" && (
                  <div className="qactions" style={{marginBlockStart:8,gap:4}}>
                    {p.status === "scheduled" && (
                      <button className="btn btn-outline" style={{padding:"4px 8px",fontSize:11}} onClick={() => publishMut.mutate(p.id)}>نشر</button>
                    )}
                    <button className="btn btn-outline" style={{padding:"4px 8px",fontSize:11}} onClick={() => deleteMut.mutate(p.id)}>حذف</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Dialog */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="cc-header">
              <div className="cc-title">منشور جديد</div>
              <button className="btn btn-outline" style={{padding:"4px 8px"}} onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div style={{padding:16}}>
              <div className="fld" style={{marginBlockEnd:12}}>
                <label style={{display:"block",fontSize:12,color:"var(--muted)",marginBlockEnd:4}}>نص المنشور</label>
                <textarea className="fld" rows={4} value={message} onChange={e => setMessage(e.target.value)} style={{width:"100%"}} />
              </div>
              <div className="fld" style={{marginBlockEnd:12}}>
                <label style={{display:"block",fontSize:12,color:"var(--muted)",marginBlockEnd:4}}>رابط الصورة (اختياري)</label>
                <input className="fld" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." style={{width:"100%"}} />
              </div>
              <div className="fld" style={{marginBlockEnd:12}}>
                <label style={{display:"block",fontSize:12,color:"var(--muted)",marginBlockEnd:4}}>تاريخ النشر (اختياري)</label>
                <input type="datetime-local" className="fld" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} style={{width:"100%"}} />
              </div>
              <button className="btn btn-primary" style={{width:"100%"}} onClick={() => createMut.mutate()} disabled={!message.trim() || createMut.isPending}>
                {createMut.isPending ? "جاري..." : scheduledAt ? "جدولة" : "حفظ كمسودة"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mobile-nav-spacer" />
    </section>
  )
}
