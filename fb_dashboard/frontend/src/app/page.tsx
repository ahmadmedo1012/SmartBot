"use client"

import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp"
import { Button } from "@/components/ui/button"
import { GlowPool } from "@/components/ui/GlowPool"
import { motion } from "framer-motion"
import { springDefault, springSnappy } from "@/lib/motion"
import { Star, ArrowLeft } from "lucide-react"
import Link from "next/link"
import FeaturesSection from "@/components/landing/sections/FeaturesSection"
import HowItWorksSection from "@/components/landing/sections/HowItWorksSection"
import StatsSection from "@/components/landing/sections/StatsSection"
import FinalCTASection from "@/components/landing/sections/FinalCTASection"
import FaqSection from "@/components/landing/sections/FaqSection"

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "هل أحتاج صلاحيات خاصة لربط الصفحة؟", acceptedAnswer: { "@type": "Answer", text: "تحتاج صلاحية إدارة الصفحة فقط. نطلب أقل الصلاحيات اللازمة للعمل." } },
    { "@type": "Question", name: "هل بياناتي آمنة؟", acceptedAnswer: { "@type": "Answer", text: "جميع البيانات مشفرة. لا نشارك معلومات صفحاتك مع أي جهة خارجية." } },
    { "@type": "Question", name: "كم صفحة يمكنني ربطها؟", acceptedAnswer: { "@type": "Answer", text: "يمكنك ربط صفحة واحدة في الخطة المجانية، وحتى 10 صفحات في الخطة الاحترافية." } },
    { "@type": "Question", name: "هل تدعم اللغة العربية كاملاً؟", acceptedAnswer: { "@type": "Answer", text: "نعم، الواجهة كاملة بالعربية مع دعم كامل للردود والتعليقات العربية." } },
    { "@type": "Question", name: "هل يمكنني تجربة البوت قبل الشراء؟", acceptedAnswer: { "@type": "Answer", text: "نعم! يمكنك تجربة لوحة التحكم التجريبية ببيانات وهمية لترى كل الميزات قبل الاشتراك." } },
  ],
}

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className="flex flex-col min-h-screen overflow-x-hidden">
      <Header />

      {/* Hero */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <GlowPool position="top-0 left-1/2 -translate-x-1/2" size="size-[70vmin]" color="orange/10" />
        <div className="absolute inset-0 z-0 opacity-40 pointer-events-none" style={{ backgroundImage: "linear-gradient(color-mix(in oklch, var(--orange) 8%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch, var(--orange) 8%, transparent) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="relative z-10 w-full pt-32 pb-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-8">
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.05 }}
                  className="eyebrow relative overflow-hidden">
                  <span className="size-1.5 rounded-full bg-orange animate-pulse-dot" />
                  أكثر من ٥٠٠ صفحة تثق فينا
                  <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(90deg,transparent 0%,oklch(1 0 0 / 0.12) 50%,transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 3s ease-in-out infinite" }} />
                </motion.div>
                <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.1 }}
                  className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tighter font-heading">
                  إدارة تفاعل فيسبوك<br />
                  <span className="text-orange">بذكاء واحترافية</span>
                </motion.h1>
                <div className="w-16 h-0.5 rounded-full bg-gradient-to-l from-orange/0 via-orange to-orange/0" />
                <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.2 }}
                  className="text-lg md:text-xl leading-relaxed max-w-lg text-muted-foreground">
                  أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك. المنصة الأولى في ليبيا
                </motion.p>
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.3 }}
                  className="flex flex-wrap gap-4">
                  <Link href="/subscribe">
                    <Button size="lg" className="text-base">ابدأ الآن مجاناً <ArrowLeft className="size-4 rtl:-scale-x-100" /></Button>
                  </Link>
                  <Link href="/demo">
                    <Button variant="outline" size="lg" className="text-base">جرب البوت الآن</Button>
                  </Link>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...springDefault, delay: 0.4 }}
                  className="flex items-center gap-4 pt-2">
                  <div className="flex -space-x-2" style={{ direction: "ltr" }}>
                    {["أ", "س", "م", "ن"].map((l, i) => (
                      <div key={i} className="size-9 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold bg-gradient-to-br from-orange to-orange/80 text-orange-foreground">{l}</div>
                    ))}
                  </div>
                  <div>
                    <div className="flex gap-0.5">{[1,2,3,4,5].map(s => <Star key={s} className="size-3.5 fill-orange/40 text-orange/50" />)}</div>
                    <span className="text-xs text-muted-foreground">موثوق من آلاف المداراء</span>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section divider */}
      <div className="w-px h-16 mx-auto bg-gradient-to-b from-transparent via-orange/20 to-transparent" aria-hidden="true" />

      <StatsSection />

      {/* Section divider */}
      <div className="w-px h-16 mx-auto bg-gradient-to-b from-transparent via-orange/20 to-transparent" aria-hidden="true" />

      <FeaturesSection />

      {/* Section divider */}
      <div className="w-px h-16 mx-auto bg-gradient-to-b from-transparent via-orange/20 to-transparent" aria-hidden="true" />

      <HowItWorksSection />

      {/* Section divider */}
      <div className="w-px h-16 mx-auto bg-gradient-to-b from-transparent via-orange/20 to-transparent" aria-hidden="true" />

      {/* Testimonials — inline for now, idiosyncratic to this page */}
      <section className="relative py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <motion.h2 initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ ...springDefault, delay: 0.16 }}
              className="text-3xl md:text-4xl font-extrabold mb-4 tracking-tighter">
              ماذا يقول عملاؤنا
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ ...springSnappy, delay: 0.24 }}
              className="text-base max-w-2xl mx-auto text-muted-foreground">
              آراء حقيقية من مدراء الصفحات الذين يستخدمون SmartBot
            </motion.p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[{ name: "أحمد السالمي", role: "صاحب صفحة - طرابلس", text: "منذ استخدام SmartBot زاد تفاعل صفحتنا بشكل ملحوظ. الردود التلقائية وفرت علينا وقتاً كبيراً." },
              { name: "سارة النفاتي", role: "مديرة تسويق - بنغازي", text: "أفضل أداة لإدارة صفحات فيسبوك في ليبيا. التحليلات والتقارير دقيقة جداً." },
              { name: "محمد الكيلاني", role: "صاحب متجر إلكتروني - مصراتة", text: "البث الجماعي والردود الذكية غيروا طريقة تعاملنا مع العملاء. أنصح الجميع بتجربته." },
            ].map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ ...springDefault, delay: i * 0.1 }}
                className="rounded-sm p-6 bg-card border border-border/50">
                <div className="flex gap-1 mb-4">{[1,2,3,4,5].map(s => <Star key={s} className="size-4 fill-orange text-orange" />)}</div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br from-orange to-orange/70 text-orange-foreground">{t.name.charAt(0)}</div>
                  <div>
                    <div className="text-sm font-bold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Section divider */}
      <div className="w-px h-16 mx-auto bg-gradient-to-b from-transparent via-orange/20 to-transparent" aria-hidden="true" />

      <FaqSection />

      <FinalCTASection />

      <Footer />
      <FloatingWhatsApp />
    </div>
    </>
  )
}
