import { MessageCircle } from "lucide-react"

export function LandingFooter({ onNavigate }) {
  return (
    <footer dir="rtl" style={{ borderBlockStart: "1px solid var(--border)", background: "var(--surface)" }}>
      <div style={{ maxWidth: 1220, margin: "0 auto", padding: "48px 24px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 32 }}>

          {/* Column 1 — Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBlockEnd: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, var(--accent), oklch(0.42 0.14 38))", display: "grid", placeItems: "center", color: "var(--accent-fg)", fontWeight: 800, fontSize: 16, boxShadow: "var(--shadow-glow)" }}>S</div>
              <span style={{ fontWeight: 700, fontSize: 15, color: "var(--fg)" }}>SmartBot</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBlockEnd: 16, maxWidth: 280 }}>
              منصة رقمية لإدارة صفحات فيسبوك — ردود تلقائية، تحليلات، وجدولة منشورات بذكاء
            </p>
            <a href="https://wa.me/218910089975" target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--accent)", textDecoration: "none", padding: "8px 16px", borderRadius: 9999, border: "1px solid color-mix(in oklch, var(--accent) 20%, transparent)", transition: "background .15s" }}>
              <MessageCircle size={16} strokeWidth={1.8} />
              واتساب
            </a>
          </div>

          {/* Column 2 — Quick links */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBlockEnd: 12 }}>روابط سريعة</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span onClick={() => onNavigate && onNavigate("dashboard")} style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer", transition: "color .15s" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"} onMouseLeave={e => e.currentTarget.style.color = ""}>لوحة التحكم</span>
              <span style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"} onMouseLeave={e => e.currentTarget.style.color = ""}>الخطط والأسعار</span>
              <span style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"} onMouseLeave={e => e.currentTarget.style.color = ""}>المميزات</span>
              <span onClick={() => onNavigate && onNavigate("login")} style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"} onMouseLeave={e => e.currentTarget.style.color = ""}>تسجيل الدخول</span>
            </div>
          </div>

          {/* Column 3 — Services */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBlockEnd: 12 }}>الخدمات</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>ردود تلقائية</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>تحليلات وأداء</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>جدولة منشورات</span>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>إدارة العملاء</span>
            </div>
          </div>

          {/* Column 4 — Contact */}
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", marginBlockEnd: 12 }}>تواصل معنا</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a href="https://wa.me/218910089975" target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}><MessageCircle size={14} strokeWidth={1.8} /> واتساب</a>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>دعم فني 24/7</span>
            </div>
          </div>

        </div>

        {/* Bottom bar */}
        <div style={{ marginBlockStart: 32, paddingBlockStart: 16, borderBlockStart: "1px solid var(--border)", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>© {new Date().getFullYear()} الربط الذكي | SmartBot. جميع الحقوق محفوظة.</span>
          <div style={{ display: "flex", gap: 16 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"} onMouseLeave={e => e.currentTarget.style.color = ""}>شروط الاستخدام</span>
            <span style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.color = "var(--fg)"} onMouseLeave={e => e.currentTarget.style.color = ""}>سياسة الخصوصية</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
