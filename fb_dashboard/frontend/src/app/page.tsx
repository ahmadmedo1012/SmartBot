/* v6 §D — REACT SERVER COMPONENT (no "use client").
 * Before v6 this file was "use client": the ENTIRE landing hydrated as a
 * client tree (966KB initial JS, TBT ~1.5-1.7s on throttled mobile). The
 * hero is static markup with pure-CSS entrance animations; interactivity
 * lives in small client islands (Header, ScrollParallax, HeroMockup,
 * HeroTrustBadge, LazySections, LandingTestimonials, Footer,
 * FloatingWhatsApp). Result: the server-rendered hero paints at first
 * paint and the hydration bill drops to the islands only.
 */
import Link from "next/link"
import { Star, ArrowLeft, Sparkles } from "lucide-react"

import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp"
import { Button } from "@/components/ui/button"
import { GlowPool } from "@/components/ui/GlowPool"
import { ScrollParallax } from "@/components/ui/scroll-parallax"
import { HeroMockup } from "@/components/landing/HeroMockup"
import { HeroTrustBadge, LazySections, LandingTestimonials } from "@/components/landing/LandingIslands"
import { FaqSectionLazy, FinalCTASectionLazy } from "@/components/landing/LandingIslands"

const SITE_URL = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

// ── Schema.org: Organization + WebSite (plan §8.1) ──
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "SmartBot",
  url: SITE_URL,
  logo: `${SITE_URL}/brand-icon.png`,
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
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className="flex flex-col min-h-screen overflow-x-hidden">
      <Header />

      {/* Hero — scroll-craft treatment (latest_plan §G.4): static server
          markup + pure-CSS entrances (v6 §D). */}
      <section className="relative min-h-[100svh] flex items-center overflow-hidden">
        {/* Background layers — parallax depth */}
        <ScrollParallax rate={-0.3} maxTravel={50} className="absolute inset-0 pointer-events-none">
          <GlowPool position="top-0 left-1/2 -translate-x-1/2" size="size-[70vmin]" color="orange/10" />
          <GlowPool position="bottom-0 right-0" size="size-[40vmin]" color="orange/5" />
        </ScrollParallax>
        <div className="absolute inset-0 z-0 opacity-30 pointer-events-none" style={{ backgroundImage: "linear-gradient(color-mix(in oklch, var(--accent-foreground) 8%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch, var(--accent-foreground) 8%, transparent) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent via-background/30 to-background pointer-events-none" />

        <div className="relative z-10 w-full pt-32 pb-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center">
              {/* ── Left: copy ── */}
              <div className="space-y-7">
                <HeroTrustBadge />

                {/* LCP element: NO entrance animation, NO kinetic split —
                    the text must be in the HTML and paint at first paint.
                    (Pre-v6 KineticText split its text inside useEffect → the
                    h1 shipped EMPTY: an SEO + LCP + no-JS triple defect.) */}
                <h1
                  className="text-4xl sm:text-5xl lg:text-6xl xl:text-[4.25rem] font-extrabold leading-[1.02] tracking-tighter font-heading text-balance"
                >
                  إدارة تفاعل فيسبوك{" "}
                  <span className="relative inline-block text-accent-foreground">
                    بذكاء واحترافية
                    <span className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-accent-foreground/0 via-accent-foreground/60 to-accent-foreground/0 rounded-full animate-fade-in-250" aria-hidden="true" />
                  </span>
                </h1>

                <p
                  className="text-lg md:text-xl leading-relaxed max-w-xl text-muted-foreground text-balance animate-fade-in-150">
                  أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك. المنصة الأولى في ليبيا بذكاء اصطناعي يفهم لهجتك.
                </p>

                <div className="flex flex-wrap gap-3 animate-fade-in-250">
                  <Link href="/subscribe">
                    <Button size="lg" className="text-base h-12 px-7 shadow-lg shadow-accent-foreground/20">
                      ابدأ الآن مجاناً <ArrowLeft className="size-4 rtl:-scale-x-100" />
                    </Button>
                  </Link>
                  <Link href="/demo">
                    <Button variant="outline" size="lg" className="text-base h-12 px-7">
                      <Sparkles className="size-4 ms-1" /> جرب البوت الآن
                    </Button>
                  </Link>
                </div>

                {/* Quick proof bar */}
                <div
                  className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2 animate-fade-in-400">
                  <div className="flex items-center gap-2.5" style={{ direction: "ltr" }}>
                    <div className="flex -space-x-2">
                      {["أ", "س", "م", "ن"].map((l, i) => (
                        <div key={i} className="size-8 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-bold bg-gradient-to-br from-accent-foreground to-accent-foreground/80 text-primary-foreground">{l}</div>
                      ))}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex gap-0.5">{[1,2,3,4,5].map(s => <Star key={s} className="size-3 fill-accent-foreground/80 text-accent-foreground" />)}</div>
                      <span className="text-[10px] text-muted-foreground font-medium">موثوق من مدراء الصفحات</span>
                    </div>
                  </div>
                  <div className="h-8 w-px bg-border/60" aria-hidden="true" />
                  <div className="flex items-center gap-1.5">
                    <div className="size-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs text-muted-foreground font-medium">النظام يعمل الآن</span>
                  </div>
                </div>
              </div>

              {/* ── Right: live product mockup — pure-CSS wipe reveal ──
                  (was ClipPathReveal/framer: wiped in only after hydration) */}
              <div className="relative animate-wipe-up">
                <HeroMockup />
              </div>
            </div>
          </div>
        </div>
      </section>

      <LazySections />
      <LandingTestimonials />
      <FaqSectionLazy />
      <FinalCTASectionLazy />

      <Footer />
      <FloatingWhatsApp />
    </div>
    </>
  )
}
