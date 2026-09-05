"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Megaphone,
  AlertCircle,
  RefreshCw,
  Loader2,
  Send,
  Users,
  Trash2,
  BarChart3,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/ui/PageHeader"
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
  { value: "all", label: "جميع المتابعين", desc: "كل مشتركي الصفحة" },
  { value: "active", label: "النشطون", desc: "تفاعلوا خلال 30 يوماً" },
  { value: "engaged", label: "المتفاعلون", desc: "لديهم ردود أو تعليقات" },
  { value: "new", label: "الجدد", desc: "انضموا خلال 14 يوماً" },
]

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/10 text-blue-500",
  sent: "bg-green-500/10 text-green-600",
  sending: "bg-accent-foreground/10 text-accent-foreground",
  failed: "bg-red-500/10 text-red-500",
}

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  scheduled: "مجدولة",
  sent: "مُرسلة",
  sending: "قيد الإرسال",
  failed: "فشلت",
}

export default function MarketingPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", message: "", audience: "all" })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: async () => {
      const res = await apiFetch("/api/marketing/campaigns")
      if (!res.ok) throw new Error(`فشل تحميل الحملات (${res.status})`)
      return unwrapApi(res)
    },
    retry: 1,
  })

  const audienceQuery = useQuery({
    queryKey: ["audience-size", form.audience],
    queryFn: async () => {
      const res = await apiFetch(`/api/marketing/audience-size?audience=${form.audience}`)
      if (!res.ok) throw new Error("فشل")
      return unwrapApi(res)
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
      if (!res.ok || !d?.success) throw new Error(d?.detail || "فشل إنشاء الحملة")
      return d
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] })
      toast.success("تم إنشاء الحملة")
      setShowForm(false)
      setForm({ name: "", message: "", audience: "all" })
    },
    onError: (e: Error) => toast.error(e.message || "فشل إنشاء الحملة"),
  })

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/marketing/campaigns/${id}/send`, { method: "POST" })
      const d = await res.json()
      if (!res.ok || !d?.success) throw new Error(d?.detail || "فشل الإرسال")
      return d
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] })
      toast.success(`تم إرسال الحملة إلى ${d?.data?.sent_count ?? 0} مشترك`)
    },
    onError: (e: Error) => toast.error(e.message || "فشل الإرسال"),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/marketing/campaigns/${id}`, { method: "DELETE" })
      const d = await res.json()
      if (!res.ok || !d?.success) throw new Error(d?.detail || "فشل الحذف")
      return d
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] })
      toast.success("تم حذف الحملة")
    },
    onError: (e: Error) => toast.error(e.message || "فشل الحذف"),
  })

  // v4 §2.2 — unwrapApi already returned the payload; the extra .data made the list always empty
  const campaigns: Campaign[] = data || []
  const audienceCount: number = audienceQuery.data?.count ?? 0

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
                <h2 className="font-bold text-sm">إنشاء حملة</h2>
                <Input dir="auto"
                  label="اسم الحملة"
                  id="campaign-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="خصم نهاية الأسبوع..."
                />
                <div className="space-y-1">
                  <label htmlFor="campaign-message" className="text-sm font-semibold">
                    نص الرسالة
                  </label>
                  <textarea
                    id="campaign-message"
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    placeholder="اكتب رسالتك التسويقية هنا..."
                    rows={4}
                    className="flex w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold">الجمهور المستهدف</p>
                  <div className="grid grid-cols-2 gap-2">
                    {AUDIENCES.map((a) => (
                      <button
                        key={a.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, audience: a.value }))}
                        className={`p-3 rounded-lg border-2 text-right transition-all ${
                          form.audience === a.value
                            ? "border-accent-foreground bg-accent-foreground/5"
                            : "border-border/50 hover:border-accent-foreground/30"
                        }`}
                      >
                        <p className="text-xs font-bold flex items-center gap-1.5">
                          <Users className="size-3.5" />
                          {a.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{a.desc}</p>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {audienceQuery.isLoading
                      ? "جاري حساب حجم الجمهور..."
                      : `ستصل الحملة إلى ${audienceCount} مشترك`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => createMutation.mutate(form)}
                    disabled={createMutation.isPending || !form.name.trim() || form.message.trim().length < 5}
                    loading={createMutation.isPending}
                    className="gap-2"
                  >
                    <Send className="size-4" />
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
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4 animate-pulse h-16" />
                </Card>
              ))}
            </div>
          ) : isError ? (
            <div className="text-center py-16">
              <AlertCircle className="size-12 mx-auto mb-3 text-red-500/50" />
              <h2 className="text-sm font-bold mb-1">فشل تحميل الحملات</h2>
              <p className="text-xs text-muted-foreground mb-4">
                {(error as Error)?.message || "تعذر الاتصال"}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="size-3" /> إعادة المحاولة
              </Button>
            </div>
          ) : campaigns.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-2">
                <Megaphone className="size-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  لا توجد حملات بعد — أنشئ أول حملة تسويقية لعملائك
                </p>
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
                          <span
                            className={`text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 ${STATUS_STYLE[c.status] || STATUS_STYLE.draft}`}
                          >
                            {STATUS_LABEL[c.status] || c.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {c.message}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.status === "draft" && (
                          <Button
                            size="sm"
                            onClick={() => sendMutation.mutate(c.id)}
                            disabled={sendMutation.isPending}
                            className="gap-1.5 h-7"
                          >
                            {sendMutation.isPending ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Send className="size-3" />
                            )}
                            إرسال
                          </Button>
                        )}
                        {c.status !== "sending" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(c.id)}
                            disabled={deleteMutation.isPending}
                            className="h-7 text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* stats */}
                    {c.status === "sent" && (
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground border-t border-border/40 pt-2.5">
                        <span className="flex items-center gap-1">
                          <Send className="size-3" />
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
    </div>
  )
}
