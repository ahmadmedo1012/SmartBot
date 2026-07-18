import { cn } from "@/lib/utils"

interface GlowPoolProps {
  position?: string
  size?: string
  color?: string
  className?: string
}

export function GlowPool({ position = "top-0 start-0", size = "size-80 sm:size-96", color = "orange", className }: GlowPoolProps) {
  const [colorName, opacity = "30"] = color.split("/")

  return (
    <div
      className={cn("glow-pool", position, size, className)}
      style={{
        background: `radial-gradient(circle, color-mix(in oklch, var(--${colorName}) ${opacity}%, transparent) 0%, transparent 70%)`,
      }}
      aria-hidden="true"
    />
  )
}
