import { useState, useEffect } from "react"
import { LogIn, Smartphone, Menu, X } from "lucide-react"

export function LandingHeader({ onNavigate }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const sentinel = document.createElement("div")
    sentinel.style.position = "absolute"
    sentinel.style.top = "41px"
    sentinel.style.height = "1px"
    sentinel.style.width = "1px"
    sentinel.style.pointerEvents = "none"
    document.body.prepend(sentinel)
    const obs = new IntersectionObserver(
      ([e]) => setScrolled(!e.isIntersecting),
      { rootMargin: "-40px 0px 0px 0px" }
    )
    obs.observe(sentinel)
    return () => { obs.disconnect(); sentinel.remove() }
  }, [])

  return (
    <header
      dir="rtl"
      style={{
        position: "fixed", top: 0, insetInline: 0, zIndex: 50, height: 56,
        background: scrolled
          ? "color-mix(in oklch, var(--surface) 40%, transparent)"
          : "color-mix(in oklch, var(--surface) 60%, transparent)",
        backdropFilter: scrolled ? "blur(24px)" : "blur(16px)",
        WebkitBackdropFilter: scrolled ? "blur(24px)" : "blur(16px)",
        borderBlockEnd: scrolled ? "1px solid color-mix(in oklch, var(--accent) 15%, transparent)" : "1px solid transparent",
        transition: "background .35s var(--ease-smooth), backdrop-filter .35s var(--ease-smooth), border-color .35s var(--ease-smooth)",
      }}
    >
      <nav style={{ maxWidth: 1220, margin: "0 auto", padding: "0 24px", height: "100%", display: "flex", alignItems: "center", gap: 24 }}>
        {/* Logo */}
        <a href="#" onClick={(e) => { e.preventDefault(); onNavigate && onNavigate("landing") }} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, var(--accent), oklch(0.42 0.14 38))", display: "grid", placeItems: "center", color: "var(--accent-fg)", fontWeight: 800, fontSize: 16, boxShadow: "var(--shadow-glow)" }}>S</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--fg)", letterSpacing: "-.01em" }}>SmartBot</span>
        </a>

        {/* Desktop nav */}
        {/* Desktop nav */}
        <div style={{ gap: 4, alignItems: "center", background: "color-mix(in oklch, var(--surface) 40%, transparent)", padding: 3, borderRadius: 9999, border: "1px solid var(--border)" }} className="hidden lg:flex">
          <span onClick={() => onNavigate && onNavigate("dashboard")} style={{ padding: "6px 14px", borderRadius: 9999, fontSize: 13, fontWeight: 500, color: "var(--fg)", cursor: "pointer", background: "transparent", transition: "background .15s" }} onMouseEnter={e => e.currentTarget.style.background = "color-mix(in oklch, var(--border) 30%, transparent)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>لوحة التحكم</span>
          <span onClick={() => onNavigate && onNavigate("pricing")} style={{ padding: "6px 14px", borderRadius: 9999, fontSize: 13, fontWeight: 500, color: "var(--muted)", cursor: "pointer", transition: "background .15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"} onMouseLeave={e => e.currentTarget.style.color = ""}>الخطط والأسعار</span>
          <span style={{ padding: "6px 14px", borderRadius: 9999, fontSize: 13, fontWeight: 500, color: "var(--muted)", cursor: "pointer" }}>مميزات</span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Desktop right */}
        <div style={{ alignItems: "center", gap: 8 }} className="hidden lg:flex">
          <button
            onClick={() => onNavigate && onNavigate("login")}
            style={{ padding: "6px 16px", borderRadius: 9999, fontSize: 13, fontWeight: 600, background: "transparent", color: "var(--fg)", border: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "border-color .15s, color .15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)" }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--fg)" }}
          >
            <LogIn size={15} strokeWidth={1.8} />
            تسجيل الدخول
          </button>
          <button
            onClick={() => onNavigate && onNavigate("dashboard")}
            style={{ padding: "6px 18px", borderRadius: 9999, fontSize: 13, fontWeight: 600, background: "var(--accent)", color: "var(--accent-fg)", border: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 14px #c53c0033", transition: "background .15s, box-shadow .15s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#d45600"; e.currentTarget.style.boxShadow = "0 6px 20px #c53c004d" }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.boxShadow = "0 4px 14px #c53c0033" }}
          >
            <Smartphone size={15} strokeWidth={1.8} />
            ابدأ مجاناً
          </button>
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden" style={{ background: "none", border: 0, color: "var(--fg)", cursor: "pointer", padding: 4 }}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ background: "var(--surface)", borderBlockEnd: "1px solid var(--border)", padding: "8px 16px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span onClick={() => { setMenuOpen(false); onNavigate && onNavigate("dashboard") }} style={{ padding: "10px 12px", borderRadius: 8, fontSize: 14, color: "var(--fg)", cursor: "pointer" }}>لوحة التحكم</span>
            <span onClick={() => { setMenuOpen(false); onNavigate && onNavigate("pricing") }} style={{ padding: "10px 12px", borderRadius: 8, fontSize: 14, color: "var(--muted)", cursor: "pointer" }}>الخطط والأسعار</span>
            <span style={{ padding: "10px 12px", borderRadius: 8, fontSize: 14, color: "var(--muted)", cursor: "pointer" }}>مميزات</span>
            <hr style={{ border: "none", borderBlockStart: "1px solid var(--border)", margin: "8px 0" }} />
            <button onClick={() => { setMenuOpen(false); onNavigate && onNavigate("login") }} style={{ padding: "10px 12px", borderRadius: 8, fontSize: 14, background: "var(--accent)", color: "var(--accent-fg)", border: 0, cursor: "pointer", fontWeight: 600 }}>تسجيل الدخول</button>
          </div>
        </div>
      )}
    </header>
  )
}
