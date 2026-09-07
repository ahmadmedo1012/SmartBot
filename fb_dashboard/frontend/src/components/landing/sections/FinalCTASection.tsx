"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { Button } from "@/components/ui/button"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import { GlowPool } from "@/components/ui/GlowPool"
import { usePublicStats } from "@/lib/usePublicStats"
import { formatNumber } from "@/lib/format"

export default function FinalCTASection() {
  // Plan §3.1: real tenant count or qualitative copy — the old fixed count claim was fake
  const { stats, ready } = usePublicStats()
  const tenants = stats?.activeTenants ?? 0
  const subtitle =
    ready && tenants >= 1
      ? <>انطلق الآن — انضم إلى <strong className="text-foreground">{formatNumber(tenants)} صفحة</strong> تثق في SmartBot</>
      : <>انطلق الآن — صفحتك التالية تستحق أتمتة حقيقية</>

  return (
    <SectionContainer className="border-t border-accent-foreground/10">
      <GlowPool position="top-0 start-0" size="size-80 sm:size-96" color="orange/30" />
      <GlowPool position="bottom-0 end-0" size="size-80 sm:size-96" color="orange/25" />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[60vmin] rounded-full border border-accent-foreground/10 pointer-events-none z-0" />

      <div className="relative z-10 text-center">
        <SectionHeader
          icon={<Sparkles className="size-3" />}
          title="جهّز صفحتك للانطلاق الرقمي"
          subtitle={subtitle}
        />

        <ScrollReveal
          y={20}
          delay={400}
          duration={0.5}
          className="flex gap-4 justify-center flex-wrap"
        >
          <Link href="/subscribe">
            <Button size="lg">ابدأ مجاناً <DirectionalIcon semanticDirection="forward" className="size-4 sm:size-5" /></Button>
          </Link>
          <Link href="/pricing">
            <Button variant="outline" size="lg">
              عرض الخطط
            </Button>
          </Link>
        </ScrollReveal>

        {/* v15-E6 (D5-M6): /60 on muted-foreground measured 2.62:1 in both
            modes — the full token measures 5.59:1 dark / 6.54:1 light. */}
        <ScrollReveal
          y={0}
          delay={500}
          duration={0.6}
          className="text-xs text-muted-foreground mt-6"
        >
          مجاناً بدون بطاقة ائتمان · إلغاء في أي وقت · دعم فني متكامل
        </ScrollReveal>
      </div>
    </SectionContainer>
  )
}
