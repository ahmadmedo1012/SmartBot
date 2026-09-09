"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"
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
          {/* v16-E3 (D1 C2): un-nested Link>Button — the anchor is the single
              focusable control; the Button's visual classes (orange/outline
              + size lg + sheen) live on a span. Interactive-only tokens
              (cursor/focus-ring/active-scale) dropped. */}
          <Link href="/subscribe">
            <span className="relative inline-flex shrink-0 items-center justify-center rounded-lg border-0 font-sans font-bold whitespace-nowrap select-none isolate overflow-hidden bg-primary text-primary-foreground hover:bg-primary/95 shadow-md shadow-accent-foreground/25 hover:shadow-xl hover:shadow-accent-foreground/40 dark:shadow-accent-foreground/35 dark:hover:shadow-accent-foreground/50 transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 ease-smooth h-14 min-h-11 min-w-11 gap-2.5 px-7 text-sm sm:text-base [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>*]:relative before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(105deg,transparent_30%,oklch(1_0_0_/_0.22)_50%,transparent_70%)] before:-translate-x-full before:transition-transform before:duration-700 before:ease-out hover:before:translate-x-full before:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-[radial-gradient(circle_at_50%_50%,oklch(1_0_0_/_0.16),transparent_45%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500">
              ابدأ مجاناً <DirectionalIcon semanticDirection="forward" className="size-4 sm:size-5" />
            </span>
          </Link>
          <Link href="/pricing">
            <span className="relative inline-flex shrink-0 items-center justify-center rounded-lg border border-border/70 bg-transparent text-foreground hover:bg-foreground/5 hover:border-accent-foreground/40 hover:shadow-sm dark:hover:bg-foreground/10 dark:hover:border-accent-foreground/35 font-sans font-bold whitespace-nowrap select-none isolate overflow-hidden transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-300 ease-smooth h-14 min-h-11 min-w-11 gap-2.5 px-7 text-sm sm:text-base [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>*]:relative before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(105deg,transparent_30%,oklch(1_0_0_/_0.22)_50%,transparent_70%)] before:-translate-x-full before:transition-transform before:duration-700 before:ease-out hover:before:translate-x-full before:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none after:bg-[radial-gradient(circle_at_50%_50%,oklch(1_0_0_/_0.16),transparent_45%)] after:opacity-0 hover:after:opacity-100 after:transition-opacity after:duration-500">
              عرض الخطط
            </span>
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
