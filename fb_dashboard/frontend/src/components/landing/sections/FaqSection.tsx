"use client"

import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { FAQS } from "@/components/landing/landing-data"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { springGentle } from "@/lib/motion"

export default function FaqSection() {
  return (
    <SectionContainer>
      <SectionHeader
        title="أسئلة شائعة"
        subtitle="إجابات سريعة لأكثر الأسئلة تردداً"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ ...springGentle, delay: 0.05 }}
        className="max-w-2xl mx-auto space-y-3"
      >
        {FAQS.map((faq, i) => (
          <details
            key={i}
            className="group rounded-sm border border-border/40 bg-card open:border-border/60 transition-all duration-200 overflow-hidden"
          >
            <summary className="flex items-center justify-between cursor-pointer text-sm sm:text-base font-medium list-none px-4 sm:px-5 py-3 sm:py-4">
              {faq.q}
              <ChevronDown className="size-3 text-muted-foreground/50 group-open:rotate-180 transition-transform duration-300 shrink-0 ms-2" />
            </summary>
            <div className="grid grid-rows-[0fr] group-open:grid-rows-[1fr] transition-all duration-300">
              <div className="overflow-hidden">
                <p className="px-4 sm:px-5 pb-3 sm:pb-4 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {faq.a}
                </p>
              </div>
            </div>
          </details>
        ))}
      </motion.div>
    </SectionContainer>
  )
}
