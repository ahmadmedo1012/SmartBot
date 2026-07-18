"use client"

import { motion } from "framer-motion"
import { STEPS } from "@/components/landing/landing-data"
import { springGentle, springSnappy } from "@/lib/motion"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"

export default function HowItWorksSection() {
  return (
    <SectionContainer>
      <SectionHeader title="كيف يعمل SmartBot" subtitle="ثلاث خطوات فقط لبدء أتمتة ردودك" />

      <div className="grid md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 32, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ ...springGentle, delay: i * 0.15 }}
            className="relative flex flex-col items-center text-center group"
          >
            <div className="relative mb-4">
              <div className="absolute inset-0 size-18 sm:size-22 rounded-full bg-orange/20 blur-md group-hover:blur-lg transition-all duration-500" />
              <div className="relative size-18 sm:size-22 rounded-full bg-gradient-to-b from-orange/30 to-orange/15 border border-orange/30 flex items-center justify-center group-hover:border-orange/40 group-hover:scale-105 transition-all duration-500">
                <span className="text-2xl sm:text-3xl font-bold text-orange">{step.num}</span>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, rotate: 45 }}
              whileInView={{ opacity: 1, rotate: 45 }}
              viewport={{ once: true }}
              transition={{ ...springSnappy, delay: 0.25 + i * 0.15 }}
              className="size-1.5 bg-orange/40 rounded-sm mb-3"
            />

            <h3 className="text-base sm:text-lg font-medium mb-1.5 group-hover:text-orange transition-colors duration-300">
              {step.title}
            </h3>
            <p className="text-sm text-muted-foreground/80 leading-relaxed max-w-[30ch]">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </SectionContainer>
  )
}
