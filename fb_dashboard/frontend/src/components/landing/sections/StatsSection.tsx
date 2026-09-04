"use client"

import { useState, useEffect, useRef } from "react"
import { motion, useInView } from "framer-motion"
import { Loader2 } from "lucide-react"
import { springSnappy } from "@/lib/motion"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { apiFetch } from "@/lib/csrf-client"

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

interface PublicStats {
  activeTenants?: number
  totalReplies?: number
  totalPages?: number
  activeUsers30d?: number
  uptimePercent?: number
}

export default function StatsSection() {
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/public/stats", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) setStats(d.data)
        else setError(true)
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(true)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  // Fallback for static brand claims — these are qualitative messaging, not DB metrics
  const items = [
    {
      value: loading ? 0 : (stats?.activeTenants ?? stats?.totalPages ?? 0),
      suffix: "+",
      label: "صفحة نشطة",
      fallback: 0,
    },
    {
      value: loading ? 0 : (stats?.totalReplies ?? 0),
      suffix: "+",
      label: "رد تلقائي",
      fallback: 0,
    },
    { value: 98, suffix: "%", label: "معدل رضا", fallback: 98 },
    { value: 24, suffix: "/7", label: "دعم فني", fallback: 24 },
  ]

  if (error) {
    return (
      <SectionContainer>
        <div className="glass-strong rounded-2xl mx-auto max-w-4xl p-6 sm:p-8">
          <div className="text-center text-xs text-muted-foreground">
            لا يمكن تحميل الإحصائيات في الوقت الحالي
          </div>
        </div>
      </SectionContainer>
    )
  }

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
                  <span className="text-orange">
                    {loading ? (
                      <span className="inline-flex items-center gap-1 text-[1rem]">
                        <Loader2 className="size-4 animate-spin" />
                      </span>
                    ) : (
                      <AnimatedNumber value={item.fallback} />
                    )}
                    {item.suffix}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-medium text-muted-foreground/80">{item.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="mx-auto mt-6 w-16 h-[2px] rounded-full bg-gradient-to-r from-orange/0 via-orange to-orange/0" />
      </div>
    </SectionContainer>
  )
}
