"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { toast } from "sonner"
import { Search, Send, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

function initials(name: string) {
  if (!name) return "?"
  return name.split(" ").slice(0, 2).map(s => s[0]).join("").toUpperCase()
}

function timeAgo(dateStr: string) {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "الآن"
  if (mins < 60) return `منذ ${mins} د`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} س`
  const days = Math.floor(hours / 24)
  if (days < 30) return `منذ ${days} ي`
  return new Date(dateStr).toLocaleDateString("ar-LY")
}

const FILTERS = [
  { value: "all", label: "الكل" },
  { value: "unread", label: "غير مقروء" },
  { value: "read", label: "مقروء" },
  { value: "needs_reply", label: "بحاجة رد" },
]

function ConvItem({ conv, selectedId, onSelect }: {
  conv: any; selectedId: string | null; onSelect: (id: string) => void
}) {
  const hasUnread = conv.unread_count > 0
  const selected = selectedId === conv.id
  return (
    <button
      onClick={() => onSelect(conv.id)}
      className={`w-full text-right p-3 text-sm cursor-pointer border-b border-border transition-colors
        ${selected ? "bg-orange/10 border-r-2 border-r-orange" : "hover:bg-muted/50 border-r-2 border-r-transparent"}`}
    >
      <div className="flex gap-3 items-start">
        <div
          className="size-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: `hsl(${((conv.senders?.[0]?.name || "").length * 37) % 360}, 55%, 45%)`, outline: hasUnread ? "2px solid var(--orange)" : "none" }}
        >
          {initials(conv.senders?.[0]?.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2 items-center">
            <p className={`text-sm truncate ${hasUnread ? "font-bold" : "font-medium"}`}>
              {conv.subject || conv.senders?.[0]?.name || "بدون موضوع"}
            </p>
            <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(conv.updated_time)}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-1">
            {conv.senders?.map((s: any) => s.name).join("، ") || "غير معروف"}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] text-muted-foreground">{conv.message_count} رسالة</span>
            {hasUnread > 0 && (
              <Badge variant="info" className="text-[10px] h-4 min-w-[18px] px-1 rounded-full">
                {conv.unread_count}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

export default function MessagesPage() {
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["inbox-conversations", filter, search],
    queryFn: () => apiFetch(`/api/inbox/conversations?status=${filter}&search=${encodeURIComponent(search)}`).then(r => r.json()),
    refetchInterval: 15000,
  })
  const conversations = data?.items || []

  const { data: messages = [], isLoading: msgLoading } = useQuery({
    queryKey: ["inbox-messages", selectedId],
    queryFn: () => apiFetch(`/api/inbox/conversations/${selectedId}`).then(r => r.json()),
    enabled: !!selectedId,
    refetchInterval: 10000,
  })

  const queryClient = useQueryClient()
  const sendMut = useMutation({
    mutationFn: (text: string) =>
      apiFetch(`/api/inbox/conversations/${selectedId}/reply`, {
        method: "POST", body: new URLSearchParams({ message: text }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox-messages", selectedId] })
      queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] })
      setReplyText("")
      toast.success("تم إرسال الرد")
    },
    onError: (e: Error) => toast.error(e.message || "فشل الإرسال"),
  })

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
  }, [])

  useEffect(() => { if (messages.length) scrollToBottom() }, [messages, scrollToBottom])

  const handleSend = () => {
    if (replyText.trim() && !sendMut.isPending) sendMut.mutate(replyText.trim())
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <Bell className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الرسائل</h1>
            <p className="text-[11px] text-muted-foreground">صندوق الوارد الموحد</p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex" dir="rtl">
        {/* Conversations list */}
        <div className="w-96 border-l border-border flex flex-col bg-card/50">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث في المحادثات..."
                className="pr-9 h-9 text-sm"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                    filter === f.value ? "bg-orange text-orange-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="size-11 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-muted rounded w-3/4" />
                      <div className="h-2 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {search || filter !== "all" ? "لا توجد محادثات تطابق البحث" : "لا توجد محادثات بعد"}
              </div>
            ) : (
              conversations.map((conv: any) => (
                <ConvItem key={conv.id} conv={conv} selectedId={selectedId} onSelect={setSelectedId} />
              ))
            )}
          </div>
        </div>

        {/* Message area */}
        <div className="flex-1 flex flex-col">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bell className="size-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">اختر محادثة لعرض الرسائل</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgLoading ? (
                  <div className="space-y-3">
                    {[1,2,3].map(i => (
                      <div key={i} className={`flex gap-3 animate-pulse ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                        <div className="h-16 bg-muted rounded-lg w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">لا توجد رسائل في هذه المحادثة</div>
                ) : (
                  messages.map((msg: any, i: number) => {
                    const isPage = msg.from?.id === "page"
                    return (
                      <div key={msg.id || i} className={`flex ${isPage ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[70%] rounded-xl px-4 py-2.5 text-sm ${
                          isPage ? "bg-muted rounded-tr-sm" : "bg-orange text-orange-foreground rounded-tl-sm"
                        }`}>
                          <p>{msg.message}</p>
                          <p className={`text-[10px] mt-1 ${isPage ? "text-muted-foreground" : "text-orange-foreground/70"}`}>
                            {new Date(msg.created_time).toLocaleString("ar-LY")}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-border p-3 bg-background/80">
                <div className="flex gap-2 items-end">
                  <Button onClick={handleSend} disabled={!replyText.trim() || sendMut.isPending} className="shrink-0">
                    <Send className="size-4" />
                  </Button>
                  <div className="flex-1 relative">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      placeholder="اكتب رداً..."
                      className="w-full min-h-[44px] max-h-32 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30"
                      rows={1}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
