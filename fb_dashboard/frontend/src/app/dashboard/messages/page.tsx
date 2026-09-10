"use client"

import { Suspense, useState, useEffect, useLayoutEffect, useRef, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch, ApiError } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { Search, Send, Inbox, Link2, RefreshCw, MessageCircle, ChevronUp } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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

/** v17-E-F1 (D2-P1): scrollIntoView({ behavior: "smooth" }) is a JS API the
 * global CSS reduced-motion override (globals.css:549-551) CANNOT restrain
 * (CSSOM View spec — behavior is explicit per call), so the thread scroller
 * needs the project's local matchMedia twin. 7th instance, same recipe as
 * charts/index.tsx:27-37, KpiCard, StatsSection, ScrollReveal, KineticText,
 * ScrollParallax. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return reduced
}

/** v17-E-F1 (D7-P1): the "near the bottom" window that decides whether new
 * messages (10s poll) should follow — see the scroll contract below. */
const NEAR_BOTTOM_PX = 150

/* v24-C2 (task 7 / A3-M1): message windowing — the thread renders only the
 * newest MESSAGE_WINDOW bubbles; older history loads 60-at-a-time via the
 * «تحميل الرسائل الأقدم» button pinned at the top of the scroller. The 5s
 * poll then re-diffs at most 60 keyed nodes instead of 200 (the jank tax
 * A2/A3 measured on long threads). */
const MESSAGE_WINDOW = 60

/* v24-C2 (task 8 / A3-M6): per-conversation reply drafts persist to
 * localStorage (`draft:<conversationId>`) so a refresh/crash mid-compose no
 * longer discards them. Debounced writes on change, flush on blur/unmount,
 * removed on successful send — the in-session per-conv state (v17 D10-M2)
 * stays the source of truth; storage only hydrates what state lacks. */
const DRAFT_KEY_PREFIX = "draft:"
const DRAFT_DEBOUNCE_MS = 400

function ConvItem({ conv, selectedId, onSelect }: {
  conv: Conversation; selectedId: string | null; onSelect: (id: string) => void
}) {
  const hasUnread = Number(conv.unread_count) > 0
  const selected = selectedId === conv.id
  return (
    /* v24-C2 (task 10 / B4): role="listitem" on a <button> overrides the
       button's implicit role and suppresses its semantics for AT — the list
       semantics now live on the real <li> wrappers (below), the button stays
       a button. aria-current (selection) is kept. */
    <button
      onClick={() => onSelect(conv.id)}
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

/* v24-C2 (task 1 / A3-M2+N5): the open thread is URL state now (`?c=<id>`)
 * — deep links, notification routing, refresh-keeps-place, and honest
 * browser/Android-back semantics (back returns to the conversation list
 * instead of leaving the page) all fall out of that. Next 16 requires a
 * Suspense boundary around useSearchParams for statically-prerendered pages,
 * so the page export is a thin boundary and the real tree lives in
 * MessagesView below. */
export default function MessagesPage() {
  return (
    <Suspense fallback={<MessagesFallback />}>
      <MessagesView />
    </Suspense>
  )
}

/** v24-C2: prerender/hydration shell for the useSearchParams Suspense
 * boundary — same header + list skeleton the loading state already uses, so
 * the static HTML and the first client paint match (no flash). */
function MessagesFallback() {
  return (
    <div className="flex-1 flex flex-col" aria-busy="true">
      <PageHeader
        icon={<Inbox className="size-4" />}
        title="الرسائل"
        subtitle="صندوق الوارد الموحد"
        compact
      />
      <div className="flex-1 p-4 space-y-3" dir="rtl">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3 items-center">
            <Skeleton className="size-11 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MessagesView() {
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  // v9-B3 — search used to feed the queryKey directly: every keystroke fired
  // an HTTP request. Debounce 300ms so the list query only sees settled input.
  const [debouncedSearch, setDebouncedSearch] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])
  /* v24-C2 (task 1 / A3-M2): selectedId is seeded from the `?c=` search
   * param on mount (deep link / refresh) and thereafter driven by local
   * state that open/close keep in lockstep with the history stack via
   * pushState/replaceState + the popstate listener below — Next 16 syncs
   * native history mutations with useSearchParams, so the URL and the view
   * never disagree. */
  const searchParams = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("c"))
  /** v24-C2: how many ?c= entries THIS view pushed — the in-thread back row
   * hops straight back to the list entry (history.go(-depth)) instead of
   * peeling threads one by one, and falls back to replaceState when the
   * thread was deep-linked (depth 0 — back would exit the app). */
  const pushDepthRef = useRef(0)
  // v17-E-F1 (D10-M2 — financial hazard): the reply draft used to be ONE shared
  // string that followed the selection — text typed for customer A reappeared
  // (and could be SENT) in customer B's thread after switching. Drafts are now
  // keyed by conversation id: each thread keeps its own draft, restored when
  // you come back, and only the thread that was actually replied to is cleared.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const replyText = selectedId ? (drafts[selectedId] ?? "") : ""
  /* v24-C2 (task 8): debounced localStorage twin of the per-conv drafts —
   * pendingDraftRef holds the last keystrokes so blur/unmount can flush them
   * before the component goes away. */
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDraftRef = useRef<{ id: string; text: string } | null>(null)

  const persistDraft = useCallback((id: string, text: string) => {
    try {
      if (text) window.localStorage.setItem(DRAFT_KEY_PREFIX + id, text)
      else window.localStorage.removeItem(DRAFT_KEY_PREFIX + id)
    } catch { /* private mode / quota — the in-session state draft still works */ }
  }, [])

  const flushDraft = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    const pending = pendingDraftRef.current
    if (pending) {
      pendingDraftRef.current = null
      persistDraft(pending.id, pending.text)
    }
  }, [persistDraft])

  /** v24-C2: clear one thread's draft everywhere (state + storage + any
   * pending debounce) — called on successful send so the draft can't
   * resurrect from a straggling timer after the reply landed. */
  const clearDraft = useCallback((id: string) => {
    if (pendingDraftRef.current?.id === id) {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current)
        draftTimerRef.current = null
      }
      pendingDraftRef.current = null
    }
    try { window.localStorage.removeItem(DRAFT_KEY_PREFIX + id) } catch { /* private mode */ }
    setDrafts((prev) => ({ ...prev, [id]: "" }))
  }, [])

  const updateDraft = (text: string) => {
    if (!selectedId) return
    const id = selectedId // captured for the async timer — switching threads
    setDrafts((prev) => ({ ...prev, [id]: text })) // mid-debounce must not misfile it
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    pendingDraftRef.current = { id, text }
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null
      const pending = pendingDraftRef.current
      if (pending) {
        pendingDraftRef.current = null
        persistDraft(pending.id, pending.text)
      }
    }, DRAFT_DEBOUNCE_MS)
  }

  /* v24-C2 (task 8): hydrate a thread's draft from storage when it's opened
   * with nothing in state yet (refresh / crash mid-compose). Errors are
   * swallowed — storage is an enhancement, never a gate. */
  useEffect(() => {
    if (!selectedId) return
    setDrafts((prev) => {
      if (prev[selectedId] !== undefined) return prev
      let stored: string | null = null
      try { stored = window.localStorage.getItem(DRAFT_KEY_PREFIX + selectedId) } catch { /* private mode */ }
      return { ...prev, [selectedId]: stored ?? "" }
    })
  }, [selectedId])

  // v24-C2: flush any pending debounced draft on unmount (navigation away
  // mid-compose still persists it), mirroring the autoreply tone-timer rule.
  useEffect(() => () => { flushDraft() }, [flushDraft])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // v8 C8 — keepPreviousData: switching filters/search keeps the previous
  // list on screen (dimmed via isFetching) instead of flashing skeletons
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["inbox-conversations", filter, debouncedSearch],
    queryFn: () => apiFetch(`/api/inbox/conversations?status=${filter}&search=${encodeURIComponent(debouncedSearch)}`).then(unwrapApi<ConversationList>),
    placeholderData: (prev) => prev,
    /* v23: 15s→8s poll — the inbox is the app's most time-critical surface
       (a customer is waiting on the other side); 8s keeps unread badges and
       list order within one attention blink without hammering the Graph API. */
    refetchInterval: 8000,
    /* v23: 15s staleTime — remounts/coming back to the tab within 15s reuse
       the cached list instead of flashing skeletons; the 8s poll above still
       refreshes it on cadence, so freshness never regresses. */
    staleTime: 15000,
    retry: (failureCount, err) => {
      // Don't retry a "page not connected" setup error
      if (err instanceof ApiError && err.status === 400) return false
      return failureCount < 1
    },
  })
  const needsSetup = isError && error instanceof ApiError && error.status === 400
  const conversations = data?.items || []

  // v17-E-F1 (D1 §5.1 — P1): isError/refetch are now unwrapped from the thread
  // query — a failed fetch used to render the "no messages" empty state (an
  // error disguised as an empty thread; same defect class v4 §2.5 fixed in posts).
  const {
    data: messages = [],
    isLoading: msgLoading,
    isError: msgIsError,
    error: msgError,
    refetch: refetchMessages,
    /* v23: surfaces the placeholder state above so the swapped-in previous
       thread can be dimmed (same honesty cue as the list's isFetching dim). */
    isPlaceholderData: msgIsPlaceholder,
  } = useQuery({
    queryKey: ["inbox-messages", selectedId],
    queryFn: () => apiFetch(`/api/inbox/conversations/${selectedId}`).then(unwrapApi<Message[]>),
    enabled: !!selectedId,
    /* v23: 10s→5s poll — a reply landing on the customer's phone should show
       up here while the conversation is still "hot" (5s ≈ reading rhythm). */
    refetchInterval: 5000,
    /* v23: 20s staleTime + 5min gcTime — switching back to a thread you just
       read serves its cached messages INSTANTLY (fresh ⇒ no refetch, no
       skeleton flash) and background-revalidates once stale; 5min gcTime
       keeps recently-read threads warm across master-detail switches. */
    staleTime: 20000,
    gcTime: 300000,
    /* v23: keepPreviousData twin of the list (v8 C8) — switching threads
       keeps the previous thread's bubbles on screen (dimmed, below) while
       the new one loads instead of flashing the skeleton; the cached/fresh
       path above is what covers the actual "returning" case. */
    placeholderData: (prev) => prev,
  })

  const queryClient = useQueryClient()

  // v17-E-F1 (D10-M3): opening a conversation now marks it read —
  // fire-and-forget POST (E-B1 contract: ok({"unread": N})); a failed
  // mark-read never blocks reading (the 15s list refetch reconciles).
  // The unread badge is zeroed optimistically in EVERY cached list
  // (prefix key match covers all filter/search combos) so the badge and the
  // «غير مقروء» filter react instantly instead of lying until the user
  // reads the thread on Facebook itself.
  const markRead = useCallback((id: string) => {
    queryClient.setQueriesData<ConversationList>(
      { queryKey: ["inbox-conversations"] },
      (prev) => {
        if (!prev?.items) return prev
        const idx = prev.items.findIndex((c) => c.id === id)
        if (idx === -1 || Number(prev.items[idx].unread_count ?? 0) === 0) return prev
        const items = [...prev.items]
        items[idx] = { ...items[idx], unread_count: 0 }
        return { ...prev, items }
      },
    )
    apiFetch(`/api/inbox/conversations/${id}/read`, { method: "POST" })
      .then(unwrapApi)
      .catch(() => { /* silent by design — refetch reconciles */ })
  }, [queryClient])

  useEffect(() => { if (selectedId) markRead(selectedId) }, [selectedId, markRead])

  const prefersReducedMotion = usePrefersReducedMotion()

  /* v17-E-F1 (D7-P1 / D10-M1 — scroll contract): the old effect yanked the
   * thread to the bottom on EVERY 10s poll — reading history was impossible.
   * Now the thread lands at the bottom only when:
   *   (أ) the first data of a freshly selected thread arrives (instant),
   *   (ب) a reply is sent successfully (sendMut.onSuccess below),
   *   (ج) messages grow while the user is already near the bottom (~150px).
   * While the user is scrolled up reading history, polls never jump. */
  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    // v17-E-F1 (D2-P1): smooth is a JS-API scroll — the global CSS
    // reduced-motion override cannot restrain scrollIntoView, so clamp here.
    const effective: ScrollBehavior = prefersReducedMotion ? "auto" : behavior
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: effective }), 50)
  }, [prefersReducedMotion])

  const prevThreadRef = useRef<{ id: string | null; count: number }>({ id: null, count: 0 })
  useEffect(() => {
    if (messages.length === 0) return
    const prev = prevThreadRef.current
    if (prev.id !== selectedId) {
      scrollToBottom("auto") // (أ) fresh thread → land at the newest message
    } else if (messages.length > prev.count) {
      const el = scrollContainerRef.current
      // (ج) follow new messages ONLY when the user is at/near the bottom
      if (!el || el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX) {
        scrollToBottom("smooth")
      }
    }
    prevThreadRef.current = { id: selectedId, count: messages.length }
  }, [messages, selectedId, scrollToBottom])

  // A failed-then-retried thread re-lands at the bottom: the error card
  // collapses the scroll area, so treat recovery like a fresh open.
  useEffect(() => {
    if (msgIsError) prevThreadRef.current = { id: null, count: 0 }
  }, [msgIsError])

  /* v24-C2 (task 1 / A3-M2+N1): browser/Android back inside a thread pops the
   * pushed ?c= entry — the URL loses the param and the view returns to the
   * list (instead of back exiting the whole page). Next 16's own history
   * sync re-renders useSearchParams with the same value; the listener keeps
   * the local selection in lockstep without depending on it, and keeps the
   * push-depth ledger honest for the back row below. */
  useEffect(() => {
    const onPopState = () => {
      const c = new URLSearchParams(window.location.search).get("c")
      pushDepthRef.current = c ? Math.max(0, pushDepthRef.current - 1) : 0
      setSelectedId(c)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  /** v24-C2: open a conversation — a real history entry is pushed (?c=<id>)
   * so hardware back walks back to the list, and refresh keeps the thread. */
  const openConversation = useCallback((id: string) => {
    pushDepthRef.current += 1
    window.history.pushState(null, "", `/dashboard/messages?c=${encodeURIComponent(id)}`)
    setSelectedId(id)
  }, [])

  /** v24-C2: in-thread back row — hop straight to the list entry we pushed
   * from (all thread entries in one go), or strip the param via replaceState
   * when the thread was deep-linked (nothing of ours to pop — back must not
   * exit the app). */
  const closeThread = useCallback(() => {
    const depth = pushDepthRef.current
    pushDepthRef.current = 0
    setSelectedId(null)
    if (depth > 0) window.history.go(-depth) // popstate re-syncs (idempotent)
    else window.history.replaceState(null, "", "/dashboard/messages")
  }, [])

  /* v24-C2 (task 6 / A3-M3): immersive thread — while a conversation is open
   * the page marks <body data-chat-focus="1"> (cleanup removes it) and the
   * injected style below hides the mobile bottom nav + collapses the shell's
   * nav padding to the safe-area, so the composer extends into the freed
   * space. Desktop is untouched (the nav is md:hidden there already). */
  useEffect(() => {
    if (!selectedId) return
    document.body.dataset.chatFocus = "1"
    return () => { delete document.body.dataset.chatFocus }
  }, [selectedId])

  /* v24-C2 (task 7): the windowing state — reset to the newest 60 whenever
   * the thread changes so an old «load earlier» never leaks across threads. */
  const [messageWindow, setMessageWindow] = useState(MESSAGE_WINDOW)
  useEffect(() => { setMessageWindow(MESSAGE_WINDOW) }, [selectedId])
  const hiddenCount = Math.max(0, messages.length - messageWindow)
  const visibleMessages = hiddenCount > 0 ? messages.slice(messages.length - messageWindow) : messages

  /* v24-C2 (task 7): load-earlier anchor — remember the scrollHeight BEFORE
   * the prepend, then after the DOM update add the height delta back to
   * scrollTop so the viewport stays pinned to the same message (prepending
   * above the anchor would otherwise yank the view to older history). */
  const pendingAnchorRef = useRef<number | null>(null)
  const loadOlderMessages = useCallback(() => {
    const el = scrollContainerRef.current
    pendingAnchorRef.current = el ? el.scrollHeight : null
    setMessageWindow((w) => w + MESSAGE_WINDOW)
  }, [])
  useLayoutEffect(() => {
    const prev = pendingAnchorRef.current
    if (prev === null) return
    pendingAnchorRef.current = null
    const el = scrollContainerRef.current
    if (el) el.scrollTop += el.scrollHeight - prev
  })

  const sendMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      apiFetch(`/api/inbox/conversations/${id}/reply`, {
        method: "POST", body: new URLSearchParams({ message: text }),
      }),
    /* v23 (instant send): the reply used to appear only after the POST
       round-trip — on a slow link the composer felt dead for seconds.
       onMutate stamps a temporary bubble into the thread cache so the user
       sees their reply the frame they hit send; the onSuccess invalidate
       swaps it for the server's persisted copy. The optimistic row matches
       the REAL Message shape (types.ts): text→message, created_at→
       created_time, is_from_page renders it on the page side. */
    onMutate: async ({ id, text }) => {
      // cancel any in-flight thread poll so it can't stomp the optimistic row
      await queryClient.cancelQueries({ queryKey: ["inbox-messages", id] })
      const previous = queryClient.getQueryData<Message[]>(["inbox-messages", id])
      queryClient.setQueryData<Message[]>(["inbox-messages", id], (old) => [
        ...(old ?? []),
        { id: `optimistic-${Date.now()}`, message: text, is_from_page: true, created_time: new Date().toISOString() },
      ])
      return { previous }
    },
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["inbox-messages", id] })
      queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] })
      // v17-E-F1 (D10-M2) → v24-C2 (task 8): clear ONLY the replied thread's
      // draft — the id from variables stays exact even if the user switches
      // mid-flight — in state, storage, and any pending debounce write.
      clearDraft(id)
      brandedToast.success("تم إرسال الرد")
      // (ب) a successful reply lands the thread at the newest message
      scrollToBottom("smooth")
    },
    /* v23: rollback — a failed POST pulls the optimistic bubble back out
       (snapshot restore) so the thread never LIES about a delivered reply;
       the draft stays for a corrected retry (v17 D10-M2 semantics). The
       no-snapshot branch (thread never cached) just filters the temp row. */
    onError: (e: Error, { id }, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["inbox-messages", id], context.previous)
      } else {
        queryClient.setQueryData<Message[]>(["inbox-messages", id], (old) =>
          (old ?? []).filter((m) => !String(m.id ?? "").startsWith("optimistic-")))
      }
      brandedToast.error(e.message || "فشل الإرسال")
    },
  })

  const handleSend = () => {
    if (selectedId && replyText.trim() && !sendMut.isPending) {
      sendMut.mutate({ id: selectedId, text: replyText.trim() })
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* v24-C2 (task 6 / A3-M3): scoped style for the immersive thread —
          body[data-chat-focus] is set by the effect above ONLY while a
          conversation is open (effect cleanup removes it), so these rules are
          inert on the list view and on every other page. The nav selector
          matches MobileBottomNav's root signature (fixed inset-x-0 bottom-0
          z-30 md:hidden) plus its aria-label without editing that component
          (another agent owns it); #page-content is the shell's stable skip-
          link target — its bottom padding (4rem + safe-area) collapses to the
          safe-area so the composer extends into the freed strip. */}
      <style>{`
        /* v24-C2: hide the mobile bottom nav inside an open thread */
        body[data-chat-focus="1"] nav[class*="fixed inset-x-0 bottom-0"],
        body[data-chat-focus="1"] nav[aria-label="التنقل الرئيسي"] { display: none; }
        @media (max-width: 767px) {
          body[data-chat-focus="1"] #page-content { padding-bottom: env(safe-area-inset-bottom); }
        }
      `}</style>
      <PageHeader
        /* v17-E-F1 (D3): Bell collided with the notifications section
            (same glyph in AdminSidebar/MobileBottomNav/notifications header).
            Inbox is the messages-domain glyph (already used by admin/support). */
        icon={<Inbox className="size-4" />}
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
            <div className="flex items-center gap-2">
              {/* v23 (instant inbox): live badge — the faster polls (8s list /
                  5s thread) make the inbox effectively realtime; the pulsing
                  dot says so right beside the search. bg-success is the house
                  green token (PageHeader/badge family), animate-pulse-dot is
                  the existing globals keyframe (same cue as the unread dot),
                  and RTL flex order puts it at the row start. */}
              <span
                role="status"
                aria-label="تحديث لحظي كل ثوانٍ"
                className="flex items-center gap-1.5 shrink-0"
              >
                <span className="size-1.5 rounded-full bg-success animate-pulse-dot" aria-hidden="true" />
                <span className="text-2xs text-muted-foreground">مباشر</span>
              </span>
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="بحث في المحادثات…"
                  aria-label="البحث في المحادثات"
                  className="ps-9 h-9 text-sm border-border/60 focus:border-accent-foreground/40 focus:ring-accent-foreground/20"
                />
              </div>
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
                  {/* v16-E3 (D1 C2): un-nested Link>Button — orange sm visuals
                      (h-9 px-5 override) moved to a span, single tab stop. */}
                  <Link href="/connect">
                    <span className="relative inline-flex shrink-0 items-center justify-center rounded-lg border-0 font-sans text-xs font-bold whitespace-nowrap select-none isolate overflow-hidden bg-primary text-primary-foreground hover:bg-primary/95 shadow-md shadow-accent-foreground/25 hover:shadow-xl hover:shadow-accent-foreground/40 dark:shadow-accent-foreground/35 dark:hover:shadow-accent-foreground/50 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 ease-smooth h-9 min-h-11 min-w-11 gap-1.5 px-5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>*]:relative before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(105deg,transparent_30%,oklch(1_0_0_/_0.22)_50%,transparent_70%)] before:-translate-x-full before:transition-transform before:duration-700 before:ease-out hover:before:translate-x-full before:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-[radial-gradient(circle_at_50%_50%,oklch(1_0_0_/_0.16),transparent_45%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500">
                      <Link2 className="size-3.5" /> ربط الصفحة الآن
                    </span>
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
              /* v24-C2 (task 10 / B4): real list semantics — <ul role="list">
                 + <li> wrappers carry the list/listitem roles (Tailwind
                 preflight strips ul padding/bullets), the conversation
                 buttons stay plain buttons (role="listitem" on a <button>
                 suppressed its native role). */
              <ul role="list">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <ConvItem conv={conv} selectedId={selectedId} onSelect={openConversation} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Message area */}
        <div className={cn("flex-1 flex-col", selectedId ? "flex" : "hidden md:flex")}>
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                /* v17-E-F1 (D3): MessageCircle — the second in-page Bell
                    (same notifications collision as the header icon above). */
                icon={MessageCircle}
                size="lg"
                title="اختر محادثة"
                description="اختر محادثة من القائمة لعرض الرسائل والرد عليها."
              />
            </div>
          ) : (
            <>
              {/* Mobile back-to-list (master-detail) — v24-C2 (task 1): now
                  goes through closeThread so the history stack unwinds with
                  the view (hardware back and the row land on the same list). */}
              <div className="md:hidden flex items-center gap-2 p-2 border-b border-border bg-card/80">
                <Button variant="ghost" size="sm" onClick={closeThread} className="h-9">
                  <DirectionalIcon semanticDirection="forward" className="size-4" /> كل المحادثات
                </Button>
              </div>
              <div
                ref={scrollContainerRef}
                /* v24-C2 (task 9 / B4-P1): the thread is a live log — new
                    bubbles (5s poll) and optimistic replies are announced
                    politely to screen readers; role="log" is the semantically
                    correct "append-only stream" region. */
                role="log"
                aria-live="polite"
                aria-label="الرسائل"
                className={cn(
                  "flex-1 overflow-y-auto p-4 space-y-3 transition-opacity",
                  /* v23: placeholder threads (previous conversation's bubbles
                     shown while the new one loads) dim like the list's
                     isFetching state — an honesty cue, not a content change. */
                  msgIsPlaceholder && "opacity-60",
                )}
              >
                {msgLoading ? (
                  <div className="space-y-3">
                    {[1,2,3].map(i => (
                      <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                        <Skeleton className="h-16 rounded-lg w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : msgIsError ? (
                  /* v17-E-F1 (D1 §5.1 — P1): a failed thread fetch rendered the
                      "no messages" empty state — an error disguised as an empty
                      thread. Mirror of support's ticketDetailQuery branch
                      (support:449-455). */
                  <div className="text-center py-6 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {(msgError as Error)?.message || "تعذر تحميل الرسائل"}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => refetchMessages()}>
                      <RefreshCw className="size-3" /> إعادة المحاولة
                    </Button>
                  </div>
                ) : messages.length === 0 ? (
                  <EmptyState
                    icon={MessageCircle}
                    size="sm"
                    title="لا توجد رسائل في هذه المحادثة"
                    description="اكتب أول رد من مربع الإرسال في الأسفل لبدء الحوار مع العميل."
                  />
                ) : (
                  <>
                    {/* v24-C2 (task 7 / A3-M1): windowing affordance — only the
                        newest 60 bubbles render; this prepends the previous
                        batch while the layout-effect above anchors the
                        scroll to the same message. */}
                    {hiddenCount > 0 && (
                      <div className="flex justify-center pt-1 pb-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={loadOlderMessages}
                          aria-label={`تحميل الرسائل الأقدم (${hiddenCount})`}
                        >
                          <ChevronUp className="size-3.5" />
                          تحميل الرسائل الأقدم
                          <span className="text-2xs text-muted-foreground">({hiddenCount})</span>
                        </Button>
                      </div>
                    )}
                    {visibleMessages.map((msg, i) => {
                      // v4 §2.4 — explicit backend flag; the old from?.id === "page"
                      // comparison never matched → page replies rendered as
                      // customer bubbles (wrong side + wrong color)
                      const isPage = msg.is_from_page === true
                      const hasImage = !!msg.attachment_url && msg.attachment_type === "image"
                      const isSticker = !!msg.attachment_url && msg.attachment_type === "sticker"
                      /* v23: optimistic rows are stamped with id "optimistic-*";
                         they dim while their POST is in flight so pending vs
                         delivered is distinguishable at a glance. opacity-70 on
                         the muted page bubble is transient (in-flight only) — the
                         v14-E5 opacity bans were measured on the tiny primary-
                         bubble meta text, not full muted bubbles. */
                      const isOptimistic =
                        typeof msg.id === "string" && msg.id.startsWith("optimistic-")
                      return (
                        <div key={msg.id || i} className={`flex ${isPage ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[70%] rounded-xl px-4 py-2.5 text-sm ${
                            isPage ? "bg-muted rounded-ss-sm" : "bg-primary text-primary-foreground rounded-se-sm"
                          } ${isOptimistic && sendMut.isPending ? "opacity-70" : ""}`}>
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
                      })}
                  </>
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
                  <div className="flex-1">
                    {/* v17-E-F1 (D7-P0): the raw <textarea> was text-sm (14px) —
                        iOS auto-zooms the viewport on every focus. The shared
                        Textarea brings text-base md:text-sm (16px on mobile),
                        field-sizing-content auto-grow (D10-M4) and dir="auto"
                        built in; the reply-bar look is kept via overrides. */}
                    <Textarea
                      value={replyText}
                      onChange={e => updateDraft(e.target.value)}
                      /* v24-C2 (task 8): blur flushes the debounced draft
                          persist — leaving the field mid-compose writes it
                          immediately instead of waiting for the 400ms timer. */
                      onBlur={flushDraft}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      placeholder="اكتب رداً…"
                      aria-label="نص الرد"
                      rows={1}
                      className="min-h-[44px] max-h-32 resize-none rounded-xl border-input/60 bg-background/80 dark:bg-background/80 px-4 shadow-none focus-visible:border-accent-foreground/40 focus-visible:ring-accent-foreground/15"
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
