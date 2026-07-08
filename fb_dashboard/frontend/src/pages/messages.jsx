import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAdaptiveInterval } from "@/hooks/use-refresh-engine"
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
import { motion, AnimatePresence } from "framer-motion"
import {
  Inbox, Search, Send, Tag, Plus, X, MessageSquare,
  ChevronRight, Mail, MailOpen, Reply,
  Bookmark, CheckCheck, Loader2,
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
  { value: "all", label: "الكل", icon: Inbox },
  { value: "unread", label: "غير مقروء", icon: Mail },
  { value: "read", label: "مقروء", icon: MailOpen },
  { value: "needs_reply", label: "بحاجة رد", icon: Reply },
]

const TAG_COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#22c55e", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6"]

function MessageBubble({ message, isPage, idx }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.15), ease: [0.16, 1, 0.3, 1] }}
      className={`flex ${isPage ? "justify-end" : "justify-start"} px-1`}
    >
      <div className="max-w-[80%] sm:max-w-[70%] min-w-[100px]">
        <div className={`
            relative p-3 text-sm leading-relaxed shadow-sm cursor-default select-none
            ${isPage
              ? "bubble-page rounded-2xl rounded-br-lg text-white"
              : "bubble-user rounded-2xl rounded-bl-lg"}
          `}
        >
          <p className="whitespace-pre-wrap break-words">{message.message || <span className="italic opacity-60">(وسائط)</span>}</p>
          <div className={`flex items-center gap-1 mt-1.5 ${isPage ? "justify-end" : "justify-start"}`}>
            <span className={`text-[10px] ${isPage ? "text-white/70" : "text-muted-foreground/70"}`}>
              {message.created_time ? formatMsgTime(message.created_time) : ""}
            </span>
            {isPage && <CheckCheck className="size-3 text-white/60" />}
          </div>
        </div>
        {!isPage && message.from?.name && (
          <div className="flex items-center gap-1.5 mt-0.5 px-1">
            <span className="text-[10px] text-muted-foreground/50">{message.from.name}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function ConvItem({ conv, idx, selectedId, onSelect }) {
  const hasUnread = conv.unread_count > 0
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(idx * 0.02, 0.2), duration: 0.2 }}
      layout
    >
      <button
        onClick={() => onSelect(conv.id)}
        className={`w-full text-right p-3 transition-all duration-150 text-sm cursor-pointer relative group
          ${selectedId === conv.id
            ? "bg-primary/[0.07] border-l-[3px] border-l-primary"
            : "hover:bg-muted/40 border-l-[3px] border-l-transparent"}
        `}
      >
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <Avatar className={`size-11 ${hasUnread ? "ring-2 ring-accent/40" : ""}`}>
              <AvatarFallback className={`text-sm font-semibold ${
                hasUnread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {initials(conv.senders?.[0]?.name)}
              </AvatarFallback>
            </Avatar>
            {hasUnread && (
              <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-accent border-2 border-card" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm truncate ${hasUnread ? "font-bold text-foreground" : "font-medium text-foreground/90"}`}>
                {conv.subject || conv.senders?.[0]?.name || "بدون موضوع"}
              </p>
              <span className={`text-[11px] shrink-0 ${hasUnread ? "text-accent font-medium" : "text-muted-foreground/60"}`}>
                {timeAgo(conv.updated_time)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
              {conv.senders?.map(s => s.name).join("، ") || "غير معروف"}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-muted-foreground/50">{conv.message_count} رسالة</span>
              {hasUnread && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[18px] flex items-center justify-center rounded-full">
                  {conv.unread_count}
                </Badge>
              )}
              {conv.tags?.length > 0 && (
                <div className="flex gap-1">
                  {conv.tags.slice(0, 3).map(t => (
                    <span key={t.id} className="size-2 rounded-full ring-1 ring-border/30" style={{ backgroundColor: t.color }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </button>
    </motion.div>
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
  const msgContainerRef = useRef(null)

  const convInterval = useAdaptiveInterval("normal")
  const msgInterval = useAdaptiveInterval("critical")

  useEffect(() => {
    if (selectedId) {
      const saved = localStorage.getItem(`msg-draft-${selectedId}`)
      setReplyText(saved || "")
    } else {
      setReplyText("")
    }
  }, [selectedId])

  useEffect(() => {
    if (selectedId && replyText) {
      localStorage.setItem(`msg-draft-${selectedId}`, replyText)
    }
  }, [replyText, selectedId])

  const { data, isLoading } = useQuery({
    queryKey: ["inbox-conversations", filter, search],
    queryFn: () => fetchInboxConversations(filter, "", search),
    staleTime: 10000, refetchOnWindowFocus: true,
    refetchInterval: convInterval, retry: 2,
    placeholderData: (prev) => prev,
  })
  const conversations = data?.items || []
  const total = data?.total || 0

  const { data: messages = [], isLoading: msgLoading, refetch: refetchMsgs } = useQuery({
    queryKey: ["inbox-messages", selectedId],
    queryFn: () => fetchInboxMessages(selectedId),
    enabled: !!selectedId,
    staleTime: 5000, refetchOnWindowFocus: true,
    refetchInterval: msgInterval, retry: 2,
    placeholderData: (prev) => prev,
  })

  const { data: tags = [] } = useQuery({
    queryKey: ["inbox-tags"],
    queryFn: fetchInboxTags,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: () => fetchTemplates(),
  })

  const scrollToBottom = useCallback((smooth = true) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" })
    }, 50)
  }, [])

  useEffect(() => {
    if (messages.length > 0) scrollToBottom(true)
  }, [messages, scrollToBottom])

  const selectedConv = useMemo(
    () => conversations.find(c => c.id === selectedId),
    [conversations, selectedId]
  )

  const sendMut = useMutation({
    mutationFn: () => replyToInbox(selectedId, replyText),
    onMutate: async () => {
      const text = replyText
      setReplyText("")
      if (selectedId) localStorage.removeItem(`msg-draft-${selectedId}`)
      const optimisticMsg = {
        id: `opt-${Date.now()}`,
        message: text,
        from: { name: "أنت", id: "page" },
        created_time: new Date().toISOString(),
        _optimistic: true,
      }
      setOptimisticMessages(prev => [...prev, optimisticMsg])
      scrollToBottom(true)
      return { text }
    },
    onSuccess: () => {
      refetchMsgs()
      queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] })
      setOptimisticMessages([])
    },
    onError: (e, __, ctx) => {
      setOptimisticMessages([])
      toast.error(e.message || "فشل الإرسال")
      if (ctx?.text) setReplyText(ctx.text)
    },
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

  const insertTemplate = (text) => {
    setReplyText(prev => prev + text)
    setShowTemplates(false)
    setTimeout(() => replyInputRef.current?.focus(), 100)
  }

  const allMessages = useMemo(() => {
    if (optimisticMessages.length === 0) return messages
    const realIds = new Set(messages.map(m => m.id))
    const filteredOpt = optimisticMessages.filter(o => !realIds.has(o.id))
    return [...messages, ...filteredOpt]
  }, [messages, optimisticMessages])

  const handleSend = useCallback(() => {
    if (replyText.trim() && !sendMut.isPending) sendMut.mutate()
  }, [replyText, sendMut])

  const handleSelectConv = useCallback((id) => {
    setSelectedId(prev => prev === id ? null : id)
    setOptimisticMessages([])
    setShowTemplates(false)
  }, [])

  return (
    <div className="flex flex-col h-[calc(100svh-3.5rem)] lg:h-[calc(100svh-3.5rem-0.5rem)] overflow-hidden bg-gradient-to-b from-background to-muted/20" dir="rtl">
      <div className="flex flex-1 overflow-hidden lg:gap-1 lg:p-2">
        {/* ═══ LEFT: CONVERSATION LIST ═══ */}
        <div className={`${selectedId ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-[380px] xl:w-[420px] border-l border-border/50 bg-card/50`}>
          <div className="shrink-0 px-4 pt-4 pb-2 space-y-3 border-b border-border/30">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground tracking-tight">المحادثات</h2>
              <span className="text-[11px] text-muted-foreground/60 font-mono">{total}</span>
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                placeholder="بحث في المحادثات..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-8 h-9 text-sm rounded-xl bg-muted/40 border-0 focus:bg-background"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground cursor-pointer">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {FILTERS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => { setFilter(value); setSelectedId(null) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer shrink-0
                    ${filter === value
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted/80"}
                  `}
                >
                  <Icon className="size-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-border/20">
            {isLoading ? (
              <div className="space-y-1 p-3">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="size-11 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-3/4 rounded" />
                      <Skeleton className="h-2.5 w-1/2 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="size-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
                  <Inbox className="size-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">{search ? "لا توجد نتائج" : "لا توجد محادثات"}</p>
                <p className="text-xs text-muted-foreground/60">{search ? "حاول بكلمة بحث مختلفة" : "عندما يرسل أحدهم رسالة، ستظهر هنا"}</p>
              </motion.div>
            ) : (
              <div className="py-1">
                {conversations.map((conv, idx) => (
                  <ConvItem key={conv.id} conv={conv} idx={idx} selectedId={selectedId} onSelect={handleSelectConv} />
                ))}
              </div>
            )}
            {total > 0 && (
              <div className="text-center text-[10px] text-muted-foreground/40 py-2.5 border-t border-border/20">
                {total} محادثة · {conversations.filter(c => c.unread_count > 0).length} غير مقروءة
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border/20 px-3 py-2">
            <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
              <DialogTrigger asChild>
                {canEdit && (
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground rounded-xl cursor-pointer">
                    <Plus className="size-3.5" />
                    وسم جديد
                  </Button>
                )}
              </DialogTrigger>
              <DialogContent className="glass-heavy max-w-sm">
                <DialogHeader><DialogTitle>وسم جديد</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <Input placeholder="اسم الوسم" value={newTagName} onChange={e => setNewTagName(e.target.value)} />
                  <div className="flex gap-2 flex-wrap">
                    {TAG_COLORS.map(c => (
                      <button key={c} onClick={() => setNewTagColor(c)}
                        aria-label={`لون ${c}`}
                        className={`size-7 rounded-full border-2 transition-all cursor-pointer ${newTagColor === c ? "border-foreground scale-110 ring-2 ring-foreground/20" : "border-transparent"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <Button onClick={() => createTagMut.mutate()} disabled={!newTagName.trim()} className="w-full">
                    {createTagMut.isPending ? "جاري..." : "إنشاء الوسم"}
                  </Button>
                  {tags.length > 0 && (
                    <div className="space-y-2 pt-3 border-t">
                      <p className="text-xs text-muted-foreground/60">الوسوم الموجودة:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map(t => (
                          <div key={t.id} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium"
                            style={{ backgroundColor: t.color + "18", color: t.color }}>
                            {t.name}
                            <X className="size-3 cursor-pointer opacity-50 hover:opacity-100" onClick={() => deleteTagMut.mutate(t.id)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* ═══ RIGHT: CONVERSATION DETAIL ═══ */}
        {!selectedId ? (
          <div className="hidden lg:flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="size-20 mx-auto rounded-3xl bg-muted/30 flex items-center justify-center mb-5">
                <MessageSquare className="size-9 text-muted-foreground/20" />
              </div>
              <p className="text-lg font-semibold text-foreground/80">اختر محادثة</p>
              <p className="text-sm text-muted-foreground/50 mt-1">اختر محادثة من القائمة لعرض الرسائل والرد</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0 bg-background/50 backdrop-blur-sm">
              <div className="flex items-center gap-3 min-w-0">
                <Button variant="ghost" size="icon" className="lg:hidden size-8 cursor-pointer shrink-0" onClick={() => setSelectedId(null)} aria-label="عودة">
                  <ChevronRight className="size-5" />
                </Button>
                <Avatar className="size-9 shrink-0 ring-2 ring-border/30">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials(selectedConv?.senders?.[0]?.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {selectedConv?.subject || selectedConv?.senders?.[0]?.name || "بدون موضوع"}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 truncate">
                    {selectedConv?.senders?.map(s => s.name).join("، ") || "غير معروف"}
                    {selectedConv?.unread_count > 0 && (
                      <span className="mr-2 text-accent font-medium">{selectedConv.unread_count} غير مقروءة</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex flex-wrap gap-1 max-w-[120px] justify-end">
                  {(selectedConv?.tags || []).map(t => (
                    <span key={t.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ backgroundColor: t.color + "18", color: t.color }}>
                      {t.name}
                      {canEdit && (
                        <X className="size-2.5 cursor-pointer opacity-50 hover:opacity-100"
                          onClick={() => removeTagMut.mutate({ convId: selectedId, tagId: t.id })} />
                      )}
                    </span>
                  ))}
                </div>
                {canEdit && tags.length > 0 && (
                  <div className="relative group">
                    <Button variant="ghost" size="icon" className="size-8 cursor-pointer" aria-label="إضافة وسم">
                      <Tag className="size-4 text-muted-foreground/60 hover:text-foreground" />
                    </Button>
                    <div className="absolute left-0 top-full mt-1 bg-popover border rounded-xl shadow-lg shadow-black/5 p-1.5 z-50 hidden group-hover:block min-w-[150px]">
                      <p className="text-[10px] text-muted-foreground/60 px-2 py-1">إضافة وسم</p>
                      {tags.filter(t => !(selectedConv?.tags || []).find(ct => ct.id === t.id)).map(t => (
                        <button key={t.id} onClick={() => assignTagMut.mutate({ convId: selectedId, tagId: t.id })}
                          className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-lg hover:bg-muted text-right cursor-pointer">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div ref={msgContainerRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2.5 overscroll-contain"
              style={{ backgroundImage: "radial-gradient(circle, hsl(var(--border)/0.03) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
              {msgLoading && messages.length === 0 ? (
                <div className="space-y-3 p-4">
                  {[1,2,3].map(i => (
                    <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                      <Skeleton className={`h-12 rounded-2xl ${i % 2 === 0 ? "w-3/5" : "w-2/5"}`} />
                    </div>
                  ))}
                </div>
              ) : allMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="size-12 mx-auto rounded-2xl bg-muted/30 flex items-center justify-center mb-3">
                      <MessageSquare className="size-5 text-muted-foreground/20" />
                    </div>
                    <p className="text-sm text-muted-foreground/60">لا توجد رسائل بعد</p>
                    <p className="text-xs text-muted-foreground/40 mt-1">أرسل أول رسالة لبدء المحادثة</p>
                  </div>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {[...allMessages].reverse().map((m, idx) => {
                    const isPage = m.from?.id === "page" || m.from?.id?.includes("page") || m._optimistic
                    return (
                      <MessageBubble
                        key={m.id || `msg-${idx}`}
                        message={m}
                        isPage={isPage}
                        idx={idx}
                      />
                    )
                  })}
                </AnimatePresence>
              )}
              <div ref={messagesEndRef} className="h-1" />
            </div>

            <div className="border-t border-border/30 shrink-0 bg-background/80 backdrop-blur-sm">
              <AnimatePresence>
                {showTemplates && templates.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 py-2 border-b border-border/20 bg-muted/20">
                      <p className="text-[10px] text-muted-foreground/60 mb-1.5 font-medium">الردود السريعة:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {templates.map(t => (
                          <button key={t.id} onClick={() => insertTemplate(t.text)}
                            className="px-2.5 py-1 rounded-full text-[11px] bg-card border hover:bg-accent/10 hover:border-accent/30 transition-colors whitespace-nowrap cursor-pointer"
                          >
                            {t.shortcut && <span className="text-primary font-mono ml-1 text-[10px]">{t.shortcut}</span>}
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-end gap-2 p-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowTemplates(s => !s)}
                  className={`size-9 shrink-0 rounded-xl cursor-pointer ${showTemplates ? "text-accent bg-accent/10" : "text-muted-foreground/60"}`}
                  aria-label="الردود السريعة"
                >
                  <Bookmark className="size-4" />
                </Button>
                <div className="flex-1 relative">
                  <Textarea
                    ref={replyInputRef}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="اكتب رسالتك..."
                    rows={1}
                    className="min-h-[44px] max-h-[120px] resize-none text-sm rounded-xl bg-muted/40 border-0 focus:bg-background focus:ring-1 focus:ring-primary/20 py-3 px-4"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        if (replyText.trim() && !sendMut.isPending) handleSend()
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={handleSend}
                  disabled={!replyText.trim() || sendMut.isPending}
                  className="shrink-0 size-10 rounded-xl p-0 cursor-pointer"
                  aria-label="إرسال"
                >
                  {sendMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="lg:hidden mobile-nav-spacer" />
    </div>
  )
}
