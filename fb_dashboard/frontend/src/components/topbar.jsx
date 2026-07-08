"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "@/components/theme-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard, Bot, MessageSquareReply, FileText,
  MessageSquare, Settings, Users, Moon, Sun,
  TrendingUp, ChevronDown, Menu,
  CalendarClock, BookmarkCheck, Brain,
  Home, MessagesSquare, Sparkles, BarChart3, Settings2,
  Gift, PanelLeftClose, PanelLeft, Search,
  Activity, Radio,
} from "lucide-react"
import { NotificationBell } from "@/components/notification-bell"

/* ── sidebar section groups ── */
const sidebarSections = [
  {
    label: "الرئيسية",
    items: [
      { key: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
      { key: "messages", label: "الرسائل", icon: MessageSquare },
      { key: "comments", label: "التعليقات", icon: MessageSquareReply },
    ],
  },
  {
    label: "الأتمتة",
    items: [
      { key: "rules", label: "القواعد", icon: Bot },
      { key: "replies", label: "الردود", icon: MessageSquareReply },
      { key: "ai-assistant", label: "AI الذكي", icon: Brain },
      { key: "agent-chat", label: "الوكيل الذكي", icon: Sparkles },
    ],
  },
  {
    label: "المحتوى",
    items: [
      { key: "posts", label: "المنشورات", icon: FileText },
      { key: "scheduled", label: "التقويم", icon: CalendarClock },
      { key: "offers", label: "العروض", icon: Gift },
    ],
  },
  {
    label: "التقارير",
    items: [
      { key: "reports", label: "التقارير", icon: BarChart3 },
      { key: "insights", label: "تحليلات", icon: TrendingUp },
      { key: "quick-replies", label: "ردود سريعة", icon: BookmarkCheck },
    ],
  },
  {
    label: "المراقبة",
    items: [
      { key: "live-logs", label: "السجل المباشر", icon: Activity },
    ],
  },
  {
    label: "الإدارة",
    adminOnly: true,
    items: [
      { key: "ads", label: "الإعلانات", icon: TrendingUp },
      { key: "users", label: "المستخدمين", icon: Users },
      { key: "settings", label: "الإعدادات", icon: Settings },
    ],
  },
]

const mobileNav = [
  { key: "dashboard", label: "الرئيسية", icon: Home },
  { key: "messages", label: "الرسائل", icon: MessagesSquare },
  { key: "rules", label: "القواعد", icon: Bot },
  { key: "ai-assistant", label: "AI", icon: Sparkles },
  { key: "settings", label: "الإعدادات", icon: Settings2 },
]

/* ── helpers ── */

function SidebarNavItem({ item, active, collapsed, onClick }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer ${
        collapsed ? "justify-center px-0 py-3" : "gap-3 px-3 py-2.5"
      } ${
        active
          ? "text-white bg-white/10"
          : "text-white/45 hover:text-white/75 hover:bg-white/[0.04]"
      }`}
      aria-label={item.label}
    >
      {active && (
        <span className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
      )}
      <Icon className={`size-[18px] shrink-0 ${active ? "drop-shadow-[0_0_6px_rgba(52,211,153,0.4)]" : ""}`} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  )
}

function SidebarSectionGroup({ label, items, currentPage, onNavigate, collapsed, role }) {
  const filtered = items.filter((i) => !i.adminOnly || role === "admin")
  if (filtered.length === 0) return null

  return (
    <div className="mb-3 last:mb-0">
      {!collapsed && (
        <div className="px-4 mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/20">
            {label}
          </span>
        </div>
      )}
      <div className="space-y-0.5 px-2">
        {filtered.map((item) => (
          <SidebarNavItem
            key={item.key}
            item={item}
            active={currentPage === item.key}
            collapsed={collapsed}
            onClick={() => onNavigate(item.key)}
          />
        ))}
      </div>
    </div>
  )
}

function UserDropdown({ username, roleLabel, theme, setTheme, onLogout }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors">
          <Avatar className="size-7 ring-2 ring-border ring-offset-2 ring-offset-background shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {(username || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:flex flex-col items-start">
            <span className="text-xs font-medium leading-tight">{username}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{roleLabel}</span>
          </div>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-medium text-sm">{username}</span>
            <span className="text-xs text-muted-foreground">{roleLabel}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="cursor-pointer gap-2">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {theme === "dark" ? "الوضع الفاتح" : "الوضع الغامق"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive cursor-pointer gap-2">
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ── ThemeToggle with smooth icon transition ── */
function ThemeToggle({ theme, size = "size-[18px]" }) {
  return (
    <div className="relative inline-flex items-center justify-center">
      <Sun
        className={`${size} absolute transition-all duration-300 ${
          theme === "dark"
            ? "opacity-100 rotate-0 scale-100"
            : "opacity-0 rotate-90 scale-75"
        }`}
      />
      <Moon
        className={`${size} transition-all duration-300 ${
          theme === "dark"
            ? "opacity-0 -rotate-90 scale-75"
            : "opacity-100 rotate-0 scale-100"
        }`}
      />
    </div>
  )
}

/* ── main component ── */

export function Topbar({ currentPage, onNavigate, username, role, onLogout, children }) {
  const { theme, setTheme } = useTheme()
  const roleLabel = role === "admin" ? "مدير" : role === "editor" ? "محرر" : "مشاهد"
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const filteredSections = sidebarSections.filter((s) => !s.adminOnly || role === "admin")

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark")
  const sidebarWidth = sidebarCollapsed ? 64 : 240

  return (
    <div className="flex h-svh overflow-hidden" dir="rtl">
      {/* ════════════════ DESKTOP SIDEBAR ════════════════ */}
      <motion.aside
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="hidden md:flex flex-col h-svh glass-sidebar fixed right-0 top-0 z-30 overflow-hidden"
      >
        {/* logo */}
        <div
          className={`flex items-center shrink-0 border-b border-white/[0.04] h-12 ${
            sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-4"
          }`}
        >
          <div className="size-7 shrink-0 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
            <Bot className="size-3.5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm font-bold text-white tracking-wide"
            >
              SmartBot
            </motion.span>
          )}
        </div>

        {/* nav */}
        <div className="flex-1 overflow-y-auto py-3 space-y-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">
          {filteredSections.map((section) => (
            <SidebarSectionGroup
              key={section.label}
              label={section.label}
              items={section.items}
              currentPage={currentPage}
              onNavigate={onNavigate}
              collapsed={sidebarCollapsed}
              role={role}
            />
          ))}
        </div>

        {/* user area + collapse */}
        <div className="border-t border-white/[0.04] p-2 space-y-1">
          {/* avatar with status dot */}
          <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${sidebarCollapsed ? "justify-center" : ""}`}>
            <div className="relative shrink-0">
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {(username || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 border-2 border-[#0b0d15]" />
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col items-start min-w-0">
                <span className="text-xs font-medium text-white truncate w-full">{username}</span>
                <span className="text-[10px] text-white/40">{roleLabel}</span>
              </div>
            )}
          </div>

          {/* collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed((p) => !p)}
            className="flex items-center justify-center w-full gap-2 py-2 rounded-lg text-xs text-white/35 hover:text-white/65 hover:bg-white/[0.04] transition-colors"
            aria-label={sidebarCollapsed ? "توسيع القائمة" : "طي القائمة"}
            title={sidebarCollapsed ? "توسيع القائمة" : "طي القائمة"}
          >
            {sidebarCollapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!sidebarCollapsed && <span>طي القائمة</span>}
          </button>
        </div>
      </motion.aside>

      {/* ════════════════ MAIN CONTENT COLUMN ════════════════ */}
      <div
        className={`flex flex-1 flex-col min-w-0 transition-[margin-right] duration-200 ease-in-out ${
          sidebarCollapsed ? "md:mr-[64px]" : "md:mr-[240px]"
        }`}
      >
        {/* ── desktop minimal topbar ── */}
        <header className="hidden md:flex items-center justify-between h-14 px-4 lg:px-6 border-b border-border bg-background/60 backdrop-blur-2xl shrink-0">
          <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/40 text-muted-foreground text-xs w-56 cursor-default">
            <Search className="size-3.5 shrink-0" />
            <span>بحث...</span>
          </div>
          <div className="lg:hidden" />

          <div className="flex items-center gap-0.5">
            <NotificationBell />
            <button
              onClick={toggleTheme}
              className="size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              aria-label={theme === "dark" ? "وضع فاتح" : "وضع غامق"}
            >
              <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            </button>
            <UserDropdown username={username} roleLabel={roleLabel} theme={theme} setTheme={setTheme} onLogout={onLogout} />
          </div>
        </header>

        {/* ── mobile topbar ── */}
        <header className="md:hidden flex items-center justify-between h-14 px-3 shrink-0 border-b border-border bg-background/60 backdrop-blur-2xl">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            aria-label="فتح القائمة"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm">
              <Bot className="size-3.5 text-white" />
            </div>
            <span className="text-sm font-bold">SmartBot</span>
          </div>
          <button
            onClick={toggleTheme}
            className="size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            aria-label={theme === "dark" ? "وضع فاتح" : "وضع غامق"}
          >
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          </button>
        </header>

        {/* ── content ── */}
        <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          {children}
        </main>

        {/* ── mobile bottom nav ── */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch border-t bg-background/90 backdrop-blur-xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "4rem" }}
        >
          {mobileNav.map((item) => {
            const Icon = item.icon
            const active = currentPage === item.key
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 min-h-[3.5rem] px-2 py-1 transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`size-5 ${active ? "fill-current" : ""}`} />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full bg-primary" />
                )}
              </button>
            )
          })}
        </nav>

        {/* ── mobile drawer (bottom sheet) ── */}
        <AnimatePresence>
          {mobileDrawerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden"
                onClick={() => setMobileDrawerOpen(false)}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 400, mass: 0.8 }}
                className="fixed bottom-0 right-0 left-0 z-50 bg-card rounded-t-2xl border border-border md:hidden shadow-xl max-h-[85vh] overflow-y-auto"
                style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
              >
                {/* grab handle */}
                <div className="sticky top-0 bg-card z-10 pt-2 pb-1 rounded-t-2xl">
                  <div className="flex justify-center">
                    <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                  </div>
                </div>

                {/* user info */}
                <div className="flex items-center gap-3 px-4 py-3 mb-1">
                  <Avatar className="size-10 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                      {(username || "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{username}</span>
                    <span className="text-xs text-muted-foreground">{roleLabel}</span>
                  </div>
                </div>

                <div className="border-t border-border" />

                {/* sections */}
                <div className="px-3 py-3 pb-6">
                  {filteredSections.map((section) => {
                    const filtered = section.items.filter((i) => !i.adminOnly || role === "admin")
                    if (filtered.length === 0) return null
                    return (
                      <div key={section.label} className="mb-2 last:mb-0">
                        <div className="px-3 py-2">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
                            {section.label}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {filtered.map((item) => {
                            const Icon = item.icon
                            const active = currentPage === item.key
                            return (
                              <button
                                key={item.key}
                                onClick={() => {
                                  onNavigate(item.key)
                                  setMobileDrawerOpen(false)
                                }}
                                className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium transition-colors text-right ${
                                  active
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                                }`}
                              >
                                <Icon className="size-5 shrink-0" />
                                <span>{item.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {/* logout */}
                  <div className="mt-4 pt-3 border-t border-border">
                    <button
                      onClick={onLogout}
                      className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      تسجيل الخروج
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
