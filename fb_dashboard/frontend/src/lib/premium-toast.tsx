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

/* Ported from Smart-Menu (smart-link.ly shared identity) — icon chip +
   title/description + dismiss, RTL, slide-up.

   r131-F7 — TOASTER CANON (fleet ruling R131-W1 "toasts bottom-end +
   hairline + 28px well"; madarek notifications.css as the reference):
     · quiet surface: SOLID bg-card + 1px border hairline — the glassy
       bg-card/95 + backdrop-blur-xl + shadow-xl combo is retired
       (Madarek's toast contract forbids glass on toasts).
     · 1px STATUS HAIRLINE on the reading-start edge (border-inline-start)
       coded per kind — the old single neutral border carried no signal.
     · 28px pastel well (was 40px alpha wash): --*-soft ground + the
       r131 --*-ink glyph tier (WCAG-pinned both themes). Status channels
       map to their status pastels (mint/yellow/rose/sky — info leaves the
       gold slab for the canonical sky family); gift keeps the brand gold
       on the copper pastel pair; logout stays grey.
     · error/trash (ALERT_ICONS) = MANUAL DISMISS (duration Infinity) —
       madarek doctrine: failures must not vanish unread (A11 SB-4).
     · entrance = the canonical 12px slide+fade @ 240ms decelerate
       (.animate-slide-up retuned in globals.css — was 24px/520ms).
     · the card is PASSIVE: click-anywhere dismiss removed (madarek
       contract — accidental taps during scroll killed error toasts);
       the X affordance and sonner swipe stay the dismiss paths.
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
  /** 28px pastel well ground (soft/family token) */
  well: string
  /** glyph ink — the r131 -ink text tier (AA in both themes) */
  ink: string
  /** 1px reading-start hairline color (status signal) */
  hairline: string
  /** directional glyphs (LogIn/LogOut) mirror in RTL — v17-E-F4 */
  flip?: boolean
}

const iconConfig: Record<ToastIcon, ToastIconConfig> = {
  success: { icon: CheckCircle2, well: "bg-success-soft", ink: "var(--success-ink)", hairline: "var(--success)" },
  error: { icon: AlertCircle, well: "bg-destructive-soft", ink: "var(--destructive-ink)", hairline: "var(--destructive)" },
  info: { icon: Info, well: "bg-info-soft", ink: "var(--info-ink)", hairline: "var(--info)" },
  warning: { icon: AlertTriangle, well: "bg-warning-soft", ink: "var(--warning-ink)", hairline: "var(--warning)" },
  login: { icon: LogIn, flip: true, well: "bg-success-soft", ink: "var(--success-ink)", hairline: "var(--success)" },
  logout: { icon: LogOut, flip: true, well: "bg-muted", ink: "var(--muted-foreground)", hairline: "var(--border)" },
  /* gift keeps the brand gold — on the copper pastel pair (soft ground +
     copper ink) instead of the old alpha slab. */
  gift: { icon: Gift, well: "bg-(--c-copper-bg)", ink: "var(--c-copper-ink)", hairline: "var(--accent-foreground)" },
  refresh: { icon: RefreshCw, well: "bg-info-soft", ink: "var(--info-ink)", hairline: "var(--info)" },
  save: { icon: Save, well: "bg-success-soft", ink: "var(--success-ink)", hairline: "var(--success)" },
  trash: { icon: Trash2, well: "bg-destructive-soft", ink: "var(--destructive-ink)", hairline: "var(--destructive)" },
  copy: { icon: Copy, well: "bg-info-soft", ink: "var(--info-ink)", hairline: "var(--info)" },
}

function ToastIconChip({ icon }: { icon: ToastIcon }) {
  const cfg = iconConfig[icon]
  const Icon = cfg.icon
  return (
    /* r131: 40px wash chip → the canonical 28px pastel well (madarek
       .toast-icon — inline-size 28px, r-md 10px). */
    <div className={cn("size-7 rounded-md flex items-center justify-center shrink-0", cfg.well)}>
      <Icon className={cn("size-4", cfg.flip && "rtl:-scale-x-100")} style={{ color: cfg.ink }} aria-hidden="true" />
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
        className="pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-(--shadow-card-h) rtl:flex-row-reverse animate-slide-up"
        /* r131-F7: 1px status hairline on the reading-start edge (the
           inline-start side of the RTL card) — per-kind signal color. */
        style={{ borderInlineStartColor: iconConfig[icon].hairline }}
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
    {
      /* r131-F7 (A11 SB-4): error/trash = MANUAL DISMISS (Infinity) —
       * failures must not auto-vanish while the user is mid-read; every
       * other kind keeps the 4s polite default. */
      duration: opts?.duration ?? (ALERT_ICONS.includes(icon) ? Infinity : 4000),
    },
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
