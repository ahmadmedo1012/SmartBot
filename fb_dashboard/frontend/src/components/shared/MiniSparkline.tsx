"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

/* Ported from Smart-Menu (world-class launch plan v3 §6.2) —
 * framer-motion import instead of motion/react (same API). */

interface MiniSparklineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
}

export function MiniSparkline({
  data,
  width = 80,
  height = 28,
  className,
}: MiniSparklineProps) {
  if (data.length < 2) return null

  const maxVal = Math.max(...data, 1)
  const minVal = Math.min(...data, 0)
  const range = maxVal - minVal || 1
  const padding = 2
  const chartW = width - padding * 2
  const chartH = height - padding * 2

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * chartW,
    y: padding + chartH - ((v - minVal) / range) * chartH,
  }))

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")

  const isUp = data[data.length - 1] >= data[0]
  const trendColor = isUp
    ? "var(--success, oklch(0.62 0.18 145))"
    : "var(--destructive, oklch(0.6 0.22 25))"

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("shrink-0", className)} role="img" aria-label={isUp ? "اتجاه صاعد" : "اتجاه هابط"}>
      <defs>
        <linearGradient id={`spark-${width}-${isUp ? "up" : "dn"}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.14 75)" stopOpacity={0.25} />
          <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Area */}
      <motion.path
        d={`${path} L ${points[points.length - 1].x} ${padding + chartH} L ${points[0].x} ${padding + chartH} Z`}
        fill={`url(#spark-${width}-${isUp ? "up" : "dn"})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />
      {/* Line */}
      <motion.path
        d={path}
        fill="none"
        stroke={trendColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      />
    </svg>
  )
}
