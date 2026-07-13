import { useState, useEffect } from "react"

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

const navIcons = {
  dashboard: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="11" width="3" height="7" rx=".5"/><rect x="8.5" y="7" width="3" height="11" rx=".5"/><rect x="15" y="3" width="3" height="15" rx=".5"/></svg>,
  messages: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 9a6.5 6.5 0 0 1-6.5 6.5H5l-3 2.5V6A2.5 2.5 0 0 1 4.5 3.5h6A6.5 6.5 0 0 1 17 9z"/></svg>,
  comments: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 9.5A6.5 6.5 0 1 1 5 13l-2 1.5v-4A6.5 6.5 0 1 1 17 9.5z"/><circle cx="10" cy="9.5" r="1.5"/><circle cx="6" cy="9.5" r="1.5"/><circle cx="14" cy="9.5" r="1.5"/></svg>,
  posts: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5H4.5A1.5 1.5 0 0 0 3 4v13a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 16 17V7l-4-4.5z"/><path d="M12 2.5v4.5h4"/><path d="M6 9h5"/><path d="M6 12h5"/><path d="M6 15h3"/></svg>,
  scheduled: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3.5" width="16" height="14" rx="1.5"/><path d="M2 7.5h16"/><path d="M6 1.5v4"/><path d="M14 1.5v4"/></svg>,
  analytics: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 17.5h16"/><path d="M6 13.5L9 9l3 2 5-6"/></svg>,
  audience: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="6.5" r="3"/><path d="M2 16.5v-1a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5v1"/><circle cx="13.5" cy="5" r="2.5"/><path d="M18 16.5v-1a4 4 0 0 0-3.5-3.97"/></svg>,
  leads: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><circle cx="10" cy="10" r="5"/><circle cx="10" cy="10" r="2"/><path d="M10 2v3"/><path d="M10 15v3"/><path d="M2 10h3"/><path d="M15 10h3"/></svg>,
  ads: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h2l5-4.5v13L5 12H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><path d="M12 8.19a3.5 3.5 0 0 1 0 3.62"/><path d="M15 6.68a6.5 6.5 0 0 1 0 6.64"/></svg>,
  broadcast: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="15" r="1.5"/><path d="M6 11a5.66 5.66 0 0 1 8 0"/><path d="M3 7.5a10 10 0 0 1 14 0"/></svg>,
  marketing: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.59V4a1 1 0 0 1 1-1h6.59a1 1 0 0 1 .7.3l6.42 6.4a1 1 0 0 1 0 1.42l-6.58 6.59a1 1 0 0 1-1.42 0L3.3 11.3a1 1 0 0 1-.3-.7z"/><circle cx="7" cy="7" r="1"/></svg>,
  reports: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H5.5A1.5 1.5 0 0 0 4 3.5v13A1.5 1.5 0 0 0 5.5 18h9a1.5 1.5 0 0 0 1.5-1.5V7l-4-5z"/><path d="M12 2v5h5"/><path d="M7 10h6"/><path d="M7 13h6"/></svg>,
  pages: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="14" height="16" rx="1.5"/><path d="M7 6h6"/><path d="M7 9.5h6"/><path d="M7 13h6"/></svg>,
  team: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="4"/><path d="M3 18.5v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/></svg>,
  autoreply: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="6" width="12" height="9" rx="2"/><circle cx="7.5" cy="10" r="1"/><circle cx="12.5" cy="10" r="1"/><path d="M10 15v2"/><path d="M7 18h6"/><path d="M10 3v3"/><path d="M7 3l3 3 3-3"/></svg>,
  activity: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h10a1 1 0 0 1 1 1v14.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V3a1 1 0 0 1 1-1z"/><path d="M7 6h6"/><path d="M7 9h6"/><path d="M7 12h4"/></svg>,
  notifications: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 14H4l1.5-5a4.5 4.5 0 0 1 8.9 0L16 14z"/><path d="M8.5 16a1.5 1.5 0 0 0 3 0"/></svg>,
  tools: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 7.7L5 3a2.1 2.1 0 0 0-3 3l4.7 5.3"/><path d="M12.4 9.8l3.7 3.7a2.1 2.1 0 0 1-3 3L9.4 13"/><circle cx="14.5" cy="14.5" r="4"/></svg>,
  billing: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="18" height="12" rx="1.5"/><path d="M1 8h18"/><circle cx="4.5" cy="12.5" r="1.5"/><path d="M9 12.5h4"/></svg>,
  support: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="8"/><path d="M7.5 8a2.5 2.5 0 1 1 4.5 1.5c-.8.9-2 1.5-2 2.5v.5"/><path d="M10 15.5v.01"/></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M17 10a7 7 0 0 1-.3 2.3l1.8 1.4-2 3.3-2.1-.7a7 7 0 0 1-2.8 1.6L11 19H9l-.6-2.1a7 7 0 0 1-2.8-1.6l-2.1.7-2-3.3 1.8-1.4A7 7 0 0 1 3 10a7 7 0 0 1 .3-2.3L1.5 6.3l2-3.3 2.1.7a7 7 0 0 1 2.8-1.6L9 1h2l.6 2.1a7 7 0 0 1 2.8 1.6l2.1-.7 2 3.3L17.3 7.7A7 7 0 0 1 17 10z"/></svg>,
}

const mobileNav = [
  { key: "dashboard", label: "الرئيسية", icon: "dashboard" },
  { key: "messages", label: "الرسائل", icon: "messages" },
  { key: "analytics", label: "تحليلات", icon: "analytics" },
  { key: "broadcast", label: "بث", icon: "broadcast" },
  { key: "settings", label: "الإعدادات", icon: "settings" },
]

const mobileIcons = {
  dashboard: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="11" width="3" height="7" rx=".5"/><rect x="8.5" y="7" width="3" height="11" rx=".5"/><rect x="15" y="3" width="3" height="15" rx=".5"/></svg>,
  messages: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 9a6.5 6.5 0 0 1-6.5 6.5H5l-3 2.5V6A2.5 2.5 0 0 1 4.5 3.5h6A6.5 6.5 0 0 1 17 9z"/></svg>,
  analytics: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 17.5h16"/><path d="M6 13.5L9 9l3 2 5-6"/></svg>,
  broadcast: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="15" r="1.5"/><path d="M6 11a5.66 5.66 0 0 1 8 0"/><path d="M3 7.5a10 10 0 0 1 14 0"/></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="2.5"/><path d="M17 10a7 7 0 0 1-.3 2.3l1.8 1.4-2 3.3-2.1-.7a7 7 0 0 1-2.8 1.6L11 19H9l-.6-2.1a7 7 0 0 1-2.8-1.6l-2.1.7-2-3.3 1.8-1.4A7 7 0 0 1 3 10a7 7 0 0 1 .3-2.3L1.5 6.3l2-3.3 2.1.7a7 7 0 0 1 2.8-1.6L9 1h2l.6 2.1a7 7 0 0 1 2.8 1.6l2.1-.7 2 3.3L17.3 7.7A7 7 0 0 1 17 10z"/></svg>,
}

export function Topbar({ currentPage, onNavigate, username, children, notifCount = 0 }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // IntersectionObserver for scroll-state — avoids style recalc per scroll frame
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
    return () => { obs.disconnect(); sentinel.remove() }
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
        <div className="sidebar-header">
          <div className="sidebar-logo"><img src="/static/favicon.png" alt="SmartBot" className="w-5 h-5 object-contain" /></div>
          <div className="sidebar-title">Smart<span style={{whiteSpace:"nowrap"}}>Bot</span><span>لوحة تحكم فيسبوك</span></div>
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
                  <span className="nav-icon">{navIcons[item.icon]}</span>
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
        <header className="header" style={{
          background: scrolled ? "color-mix(in oklch, var(--surface) 70%, transparent)" : "var(--surface)",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          borderBlockEnd: scrolled ? "1px solid var(--border)" : "1px solid transparent",
          transition: "background .3s var(--ease), backdrop-filter .3s var(--ease), border-color .3s var(--ease)",
        }}>
          {scrolled && <div className="shimmer-bar" aria-hidden="true" />}
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
          <h2 className="header-page-title" id="pageTitle">{pageTitles[currentPage] || currentPage}</h2>
          <div className="header-left">
            <div className="header-search" role="button" tabIndex="0" aria-label="بحث">
              <span><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="7.5" r="5"/><path d="M11.5 11.5l4 4"/></svg></span>
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
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 14H4l1.5-5a4.5 4.5 0 0 1 8.9 0L16 14z"/><path d="M8.5 16a1.5 1.5 0 0 0 3 0"/></svg>
              {notifCount > 0 && <span className="notif-dot"></span>}
            </div>
            <div className="avatar">{avatarLetter}</div>
            <span style={{display:"inline-flex",alignItems:"center",gap:"4px",fontSize:"11px",color:"var(--muted)",marginInlineStart:"4px"}}><span style={{width:"7px",height:"7px",borderRadius:"50%",background:"var(--success)",animation:"livePulse 2s ease-in-out infinite",flexShrink:0}}></span>مباشر</span>
          </div>
        </header>

        {children}

        {/* mobile bottom nav */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch border-t"
          style={{ background: "var(--surface)", borderColor: "var(--border)", paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "4rem" }}
        >
          {mobileNav.map((item) => {
            const active = currentPage === item.key
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 min-h-[3.5rem] px-2 py-1 transition-colors`}
                style={{ color: active ? "var(--accent)" : "var(--muted)" }}
              >
                {mobileIcons[item.icon]}
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full" style={{ background: "var(--accent)" }} />
                )}
              </button>
            )
          })}
        </nav>
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
