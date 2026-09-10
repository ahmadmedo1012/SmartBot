"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { Radio, AlertCircle, AlertTriangle, RefreshCw, Plus, Send, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { unwrapApi } from "@/lib/api"
import { countPhrase } from "@/lib/format"
import type { BroadcastRow } from "@/lib/types"
import { formatDate } from "@/lib/format"

const BROADCAST_STATUS_LABELS: Record<string, string> = {
  sent: "مُرسل", pending: "قيد الإرسال", scheduled: "مجدول", failed: "فاشل", draft: "مسودة",
  cancelled: "ملغى", sending: "جارٍ الإرسال",
}

/* v24-C2 (task 2 / A3-B1): GET /api/broadcasts/{id} detail shape — the list
 * rows carry no message text, so the confirmation dialog fetches the detail
 * for the preview snippet, then the purpose-built POST /api/broadcasts/estimate
 * with the SAME stored filters the engine fan-out uses (active, tenant-scoped
 * subscribers + platform/tag/date segments — broadcast_engine.py runs the
 * identical query for both) for the exact audience size. */
interface BroadcastDetail {
  id: number
  name?: string
  message_template?: string
  platform_filter?: Record<string, unknown>
  segment_filters?: Record<string, unknown>
  status?: string
}

/* v17-E-F8 (D6 #6): الحالات القابلة للإلغاء — عقد broadcast_engine.cancel_broadcast
 * (routers/broadcasts.py:165 ← engine): draft|pending|sending فقط؛ الإرسال
 * (send) يقبل المسودة حصرًا (draft→pending ذرّيًا) — أي زر إرسال على حالة
 * أخرى كان زرًا ميتًا يرد 400 «هذا البث مُجدول للإرسال أو أُرسل مسبقاً». */
const CANCELLABLE_STATUSES = new Set(["draft", "pending", "sending"])

/* World-class plan v3 §7c: the page was view-only — no way to CREATE a
 * broadcast despite being titled "إرسال رسائل جماعية". Now it owns a real
 * create→send flow (POST /api/broadcasts + POST /{id}/send). */

export default function BroadcastPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")
  /* v24-C2 (task 2 / A3-B1): «إرسال» no longer mass-sends on a single tap —
     the id of the draft being confirmed drives the dialog below; the send
     mutation fires ONLY from its explicit destructive confirm button. */
  const [confirmSendId, setConfirmSendId] = useState<number | null>(null)

  const { data: broadcasts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: () => apiFetch("/api/broadcasts").then(unwrapApi<BroadcastRow[]>),
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
      return unwrapApi<{ id: number }>(res)
    },
    onSuccess: () => {
      brandedToast.success("تم إنشاء البث — يمكنك إرساله الآن")
      setName("")
      setMessage("")
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل إنشاء البث"),
  })

  const sendMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/broadcasts/${id}/send`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `فشل الإرسال (${res.status})`)
      }
      return unwrapApi<{ ok?: boolean }>(res)
    },
    onSuccess: () => {
      brandedToast.success("تم إرسال البث للمشتركين")
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] })
      /* v24-C2: the queue succeeded — close the confirmation dialog */
      setConfirmSendId(null)
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل الإرسال — تحقق من ربط الصفحة"),
  })

  /* v24-C2 (task 2 / A3-B1): the dialog's payload — broadcast detail (message
   * preview + the stored filters) chained with the exact audience estimate.
   * Lazily enabled while the dialog is open; failure shows an honest Arabic
   * error + retry and KEEPS the confirm disabled (an uninformed mass-send is
   * precisely what this dialog exists to prevent). */
  const {
    data: confirmData,
    isLoading: confirmLoading,
    isError: confirmError,
    error: confirmErrorObj,
    refetch: refetchConfirm,
  } = useQuery({
    queryKey: ["broadcast-send-preview", confirmSendId],
    queryFn: async () => {
      const res = await apiFetch(`/api/broadcasts/${confirmSendId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `فشل تحميل تفاصيل البث (${res.status})`)
      }
      const detail = await unwrapApi<BroadcastDetail>(res)
      const est = await apiFetch("/api/broadcasts/estimate", {
        method: "POST",
        body: JSON.stringify({
          segment_filters: detail.segment_filters ?? {},
          platform_filter: detail.platform_filter ?? {},
        }),
      })
      if (!est.ok) {
        const body = await est.json().catch(() => ({}))
        throw new Error(body.detail || "تعذر تقدير عدد المستلمين")
      }
      const { count } = await unwrapApi<{ count: number }>(est)
      return { detail, count }
    },
    enabled: confirmSendId !== null,
    staleTime: 30000,
    retry: 1,
  })

  /* v17-E-F8 (D6 #6): إلغاء بث معلق/مسودة/قيد الإرسال — POST
   * /api/broadcasts/{id}/cancel (موجود خلفيًا؛ 400 عربي إن لم يعد قابلًا
   * للإلغاء — سباق مع دورة البوت). */
  const cancelMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/broadcasts/${id}/cancel`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `فشل الإلغاء (${res.status})`)
      }
      return unwrapApi<{ ok: boolean }>(res)
    },
    onSuccess: () => {
      brandedToast.success("تم إلغاء البث")
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل إلغاء البث"),
  })

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي؛ زر «بث جديد»
          انتقل إلى actions كما في sequences. */}
      <PageHeader
        icon={<Radio className="size-4" />}
        title="البث الجماعي"
        subtitle="إرسال رسائل جماعية"
        compact
        actions={
          <Button size="sm" className="shadow-sm shadow-accent-foreground/15" onClick={() => setShowForm(v => !v)}>
            <Plus className="size-3.5" /> {showForm ? "إلغاء" : "بث جديد"}
          </Button>
        }
      />

      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-5xl mx-auto w-full">
        {showForm && (
          <Card
            /* v10-B7 (G2-05): Escape closes the inline form (same as the
               «إلغاء» toggle) — the first field is focused on open so the
               key lands inside the container */
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setShowForm(false) } }}
          >
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
                autoFocus
              />
              <div className="space-y-1">
                <Textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="نص الرسالة الجماعية…"
                  rows={3}
                  aria-label="نص الرسالة"
                />
                <p className="text-2xs text-muted-foreground">
                  ستُرسل الرسالة للمشتركين عبر الماسنجر — تأكد من ربط صفحتك أولاً
                </p>
              </div>
              <Button
                onClick={() => createMut.mutate({ name: name.trim() || "بث جديد", message_template: message })}
                disabled={createMut.isPending || message.trim().length < 5}
              >
                <Send className="size-4 rtl:-scale-x-100" />
                {createMut.isPending ? "جارٍ الإنشاء…" : "إنشاء البث"}
              </Button>
            </CardContent>
          </Card>
        )}

        {isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل رسائل البث</h2>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4 animate-pulse h-14" /></Card>)}</div>
        ) : broadcasts.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="لا توجد رسائل بث جماعي"
            description="أنشئ أول بث جماعي لإرسال رسالة لمشتركي صفحتك دفعة واحدة."
            action={{ label: "بث جديد", icon: Plus, onClick: () => setShowForm(true) }}
          />
        ) : (
          broadcasts.map((b) => (
            <Card key={b.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium mb-1">{b.name || `بث #${b.id}`}</p>
                    <p className="text-xs text-muted-foreground">{BROADCAST_STATUS_LABELS[b.status ?? ""] || b.status} · {formatDate(b.scheduled_at || b.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* الإرسال للمسودة فقط (عقد send: draft→pending ذرّيًا) —
                        v24-C2 (task 2 / A3-B1): الزر يفتح حوار التأكيد فقط؛
                        لا إرسال جماعي بلمسة واحدة بعد الآن. */}
                    {b.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmSendId(b.id)}
                        aria-haspopup="dialog"
                      >
                        <Send className="size-3.5 rtl:-scale-x-100" /> إرسال
                      </Button>
                    )}
                    {/* v17-E-F8 (D6 #6): إلغاء البث المعلق — يظهر للحالات
                        القابلة للإلغاء فقط (draft/pending/sending). */}
                    {CANCELLABLE_STATUSES.has(b.status ?? "") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelMut.mutate(b.id)}
                        disabled={cancelMut.isPending && cancelMut.variables === b.id}
                        loading={cancelMut.isPending && cancelMut.variables === b.id}
                        aria-label={`إلغاء البث ${b.name || `#${b.id}`}`}
                        className="hover:text-destructive"
                      >
                        إلغاء
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* v24-C2 (task 2 / A3-B1): تأكيد الإرسال الجماعي — حجم الجمهور من
          POST /api/broadcasts/estimate (نفس استعلام التوزيع الفعلي)، معاينة
          نص الرسالة من GET /api/broadcasts/{id}، تحذير صريح، وزر تأكيد
          تدميري + إلغاء. لا إرسال جماعي بدون هذه الخطوة. */}
      <Dialog open={confirmSendId !== null} onOpenChange={(open) => { if (!open) setConfirmSendId(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>تأكيد الإرسال الجماعي</DialogTitle>
          <DialogDescription>
            سيُرسل «{confirmData?.detail.name || (confirmSendId !== null ? `بث #${confirmSendId}` : "")}» إلى المشتركين المطابقين عبر الماسنجر.
          </DialogDescription>

          <div className="space-y-3">
            {/* حجم الجمهور — العدد الدقيق الذي سيستلم الرسالة */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" /> عدد المستلمين المتوقع
              </span>
              {confirmLoading ? (
                <Skeleton className="h-5 w-16" />
              ) : confirmError ? (
                <span className="text-xs text-destructive">تعذر تحديد العدد</span>
              ) : (
                <span className="text-sm font-bold" dir="ltr">{countPhrase(confirmData?.count ?? 0, "مشترك", "مشتركين", "مشتركين")}</span>
              )}
            </div>

            {/* معاينة نص الرسالة */}
            {confirmLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : confirmData?.detail.message_template?.trim() ? (
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <p className="text-2xs text-muted-foreground mb-1">معاينة الرسالة</p>
                <p className="text-sm leading-relaxed line-clamp-3" dir="auto">
                  {confirmData.detail.message_template}
                </p>
              </div>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                هذا البث بلا نص رسالة — تأكد من محتواه قبل الإرسال.
              </p>
            )}

            {/* تحذير عدم قابلية التراجع */}
            <p className="flex items-start gap-2 text-xs text-destructive leading-relaxed" role="alert">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              تحذير: سيصل البث إلى كل هؤلاء المشتركين دفعة واحدة، ولا يمكن التراجع عن الإرسال بعد بدئه.
            </p>

            {/* فشل تحميل التفاصيل — إعادة محاولة بلا زر تأكيد أعمى */}
            {confirmError && (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">{(confirmErrorObj as Error)?.message || "تعذر تحميل تفاصيل البث"}</span>
                <Button size="sm" variant="outline" onClick={() => refetchConfirm()}>
                  <RefreshCw className="size-3" /> إعادة المحاولة
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => { if (confirmSendId !== null) sendMut.mutate(confirmSendId) }}
                disabled={confirmLoading || confirmError || (sendMut.isPending && sendMut.variables === confirmSendId)}
                loading={sendMut.isPending && sendMut.variables === confirmSendId}
              >
                <Send className="size-3.5 rtl:-scale-x-100" /> تأكيد الإرسال
              </Button>
              <Button variant="outline" onClick={() => setConfirmSendId(null)}>
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
