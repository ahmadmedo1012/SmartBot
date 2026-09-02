"use client"

import { motion } from "framer-motion"
import { STEPS } from "@/components/landing/landing-data"
import { springGentle, springSnappy } from "@/lib/motion"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Link2, BrainCircuit, LineChart } from "lucide-react"

const stepIcons = [Link2, BrainCircuit, LineChart]

export default function HowItWorksSection() {
  return (
    <SectionContainer>
      <SectionHeader
        eyebrow="الخطوات"
        title="من الصفر إلى الإنتاج في دقائق"
        subtitle="ثلاثة خطوات بسيطة فقط — ابدأ بأتمتة ردودك اليوم"
      />

      <div className="relative">
        {/* Connecting line between steps */}
        <div className="hidden lg:block absolute top-16 start-[calc(16.67%+2rem)] end-[calc(16.67%+2rem)] h-px bg-gradient-to-r from-transparent via-orange/30 to-transparent" aria-hidden="true" />

        <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
          {STEPS.map((step, i) => {
            const Icon = stepIcons[i]
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 32, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ ...springGentle, delay: i * 0.15 }}
                className="relative flex flex-col items-center text-center group"
              >
                {/* Step circle */}
                <div className="relative mb-6">
                  <div className="absolute inset-0 size-16 rounded-full bg-orange/20 blur-xl group-hover:blur-2xl group-hover:bg-orange/30 transition-all duration-700" />
                  <div className="relative size-16 rounded-full bg-gradient-to-b from-orange/25 to-orange/10 border border-orange/30 flex items-center justify-center group-hover:border-orange/50 group-hover:scale-105 transition-all duration-500 shadow-lg shadow-orange/10">
                    <Icon className="size-6 text-orange" />
                    <div className="absolute -top-2 -end-2 size-6 rounded-full bg-orange flex items-center justify-center shadow-md">
                      <span className="text-[10px] font-bold text-white">{step.num}</span>
                    </div>
                  </div>
                </div>

                <h3 className="text-lg sm:text-xl font-bold mb-2 group-hover:text-orange transition-colors duration-300">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[32ch]">
                  {step.desc}
                </p>

                {/* Connector dot for desktop */}
                <div className="hidden lg:flex absolute top-8 -start-8 items-center">
                  <div className="size-1.5 rounded-full bg-orange/40" />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </SectionContainer>
  )
}
