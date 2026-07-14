import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ThemeToggle } from "@/components/ThemeToggle"
import { X } from "lucide-react"

const landingLinks = [
  { href: "pricing", label: "الخطط والأسعار" },
  { href: "features", label: "المميزات" },
  { href: "login", label: "تسجيل الدخول" },
]

function HamburgerButton({ open, onClick }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden"
      style={{
        position: "relative", width: 44, height: 44, borderRadius: 10,
        border: "1px solid var(--border)", background: "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "all .2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in oklch, var(--accent) 15%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in oklch, var(--accent) 30%, transparent)" }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--border)" }}
      aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
    >
      <span style={{ position: "relative", width: 14, height: 14 }}>
        <span style={{
          position: "absolute", insetInline: 0, top: 2, height: 2, borderRadius: "full",
          background: "var(--fg)", transition: "all .3s",
          transform: open ? "rotate(45deg) translate(3px, 3px)" : "none",
        }} />
        <span style={{
          position: "absolute", insetInline: 0, top: 6, height: 2, borderRadius: "full",
          background: "var(--fg)", transition: "all .3s",
          opacity: open ? 0 : 1,
        }} />
        <span style={{
          position: "absolute", insetInline: 0, bottom: 2, height: 2, borderRadius: "full",
          background: "var(--fg)", transition: "all .3s",
          transform: open ? "rotate(-45deg) translate(3px, -3px)" : "none",
        }} />
      </span>
    </button>
  )
}

const mobileLinkVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24, delay: 0.06 + i * 0.06 } }),
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
}

function MobileMenu({ open, onClose, onNavigate }) {
  const panelRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement
      const raf = requestAnimationFrame(() => {
        const panel = panelRef.current
        if (panel) {
          const focusable = panel.querySelector('button, [href], [tabindex]:not([tabindex="-1"])')
          if (focusable) focusable.focus()
        }
      })
      return () => cancelAnimationFrame(raf)
    } else {
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") {
        previousFocusRef.current.focus()
      }
    }
  }, [open])

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") { onClose(); return }
    if (e.key !== "Tab") return
    const panel = panelRef.current
    if (!panel) return
    const focusable = panel.querySelectorAll("button, [href], [tabindex]:not([tabindex=\"-1\"])")
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }, [onClose])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || !open) return
    panel.addEventListener("keydown", handleKeyDown)
    return () => panel.removeEventListener("keydown", handleKeyDown)
  }, [open, handleKeyDown])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: "fixed", inset: 0, zIndex: 40, background: "color-mix(in oklch, var(--bg) 60%, transparent)", backdropFilter: "blur(8px)" }}
            onClick={onClose}
          />
          <motion.div
            key="menu"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="قائمة التصفح"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            style={{
              position: "fixed", insetInline: 0, top: 0, zIndex: 50,
              margin: "16px", borderRadius: 16,
              background: "var(--surface)",
              border: "1px solid color-mix(in oklch, var(--border) 50%, transparent)",
              boxShadow: "var(--shadow-xl)", overflow: "hidden",
              transformOrigin: "top center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid color-mix(in oklch, var(--border) 50%, transparent)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src="/static/brand-icon.png" alt="SmartBot" style={{ width: 36, height: 36, objectFit: "contain" }} />
                <span style={{ fontWeight: 700, fontSize: 15, color: "var(--fg)" }}>SmartBot</span>
              </div>
              <button onClick={onClose} style={{ width: 44, height: 44, borderRadius: 10, border: "1px solid color-mix(in oklch, var(--border) 50%, transparent)", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--fg)" }}><X size={16} /></button>
            </div>
            <nav style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 4 }}>
              {landingLinks.map((link, i) => (
                <motion.div key={link.href} custom={i} variants={mobileLinkVariants} initial="hidden" animate="visible" exit="exit">
                  <span onClick={() => { onClose(); onNavigate && onNavigate(link.href) }} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12,
                    fontSize: 14, fontWeight: 500, cursor: "pointer", color: "var(--fg)",
                    transition: "background .15s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "color-mix(in oklch, var(--border) 30%, transparent)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    {link.label}
                  </span>
                </motion.div>
              ))}
              <hr style={{ border: "none", borderBlockStart: "1px solid color-mix(in oklch, var(--border) 50%, transparent)", margin: "8px 0" }} />
              <button onClick={() => { onClose(); onNavigate && onNavigate("login") }} style={{
                padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 600,
                background: "var(--accent)", color: "var(--accent-fg)", border: 0, cursor: "pointer",
              }}>تسجيل الدخول</button>
            </nav>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function LandingHeader({ onNavigate }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [visible, setVisible] = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const lastScrollY = useRef(0)
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), [])

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY
      if (currentY > lastScrollY.current && currentY > 80) setVisible(false)
      else setVisible(true)
      lastScrollY.current = currentY
      setScrolled(currentY > 20)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const isActive = (key) => {
    const hash = window.location.hash.replace("#", "")
    return hash === key
  }

  return (
    <>
      <header
        dir="rtl"
        style={{
          position: "fixed", top: 0, insetInline: 0, zIndex: 30, height: 64,
          transition: "transform .5s var(--ease-smooth), background .5s var(--ease-smooth), border-color .5s var(--ease-smooth)",
          transform: visible ? "translateY(0)" : "translateY(-100%)",
          background: scrolled
            ? "color-mix(in oklch, var(--bg) 80%, transparent)"
            : "transparent",
          backdropFilter: scrolled ? "blur(32px)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(32px)" : "none",
          borderBlockEnd: scrolled ? "1px solid color-mix(in oklch, var(--border) 30%, transparent)" : "1px solid transparent",
          boxShadow: scrolled ? "var(--shadow-md)" : "none",
        }}
      >
        <nav style={{ maxWidth: 1220, margin: "0 auto", padding: "0 24px", height: "100%", display: "flex", alignItems: "center", gap: 24 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            <HamburgerButton open={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)} />
            <span onClick={() => onNavigate && onNavigate("landing")} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flexShrink: 0 }}>
              <img src="/static/brand-icon.png" alt="SmartBot" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "contain", boxShadow: "var(--shadow-glow)" }} />
              <span style={{ fontWeight: 700, fontSize: 16, color: "var(--fg)", letterSpacing: "-.01em" }}>SmartBot</span>
            </span>
          </div>

          {/* Tubelight Nav (Desktop) */}
          <div className="hidden lg:flex" style={{ alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", borderRadius: 9999, background: "color-mix(in oklch, var(--surface) 60%, transparent)", backdropFilter: "blur(8px)", border: "1px solid color-mix(in oklch, var(--border) 40%, transparent)", padding: 3, boxShadow: scrolled ? "var(--shadow-sm)" : "none" }}>
              {landingLinks.map((link, i) => {
                const linkActive = isActive(link.href)
                return (
                  <div key={link.href} style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    {i > 0 && <div style={{ width: 1, height: 20, background: "var(--border)" }} />}
                    <span
                      onClick={() => onNavigate && onNavigate(link.href)}
                      style={{
                        position: "relative", zIndex: 10, padding: "6px 16px", fontSize: 13, fontWeight: 500,
                        color: linkActive ? "#fff" : "color-mix(in oklch, var(--fg) 70%, transparent)",
                        cursor: "pointer", borderRadius: 9999, transition: "color .2s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {link.label}
                      {linkActive && (
                        <motion.div
                          layoutId="tubelight-landing"
                          style={{
                            position: "absolute", inset: 0, zIndex: -10, borderRadius: 9999,
                            background: "var(--accent)",
                            boxShadow: "0 0 18px 3px rgba(200,78,0,0.35), 0 0 6px rgba(200,78,0,0.15)",
                          }}
                          transition={{ type: "spring", stiffness: 420, damping: 28 }}
                        />
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flex: 1 }}>
            <ThemeToggle />
          </div>
        </nav>

        {/* Shimmer bar */}
        <div className="shimmer-bar" aria-hidden="true" />
      </header>

      <MobileMenu open={mobileMenuOpen} onClose={closeMobileMenu} onNavigate={onNavigate} />
    </>
  )
}
