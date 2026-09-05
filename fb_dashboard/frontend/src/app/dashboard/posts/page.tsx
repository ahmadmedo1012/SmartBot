"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { toast } from "sonner"
import { Newspaper, Send, Trash2 , AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { unwrapApi } from "@/lib/api"

const POST_STATUS_LABELS: Record<string, string> = {
  published: "منشور", scheduled: "مجدول", draft: "مسودة", failed: "فاشل",
}

export default function PostsPage() {
  const [newMessage, setNewMessage] = useState("")
  const queryClient = useQueryClient()

  const { data: posts = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["scheduled-posts"],
    queryFn: () => apiFetch("/api/scheduled-posts").then(unwrapApi),
    refetchInterval: 30000,
    retry: 1,
  })
  // v4 §2.5 — API failure previously rendered as "لا توجد منشورات بعد"
  // (data looked empty instead of broken)

  const createMut = useMutation({
    mutationFn: (message: string) =>
      apiFetch("/api/scheduled-posts", {
        method: "POST", body: new URLSearchParams({ message }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      setNewMessage("")
      toast.success("تم إنشاء المنشور")
    },
    onError: (e: Error) => toast.error(e.message || "فشل إنشاء المنشور"),
  })

  const publishMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/scheduled-posts/${id}/publish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      toast.success("تم النشر على فيسبوك")
    },
    onError: (e: Error) => toast.error(e.message || "فشل النشر"),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/scheduled-posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      toast.success("تم حذف المنشور")
    },
    onError: (e: Error) => toast.error(e.message || "فشل الحذف"),
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <Newspaper className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">المنشورات</h1>
            <p className="text-[11px] text-muted-foreground">إدارة ونشر المنشورات</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Card>
          <CardContent className="p-4">
            <textarea
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="اكتب منشوراً جديداً..."
              className="w-full min-h-[100px] rounded-xl border border-input bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-foreground/30 resize-none"
            />
            <div className="flex justify-end mt-3">
              <Button
                onClick={() => { if (newMessage.trim()) createMut.mutate(newMessage.trim()) }}
                disabled={!newMessage.trim() || createMut.isPending}
              >
                <Send className="size-4" /> نشر
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <Card key={i}><CardContent className="p-4 animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent></Card>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
            <p className="text-sm font-bold mb-1">فشل تحميل المنشورات</p>
            <p className="text-xs text-muted-foreground mb-4">{(error as any)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <Newspaper className="size-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">لا توجد منشورات بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((p: any) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <p className="text-sm mb-2">{p.message}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className={`px-2 py-0.5 rounded-full ${
                        p.status === "published" ? "bg-success/15 text-success" :
                        p.status === "scheduled" ? "bg-info/15 text-info" :
                        "bg-muted text-muted-foreground"
                      }`}>{POST_STATUS_LABELS[p.status] || p.status}</span>
                      {p.scheduled_at && <span>{new Date(p.scheduled_at).toLocaleString("ar-LY")}</span>}
                    </div>
                    <div className="flex gap-1">
                      {p.status !== "published" && (
                        <Button size="sm" variant="ghost" onClick={() => publishMut.mutate(p.id)}>
                          <Send className="size-3" />
                        </Button>
                      )}
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
