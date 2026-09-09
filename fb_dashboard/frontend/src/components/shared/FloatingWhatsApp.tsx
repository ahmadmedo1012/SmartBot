"use client"

import { useEffect, useState } from "react"
import AnimatedMessageCircle from "@/components/ui/message-circle-icon"
import { cn } from "@/lib/utils"
import { useConfig } from "@/hooks/useConfig"

/* Smart-Menu visual treatment (final-launch plan v3 §2.4 port): safe-area
 * offset, token-aware shadow tiers (shadow-xl → hover:shadow-2xl
 * shadow-accent-foreground/30→/40), targeted 300ms transition, animate-fade-in with 3s
 * delay, and the animated message-circle icon. Data layer stays SmartBot:
 * phone resolves from /api/config (SystemConfig) with env fallback.
 *
 * v18-1e (mobile 390px pass):
 * - Modal dialogs: the FAB sits in the z-[60] toast layer — one layer
 *   ABOVE the modal (z-50) slot by design (z-index-scale.md), so a fixed
 *   FAB would float over the payment dialog and its «ادفع الآن» CTA.
 *   Rather than inventing an off-scale z-index, the FAB now unmounts
 *   while ANY open [role="dialog"] is in the DOM (useModalDialogOpen
 *   below) — it can never cover modal content, and the link leaves the
 *   Tab order while the dialog's focus trap is active. Verified against:
 *   Base UI Dialog.PaymentDialog (portal unmounts when closed) and the
 *   always-mounted shells (Header mobile menu, MobileBottomNav sheet)
 *   which gate themselves with aria-hidden — filtered out below.
 * - Safe areas: the bottom offset keeps env(safe-area-inset-bottom)+1rem
 *   (browser bar / home indicator); the inline-end offset is now
 *   max(1rem, env(safe-area-inset-left)) so a landscape notch can never
 *   push the FAB under the sensor area (RTL: inline-end = physical
 *   left). ≥16px from every edge at all times.
 * - Page clearance: transient FAB-over-content while scrolling is inherent
 *   to any fixed FAB; the surfaces that end in a tappable CTA carry
 *   bottom padding that clears the 88px FAB zone (PlanSelector's
 *   pb-16, pricing's pb-24) — see worklog v18-1e. */
const WHATSAPP_FALLBACK = "218910089975"

/* An OPEN dialog anywhere in the document. Base UI dialogs unmount their
 * portal when closed; always-mounted shells (Header's mobile menu,
 * MobileBottomNav's sheet) gate themselves with aria-hidden — the
 * :not([aria-hidden="true"]) filter keeps them from matching while shut. */
const OPEN_DIALOG_SELECTOR = '[role="dialog"]:not([aria-hidden="true"])'

function useModalDialogOpen(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const sync = () => setOpen(document.querySelector(OPEN_DIALOG_SELECTOR) !== null)
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-hidden"],
    })
    return () => observer.disconnect()
  }, [])

  return open
}

export default function FloatingWhatsApp() {
  const { config } = useConfig()
  const modalOpen = useModalDialogOpen()
  const waNumber = String(config.support_whatsapp || config.whatsapp_number || WHATSAPP_FALLBACK).replace(/[^0-9]/g, "")
  if (!waNumber) return null
  /* Hidden while a modal dialog owns the screen — see the header comment.
   * Hooks above stay unconditional; this is a render-time bail only. */
  if (modalOpen) return null

  return (
    <a
      href={`https://wa.me/${waNumber}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "fixed bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] z-[60]",
        "end-[max(1rem,env(safe-area-inset-left,0px))] sm:end-[max(1.5rem,env(safe-area-inset-left,0px))]",
        "size-14 rounded-full bg-primary text-white",
        "flex items-center justify-center",
        "shadow-xl shadow-accent-foreground/30",
        "hover:bg-accent-foreground/90 hover:scale-105 hover:shadow-2xl hover:shadow-accent-foreground/40",
        "transition-[background-color,transform,translate,scale,rotate,box-shadow] duration-300",
        "animate-fade-in"
      )}
      aria-label="تواصل عبر واتساب — يفتح في تبويب جديد"
      style={{ animationDelay: "3s", animationFillMode: "both" }}
    >
      <AnimatedMessageCircle className="size-7" />
    </a>
  )
}
