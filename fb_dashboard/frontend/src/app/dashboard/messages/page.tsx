"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch, ApiError } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { Search, Send, Bell, Link2, RefreshCw, MessageCircle } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import Link from "next/link"
import Image from "next/image"
import { unwrapApi } from "@/lib/api"
import { countPhrase, formatDate, formatDateOnly, timeAgo } from "@/lib/format"
import type { Conversation, ConversationList, Message } from "@/lib/types"

function initials(name: string) {
  if (!name) return "?"
  return name.split(" ").slice(0, 2).map(s => s[0]).join("").toUpperCase()
}


const FILTERS = [
  { value: "all", label: "الكل" },
  { value: "unread", label: "غير مقروء" },
  { value: "read", label: "مقروء" },
  { value: "needs_reply", label: "تحتاج إلى رد" },
]

function ConvItem({ conv, selectedId, onSelect }: {
  conv: Conversation; selectedId: string | null; onSelect: (id: string) => void
}) {
  const hasUnread = Number(conv.unread_count) > 0
  const selected = selectedId === conv.id
  return (
    <button
      onClick={() => onSelect(conv.id)}
      role="listitem"
      aria-current={selected ? "true" : undefined}
      className={`group w-full text-start p-3 cursor-pointer border-b border-border/60 transition-colors duration-150
        ${selected
          ? "bg-gradient-to-l from-accent-foreground/15 to-accent-foreground/5 border-s-[3px] border-s-primary"
          : "hover:bg-muted/40 border-s-[3px] border-s-transparent"}`}
    >
      <div className="flex gap-3 items-start">
        <div className="relative shrink-0">
          {/* v15-E6 (D5-H3): lightness fixed at 32% instead of the old 45%/55% —
              white 14px-bold initials on hsl(h, 55%, 45%) measured as low as
              2.26:1 (worst hue 60). hsl(h, 45%, 32%) is ≥ 4.75:1 for EVERY hue
              (computed hsl→sRGB→WCAG across all 360; worst case is hue 60,
              best 12.02:1 at hue 240) — AA for normal text while keeping the
              per-conversation hue identity. A fixed token gradient was
              rejected: accent-foreground + white measures only 3.77:1 dark. */}
          <div
            className="size-11 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-card transition-transform duration-200 group-hover:scale-105"
            style={{ background: `hsl(${((conv.senders?.[0]?.name || "").length * 37) % 360}, 45%, 32%)` }}
          >
            {initials(conv.senders?.[0]?.name)}
          </div>
          {hasUnread && (
            <span className="absolute -top-0.5 -end-0.5 size-3 rounded-full bg-primary ring-2 ring-card animate-pulse-dot" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2 items-center">
            {/* v14-E5 (D3-ج): live values (subject / sender names) — dir="auto"
                isolates bidi so Latin/mixed Facebook names render in order. */}
            <p className={`text-sm truncate ${hasUnread ? "font-bold" : "font-medium"}`} dir="auto">
              {conv.subject || conv.senders?.[0]?.name || "بدون موضوع"}
            </p>
            <span className="text-2xs text-muted-foreground shrink-0">{timeAgo(conv.updated_time)}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-1" dir="auto">
            {conv.senders?.map((s) => s.name).join("، ") || "غير معروف"}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-2xs text-muted-foreground">{countPhrase(conv.message_count, "رسالة", "رسالتين", "رسائل")}</span>
            {hasUnread && (
              <span className="inline-flex items-center justify-center text-3xs h-4 min-w-[18px] px-1.5 rounded-full bg-primary text-primary-foreground font-bold">
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
  // v9-B3 — search used to feed the queryKey directly: every keystroke fired
  // an HTTP request. Debounce 300ms so the list query only sees settled input.
  const [debouncedSearch, setDebouncedSearch] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // v8 C8 — keepPreviousData: switching filters/search keeps the previous
  // list on screen (dimmed via isFetching) instead of flashing skeletons
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["inbox-conversations", filter, debouncedSearch],
    queryFn: () => apiFetch(`/api/inbox/conversations?status=${filter}&search=${encodeURIComponent(debouncedSearch)}`).then(unwrapApi<ConversationList>),
    placeholderData: (prev) => prev,
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
    queryFn: () => apiFetch(`/api/inbox/conversations/${selectedId}`).then(unwrapApi<Message[]>),
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
      brandedToast.success("تم إرسال الرد")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل الإرسال"),
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
        {/* Conversations list — responsive master-detail (plan v3 §7c):
         * was fixed w-96 swallowing the whole mobile screen; now full-width
         * on mobile and hidden while a conversation is open (back button returns). */}
        <div className={cn(
          "w-full md:w-96 md:max-w-96 border-e border-border flex-col bg-card/50",
          selectedId ? "hidden md:flex" : "flex"
        )}>
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="بحث في المحادثات…"
                aria-label="البحث في المحادثات"
                className="ps-9 h-9 text-sm border-border/60 focus:border-accent-foreground/40 focus:ring-accent-foreground/20"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/40",
                    filter === f.value
                      ? "bg-gradient-to-l from-accent-foreground to-accent-foreground/80 text-primary-foreground shadow-sm shadow-accent-foreground/20 font-medium"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className={cn(
            "flex-1 overflow-y-auto transition-opacity",
            isFetching && !isLoading && "opacity-60"
          )}>
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex gap-3 items-center">
                    <Skeleton className="size-11 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-2 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : needsSetup ? (
              <div className="p-8 text-center space-y-4">
                <div className="size-16 rounded-2xl bg-accent-foreground/10 flex items-center justify-center mx-auto">
                  <Link2 className="size-8 text-accent-foreground" />
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
              <EmptyState
                icon={MessageCircle}
                size="sm"
                title={search || filter !== "all" ? "لا توجد نتائج" : "لا توجد محادثات بعد"}
                description={search || filter !== "all"
                  ? "جرّب كلمات بحث مختلفة أو غيّر الفلتر لعرض المزيد"
                  : "ستظهر محادثاتك مع العملاء هنا فور وصول أول رسالة إلى صفحتك"}
              />
            ) : (
              <div role="list">
                {conversations.map((conv) => (
                  <ConvItem key={conv.id} conv={conv} selectedId={selectedId} onSelect={setSelectedId} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Message area */}
        <div className={cn("flex-1 flex-col", selectedId ? "flex" : "hidden md:flex")}>
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={Bell}
                size="lg"
                title="اختر محادثة"
                description="اختر محادثة من القائمة لعرض الرسائل والرد عليها."
              />
            </div>
          ) : (
            <>
              {/* Mobile back-to-list (master-detail) */}
              <div className="md:hidden flex items-center gap-2 p-2 border-b border-border bg-card/80">
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="h-9">
                  <DirectionalIcon semanticDirection="forward" className="size-4" /> كل المحادثات
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgLoading ? (
                  <div className="space-y-3">
                    {[1,2,3].map(i => (
                      <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                        <Skeleton className="h-16 rounded-lg w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon={MessageCircle}
                    size="sm"
                    title="لا توجد رسائل في هذه المحادثة"
                    description="اكتب أول رد من مربع الإرسال في الأسفل لبدء الحوار مع العميل."
                  />
                ) : (
                  messages.map((msg, i) => {
                    // v4 §2.4 — explicit backend flag; the old from?.id === "page"
                    // comparison never matched → page replies rendered as
                    // customer bubbles (wrong side + wrong color)
                    const isPage = msg.is_from_page === true
                    const hasImage = !!msg.attachment_url && msg.attachment_type === "image"
                    const isSticker = !!msg.attachment_url && msg.attachment_type === "sticker"
                    return (
                      <div key={msg.id || i} className={`flex ${isPage ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[70%] rounded-xl px-4 py-2.5 text-sm ${
                          isPage ? "bg-muted rounded-ss-sm" : "bg-primary text-primary-foreground rounded-se-sm"
                        }`}>
                          {/* v4 §4.11 — attachments/stickers are persisted now;
                              render them instead of an empty text bubble */}
                          {hasImage && msg.attachment_url && (
                            // v6 §D — next/image (was raw <img>): explicit
                            // dimensions reserve layout space (no CLS) and
                            // h-auto preserves the intrinsic ratio once loaded.
                            <Image
                              src={msg.attachment_url}
                              alt="مرفق"
                              width={480}
                              height={360}
                              unoptimized
                              className="rounded-lg max-w-full h-auto mb-1"
                            />
                          )}
                          {isSticker && msg.attachment_url && (
                            <Image
                              src={msg.attachment_url}
                              alt="ملصق"
                              width={96}
                              height={96}
                              unoptimized
                              className="rounded-lg size-24 object-cover mb-1"
                            />
                          )}
                          {/* v14-E5 (D4 H-05 family): opacity-70 on the primary
                              bubble measured 3.14:1 — inherit the full bubble
                              text color instead (passes in both bubbles). */}
                          {msg.postback_payload && !msg.message && (
                            <p className="text-2xs mb-0.5">اختيار: {msg.postback_payload}</p>
                          )}
                          {/* v15-E6 (D5-M7): message bodies are live customer
                              values — dir="auto" isolates Latin/mixed text
                              (same pattern as the sender name above). */}
                          {msg.message && <p dir="auto">{msg.message}</p>}
                          {/* v14-E5 (D4 H-05 family): opacity-50 measured 2.25:1 on
                              the primary bubble — same treatment. */}
                          {!msg.message && !hasImage && !isSticker && !msg.postback_payload && (
                            <p>مرفق غير مدعوم</p>
                          )}
                          {/* v14-E5 (D4 H-05): /70 on the primary bubble measured
                              3.14:1 — full primary-foreground passes
                              (4.94:1 dark / 9.02:1 light). */}
                          <p className={`text-3xs mt-1 ${isPage ? "text-muted-foreground" : "text-primary-foreground"}`}>
                            {msg.created_time ? formatDate(msg.created_time) : ""}
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
                  <Button
                    onClick={handleSend}
                    disabled={!replyText.trim() || sendMut.isPending}
                    className="shrink-0 shadow-sm shadow-accent-foreground/15"
                    aria-label="إرسال الرد"
                  >
                    <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                  </Button>
                  <div className="flex-1 relative">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      placeholder="اكتب رداً…"
                      aria-label="نص الرد"
                      /* v14-E5: raw textarea bypasses the shared Textarea component —
                         apply the AA placeholder token directly. */
                      className="w-full min-h-[44px] max-h-32 resize-none rounded-xl border border-input/60 bg-background/80 px-4 py-2.5 text-sm placeholder:text-placeholder-text transition-colors duration-200 focus:outline-none focus:border-accent-foreground/40 focus:ring-2 focus:ring-accent-foreground/15"
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
