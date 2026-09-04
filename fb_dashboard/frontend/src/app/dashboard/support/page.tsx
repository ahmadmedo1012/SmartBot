"use client"

import { useState, useEffect } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  HelpCircle,
  Mail,
  MessageCircle,
  Phone,
  ChevronLeft,
  Loader2,
  Send,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/csrf-client"

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
  const [info, setInfo] = useState<SupportInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [form, setForm] = useState({ subject: "", message: "", email: "" })
  const [formSent, setFormSent] = useState(false)

  useEffect(() => {
    fetch("/api/support/info")
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) setInfo(d.data)
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
      return res.json()
    },
    onSuccess: (data) => {
      if (data?.success) {
        toast.success(data?.data?.message || "تم إرسال طلبك بنجاح")
        setFormSent(true)
        setForm({ subject: "", message: "", email: "" })
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
