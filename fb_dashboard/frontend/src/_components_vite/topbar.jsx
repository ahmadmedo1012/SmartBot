import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { ThemeToggle } from "@/components/ThemeToggle"
import { ActionSearchBar } from "@/components/action-search-bar"
import { LayoutDashboard, MessageCircle, MessageSquare, FileText, Calendar, BarChart3, Users, Users2, Megaphone, TrendingUp, FileBarChart, Globe, UserPlus, Bell, Settings, Wrench, CreditCard, Headphones, Activity, Reply, Send } from "lucide-react"

const iconMap = {
  dashboard: LayoutDashboard, messages: MessageCircle, comments: MessageSquare,
  posts: FileText, scheduled: Calendar, analytics: BarChart3, audience: Users,
  leads: UserPlus, ads: Megaphone, marketing: TrendingUp, reports: FileBarChart,
  pages: Globe, team: Users2, autoreply: Reply, activity: Activity,
  notifications: Bell, tools: Wrench, billing: CreditCard, support: Headphones,
  settings: Settings, admin: Settings, broadcast: Send,
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
  { label: "المشرف", items: [
    { key: "admin", label: "الاشتراكات", icon: "settings" },
    { key: "settings", label: "الإعدادات", icon: "settings" },
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

export function Topbar({ currentPage, onNavigate, username, children, notifCount = 0, onLogout }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [hideHeader, setHideHeader] = useState(false)
  const lastY = useRef(0)

  // hide header on scroll down (Smart Menu behavior)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      if (y > 80) setHideHeader(y > lastY.current)
      lastY.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
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
      <aside className={`sidebar ${drawerOpen ? "open" : ""}`} id="sidebar" style={{ background: "color-mix(in oklch, var(--surface) 80%, transparent)", backdropFilter: "blur(32px)", WebkitBackdropFilter: "blur(32px)", borderInlineEnd: "1px solid color-mix(in oklch, var(--border) 20%, transparent)" }}>
        <div className="sidebar-header" style={{ position: "relative", overflow: "hidden", borderBlockEnd: "1px solid color-mix(in oklch, var(--border) 20%, transparent)" }}>
          <div className="sidebar-logo" style={{background:"linear-gradient(135deg, var(--primary), var(--accent))", boxShadow:"0 4px 10px color-mix(in oklch, var(--accent) 25%, transparent)"}}
            onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left)/r.width - 0.5; const y = (e.clientY - r.top)/r.height - 0.5; e.currentTarget.style.transform = `translate(${x*6}px, ${y*6}px) scale(1.05)` }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translate(0,0) scale(1)'; e.currentTarget.style.transition = 'transform 0.3s ease'; setTimeout(() => e.currentTarget.style.transition = '', 300) }}>
            <img src="/static/brand-icon.png" alt="SmartBot" className="w-5 h-5 object-contain" />
          </div>
          <div className="sidebar-title">
            <span style={{fontSize:"14px",fontWeight:700,color:"var(--fg)"}}>الربط الذكي</span>
            <span style={{fontSize:"10px", color:"var(--muted)"}}>لوحة تحكم فيسبوك</span>
          </div>
          <div className="shimmer-bar" aria-hidden="true" style={{position:"absolute",bottom:0,left:0,width:"100%",height:"1px",overflow:"hidden",pointerEvents:"none"}} />
        </div>
        <nav className="sidebar-nav" style={{ flex:1, overflowY:"auto", padding:"12px 8px" }}>
          {sidebarSections.map((section) => (
            <div key={section.label} style={{ marginBlockEnd: 4 }}>
              <div className="nav-section">{section.label}</div>
              {section.items.map((item) => (
                <a
                  key={item.key}
                  className={`nav-item ${currentPage === item.key ? "active" : ""}`}
                  onClick={(e) => { e.preventDefault(); handleNav(item.key); }}
                  onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleNav(item.key); }}}
                  href="#"
                  aria-current={currentPage === item.key ? "page" : undefined}
                  style={{ borderRadius: 12 }}
                >
                  <span className="nav-icon"><NavIcon name={item.icon} /></span>
                  {item.label}
                  {item.badge && parseInt(item.badge) > 0 && <span className="nav-badge">{item.badge}</span>}
                  {currentPage === item.key && (
                    <motion.span
                      layoutId="nav-active-indicator"
                      style={{position:"absolute",insetInlineEnd:0,insetBlock:"6px",width:"3px",background:"var(--accent)",borderRadius:"2px 0 0 2px",boxShadow:"0 0 8px color-mix(in oklch, var(--accent) 30%, transparent)",willChange:"transform"}}
                      transition={{type:"spring",stiffness:420,damping:28,mass:0.6}}
                    />
                  )}
                </a>
              ))}
            </div>
          ))}
        </nav>
        {/* Sidebar footer — logout + back to site */}
        <div style={{borderBlockStart:"1px solid color-mix(in oklch, var(--border) 20%, transparent)",padding:"12px 8px",display:"flex",flexDirection:"column",gap:2}}>
          <button onClick={()=>{onLogout?.();onNavigate&&onNavigate("login")}} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:12,fontSize:13,fontWeight:500,color:"var(--muted)",background:"none",border:0,cursor:"pointer",width:"100%",textAlign:"start",transition:"all .2s"}} onMouseEnter={e=>{e.currentTarget.style.background="color-mix(in oklch,var(--danger) 10%,transparent)";e.currentTarget.style.color="var(--danger)"}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="var(--muted)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            تسجيل الخروج
          </button>
          <button type="button" onClick={()=>onNavigate&&onNavigate("landing")} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onNavigate&&onNavigate("landing")}}} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:12,fontSize:13,fontWeight:500,color:"var(--muted)",cursor:"pointer",transition:"all .2s",background:"none",border:0,width:"100%",fontFamily:"inherit"}} onMouseEnter={e=>{e.currentTarget.style.background="color-mix(in oklch,var(--accent) 10%,transparent)";e.currentTarget.style.color="var(--fg)"}} onMouseLeave={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color="var(--muted)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 17 10 12 15 7"/><line x1="8" y1="12" x2="20" y2="12"/></svg>
            العودة للموقع
          </button>
        </div>
      </aside>

      {/* main area */}
      <div className="main">
        {/* header */}
        <header style={{
          position:"sticky",top:0,zIndex:30,
          borderBlockEnd:"1px solid color-mix(in oklch, var(--border) 30%, transparent)",
          background:"color-mix(in oklch, var(--bg) 70%, transparent)",
          backdropFilter:"blur(32px)", WebkitBackdropFilter:"blur(32px)",
          transition:"transform .3s ease",
          transform: hideHeader ? "translateY(-100%)" : "translateY(0)",
        }}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,height:56,padding:"0 16px",margin:"0 auto",maxWidth:"100%"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <button
                className="hamburger"
                id="hamburger"
                onClick={() => setDrawerOpen(true)}
                aria-label="القائمة"
                style={{display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,borderRadius:8,color:"var(--muted)",background:"none",border:0,cursor:"pointer",transition:"all .2s"}}
                onMouseEnter={e => {e.currentTarget.style.background="color-mix(in oklch, var(--accent) 15%, transparent)";e.currentTarget.style.color="var(--accent)"}}
                onMouseLeave={e => {e.currentTarget.style.background="none";e.currentTarget.style.color="var(--muted)"}}
              >
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h14"/><path d="M4 11h14"/><path d="M4 16h14"/>
                </svg>
              </button>
              <h2 className="page-title hidden sm:block" id="pageTitle" style={{fontSize:14,fontWeight:600,color:"var(--muted)"}}>{pageTitles[currentPage] || currentPage}</h2>
            </div>
            <div style={{flex:1,maxWidth:384,display:"flex",justifyContent:"center"}}>
              <ActionSearchBar onNavigate={onNavigate} currentPage={currentPage} />
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
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
                onClick={() => onNavigate("settings")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate("settings") }}}>{avatarLetter}</div>
              <ThemeToggle />
            </div>
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
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full" style={{ background: "var(--primary)" }} />
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
