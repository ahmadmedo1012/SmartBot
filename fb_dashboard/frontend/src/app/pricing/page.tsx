"use client"

import { useState, useEffect } from "react"
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
import { apiFetch } from "@/lib/csrf-client"
import { Sparkles, Check, Crown, Star, Shield, Zap, BarChart3, MessageCircle, Users } from "lucide-react"

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

  useEffect(() => {
    apiFetch("/api/plans").then(r => r.json()).then(d => setPlans(Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []))).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <header className="border-b border-border/40 backdrop-blur-md bg-background/60 sticky top-0 z-30">
        <SectionContainer><div className="flex items-center justify-between h-14">
          <a href="/" className="flex items-center gap-2">
            <div className="size-7 rounded-md bg-orange flex items-center justify-center text-white font-bold text-xs shadow-md shadow-orange/20">S</div>
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
          className="eyebrow mb-6 inline-flex"
        >
          <Sparkles className="size-3 text-orange" />
          خطط الأسعار
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springDefault, delay: 0.1 }}
          className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tighter mb-5 text-balance"
        >
          خطط تناسب <span className="text-orange">كل الأحجام</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springDefault, delay: 0.2 }}
          className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto text-balance"
        >
          ابدأ مجاناً، ارتقِ عندما تنمو صفحتك. بدون رسوم خفية، إلغاء في أي وقت.
        </motion.p>

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
              <item.icon className="size-3.5 text-orange" />
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
              !annual ? "bg-orange text-orange-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            شهري
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-5 py-1.5 text-sm font-medium rounded-full transition-all flex items-center gap-2 ${
              annual ? "bg-orange text-orange-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            سنوي
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              annual ? "bg-orange-foreground/20 text-orange-foreground" : "bg-orange/15 text-orange"
            }`}>
              وفّر 20%
            </span>
          </button>
        </motion.div>
      </SectionContainer>

      <SectionContainer className="pb-24">
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
          {plans.map((plan, i) => {
            const Icon = PLAN_ICONS[i] || Sparkles
            const isPopular = i === 1
            return (
              <motion.div
                key={plan.id}
                variants={fadeUp}
                custom={i}
                whileHover={{ y: -6, transition: springSnappy }}
                className={cn("relative", isPopular && "lg:-mt-4")}
              >
                <Card className={cn(
                  "relative h-full flex flex-col overflow-hidden transition-all duration-500",
                  isPopular
                    ? "border-orange/50 shadow-2xl shadow-orange/20 bg-gradient-to-b from-orange/[0.04] via-card to-card"
                    : "border-border/50 hover:border-orange/30"
                )}>
                  {isPopular && (
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 z-10">
                      <div className="bg-gradient-to-r from-orange to-orange/80 text-white text-[10px] font-bold px-4 py-1.5 rounded-b-xl flex items-center gap-1 shadow-lg">
                        <Crown className="size-3 fill-white" />
                        الأكثر شعبية
                      </div>
                    </div>
                  )}

                  {/* Decorative corner gradient for popular */}
                  {isPopular && (
                    <div className="absolute -top-20 -end-20 size-48 rounded-full bg-orange/10 blur-3xl pointer-events-none" aria-hidden="true" />
                  )}

                  <CardHeader className="text-center relative pt-8">
                    <div className={cn(
                      "mx-auto size-12 rounded-xl flex items-center justify-center mb-3",
                      isPopular ? "bg-orange/20" : "bg-orange/10"
                    )}>
                      <Icon className="size-6 text-orange" />
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
                            <span className="text-5xl font-extrabold tracking-tighter text-orange">
                              {annual ? Math.round(plan.price * 12 * 0.8 * 100) / 100 : plan.price}
                            </span>
                            <span className="text-base text-muted-foreground font-medium">د.ل</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {plan.price === 0 ? "للأبد، بدون حدود زمنية" : annual ? "شهرياً، تُدفع سنوياً" : "شهرياً"}
                      </div>
                      {annual && plan.price > 0 && (
                        <div className="text-[11px] text-success mt-0.5">
                          يوفر {Math.round(plan.price * 12 * 0.2)} د.ل سنوياً
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-2.5 mb-6 flex-1 text-right">
                      {plan.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-sm">
                          <div className="size-5 rounded-full bg-orange/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Check className="size-3 text-orange" strokeWidth={3} />
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
                        isPopular && "shadow-lg shadow-orange/30"
                      )}
                      onClick={() => router.push(plan.price === 0 ? "/subscribe" : `/subscribe?plan=${plan.id}`)}
                    >
                      {plan.price === 0 ? "ابدأ مجاناً" : "اشترك الآن"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>

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
