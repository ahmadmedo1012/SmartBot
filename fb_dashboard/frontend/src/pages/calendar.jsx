import { useState, useMemo, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday,
  addMonths, subMonths,
} from "date-fns"
import { arSA } from "date-fns/locale"

const BASE = ""
async function callApi(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: opts.body instanceof FormData ? {} : { "Content-Type": "application/json", ...opts.headers },
  })
  if (!res.ok) { const text = await res.text(); throw new Error(text.slice(0, 200)) }
  return res.json()
}

function fetchCalendarPosts(year, month) { return callApi(`/api/calendar?year=${year}&month=${month}`) }
function fetchDayPosts(year, month, day) { return callApi(`/api/calendar/day?year=${year}&month=${month}&day=${day}`) }
function createCalendarPost(data) { return callApi("/api/calendar", { method: "POST", body: JSON.stringify(data) }) }
function updateCalendarPost(id, data) { return callApi(`/api/calendar/${id}`, { method: "PUT", body: JSON.stringify(data) }) }
function deleteCalendarPost(id) { return callApi(`/api/calendar/${id}`, { method: "DELETE" }) }
function publishCalendarPost(id) { return callApi(`/api/calendar/${id}/publish`, { method: "POST" }) }
function fetchMonthSummary(year, month) { return callApi(`/api/calendar/month-summary?year=${year}&month=${month}`) }

const DAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

const PLATFORM_CONFIG = {
  facebook: { label: "فيسبوك", color: "var(--info)" },
  instagram: { label: "انستغرام", color: "var(--danger)" },
  whatsapp: { label: "واتساب", color: "var(--success)" },
}

const STATUS_CONFIG = {
  draft: { label: "مسودة", color: "var(--muted)" },
  scheduled: { label: "مجدول", color: "var(--warning)" },
  published: { label: "منشور", color: "var(--success)" },
  failed: { label: "فشل", color: "var(--danger)" },
}

const PLATFORM_OPTIONS = [
  { value: "facebook", label: "فيسبوك" },
  { value: "instagram", label: "انستغرام" },
  { value: "whatsapp", label: "واتساب" },
]

function CalendarCell({ day, currentMonth, count, isSelected, onSelect, loading }) {
  const inMonth = isSameMonth(day, currentMonth)
  const today = isToday(day)
  const selected = isSelected && isSameDay(day, isSelected)
  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      style={{
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",
        padding:6,minHeight:60,borderRadius:8,fontSize:12,border:"none",cursor:"pointer",
        background:selected ? "var(--accent-soft)" : "transparent",
        outline:selected ? "2px solid var(--accent)" : today ? "1px solid var(--accent)" : "none",
        color:inMonth ? "var(--text)" : "var(--muted)",
        transition:"background 0.2s, outline 0.2s, box-shadow 0.2s",
        boxShadow: selected ? "var(--shadow-glow)" : "none",
      }}
    >
      <span style={{
        display:"flex",alignItems:"center",justifyContent:"center",width:28,height:28,
        borderRadius:"50%",fontSize:12,fontWeight:500,
        background:today && !selected ? "var(--accent)" : "transparent",
        color:today && !selected ? "#fff" : "inherit",
        boxShadow:today && !selected ? "var(--shadow-glow)" : "none",
      }}>
        {format(day, "d")}
      </span>
      {loading ? (
        <div style={{marginBlockStart:4,width:12,height:12,borderRadius:"50%",background:"var(--skeleton)"}} />
      ) : count > 0 ? (
        <span style={{
          marginBlockStart:4,display:"inline-flex",alignItems:"center",justifyContent:"center",
          minWidth:18,height:18,padding:"0 4px",borderRadius:10,fontSize:10,fontWeight:600,
          background:"var(--accent-soft)",color:"var(--accent)",lineHeight:1,
        }}>
          {count}
        </span>
      ) : null}
    </button>
  )
}

export function ContentCalendar({ role }) {
  useEffect(() => { document.title = "التقويم | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const today = useMemo(() => new Date(), [])
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(today))
  const [selectedDay, setSelectedDay] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPost, setEditingPost] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const year = currentMonth.getFullYear()
  const monthNum = currentMonth.getMonth() + 1

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart)
    const calEnd = endOfWeek(monthEnd)
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  const weeks = useMemo(() => {
    const w = []
    for (let i = 0; i < days.length; i += 7) w.push(days.slice(i, i + 7))
    return w
  }, [days])

  const { data: monthPosts = [], isLoading: monthLoading, error: monthError, refetch: refetchMonth } = useQuery({
    queryKey: ["calendar-posts", year, monthNum],
    queryFn: () => fetchCalendarPosts(year, monthNum),
    staleTime: 15000, refetchOnWindowFocus: true, retry: 2,
    placeholderData: (prev) => prev,
  })

  const { data: monthSummary = {}, isLoading: summaryLoading } = useQuery({
    queryKey: ["calendar-summary", year, monthNum],
    queryFn: () => fetchMonthSummary(year, monthNum),
  })

  const { data: dayPosts = [], isLoading: dayLoading, error: dayError } = useQuery({
    queryKey: ["calendar-day-posts", year, monthNum, selectedDay?.getDate()],
    queryFn: () => fetchDayPosts(year, monthNum, selectedDay.getDate()),
    enabled: !!selectedDay,
  })

  const dayCountMap = useMemo(() => {
    const map = {}
    const list = Array.isArray(monthPosts) ? monthPosts : monthPosts?.items || []
    list.forEach((post) => {
      const d = post.scheduled_at || post.date
      if (d) { const key = format(new Date(d), "yyyy-MM-dd"); map[key] = (map[key] || 0) + 1 }
    })
    return map
  }, [monthPosts])

  const [formData, setFormData] = useState({
    message: "", image_url: "", scheduled_at: "", platform: "facebook",
  })

  function resetForm() { setFormData({ message: "", image_url: "", scheduled_at: "", platform: "facebook" }) }

  useEffect(() => {
    if (editingPost) {
      setFormData({
        message: editingPost.message || "",
        image_url: editingPost.image_url || "",
        scheduled_at: editingPost.scheduled_at ? format(new Date(editingPost.scheduled_at), "yyyy-MM-dd'T'HH:mm") : "",
        platform: editingPost.platform || "facebook",
      })
    }
  }, [editingPost])

  const createMut = useMutation({
    mutationFn: (data) => createCalendarPost(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["calendar-posts"] }); queryClient.invalidateQueries({ queryKey: ["calendar-summary"] }); setDialogOpen(false); resetForm(); toast.success("تم إنشاء المنشور") },
    onError: (e) => toast.error(e.message),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateCalendarPost(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["calendar-posts"] }); queryClient.invalidateQueries({ queryKey: ["calendar-day-posts"] }); queryClient.invalidateQueries({ queryKey: ["calendar-summary"] }); setEditingPost(null); setDialogOpen(false); resetForm(); toast.success("تم تحديث المنشور") },
    onError: (e) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => deleteCalendarPost(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["calendar-posts"] }); queryClient.invalidateQueries({ queryKey: ["calendar-day-posts"] }); queryClient.invalidateQueries({ queryKey: ["calendar-summary"] }); setDeleteTarget(null); toast.success("تم حذف المنشور") },
    onError: (e) => toast.error(e.message),
  })

  const publishMut = useMutation({
    mutationFn: (id) => publishCalendarPost(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["calendar-posts"] }); queryClient.invalidateQueries({ queryKey: ["calendar-day-posts"] }); queryClient.invalidateQueries({ queryKey: ["calendar-summary"] }); toast.success("تم النشر") },
    onError: (e) => toast.error(e.message),
  })

  function goToToday() { const n = new Date(); setCurrentMonth(startOfMonth(n)); setSelectedDay(n) }
  function prevMonth() { setCurrentMonth(p => subMonths(p, 1)); setSelectedDay(null) }
  function nextMonth() { setCurrentMonth(p => addMonths(p, 1)); setSelectedDay(null) }
  function handleDaySelect(day) { setSelectedDay(p => p && isSameDay(p, day) ? null : day) }
  function handleOpenCreate() { setEditingPost(null); resetForm(); setDialogOpen(true) }
  function handleOpenEdit(post) { setEditingPost(post); setDialogOpen(true) }
  function handleDialogClose() { setDialogOpen(false); setEditingPost(null); resetForm() }
  function handleFormSubmit(e) {
    e.preventDefault()
    if (!formData.message.trim()) return
    const payload = { message: formData.message.trim(), image_url: formData.image_url.trim() || null, scheduled_at: formData.scheduled_at || null, platform: formData.platform }
    if (editingPost) { updateMut.mutate({ id: editingPost.id, data: payload }) } else { createMut.mutate(payload) }
  }

  const monthText = format(currentMonth, "MMMM yyyy", { locale: arSA })
  const summary = { total: monthSummary?.total ?? 0, published: monthSummary?.published ?? 0, scheduled: monthSummary?.scheduled ?? 0, draft: monthSummary?.draft ?? 0 }
  const isLoadingInitial = monthLoading && monthPosts.length === 0

  return (
    <section className="page active" dir="rtl" style={{position:"relative",animation:"pageIn 0.35s var(--ease)"}}>
      <div className="mesh-bg"></div>
      <div className="page-header reveal-blur" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <h1 className="gradient-text">التقويم</h1>
          <p>عرض وإدارة المنشورات المجدولة</p>
        </div>
        <div className="qactions" style={{gap:4}}>
          <button className="btn btn-outline" style={{fontSize:11,padding:"4px 10px"}} onClick={goToToday} aria-label="اليوم">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            اليوم
          </button>
          {canEdit && (
            <button className="btn btn-primary" style={{fontSize:12,boxShadow:"var(--shadow-glow)"}} onClick={handleOpenCreate}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              منشور جديد
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid stagger-children" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
        {summaryLoading ? (
          [1,2,3,4].map(i => <div key={i} className="stat-card glass-card" style={{height:60,background:"var(--skeleton)"}} />)
        ) : (
          [
            { label: "الإجمالي", value: summary.total, color: "var(--text)" },
            { label: "منشور", value: summary.published, color: "var(--success)" },
            { label: "مجدول", value: summary.scheduled, color: "var(--warning)" },
            { label: "مسودة", value: summary.draft, color: "var(--muted)" },
          ].map(s => (
            <div key={s.label} className="stat-card glass-card card-premium card-hover-lift reveal-card" style={{textAlign:"center",padding:16}}>
              <div className="stat-value" style={{color:s.color,fontSize:22}}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))
        )}
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBlock:"12px 8px"}}>
        <button className="btn btn-outline" onClick={prevMonth} style={{padding:"4px 8px"}} aria-label="الشهر السابق">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="gradient-text" style={{fontSize:14,fontWeight:600}}>{monthText}</h2>
        <button className="btn btn-outline" onClick={nextMonth} style={{padding:"4px 8px"}} aria-label="الشهر التالي">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {monthError ? (
        <div className="card glass" style={{textAlign:"center",padding:40}}>
          <p style={{color:"var(--muted)",marginBlockEnd:12}}>فشل تحميل التقويم</p>
          <button className="btn btn-outline" onClick={() => refetchMonth()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="card glass" style={{padding:0,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1px solid var(--border)"}}>
            {DAY_NAMES.map(name => (
              <div key={name} style={{padding:"8px 0",textAlign:"center",fontSize:11,fontWeight:500,color:"var(--muted)"}}>{name}</div>
            ))}
          </div>
          {isLoadingInitial ? (
            <div style={{padding:8}}>
              {[1,2,3,4,5].map(row => (
                <div key={row} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBlockEnd:4}}>
                  {[1,2,3,4,5,6,7].map(col => (
                    <div key={col} className="stat-card glass-card" style={{height:60,background:"var(--skeleton)"}} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{padding:6}}>
              {weeks.map((week, wi) => (
                <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                  {week.map(day => {
                    const key = format(day, "yyyy-MM-dd")
                    return (
                      <CalendarCell key={key} day={day} currentMonth={currentMonth} count={dayCountMap[key] || 0} isSelected={selectedDay} onSelect={handleDaySelect} loading={monthLoading} />
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedDay && (
        <div className="card glass" style={{padding:16}}>
          <div className="cc-header" style={{padding:0}}>
            <div className="cc-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {format(selectedDay, "EEEE d MMMM yyyy", { locale: arSA })}
            </div>
            {canEdit && (
              <button className="btn btn-outline" style={{padding:"4px 8px",fontSize:11}} onClick={handleOpenCreate} aria-label="إضافة منشور جديد">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                إضافة
              </button>
            )}
          </div>
          {dayLoading ? (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[1,2].map(i => <div key={i} className="stat-card glass-card" style={{height:80,background:"var(--skeleton)"}} />)}
            </div>
          ) : dayError ? (
            <div style={{textAlign:"center",padding:32}}>
              <p style={{color:"var(--muted)",fontSize:13}}>فشل تحميل المنشورات</p>
            </div>
          ) : (
            <PostsList posts={dayPosts} canEdit={canEdit} onPublish={id => publishMut.mutate(id)} onEdit={handleOpenEdit} onDelete={id => setDeleteTarget(id)} publishPending={publishMut.isPending} deletePending={deleteMut.isPending} />
          )}
        </div>
      )}

      {dialogOpen && (
        <div className="modal-overlay" onClick={handleDialogClose}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:500}}>
            <div className="cc-header"><div className="cc-title">{editingPost ? "تعديل المنشور" : "منشور جديد"}</div></div>
            <form onSubmit={handleFormSubmit} style={{padding:16}}>
              <div className="fld" style={{marginBlockEnd:12}}>
                <label style={{fontSize:12,color:"var(--muted)",display:"block",marginBlockEnd:4}}>نص المنشور</label>
                <textarea className="fld" rows={4} value={formData.message} onChange={e => setFormData(f => ({...f,message:e.target.value}))} required placeholder="اكتب محتوى المنشور..." style={{width:"100%"}} />
              </div>
              <div className="fld" style={{marginBlockEnd:12}}>
                <label style={{fontSize:12,color:"var(--muted)",display:"block",marginBlockEnd:4}}>رابط الصورة (اختياري)</label>
                <input className="fld" value={formData.image_url} onChange={e => setFormData(f => ({...f,image_url:e.target.value}))} placeholder="https://example.com/image.jpg" dir="ltr" style={{width:"100%"}} />
              </div>
              <div className="fld" style={{marginBlockEnd:12}}>
                <label style={{fontSize:12,color:"var(--muted)",display:"block",marginBlockEnd:4}}>تاريخ ووقت النشر (اختياري)</label>
                <input type="datetime-local" className="fld" value={formData.scheduled_at} onChange={e => setFormData(f => ({...f,scheduled_at:e.target.value}))} style={{width:"100%"}} />
              </div>
              <div className="fld" style={{marginBlockEnd:16}}>
                <label style={{fontSize:12,color:"var(--muted)",display:"block",marginBlockEnd:4}}>المنصة</label>
                <select className="fld" value={formData.platform} onChange={e => setFormData(f => ({...f,platform:e.target.value}))} style={{width:"100%"}}>
                  {PLATFORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" type="submit" style={{width:"100%",boxShadow:"var(--shadow-glow)"}} disabled={!formData.message.trim() || createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) ? "جاري..." : editingPost ? (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>تحديث</>
                ) : formData.scheduled_at ? (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>جدولة</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>حفظ كمسودة</>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:380}}>
            <div className="cc-header"><div className="cc-title">تأكيد الحذف</div></div>
            <div style={{padding:16}}>
              <p style={{fontSize:13,color:"var(--muted)",marginBlockEnd:16}}>هل أنت متأكد من حذف هذا المنشور؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="qactions" style={{justifyContent:"flex-end"}}>
                <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>إلغاء</button>
                <button className="btn btn-primary" style={{background:"var(--danger)",borderColor:"var(--danger)",boxShadow:"var(--shadow-glow)"}} onClick={() => deleteMut.mutate(deleteTarget)} disabled={deleteMut.isPending}>
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

function PostsList({ posts, canEdit, onPublish, onEdit, onDelete, publishPending, deletePending }) {
  const list = Array.isArray(posts) ? posts : posts?.items || []
  if (list.length === 0) {
    return (
      <div className="empty-state" style={{marginBlockStart:8}}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{color:"var(--muted)",opacity:0.3}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <p>لا توجد منشورات في هذا اليوم</p>
      </div>
    )
  }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {list.map(post => {
        const pc = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.facebook
        const sc = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft
        const platformIcon = post.platform === "instagram" ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
        ) : post.platform === "whatsapp" ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        )
        return (
          <div key={post.id} className="card glass" style={{padding:12}}>
            <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:13,lineHeight:1.5,marginBlockEnd:6,wordBreak:"break-word"}}>
                  {post.message || <span style={{color:"var(--muted)",fontStyle:"italic"}}>(بدون نص)</span>}
                </p>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span className={`badge ${sc.label === "مسودة" ? "badge-d" : sc.label === "مجدول" ? "badge-w" : "badge-s"}`} style={{fontSize:10}}>{sc.label}</span>
                  <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:"var(--muted)"}}>
                    <span style={{color:pc.color}}>{platformIcon}</span>
                    {pc.label}
                  </span>
                  {post.scheduled_at && (
                    <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,color:"var(--muted)"}}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {format(new Date(post.scheduled_at), "HH:mm")}
                    </span>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className="qactions" style={{gap:2,flexShrink:0}}>
                  {post.status === "scheduled" && (
                    <button className="btn btn-outline" style={{padding:"4px",fontSize:10,color:"var(--success)"}} onClick={() => onPublish(post.id)} disabled={publishPending} title="نشر الآن">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                  )}
                  <button className="btn btn-outline" style={{padding:"4px",fontSize:10,color:"var(--info)"}} onClick={() => onEdit(post)} title="تعديل">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button className="btn btn-outline" style={{padding:"4px",fontSize:10,color:"var(--danger)"}} onClick={() => onDelete(post.id)} disabled={deletePending} title="حذف">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ponytail: week/day view toggle skipped — add when users request it
// ponytail: drag-and-drop reschedule skipped — add when UX requests it
