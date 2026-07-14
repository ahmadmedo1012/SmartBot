import { MessageCircle } from "lucide-react"

export default function FloatingWhatsApp({ phone }) {
  const number = phone || process.env.REACT_APP_WHATSAPP_NUMBER || ""
  if (!number) return null

  return (
    <a
      href={`https://wa.me/${number.replace(/^\+/, "")}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-24 left-4 sm:left-6 z-[60] size-14 rounded-full flex items-center justify-center animate-fade-in"
      style={{
        background: "var(--accent)",
        color: "var(--accent-fg)",
        boxShadow: "0 8px 32px color-mix(in oklch, var(--accent) 35%, transparent)",
        animationDelay: "3s",
        animationFillMode: "both",
      }}
      aria-label="تواصل عبر واتساب"
    >
      <MessageCircle className="size-7" />
    </a>
  )
}
