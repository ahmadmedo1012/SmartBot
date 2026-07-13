import { MessageCircle } from "lucide-react"

const QUICK_LINKS = [
  { key: "pricing", label: "الخطط" },
  { key: "login", label: "تسجيل الدخول" },
]

const SERVICES = [
  "ردود تلقائية",
  "تحليلات وأداء",
  "جدولة منشورات",
  "إدارة العملاء",
]

function SocialIcon({ children, href, label }) {
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="size-8 rounded-sm bg-card border border-border flex items-center justify-center hover:bg-orange/20 transition-colors"
        aria-label={label}>{children}</a>
    )
  }
  return (
    <span className="size-8 rounded-sm bg-card border border-border flex items-center justify-center opacity-40 cursor-not-allowed" aria-label="قريباً">
      {children}
    </span>
  )
}

export function LandingFooter({ onNavigate }) {
  return (
  <footer dir="rtl" style={{ borderBlockStart: "1px solid color-mix(in oklch, var(--border) 50%, transparent)", paddingBlock: "64px 40px" }}>
      <div style={{ maxWidth: 1220, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px 32px", marginBlockEnd: 40 }}
          className="sm:grid-cols-4">

          {/* Column 1 — Brand */}
          <div className="col-span-2 sm:col-span-1">
            <img src="/static/brand-icon.png" alt="SmartBot" style={{ width: 28, height: 28, borderRadius: 8, marginBlockEnd: 12 }} />
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBlockEnd: 16, maxWidth: 280 }}>
              منصة رقمية لإدارة صفحات فيسبوك — ردود تلقائية، تحليلات، وجدولة منشورات بذكاء
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <SocialIcon label="فيسبوك">
                <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </SocialIcon>
              <SocialIcon label="إنستغرام">
                <svg className="size-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
              </SocialIcon>
              <SocialIcon label="يوتيوب">
                <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.55 9.38.55 9.38.55s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"/></svg>
              </SocialIcon>
              <SocialIcon href="https://wa.me/218910089975" label="واتساب">
                <MessageCircle className="size-3.5" />
              </SocialIcon>
            </div>
          </div>

          {/* Column 2 — Quick links */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBlockEnd: 12 }}>روابط سريعة</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {QUICK_LINKS.map((link) => (
                <span key={link.key} onClick={() => onNavigate && onNavigate(link.key)}
                  style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer", transition: "color .15s", width: "fit-content" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"}
                  onMouseLeave={e => e.currentTarget.style.color = ""}>{link.label}</span>
              ))}
            </div>
          </div>

          {/* Column 3 — Services */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBlockEnd: 12 }}>الخدمات</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SERVICES.map((s) => (
                <span key={s} style={{ fontSize: 13, color: "var(--muted)", cursor: "default", width: "fit-content" }}>{s}</span>
              ))}
            </div>
          </div>

          {/* Column 4 — Contact */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBlockEnd: 12 }}>تواصل معنا</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a href="https://wa.me/218910089975" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6, width: "fit-content", transition: "color .15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"} onMouseLeave={e => e.currentTarget.style.color = ""}><MessageCircle size={14} strokeWidth={1.8} /> واتساب</a>
              <span style={{ fontSize: 13, color: "var(--muted)", cursor: "default", width: "fit-content" }}>دعم فني 24/7</span>
            </div>
          </div>

        </div>

        {/* Bottom bar */}
        <div style={{ borderBlockStart: "1px solid color-mix(in oklch, var(--border) 50%, transparent)", paddingBlockStart: 24, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, color: "color-mix(in oklch, var(--muted) 60%, transparent)" }}>
            &copy; {new Date().getFullYear()} الربط الذكي | SmartBot. جميع الحقوق محفوظة.
          </span>
          <div style={{ display: "flex", gap: 16 }}>
            <span style={{ fontSize: 12, color: "color-mix(in oklch, var(--muted) 60%, transparent)", cursor: "pointer", transition: "color .15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"} onMouseLeave={e => e.currentTarget.style.color = ""}>شروط الاستخدام</span>
            <span style={{ fontSize: 12, color: "color-mix(in oklch, var(--muted) 60%, transparent)", cursor: "pointer", transition: "color .15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"} onMouseLeave={e => e.currentTarget.style.color = ""}>سياسة الخصوصية</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
