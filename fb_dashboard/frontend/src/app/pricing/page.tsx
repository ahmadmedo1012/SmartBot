"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { GlowPool } from "@/components/ui/GlowPool"
import { cn } from "@/lib/utils"
import { fadeUp, stagger, springSnappy, springDefault } from "@/lib/motion"
import { KineticText } from "@/components/ui/kinetic-text"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import { apiFetch } from "@/lib/csrf-client"
import { Sparkles, Check, Crown, Star, Shield, Zap, BarChart3, MessageCircle, Users } from "lucide-react"
import { unwrapApi } from "@/lib/api"

interface Plan {
  id: string; name: string; name_ar: string; price: number
  max_replies: number; max_pages: number; max_rules: number | string
  features: string[]
}

const PLAN_ICONS = [Sparkles, Star, Crown, Crown]

export default function PricingPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [annual, setAnnual] = useState(false)
  const [loadState, setLoadState] = useState<"loading" | "error" | "ok">("loading")

  const loadPlans = useCallback(() => {
    setLoadState("loading")
    apiFetch("/api/plans")
      .then(unwrapApi)
      .then(d => {
        setPlans(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []))
        setLoadState("ok")
      })
      .catch(() => setLoadState("error"))
  }, [])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <header className="border-b border-border/40 backdrop-blur-md bg-background/60 sticky top-0 z-30">
        <SectionContainer><div className="flex items-center justify-between h-14">
          <a href="/" className="flex items-center gap-2">
            <Image src="/brand-icon.png" alt="SmartBot" width={56} height={56} className="size-7 rounded-md" priority />
            <span className="font-bold text-sm">SmartBot</span>
          </a>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/")}>الرئيسية</Button>
            <Button variant="ghost" size="sm" onClick={() => router.push("/demo")}>تجربة حية</Button>
            <Button size="sm" onClick={() => router.push("/subscribe")}>اشتراك</Button>
          </div>
        </div></SectionContainer>
      </header>

      <SectionContainer className="py-20 text-center relative">
        <GlowPool position="top-0 left-1/2 -translate-x-1/2" size="size-[50vmin]" color="orange/8" />

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springDefault, delay: 0.05 }}
          className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-accent-foreground/90 mb-6"
        >
          <Sparkles className="size-3 text-accent-foreground" />
          خطط الأسعار
        </motion.div>

        <motion.h1
          className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tighter mb-5 text-balance"
        >
          <KineticText mode="words" duration={800} delay={100}>خطط تناسب كل الأحجام</KineticText>
        </motion.h1>

        <ScrollReveal y={18} delay={200}
          className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto text-balance"
        >
          ابدأ مجاناً، ارتقِ عندما تنمو صفحتك. بدون رسوم خفية، إلغاء في أي وقت.
        </ScrollReveal>

        {/* Trust row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springDefault, delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 text-xs text-muted-foreground"
        >
          {[
            { icon: Shield, text: "بدون بطاقة ائتمان" },
            { icon: Zap, text: "إعداد في ٥ دقائق" },
            { icon: MessageCircle, text: "دعم ٢٤/٧" },
            { icon: Users, text: "مجاني للأبد" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <item.icon className="size-3.5 text-accent-foreground" />
              <span>{item.text}</span>
            </div>
          ))}
        </motion.div>

        {/* Billing toggle */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mt-10 inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1 backdrop-blur"
        >
          <button
            onClick={() => setAnnual(false)}
            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all ${
              !annual ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            شهري
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all flex items-center gap-2 ${
              annual ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            سنوي
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              annual ? "bg-primary-foreground/20 text-primary-foreground" : "bg-accent-foreground/15 text-accent-foreground"
            }`}>
              وفّر شهرين
            </span>
          </button>
        </motion.div>
      </SectionContainer>

      <SectionContainer className="pb-24">
        {/* Plan cards — scroll-triggered stagger (scroll-craft §G.4) */}
        {loadState === "loading" && (
          <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto" role="status" aria-label="جارٍ تحميل الخطط">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-96 rounded-2xl border border-border/40 bg-card/60 animate-pulse" />
            ))}
          </div>
        )}
        {loadState === "error" && (
          <div className="max-w-md mx-auto text-center py-16" role="alert">
            <div className="size-14 rounded-2xl bg-accent-foreground/10 flex items-center justify-center mx-auto mb-4">
              <Zap className="size-6 text-accent-foreground" />
            </div>
            <p className="font-bold mb-1">تعذر تحميل الخطط</p>
            <p className="text-sm text-muted-foreground mb-5">تحقق من اتصالك بالإنترنت ثم أعد المحاولة</p>
            <Button variant="outline" onClick={loadPlans}>إعادة المحاولة</Button>
          </div>
        )}
        {loadState === "ok" && plans.length === 0 && (
          <div className="max-w-md mx-auto text-center py-16">
            <div className="size-14 rounded-2xl bg-accent-foreground/10 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="size-6 text-accent-foreground" />
            </div>
            <p className="font-bold mb-1">لا توجد خطط منشورة حالياً</p>
            <p className="text-sm text-muted-foreground">تواصل مع الدعم لترتيب باقة تناسبك</p>
          </div>
        )}
        <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
          {plans.map((plan, i) => {
            const Icon = PLAN_ICONS[i] || Sparkles
            const isPopular = i === 1
            return (
              <ScrollReveal
                key={plan.id}
                y={28}
                delay={i * 120}
                duration={0.7}
                className={cn("relative", isPopular && "lg:-mt-4")}
              >
                <motion.div
                  whileHover={{ y: -6, transition: springSnappy }}
                  className="h-full"
                >
                <Card className={cn(
                  "relative h-full flex flex-col overflow-hidden transition-all duration-500",
                  isPopular
                    ? "border-accent-foreground/50 shadow-2xl shadow-accent-foreground/20 bg-gradient-to-b from-accent-foreground/[0.04] via-card to-card"
                    : "border-border/50 hover:border-accent-foreground/30"
                )}>
                  {isPopular && (
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 z-10">
                      <div className="bg-gradient-to-r from-accent-foreground to-accent-foreground/80 text-white text-[10px] font-bold px-4 py-1.5 rounded-b-xl flex items-center gap-1 shadow-lg">
                        <Crown className="size-3 fill-white" />
                        الأكثر شعبية
                      </div>
                    </div>
                  )}

                  {/* Decorative corner gradient for popular */}
                  {isPopular && (
                    <div className="absolute -top-20 -end-20 size-48 rounded-full bg-accent-foreground/10 blur-3xl pointer-events-none" aria-hidden="true" />
                  )}

                  <CardHeader className="text-center relative pt-8">
                    <div className={cn(
                      "mx-auto size-12 rounded-xl flex items-center justify-center mb-3",
                      isPopular ? "bg-accent-foreground/20" : "bg-accent-foreground/10"
                    )}>
                      <Icon className="size-6 text-accent-foreground" />
                    </div>
                    <CardTitle className="text-lg">{plan.name_ar || plan.name}</CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">{getDescription(plan.id)}</CardDescription>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col px-6 pb-6">
                    {/* Price */}
                    <div className="text-center mb-6 py-4 border-y border-border/40">
                      <div className="flex items-baseline justify-center gap-1.5">
                        {plan.price === 0 ? (
                          <span className="text-4xl font-extrabold">مجاني</span>
                        ) : (
                          <>
                            <span className="text-5xl font-extrabold tracking-tighter text-accent-foreground">
                              {/* Smart-Menu parity: yearly billing = 10× monthly (two months free) */}
                              {annual ? Math.round(plan.price * 10 * 100) / 100 : plan.price}
                            </span>
                            <span className="text-base text-muted-foreground font-medium">د.ل</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {plan.price === 0 ? "للأبد، بدون حدود زمنية" : annual ? "سنوياً" : "شهرياً"}
                      </div>
                      {annual && plan.price > 0 && (
                        <div className="text-[11px] text-accent-foreground mt-0.5">
                          وفر شهرين عند الاشتراك السنوي
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-2.5 mb-6 flex-1 text-right">
                      {plan.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-sm">
                          <div className="size-5 rounded-full bg-accent-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Check className="size-3 text-accent-foreground" strokeWidth={3} />
                          </div>
                          <span className="leading-relaxed">{f}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      size="lg"
                      variant={isPopular ? "orange" : "outline"}
                      className={cn(
                        "w-full h-12 font-bold",
                        isPopular && "shadow-lg shadow-accent-foreground/30"
                      )}
                      onClick={() => router.push(plan.price === 0 ? "/subscribe" : `/subscribe?plan=${plan.id}`)}
                    >
                      {plan.price === 0 ? "ابدأ مجاناً" : "اشترك الآن"}
                    </Button>
                  </CardContent>
                </Card>
                </motion.div>
              </ScrollReveal>
            )
          })}
        </div>

        {/* FAQ-style microcopy */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center mt-12 text-xs text-muted-foreground"
        >
          <p>جميع الخطط تشمل: تشفير SSL، دعم بريد إلكتروني، تحديثات مجانية مدى الحياة.</p>
        </motion.div>
      </SectionContainer>
    </div>
  )
}

function getDescription(planId: string): string {
  if (planId === "free") return "للتجربة والصفحات الصغيرة"
  if (planId === "basic") return "للنشاطات التجارية المتوسطة"
  return "للشركات والوكالات الكبيرة"
}
