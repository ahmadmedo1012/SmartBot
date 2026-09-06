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
 * and direction for any remaining default-rendered toasts. */
export function AppToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      position="top-center"
      dir="rtl"
      theme={resolvedTheme === "light" ? "light" : "dark"}
      duration={5000}
      toastOptions={{
        style: {
          background: "var(--card)",
          color: "var(--card-foreground)",
          border: "1px solid var(--border)",
          animation: "slide-up 0.35s cubic-bezier(0.16, 1, 0.2, 1)",
          borderRadius: "var(--radius-lg)",
          padding: "8px",
        },
      }}
    />
  )
}
