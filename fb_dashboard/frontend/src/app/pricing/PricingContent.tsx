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

const PLAN_ICONS = [Sparkles, Star, Crown, Crown]

export default function PricingContent() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  useEffect(() => {
    apiFetch("/api/plans")
      .then((r) => r.json())
      .then(setPlans)
      .catch(() => {})
  }, [])

  return (
    <SectionContainer className="py-16 text-center">
      <SectionHeader
        title="خطط أسعار تناسب الجميع"
        description="اختر الخطة المناسبة لاحتياجاتك وابدأ في أتمتة ردودك اليوم"
      />
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
                    <span className="text-3xl font-bold text-foreground">{plan.price === 0 ? "مجاني" : plan.price}</span>
                    <span className="text-sm text-muted-foreground mr-1">د.ل/شهر</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <Button
                    size="sm"
                    className="w-full mt-auto"
                    variant="orange"
                    onClick={() => router.push(plan.price === 0 ? "/subscribe" : `/subscribe?plan=${plan.id}`)}
                  >
                    {plan.price === 0 ? "ابدأ الآن" : "اشتراك"}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </motion.div>
    </SectionContainer>
  )
}
