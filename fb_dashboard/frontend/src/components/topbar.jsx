import { useState, useEffect, useRef } from "react"
import { LayoutDashboard, MessageCircle, MessageSquare, FileText, Calendar, BarChart3, Users, Users2, Megaphone, TrendingUp, FileBarChart, Globe, UserPlus, Bell, Settings, Wrench, CreditCard, Headphones, Activity, Reply, Send, Search } from "lucide-react"

const iconMap = {
  dashboard: LayoutDashboard, messages: MessageCircle, comments: MessageSquare,
  posts: FileText, scheduled: Calendar, analytics: BarChart3, audience: Users,
  leads: UserPlus, ads: Megaphone, marketing: TrendingUp, reports: FileBarChart,
  pages: Globe, team: Users2, autoreply: Reply, activity: Activity,
  notifications: Bell, tools: Wrench, billing: CreditCard, support: Headphones,
  settings: Settings, broadcast: Send,
}

const sidebarSections = [
  { label: "الرئيسية", items: [
    { key: "dashboard", label: "لوحة البيانات", icon: "dashboard" },
    { key: "messages", label: "الرسائل", icon: "messages", badge: "12" },
    { key: "comments", label: "التعليقات", icon: "comments" },
    { key: "posts", label: "المنشورات", icon: "posts" },
    { key: "scheduled", label: "المجدول", icon: "scheduled" },
  ]},
  { label: "التحليل", items: [
    { key: "analytics", label: "التحليلات", icon: "analytics" },
    { key: "audience", label: "الجمهور", icon: "audience" },
    { key: "leads", label: "العملاء المتوقعون", icon: "leads" },
  ]},
  { label: "الأعمال", items: [
    { key: "ads", label: "الإعلانات", icon: "ads" },
    { key: "broadcast", label: "البث الجماعي", icon: "broadcast" },
    { key: "marketing", label: "التسويق", icon: "marketing" },
    { key: "reports", label: "التقارير", icon: "reports" },
  ]},
  { label: "الإدارة", items: [
    { key: "pages", label: "الصفحات", icon: "pages" },
    { key: "team", label: "الفريق", icon: "team" },
    { key: "calendar", label: "تقويم المحتوى", icon: "scheduled" },
    { key: "autoreply", label: "الردود التلقائية", icon: "autoreply" },
    { key: "activity", label: "سجل النشاطات", icon: "activity" },
  ]},
  { label: "أخرى", items: [
    { key: "notifications", label: "الإشعارات", icon: "notifications", badge: "0" },
    { key: "tools", label: "الأدوات", icon: "tools" },
    { key: "billing", label: "الفواتير", icon: "billing" },
    { key: "support", label: "الدعم", icon: "support" },
    { key: "settings", label: "الإعدادات", icon: "settings" },
  ]},
]

const ICON_SIZE = 20
const NavIcon = ({ name }) => { const C = iconMap[name]; return C ? <C size={ICON_SIZE} strokeWidth={1.8} /> : null }

const mobileNav = [
  { key: "dashboard", label: "الرئيسية", icon: "dashboard" },
  { key: "messages", label: "الرسائل", icon: "messages" },
  { key: "analytics", label: "تحليلات", icon: "analytics" },
  { key: "broadcast", label: "بث", icon: "broadcast" },
  { key: "settings", label: "الإعدادات", icon: "settings" },
]

export function Topbar({ currentPage, onNavigate, username, children, notifCount = 0 }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hideHeader, setHideHeader] = useState(false)
  const lastY = useRef(0)

  // IntersectionObserver for scroll-state + hide-on-scroll-down
  useEffect(() => {
    const sentinel = document.createElement("div")
    sentinel.style.position = "absolute"
    sentinel.style.top = "21px"
    sentinel.style.height = "1px"
    sentinel.style.width = "1px"
    sentinel.style.pointerEvents = "none"
    document.body.prepend(sentinel)
    const obs = new IntersectionObserver(
      ([e]) => setScrolled(!e.isIntersecting),
      { rootMargin: "-20px 0px 0px 0px" }
    )
    obs.observe(sentinel)
    const onScroll = () => {
      const y = window.scrollY
      if (y > 80) setHideHeader(y > lastY.current)
      lastY.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => { obs.disconnect(); sentinel.remove(); window.removeEventListener("scroll", onScroll) }
  }, [])

  const handleNav = (key) => {
    onNavigate(key)
    setDrawerOpen(false)
  }

  const avatarLetter = (username || "?").charAt(0).toUpperCase()

  return (
    <div className="app-shell" dir="rtl">
      {/* sidebar overlay */}
      <div
        className={`sidebar-overlay ${drawerOpen ? "show" : ""}`}
        onClick={() => setDrawerOpen(false)}
        role="dialog"
        aria-modal="true"
        tabIndex="0"
        aria-label="إغلاق القائمة"
      />

      {/* sidebar */}
      <aside className={`sidebar ${drawerOpen ? "open" : ""}`} id="sidebar">
        <div className="sidebar-header" style={{ position: "relative", overflow: "hidden" }}>
          <div className="sidebar-logo" style={{background:"linear-gradient(135deg, var(--accent), oklch(0.52 0.16 40))", boxShadow:"var(--shadow-glow-strong)"}}>
            <img src="/static/favicon.png" alt="SmartBot" className="w-5 h-5 object-contain" />
          </div>
          <div className="sidebar-title">
            <span className="shiny-text" style={{fontSize:"15px",fontWeight:700}}>SmartBot</span>
            <span style={{fontSize:"10px", color:"var(--muted)"}}>لوحة تحكم فيسبوك</span>
          </div>
          <div className="shimmer-bar" aria-hidden="true" style={{position:"absolute",bottom:0,left:0,width:"100%",height:"1px",overflow:"hidden",pointerEvents:"none"}} />
        </div>
        <nav className="sidebar-nav">
          {sidebarSections.map((section) => (
            <div key={section.label}>
              <div className="nav-section">{section.label}</div>
              {section.items.map((item) => (
                <a
                  key={item.key}
                  className={`nav-item ${currentPage === item.key ? "active" : ""}`}
                  onClick={() => handleNav(item.key)}
                  href="#"
                  aria-current={currentPage === item.key ? "page" : undefined}
                >
                  <span className="nav-icon"><NavIcon name={item.icon} /></span>
                  {item.label}
                  {item.badge && parseInt(item.badge) > 0 && <span className="nav-badge">{item.badge}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* main area */}
      <div className="main">
        {/* header */}
        <header className={`header ${scrolled ? "is-scrolled" : ""}`} style={{
          transition: "background .35s var(--ease-smooth), backdrop-filter .35s var(--ease-smooth), border-color .35s var(--ease-smooth), transform .35s var(--ease-smooth)",
          transform: hideHeader ? "translateY(-100%)" : "translateY(0)",
        }}>
          <button
            className="hamburger"
            id="hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="القائمة"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h14"/><path d="M4 11h14"/><path d="M4 16h14"/>
            </svg>
          </button>
          <h2 className="header-page-title" id="pageTitle">
  <span className="shiny-text">{pageTitles[currentPage] || currentPage}</span>
</h2>
          <div className="header-left">
            <div className="header-search" role="button" tabIndex="0" aria-label="بحث"
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate("search") }}}>
              <span><Search size={18} strokeWidth={1.8} /></span>
              <span>بحث سريع...</span>
            </div>
            <div
              className="notif-btn"
              onClick={() => onNavigate("notifications")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate("notifications") }}}
              role="button"
              tabIndex="0"
              aria-label="الإشعارات"
            >
              <Bell size={20} strokeWidth={1.8} />
              {notifCount > 0 && <span className="notif-dot"></span>}
            </div>
            <div className="avatar" role="button" tabIndex="0" aria-label="الملف الشخصي"
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate("profile") }}}>{avatarLetter}</div>
            <span style={{display:"inline-flex",alignItems:"center",gap:"4px",fontSize:"11px",color:"var(--muted)",marginInlineStart:"4px"}}><span style={{width:"7px",height:"7px",borderRadius:"50%",background:"var(--success)",animation:"livePulse 2s ease-in-out infinite",flexShrink:0}}></span>مباشر</span>
          </div>
        </header>

        {children}

        {/* mobile bottom nav */}
        {currentPage !== "landing" && currentPage !== "login" && (
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch border-t"
          style={{ background: "var(--surface)", borderColor: "var(--border)", paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "4rem" }}
        >
          <div className="shimmer-bar" aria-hidden="true" style={{position:"absolute",top:0,left:0,width:"100%",height:"1px",overflow:"hidden",pointerEvents:"none"}} />
          {mobileNav.map((item) => {
            const active = currentPage === item.key
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 min-h-[3.5rem] px-2 py-1 transition-colors`}
                style={{ color: active ? "var(--accent)" : "var(--muted)" }}
              >
                <NavIcon name={item.icon} />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full" style={{ background: "var(--accent)" }} />
                )}
              </button>
            )
          })}
        </nav>
        )}
      </div>
    </div>
  )
}

const pageTitles = {
  dashboard: "لوحة البيانات", messages: "الرسائل", comments: "التعليقات",
  posts: "المنشورات", scheduled: "المجدول", analytics: "التحليلات",
  audience: "الجمهور", leads: "العملاء المتوقعون", ads: "الإعلانات",
  broadcast: "البث الجماعي", marketing: "التسويق", reports: "التقارير",
  pages: "الصفحات", team: "الفريق", calendar: "تقويم المحتوى",
  autoreply: "الردود التلقائية", activity: "سجل النشاطات",
  notifications: "الإشعارات", tools: "الأدوات", billing: "الفواتير",
  support: "الدعم", settings: "الإعدادات",
}
