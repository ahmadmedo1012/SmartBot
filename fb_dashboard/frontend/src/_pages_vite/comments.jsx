import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import { fetchAllComments, replyToComment, hideComment, deleteComment, suggestAiReplies } from "@/lib/api"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/ConfirmDialog"

function timeAgo(dateStr) {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "الآن"
  if (mins < 60) return `منذ ${mins} د`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `منذ ${hrs} س`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `منذ ${days} ي`
  return new Date(dateStr).toLocaleDateString("ar-SA")
}

function getInitials(name) {
  if (!name) return "؟"
  return name.split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "؟"
}

function ReplyDialog({ comment, open, onOpenChange }) {
  const [message, setMessage] = useState("")
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const queryClient = useQueryClient()

  const genAi = useCallback(async () => {
    if (!comment?.message) return
    setAiLoading(true)
    try {
      const d = await suggestAiReplies(comment.message, comment.from_name)
      if (d?.suggestions) setAiSuggestions(d.suggestions)
    } catch {} finally {
      setAiLoading(false)
    }
  }, [comment])

  useEffect(() => {
    if (open) { setMessage(""); setAiSuggestions([]); genAi() }
  }, [open, genAi])

  const replyMut = useMutation({
    mutationFn: () => replyToComment(comment.id, message),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["comments"] }); onOpenChange(false); toast.success("تم إرسال الرد بنجاح") },
    onError: (e) => toast.error(e.message),
  })

  const insertName = () => {
    const name = comment.from_name?.split(" ")[0] || comment.from_name || "المستخدم"
    setMessage((p) => p + `${name} `)
  }

  if (!open) return null
  return (
    <div className="modal-overlay" onClick={() => onOpenChange(false)}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:500}}>
        <div className="cc-header">
          <div className="cc-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            رد على {comment?.from_name || "صاحب التعليق"}
          </div>
        </div>
        <div style={{padding:16}}>
          <div className="card glass" style={{padding:12,marginBlockEnd:12,fontSize:13}}>
            <p style={{fontSize:11,color:"var(--muted)",marginBlockEnd:4}}>التعليق الأصلي:</p>
            <p>{comment?.message}</p>
          </div>

          {aiLoading && (
            <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--info)",marginBlockEnd:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              جاري توليد ردود ذكية...
            </div>
          )}
          {aiSuggestions.length > 0 && (
            <div style={{marginBlockEnd:12}}>
              <p style={{fontSize:11,color:"var(--muted)",marginBlockEnd:6,display:"flex",alignItems:"center",gap:4}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                ردود مقترحة:
              </p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {aiSuggestions.map((s, i) => (
                  <button key={i} onClick={() => setMessage(s)}
                    style={{padding:"4px 10px",borderRadius:8,fontSize:11,background:"var(--info-soft)",border:"1px solid var(--info)",color:"var(--info)",cursor:"pointer",textAlign:"right",maxWidth:250}}>
                    {s.substring(0, 80)}{s.length > 80 ? "..." : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-outline" style={{padding:"4px 12px",fontSize:12,marginBlockEnd:12}} onClick={insertName}>
            @{comment?.from_name?.split(" ")[0] || "الاسم"}
          </button>

          <textarea className="fld" rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="اكتب ردك..." style={{marginBlockEnd:12}} />
          <div className="qactions" style={{justifyContent:"flex-end"}}>
            <button className="btn btn-outline" onClick={() => onOpenChange(false)}>إلغاء</button>
            <button className="btn btn-primary" onClick={() => replyMut.mutate()} disabled={!message.trim() || replyMut.isPending} style={{boxShadow:"var(--shadow-glow)"}}>
              {replyMut.isPending ? "جاري..." : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                إرسال</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Comments({ role }) {
  useEffect(() => { document.title = "التعليقات | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const isAdmin = role === "admin"
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [replyTarget, setReplyTarget] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  const cmInterval = useAdaptiveInterval("normal")
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["comments"], queryFn: () => fetchAllComments(30),
    staleTime: 15000, refetchOnWindowFocus: true, refetchInterval: cmInterval, retry: 2,
    placeholderData: (prev) => prev,
  })

  const comments = data?.items || []
  const filtered = search
    ? comments.filter(c => c.message?.toLowerCase().includes(search.toLowerCase()) || c.from_name?.toLowerCase().includes(search.toLowerCase()))
    : comments

  const hideMut = useMutation({
    mutationFn: (id) => hideComment(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["comments"] }); toast.success("تم إخفاء التعليق") },
    onError: (e) => toast.error(e.message),
  })
  const deleteMut = useMutation({
    mutationFn: (id) => deleteComment(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["comments"] }); toast.success("تم حذف التعليق") },
    onError: (e) => toast.error(e.message),
  })

  const handleConfirm = useCallback(() => {
    if (!confirmAction) return
    if (confirmAction.type === "hide") hideMut.mutate(confirmAction.id)
    if (confirmAction.type === "delete") deleteMut.mutate(confirmAction.id)
    setConfirmAction(null)
  }, [confirmAction])

  return (
    <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur">
        <h1 >مركز التعليقات</h1>
        <p>جميع التعليقات من فيسبوك — رد بذكاء وتحكم بسرعة</p>
      </div>

      <div className="qactions">
        <input className="fld" placeholder="بحث في التعليقات..." aria-label="بحث في التعليقات" value={search} onChange={e => setSearch(e.target.value)} style={{maxWidth:320,width:"100%"}} />
      </div>

      <div className="content-card glass card-premium">
        <div className="cc-header">
          <div className="cc-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            جميع التعليقات
          </div>
          <span className="cc-count">الإجمالي: {filtered.length}</span>
        </div>

        {isLoading ? (
          <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
            {[1,2,3].map(i => <div key={i} className="stat-card glass skel-card" />)}
          </div>
        ) : error ? (
          <div className="empty-state">
            <p>{error?.message || "فشل تحميل التعليقات"}</p>
            <button className="btn btn-outline" onClick={refetch} style={{marginBlockStart:12}}>إعادة المحاولة</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" role="status"><p>{search ? "لا توجد نتائج" : "لا توجد تعليقات"}</p></div>
        ) : (
          <div className="stats-grid stagger-children reveal-card" style={{gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))"}}>
            {filtered.map(c => (
              <div key={c.id} className="stat-card glass-card card-premium card-hover-lift">
              <div className="person-row">
                <div className="person-avatar" style={{background:`hsl(${c.from_name?.length * 37 || 0},55%,45%)`}}>
                  {getInitials(c.from_name)}
                </div>
                <div className="person-info">
                  <div className="p-name">{c.from_name || "مستخدم فيسبوك"}</div>
                  <div className="p-detail">
                    <span className="badge badge-i" style={{fontSize:10,padding:"1px 6px",marginInlineEnd:6}}>{c.from_id?.substring(0,6) || ""}</span>
                    {timeAgo(c.created_time)}
                    {c.replied_at && <span className="badge badge-s" style={{fontSize:10,padding:"1px 6px",marginInlineStart:6}}>تم الرد</span>}
                  </div>
                </div>
              </div>
              <p className="stat-label" style={{fontWeight:400,fontSize:13,lineHeight:1.5,marginBlockStart:8,color:"var(--fg)"}}>{c.message}</p>
              {c.post_message && (
                <p className="stat-change" style={{fontSize:11,marginBlockStart:4}}>على منشور: {c.post_message}</p>
              )}
              {canEdit && (
                <div className="qactions" style={{marginBlockStart:8,gap:4}}>
                  <button className="btn btn-outline" style={{padding:"4px 8px",fontSize:11,color:"var(--info)"}} onClick={() => setReplyTarget(c)}>رد</button>
                  <button className="btn btn-outline" style={{padding:"4px 8px",fontSize:11,color:"var(--warning)"}} onClick={() => setConfirmAction({ type:"hide", id:c.id })}>إخفاء</button>
                  {isAdmin && (
                    <button className="btn btn-outline" style={{padding:"4px 8px",fontSize:11,color:"var(--danger)"}} onClick={() => setConfirmAction({ type:"delete", id:c.id })}>حذف</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      </div>

      {replyTarget && (
        <ReplyDialog comment={replyTarget} open={!!replyTarget} onOpenChange={(o) => { if (!o) setReplyTarget(null) }} />
      )}
      <ConfirmDialog open={!!confirmAction}
        title={confirmAction?.type === "delete" ? "حذف التعليق" : "إخفاء التعليق"}
        message={confirmAction?.type === "delete" ? "هل أنت متأكد من حذف هذا التعليق نهائياً؟" : "إخفاء هذا التعليق؟"}
        confirmLabel={confirmAction?.type === "delete" ? "حذف" : "إخفاء"}
        isLoading={confirmAction?.type === "hide" ? hideMut.isPending : deleteMut.isPending}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)} />
      <div className="mobile-nav-spacer" />
    </section>
  )
}
