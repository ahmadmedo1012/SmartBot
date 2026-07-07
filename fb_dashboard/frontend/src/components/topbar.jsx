"use client"

import { useState } from "react"
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
  Gift,
} from "lucide-react"

const navItems = [
  { key: "dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { key: "rules", label: "القواعد", icon: Bot },
  { key: "replies", label: "الردود", icon: MessageSquareReply },
  { key: "messages", label: "الرسائل", icon: MessageSquare },
  { key: "posts", label: "المنشورات", icon: FileText },
  { key: "scheduled", label: "جدولة", icon: CalendarClock },
  { key: "quick-replies", label: "ردود سريعة", icon: BookmarkCheck },
  { key: "ai-assistant", label: "AI الذكي", icon: Brain },
  { key: "flows", label: "البوت البصري", icon: GitBranch },
  { key: "sequences", label: "التسلسلات", icon: Timer },
  { key: "broadcast", label: "البث الجماعي", icon: Radio },
  { key: "subscribers", label: "المشتركين", icon: Users },
  { key: "analytics-dashboard", label: "التحليلات", icon: BarChart3 },
  { key: "content-calendar", label: "التقويم", icon: Calendar },
  { key: "team", label: "فريق العمل", icon: Users, adminOnly: true },
  { key: "reports", label: "التقارير", icon: BarChart3 },
  { key: "offers", label: "العروض", icon: Gift },
  { key: "ads", label: "الإعلانات", icon: TrendingUp, adminOnly: true },
  { key: "users", label: "المستخدمين", icon: Users, adminOnly: true },
  { key: "settings", label: "الإعدادات", icon: Settings },
]

// Mobile bottom nav — show only the most used items
const mobileNav = [
  { key: "dashboard", label: "الرئيسية", icon: Home },
  { key: "messages", label: "الرسائل", icon: MessagesSquare },
  { key: "rules", label: "القواعد", icon: Bot },
  { key: "ai-assistant", label: "AI", icon: Sparkles },
  { key: "flows", label: "البوت", icon: GitBranch },
  { key: "analytics-dashboard", label: "التحليلات", icon: BarChart3 },
  { key: "settings", label: "الإعدادات", icon: Settings2 },
]

export function Topbar({ currentPage, onNavigate, username, role, onLogout }) {
  const { theme, setTheme } = useTheme()
  const roleLabel = role === "admin" ? "مدير" : role === "editor" ? "محرر" : "مشاهد"
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const filteredNav = navItems.filter(i => !i.adminOnly || role === "admin")

  return (
    <>
      {/* ── Desktop Topbar ── */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b bg-background/80 backdrop-blur-xl px-3 lg:px-5">
        <div className="flex items-center gap-2 overflow-hidden">
          {/* Mobile menu trigger */}
          <button className="md:hidden size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60"
            onClick={() => setMobileDrawerOpen(true)}>
            <Menu className="size-5" />
          </button>

          <span className="text-sm font-bold text-foreground tracking-wide shrink-0">SmartBot</span>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 overflow-x-auto mr-3">
            {filteredNav.map((item) => {
              const Icon = item.icon
              const active = currentPage === item.key
              return (
                <button key={item.key} onClick={() => onNavigate(item.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    active ? "topbar-nav-active" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                  }`}>
                  <Icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* User section */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60"
            aria-label={theme === "dark" ? "وضع فاتح" : "وضع غامق"}>
            {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                    {(username || "?").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-xs font-medium">{username}</span>
                <ChevronDown className="size-3.5" />
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
              <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive cursor-pointer">
                تسجيل الخروج
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Mobile Drawer ── */}
      {mobileDrawerOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setMobileDrawerOpen(false)} />
          <div className="fixed top-0 right-0 z-50 h-full w-[75vw] max-w-[280px] bg-card border-l border-border md:hidden overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-4 h-14 border-b">
              <span className="text-sm font-bold text-foreground">SmartBot</span>
              <button onClick={() => setMobileDrawerOpen(false)} className="size-8 flex items-center justify-center text-muted-foreground">
                ✕
              </button>
            </div>
            <nav className="flex flex-col gap-0.5 p-3">
              {filteredNav.map((item) => {
                const Icon = item.icon
                const active = currentPage === item.key
                return (
                  <button key={item.key}
                    onClick={() => { onNavigate(item.key); setMobileDrawerOpen(false) }}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all text-right ${
                      active ? "topbar-nav-active" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    }`}>
                    <Icon className="size-5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        </>
      )}

      {/* ── Mobile Bottom Nav ── */}
      <nav className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-around border-t bg-background/90 backdrop-blur-xl md:hidden px-1 pb-safe-or-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: '4rem' }}>
        {mobileNav.map((item) => {
          const Icon = item.icon
          const active = currentPage === item.key
          return (
            <button key={item.key} onClick={() => onNavigate(item.key)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg transition-all min-w-0 flex-1 ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              style={{ minHeight: '3rem' }}>
              <Icon className={`size-5 ${active ? "drop-shadow-[0_0_6px_hsl(var(--primary)/0.4)]" : ""}`} />
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
