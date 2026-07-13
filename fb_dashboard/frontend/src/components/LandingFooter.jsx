import { MessageCircle } from "lucide-react"

const QUICK_LINKS = [
  { key: "pricing", label: "الخطط" },
  { key: "features", label: "المميزات" },
  { key: "login", label: "تسجيل الدخول" },
]
const SERVICES = [
  "ردود تلقائية",
  "تحليلات وأداء",
  "جدولة منشورات",
  "إدارة العملاء",
]

export function LandingFooter({ onNavigate }) {
  return (
    <footer dir="rtl" style={{ borderBlockStart: "1px solid color-mix(in oklch, var(--border) 50%, transparent)", paddingBlock: "48px 32px" }}>
      <div style={{ maxWidth: 1220, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "24px 32px", marginBlockEnd: 40 }}>

          {/* Column 1 — Brand */}
          <div>
            <img src="/static/brand-icon.png" alt="SmartBot" style={{ width: 28, height: 28, borderRadius: 8, marginBlockEnd: 12 }} />
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBlockEnd: 16, maxWidth: 280 }}>
              منصة رقمية لإدارة صفحات فيسبوك — ردود تلقائية، تحليلات، وجدولة منشورات بذكاء
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <a href="https://wa.me/218910089975" target="_blank" rel="noopener noreferrer" style={{ width: 32, height: 32, borderRadius: 4, background: "var(--bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color .15s" }} aria-label="واتساب" onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}><MessageCircle size={14} strokeWidth={1.8} /></a>
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
