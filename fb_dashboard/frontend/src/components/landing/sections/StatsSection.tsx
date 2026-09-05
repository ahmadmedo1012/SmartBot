"use client"

import { useState, useEffect, useRef } from "react"
import { motion, useInView } from "framer-motion"
import { Loader2 } from "lucide-react"
import { springSnappy } from "@/lib/motion"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { usePublicStats } from "@/lib/usePublicStats"

function AnimatedNumber({ value }: { value: number }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  useEffect(() => {
    if (!inView || value <= 0) return
    const step = Math.max(1, Math.ceil(value / 30))
    const timer = setInterval(() => {
      setCount((prev) => Math.min(prev + step, value))
    }, 30)
    return () => clearInterval(timer)
  }, [inView, value])
  return <span ref={ref} dir="ltr">{count.toLocaleString()}</span>
}

export default function StatsSection() {
  // Plan §3.1: numbers are REAL from /api/public/stats — never hardcoded.
  const { stats, ready } = usePublicStats()
  const loading = !ready

  // 24/7 support is an operational commitment, not a metric — allowed to stay.
  // The old hardcoded satisfaction-rate figure was REMOVED per plan;
  // uptime comes from the stats API.
  const items = [
    {
      value: stats?.activeTenants ?? stats?.totalPages ?? 0,
      suffix: "+",
      label: "صفحة نشطة",
    },
    {
      value: stats?.totalReplies ?? 0,
      suffix: "+",
      label: "رد تلقائي",
    },
    {
      value: Math.round(stats?.uptimePercent ?? 0),
      suffix: "%",
      label: "جاهزية النظام",
    },
    {
      value: 24,
      suffix: "/7",
      label: "دعم فني",
    },
  ]

  // "never fake" (usePublicStats.ts): when the API is unreachable we show a
  // qualitative marker instead of a misleading "0+" (plan v3 §7c).
  const zero = !loading && items.every((it) => it.value === 0)

  return (
    <SectionContainer>
      <div className="glass-strong rounded-2xl mx-auto max-w-4xl p-6 sm:p-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {items.map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...springSnappy, delay: i * 0.1 }}
            >
              <div className="text-center">
                <div className="text-[2.25rem] sm:text-[2.75rem] md:text-[3.25rem] font-bold leading-none mb-2">
                  <span className="text-accent-foreground">
                    {loading ? (
                      <span className="inline-flex items-center gap-1 text-[1rem]">
                        <Loader2 className="size-4 animate-spin" />
                      </span>
                    ) : zero ? (
                      <span className="text-[1.5rem]">—</span>
                    ) : (
                      <AnimatedNumber value={item.value} />
                    )}
                    {!zero && item.suffix}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-medium text-muted-foreground/80">{item.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mx-auto mt-6 w-16 h-[2px] rounded-full bg-gradient-to-r from-accent-foreground/0 via-accent-foreground to-accent-foreground/0" />
      </div>
    </SectionContainer>
  )
}
