"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { toast } from "sonner"
import { Clock, CalendarDays, Send, Trash2 , AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default function ScheduledPage() {
  const [message, setMessage] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")
  const queryClient = useQueryClient()

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["scheduled-posts", "scheduled"],
    queryFn: () => apiFetch("/api/scheduled-posts?status=scheduled").then(r => r.json()),
    refetchInterval: 30000,
  })

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch("/api/scheduled-posts", {
        method: "POST",
        body: new URLSearchParams({ message: message.trim(), scheduled_at: scheduledAt }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      setMessage(""); setScheduledAt("")
      toast.success("تمت الجدولة")
    },
    onError: (e: Error) => toast.error(e.message || "فشل الجدولة"),
  })

  const publishMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/scheduled-posts/${id}/publish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      toast.success("تم النشر")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/scheduled-posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      toast.success("تم الحذف")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <Clock className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">المجدول</h1>
            <p className="text-[11px] text-muted-foreground">المنشورات المجدولة</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Card>
          <CardContent className="p-4 space-y-3">
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="محتوى المنشور..."
              className="w-full min-h-[80px] rounded-xl border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange/30 resize-none"
            />
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="text-sm"
                />
              </div>
              <Button onClick={() => createMut.mutate()} disabled={!message.trim() || !scheduledAt || createMut.isPending}>
                <CalendarDays className="size-4" /> جدولة
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <Card key={i}><CardContent className="p-4 animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </CardContent></Card>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="size-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">لا توجد منشورات مجدولة</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((p: any) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <p className="text-sm mb-2">{p.message}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="size-3" />
                      <span>{p.scheduled_at ? new Date(p.scheduled_at).toLocaleString("ar-LY") : "بدون تاريخ"}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => publishMut.mutate(p.id)}>
                        <Send className="size-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(p.id)}>
                        <Trash2 className="size-3" />
                      </Button>
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
