"use client"

import { HelpCircle, Mail, MessageCircle, Phone, ChevronLeft } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const FAQS = [
  { q: "كيف أربط صفحة فيسبوك؟", a: "انتقل إلى صفحة الصفحات وأدخل معرف الصفحة ورمز الوصول من فيسبوك، ثم احفظ البيانات." },
  { q: "كيف أعمل رد تلقائي؟", a: "من صفحة الردود التلقائية، أضف قاعدة جديدة بكلمة مفتاحية ونص الرد الذي تريده." },
  { q: "كيف أشحن رصيدي؟", a: "من صفحة الفواتير، استخدم زر شحن الرصيد واتبع التعليمات لإتمام الدفع." },
  { q: "ماذا أفعل إذا توقف البوت عن العمل؟", a: "تأكد من صلاحية رمز الوصول في صفحة الصفحات، ثم اختبر الاتصال. إذا استمرت المشكلة تواصل مع الدعم." },
  { q: "كيف أضيف حساب إعلاني؟", a: "اربط حساب فيسبوك الإعلاني من خلال صفحة الإعلانات. تأكد من أن الحساب له صلاحيات كافية." },
]

export default function SupportPage() {
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
          <CardContent className="p-5 space-y-4">
            <h2 className="font-bold text-sm">تواصل معنا</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="size-4 text-muted-foreground" />
                <span>support@smartbot.ly</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <MessageCircle className="size-4 text-muted-foreground" />
                <span>واتساب: 0920000000</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Phone className="size-4 text-muted-foreground" />
                <span>هاتف: 0210000000</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <section>
          <h2 className="font-bold text-sm mb-3">الأسئلة الشائعة</h2>
          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <details key={i} className="group">
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
