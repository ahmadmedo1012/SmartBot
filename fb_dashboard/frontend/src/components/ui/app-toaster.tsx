"use client"

import { useTheme } from "next-themes"
import { Toaster } from "sonner"

/* v8-C3/D9: themed Toaster.
 * Problems fixed:
 * 1. sonner defaults to theme="light" — dark-mode users got WHITE toasts.
 * 2. No dir — toasts rendered LTR on the RTL app (icon/arrow side flipped).
 * 3. richColors used sonner's fixed palette, not our AA-tuned status tokens.
 * The branded card (premiumToast / brandedToast) renders via toast.custom and
 * carries its own token styling; this Toaster shell now matches the app theme
 * and direction for any remaining default-rendered toasts.
 *
 * r131-F7 — TOASTER CANON (fleet ruling "toasts bottom-end"):
 * position top-center → bottom-left. Sonner positions are PHYSICAL; the app
 * is RTL-only (dir=rtl on <html>), so physical LEFT = the inline-END corner
 * — the canonical bottom-end stack (madarek .toast-stack: inset-block-end +
 * inset-inline-end). On <600px sonner docks full-width above the viewport
 * bottom (mobile bottom-center behavior, clearing the bottom-nav via the
 * default mobile offsets). Entrance rides the retuned slide-up (12px/240ms
 * decelerate — globals.css), padding 8 → 12/16px (madarek .toast sp-3/sp-4),
 * default duration 5000 → 4000 (the polite 4s family rung; error cards pass
 * Infinity for manual dismiss at the call site). */
export function AppToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      position="bottom-left"
      dir="rtl"
      /* v12-E4.4: sonner's default container label is the English
       * "Notifications" — screen-reader-only English on an all-Arabic app.
       * The per-card roles live on premiumToast's custom card
       * (role=alert for errors, role=status otherwise). */
      containerAriaLabel="الإشعارات"
      theme={resolvedTheme === "light" ? "light" : "dark"}
      duration={4000}
      toastOptions={{
        style: {
          background: "var(--card)",
          color: "var(--card-foreground)",
          border: "1px solid var(--border)",
          /* r131-F7: the canonical toast entrance — 12px slide+fade on the
           * 240ms medium rung, decelerate (madarek-toast-in twin; was the
           * 520ms --t-slow). Reduced motion: globals.css zeroes the ladder. */
          animation: "slide-up var(--motion-duration-medium, 240ms) var(--motion-ease-decelerate, cubic-bezier(0.16, 1, 0.3, 1)) both",
          borderRadius: "var(--radius-lg)",
          padding: "12px 16px",
        },
      }}
    />
  )
}
