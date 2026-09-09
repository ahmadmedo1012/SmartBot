"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"
import { ThemeToggle } from "@/components/shared/ThemeToggle"

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
      className="lg:hidden relative size-11 rounded-lg border border-border flex items-center justify-center hover:bg-accent-foreground/20 transition-all duration-200 active:scale-90 outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/50"
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

/* mobileLinkVariants removed in v6 §D — the staggered link reveal is now a
 * CSS transition-delay (see MobileMenu), keeping framer-motion out of the
 * landing critical path. */

function MobileMenu({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const hamburgerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (open) {
      hamburgerRef.current = document.activeElement as HTMLButtonElement
      requestAnimationFrame(() => {
        const panel = panelRef.current
        if (!panel) return
        const focusable = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')
        if (focusable.length) focusable[0]?.focus()
      })
    } else {
      hamburgerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose() ; return }
      if (e.key !== "Tab") return
      const focusable = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')
      if (focusable.length === 0) { e.preventDefault(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    panel.addEventListener("keydown", handleKeyDown)
    return () => panel.removeEventListener("keydown", handleKeyDown)
  }, [open])

  const isActive = (href: string) =>
    href === "/login" ? pathname === "/login" : pathname.startsWith(href.replace(/:.*/, ""))

  return (
    /* v6 §D — framer-free mobile menu: always-mounted + CSS transitions
     * (visibility-gated). AnimatePresence exit animations are nice-to-have;
     * the framer import kept the whole motion bundle in the landing's
     * critical path. Focus trap + Escape + restore-focus stay untouched. */
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="قائمة التصفح"
        aria-hidden={!open}
        className={cn(
          "fixed inset-x-0 top-0 z-50 mx-4 mt-4 rounded-2xl bg-background border border-border/10 shadow-2xl overflow-hidden",
          "transition-all duration-300 ease-out",
          open ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-2 scale-[0.98] pointer-events-none"
        )}
        style={{ transformOrigin: "top center" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          {/* v9-D4: alt="" — the adjacent <span>SmartBot</span> is the accessible
              text; a duplicated alt tripped axe image-redundant-alt. */}
          <Image src="/brand-icon.png" alt="" width={160} height={160} className="h-9 w-auto" priority />
          <span className="text-sm font-medium tracking-tight text-foreground/80">SmartBot</span>
          <button onClick={onClose} className="size-11 rounded-lg border border-border/10 flex items-center justify-center hover:bg-accent-foreground/20 transition-colors active:scale-90 outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/50" aria-label="إغلاق" tabIndex={open ? 0 : -1}><X className="size-4" /></button>
        </div>
        <nav className="px-4 py-4 space-y-1">
          {landingLinks.map((link, i) => {
            const linkActive = isActive(link.href)
            return (
              <div
                key={link.href}
                className={cn("transition-opacity duration-300", open ? "opacity-100" : "opacity-0")}
                style={{ transitionDelay: open ? `${60 + i * 60}ms` : "0ms" }}
              >
                <Link href={link.href} onClick={onClose} tabIndex={open ? 0 : -1}
                  aria-current={linkActive ? "page" : undefined}
                  className={cn("flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200", linkActive ? "bg-accent-foreground/15 text-accent-foreground" : "text-muted-foreground hover:bg-accent-foreground/10 hover:text-foreground")}
                >
                  {link.label}
                </Link>
              </div>
            )
          })}
        </nav>
      </div>
    </>
  )
}

export function Header({ className }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [visible, setVisible] = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const lastScrollY = useRef(0)
  const pathname = usePathname()
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY
      if (currentY > lastScrollY.current && currentY > 80) {
        setVisible(false)
      } else {
        setVisible(true)
      }
      lastScrollY.current = currentY
      setScrolled(currentY > 20)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const isActive = (href: string) =>
    href === "/login" ? pathname === "/login" : pathname.startsWith(href.replace(/:.*/, ""))

  return (
    <>
      {/* v16-E3 (D1 C1, HIGH): the hidden branch only applied -translate-y-full —
          the links stayed tabbable while invisible (live measurement: first 6
          tab stops at y=−50). `invisible` removes them from the tab order AFTER
          the slide-out: the base `transition-all` already covers visibility
          (CSS discrete transition — visibility stays "visible" for the whole
          500ms duration, then flips), so the animation is preserved exactly and
          no transition-property narrowing (which would kill the scrolled
          bg/border/shadow fades) is needed. */}
      <header className={cn(
        "fixed top-0 inset-x-0 z-30 h-16 transition-all duration-500 will-change-transform backface-hidden",
        visible ? "translate-y-0" : "-translate-y-full invisible",
        scrolled ? "bg-background/80 backdrop-blur-2xl border-b border-border/30 shadow-md" : "bg-background/0",
        className
      )}>
        <nav className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-10 h-full flex items-center justify-between" aria-label="الرئيسية">
          {/* Logo & Hamburger */}
          <div className="flex items-center gap-3 flex-1">
            <HamburgerButton open={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)} />
            <Link href="/" className="flex items-center gap-2 shrink-0 group">
              {/* v9-D4: alt="" — the adjacent <span>SmartBot</span> is the accessible
                  text; a duplicated alt tripped axe image-redundant-alt. */}
              <Image src="/brand-icon.png" alt="" width={160} height={160} className="h-9 w-auto" priority />
              <span className="text-base font-bold tracking-normal text-foreground/90 group-hover:text-accent-foreground transition-colors duration-200" style={{ fontFamily: "var(--font-heading)" }}>SmartBot</span>
            </Link>
          </div>

          {/* Tubelight Nav (Desktop) */}
          <div className="hidden lg:flex items-center">
            <div className="relative flex items-center rounded-full bg-card/40 backdrop-blur-sm border border-border/40 p-1 shadow-sm">
              {landingLinks.map((link, i) => {
                const linkActive = isActive(link.href)
                return (
                  <div key={link.href} className="relative flex items-center">
                    {i > 0 && <div className="w-px h-5 bg-border" />}
                    <Link
                      href={link.href}
                      aria-current={linkActive ? "page" : undefined}
                      className={cn(
                        "relative z-10 px-4 py-2 text-sm font-medium transition-colors duration-200 rounded-full",
                        linkActive ? "text-white dark:text-white" : "text-foreground/70 hover:text-foreground"
                      )}
                    >
                      {link.label}
                      {/* v17-S3 (D2 P1#1 / §3.3#1) — tubelight motion restored,
                       * CSS-only. v6 §D replaced motion.div layoutId="tubelight"
                       * with a pill that MOUNTED/UNMOUNTED per active link, so
                       * it teleported between tabs (the P1 gap). The pill is
                       * now ALWAYS mounted behind every link and driven by
                       * state classes: the inactive one rests at scale-60 +
                       * opacity-0, the active one springs to full size with
                       * the --ease-spring overshoot over --duration-base —
                       * navigating crossfades shrink/grow instead of popping.
                       * Deliberately NOT the measured "sliding pill": offsets
                       * would need measurement JS (ruled out by the CSS-only
                       * constraint) and the pill would lose its SSR paint.
                       * v14-E5 (D2-M2): the glow stays color-mix over
                       * var(--primary) in both modes. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-0 -z-10 rounded-full bg-primary shadow-lg",
                          "transition-[opacity,scale] duration-(--duration-base) ease-spring",
                          linkActive ? "scale-100 opacity-100" : "scale-[0.6] opacity-0"
                        )}
                        style={{
                          boxShadow: "0 0 18px 3px color-mix(in oklch, var(--primary) 35%, transparent), 0 0 6px color-mix(in oklch, var(--primary) 15%, transparent)",
                        }}
                      />
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 flex-1">
            <ThemeToggle />
          </div>
        </nav>
      </header>

      <MobileMenu open={mobileMenuOpen} onClose={closeMobileMenu} pathname={pathname} />
    </>
  )
}
