import { cn } from "@/lib/utils"

interface EyebrowProps {
  children: React.ReactNode
  className?: string
}

export function Eyebrow({ children, className }: EyebrowProps) {
  return <span className={cn("eyebrow", className)}>{children}</span>
}
