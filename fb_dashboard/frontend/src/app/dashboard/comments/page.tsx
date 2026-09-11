"use client"

import { useCallback, useMemo, useState } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { brandedToast } from "@/lib/premium-toast"
import { usePollingWhenVisible } from "@/hooks/usePollingWhenVisible"
import { MessageSquare, Reply, AlertCircle, RefreshCw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { AiSuggestDialog, type AiSuggestResult } from "@/components/ai/AiSuggestDialog"
import { countPhrase, formatDateOnly, formatNumber, timeAgo } from "@/lib/format"
import type { CommentRow } from "@/lib/types"

/* v25 (W-06): عقد /api/comments (routers/replies.py:139) — حد فقط
 * (limit ge=1 le=200) بلا offset/صفحات؛ «تحميل المزيد» يوسّع النافذة
 * بزيادة limit (30 → 60 → … → 200) حتى سقف الخلفية — لا سبيل آخر
 * للوصول للتعليقات الأقدم. */
const COMMENTS_INITIAL = 30
const COMMENTS_STEP = 30
const COMMENTS_MAX = 200


export default function CommentsPage() {
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  /* v17-E-F12: التعليق الذي فُتح لأجله dialog الاقتراحات (null = مغلق).
   * Dialog عرضيّ — الطلب نفسه يعيش في suggestMut تحت، فتتشارك البطاقة
   * في الصف وزر الصف حالة loading نفسها. */
  const [suggestFor, setSuggestFor] = useState<CommentRow | null>(null)
  /* v25 (W-06): حجم نافذة التعليقات — يبدأ 30 ويتوسع بـ«تحميل المزيد»
   * حتى سقف الخلفية (200). مفتاح الاستعلام يتبع limit فتُجلب النافذة
   * الأوسع كاملة (الخلفية تُرجع أول N بالترتيب الزمني نفسه). */
  const [commentsLimit, setCommentsLimit] = useState(COMMENTS_INITIAL)
  const queryClient = useQueryClient()
  /* v25 (W-14): مفتاح ديناميكي (يتبع limit) — useMemo يثبّت المرجع بين
   * العروض لخطاف الاستطلاع المرئي (نفس عقد activity/analytics للثابت). */
  const commentsKey = useMemo(
    () => ["comments", commentsLimit] as const,
    [commentsLimit],
  )

  /* v25 (W-14): 20s → استطلاع مرئي — المؤقّت يتوقف تماماً في تبويب الخلفية
   * (false) ويعود فور العودة مع تجديد فوري متى تقادمت البيانات. */
  const refetchInterval = usePollingWhenVisible(20_000, commentsKey)
  const { data, isLoading, isFetching, isPlaceholderData, isError, error, refetch } = useQuery({
    queryKey: commentsKey,
    queryFn: async () => {
      const res = await apiFetch(`/api/comments?limit=${commentsLimit}`)
      if (!res.ok) throw new Error(`فشل تحميل التعليقات (${res.status})`)
      // v13-L3 (dec-envelope-prune): /api/comments returns ok({items, source})
      // — single envelope via unwrapApi; `?? []` is null-safety only.
      const json = await unwrapApi<{ items: CommentRow[]; source: string }>(res)
      return json?.items ?? []
    },
    /* v25 (W-06): توسيع النافذة يُبقي الصفوف السابقة معروضة (بهتة
     * isFetching عبر المؤشر أدناه) بدل وميض الهيكل الكامل — نمط
     * admin/support v24-C3. */
    placeholderData: (prev) => prev,
    refetchInterval,
    retry: 1,
  })
  const comments = data ?? []

  /* v17-E-F12 (فحص الجاهزية): GET /api/ai/status مرة عند التحميل — إن كانت
   * المفاتيح غير مضبوطة (available:false قاطعة) يعرض زر «اقترح» حالة
   * صادقة (title + توست محذر مصمم عند النقر) بدل نداء ميّت أو خطأ صامت.
   * فشل الفحص نفسه (شبكة) لا يعني «غير مفعّل» — الزر يعمل والـPOST يعرض
   * خطأه العربي الخاص إن تعذر. */
  const { data: aiStatus } = useQuery({
    queryKey: ["ai-status"],
    queryFn: async () => {
      const res = await apiFetch("/api/ai/status")
      return unwrapApi<{ available: boolean; provider: string }>(res)
    },
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
  const aiUnavailable = aiStatus?.available === false

  /* v17-E-F12: عقد POST /api/ai/suggest (routers/ai.py) — Form وليس JSON:
   * comment_text + commenter_name + page_context (منشور التعليق)،
   * والاستجابة ok({suggestions, intent, sentiment, …}) عبر unwrapApi.
   * 400 «AI غير مفعل…» يرميها apiFetch كـApiError عربي → dialog. */
  const suggestMut = useMutation({
    mutationFn: async (c: CommentRow) => {
      const res = await apiFetch("/api/ai/suggest", {
        method: "POST",
        body: new URLSearchParams({
          comment_text: c.message ?? "",
          commenter_name: c.from_name ?? "",
          page_context: c.post_message ?? "",
        }),
      })
      return unwrapApi<AiSuggestResult>(res)
    },
  })

  /* فتح الاقتراح: بواب الجاهزية أولًا — إن كانت available:false قاطعة
   * فالنقرة تشرح نفسها (توست محذر مصمم) ولا يُطلق نداء ولا dialog. */
  const openSuggest = (c: CommentRow) => {
    if (aiUnavailable) {
      brandedToast.warning("الذكاء الاصطناعي غير مفعّل", "فعّله من إعدادات المنصة")
      return
    }
    setSuggestFor(c)
    suggestMut.mutate(c)
  }

  /* «إدراج» من dialog: يملأ مسودة الرد لصف التعليق المحدد فقط (نمط
   * replyText لكل صف الموجود)، يغلق الـdialog، ويتركز حقل الرد برصد
   * rAF — نمط focusStepTitle (v16-E3) حتى لا يسقط التركيز على body
   * بعد إغلاق الطبقة. (الإغلاق شرط: لا توست «أُدرج» بلا هدف فعلي.) */
  const handleInsert = useCallback((text: string) => {
    const target = suggestFor
    if (target) {
      setReplyText(p => ({ ...p, [target.id]: text }))
      setSuggestFor(null)
      requestAnimationFrame(() => {
        const el = document.getElementById(`reply-input-${target.id}`)
        if (el instanceof HTMLInputElement) el.focus()
      })
      brandedToast.success("أُدرج الاقتراح في مسودة الرد", "عدّله كما تريد ثم أرسله")
    }
  }, [suggestFor])

  const replyMut = useMutation({
    mutationFn: ({ commentId, message }: { commentId: string; message: string }) =>
      apiFetch(`/api/replies/${commentId}/reply`, {
        method: "POST", body: new URLSearchParams({ message }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["comments"] })
      // v9-B5 — clear ONLY the replying row's draft; setReplyText({}) wiped
      // every row's in-progress draft when any single reply succeeded.
      setReplyText(prev => {
        if (!(variables.commentId in prev)) return prev
        const next = { ...prev }
        delete next[variables.commentId]
        return next
      })
      brandedToast.success("تم الرد على التعليق")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل الرد"),
  })

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<MessageSquare className="size-4" />}
        title="التعليقات"
        subtitle="جميع التعليقات على المنشورات"
        compact
      />

      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <Card key={i}><CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="size-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/4" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              </CardContent></Card>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل التعليقات</h2>
            <p className="text-xs text-muted-foreground mb-4">{(error as Error)?.message || "تعذر الاتصال بالخادم"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : comments.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="لا توجد تعليقات بعد"
            description="ستظهر تعليقات متابعيك على منشوراتك هنا فور وصولها — ويمكنك الرد عليها بضغطة واحدة."
          />
        ) : (
          <div className="space-y-3" role="list">
            {comments.map((c) => (
              <Card key={c.id} role="listitem">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="size-9 rounded-full bg-accent-foreground/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-accent-foreground">{c.from_name?.[0] || "?"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {/* v14-E5 (D3-ج): from_name is a live Facebook value —
                            dir="auto" isolates Latin/mixed commenter names. */}
                        <span className="text-sm font-medium" dir="auto">{c.from_name}</span>
                        <span className="text-2xs text-muted-foreground">{timeAgo(c.created_time)}</span>
                        {c.reply_text && (
                          <Badge variant="info" className="text-3xs">تم الرد</Badge>
                        )}
                      </div>
                      {/* v15-E6 (D5-M7): comment bodies are live Facebook
                          values (from_name already isolates) — dir="auto"
                          isolates Latin/mixed comment text. */}
                      <p className="text-sm mb-2" dir="auto">{c.message}</p>

                      {c.reply_text && (
                        <div className="bg-muted/50 rounded-lg p-3 mt-2 text-sm border-s-2 border-accent-foreground">
                          <p className="text-2xs text-muted-foreground mb-1">الرد:</p>
                          <p>{c.reply_text}</p>
                        </div>
                      )}

                      {!c.reply_text && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input
                            id={`reply-input-${c.id}`}
                            value={replyText[c.id] || ""}
                            onChange={e => setReplyText(p => ({ ...p, [c.id]: e.target.value }))}
                            placeholder="رد سريع…"
                            aria-label={c.from_name ? `الرد السريع على تعليق ${c.from_name}` : "الرد السريع"}
                            /* v14-E5: raw input bypasses the shared Input component —
                               apply the AA placeholder token directly.
                               v16-E3 (D1 C3): dir="auto" isolates the mixed
                               Arabic/Latin reply being typed.
                               v24-C1: 44px target + 16px font — iOS no-zoom
                               contract (h-8 text-sm was a 32px target that
                               zoomed the viewport on every focus). */
                            dir="auto"
                            className="flex-1 min-w-[10rem] h-11 text-base md:text-sm rounded-lg border border-input bg-background px-3 placeholder:text-placeholder-text focus:outline-none focus:ring-2 focus:ring-accent-foreground/30"
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              if (replyText[c.id]?.trim())
                                replyMut.mutate({ commentId: c.id, message: replyText[c.id].trim() })
                            }}
                            disabled={!replyText[c.id]?.trim() || (replyMut.isPending && replyMut.variables?.commentId === c.id)}
                          >
                            <Reply className="size-3 rtl:-scale-x-100" /> رد
                          </Button>
                          {/* v17-E-F12 (D6-6): زر «اقترح ردًا» — وعد Basic
                              «ردود ذكية AI». loading من useMutation المشترك
                              (disabled + سبينر + «جارٍ الاقتراح…»). */}
                          <Button
                            size="sm"
                            variant="outline"
                            loading={suggestMut.isPending && suggestMut.variables?.id === c.id}
                            onClick={() => openSuggest(c)}
                            aria-label={
                              c.from_name
                                ? `اقترح ردًا بالذكاء الاصطناعي على تعليق ${c.from_name}`
                                : "اقترح ردًا بالذكاء الاصطناعي"
                            }
                            title={
                              aiUnavailable
                                ? "الذكاء الاصطناعي غير مفعّل — فعّله من إعدادات المنصة"
                                : "اقترح ردًا بالذكاء الاصطناعي"
                            }
                            className={aiUnavailable ? "text-muted-foreground" : undefined}
                          >
                            <Sparkles className="size-3" aria-hidden="true" />
                            {suggestMut.isPending && suggestMut.variables?.id === c.id
                              ? "جارٍ الاقتراح…"
                              : "اقترح"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* v25 (W-06): «تحميل المزيد» — الصفحة كانت محصورة في أحدث 30
            تعليقاً للأبد؛ النافذة تتوسع حتى سقف الخلفية (200) مع عدّاد
            صادق للمعروض. آخر نافذة غير ممتلئة أو بلوغ السقف = لا زر. */}
        {!isLoading && !isError && comments.length > 0 && (
          <div className="flex flex-col items-center gap-2 pt-1">
            {comments.length >= commentsLimit && commentsLimit < COMMENTS_MAX ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCommentsLimit((l) => Math.min(COMMENTS_MAX, l + COMMENTS_STEP))
                }
                disabled={isFetching && isPlaceholderData}
              >
                تحميل المزيد
              </Button>
            ) : commentsLimit >= COMMENTS_MAX ? (
              <p className="text-2xs text-muted-foreground">
                تم الوصول للحد الأقصى للعرض ({formatNumber(COMMENTS_MAX)} تعليق)
              </p>
            ) : null}
            <p className="text-2xs text-muted-foreground" role="status">
              {countPhrase(comments.length, "تعليق معروض", "تعليقان معروضان", "تعليقات معروضة")}
            </p>
          </div>
        )}
      </div>

      {/* v17-E-F12: dialog الاقتراحات — حالاته تأتي من useMutation في
          الصفحة؛ الإغلاق (Escape/زر الإغلاق من dialog.tsx المشترك)
          يصفّر suggestFor فقط دون مساس بمسودات الرد. */}
      <AiSuggestDialog
        open={suggestFor !== null}
        onOpenChange={o => { if (!o) setSuggestFor(null) }}
        commentText={suggestFor?.message ?? ""}
        commenterName={suggestFor?.from_name}
        pending={suggestMut.isPending}
        error={suggestMut.error ? (suggestMut.error.message || "تعذر توليد الاقتراحات") : null}
        result={suggestMut.data ?? null}
        onRetry={() => { if (suggestFor) suggestMut.mutate(suggestFor) }}
        onInsert={handleInsert}
      />
    </div>
  )
}
