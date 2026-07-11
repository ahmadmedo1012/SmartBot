import { useState, useMemo, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import { fetchPosts, publishPost, deletePost } from "@/lib/api"
import { toast } from "sonner"
import { format } from "date-fns"

export function Posts({ role }) {
  useEffect(() => { document.title = "المنشورات | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [showPublish, setShowPublish] = useState(false)
  const [message, setMessage] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const perPage = 10

  const pInterval = useAdaptiveInterval("normal")
  const { data: postsRes, isLoading, error, refetch } = useQuery({
    queryKey: ["posts", page, perPage], queryFn: () => fetchPosts(page, perPage),
    staleTime: 15000, refetchOnWindowFocus: true, refetchInterval: pInterval, retry: 2,
    placeholderData: (prev) => prev,
  })

  const items = useMemo(() => { const r = postsRes; return Array.isArray(r) ? r : r?.items || [] }, [postsRes])
  const total = postsRes?.total ?? items.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(p => p.message?.toLowerCase().includes(q))
  }, [items, search])

  const publishMut = useMutation({
    mutationFn: () => publishPost(message),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["posts"] }); setShowPublish(false); setMessage(""); setImageUrl(""); toast.success("تم النشر") },
    onError: (e) => toast.error(e.message),
  })

  const delPost = useMutation({
    mutationFn: (id) => deletePost(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["posts"] }); toast.success("تم الحذف") },
    onError: (e) => toast.error(e.message),
  })

  return (
    <section className="page active">
      <div className="page-header">
        <h1>المنشورات</h1>
        <p>إدارة منشورات الصفحة</p>
      </div>

      <div className="qactions">
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowPublish(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            نشر منشور
          </button>
        )}
        <input className="fld" placeholder="بحث في المنشورات..." value={search} onChange={e => setSearch(e.target.value)}
          style={{maxWidth:280,width:"100%"}} />
      </div>

      {isLoading ? (
        <div className="stats-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))"}}>
          {[1,2,3].map(i => <div key={i} className="stat-card glass" style={{height:100,background:"var(--skeleton)"}} />)}
        </div>
      ) : error ? (
        <div className="card glass" style={{textAlign:"center",padding:40}}>
          <p style={{color:"var(--muted)",marginBlockEnd:12}}>{error?.message || "فشل تحميل المنشورات"}</p>
          <button className="btn btn-outline" onClick={() => refetch()}>إعادة المحاولة</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>{search ? "لا توجد نتائج" : "لا توجد منشورات"}</p></div>
      ) : (
        <div className="stats-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))"}}>
          {filtered.map(p => (
            <div key={p.id} className="stat-card glass">
              <p className="stat-label" style={{fontWeight:400,fontSize:13,lineHeight:1.5}}>
                {p.message || <span style={{color:"var(--muted)",fontStyle:"italic"}}>(بدون نص)</span>}
              </p>
              <div className="stat-change" style={{marginBlockStart:8}}>
                {p.created_time ? format(new Date(p.created_time), "yyyy/MM/dd") : ""}
              </div>
              {canEdit && (
                <button className="btn btn-outline" style={{marginBlockStart:8,padding:"4px 12px",fontSize:12}}
                  onClick={() => { if (confirm("حذف المنشور؟")) delPost.mutate(p.id) }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  حذف
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="qactions" style={{justifyContent:"center"}}>
          <button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span style={{fontSize:13,color:"var(--muted)"}}>صفحة {page} من {totalPages}</span>
          <button className="btn btn-outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}

      {/* Publish Dialog */}
      {showPublish && (
        <div className="modal-overlay" onClick={() => setShowPublish(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="cc-header">
              <div className="cc-title">نشر منشور جديد</div>
              <button className="btn btn-outline" style={{padding:"4px 8px"}} onClick={() => setShowPublish(false)}>✕</button>
            </div>
            <form onSubmit={e => { e.preventDefault(); publishMut.mutate() }} style={{padding:16}}>
              <div className="fld" style={{marginBlockEnd:12}}>
                <textarea className="fld" rows={4} placeholder="اكتب محتوى المنشور..." value={message} onChange={e => setMessage(e.target.value)} required style={{width:"100%"}} />
              </div>
              <input className="fld" placeholder="رابط الصورة (اختياري)" value={imageUrl} onChange={e => setImageUrl(e.target.value)} style={{width:"100%",marginBlockEnd:12}} />
              <div className="qactions" style={{justifyContent:"flex-end"}}>
                <button className="btn btn-outline" type="button" onClick={() => setShowPublish(false)}>إلغاء</button>
                <button className="btn btn-primary" type="submit" disabled={publishMut.isPending}>
                  {publishMut.isPending ? "جاري..." : "نشر"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="mobile-nav-spacer" />
    </section>
  )
}
