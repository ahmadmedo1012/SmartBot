"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { fadeUp, stagger } from "@/lib/motion"
import { csrfFetch } from "@/lib/csrf-client"
import {
  Sparkles, Check, Crown, Star, Bot, BarChart3, MessageCircle, Calendar,
  Target, ShieldCheck, Globe, Users, ChevronDown
} from "lucide-react"

interface Plan {
  id: string
  name: string
  name_ar: string
  price: number
  max_replies: number
  max_pages: number
  max_rules: number | string
  features: string[]
}

const features = [
  { icon: Bot, title: "ردود تلقائية ذكية", desc: "ردود آنية ومخصصة لجميع التعليقات والرسائل" },
  { icon: MessageCircle, title: "صندوق وارد موحد", desc: "إدارة جميع المحادثات من واجهة واحدة" },
  { icon: BarChart3, title: "تحليلات وأداء", desc: "تقارير مفصلة عن أداء الصفحات والمنشورات" },
  { icon: Calendar, title: "جدولة المنشورات", desc: "إنشاء وجدولة المنشورات مسبقاً مع تقويم مرئي" },
  { icon: Target, title: "استهداف الجمهور", desc: "تحليل الجمهور واستهداف الفئات المناسبة" },
  { icon: ShieldCheck, title: "أمان وتشفير", desc: "حماية متقدمة للبيانات والاتصالات" },
  { icon: Globe, title: "دعم متعدد اللغات", desc: "دعم كامل للعربية والإنجليزية" },
  { icon: Users, title: "إدارة فريق", desc: "إضافة أعضاء الفريق بصلاحيات مختلفة" },
]

const faqs = [
  { q: "هل أحتاج صلاحيات خاصة لربط الصفحة؟", a: "تحتاج صلاحية إدارة الصفحة فقط. نطلب أقل الصلاحيات اللازمة." },
  { q: "هل بياناتي آمنة؟", a: "جميع البيانات مشفرة. لا نشارك معلوماتك مع أي جهة خارجية." },
  { q: "كم صفحة يمكنني ربطها؟", a: "صفحة واحدة في الخطة المجانية، وحتى 10 صفحات في الاحترافية." },
  { q: "ماذا يحدث إذا تجاوزت حد الردود؟", a: "في الخطة المجانية 100 رد/شهر. للردود غير المحدودة، اختر الخطة الأساسية أو الاحترافية." },
  { q: "هل يمكنني تجربة البوت قبل الشراء؟", a: "نعم! جرب لوحة التحكم التجريبية ببيانات وهمية قبل الاشتراك." },
]

const PLAN_ICONS = [Sparkles, Star, Crown, Crown]

export default function PricingPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  // title handled by layout.tsx

  useEffect(() => {
    csrfFetch("/api/plans")
      .then((r) => r.json())
      .then(setPlans)
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <SectionContainer>
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-md bg-orange flex items-center justify-center text-white font-bold text-xs">S</div>
              <span className="font-bold text-sm">SmartBot</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => router.push("/")}>الرئيسية</Button>
              <Button variant="ghost" size="sm" onClick={() => router.push("/demo")}>تجربة حية</Button>
              <Button size="sm" onClick={() => router.push("/subscribe")}>اشتراك</Button>
            </div>
          </div>
        </SectionContainer>
      </header>

      {/* Hero */}
      <SectionContainer className="py-16 text-center">
        <SectionHeader
          title="خطط أسعار تناسب الجميع"
          description="اختر الخطة المناسبة لاحتياجاتك وابدأ في أتمتة ردودك اليوم"
        />

        {/* Plans */}
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto mt-10">
          {plans.map((plan, i) => {
            const Icon = PLAN_ICONS[i] || Sparkles
            const isPopular = i === 1
            return (
              <motion.div key={plan.id} variants={fadeUp} custom={i}>
                <Card className={cn("relative h-full flex flex-col", isPopular && "border-orange shadow-lg shadow-orange/10")}>
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                      <Badge variant="default" className="text-xs">الأكثر شعبية</Badge>
                    </div>
                  )}
                  <CardHeader className="text-center">
                    <div className="mx-auto size-10 rounded-lg bg-orange/10 flex items-center justify-center mb-2">
                      <Icon className="size-5 text-orange" />
                    </div>
                    <CardTitle>{plan.name_ar || plan.name}</CardTitle>
                    <CardDescription>
                      <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                      <span className="text-sm text-muted-foreground mr-1">د.ل/شهر</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="grid grid-cols-3 gap-2 mb-4 p-3 bg-muted/50 rounded-lg text-center text-sm">
                      <div><span className="font-bold text-orange-500">{plan.max_replies >= 999999 ? "∞" : plan.max_replies}</span><p className="text-xs text-muted-foreground">ردود</p></div>
                      <div><span className="font-bold text-orange-500">{plan.max_pages >= 999 ? "∞" : plan.max_pages}</span><p className="text-xs text-muted-foreground">صفحات</p></div>
                      <div><span className="font-bold text-orange-500">{plan.max_rules || "-"}</span><p className="text-xs text-muted-foreground">قواعد</p></div>
                    </div>
                    <ul className="space-y-2 mb-6 flex-1">
                      {plan.features.slice(0, 5).map((f, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Check className="size-4 text-orange-500 shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                    <Button className="w-full" variant={isPopular ? "primary" : "outline"}
                      onClick={() => router.push("/subscribe")}>
                      {plan.price === 0 ? "ابدأ مجاناً" : "اشتراك الآن"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>
      </SectionContainer>

      {/* Features */}
      <section className="border-t border-border bg-muted/30 py-16">
        <SectionContainer>
          <SectionHeader title="كل ما تحتاجه" description="مجموعة متكاملة من الأدوات لإدارة صفحات فيسبوك" />
          <motion.div variants={stagger} initial="hidden" whileInView="animate" viewport={{ once: true }}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <motion.div key={i} variants={fadeUp} custom={i}>
                <Card className="h-full">
                  <CardContent className="p-6 text-center space-y-2">
                    <div className="mx-auto size-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                      <f.icon className="size-5 text-orange-500" />
                    </div>
                    <CardTitle className="text-sm">{f.title}</CardTitle>
                    <CardDescription className="text-xs">{f.desc}</CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </SectionContainer>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <SectionContainer>
          <SectionHeader title="الأسئلة الشائعة" />
          <div className="max-w-2xl mx-auto space-y-3">
            {faqs.map((faq, i) => (
              <Card key={i}>
                <button className="w-full text-right p-4 flex items-center justify-between gap-4"
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}>
                  <span className="font-medium text-sm">{faq.q}</span>
                  <ChevronDown className={cn("size-4 text-muted-foreground shrink-0 transition-transform", expandedFaq === i && "rotate-180")} />
                </button>
                {expandedFaq === i && (
                  <div className="px-4 pb-4">
                    <p className="text-sm text-muted-foreground">{faq.a}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </SectionContainer>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border bg-orange-500/5 py-16">
        <SectionContainer className="text-center space-y-4">
          <Sparkles className="size-12 text-orange-500 mx-auto" />
          <SectionHeader title="استعد لتنمية صفحتك" description="انضم إلى مئات المستخدمين الذين يثقون في SmartBot" />
          <div className="flex items-center justify-center gap-3">
            <Button size="lg" onClick={() => router.push("/subscribe")}>ابدأ الآن</Button>
            <Button size="lg" variant="outline" onClick={() => router.push("/demo")}>تجربة حية</Button>
          </div>
        </SectionContainer>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <SectionContainer>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>SmartBot &copy; {new Date().getFullYear()}</span>
            <div className="flex items-center gap-4">
              <button className="hover:text-foreground transition-colors">الشروط والأحكام</button>
              <button className="hover:text-foreground transition-colors">سياسة الخصوصية</button>
            </div>
          </div>
        </SectionContainer>
      </footer>
    </div>
  )
}
