import { useState, useEffect } from "react"

const links = [
  { href: "/pricing", label: "Pricing" },
  { href: "/login", label: "Login" },
  { href: "/register", label: "Register" },
]

export function PublicHeader({ currentPath, onNavigate }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        insetInline: 0,
        zIndex: 30,
        height: 64,
        transition: "background 0.5s, border-color 0.5s",
        background: scrolled
          ? "color-mix(in srgb, var(--bg) 80%, transparent)"
          : "transparent",
        backdropFilter: scrolled ? "blur(24px)" : "none",
        borderBottom: scrolled ? "1px solid color-mix(in srgb, var(--border) 30%, transparent)" : "1px solid transparent",
      }}
    >
      <nav
        style={{
          maxWidth: 1220,
          margin: "0 auto",
          padding: "0 24px",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); onNavigate?.("dashboard") }}
          style={{
            fontWeight: 700,
            fontSize: 18,
            color: "var(--fg)",
            textDecoration: "none",
            letterSpacing: "-0.01em",
          }}
        >
          SmartBot
        </a>

        <div style={{ display: "flex", gap: 4 }}>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => { e.preventDefault(); onNavigate?.(link.href.replace("/", "")) }}
              style={{
                padding: "8px 16px",
                borderRadius: 9999,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                color: currentPath === link.href.replace("/", "") ? "var(--accent-fg)" : "var(--muted)",
                background: currentPath === link.href.replace("/", "") ? "var(--accent)" : "transparent",
                transition: "background 0.2s, color 0.2s",
              }}
              onMouseEnter={(e) => { if (currentPath !== link.href.replace("/", "")) e.currentTarget.style.background = "var(--accent-soft)" }}
              onMouseLeave={(e) => { if (currentPath !== link.href.replace("/", "")) e.currentTarget.style.background = "transparent" }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </nav>
    </header>
  )
}
