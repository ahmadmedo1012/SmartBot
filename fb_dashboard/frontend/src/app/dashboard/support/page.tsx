"use client"

import { useState, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { brandedToast } from "@/lib/premium-toast"
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
import { EmptyState } from "@/components/ui/EmptyState"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import type { SupportTicket } from "@/lib/types"

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info-soft text-info",
  high: "bg-accent-foreground/10 text-accent-foreground",
  urgent: "bg-destructive-soft text-destructive",
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
    q: "كيف أنشئ ردًّا تلقائيًا؟",
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
      // v10-D2: backend wraps the list as {items, total} inside the envelope
      const payload = await unwrapApi<{ items: SupportTicket[]; total: number }>(res)
      return payload.items
    },
    retry: 1,
  })
  // v4 §2.2 — unwrapApi already returned the payload; extra .data hid the ticket list
  const tickets: SupportTicket[] = ticketsQuery.data || []
  const [openTicketId, setOpenTicketId] = useState<number | null>(null)

  const ticketDetailQuery = useQuery({
    queryKey: ["support-ticket", openTicketId],
    queryFn: async () => {
      const res = await apiFetch(`/api/support/tickets/${openTicketId}`)
      if (!res.ok) throw new Error("فشل تحميل التذكرة")
      return unwrapApi<SupportTicket>(res)
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
      // v9-B5 — clear the reply box only after success; clearing it right
      // after mutate() destroyed the user's text whenever the request failed.
      setReplyText("")
      brandedToast.success("تم إرسال ردك")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل إرسال الرد"),
  })
  const [replyText, setReplyText] = useState("")

  useEffect(() => {
    apiFetch("/api/support/info")
      .then(unwrapApi<SupportInfo>)
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
      return unwrapApi<{ message?: string }>(res)
    },
    onSuccess: (data) => {
      // v4 §2.2 — unwrapApi returns the payload or THROWS on success:false;
      // reaching here means success. The old data?.success check always failed
      // → users saw "فشل إرسال الطلب" after a successful send and resubmitted.
      brandedToast.success(data?.message || "تم إرسال طلبك بنجاح")
      setFormSent(true)
      setForm({ subject: "", message: "", email: "", priority: "medium" })
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] })
    },
    onError: (e: Error) => {
      brandedToast.error(e.message || "فشل إرسال الطلب")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.message.trim() || form.message.trim().length < 10) {
      brandedToast.error("يرجى إدخال رسالة لا تقل عن 10 أحرف")
      return
    }
    mutation.mutate(form)
  }

  // Config-driven contact info with SANE fallbacks (the old fallback produced
  // wa.me/0920000000 — invalid, no country code — and an email on a domain we
  // don't control; real values come from /admin/settings via /api/support/info).
  const email = info?.email || "support@smart-link.ly"
  const whatsappRaw = info?.whatsapp || info?.phone || "218910089975"
  // normalize local 09XXXXXXXX → international 218XXXXXXXXX for wa.me
  const whatsapp = whatsappRaw.replace(/\D/g, "").replace(/^0(9\d{8})$/, "218$1")
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
            <p className="text-2xs text-muted-foreground">الدعم الفني والمساعدة</p>
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
                  className="flex items-center gap-3 text-sm hover:text-accent-foreground transition-colors"
                >
                  <Mail className="size-4 text-muted-foreground shrink-0" />
                  <span>{email}</span>
                </a>
                <a
                  href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`واتساب: ${whatsapp} — يفتح في تبويب جديد`}
                  className="flex items-center gap-3 text-sm hover:text-success transition-colors"
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
                <Input dir="auto"
                  label="الموضوع (اختياري)"
                  id="subject"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="مشكلة في الردود التلقائية..."
                />
                <Input dir="auto"
                  label="البريد الإلكتروني (اختياري)"
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                />
                <div className="space-y-1">
                  <label className="text-sm font-semibold leading-none">الأولوية</label>
                  <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="مستوى الأولوية">
                    {["low", "medium", "high", "urgent"].map((p) => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={form.priority === p}
                        onClick={() => setForm((f) => ({ ...f, priority: p }))}
                        className={`h-8 rounded-sm border text-xs font-medium transition-all ${
                          form.priority === p
                            ? "border-accent-foreground bg-accent-foreground/10 text-accent-foreground"
                            : "border-border/50 text-muted-foreground hover:border-accent-foreground/30"
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
                    aria-describedby={form.message && form.message.trim().length < 10 ? "message-error" : undefined}
                    aria-invalid={form.message && form.message.trim().length < 10 ? true : undefined}
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    placeholder="صف مشكلتك بالتفصيل..."
                    rows={5}
                    className="flex w-full rounded-sm border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  />
                  {form.message && form.message.trim().length < 10 && (
                    <p id="message-error" role="alert" aria-live="polite" className="text-xs text-destructive">الرسالة يجب أن تكون 10 أحرف على الأقل</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  loading={mutation.isPending}
                  disabled={mutation.isPending || !form.message.trim() || form.message.trim().length < 10}
                >
                  <Send className="size-4 rtl:-scale-x-100" />
                  {mutation.isPending ? "جارٍ الإرسال..." : "إرسال الطلب"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <div className="mx-auto size-12 rounded-full bg-success-soft flex items-center justify-center">
                <Send className="size-5 text-success rtl:-scale-x-100" />
              </div>
              <p role="status" className="text-sm font-bold text-success">تم إرسال طلبك بنجاح!</p>
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
            <Ticket className="size-4 text-accent-foreground" />
            تذاكري
            {tickets.length > 0 && (
              <span className="text-3xs font-bold bg-accent-foreground/10 text-accent-foreground rounded-full px-2 py-0.5">
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
              <CardContent className="p-0">
                <EmptyState icon={Ticket} size="sm" title="لا توجد تذاكر دعم بعد" description="أرسل طلبك من النموذج أعلاه وستظهر تذاكرك هنا مع ردود فريق الدعم." />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-3 text-start"
                      onClick={() => setOpenTicketId(openTicketId === t.id ? null : t.id)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold truncate">#{t.id} {t.subject}</p>
                          <span className={`text-3xs font-bold rounded-full px-2 py-0.5 ${PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.medium}`}>
                            {PRIORITY_LABEL[t.priority] || t.priority}
                          </span>
                          <span className="text-3xs font-bold rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                            {TICKET_STATUS_LABEL[t.status] || t.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{t.body}</p>
                      </div>
                      {/* v7 §2.2 EXCEPTION (documented, not replaced): disclosure
                          chevron — an expand/collapse indicator that ROTATES -90°
                          when open, not a reading-direction semantic. ChevronLeft
                          (pointing at the trailing edge) is the correct RTL glyph;
                          flipping it would invert the expand gesture. */}
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
                        ) : ticketDetailQuery.isError ? (
                          /* v9-B11 — a failed thread load used to render an empty
                              replies list (looked like "no replies yet") */
                          <div className="text-center py-3 space-y-2">
                            <p className="text-xs text-muted-foreground">{(ticketDetailQuery.error as Error)?.message || "تعذر تحميل التذكرة"}</p>
                            <Button size="sm" variant="outline" onClick={() => ticketDetailQuery.refetch()}>إعادة المحاولة</Button>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              {(ticketDetailQuery.data?.replies || []).map((r) => (
                                <div
                                  key={r.id}
                                  className={`text-xs rounded-lg p-3 ${
                                    r.is_admin
                                      ? "bg-accent-foreground/5 border border-accent-foreground/20"
                                      : "bg-muted/50"
                                  }`}
                                >
                                  <p className="font-bold mb-1 text-3xs">
                                    {r.is_admin ? "فريق الدعم" : "أنت"}
                                  </p>
                                  <p className="text-muted-foreground leading-relaxed">{r.message}</p>
                                </div>
                              ))}
                              {(ticketDetailQuery.data?.replies || []).length === 0 && (
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
                                  aria-label="نص الرسالة"
                                  className="flex-1 h-9 rounded-sm border border-input bg-transparent px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <Button
                                  size="sm"
                                  className="h-9 gap-1.5"
                                  disabled={replyMutation.isPending || replyText.trim().length < 2}
                                  onClick={() => {
                                    replyMutation.mutate({ id: t.id, message: replyText.trim() })
                                  }}
                                >
                                  <Send className="size-3 rtl:-scale-x-100" />
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
                  {/* v7 §2.2 EXCEPTION (documented, not replaced): FAQ disclosure
                      chevron — expand/collapse indicator (rotates on open),
                      NOT reading-direction semantics. ChevronLeft is correct in RTL. */}
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
