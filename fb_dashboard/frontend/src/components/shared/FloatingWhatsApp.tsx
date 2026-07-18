"use client"

import { useEffect, useState } from "react"
import { MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const WHATSAPP_NUMBER = "218910089975"

export default function FloatingWhatsApp() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("fixed bottom-6 end-6 z-50 size-14 rounded-full bg-orange text-orange-foreground flex items-center justify-center shadow-lg shadow-orange/30 hover:brightness-110 transition-all hover:-translate-y-1")}
      aria-label="تواصل عبر واتساب"
    >
      <MessageCircle className="size-6" />
    </a>
  )
}
