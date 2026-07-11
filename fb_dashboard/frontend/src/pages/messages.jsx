import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
import {
  fetchInboxConversations, fetchInboxMessages, replyToInbox,
  fetchInboxTags, assignTagToConversation, removeTagFromConversation,
  createInboxTag, deleteInboxTag, fetchTemplates,
} from "@/lib/api"
import { toast } from "sonner"
import { format } from "date-fns"

function initials(name) {
  if (!name) return "?"
  return name.split(" ").slice(0, 2).map(s => s[0]).join("").toUpperCase()
}

function timeAgo(dateStr) {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "الآن"
  if (mins < 60) return `منذ ${mins} د`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} س`
  const days = Math.floor(hours / 24)
  if (days < 30) return `منذ ${days} ي`
  return format(new Date(dateStr), "yyyy/MM/dd")
}

function formatMsgTime(dateStr) {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const thisYear = d.getFullYear() === now.getFullYear()
  if (sameDay) return format(d, "HH:mm")
  if (thisYear) return format(d, "MMM d, HH:mm")
  return format(d, "yyyy/MM/dd")
}

const FILTERS = [
  { value: "all", label: "الكل" },
  { value: "unread", label: "غير مقروء" },
  { value: "read", label: "مقروء" },
  { value: "needs_reply", label: "بحاجة رد" },
]

const TAG_COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#22c55e", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6"]

function ConvItem({ conv, selectedId, onSelect }) {
  const hasUnread = conv.unread_count > 0
  const selected = selectedId === conv.id
  const gradient = conv.senders?.[0]?.name ? `hsl(${conv.senders[0].name.length * 37 % 360}, 55%, 45%)` : "var(--muted)"
  return (
    <button
      onClick={() => onSelect(conv.id)}
      style={{
        width:"100%",textAlign:"right",padding:12,fontSize:13,cursor:"pointer",
        background:selected ? "var(--accent-soft)" : "transparent",
        border:"none",borderBottom:"1px solid var(--border)",borderRight:`3px solid ${selected ? "var(--accent)" : "transparent"}`,
      }}
    >
      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        <div className="person-avatar" style={{background:gradient,width:44,height:44,fontSize:13,outline:hasUnread ? "2px solid var(--accent)" : "none"}}>
          {initials(conv.senders?.[0]?.name)}
        </div>
        <div style={{minWidth:0,flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
            <p style={{fontSize:13,fontWeight:hasUnread?700:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {conv.subject || conv.senders?.[0]?.name || "بدون موضوع"}
            </p>
            <span style={{fontSize:11,color:"var(--muted)",flexShrink:0}}>{timeAgo(conv.updated_time)}</span>
          </div>
          <p style={{fontSize:12,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBlockStart:4}}>
            {conv.senders?.map(s => s.name).join("، ") || "غير معروف"}
          </p>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBlockStart:6}}>
            <span style={{fontSize:11,color:"var(--muted)"}}>{conv.message_count} رسالة</span>
            {hasUnread && (
              <span className="badge badge-d" style={{fontSize:10,minWidth:18,height:18,padding:"0 4px",borderRadius:9,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
                {conv.unread_count}
              </span>
            )}
            {conv.tags?.length > 0 && (
              <div style={{display:"flex",gap:4}}>
                {conv.tags.slice(0, 3).map(t => (
                  <span key={t.id} style={{width:8,height:8,borderRadius:"50%",background:t.color}} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

export function Messages({ role }) {
  useEffect(() => { document.title = "صندوق الوارد | SmartBot" }, [])
  const canEdit = role === "admin" || role === "editor"
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState(null)
  const [replyText, setReplyText] = useState("")
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState("#6366f1")
  const [showTemplates, setShowTemplates] = useState(false)
  const [optimisticMessages, setOptimisticMessages] = useState([])
  const replyInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  const convInterval = useAdaptiveInterval("normal")
  const msgInterval = useAdaptiveInterval("critical")

  useEffect(() => {
    if (selectedId) {
      const saved = localStorage.getItem(`msg-draft-${selectedId}`)
      setReplyText(saved || "")
    } else setReplyText("")
  }, [selectedId])

  useEffect(() => {
    if (selectedId && replyText) localStorage.setItem(`msg-draft-${selectedId}`, replyText)
  }, [replyText, selectedId])

  const { data, isLoading } = useQuery({
    queryKey: ["inbox-conversations", filter, search],
    queryFn: () => fetchInboxConversations(filter, "", search),
    staleTime: 10000, refetchOnWindowFocus: true, refetchInterval: convInterval, retry: 2,
    placeholderData: (prev) => prev,
  })
  const conversations = data?.items || []
  const total = data?.total || 0

  const { data: messages = [], isLoading: msgLoading, refetch: refetchMsgs } = useQuery({
    queryKey: ["inbox-messages", selectedId],
    queryFn: () => fetchInboxMessages(selectedId),
    enabled: !!selectedId, staleTime: 5000, refetchOnWindowFocus: true, refetchInterval: msgInterval, retry: 2,
    placeholderData: (prev) => prev,
  })

  const { data: tags = [] } = useQuery({ queryKey: ["inbox-tags"], queryFn: fetchInboxTags })
  const { data: templates = [] } = useQuery({ queryKey: ["templates"], queryFn: () => fetchTemplates() })

  const scrollToBottom = useCallback((smooth = true) => {
    setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" }) }, 50)
  }, [])

  useEffect(() => { if (messages.length > 0) scrollToBottom(true) }, [messages, scrollToBottom])

  const selectedConv = useMemo(() => conversations.find(c => c.id === selectedId), [conversations, selectedId])

  const sendMut = useMutation({
    mutationFn: () => replyToInbox(selectedId, replyText),
    onMutate: async () => {
      const text = replyText
      setReplyText("")
      if (selectedId) localStorage.removeItem(`msg-draft-${selectedId}`)
      const optimisticMsg = { id: `opt-${Date.now()}`, message: text, from: { name: "أنت", id: "page" }, created_time: new Date().toISOString(), _optimistic: true }
      setOptimisticMessages(prev => [...prev, optimisticMsg])
      scrollToBottom(true)
      return { text }
    },
    onSuccess: () => { refetchMsgs(); queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] }); setOptimisticMessages([]) },
    onError: (e, __, ctx) => { setOptimisticMessages([]); toast.error(e.message || "فشل الإرسال"); if (ctx?.text) setReplyText(ctx.text) },
  })

  const assignTagMut = useMutation({
    mutationFn: ({ convId, tagId }) => assignTagToConversation(convId, tagId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] }); toast.success("تم إضافة الوسم") },
    onError: (e) => toast.error(e.message),
  })
  const removeTagMut = useMutation({
    mutationFn: ({ convId, tagId }) => removeTagFromConversation(convId, tagId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] }) },
    onError: (e) => toast.error(e.message),
  })
  const createTagMut = useMutation({
    mutationFn: () => createInboxTag(newTagName, newTagColor),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inbox-tags"] }); setNewTagName(""); setShowTagDialog(false); toast.success("تم إنشاء الوسم") },
    onError: (e) => toast.error(e.message),
  })
  const deleteTagMut = useMutation({
    mutationFn: (id) => deleteInboxTag(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inbox-tags"] }); toast.success("تم حذف الوسم") },
    onError: (e) => toast.error(e.message),
  })

  const insertTemplate = (text) => { setReplyText(prev => prev + text); setShowTemplates(false); setTimeout(() => replyInputRef.current?.focus(), 100) }

  const allMessages = useMemo(() => {
    if (optimisticMessages.length === 0) return messages
    const realIds = new Set(messages.map(m => m.id))
    return [...messages, ...optimisticMessages.filter(o => !realIds.has(o.id))]
  }, [messages, optimisticMessages])

  const handleSend = useCallback(() => { if (replyText.trim() && !sendMut.isPending) sendMut.mutate() }, [replyText, sendMut])
  const handleSelectConv = useCallback((id) => { setSelectedId(prev => prev === id ? null : id); setOptimisticMessages([]); setShowTemplates(false) }, [])

  return (
    <section className="page active" dir="rtl" style={{animation:"pageIn 0.35s ease",height:"100%",display:"flex",flexDirection:"column"}}>
      <div style={{display:"flex",flex:1,overflow:"hidden",gap:0}}>
        {/* ─── LEFT: CONVERSATIONS ─── */}
        <div className={`card glass`} style={{display:"flex",flexDirection:"column",width:selectedId ? [0,0,"380px"] : "100%",overflow:"hidden",borderRadius:0,border:"none",flexShrink:0}}>
          <div style={{padding:"16px 16px 8px",borderBottom:"1px solid var(--border)"}}>
            <h2 style={{fontSize:14,fontWeight:700,marginBlockEnd:8}}>المحادثات <span style={{fontSize:11,color:"var(--muted)",fontWeight:400}}>{total}</span></h2>
            <div className="fld" style={{position:"relative",marginBlockEnd:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:"var(--muted)",pointerEvents:"none"}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="fld" placeholder="بحث..." aria-label="بحث في المحادثات" value={search} onChange={e => { setSearch(e.target.value); setSelectedId(null) }} style={{width:"100%",paddingRight:32}} />
              {search && (
                <button onClick={() => setSearch("")} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",color:"var(--muted)",padding:0}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            <div className="qactions" style={{gap:4,flexWrap:"wrap"}}>
              {FILTERS.map(f => (
                <button key={f.value} className={`btn ${filter === f.value ? "btn-primary" : "btn-outline"}`} style={{padding:"4px 10px",fontSize:11}} onClick={() => { setFilter(f.value); setSelectedId(null) }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
            {isLoading ? (
              <div style={{padding:12}}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} style={{display:"flex",gap:12,padding:8}}>
                    <div className="stat-card glass" style={{width:44,height:44,borderRadius:"50%",background:"var(--skeleton)",flexShrink:0}} />
                    <div style={{flex:1}}><div className="stat-card glass" style={{height:12,width:"70%",background:"var(--skeleton)",marginBlockEnd:8}} /><div className="stat-card glass" style={{height:10,width:"40%",background:"var(--skeleton)"}} /></div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="empty-state" style={{padding:"40px 16px"}}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{color:"var(--muted)",opacity:0.3,marginBlockEnd:12}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <p>{search ? "لا توجد نتائج" : "لا توجد محادثات"}</p>
              </div>
            ) : (
              conversations.map((conv, idx) => <ConvItem key={conv.id} conv={conv} idx={idx} selectedId={selectedId} onSelect={handleSelectConv} />)
            )}
          </div>
          {canEdit && (
            <div style={{padding:"8px 12px",borderTop:"1px solid var(--border)"}}>
              <button className="btn btn-outline" style={{fontSize:12,width:"100%",justifyContent:"center"}} onClick={() => setShowTagDialog(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                وسم جديد
              </button>
            </div>
          )}
        </div>

        {/* ─── RIGHT: CONVERSATION DETAIL ─── */}
        {!selectedId ? (
          <div className="card glass" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:0,border:"none"}}>
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{color:"var(--muted)",opacity:0.3,marginBlockEnd:12}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <p>اختر محادثة</p>
            </div>
          </div>
        ) : (
          <div className="card glass" style={{flex:1,display:"flex",flexDirection:"column",borderRadius:0,border:"none",minWidth:0}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
              <button className="btn btn-outline" style={{padding:"4px 6px",fontSize:12}} onClick={() => setSelectedId(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div className="person-row" style={{flex:1}}>
                <div className="person-avatar" style={{width:36,height:36,fontSize:12,background:`hsl(${(selectedConv?.senders?.[0]?.name?.length || 0) * 37 % 360},55%,45%)`}}>
                  {initials(selectedConv?.senders?.[0]?.name)}
                </div>
                <div className="person-info">
                  <div className="p-name">{selectedConv?.subject || selectedConv?.senders?.[0]?.name || "بدون موضوع"}</div>
                  <div className="p-detail">{selectedConv?.senders?.map(s => s.name).join("، ") || "غير معروف"}{selectedConv?.unread_count > 0 && ` · ${selectedConv.unread_count} غير مقروءة`}</div>
                </div>
              </div>
              {canEdit && tags.length > 0 && (
                <div style={{display:"flex",gap:4}}>
                  {(selectedConv?.tags || []).map(t => (
                    <span key={t.id} className="badge badge-s" style={{fontSize:10,background:t.color+"18",color:t.color}}>
                      {t.name}
                      <span onClick={() => removeTagMut.mutate({ convId: selectedId, tagId: t.id })}
                        style={{cursor:"pointer",marginInlineStart:4,opacity:0.6,display:"inline-flex"}}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </span>
                    </span>
                  ))}
                  <div style={{position:"relative"}} className="qactions">
                    {tags.filter(t => !(selectedConv?.tags || []).find(ct => ct.id === t.id)).map(t => (
                      <button key={t.id} className="btn btn-outline" style={{padding:"4px 8px",fontSize:10}} onClick={() => assignTagMut.mutate({ convId: selectedId, tagId: t.id })}>
                        <span style={{width:6,height:6,borderRadius:"50%",background:t.color,display:"inline-block",marginInlineEnd:4}} />
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Messages */}
            <div ref={messagesEndRef} style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:8}}>
              {msgLoading && messages.length === 0 ? (
                [1,2,3].map(i => (
                  <div key={i} style={{display:"flex",justifyContent:i%2===0?"flex-end":"flex-start"}}>
                    <div className="stat-card glass" style={{height:40,width:i%2===0?"60%":"40%",borderRadius:12,background:"var(--skeleton)"}} />
                  </div>
                ))
              ) : allMessages.length === 0 ? (
                <div className="empty-state" style={{flex:1}}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{color:"var(--muted)",opacity:0.3,marginBlockEnd:8}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <p>لا توجد رسائل بعد</p>
                </div>
              ) : (
                [...allMessages].reverse().map((m, idx) => {
                  const isPage = m.from?.id === "page" || m.from?.id?.includes("page") || m._optimistic
                  return (
                    <div key={m.id || `msg-${idx}`} style={{display:"flex",justifyContent:isPage?"flex-end":"flex-start",animation:`pageIn 0.2s ease ${Math.min(idx*0.03,0.15)}s both`}}>
                      <div style={{maxWidth:"75%",minWidth:100}}>
                        <div style={{
                          padding:"10px 14px",fontSize:13,lineHeight:1.5,
                          background:isPage ? "var(--accent)" : "var(--bg)",
                          color:isPage ? "#fff" : "var(--text)",
                          borderRadius:12,
                          borderBottomRightRadius:isPage ? 4 : 12,
                          borderBottomLeftRadius:isPage ? 12 : 4,
                        }}>
                          <p style={{whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{m.message || <span style={{opacity:0.6,fontStyle:"italic"}}>(وسائط)</span>}</p>
                          <div style={{display:"flex",alignItems:"center",gap:4,marginBlockStart:4,justifyContent:isPage?"flex-end":"flex-start"}}>
                            <span style={{fontSize:10,opacity:0.7}}>{m.created_time ? formatMsgTime(m.created_time) : ""}</span>
                            {isPage &&
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.6}}><polyline points="20 6 9 17 4 12"/></svg>}
                          </div>
                        </div>
                        {!isPage && m.from?.name && <p style={{fontSize:10,color:"var(--muted)",marginBlockStart:2,paddingInline:4}}>{m.from.name}</p>}
                      </div>
                    </div>
                  )
                })
              )}
              <div style={{height:4}} />
            </div>

            {/* Input */}
            <div style={{borderTop:"1px solid var(--border)",padding:12,display:"flex",flexDirection:"column",gap:8}}>
              {showTemplates && templates.length > 0 && (
                <div style={{padding:"8px 12px",background:"var(--skeleton)",borderRadius:8}}>
                  <p style={{fontSize:10,color:"var(--muted)",marginBlockEnd:6}}>الردود السريعة:</p>
                  <div className="qactions" style={{gap:4,flexWrap:"wrap"}}>
                    {templates.map(t => (
                      <button key={t.id} className="btn btn-outline" style={{padding:"4px 10px",fontSize:11}} onClick={() => insertTemplate(t.text)}>
                        {t.shortcut && <span style={{fontSize:10}}>{t.shortcut} </span>}{t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                <button className="btn btn-outline" style={{padding:"8px",fontSize:12,flexShrink:0}} onClick={() => setShowTemplates(s => !s)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </button>
                <textarea
                  ref={replyInputRef}
                  className="fld"
                  rows={1}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="اكتب رسالتك..."
                  style={{flex:1,resize:"none",minHeight:44,maxHeight:120,borderRadius:12}}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (replyText.trim() && !sendMut.isPending) handleSend() } }}
                />
                <button className="btn btn-primary" style={{width:44,height:44,borderRadius:12,padding:0,justifyContent:"center"}} onClick={handleSend} disabled={!replyText.trim() || sendMut.isPending}>
                  {sendMut.isPending ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{animation:"spin 1s linear infinite"}}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showTagDialog && (
        <div className="modal-overlay" onClick={() => setShowTagDialog(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:400}}>
            <div className="cc-header"><div className="cc-title">وسم جديد</div></div>
            <div style={{padding:16}}>
              <div className="fld" style={{marginBlockEnd:12}}>
                <label style={{fontSize:12,color:"var(--muted)",display:"block",marginBlockEnd:4}}>اسم الوسم</label>
                <input className="fld" value={newTagName} onChange={e => setNewTagName(e.target.value)} style={{width:"100%"}} />
              </div>
              <p style={{fontSize:12,color:"var(--muted)",marginBlockEnd:6}}>اللون</p>
              <div className="qactions" style={{gap:4,marginBlockEnd:16,flexWrap:"wrap"}}>
                {TAG_COLORS.map(c => (
                  <button key={c} onClick={() => setNewTagColor(c)}
                    style={{
                      width:28,height:28,borderRadius:"50%",background:c,
                      border: newTagColor === c ? "3px solid var(--text)" : "2px solid transparent",
                      cursor:"pointer",padding:0,
                    }} />
                ))}
              </div>
              <button className="btn btn-primary" style={{width:"100%"}} onClick={() => createTagMut.mutate()} disabled={!newTagName.trim()}>
                {createTagMut.isPending ? "جاري..." : "إنشاء الوسم"}
              </button>
              {tags.length > 0 && (
                <div style={{marginBlockStart:16,paddingBlockStart:12,borderTop:"1px solid var(--border)"}}>
                  <p style={{fontSize:11,color:"var(--muted)",marginBlockEnd:8}}>الوسوم الموجودة:</p>
                  <div className="qactions" style={{gap:4,flexWrap:"wrap"}}>
                    {tags.map(t => (
                      <span key={t.id} className="badge badge-s" style={{fontSize:11,background:t.color+"18",color:t.color,cursor:"default"}}>
                        {t.name}
                        <span onClick={() => deleteTagMut.mutate(t.id)} style={{cursor:"pointer",marginInlineStart:4,opacity:0.6,display:"inline-flex"}}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mobile-nav-spacer" />
    </section>
  )
}
