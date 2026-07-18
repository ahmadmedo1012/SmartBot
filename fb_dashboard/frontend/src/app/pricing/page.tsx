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
import { apiFetch } from "@/lib/csrf-client"
import { Sparkles, Check, Crown, Star } from "lucide-react"

interface Plan {
  id: string; name: string; name_ar: string; price: number
  max_replies: number; max_pages: number; max_rules: number | string
  features: string[]
}

const PLAN_ICONS = [Sparkles, Star, Crown, Crown]

export default function PricingPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])

  useEffect(() => {
    apiFetch("/api/plans").then(r => r.json()).then(setPlans).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <SectionContainer><div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-md bg-orange flex items-center justify-center text-white font-bold text-xs">S</div>
            <span className="font-bold text-sm">SmartBot</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/")}>الرئيسية</Button>
            <Button variant="ghost" size="sm" onClick={() => router.push("/demo")}>تجربة حية</Button>
            <Button size="sm" onClick={() => router.push("/subscribe")}>اشتراك</Button>
          </div>
        </div></SectionContainer>
      </header>
      <SectionContainer className="py-16 text-center">
        <SectionHeader title="خطط أسعار تناسب الجميع" description="اختر الخطة المناسبة لاحتياجاتك" />
        <motion.div variants={stagger} initial="hidden" animate="visible" className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto mt-10">
          {plans.map((plan, i) => {
            const Icon = PLAN_ICONS[i] || Sparkles
            return (
              <motion.div key={plan.id} variants={fadeUp} custom={i}>
                <Card className={cn("relative h-full flex flex-col", i === 1 && "border-orange shadow-lg shadow-orange/10")}>
                  {i === 1 && <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10"><Badge variant="default" className="text-xs">الأكثر شعبية</Badge></div>}
                  <CardHeader className="text-center">
                    <div className="mx-auto size-10 rounded-lg bg-orange/10 flex items-center justify-center mb-2"><Icon className="size-5 text-orange" /></div>
                    <CardTitle>{plan.name_ar || plan.name}</CardTitle>
                    <CardDescription>
                      <span className="text-3xl font-bold text-foreground">{plan.price === 0 ? "مجاني" : plan.price}</span>
                      <span className="text-sm text-muted-foreground mr-1">د.ل/شهر</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-2 mb-6 text-right">
                      {plan.features.map((f, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm"><Check className="size-4 text-orange shrink-0" /><span>{f}</span></li>
                      ))}
                    </ul>
                    <Button size="sm" className="w-full mt-auto" onClick={() => router.push(plan.price === 0 ? "/subscribe" : `/subscribe?plan=${plan.id}`)}>
                      {plan.price === 0 ? "ابدأ الآن" : "اشتراك"}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </motion.div>
      </SectionContainer>
    </div>
  )
}
