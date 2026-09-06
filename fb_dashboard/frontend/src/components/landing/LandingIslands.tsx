"use client"

/* v6 §D — the landing's CLIENT ISLANDS.
 * app/page.tsx is a React SERVER component (the hero + schema markup
 * hydrates nothing); everything that needs the browser lives here:
 *   - HeroTrustBadge   : live trust copy from /api/public/stats
 *   - LazySections     : below-fold sections via next/dynamic (deferred JS)
 *   - LandingTestimonials : real-data-only testimonial section (fetch)
 */

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Star } from "lucide-react"
import { usePublicStats, trustCopy } from "@/lib/usePublicStats"
import { unwrapApi } from "@/lib/api"
import type { Testimonial } from "@/lib/types"

/* Below-fold sections load their JS lazily (SSR HTML intact): the landing
 * hydrated ALL sections up-front (TBT 1.7s on throttled mobile). */
const FeaturesSection = dynamic(() => import("@/components/landing/sections/FeaturesSection"))
const HowItWorksSection = dynamic(() => import("@/components/landing/sections/HowItWorksSection"))
const StatsSection = dynamic(() => import("@/components/landing/sections/StatsSection"))
const FinalCTASection = dynamic(() => import("@/components/landing/sections/FinalCTASection"))
const FaqSection = dynamic(() => import("@/components/landing/sections/FaqSection"))

export function HeroTrustBadge() {
  // Plan §3.1: trust claims must be real (activeTenants) or qualitative — never "500"
  const { stats } = usePublicStats()
  const heroTrust = trustCopy(stats, true)
  return (
    <div className="inline-flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.18em] text-accent-foreground/90 relative overflow-hidden animate-fade-in">
      <span className="size-1 rounded-full bg-primary animate-pulse-dot shrink-0" />
      {heroTrust}
      <span
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(90deg,transparent 0%,oklch(1 0 0 / 0.12) 50%,transparent 100%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 3s ease-in-out infinite",
        }}
      />
    </div>
  )
}

export function LazySections() {
  return (
    <>
      <StatsSection />
      <FeaturesSection />
      <HowItWorksSection />
    </>
  )
}

export function FaqSectionLazy() {
  return <FaqSection />
}

export function FinalCTASectionLazy() {
  return <FinalCTASection />
}

export function LandingTestimonials() {
  const [testimonials, setTestimonials] = useState<Testimonial[] | null>(null)

  useEffect(() => {
    fetch("/api/public/testimonials")
      .then(unwrapApi)
      .then(d => setTestimonials(Array.isArray(d) ? d : (d?.data ?? [])))
      .catch(() => setTestimonials([]))
  }, [])

  if (!testimonials || testimonials.length === 0) return null
  return (
    <section className="relative py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14 animate-fade-in">
          <div className="inline-flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.18em] text-accent-foreground/90 mb-4">
            <Star className="size-3 fill-accent-foreground text-accent-foreground" />
            آراء حقيقية
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tighter text-balance">
            ماذا يقول عملاؤنا
          </h2>
          <p className="text-base max-w-xl mx-auto text-muted-foreground">
            آراء حقيقية من مدراء الصفحات الذين يستخدمون SmartBot يومياً
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {/* REAL data from /api/public/testimonials only — the hardcoded
              entries were removed (the comment above said "never fake" while
              the render ignored the payload entirely). Owner seeds real
              testimonials via the admin surfaces when available. */}
          {testimonials.map((t, i) => (
            <div
              key={t.id ?? i}
              className="group relative rounded-2xl p-6 bg-card border border-border/50 hover:border-accent-foreground/40 transition-all duration-500 hover:-translate-y-1 hover:shadow-xl hover:shadow-accent-foreground/5 animate-fade-in-150"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {t.metric && (
                <div className="absolute top-4 left-4 text-3xs font-bold text-accent-foreground/90 bg-accent-foreground/10 px-2.5 py-1 rounded-full border border-accent-foreground/20">
                  {t.metric}
                </div>
              )}
              <div className="flex gap-1 mb-4 mt-2">
                {[1, 2, 3, 4, 5].map(s => <Star key={s} className="size-4 fill-accent-foreground text-accent-foreground" />)}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6 min-h-[4.5rem]">
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="flex items-center gap-3 pt-4 border-t border-border/40">
                <div className="size-10 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br from-accent-foreground to-accent-foreground/70 text-white shadow-md">{(t.name || "؟").charAt(0)}</div>
                <div>
                  <div className="text-sm font-bold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
