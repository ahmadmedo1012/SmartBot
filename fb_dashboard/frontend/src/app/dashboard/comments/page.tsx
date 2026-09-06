"use client"

import { useState } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { brandedToast } from "@/lib/premium-toast"
import { MessageSquare, Reply, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import { formatDateOnly, timeAgo } from "@/lib/format"
import type { CommentRow } from "@/lib/types"


export default function CommentsPage() {
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["comments"],
    queryFn: async () => {
      const res = await apiFetch("/api/comments?limit=30")
      if (!res.ok) throw new Error(`فشل تحميل التعليقات (${res.status})`)
      const json = await unwrapApi<CommentRow[] | { items?: CommentRow[] }>(res)
      return Array.isArray(json) ? json : (json.items || [])
    },
    refetchInterval: 20000,
    retry: 1,
  })
  const comments = data ?? []

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
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <MessageSquare className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">التعليقات</h1>
            <p className="text-2xs text-muted-foreground">جميع التعليقات على المنشورات</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
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
                        <span className="text-sm font-medium">{c.from_name}</span>
                        <span className="text-2xs text-muted-foreground">{timeAgo(c.created_time)}</span>
                        {c.reply_text && (
                          <Badge variant="info" className="text-3xs">تم الرد</Badge>
                        )}
                      </div>
                      <p className="text-sm mb-2">{c.message}</p>

                      {c.reply_text && (
                        <div className="bg-muted/50 rounded-lg p-3 mt-2 text-sm border-r-2 border-accent-foreground">
                          <p className="text-2xs text-muted-foreground mb-1">الرد:</p>
                          <p>{c.reply_text}</p>
                        </div>
                      )}

                      {!c.reply_text && (
                        <div className="mt-2 flex gap-2">
                          <input
                            value={replyText[c.id] || ""}
                            onChange={e => setReplyText(p => ({ ...p, [c.id]: e.target.value }))}
                            placeholder="رد سريع..."
                            aria-label={c.from_name ? `الرد السريع على تعليق ${c.from_name}` : "الرد السريع"}
                            className="flex-1 h-8 text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-accent-foreground/30"
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
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
