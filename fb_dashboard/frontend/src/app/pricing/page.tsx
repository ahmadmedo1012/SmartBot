"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { GlowPool } from "@/components/ui/GlowPool"
import { cn } from "@/lib/utils"
import { KineticText } from "@/components/ui/kinetic-text"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import { apiFetch } from "@/lib/csrf-client"
import { Sparkles, Check, Crown, Star, Shield, Zap, BarChart3, MessageCircle, Users } from "lucide-react"
import { unwrapApi } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { toComparisonPlan, type ComparisonPlanInput } from "@/components/subscribe/plan-comparison"
/* v18-1-c: الخطط تُرسم فوراً من الثوابت المدمجة (مرآة بذرة الخادم) ثم
   hydrate من GET /api/plans بتبديل صامت — لا skeleton بانتظار دالة باردة */
import { DEFAULT_PLANS, plansEqual } from "@/lib/default-plans"
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp"

/* v6+ — framer-free: entrance animations use ScrollReveal (CSS tween) and
 * animate-* utility classes; hover lifts use CSS shadow. The h1 KineticText
 * is now SSR-split (text ships in HTML — the old version rendered an empty
 * h1, verified live on /pricing). */

interface Plan {
  id: number; name: string; name_ar: string; price: number
  max_replies: number; max_pages: number; max_rules: number | string
  features: string[]
}

/* v18-1-c: العرض الابتدائي — الخطط الافتراضية بنفس عقد السلك، فتُرسم
   البطاقات من أول إطار ويتحدّث المحتوى بصمت عند وصول الـAPI */
const DEFAULT_VIEW_PLANS: Plan[] = DEFAULT_PLANS.map((p) => ({
  id: p.id,
  name: p.name,
  name_ar: p.name_ar || p.name,
  price: Number(p.price),
  max_replies: p.max_replies ?? 0,
  max_pages: p.max_pages ?? 0,
  max_rules: p.max_rules ?? 0,
  features: p.features ?? [],
}))

const PLAN_ICONS = [Sparkles, Star, Crown, Crown]

export default function PricingPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_VIEW_PLANS)
  const [annual, setAnnual] = useState(false)
  const [plansFailed, setPlansFailed] = useState(false)

  const loadPlans = useCallback(() => {
    setPlansFailed(false)
    apiFetch("/api/plans")
      .then((res) => unwrapApi<ComparisonPlanInput[]>(res))
      .then((d) => {
        const next = (d ?? []) as Plan[]
        if (next.length > 0) {
          // تبديل صامت: نفس id/سعر/ترتيب/عدد الميزات يُبقي مرجع المصفوفة
          // (مفاتيح React ثابتة) → لا إعادة تركيب للبطاقات ولا وميض
          setPlans((prev) =>
            plansEqual(prev.map(toComparisonPlan), next.map(toComparisonPlan)) ? prev : next,
          )
        }
        setPlansFailed(next.length === 0)
      })
      .catch(() => setPlansFailed(true))
  }, [])

  useEffect(() => {
    loadPlans()
  }, [loadPlans])

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <header className="border-b border-border/40 backdrop-blur-md bg-background/60 sticky top-0 z-30">
        <SectionContainer><div className="flex items-center justify-between h-14">
          <a href="/" className="flex items-center gap-2 min-h-11">
            <Image src="/brand-icon.png" alt="" width={56} height={56} className="size-7 rounded-md" priority />
            <span className="font-bold text-sm">SmartBot</span>
          </a>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/")}>الرئيسية</Button>
            <Button variant="ghost" size="sm" onClick={() => router.push("/demo")}>تجربة حية</Button>
            <Button size="sm" onClick={() => router.push("/subscribe")}>اشتراك</Button>
          </div>
        </div></SectionContainer>
      </header>

      {/* v9-D3: skip-link target (was missing — the skip link was a no-op on
          this page; same sr-only anchor pattern as the landing). */}
      <span id="page-content" className="sr-only" tabIndex={-1} />

      <SectionContainer className="py-20 text-center relative">
        <GlowPool position="top-0 left-1/2 -translate-x-1/2" size="size-[50vmin]" color="orange/8" />

        <div
          className="animate-fade-in-150 inline-flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.18em] text-accent-foreground/90 mb-6"
        >
          <Sparkles className="size-3 text-accent-foreground" />
          خطط الأسعار
        </div>

        {/* v10-C3 — the h1 wrapper no longer carries animate-fade-in-250: that
            parent opacity animation gated the whole heading (lead word
            included) behind 250ms + a 0.5s fade and voided the
            kinetic-unit-lead first-paint fix. The kinetic words themselves
            still animate; only the redundant outer fade is gone. */}
        <h1
          className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tighter mb-5 text-balance"
        >
          <KineticText mode="words" duration={800} delay={100}>خطط تناسب كل الأحجام</KineticText>
        </h1>

        <ScrollReveal y={18} delay={200}
          className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto text-balance"
        >
          ابدأ مجاناً، ارتقِ عندما تنمو صفحتك. بدون رسوم خفية، إلغاء في أي وقت.
        </ScrollReveal>

        {/* Trust row */}
        <div
          className="animate-fade-in-400 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-8 text-xs text-muted-foreground"
        >
          {[
            { icon: Shield, text: "بدون بطاقة ائتمان" },
            { icon: Zap, text: "إعداد في 5 دقائق" },
            { icon: MessageCircle, text: "دعم 24/7" },
            { icon: Users, text: "مجاني للأبد" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <item.icon className="size-3.5 text-accent-foreground" />
              <span>{item.text}</span>
            </div>
          ))}
        </div>

        {/* Billing toggle */}
        <ScrollReveal
          y={6}
          delay={200}
          duration={0.45}
          className="mt-10 inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1 backdrop-blur"
        >
          <button
            onClick={() => setAnnual(false)}
            aria-pressed={!annual}
            className={`min-h-11 px-5 py-1.5 text-sm font-medium rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
              !annual ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            شهري
          </button>
          <button
            onClick={() => setAnnual(true)}
            aria-pressed={annual}
            className={`min-h-11 px-5 py-1.5 text-sm font-medium rounded-full transition-all flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
              annual ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            سنوي
            <span className={`text-3xs font-bold px-1.5 py-0.5 rounded-full ${
              annual ? "bg-primary-foreground/20 text-primary-foreground" : "bg-accent-foreground/15 text-accent-foreground"
            }`}>
              وفّر شهرين
            </span>
          </button>
        </ScrollReveal>
      </SectionContainer>

      <SectionContainer className="pb-24">
        {/* v18-1-c: بطاقات تُرسم فوراً من الافتراضية؛ فشل الـAPI النهائي
            يُبقيها مع لافتة + زر إعادة المحاولة (بدل استبدال الشبكة بحالة
            خطأ فارغة) */}
        {plansFailed && (
          <div className="max-w-md mx-auto text-center mb-10" role="status">
            <p className="text-sm text-muted-foreground mb-3">تُعرض الباقات الافتراضية — أعد المحاولة</p>
            <Button variant="outline" onClick={loadPlans}>إعادة المحاولة</Button>
          </div>
        )}
        {/* Plan cards — scroll-triggered stagger (scroll-craft §G.4).
            v18-1e (orphan-card fix): the flat md:grid-cols-3 left the 5th
            plan on a ragged half-filled second row. Deliberate contract:
            <sm stacked single column (richest cards keep full width) ·
            sm 2-up with a full-width trailing card for odd counts ·
            md+ 6 tracks → 3-up rows with the trailing row CENTERED
            (a lone card at track 3, a pair from track 2) — the classic
            pricing-page balance. These marketing cards stay 3-up at lg
            (unlike /subscribe's compact 4+wide strip): at max-w-6xl a
            4/5-up row would compress the text-5xl price + feature lists
            below their designed width. */}
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-6 max-w-6xl mx-auto">
          {plans.map((plan, i) => {
            const Icon = PLAN_ICONS[i] || Sparkles
            const isPopular = i === 1
            /* v18-1e — md 6-track centering: rem = plans on the last 3-up
               row. rem===1 → the lone card centers at track 3; rem===2 →
               the pair starts at track 2 (tracks 2-3 + 4-5). */
            const rem = plans.length % 3
            const loneLast = rem === 1 && i === plans.length - 1
            const pairFirst = rem === 2 && i === plans.length - 2
            return (
              <ScrollReveal
                key={plan.id}
                y={28}
                delay={i * 120}
                duration={0.7}
                className={cn(
                  "relative",
                  "md:col-span-2",
                  loneLast && "md:col-start-3",
                  pairFirst && "md:col-start-2",
                  /* odd count at sm: the trailing card goes full-width so
                     the 2-up grid never strands a half-width orphan */
                  plans.length % 2 === 1 && i === plans.length - 1 && "sm:col-span-2",
                  isPopular && "lg:-mt-4",
                )}
              >
                <div
                  className="h-full transition-transform duration-300 ease-out hover:-translate-y-1.5"
                >
                <Card className={cn(
                  "relative h-full flex flex-col overflow-hidden transition-all duration-500",
                  isPopular
                    ? "border-accent-foreground/50 shadow-2xl shadow-accent-foreground/20 bg-gradient-to-b from-accent-foreground/[0.04] via-card to-card"
                    : "border-border/50 hover:border-accent-foreground/30"
                )}>
                  {isPopular && (
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 z-10">
                      <div className="bg-gradient-to-r from-accent-foreground to-accent-foreground/80 text-white text-3xs font-bold px-4 py-1.5 rounded-b-xl flex items-center gap-1 shadow-lg">
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
                    {/* Price — v9-C3: key-remount swap. key={annual} re-mounts the
                     * price/period nodes on billing toggle so the .price-swap
                     * entrance (globals.css) plays — framer-free by design. */}
                    <div className="text-center mb-6 py-4 border-y border-border/40">
                      <div className="flex items-baseline justify-center gap-1.5">
                        {plan.price === 0 ? (
                          <span className="text-4xl font-extrabold">مجاني</span>
                        ) : (
                          <>
                          <span key={annual ? "y" : "m"} className="price-swap text-5xl font-extrabold tracking-tighter text-accent-foreground">
                            {/* Smart-Menu parity: yearly billing = 10× monthly (two months free).
                                v12-E4.13: formatNumber — prices flow through the
                                single i18n formatting seam like every other number. */}
                            {formatNumber(annual ? Math.round(plan.price * 10 * 100) / 100 : plan.price)}
                          </span>
                            <span className="text-base text-muted-foreground font-medium">د.ل</span>
                          </>
                        )}
                      </div>
                      <div key={annual ? "y" : "m"} className="price-swap text-xs text-muted-foreground mt-1">
                        {plan.price === 0 ? "للأبد، بدون حدود زمنية" : annual ? "سنوياً" : "شهرياً"}
                      </div>
                      {annual && plan.price > 0 && (
                        <div className="price-swap text-2xs text-accent-foreground mt-0.5">
                          وفر شهرين عند الاشتراك السنوي
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-2.5 mb-6 flex-1 text-start">
                      {plan.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-sm">
                          <div className="size-5 rounded-full bg-accent-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                            {/* v17-E-F4 (D3 #8): strokeWidth={3} removed — the
                                project-wide default (2) applies; this was the
                                only non-default stroke weight in the app. */}
                            <Check className="size-3 text-accent-foreground" />
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
                </div>
              </ScrollReveal>
            )
          })}
        </div>

        {/* FAQ-style microcopy */}
        <ScrollReveal
          y={0}
          delay={400}
          duration={0.6}
          className="text-center mt-12 text-xs text-muted-foreground"
        >
          <p>جميع الخطط تشمل: تشفير SSL، دعم بريد إلكتروني، تحديثات مجانية مدى الحياة.</p>
        </ScrollReveal>
      </SectionContainer>

      {/* v12-E4.12 (WCAG 3.2.6 Consistent Help): the money path now carries
          the same one-tap WhatsApp help affordance the landing has — same
          component, same fixed end-4/bottom slot, same z-index. */}
      <FloatingWhatsApp />
    </div>
  )
}

function getDescription(planId: number): string {
  // v18-1-c: id رقمي على السلك (1-5) — فروع "free"/"basic" النصية القديمة
  // لم تكن تطابق أبداً؛ رُبط الوصف المقصود بالمعرف الرقمي
  if (planId === 1) return "للتجربة والصفحات الصغيرة"
  if (planId === 2) return "للنشاطات التجارية المتوسطة"
  return "للشركات والوكالات الكبيرة"
}
