"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { toast } from "sonner"
import { Radio, AlertCircle, RefreshCw, Plus, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/EmptyState"
import { unwrapApi } from "@/lib/api"

const BROADCAST_STATUS_LABELS: Record<string, string> = {
  sent: "مُرسل", pending: "قيد الإرسال", scheduled: "مجدول", failed: "فاشل", draft: "مسودة",
}

/* World-class plan v3 §7c: the page was view-only — no way to CREATE a
 * broadcast despite being titled "إرسال رسائل جماعية". Now it owns a real
 * create→send flow (POST /api/broadcasts + POST /{id}/send). */

export default function BroadcastPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")

  const { data: broadcasts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => apiFetch("/api/broadcasts").then(unwrapApi),
    refetchInterval: 30000,
  })

  const createMut = useMutation({
    mutationFn: async (payload: { name: string; message_template: string }) => {
      const res = await apiFetch("/api/broadcasts", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `فشل الإنشاء (${res.status})`)
      }
      return unwrapApi(res)
    },
    onSuccess: (data: any) => {
      toast.success("تم إنشاء البث — يمكنك إرساله الآن")
      setName("")
      setMessage("")
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] })
    },
    onError: (e: any) => toast.error(e.message || "فشل إنشاء البث"),
  })

  const sendMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/broadcasts/${id}/send`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `فشل الإرسال (${res.status})`)
      }
      return unwrapApi(res)
    },
    onSuccess: () => {
      toast.success("تم إرسال البث للمشتركين")
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] })
    },
    onError: (e: any) => toast.error(e.message || "فشل الإرسال — تحقق من ربط الصفحة"),
  })

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <Radio className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">البث الجماعي</h1>
            <p className="text-[11px] text-muted-foreground">إرسال رسائل جماعية</p>
          </div>
          <Button size="sm" className="ms-auto shadow-sm shadow-orange/15" onClick={() => setShowForm(v => !v)}>
            <Plus className="size-3.5" /> {showForm ? "إلغاء" : "بث جديد"}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>إنشاء بث جماعي</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                id="broadcast-name"
                label="اسم البث"
                placeholder="مثال: عرض نهاية الأسبوع"
                value={name}
                onChange={e => setName(e.target.value)}
              />
              <div className="space-y-1">
                <Textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="نص الرسالة الجماعية…"
                  rows={3}
                  aria-label="نص الرسالة"
                />
                <p className="text-[11px] text-muted-foreground">
                  ستُرسل الرسالة للمشتركين عبر الماسنجر — تأكد من ربط صفحتك أولًا
                </p>
              </div>
              <Button
                onClick={() => createMut.mutate({ name: name.trim() || "بث جديد", message_template: message })}
                disabled={createMut.isPending || message.trim().length < 5}
              >
                <Send className="size-4" />
                {createMut.isPending ? "جارٍ الإنشاء…" : "إنشاء البث"}
              </Button>
            </CardContent>
          </Card>
        )}

        {isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل البثوث</h2>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-14" /></Card>)}</div>
        ) : (broadcasts as any[]).length === 0 ? (
          <EmptyState
            icon={Radio}
            title="لا توجد بثوث جماعية"
            description="أنشئ أول بث جماعي لإرسال رسالة لمشتركي صفحتك دفعة واحدة."
            action={{ label: "بث جديد", icon: Plus, onClick: () => setShowForm(true) }}
          />
        ) : (
          (broadcasts as any[]).map((b: any) => (
            <Card key={b.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium mb-1">{b.name || `بث #${b.id}`}</p>
                    <p className="text-xs text-muted-foreground">{BROADCAST_STATUS_LABELS[b.status] || b.status} · {new Date(b.scheduled_at || b.created_at).toLocaleString("ar-LY")}</p>
                  </div>
                  {b.status !== "sent" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => sendMut.mutate(b.id)}
                      disabled={sendMut.isPending}
                      className="shrink-0"
                    >
                      <Send className="size-3.5" /> إرسال
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
