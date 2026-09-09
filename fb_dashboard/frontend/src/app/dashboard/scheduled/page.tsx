"use client"

import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { Clock, CalendarDays, Send, Trash2 , AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { Input } from "@/components/ui/input"
import { unwrapApi } from "@/lib/api"
import type { ScheduledPost } from "@/lib/types"
import { formatDate } from "@/lib/format"

export default function ScheduledPage() {
  const [message, setMessage] = useState("")
  const [scheduledAt, setScheduledAt] = useState("")
  // v9-B1 — the datetime-local `min` used to be computed during render from
  // Date.now(): the server renders it in UTC while the client re-renders it
  // in +02 → guaranteed hydration mismatch. Compute it client-side only,
  // after mount; until then no `min` attribute is emitted at all.
  const [minDateTime, setMinDateTime] = useState<string | undefined>(undefined)
  useEffect(() => {
    setMinDateTime(
      new Date(Date.now() + 60000 - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    )
  }, [])
  const queryClient = useQueryClient()

  // v9-B2 — API failure previously rendered as "لا توجد منشورات مجدولة"
  // (data looked empty instead of broken — same v4 §2.5 pattern posts fixed)
  const { data: posts = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["scheduled-posts", "scheduled"],
    queryFn: () => apiFetch("/api/scheduled-posts?status=scheduled").then(unwrapApi<ScheduledPost[]>),
    refetchInterval: 30000,
    retry: 1,
  })

  const createMut = useMutation({
    // v4 §6.23 — datetime-local gives a naive LOCAL string (Libya +02); the
    // backend compared it against UTC → posts fired 2h late, and past dates
    // were accepted. toISOString() is unambiguous UTC + server rejects past.
    mutationFn: () =>
      apiFetch("/api/scheduled-posts", {
        method: "POST",
        body: new URLSearchParams({
          message: message.trim(),
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : "",
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      setMessage(""); setScheduledAt("")
      brandedToast.success("تمت الجدولة")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل الجدولة"),
  })

  const publishMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/scheduled-posts/${id}/publish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      brandedToast.success("تم النشر")
    },
    onError: (e: Error) => brandedToast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/scheduled-posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      brandedToast.success("تم الحذف")
    },
    onError: (e: Error) => brandedToast.error(e.message),
  })

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<Clock className="size-4" />}
        title="المجدول"
        subtitle="المنشورات المجدولة"
        compact
      />

      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        <Card>
          <CardContent className="p-4 space-y-3">
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="محتوى المنشور…"
              aria-label="نص المنشور"
              /* v16-E3 (D1 C3): raw textarea bypasses the shared Textarea
                  seam — dir="auto" isolates mixed Arabic/Latin post text. */
              dir="auto"
              className="w-full min-h-[80px] rounded-xl border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-foreground/30 resize-none"
            />
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  aria-label="وقت النشر"
                  min={minDateTime}
                  className="text-sm"
                />
              </div>
              {/* v17-E-F3 (D1 §5.6): loading prop + «جارٍ الجدولة…» (mirror:
                  support:341-349 / marketing:218) — disabled-only had no
                  in-flight affordance. */}
              <Button onClick={() => createMut.mutate()} disabled={!message.trim() || !scheduledAt || createMut.isPending} loading={createMut.isPending}>
                <CalendarDays className="size-4" /> {createMut.isPending ? "جارٍ الجدولة…" : "جدولة"}
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
        ) : isError ? (
          <div className="text-center py-12">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <p className="text-sm font-bold mb-1">فشل تحميل المنشورات المجدولة</p>
            <p className="text-xs text-muted-foreground mb-4">{(error as Error)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="لا توجد منشورات مجدولة"
            description="جدّول أول منشور من النموذج أعلاه وستظهر منشوراتك المجدولة هنا — يُنشر كل منشور تلقائياً في وقته."
          />
        ) : (
          <div className="space-y-3">
            {posts.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <p className="text-sm mb-2">{p.message}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="size-3" />
                      <span>{p.scheduled_at ? formatDate(p.scheduled_at) : "بدون تاريخ"}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => publishMut.mutate(p.id)} disabled={publishMut.isPending && publishMut.variables === p.id} aria-label="نشر المنشور المجدول الآن">
                        <Send className="size-3 rtl:-scale-x-100" aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(p.id)} disabled={deleteMut.isPending && deleteMut.variables === p.id} aria-label="حذف المنشور المجدول">
                        <Trash2 className="size-3" aria-hidden="true" />
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
