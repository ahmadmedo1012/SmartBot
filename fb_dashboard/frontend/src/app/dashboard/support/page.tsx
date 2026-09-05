"use client"

import { useState, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  HelpCircle,
  Mail,
  MessageCircle,
  Phone,
  ChevronLeft,
  Loader2,
  Send,
  Ticket,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/10 text-blue-500",
  high: "bg-orange/10 text-orange",
  urgent: "bg-red-500/10 text-red-500",
}
const PRIORITY_LABEL: Record<string, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
}
const TICKET_STATUS_LABEL: Record<string, string> = {
  open: "مفتوحة",
  pending: "بانتظار ردك",
  closed: "مغلقة",
}

const FAQS = [
  {
    q: "كيف أربط صفحة فيسبوك؟",
    a: "انتقل إلى صفحة الصفحات وأدخل معرف الصفحة ورمز الوصول من فيسبوك، ثم احفظ البيانات.",
  },
  {
    q: "كيف أعمل رد تلقائي؟",
    a: "من صفحة الردود التلقائية، أضف قاعدة جديدة بكلمة مفتاحية ونص الرد الذي تريده.",
  },
  {
    q: "كيف أشحن رصيدي؟",
    a: "من صفحة الفواتير، استخدم زر شحن الرصيد واتبع التعليمات لإتمام الدفع.",
  },
  {
    q: "ماذا أفعل إذا توقف البوت عن العمل؟",
    a: "تأكد من صلاحية رمز الوصول في صفحة الصفحات، ثم اختبر الاتصال. إذا استمرت المشكلة تواصل مع الدعم.",
  },
  {
    q: "كيف أضيف حساب إعلاني؟",
    a: "اربط حساب فيسبوك الإعلاني من خلال صفحة الإعلانات. تأكد من أن الحساب له صلاحيات كافية.",
  },
]

const FAQ_ITEMS = FAQS.map((f, i) => ({ ...f, id: i }))

interface SupportInfo {
  email?: string
  phone?: string
  whatsapp?: string
  working_hours?: string
}

export default function SupportPage() {
  const queryClient = useQueryClient()
  const [info, setInfo] = useState<SupportInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [form, setForm] = useState({ subject: "", message: "", email: "", priority: "medium" })
  const [formSent, setFormSent] = useState(false)

  // My tickets (plan §4.3 — user sees own tickets + admin replies)
  const ticketsQuery = useQuery({
    queryKey: ["support-tickets"],
    queryFn: async () => {
      const res = await apiFetch("/api/support/tickets")
      if (!res.ok) throw new Error(`فشل تحميل التذاكر (${res.status})`)
      return unwrapApi(res)
    },
    retry: 1,
  })
  const tickets: any[] = ticketsQuery.data?.data || []
  const [openTicketId, setOpenTicketId] = useState<number | null>(null)

  const ticketDetailQuery = useQuery({
    queryKey: ["support-ticket", openTicketId],
    queryFn: async () => {
      const res = await apiFetch(`/api/support/tickets/${openTicketId}`)
      if (!res.ok) throw new Error("فشل تحميل التذكرة")
      return unwrapApi(res)
    },
    enabled: openTicketId !== null,
  })

  const replyMutation = useMutation({
    mutationFn: async ({ id, message }: { id: number; message: string }) => {
      const res = await apiFetch(`/api/support/tickets/${id}/reply`, {
        method: "POST",
        body: JSON.stringify({ message }),
      })
      const d = await res.json()
      if (!res.ok || !d?.success) throw new Error(d?.detail || "فشل إرسال الرد")
      return d
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-ticket", openTicketId] })
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] })
      toast.success("تم إرسال ردك")
    },
    onError: (e: Error) => toast.error(e.message || "فشل إرسال الرد"),
  })
  const [replyText, setReplyText] = useState("")

  useEffect(() => {
    fetch("/api/support/info")
      .then(unwrapApi)
      .then((d) => {
        if (d) setInfo(d)
      })
      .catch(() => {/* non-blocking */})
      .finally(() => setInfoLoading(false))
  }, [])

  const mutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const res = await apiFetch("/api/support/ticket", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      return unwrapApi(res)
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(data?.data?.message || "تم إرسال طلبك بنجاح")
        setFormSent(true)
        setForm({ subject: "", message: "", email: "", priority: "medium" })
        queryClient.invalidateQueries({ queryKey: ["support-tickets"] })
      } else {
        toast.error(data?.error || "فشل إرسال الطلب")
      }
    },
    onError: (e: Error) => {
      toast.error(e.message || "فشل إرسال الطلب")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.message.trim() || form.message.trim().length < 10) {
      toast.error("يرجى إدخال رسالة لا تقل عن 10 أحرف")
      return
    }
    mutation.mutate(form)
  }

  const email = info?.email || "support@smartbot.ly"
  const whatsapp = info?.whatsapp || info?.phone || "0920000000"
  const phone = info?.phone || "—"
  const hours = info?.working_hours || "24/7"

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-6 h-14">
          <div className="size-7 flex items-center justify-center">
            <HelpCircle className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm">الدعم</h1>
            <p className="text-[11px] text-muted-foreground">الدعم الفني والمساعدة</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle>تواصل معنا</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {infoLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-6 w-48 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <a
                  href={`mailto:${email}`}
                  className="flex items-center gap-3 text-sm hover:text-orange-500 transition-colors"
                >
                  <Mail className="size-4 text-muted-foreground shrink-0" />
                  <span>{email}</span>
                </a>
                <a
                  href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm hover:text-green-500 transition-colors"
                >
                  <MessageCircle className="size-4 text-muted-foreground shrink-0" />
                  <span>واتساب: {whatsapp}</span>
                </a>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="size-4 text-muted-foreground shrink-0" />
                  <span>هاتف: {phone}</span>
                </div>
                <p className="text-xs text-muted-foreground">ساعات العمل: {hours}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact form */}
        {!formSent ? (
          <Card>
            <CardHeader>
              <CardTitle>أرسل طلباً</CardTitle>
              <CardDescription>
                اكتب تفاصيل مشكلتك وسنتواصل معك خلال 24 ساعة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="الموضوع (اختياري)"
                  id="subject"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="مشكلة في الردود التلقائية..."
                />
                <Input
                  label="البريد الإلكتروني (اختياري)"
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                  dir="ltr"
                />
                <div className="space-y-1">
                  <label className="text-sm font-semibold leading-none">الأولوية</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {["low", "medium", "high", "urgent"].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, priority: p }))}
                        className={`h-8 rounded-sm border text-xs font-medium transition-all ${
                          form.priority === p
                            ? "border-orange bg-orange/10 text-orange"
                            : "border-border/50 text-muted-foreground hover:border-orange/30"
                        }`}
                      >
                        {PRIORITY_LABEL[p]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="message"
                    className="text-sm font-semibold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    الرسالة *
                  </label>
                  <textarea
                    id="message"
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    placeholder="صف مشكلتك بالتفصيل..."
                    rows={5}
                    className="flex w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  />
                  {form.message && form.message.trim().length < 10 && (
                    <p className="text-[11px] text-destructive">الرسالة يجب أن تكون 10 أحرف على الأقل</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  loading={mutation.isPending}
                  disabled={mutation.isPending || !form.message.trim() || form.message.trim().length < 10}
                >
                  <Send className="size-4" />
                  {mutation.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <div className="mx-auto size-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Send className="size-5 text-green-500" />
              </div>
              <p className="text-sm font-bold text-green-600">تم إرسال طلبك بنجاح!</p>
              <p className="text-xs text-muted-foreground">
                سيتواصل معك فريق الدعم خلال 24 ساعة
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFormSent(false)}
                className="mt-2"
              >
                إرسال طلب آخر
              </Button>
            </CardContent>
          </Card>
        )}

        {/* My tickets (plan §4.3) */}
        <section>
          <h2 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Ticket className="size-4 text-orange" />
            تذاكري
            {tickets.length > 0 && (
              <span className="text-[10px] font-bold bg-orange/10 text-orange rounded-full px-2 py-0.5">
                {tickets.length}
              </span>
            )}
          </h2>

          {ticketsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : ticketsQuery.isError ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                {(ticketsQuery.error as Error)?.message || "تعذر تحميل التذاكر"}
              </CardContent>
            </Card>
          ) : tickets.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                لا توجد تذاكر دعم بعد
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-3 text-right"
                      onClick={() => setOpenTicketId(openTicketId === t.id ? null : t.id)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold truncate">#{t.id} {t.subject}</p>
                          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.medium}`}>
                            {PRIORITY_LABEL[t.priority] || t.priority}
                          </span>
                          <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                            {TICKET_STATUS_LABEL[t.status] || t.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{t.body}</p>
                      </div>
                      <ChevronLeft
                        className={`size-4 text-muted-foreground shrink-0 transition-transform ${openTicketId === t.id ? "-rotate-90" : ""}`}
                      />
                    </button>

                    {/* Thread */}
                    {openTicketId === t.id && (
                      <div className="mt-3 border-t border-border/40 pt-3 space-y-3">
                        {ticketDetailQuery.isLoading ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              {(ticketDetailQuery.data?.data?.replies || []).map((r: any) => (
                                <div
                                  key={r.id}
                                  className={`text-xs rounded-lg p-3 ${
                                    r.is_admin
                                      ? "bg-orange/5 border border-orange/20"
                                      : "bg-muted/50"
                                  }`}
                                >
                                  <p className="font-bold mb-1 text-[10px]">
                                    {r.is_admin ? "فريق الدعم" : "أنت"}
                                  </p>
                                  <p className="text-muted-foreground leading-relaxed">{r.message}</p>
                                </div>
                              ))}
                              {(ticketDetailQuery.data?.data?.replies || []).length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-2">
                                  لا ردود بعد — فريق الدعم سيرد قريباً
                                </p>
                              )}
                            </div>
                            {t.status !== "closed" && (
                              <div className="flex gap-2">
                                <input
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  placeholder="اكتب رداً..."
                                  className="flex-1 h-9 rounded-sm border border-input bg-transparent px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <Button
                                  size="sm"
                                  className="h-9 gap-1.5"
                                  disabled={replyMutation.isPending || replyText.trim().length < 2}
                                  onClick={() => {
                                    replyMutation.mutate({ id: t.id, message: replyText.trim() })
                                    setReplyText("")
                                  }}
                                >
                                  <Send className="size-3" />
                                  رد
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* FAQ */}
        <section>
          <h2 className="font-bold text-sm mb-3">الأسئلة الشائعة</h2>
          <div className="space-y-2">
            {FAQ_ITEMS.map((faq) => (
              <details key={faq.id} className="group">
                <summary className="flex items-center justify-between p-4 rounded-lg bg-card border border-border cursor-pointer list-none hover:bg-muted/50 transition-colors">
                  <span className="text-sm font-medium">{faq.q}</span>
                  <ChevronLeft className="size-4 text-muted-foreground shrink-0 transition-transform group-open:-rotate-90" />
                </summary>
                <div className="px-4 pb-4 pt-2 text-sm text-muted-foreground border-x border-b border-border rounded-b-lg bg-card">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
