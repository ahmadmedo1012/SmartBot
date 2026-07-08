import { useState, useEffect, useRef, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  fetchInboxConversations, fetchInboxMessages, replyToInbox,
  fetchInboxTags, assignTagToConversation, removeTagFromConversation,
  createInboxTag, deleteInboxTag, fetchTemplates,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { format } from "date-fns"
import { motion } from "framer-motion"
import {
  Inbox, Search, Send, Tag, Plus, X, MessageSquare,
  ChevronRight, Mail, MailOpen, Reply,
  Bookmark,
} from "lucide-react"

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

const FILTERS = [
  { value: "all", label: "الكل", icon: Inbox },
  { value: "unread", label: "غير مقروء", icon: Mail },
  { value: "read", label: "مقروء", icon: MailOpen },
  { value: "needs_reply", label: "بحاجة رد", icon: Reply },
]

const TAG_COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#22c55e", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6"]

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
  const replyInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ["inbox-conversations", filter, search],
    queryFn: () => fetchInboxConversations(filter, "", search),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  })
  const conversations = data?.items || []
  const total = data?.total || 0

  const { data: messages = [], isLoading: msgLoading, refetch: refetchMsgs } = useQuery({
    queryKey: ["inbox-messages", selectedId],
    queryFn: () => fetchInboxMessages(selectedId),
    enabled: !!selectedId,
    refetchInterval: 10000,
  })

  const { data: tags = [] } = useQuery({
    queryKey: ["inbox-tags"],
    queryFn: fetchInboxTags,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: () => fetchTemplates(),
  })

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const selectedConv = useMemo(
    () => conversations.find(c => c.id === selectedId),
    [conversations, selectedId]
  )

  const sendMut = useMutation({
    mutationFn: () => replyToInbox(selectedId, replyText),
    onSuccess: () => { setReplyText(""); refetchMsgs(); queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] }); toast.success("تم إرسال الرسالة") },
    onError: (e) => toast.error(e.message),
  })

  const assignTagMut = useMutation({
    mutationFn: ({ convId, tagId }) => assignTagToConversation(convId, tagId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] }); toast.success("تم إضافة الوسم") },
    onError: (e) => toast.error(e.message),
  })
  const removeTagMut = useMutation({
    mutationFn: ({ convId, tagId }) => removeTagFromConversation(convId, tagId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] }); },
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

  const insertTemplate = (text) => {
    setReplyText(prev => prev + text)
    setShowTemplates(false)
    if (replyInputRef.current) replyInputRef.current.focus()
  }

  return (
    <div className="flex flex-col h-[calc(100svh-3.5rem)] sm:-mx-6 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
        <div>
          <h1 className="text-gradient-premium text-2xl font-bold tracking-tight">صندوق الوارد</h1>
          <p className="text-sm text-muted-foreground">إدارة احترافية لرسائل ومحادثات الصفحة</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
            <DialogTrigger asChild>
              {canEdit && <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-0 cursor-pointer"><Plus className="ml-1 h-4 w-4" />وسم جديد</Button>}
            </DialogTrigger>
            <DialogContent className="glass-heavy">
              <DialogHeader><DialogTitle>وسم جديد</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <Input placeholder="اسم الوسم" value={newTagName} onChange={e => setNewTagName(e.target.value)} />
                <div className="flex gap-2 flex-wrap">
                  {TAG_COLORS.map(c => (
                    <button key={c} onClick={() => setNewTagColor(c)}
                      aria-label={`اختيار لون الوسم ${c}`}
                      className={`size-8 rounded-full border-2 transition-all cursor-pointer ${newTagColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
                <Button onClick={() => createTagMut.mutate()} disabled={!newTagName.trim()} className="w-full">إنشاء الوسم</Button>
                {tags.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground">الوسوم الموجودة:</p>
                    <div className="flex flex-wrap gap-2">
                      {tags.map(t => (
                        <div key={t.id} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs" style={{ backgroundColor: t.color + "20", color: t.color }}>
                          {t.name}
                          <X className="size-3 cursor-pointer opacity-60 hover:opacity-100" aria-label={`حذف الوسم ${t.name}`} onClick={() => deleteTagMut.mutate(t.id)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={() => setShowTemplates(!showTemplates)} className="min-h-[44px] sm:min-h-0 cursor-pointer">
            <Bookmark className="ml-1 h-4 w-4" />
            الردود السريعة
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar: conversation list ── */}
        <div className={`w-full lg:w-[380px] xl:w-[420px] border-l shrink-0 flex flex-col ${selectedId ? "hidden lg:flex" : "flex"}`}>
          {/* Filters */}
          <div className="px-4 py-2 space-y-2 shrink-0">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث في المحادثات..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 h-9 text-sm" />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {FILTERS.map(({ value, label, icon: Icon }) => (
                <button key={value} onClick={() => { setFilter(value); setSelectedId(null) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer
                    ${filter === value ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70"}`}>
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1,2,3,4,5,6].map(i => <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}><Skeleton className="h-[72px] w-full rounded-lg" /></motion.div>)}
              </div>
            ) : conversations.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16 text-center">
                <Inbox className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-sm text-muted-foreground">لا توجد محادثات</p>
              </motion.div>
            ) : (
              <div className="space-y-0.5 px-2 py-1">
                {conversations.map((conv, idx) => (
                  <motion.div key={conv.id} initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.025, duration: 0.2 }}>
                  <button onClick={() => setSelectedId(conv.id)}
                    className={`w-full text-right p-3 rounded-lg transition-all text-sm cursor-pointer
                      ${selectedId === conv.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50 border border-transparent"}
                      ${conv.unread_count > 0 ? "bg-accent/30" : ""}`}>
                    <div className="flex items-start gap-3">
                      <Avatar className="size-10 shrink-0">
                        <AvatarFallback className={`text-xs font-semibold ${conv.unread_count > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {initials(conv.senders?.[0]?.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${conv.unread_count > 0 ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                            {conv.subject || conv.senders?.[0]?.name || "بدون موضوع"}
                          </p>
                          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(conv.updated_time)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {conv.senders?.map(s => s.name).join("، ") || "غير معروف"}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs font-medium text-muted-foreground">{conv.message_count} رسالة</span>
                          {conv.unread_count > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">{conv.unread_count}</Badge>
                          )}
                          {conv.tags?.length > 0 && (
                            <div className="flex gap-1">
                              {conv.tags.slice(0, 2).map(t => (
                                <span key={t.id} className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                              ))}
                              {conv.tags.length > 2 && <span className="text-[10px] text-muted-foreground">+{conv.tags.length - 2}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                  </motion.div>
                ))}
              </div>
            )}
            {total > 0 && (
              <div className="text-center text-xs text-muted-foreground py-3 border-t shrink-0">
                {total} محادثة · {conversations.filter(c => c.unread_count > 0).length} غير مقروءة
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: conversation detail ── */}
        <div className={`flex-1 flex flex-col ${selectedId ? "flex" : "hidden lg:flex"}`}>
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground/20 mb-4" />
                <p className="text-lg font-medium text-foreground">اختر محادثة</p>
                <p className="text-sm text-muted-foreground">اختر محادثة من القائمة لعرض الرسائل</p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="lg:hidden cursor-pointer" onClick={() => setSelectedId(null)} aria-label="العودة للقائمة">
                    <ChevronRight className="size-5" />
                  </Button>
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials(selectedConv?.senders?.[0]?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {selectedConv?.subject || selectedConv?.senders?.[0]?.name || "بدون موضوع"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedConv?.senders?.map(s => s.name).join("، ") || "غير معروف"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 max-w-[150px]">
                    {(selectedConv?.tags || []).map(t => (
                      <span key={t.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ backgroundColor: t.color + "20", color: t.color }}>
                        {t.name}
                        {canEdit && <X className="size-2.5 cursor-pointer" aria-label={`إزالة وسم ${t.name}`} onClick={() => removeTagMut.mutate({ convId: selectedId, tagId: t.id })} />}
                      </span>
                    ))}
                  </div>
                  {/* Tag assign dropdown */}
                  {canEdit && tags.length > 0 && (
                    <div className="relative group">
                      <Button variant="ghost" size="icon" className="size-8 cursor-pointer" aria-label="إضافة وسم">
                        <Tag className="size-4 text-muted-foreground" />
                      </Button>
                      <div className="absolute left-0 top-full mt-1 bg-card border rounded-lg shadow-lg p-2 z-50 hidden group-hover:block min-w-[140px]">
                        {tags.filter(t => !(selectedConv?.tags || []).find(ct => ct.id === t.id)).map(t => (
                          <button key={t.id} onClick={() => assignTagMut.mutate({ convId: selectedId, tagId: t.id })}
                            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-muted text-right cursor-pointer">
                            <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {msgLoading ? (
                  <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full max-w-[60%]" />)}</div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">لا توجد رسائل</p>
                  </div>
                ) : (
                  [...messages].reverse().map((m, idx) => {
                    const isPage = m.from?.id?.includes("page") || m.from?.id === selectedConv?.senders?.[0]?.id === false
                    return (
                      <div key={m.id || idx} className={`flex ${isPage ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] min-w-[120px] ${isPage ? "order-1" : "order-1"}`}>
                          <div className={`p-3 rounded-2xl text-sm ${
                            isPage
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted text-foreground rounded-bl-md"
                          }`}>
                            <p>{m.message || <span className="italic opacity-60">(وسائط)</span>}</p>
                          </div>
                          <div className={`flex items-center gap-1.5 mt-1 ${isPage ? "justify-end" : "justify-start"}`}>
                            <span className={`text-[10px] ${isPage ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                              {m.from?.name || ""}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {m.created_time ? format(new Date(m.created_time), "HH:mm") : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply area */}
              <div className="border-t p-4 shrink-0">
                {/* Quick reply templates */}
                {showTemplates && templates.length > 0 && (
                  <div className="mb-3 p-3 rounded-lg border bg-muted/30 max-h-[120px] overflow-y-auto">
                    <p className="text-xs text-muted-foreground mb-2 font-medium">الردود السريعة:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {templates.map(t => (
                        <button key={t.id} onClick={() => insertTemplate(t.text)}
                          className="px-2.5 py-1 rounded-full text-xs bg-card border hover:bg-accent transition-colors whitespace-nowrap cursor-pointer">
                          {t.shortcut && <span className="text-primary font-mono ml-1">{t.shortcut}</span>}
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    <Textarea
                      ref={replyInputRef}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="اكتب ردك... (Enter للإرسال)"
                      rows={2}
                      className="min-h-0 resize-none text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          if (replyText.trim() && !sendMut.isPending) sendMut.mutate()
                        }
                      }}
                    />
                  </div>
                  <Button
                    onClick={() => sendMut.mutate()}
                    disabled={!replyText.trim() || sendMut.isPending}
                    className="shrink-0 h-10 px-4 gap-2"
                  >
                    <Send className="size-4" />
                    {sendMut.isPending ? "" : "إرسال"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mobile-nav-spacer" />
    </div>
  )
}
