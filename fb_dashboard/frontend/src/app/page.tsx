"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp"
import { Button } from "@/components/ui/button"
import { GlowPool } from "@/components/ui/GlowPool"
import { motion } from "framer-motion"
import { springDefault, springSnappy } from "@/lib/motion"
import { Star, ArrowLeft, Sparkles, MessageCircle, Users, BarChart3, Calendar } from "lucide-react"
import Link from "next/link"
import FeaturesSection from "@/components/landing/sections/FeaturesSection"
import HowItWorksSection from "@/components/landing/sections/HowItWorksSection"
import StatsSection from "@/components/landing/sections/StatsSection"
import FinalCTASection from "@/components/landing/sections/FinalCTASection"
import FaqSection from "@/components/landing/sections/FaqSection"
import { HeroMockup } from "@/components/landing/HeroMockup"
import { usePublicStats, trustCopy } from "@/lib/usePublicStats"
import { unwrapApi } from "@/lib/api"

const SITE_URL = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

// ── Schema.org: Organization + WebSite (plan §8.1) ──
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "SmartBot",
  url: SITE_URL,
  logo: `${SITE_URL}/static/brand-icon.png`,
  description: "منصة إدارة صفحات فيسبوك الذكية — أتمتة الردود والتحليلات لصفحات فيسبوك في ليبيا",
  areaServed: { "@type": "Country", name: "Libya" },
  knowsLanguage: ["ar", "en"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    availableLanguage: ["Arabic", "English"],
    hoursAvailable: "Mo-Su 00:00-24:00",
  },
}

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SmartBot",
  url: SITE_URL,
  inLanguage: "ar-LY",
  publisher: { "@type": "Organization", name: "SmartBot" },
}

// ── Schema.org: SoftwareApplication + AggregateOffer (plan §8.1 Product) ──
// Prices mirror the DB seed (runner.py _seed_subscription_plans): 0/19/29/129/299 LYD/month
const productSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SmartBot",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "ar",
  url: SITE_URL,
  description: "منصة أتمتة الردود والتحليلات لصفحات فيسبوك — الردود التلقائية، الرسائل الجماعية، التقارير، وحملات تسويقية متقدمة",
  featureList: [
    "ردود تلقائية ذكية على التعليقات",
    "ردود خاصة (DM) تلقائية",
    "بث جماعي للرسائل",
    "جدولة المنشورات",
    "تحليلات وتقارير PDF",
    "حملات تسويقية بالمستهدفين",
  ],
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "LYD",
    lowPrice: "0",
    highPrice: "299",
    offerCount: 5,
    offers: [
      { "@type": "Offer", name: "مجاني", price: "0", priceCurrency: "LYD", description: "100 رد/شهر، صفحة واحدة" },
      { "@type": "Offer", name: "أساسي", price: "19", priceCurrency: "LYD", description: "2,000 رد/شهر + ذكاء اصطناعي" },
      { "@type": "Offer", name: "مميز", price: "29", priceCurrency: "LYD", description: "10,000 رد/شهر + بث وجدولة" },
      { "@type": "Offer", name: "احترافي", price: "129", priceCurrency: "LYD", description: "50,000 رد/شهر + حملات تسلسلية" },
      { "@type": "Offer", name: "مؤسسي", price: "299", priceCurrency: "LYD", description: "غير محدود + دعم 24/7" },
    ],
  },
}

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
  const [testimonials, setTestimonials] = useState<any[] | null>(null)
  // Plan §3.1: trust claims must be real (activeTenants) or qualitative — never "500"
  const { stats } = usePublicStats()
  const heroTrust = trustCopy(stats, true)

  useEffect(() => {
    fetch("/api/public/testimonials")
      .then(unwrapApi)
      .then(d => setTestimonials(Array.isArray(d) ? d : (d?.data ?? [])))
      .catch(() => setTestimonials([]))
  }, [])

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className="flex flex-col min-h-screen overflow-x-hidden">
      <Header />

      {/* Hero */}
      <section className="relative min-h-[100svh] flex items-center overflow-hidden">
        {/* Background layers */}
        <GlowPool position="top-0 left-1/2 -translate-x-1/2" size="size-[70vmin]" color="orange/10" />
        <GlowPool position="bottom-0 right-0" size="size-[40vmin]" color="orange/5" />
        <div className="absolute inset-0 z-0 opacity-30 pointer-events-none" style={{ backgroundImage: "linear-gradient(color-mix(in oklch, var(--orange) 8%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch, var(--orange) 8%, transparent) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent via-background/30 to-background pointer-events-none" />

        <div className="relative z-10 w-full pt-32 pb-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center">
              {/* ── Left: copy ── */}
              <div className="space-y-7">
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.05 }}
                  className="eyebrow relative overflow-hidden">
                  <span className="size-1.5 rounded-full bg-orange animate-pulse-dot" />
                  {heroTrust}
                  <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(90deg,transparent 0%,oklch(1 0 0 / 0.12) 50%,transparent 100%)", backgroundSize: "200% 100%", animation: "shimmer 3s ease-in-out infinite" }} />
                </motion.div>

                <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.1 }}
                  className="text-4xl sm:text-5xl lg:text-6xl xl:text-[4.25rem] font-extrabold leading-[1.02] tracking-tighter font-heading text-balance">
                  إدارة تفاعل فيسبوك<br />
                  <span className="relative inline-block text-orange">
                    بذكاء واحترافية
                    <span className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-orange/0 via-orange/60 to-orange/0 rounded-full" aria-hidden="true" />
                  </span>
                </motion.h1>

                <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.2 }}
                  className="text-lg md:text-xl leading-relaxed max-w-xl text-muted-foreground text-balance">
                  أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك. المنصة الأولى في ليبيا بذكاء اصطناعي يفهم لهجتك.
                </motion.p>

                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.3 }}
                  className="flex flex-wrap gap-3">
                  <Link href="/subscribe">
                    <Button size="lg" className="text-base h-12 px-7 shadow-lg shadow-orange/20">
                      ابدأ الآن مجاناً <ArrowLeft className="size-4 rtl:-scale-x-100" />
                    </Button>
                  </Link>
                  <Link href="/demo">
                    <Button variant="outline" size="lg" className="text-base h-12 px-7">
                      <Sparkles className="size-4 ml-1" /> جرب البوت الآن
                    </Button>
                  </Link>
                </motion.div>

                {/* Quick proof bar */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.5 }}
                  className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2">
                  <div className="flex items-center gap-2.5" style={{ direction: "ltr" }}>
                    <div className="flex -space-x-2">
                      {["أ", "س", "م", "ن"].map((l, i) => (
                        <div key={i} className="size-8 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-bold bg-gradient-to-br from-orange to-orange/80 text-orange-foreground">{l}</div>
                      ))}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex gap-0.5">{[1,2,3,4,5].map(s => <Star key={s} className="size-3 fill-orange/80 text-orange" />)}</div>
                      <span className="text-[10px] text-muted-foreground font-medium">موثوق من مدراء الصفحات</span>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-border/60" aria-hidden="true" />
                  <div className="flex items-center gap-1.5">
                    <div className="size-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs text-muted-foreground font-medium">النظام يعمل الآن</span>
                  </div>
                </motion.div>
              </div>

              {/* ── Right: live product mockup ── */}
              <div className="relative lg:pl-4">
                <HeroMockup />
              </div>
            </div>
          </div>
        </div>
      </section>

      <StatsSection />
      <FeaturesSection />
      <HowItWorksSection />

      {/* Testimonials — only render if real data exists (never fake) */}
      {testimonials && testimonials.length > 0 && (
      <section className="relative py-24">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ ...springDefault, delay: 0.05 }}
            className="text-center mb-14">
            <div className="eyebrow mb-4 inline-flex">
              <Star className="size-3 fill-orange text-orange" />
              آراء حقيقية
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tighter text-balance">
              ماذا يقول عملاؤنا
            </h2>
            <p className="text-base max-w-xl mx-auto text-muted-foreground">
              آراء حقيقية من مدراء الصفحات الذين يستخدمون SmartBot يومياً
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              { name: "أحمد السالمي", role: "صاحب صفحة - طرابلس", text: "منذ استخدام SmartBot زاد تفاعل صفحتنا بشكل ملحوظ. الردود التلقائية وفرت علينا وقتاً كبيراً.", metric: "+٤٢٠٪ تفاعل", color: "from-orange to-orange/70" },
              { name: "سارة النفاتي", role: "مديرة تسويق - بنغازي", text: "أفضل أداة لإدارة صفحات فيسبوك في ليبيا. التحليلات والتقارير دقيقة جداً.", metric: "٢٤/٧ ردود", color: "from-orange/90 to-orange/60" },
              { name: "محمد الكيلاني", role: "صاحب متجر إلكتروني - مصراتة", text: "البث الجماعي والردود الذكية غيروا طريقة تعاملنا مع العملاء. أنصح الجميع بتجربته.", metric: "١٠ صفحات", color: "from-orange/80 to-orange/50" },
            ].map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ ...springDefault, delay: i * 0.1 }}
                className="group relative rounded-2xl p-6 bg-card border border-border/50 hover:border-orange/40 transition-all duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-orange/5">
                {/* Metric badge */}
                <div className="absolute top-4 left-4 text-[10px] font-bold text-orange/90 bg-orange/10 px-2.5 py-1 rounded-full border border-orange/20">
                  {t.metric}
                </div>
                <div className="flex gap-1 mb-4 mt-2">
                  {[1,2,3,4,5].map(s => <Star key={s} className="size-4 fill-orange text-orange" />)}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6 min-h-[4.5rem]">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className="flex items-center gap-3 pt-4 border-t border-border/40">
                  <div className={`size-10 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br ${t.color} text-white shadow-md`}>{t.name.charAt(0)}</div>
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
      )}

      <FaqSection />
      <FinalCTASection />

      <Footer />
      <FloatingWhatsApp />
    </div>
    </>
  )
}
