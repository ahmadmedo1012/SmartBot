"use client"

import { toast } from "sonner"
import {
  CheckCircle,
  AlertCircle,
  Info,
  LogOut,
  LogIn,
  Star,
  Gift,
  RefreshCw,
  Save,
  Trash2,
  Copy,
} from "lucide-react"
import AnimatedX from "@/components/ui/x-icon"
import { cn } from "@/lib/utils"

/* Ported from Smart-Menu (smart-link.ly shared identity) — identical
   toast card: icon chip + title/description + dismiss, RTL, slide-up.
   The Lottie "cart" animation variant is a Smart-Menu-only menu-page
   feature (dotlottie dep) and is intentionally not ported. */

type ToastIcon = "success" | "error" | "info" | "login" | "logout" | "star" | "gift" | "refresh" | "save" | "trash" | "copy"

const iconConfig = {
  success: { icon: CheckCircle, bg: "bg-success/12", color: "var(--success, oklch(0.62 0.18 145))" },
  error: { icon: AlertCircle, bg: "bg-destructive/12", color: "var(--destructive, oklch(0.6 0.22 25))" },
  info: { icon: Info, bg: "bg-accent", color: "var(--orange, oklch(0.55 0.19 45))" },
  login: { icon: LogIn, bg: "bg-success/12", color: "var(--success, oklch(0.62 0.18 145))" },
  logout: { icon: LogOut, bg: "bg-muted", color: "var(--muted-foreground)" },
  star: { icon: Star, bg: "bg-warning/12", color: "var(--warning, oklch(0.7 0.16 80))" },
  gift: { icon: Gift, bg: "bg-accent", color: "var(--orange, oklch(0.55 0.19 45))" },
  refresh: { icon: RefreshCw, bg: "bg-accent", color: "var(--orange, oklch(0.55 0.19 45))" },
  save: { icon: Save, bg: "bg-success/12", color: "var(--success, oklch(0.62 0.18 145))" },
  trash: { icon: Trash2, bg: "bg-destructive/12", color: "var(--destructive, oklch(0.6 0.22 25))" },
  copy: { icon: Copy, bg: "bg-accent", color: "var(--orange, oklch(0.55 0.19 45))" },
} as const

function ToastIconChip({ icon }: { icon: ToastIcon }) {
  const cfg = iconConfig[icon]
  const Icon = cfg.icon
  return (
    <div className={cn("size-10 min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center shrink-0", cfg.bg)}>
      <Icon className="size-[18px]" style={{ color: cfg.color }} aria-hidden="true" />
    </div>
  )
}

export function premiumToast(icon: ToastIcon, title: string, description?: string, opts?: { duration?: number }) {
  return toast.custom(
    (t) => (
      <div
        role="alert"
        aria-live="polite"
        onClick={() => toast.dismiss(t)}
        className="pointer-events-auto flex w-full cursor-pointer items-start gap-3 rounded-lg border border-border/40 bg-card/95 p-4 shadow-xl backdrop-blur-xl rtl:flex-row-reverse animate-slide-up"
        style={{ animationDuration: "0.35s" }}
      >
        <ToastIconChip icon={icon} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            toast.dismiss(t)
          }}
          className="shrink-0 size-8 min-h-[32px] min-w-[32px] rounded-md flex items-center justify-center hover:bg-muted transition-colors opacity-40 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring/50"
          aria-label="إغلاق"
        >
          <AnimatedX className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
    ),
    { duration: opts?.duration ?? 4000 },
  )
}
