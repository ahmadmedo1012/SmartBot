"use client"

import { useState } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { toast } from "sonner"
import { MessageSquare, Reply } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

function timeAgo(dateStr: string) {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "الآن"
  if (mins < 60) return `منذ ${mins} د`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} س`
  return new Date(dateStr).toLocaleDateString("ar-LY")
}

export default function CommentsPage() {
  const [filter] = useState("all")
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()

  const { data = { items: [], total: 0 }, isLoading } = useQuery({
    queryKey: ["comments", filter],
    queryFn: () => apiFetch("/api/bot/recent-comments").then(r => r.json()).catch(() => ({ items: [], total: 0 })),
    refetchInterval: 20000,
  })
  const comments = Array.isArray(data) ? data : (data.items || [])

  const replyMut = useMutation({
    mutationFn: ({ commentId, message }: { commentId: string; message: string }) =>
      apiFetch(`/api/bot/comments/${commentId}/reply`, {
        method: "POST", body: new URLSearchParams({ message }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments"] })
      setReplyText({})
      toast.success("تم الرد على التعليق")
    },
    onError: (e: Error) => toast.error(e.message || "فشل الرد"),
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-9 rounded-lg bg-orange/10 flex items-center justify-center">
            <MessageSquare className="size-4 text-orange" />
          </div>
          <div>
            <h1 className="font-bold text-sm">التعليقات</h1>
            <p className="text-[11px] text-muted-foreground">جميع التعليقات على المنشورات</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <Card key={i}><CardContent className="p-4 animate-pulse space-y-2">
                <div className="h-3 bg-muted rounded w-1/4" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardContent></Card>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="size-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">لا توجد تعليقات بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((c: any) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="size-9 rounded-full bg-orange/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-orange">{c.author?.[0] || "?"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{c.author}</span>
                        <span className="text-[11px] text-muted-foreground">{timeAgo(c.created_time)}</span>
                        {c.auto_replied && (
                          <Badge variant="info" className="text-[10px]">آلي</Badge>
                        )}
                      </div>
                      <p className="text-sm mb-2">{c.message}</p>

                      {c.reply && (
                        <div className="bg-muted/50 rounded-lg p-3 mt-2 text-sm border-r-2 border-orange">
                          <p className="text-[11px] text-muted-foreground mb-1">الرد:</p>
                          <p>{c.reply}</p>
                        </div>
                      )}

                      {!c.auto_replied && (
                        <div className="mt-2 flex gap-2">
                          <input
                            value={replyText[c.id] || ""}
                            onChange={e => setReplyText(p => ({ ...p, [c.id]: e.target.value }))}
                            placeholder="رد سريع..."
                            className="flex-1 h-8 text-sm rounded-lg border border-input bg-background px-3 focus:outline-none focus:ring-2 focus:ring-orange/30"
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              if (replyText[c.id]?.trim())
                                replyMut.mutate({ commentId: c.id, message: replyText[c.id].trim() })
                            }}
                            disabled={!replyText[c.id]?.trim() || replyMut.isPending}
                          >
                            <Reply className="size-3" /> رد
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
