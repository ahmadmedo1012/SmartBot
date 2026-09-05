"use client"

import { useEffect, useState } from "react"
import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useConfig } from "@/hooks/useConfig"

const WHATSAPP_FALLBACK = "218910089975"

export default function FloatingWhatsApp() {
  const [visible, setVisible] = useState(false)
  const { config } = useConfig()
  const waNumber = String(config.support_whatsapp || config.whatsapp_number || WHATSAPP_FALLBACK).replace(/[^0-9]/g, "")

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <a
      href={`https://wa.me/${waNumber}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("fixed bottom-6 end-6 z-50 size-14 rounded-full bg-orange text-orange-foreground flex items-center justify-center shadow-lg shadow-orange/30 hover:brightness-110 transition-all hover:-translate-y-1")}
      aria-label="تواصل عبر واتساب"
    >
      <MessageCircle className="size-6" />
    </a>
  )
}
