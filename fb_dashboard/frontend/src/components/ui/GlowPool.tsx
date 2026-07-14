import { cn } from "@/lib/utils"

interface GlowPoolProps {
  position?: string
  size?: string
  color?: string
  className?: string
}

export function GlowPool({ position = "top-0 start-0", size = "size-80 sm:size-96", color = "orange/30", className }: GlowPoolProps) {
  return (
    <div
      className={cn("glow-pool", position, size, className)}
      style={{ background: `radial-gradient(circle, oklch(var(--${color.replace(/\//, "-alpha")})) 0%, transparent 70%)` }}
      aria-hidden="true"
    />
  )
}
