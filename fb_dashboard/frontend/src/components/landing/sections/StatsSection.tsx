"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { ScrollReveal } from "@/components/ui/scroll-reveal"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { usePublicStats } from "@/lib/usePublicStats"
import { formatNumber } from "@/lib/format"
import { useCountUp } from "@/hooks/useCountUp"

/* v6+ — framer-free: useInView replaced by a tiny IO hook, motion.div by
 * ScrollReveal (CSS tween). The count-up logic itself never needed framer. */
function useInViewOnce<T extends HTMLElement>(ref: React.RefObject<T | null>): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return inView
}

function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInViewOnce(ref)
  /* v17-E-F11 (D2-P2): the landing counter's private setInterval stepper
   * (≈30×30ms linear) is replaced by the shared count-up engine — ONE
   * 800ms easeOutCubic curve and ONE reduced-motion rule (final value
   * immediately, no ticking — v14-E5/D2-M6 behavior kept) for the whole
   * app, identical to KpiCard. The in-view gate stays here: it pauses the
   * shared counter until the stat scrolls into view. */
  const count = useCountUp(value, { paused: !inView })
  // v6 §A — was count.toLocaleString() with NO locale: the animated landing counter
  // rendered per-visitor-browser format while every other number in the app was "ar-LY".
  return <span ref={ref} dir="ltr">{formatNumber(count)}</span>
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
            <ScrollReveal
              key={item.label}
              y={30}
              delay={i * 100}
              duration={0.5}
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
                {/* v14-E5 (D4 H-03): /80 measured 3.89:1 (dark) / 4.08:1 (light)
                    on the glass-strong surface — full muted passes
                    (5.64:1 / 6.51:1, measured on the same composite). */}
                <div className="text-xs sm:text-sm font-medium text-muted-foreground">{item.label}</div>
              </div>
            </ScrollReveal>
          ))}
        </div>
        <div className="mx-auto mt-6 w-16 h-[2px] rounded-full bg-gradient-to-r from-accent-foreground/0 via-accent-foreground to-accent-foreground/0" />
      </div>
    </SectionContainer>
  )
}
