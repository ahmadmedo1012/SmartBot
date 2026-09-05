"use client"

import AnimatedMessageCircle from "@/components/ui/message-circle-icon"
import { cn } from "@/lib/utils"
import { useConfig } from "@/hooks/useConfig"

/* Smart-Menu visual treatment (final-launch plan v3 §2.4 port): safe-area
 * offset, token-aware shadow tiers (shadow-xl → hover:shadow-2xl
 * shadow-orange/30→/40), targeted 300ms transition, animate-fade-in with 3s
 * delay, and the animated message-circle icon. Data layer stays SmartBot:
 * phone resolves from /api/config (SystemConfig) with env fallback. */
const WHATSAPP_FALLBACK = "218910089975"

export default function FloatingWhatsApp() {
  const { config } = useConfig()
  const waNumber = String(config.support_whatsapp || config.whatsapp_number || WHATSAPP_FALLBACK).replace(/[^0-9]/g, "")
  if (!waNumber) return null

  return (
    <a
      href={`https://wa.me/${waNumber}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] end-4 sm:end-6 z-[60]",
        "size-14 rounded-full bg-orange text-white",
        "flex items-center justify-center",
        "shadow-xl shadow-orange/30",
        "hover:bg-orange/90 hover:scale-105 hover:shadow-2xl hover:shadow-orange/40",
        "transition-[background-color,transform,translate,scale,rotate,box-shadow] duration-300",
        "animate-fade-in"
      )}
      aria-label="تواصل عبر واتساب"
      style={{ animationDelay: "3s", animationFillMode: "both" }}
    >
      <AnimatedMessageCircle className="size-7" />
    </a>
  )
}
