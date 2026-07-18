"use client"

import { motion } from "framer-motion"
import { springDefault, springSnappy } from "@/lib/motion"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { BENEFITS } from "@/components/landing/landing-data"

export default function FeaturesSection() {
  return (
    <SectionContainer>
      <SectionHeader
        eyebrow="إليك ما يمكنك تحقيقه معنا"
        title="ميزات متكاملة لإدارة صفحاتك"
        subtitle="كل ما تحتاجه لإدارة صفحات فيسبوك بكفاءة واحترافية"
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {BENEFITS.map((feat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ ...springDefault, delay: i * 0.06 }}
            whileHover={{ y: -5, transition: springSnappy }}
            className={`group rounded-sm bg-card border p-4 md:p-6 transition-colors duration-300 ${
              i === 0 ? "border-orange/30" : "border-border/50 hover:border-orange/30"
            }`}
          >
            <div className="relative">
              {i === 0 && (
                <span className="absolute -top-3 -end-3 text-[10px] font-bold px-2 py-0.5 rounded-sm bg-orange text-white">
                  الأكثر طلباً
                </span>
              )}
              <div className={`size-10 sm:size-12 rounded-sm flex items-center justify-center mb-4 transition-colors duration-300 ${
                i === 0 ? "bg-orange/15" : "bg-orange/10 group-hover:bg-orange/20"
              }`}>
                <feat.icon className="size-5 sm:size-6 text-orange" />
              </div>
            </div>
            <h3 className="text-base sm:text-lg font-medium mb-2">{feat.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
          </motion.div>
        ))}
      </div>
    </SectionContainer>
  )
}
