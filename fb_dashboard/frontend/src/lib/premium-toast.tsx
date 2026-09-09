"use client"

import { toast } from "sonner"
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  LogOut,
  LogIn,
  Gift,
  RefreshCw,
  Save,
  Trash2,
  Copy,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import AnimatedX from "@/components/ui/x-icon"
import { cn } from "@/lib/utils"

/* Ported from Smart-Menu (smart-link.ly shared identity) — identical
   toast card: icon chip + title/description + dismiss, RTL, slide-up.
   The Lottie "cart" animation variant is a Smart-Menu-only menu-page
   feature (dotlottie dep) and is intentionally not ported. */

/* v17-E-F4 (D3 #1/#3/#5): state-icon system unified with the rest of the
   app — success renders CheckCircle2 (the newer lucide glyph already used
   by input/payment-status/wizard, so the payment journey shows ONE success
   shape), and the warning variant renders AlertTriangle (was Star — a
   decorative rating glyph carrying a warning semantic). login/logout are
   directional action icons (arrow entering/leaving a door bracket) and get
   the same rtl:-scale-x-100 mirror the sidebar's LogOut already uses
   (v7 §2.2 allowlist: non-arrow directional icons imported directly with
   the flip class — see directional-icon.tsx header). */
type ToastIcon = "success" | "error" | "info" | "warning" | "login" | "logout" | "gift" | "refresh" | "save" | "trash" | "copy"

type ToastIconConfig = {
  icon: LucideIcon
  bg: string
  color: string
  /** directional glyphs (LogIn/LogOut) mirror in RTL — v17-E-F4 */
  flip?: boolean
}

const iconConfig: Record<ToastIcon, ToastIconConfig> = {
  success: { icon: CheckCircle2, bg: "bg-success/12", color: "var(--success, oklch(0.62 0.18 145))" },
  error: { icon: AlertCircle, bg: "bg-destructive/12", color: "var(--destructive, oklch(0.6 0.22 25))" },
  info: { icon: Info, bg: "bg-accent", color: "var(--accent-foreground, oklch(0.55 0.19 45))" },
  warning: { icon: AlertTriangle, bg: "bg-warning/12", color: "var(--warning, oklch(0.7 0.16 80))" },
  login: { icon: LogIn, flip: true, bg: "bg-success/12", color: "var(--success, oklch(0.62 0.18 145))" },
  logout: { icon: LogOut, flip: true, bg: "bg-muted", color: "var(--muted-foreground)" },
  gift: { icon: Gift, bg: "bg-accent", color: "var(--accent-foreground, oklch(0.55 0.19 45))" },
  refresh: { icon: RefreshCw, bg: "bg-accent", color: "var(--accent-foreground, oklch(0.55 0.19 45))" },
  save: { icon: Save, bg: "bg-success/12", color: "var(--success, oklch(0.62 0.18 145))" },
  trash: { icon: Trash2, bg: "bg-destructive/12", color: "var(--destructive, oklch(0.6 0.22 25))" },
  copy: { icon: Copy, bg: "bg-accent", color: "var(--accent-foreground, oklch(0.55 0.19 45))" },
}

function ToastIconChip({ icon }: { icon: ToastIcon }) {
  const cfg = iconConfig[icon]
  const Icon = cfg.icon
  return (
    <div className={cn("size-10 min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center shrink-0", cfg.bg)}>
      <Icon className={cn("size-[18px]", cfg.flip && "rtl:-scale-x-100")} style={{ color: cfg.color }} aria-hidden="true" />
    </div>
  )
}

/* v12-E4.4: ARIA role split by severity — the error family (destructive
 * outcomes the user must hear immediately) announces with role="alert"
 * (implicit aria-live="assertive"); every other variant (success/info/…)
 * is a polite status update with role="status" (implicit aria-live="polite").
 * The old explicit aria-live="polite" next to role="alert" was redundant AND
 * self-contradictory (it downgraded the assertive role to polite). */
const ALERT_ICONS: readonly ToastIcon[] = ["error", "trash"]

export function premiumToast(icon: ToastIcon, title: string, description?: string, opts?: { duration?: number }) {
  return toast.custom(
    (t) => (
      <div
        role={ALERT_ICONS.includes(icon) ? "alert" : "status"}
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

/* v8-C3: ONE toast language. 107 raw sonner `toast.success/error/info` calls
 * across 22 files rendered sonner's default LTR card (white in dark mode,
 * sonner's own palette, English dismiss affordances) next to the branded
 * RTL premiumToast card — two competing visual languages on the same screen.
 * `brandedToast` keeps the ergonomic `.success()/.error()` call shape so the
 * migration is mechanical, but every call renders the branded card. */
export const brandedToast = {
  success: (title: string, description?: string) => premiumToast("success", title, description),
  error: (title: string, description?: string) => premiumToast("error", title, description),
  info: (title: string, description?: string) => premiumToast("info", title, description),
  warning: (title: string, description?: string) => premiumToast("warning", title, description),
  login: (title: string, description?: string) => premiumToast("login", title, description),
  logout: (title: string, description?: string) => premiumToast("logout", title, description),
  save: (title: string, description?: string) => premiumToast("save", title, description),
  trash: (title: string, description?: string) => premiumToast("trash", title, description),
  copy: (title: string, description?: string) => premiumToast("copy", title, description),
}
