"use client"

import { motion } from "framer-motion"
import { springDefault, springSnappy } from "@/lib/motion"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { BENEFITS } from "@/components/landing/landing-data"
import { ArrowUpRight, Bot, Zap, BarChart3 } from "lucide-react"

// Bento grid classes — first item large, others compact
const bentoLayout = [
  "lg:col-span-2 lg:row-span-2",  // 0: large feature
  "lg:col-span-2",                  // 1
  "lg:col-span-2",                  // 2
  "lg:col-span-1",                  // 3
  "lg:col-span-1",                  // 4
  "lg:col-span-1",                  // 5
  "lg:col-span-1",                  // 6
  "lg:col-span-2",                  // 7
]

export default function FeaturesSection() {
  return (
    <SectionContainer>
      <SectionHeader
        eyebrow="الميزات"
        title="كل ما تحتاجه لإدارة صفحاتك"
        subtitle="منصة متكاملة تجمع بين الذكاء الاصطناعي وسهولة الاستخدام"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-[minmax(180px,auto)] gap-3 sm:gap-4">
        {BENEFITS.map((feat, i) => {
          const isLarge = i === 0
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ ...springDefault, delay: i * 0.05 }}
              whileHover={{ y: -3, transition: springSnappy }}
              className={`group relative ${bentoLayout[i]} rounded-2xl bg-card border p-5 sm:p-6 transition-all duration-500 overflow-hidden ${
                isLarge
                  ? "border-accent-foreground/30 bg-gradient-to-br from-accent-foreground/[0.04] via-card to-card"
                  : "border-border/50 hover:border-accent-foreground/30"
              }`}
            >
              {/* Decorative gradient corner for large card */}
              {isLarge && (
                <>
                  <div className="absolute -top-20 -end-20 size-48 rounded-full bg-accent-foreground/10 blur-3xl pointer-events-none" aria-hidden="true" />
                  <div className="absolute top-4 end-4 text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary text-white flex items-center gap-1">
                    <Zap className="size-2.5 fill-white" />
                    الأكثر طلباً
                  </div>
                </>
              )}

              <div className="relative h-full flex flex-col">
                <div className={`size-10 sm:size-11 rounded-xl flex items-center justify-center mb-4 transition-all duration-300 ${
                  isLarge ? "bg-accent-foreground/15 scale-110" : "bg-accent-foreground/10 group-hover:bg-accent-foreground/15 group-hover:scale-110"
                }`}>
                  <feat.icon className="size-5 text-accent-foreground" />
                </div>

                <h3 className={`font-bold mb-1.5 ${isLarge ? "text-xl sm:text-2xl" : "text-base sm:text-lg"}`}>
                  {feat.title}
                </h3>
                <p className={`text-muted-foreground leading-relaxed flex-1 ${isLarge ? "text-sm sm:text-base" : "text-sm"}`}>
                  {feat.desc}
                </p>

                {/* Footer for large card — illustrative */}
                {isLarge && (
                  <div className="mt-5 pt-4 border-t border-accent-foreground/10 grid grid-cols-3 gap-2">
                    {[
                      { icon: Bot, value: "< ٢ث", label: "زمن الرد" },
                      { icon: BarChart3, value: "٩٤٪", label: "دقة" },
                      { icon: Zap, value: "٢٤/٧", label: "متاح" },
                    ].map((m, idx) => (
                      <div key={idx} className="text-center">
                        <m.icon className="size-3 text-accent-foreground mx-auto mb-1" />
                        <div className="text-sm font-bold text-accent-foreground leading-none">{m.value}</div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">{m.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Hover arrow for compact cards */}
                {!isLarge && (
                  <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-accent-foreground transition-all duration-300">
                    <span>اعرف المزيد</span>
                    <ArrowUpRight className="size-3 rtl:-scale-x-100" />
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </SectionContainer>
  )
}
