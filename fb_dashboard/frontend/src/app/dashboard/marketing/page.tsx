"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { brandedToast } from "@/lib/premium-toast"
import { countPhrase } from "@/lib/format"
import {
  Megaphone,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Send,
  Users,
  Trash2,
  BarChart3,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/EmptyState"
import { Input } from "@/components/ui/input"
/* r131-F7b (A4 P1-1 family): the campaign-message raw <textarea> joins
 * the shared Textarea seam (F8 swap family completion — was rounded-sm +
 * hand-rolled ring-offset ring + md:text-sm 14px desktop). */
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/ui/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"

interface Campaign {
  id: number
  name: string
  message: string
  audience: string
  status: string
  scheduled_at: string | null
  sent_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  created_at: string | null
}

const AUDIENCES: { value: string; label: string; desc: string }[] = [
  { value: "all", label: "جميع المشتركين", desc: "كل مشتركي الصفحة" },
  { value: "active", label: "النشطون", desc: "تفاعلوا خلال 30 يوماً" },
  { value: "engaged", label: "المتفاعلون", desc: "لديهم ردود أو تعليقات" },
  { value: "new", label: "الجدد", desc: "انضموا خلال 14 يوماً" },
]

/* r131-F8 (A4 P2-3): the hand-rolled chip style map → a Badge variant map
 * (solid pastel grounds + -ink text after the F7 re-base). */
const STATUS_BADGE: Record<string, "secondary" | "info" | "success" | "gold" | "danger"> = {
  draft: "secondary",
  scheduled: "info",
  sent: "success",
  sending: "gold",
  failed: "danger",
}

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  scheduled: "مجدولة",
  sent: "مُرسلة",
  sending: "قيد الإرسال",
  failed: "تعذّرت",
}

/* v25 (W-01): تسمية الجمهور في حوار تأكيد الإرسال — نفس مصدر تسميات
 * نموذج الإنشاء أعلاه (AUDIENCES) بلا ازدواج نصّي. */
const AUDIENCE_LABELS: Record<string, string> = Object.fromEntries(
  AUDIENCES.map((a) => [a.value, a.label]),
)

export default function MarketingPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", message: "", audience: "all" })
  /* v25 (W-01 — معيار v24-C2 كصفحة البث): «إرسال» الحملة لم يعد إرسالاً
   * جماعياً بلمسة واحدة — الضغط يفتح حوار «تأكيد الإرسال الجماعي» مع
   * تقدير حجم الجمهور من مسار الخلفية نفسه، والزر التدميري داخل الحوار
   * هو الوحيد الذي يطلق POST /campaigns/{id}/send. */
  const [confirmSendId, setConfirmSendId] = useState<number | null>(null)
  /* v25 (W-02 — نمط posts/sequences): حذف الحملة بلمستين — الضغط الأول
   * يكشف «تأكيد الحذف / إلغاء» بدل زر الأيقونة المدمرة المباشرة. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: async () => {
      const res = await apiFetch("/api/marketing/campaigns")
      if (!res.ok) throw new Error(`تعذّر تحميل الحملات (${res.status})`)
      return unwrapApi<{ items: Campaign[]; total: number }>(res)
    },
    retry: 1,
  })

  const audienceQuery = useQuery({
    queryKey: ["audience-size", form.audience],
    queryFn: async () => {
      const res = await apiFetch(`/api/marketing/audience-size?audience=${form.audience}`)
      if (!res.ok) throw new Error("تعذّر")
      /* r133 (eslint adoption): explicit unwrapApi type (the any default
         is gone) — ok({count}) per routers/marketing.py:133. */
      return unwrapApi<{ count: number }>(res)
    },
    enabled: showForm,
  })

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const res = await apiFetch("/api/marketing/campaigns", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok || !d?.success) throw new Error(d?.detail || "تعذّر إنشاء الحملة")
      return d
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] })
      brandedToast.success("تم إنشاء الحملة")
      setShowForm(false)
      setForm({ name: "", message: "", audience: "all" })
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر إنشاء الحملة"),
  })

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/marketing/campaigns/${id}/send`, { method: "POST" })
      return unwrapApi<{ id: number; status: string; sent_count: number; delivered_count: number; dispatched: boolean }>(res)
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] })
      /* v25 (W-01): نُفّذ الإرسال — أغلق حوار التأكيد */
      setConfirmSendId(null)
      // v12-E5.5: Arabic plural via countPhrase (was raw `${n} مشترك` —
      // broken for 0/1/2 and non-Arabic numeral shaping; D10 i18n finding).
      const sent = d?.sent_count ?? 0
      brandedToast.success(`تم إرسال الحملة إلى ${countPhrase(sent, "مشترك", "مشتركين", "مشتركين")}`)
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر الإرسال"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/marketing/campaigns/${id}`, { method: "DELETE" })
      const d = await res.json()
      if (!res.ok || !d?.success) throw new Error(d?.detail || "تعذّر الحذف")
      return d
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] })
      /* v25 (W-02): نُفّذ الحذف — أعد عنقود الإجراءات لوضعه الطبيعي */
      setConfirmDeleteId(null)
      brandedToast.success("تم حذف الحملة")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر الحذف"),
  })

  // v13-L3: /api/marketing/campaigns answers ok({items,total}) (marketing.py,
  // v12-E2.12) — the optional chain only covers the react-query loading window.
  const campaigns: Campaign[] = data?.items ?? []
  const audienceCount: number = audienceQuery.data?.count ?? 0

  /* v25 (W-01): حمولة حوار التأكيد — صف الحملة قيد التأكيد (للاسم/الجمهور/
   * معاينة الرسالة) + تقدير الجمهور من GET /api/marketing/audience-size
   * (routers/marketing.py:133 — نفس الاستعلام الذي ينفّذه التوزيع عند
   * الإرسال، بغلاف ok({audience,count})). مُفعّل فقط والحوار مفتوح؛ فشل
   * التقدير يُبقي زر التأكيد معطلاً (إرسال جماعي غير مُخبَر هو ما يمنعه
   * هذا الحوار) مع إعادة محاولة عربية. */
  const confirmCampaign = campaigns.find((c) => c.id === confirmSendId) ?? null
  const confirmAudience = confirmCampaign?.audience ?? ""
  const {
    data: confirmEstimate,
    isLoading: estimateLoading,
    isError: estimateError,
    refetch: refetchEstimate,
  } = useQuery({
    queryKey: ["marketing-send-preview", confirmSendId],
    queryFn: async () => {
      const res = await apiFetch(`/api/marketing/audience-size?audience=${encodeURIComponent(confirmAudience)}`)
      return unwrapApi<{ audience: string; count: number }>(res)
    },
    enabled: confirmSendId !== null && !!confirmAudience,
    staleTime: 30000,
    retry: 1,
  })

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        icon={<Megaphone className="size-4" />}
        title="التسويق"
        subtitle="حملات المراسلة الجماعية"
        compact
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Create */}
          {!showForm ? (
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="size-4" />
              حملة جديدة
            </Button>
          ) : (
            <Card>
              <CardContent className="p-5 space-y-4">
                <h2 className="sb-section-title">إنشاء حملة</h2>
                <Input dir="auto"
                  label="اسم الحملة"
                  id="campaign-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="خصم نهاية الأسبوع…"
                />
                <div className="space-y-1">
                  <label htmlFor="campaign-message" className="text-sm font-semibold">
                    نص الرسالة
                  </label>
                  {/* r131-F7b (A4 P1-1): raw textarea → the shared Textarea
                      seam (dir="auto" + canonical recipe built in). */}
                  <Textarea
                    id="campaign-message"
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    placeholder="اكتب رسالتك التسويقية هنا…"
                    rows={4}
                    className="resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold">الجمهور المستهدف</p>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="اختيار الجمهور">
                    {AUDIENCES.map((a) => (
                      <button
                        key={a.value}
                        type="button"
                        role="radio"
                        aria-checked={form.audience === a.value}
                        onClick={() => setForm((f) => ({ ...f, audience: a.value }))}
                        className={`p-3 rounded-lg border-2 text-start transition-[border-color,background-color] ${
                          form.audience === a.value
                            ? "border-accent-foreground bg-accent-foreground/5"
                            : "border-border/50 hover:border-accent-foreground/30"
                        }`}
                      >
                        <p className="text-xs font-bold flex items-center gap-1.5">
                          <Users className="size-3.5" />
                          {a.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
                      </button>
                    ))}
                  </div>
                  <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                    {audienceQuery.isLoading
                      ? "جارٍ حساب حجم الجمهور…"
                      : `ستصل الحملة إلى ${countPhrase(audienceCount, "مشترك", "مشتركين", "مشتركين")}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => createMutation.mutate(form)}
                    disabled={createMutation.isPending || !form.name.trim() || form.message.trim().length < 5}
                    loading={createMutation.isPending}
                    className="gap-2"
                  >
                    <Send className="size-4 rtl:-scale-x-100" />
                    حفظ الحملة
                  </Button>
                  <Button variant="outline" onClick={() => setShowForm(false)}>
                    إلغاء
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* List */}
          {isLoading ? (
            /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. */
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4"><div className="skeleton h-16 rounded" /></CardContent>
                </Card>
              ))}
            </div>
          ) : isError ? (
            /* r131-F8 (A4 P2-8): bare-AlertCircle error → the canonical .state family. */
            <div className="state state-danger py-16" role="alert">
              <div className="state-icon" aria-hidden="true">
                <AlertCircle />
              </div>
              <h2 className="state-title">تعذّر تحميل الحملات</h2>
              <p className="state-desc">
                {(error as Error)?.message || "تعذّر الاتصال، تحقق من الإنترنت ثم أعد المحاولة"}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
              </Button>
            </div>
          ) : campaigns.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Megaphone}
                  size="sm"
                  title="لا توجد حملات بعد"
                  description="أنشئ أول حملة تسويقية لعملائك من زر حملة جديدة أعلى الصفحة وستظهر نتائجها هنا."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold truncate">{c.name}</p>
                          <Badge variant={STATUS_BADGE[c.status] ?? "secondary"} className="shrink-0">
                            {STATUS_LABEL[c.status] || c.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {c.message}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* v25 (W-01): الزر يفتح حوار «تأكيد الإرسال الجماعي»
                            فقط — لا إرسال جماعي بلمسة واحدة بعد الآن. */}
                        {c.status === "draft" && (
                          <Button
                            size="sm"
                            onClick={() => setConfirmSendId(c.id)}
                            aria-haspopup="dialog"
                            className="gap-1.5 h-11"
                          >
                            <Send className="size-3 rtl:-scale-x-100" />
                            إرسال
                          </Button>
                        )}
                        {/* v25 (W-02 — نمط posts): أثناء التأكيد يستبدل
                            العنقود كاملاً بأزرار «تأكيد الحذف / إلغاء»
                            (44px) والضغط الثاني فقط ينفّذ DELETE. */}
                        {confirmDeleteId === c.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteMutation.mutate(c.id)}
                              disabled={deleteMutation.isPending && deleteMutation.variables === c.id}
                              loading={deleteMutation.isPending && deleteMutation.variables === c.id}
                            >
                              <Trash2 className="size-3" aria-hidden="true" /> تأكيد الحذف
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="إلغاء حذف الحملة"
                            >
                              إلغاء
                            </Button>
                          </>
                        ) : (
                          c.status !== "sending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmDeleteId(c.id)}
                              disabled={deleteMutation.isPending && deleteMutation.variables === c.id}
                              aria-label="حذف الحملة"
                              className="h-11 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          )
                        )}
                      </div>
                    </div>

                    {/* stats */}
                    {c.status === "sent" && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border/40 pt-2.5">
                        <span className="flex items-center gap-1">
                          <Send className="size-3 rtl:-scale-x-100" />
                          أُرسلت إلى {c.sent_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <BarChart3 className="size-3" />
                          وصلت {c.delivered_count}
                        </span>
                        <span>فتح {c.opened_count}</span>
                        <span>نقر {c.clicked_count}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* v25 (W-01 — معيار v24-C2 كصفحة البث): حوار «تأكيد الإرسال الجماعي»
          — تقدير عدد المستلمين من /api/marketing/audience-size (نفس استعلام
          التوزيع الفعلي)، معاينة نص الرسالة من صف الحملة، تحذير صريح بعدم
          قابلية التراجع، وزر تدميري + إلغاء. لا إرسال جماعي بدونه. */}
      <Dialog open={confirmSendId !== null} onOpenChange={(open) => { if (!open) setConfirmSendId(null) }}>
        {/* r131-F8 (A4 P2-7): the sm:max-w-md override drops — the dialog rides
            F7's canonical 560px default. */}
        <DialogContent>
          <DialogTitle>تأكيد الإرسال الجماعي</DialogTitle>
          <DialogDescription>
            سيُرسل «{confirmCampaign?.name || (confirmSendId !== null ? `حملة #${confirmSendId}` : "")}» إلى {AUDIENCE_LABELS[confirmAudience] || "المشتركين"} عبر الماسنجر.
          </DialogDescription>

          <div className="space-y-3">
            {/* حجم الجمهور — العدد الذي سيستلم الرسالة */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden="true" /> عدد المستلمين المتوقع
              </span>
              {estimateLoading ? (
                <Skeleton className="h-5 w-16" />
              ) : estimateError ? (
                <span className="text-xs text-destructive">تعذّر تحديد العدد</span>
              ) : (
                <span className="text-sm font-bold" dir="ltr">{countPhrase(confirmEstimate?.count ?? 0, "مشترك", "مشتركين", "مشتركين")}</span>
              )}
            </div>

            {/* معاينة نص الرسالة */}
            {confirmCampaign?.message?.trim() ? (
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <p className="text-xs text-muted-foreground mb-1">معاينة الرسالة</p>
                <p className="text-sm leading-relaxed line-clamp-3" dir="auto">
                  {confirmCampaign.message}
                </p>
              </div>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                هذه الحملة بلا نص رسالة — تأكد من محتواها قبل الإرسال.
              </p>
            )}

            {/* تحذير عدم قابلية التراجع */}
            <p className="flex items-start gap-2 text-xs text-destructive leading-relaxed" role="alert">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              تحذير: سيصل البث إلى كل هؤلاء المشتركين دفعة واحدة، ولا يمكن التراجع عن الإرسال بعد بدئه.
            </p>

            {/* فشل تحميل التقدير — إعادة محاولة بلا زر تأكيد أعمى */}
            {estimateError && (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">تعذّر تقدير حجم الجمهور — لا يمكن التأكيد بلا معاينة</span>
                <Button size="sm" variant="outline" onClick={() => refetchEstimate()}>
                  <RefreshCw className="size-3" /> إعادة المحاولة
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => { if (confirmSendId !== null) sendMutation.mutate(confirmSendId) }}
                disabled={estimateLoading || estimateError || (sendMutation.isPending && sendMutation.variables === confirmSendId)}
                loading={sendMutation.isPending && sendMutation.variables === confirmSendId}
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
