"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch, ApiError } from "@/lib/csrf-client"
import { toast } from "sonner"
import { Search, Send, Bell, Link2, RefreshCw, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/PageHeader"
import Link from "next/link"
import { unwrapApi } from "@/lib/api"

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
  const hasUnread = Number(conv.unread_count) > 0
  const selected = selectedId === conv.id
  return (
    <button
      onClick={() => onSelect(conv.id)}
      aria-current={selected ? "true" : undefined}
      className={`group w-full text-right p-3 cursor-pointer border-b border-border/60 transition-colors duration-150
        ${selected
          ? "bg-gradient-to-l from-orange/15 to-orange/5 border-r-[3px] border-r-orange"
          : "hover:bg-muted/40 border-r-[3px] border-r-transparent"}`}
    >
      <div className="flex gap-3 items-start">
        <div className="relative shrink-0">
          <div
            className="size-11 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-card transition-transform duration-200 group-hover:scale-105"
            style={{ background: `hsl(${((conv.senders?.[0]?.name || "").length * 37) % 360}, 55%, 45%)` }}
          >
            {initials(conv.senders?.[0]?.name)}
          </div>
          {hasUnread && (
            <span className="absolute -top-0.5 -end-0.5 size-3 rounded-full bg-orange ring-2 ring-card animate-pulse-dot" />
          )}
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
            {hasUnread && (
              <span className="inline-flex items-center justify-center text-[10px] h-4 min-w-[18px] px-1.5 rounded-full bg-orange text-orange-foreground font-bold">
                {conv.unread_count}
              </span>
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

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["inbox-conversations", filter, search],
    queryFn: () => apiFetch(`/api/inbox/conversations?status=${filter}&search=${encodeURIComponent(search)}`).then(unwrapApi),
    refetchInterval: 15000,
    retry: (failureCount, err) => {
      // Don't retry a "page not connected" setup error
      if (err instanceof ApiError && err.status === 400) return false
      return failureCount < 1
    },
  })
  const needsSetup = isError && error instanceof ApiError && error.status === 400
  const conversations = data?.items || []

  const { data: messages = [], isLoading: msgLoading } = useQuery({
    queryKey: ["inbox-messages", selectedId],
    queryFn: () => apiFetch(`/api/inbox/conversations/${selectedId}`).then(unwrapApi),
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
      <PageHeader
        icon={<Bell className="size-4" />}
        title="الرسائل"
        subtitle="صندوق الوارد الموحد"
        compact
      />

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
                className="pr-9 h-9 text-sm border-border/60 focus:border-orange/40 focus:ring-orange/20"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-orange/40",
                    filter === f.value
                      ? "bg-gradient-to-l from-orange to-orange/80 text-orange-foreground shadow-sm shadow-orange/20 font-medium"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
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
            ) : needsSetup ? (
              <div className="p-8 text-center space-y-4">
                <div className="size-16 rounded-2xl bg-orange/10 flex items-center justify-center mx-auto">
                  <Link2 className="size-8 text-orange" />
                </div>
                <div>
                  <p className="text-sm font-bold mb-1">اربط صفحتك بفيسبوك</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    لعرض الرسائل والتعليقات، اربط صفحتك أولاً برمز وصول صالح
                  </p>
                </div>
                <div className="flex flex-col gap-2 items-center">
                  <Link href="/connect">
                    <Button size="sm" className="h-9 px-5">
                      <Link2 className="size-3.5" /> ربط الصفحة الآن
                    </Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-8 text-xs">
                    <RefreshCw className="size-3" /> تحديث
                  </Button>
                </div>
              </div>
            ) : isError ? (
              <div className="p-8 text-center text-sm text-muted-foreground space-y-3">
                <p>تعذر تحميل المحادثات</p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <RefreshCw className="size-3" /> إعادة المحاولة
                </Button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center">
                <div className="size-14 rounded-2xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
                  <MessageCircle className="size-7 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium mb-1">
                  {search || filter !== "all" ? "لا توجد نتائج" : "لا توجد محادثات بعد"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {search || filter !== "all" ? "جرب كلمات بحث مختلفة" : "ستظهر المحادثات الجديدة هنا"}
                </p>
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
              <div className="text-center max-w-sm">
                <div className="size-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Bell className="size-9 opacity-40" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">اختر محادثة</p>
                <p className="text-xs text-muted-foreground">اختر محادثة من القائمة لعرض الرسائل والرد عليها</p>
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

              <div className="border-t border-border/60 p-3 bg-card/80 backdrop-blur-sm">
                <div className="flex gap-2 items-end">
                  <Button onClick={handleSend} disabled={!replyText.trim() || sendMut.isPending} className="shrink-0 shadow-sm shadow-orange/15">
                    <Send className="size-4" />
                  </Button>
                  <div className="flex-1 relative">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      placeholder="اكتب رداً..."
                      className="w-full min-h-[44px] max-h-32 resize-none rounded-xl border border-input/60 bg-background/80 px-4 py-2.5 text-sm transition-colors duration-200 focus:outline-none focus:border-orange/40 focus:ring-2 focus:ring-orange/15"
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
