"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { springDefault } from "@/lib/motion"

interface HeaderProps { className?: string }

const landingLinks = [
  { href: "/pricing", label: "الخطط والأسعار" },
  { href: "/demo", label: "تجربة البوت" },
  { href: "/login", label: "تسجيل الدخول" },
]

function HamburgerButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden relative size-11 rounded-lg border border-border flex items-center justify-center hover:bg-orange/20 transition-all duration-200 active:scale-90"
      aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
    >
      <span className="relative size-3.5">
        <span className={cn("absolute inset-x-0 top-[2px] h-[2px] rounded-full bg-foreground transition-all duration-300 origin-center", open && "rotate-45 top-[6px]")} />
        <span className={cn("absolute inset-x-0 top-[6px] h-[2px] rounded-full bg-foreground transition-all duration-300", open && "opacity-0")} />
        <span className={cn("absolute inset-x-0 bottom-[2px] h-[2px] rounded-full bg-foreground transition-all duration-300 origin-center", open && "-rotate-45 bottom-[6px]")} />
      </span>
    </button>
  )
}

const mobileLinkVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { ...springDefault, delay: 0.06 + i * 0.06 } }),
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
}

function MobileMenu({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const hamburgerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (open) {
      hamburgerRef.current = document.activeElement as HTMLButtonElement
      requestAnimationFrame(() => {
        const panel = panelRef.current
        if (!panel) return
        const focusable = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
        if (focusable.length) focusable[0]?.focus()
      })
    } else {
      hamburgerRef.current?.focus()
    }
  }, [open])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return }
    if (e.key !== "Tab") return
    const panel = panelRef.current
    if (!panel) return
    const focusable = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus() } }
    else { if (document.activeElement === last) { e.preventDefault(); first.focus() } }
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    panel.addEventListener("keydown", handleKeyDown)
    return () => panel.removeEventListener("keydown", handleKeyDown)
  }, [open, handleKeyDown])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog" aria-modal="true" aria-label="قائمة التصفح"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed inset-x-0 top-0 z-50 mx-4 mt-4 rounded-sm bg-card border border-border shadow-xl overflow-hidden origin-top-center"
          >
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <img src="/static/brand-icon.png" alt="SmartBot" className="size-9 object-contain rounded-sm" />
                <span className="font-bold text-sm">SmartBot</span>
              </div>
              <button onClick={onClose} className="size-11 rounded-lg border border-border flex items-center justify-center"><X size={16} /></button>
            </div>
            <nav className="p-4 flex flex-col gap-1">
              {landingLinks.map((link, i) => (
                <motion.div key={link.href} custom={i} variants={mobileLinkVariants} initial="hidden" animate="visible" exit="exit">
                  <Link href={link.href} onClick={onClose}
                    className={cn("flex items-center gap-3 p-3 rounded-sm text-sm font-medium transition-colors",
                      pathname === link.href ? "bg-orange/10 text-orange" : "hover:bg-card")}>
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <hr className="border-border/50 my-2" />
              <Link href="/subscribe" onClick={onClose}
                className="block p-3 rounded-sm text-sm font-bold text-center bg-orange text-orange-foreground">
                اشترك الآن
              </Link>
            </nav>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function Header({ className }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <>
      <header className={cn(
        "fixed top-0 inset-x-0 z-30 h-16 transition-all duration-500",
        scrolled ? "bg-background/80 backdrop-blur-2xl border-b border-border/30 shadow-md" : "bg-transparent",
        className
      )}>
        <nav className="max-w-[1220px] mx-auto px-4 sm:px-6 h-full flex items-center gap-6">
          <div className="flex items-center gap-2.5 flex-1">
            <HamburgerButton open={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)} />
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <img src="/static/brand-icon.png" alt="SmartBot" className="size-9 rounded-sm object-contain" style={{ boxShadow: "var(--shadow-glow)" }} />
              <span className="font-bold text-base" style={{ letterSpacing: "-.01em" }}>SmartBot</span>
            </Link>
          </div>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center">
            <div className="flex items-center rounded-full bg-card/60 backdrop-blur-md border border-border/40 p-1">
              {landingLinks.map((link) => (
                <Link key={link.href} href={link.href}
                  className={cn("relative z-10 text-sm font-medium cursor-pointer rounded-full px-4 py-2 transition-colors",
                    pathname === link.href ? "text-orange-foreground" : "text-foreground/70 hover:text-foreground")}>
                  {pathname === link.href && (
                    <motion.div layoutId="tubelight-nav"
                      className="absolute inset-0 z-[-10] rounded-full bg-orange"
                      style={{ boxShadow: "0 0 18px 3px rgba(251,146,60,0.35)" }}
                      transition={{ type: "spring", stiffness: 420, damping: 28 }} />
                  )}
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 flex-1">
            <ThemeToggle />
          </div>
        </nav>
        <div className="shimmer-bar" aria-hidden="true" />
      </header>

      <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} pathname={pathname} />
    </>
  )
}
