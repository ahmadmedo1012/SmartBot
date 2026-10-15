"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"

import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { KineticText } from "@/components/ui/kinetic-text"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import { apiFetch } from "@/lib/csrf-client"
import { Sparkles, Check, Crown, Star, Shield, Zap, MessageCircle, Users } from "lucide-react"
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
      {/* r128-F7 (A5 B13): shared product chrome — the page-local mini-header
          (and the missing footer) retired; /pricing now carries the same
          Header/Footer as every other public route (chrome consistency).
          The fixed 60px Header rides --z-dropdown; hero py-20 clears it. */}
      <Header />

      {/* v9-D3: skip-link target (was missing — the skip link was a no-op on
          this page; same sr-only anchor pattern as the landing). */}
      <span id="page-content" className="sr-only" tabIndex={-1} />


      {/* 2-g (P2 — acceptance gap 3, fold discipline): the lg-tier band
          keeps the fixed-header clearance contract (lg:pt-20 = 80px, the
          same 60px-header + air rung as mobile) while the shared lg:py-28
          bottom rung halves (lg:pb-6) — the fold win comes from the card
          rhythm below (CTA directly under the price), not from squeezing
          the header band under the fixed chrome. */}
      <SectionContainer className="pt-20 pb-8 text-center relative md:py-20 lg:pt-20 lg:pb-6">
        {/* 2-e (P1 pricing-fold fix): the vertical rhythm above the plan
            grid is mobile-tight — the hero band was py-20 top+bottom on a
            390×844 fold where the first card's price+CTA sat below it.
            pt-20 keeps the fixed-header clearance (60px) exactly as the
            r128-F7 comment pins; pb drops to 2 rungs at mobile. */}
        {/* r130 (W1-E D-5, de-glow): the legacy orange/8 blurred radial
            pool is REMOVED (its component is deleted — zero consumers
            left) — Madarek ground is flat; no colored outer glows. The
            pricing hero speaks the flat ln-card language now. */}

        <div
          className="animate-fade-in-150 inline-flex items-center gap-2 text-2xs font-medium uppercase text-accent-foreground/90 mb-4 md:mb-6"
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
          /* r151 (LIVE-AUDIT-SB1 P2): display leading 1.12 — the landing
             Arabic display identity (the text-5xl baked line-height:1 was
             measured live at ratio 1.00, exposing the جيم/ح descenders). */
          className="text-4xl md:text-5xl lg:text-[3.5rem] leading-[1.12] font-bold mb-4 text-balance md:mb-5"
        >
          <KineticText mode="words" duration={720} delay={100}>خطط تناسب كل الأحجام</KineticText>
        </h1>

        <ScrollReveal y={18} delay={200}
          className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto text-balance"
        >
          ابدأ مجاناً، ارتقِ عندما تنمو صفحتك. بدون رسوم خفية، إلغاء في أي وقت.
        </ScrollReveal>

        {/* Trust row */}
        <div
          className="animate-fade-in-400 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-5 text-xs text-muted-foreground md:mt-8"
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

        {/* r144 honesty wave: the «شهري/سنوي — وفّر شهرين» billing toggle is
            REMOVED. The yearly figure (10× monthly) and the savings claim
            were display-only — no annual billing concept exists anywhere in
            the backend, and the CTA always subscribed the MONTHLY plan, so
            the displayed price could never match the charged one. Clean
            monthly pricing only, matching the money path. */}
      </SectionContainer>

      {/* phase5 r152 — the circuit-trace divider between the pricing hero
          and the plan grid (the machine-room signature). */}
      <hr className="sb-trace" aria-hidden="true" />

      {/* 2-g (P2 — fold): the plan-grid band's lg top rung tightens
          (112 → 32) so the first plan row's price + subscribe CTA land
          inside the 900px fold at 1440. Mobile/tablet rhythm untouched. */}
      <SectionContainer className="pb-24 pt-6 md:pt-16 lg:pt-8">
        {/* v18-1-c: بطاقات تُرسم فوراً من الافتراضية؛ فشل الـAPI النهائي
            يُبقيها مع لافتة + زر إعادة المحاولة (بدل استبدال الشبكة بحالة
            خطأ فارغة) */}
        {plansFailed && (
          // 2-g (P2 — fold + banner contrast): the dev-mode fallback notice
          // tightens (mb-10 stacked block → mb-6) and the copy climbs from
          // text-muted-foreground to the full foreground ink — the banner is
          // a real status message, and 14px text wants the ink tier on both
          // grounds (measured: dark #E9F5F0 = 15.94:1 on #071A21 · light
          // #0A242E = 14.62:1 on #EDF6F3; the muted grays measured 9.34:1 /
          // 7.44:1 but read as decoration at 14px).
          <div className="max-w-2xl mx-auto text-center mb-6" role="status">
            <p className="text-sm text-foreground mb-2">تُعرض الباقات الافتراضية — أعد المحاولة</p>
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
                  className="h-full transition-transform duration-(--t-base) ease-out hover:-translate-y-1.5"
                >
                <Card className={cn(
                  "relative h-full flex flex-col overflow-hidden transition-[border-color,box-shadow,background-color] duration-(--t-slower)",
                  isPopular
                    /* r131-F7b (A4 P2-4 de-glow tail): the popular card's
                        gold-tinted /20 glow → the neutral elev-4 rung
                        (shadow-xl = var(--elev-4)); border emphasis + the
                        4% wash stay (chrome, not glow). */
                    ? "border-accent-foreground/50 shadow-xl bg-gradient-to-b from-accent-foreground/[0.04] via-card to-card"
                    : "border-border/50 hover:border-accent-foreground/30"
                )}>
                  {isPopular && (
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 z-10">
                      {/* r133 (A5 S1): flat bg-primary pill — the r120 U11-P2-4
                          unification with /subscribe (SM PricingClient twin);
                          the gradient + shadow-lg are gone. */}
                      <div className="bg-primary text-primary-foreground text-3xs font-bold px-4 py-1.5 rounded-b-xl flex items-center gap-1">
                        <Crown className="size-3 fill-white" />
                        الأكثر شعبية
                      </div>
                    </div>
                  )}

                  {/* Decorative corner gradient for popular — r130 (W1-E D-5,
                      de-glow): the blurred accent blob is REMOVED (flat
                      ln-card language); the gold border + badge already
                      carry the popular state. */}

                  {/* 2-g (P2 — fold): the lg card-top rung compresses
                      (pt-8 → lg:pt-4; the icon plate's mb-3 → lg:mb-2) —
                      enough to land the row-1 CTA at the fold without
                      touching the mobile/tablet rhythm (max-sm: stays). */}
                  <CardHeader className="text-center relative pt-8 max-sm:pt-5 lg:pt-4">
                    <div className={cn(
                      "mx-auto size-12 rounded-xl flex items-center justify-center mb-3 max-sm:size-10 max-sm:mb-2 lg:mb-2",
                      isPopular ? "bg-accent-foreground/20" : "bg-accent-foreground/10"
                    )}>
                      <Icon className="size-6 text-accent-foreground max-sm:size-5" />
                    </div>
                    <CardTitle className="text-lg">{plan.name_ar || plan.name}</CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">{getDescription(plan.id)}</CardDescription>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col px-6 pb-6">
                    {/* Price — r144: static monthly figure. The old annual
                     * key-remount swap (key={annual} + .price-swap) rode the
                     * removed billing toggle; a monthly-only card needs no
                     * swap machinery. formatNumber — prices flow through the
                     * single i18n formatting seam (v12-E4.13).
                     * r148 (19-AUDIT-SB SB-D6a): the row is a shared 64px
                     * bottom-aligned track — «مجاني» (36px) and «19» (48px)
                     * now share one bottom edge across cards (they sat 8-16px
                     * apart on the old free-height baseline row). */}
                    <div className="text-center mb-6 py-4 border-y border-border/40 lg:mb-3 lg:py-2">
                      <div className="flex min-h-16 items-end justify-center gap-1.5">
                        {plan.price === 0 ? (
                          <span className="text-4xl font-bold">مجاني</span>
                        ) : (
                          <>
                          <span className="text-5xl font-bold tabular-nums text-accent-foreground">
                            {formatNumber(plan.price)}
                          </span>
                            <span className="text-base text-muted-foreground font-medium">د.ل</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {plan.price === 0 ? "للأبد، بدون حدود زمنية" : "شهرياً"}
                      </div>
                    </div>

                    {/* Features — 2-e (P1 pricing-fold fix) promoted by
                        2-g (P2 — acceptance fold discipline): the CTA rides
                        DIRECTLY under the price at EVERY breakpoint
                        (order-2) and the feature list follows (order-3,
                        flex-1 keeps the equal-height card stretch). The
                        ≤640px tier landed this order first (the 390×844
                        fold); the 1440×900 fold demanded the same honesty —
                        price + subscribe CTA above the fold on the money
                        page, features below (the mobile pattern, now the
                        one universal rhythm: no breakpoint forks). */}
                    <ul className="space-y-2.5 flex-1 text-start order-3 mt-4 mb-0">
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
                      variant={isPopular ? "gold" : "outline"}
                      /* r131-F7b (A4 P2-4): the popular CTA's gold glow
                         (shadow-lg shadow-accent-foreground/30) is retired —
                         the canonical Button carries its own premium hover
                         shadow (the gold-glow-on-CTA was the flagged
                         pricing:307 site).
                         r148 (19-AUDIT-SB SB-D6b): the h-10 override is gone
                         — size="lg" rides its canonical h-12 (48px money-CTA
                         canon, r134); measured 318×40 before. */
                      className="w-full order-2"
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

      {/* r128-F7 (A5 B13): shared Footer closes the page (was absent). */}
      <Footer />

      {/* v12-E4.12 (WCAG 3.2.6 Consistent Help): the money path now carries
          the same one-tap WhatsApp help affordance the landing has — same
          component, same fixed end-4/bottom slot, same z-index. */}
      <FloatingWhatsApp />
    </div>
  )
}

function getDescription(planId: number): string {
  // v18-1-c: id رقمي على السلك (1-5) — فروع "free"/"basic" النصية القديمة
  // لم تكن تطابق أبداً؛ رُبط الوصف المقصود بالمعرف الرقمي.
  // r144 (QA): the three paid plans above Basic all shared the one
  // copy-paste line «للشركات والوكالات الكبيرة» — three differentiated,
  // seed-accurate subtitles now (startup.py:Premium 10k رد/بث/فريق حتى 2 ·
  // Pro 50k/تسلسلات/فريق حتى 5 · Enterprise غير محدود/24-7).
  // P13-2c (honesty): Pro's «النشاطات متعددة الصفحات» subtitle retired —
  // the architecture binds ONE Facebook page per tenant (models.py
  // uq_botstate_tenant_key), so no tier is a multi-page pitch.
  if (planId === 1) return "للتجربة والصفحات الصغيرة"
  if (planId === 2) return "للنشاطات التجارية المتوسطة"
  if (planId === 3) return "للشركات النامية والفرق الصغيرة"
  if (planId === 4) return "للوكالات والنشاطات التجارية الواسعة"
  return "للمؤسسات الكبيرة ذات التشغيل الواسع"
}
