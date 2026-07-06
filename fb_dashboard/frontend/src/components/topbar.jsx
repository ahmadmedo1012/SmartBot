"use client"

import { useState } from "react"
import { useTheme } from "@/components/theme-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { AnimatePresence, motion } from "framer-motion"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LayoutDashboard,
  BarChart3,
  Bot,
  MessageSquareReply,
  FileText,
  Smartphone,
  Settings,
  Users,
  Moon,
  Sun,
  MessageSquare,
  TrendingUp,
  ChevronDown,
  Menu,
  Radio,
  CalendarClock,
  BookmarkCheck,
  Brain,
} from "lucide-react"

const navItems = [
  { key: "dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { key: "analytics", label: "التحليلات", icon: BarChart3 },
  { key: "rules", label: "القواعد", icon: Bot },
  { key: "replies", label: "الردود", icon: MessageSquareReply },
  { key: "posts", label: "المنشورات", icon: FileText },
  { key: "messages", label: "الرسائل", icon: MessageSquare },
  { key: "scheduled", label: "مجدول", icon: CalendarClock },
  { key: "quick-replies", label: "ردود سريعة", icon: BookmarkCheck },
  { key: "ai-assistant", label: "AI الذكي", icon: Brain },
  { key: "ads", label: "الإعلانات", icon: TrendingUp, adminOnly: true },
  { key: "facebook", label: "فيسبوك", icon: Smartphone },
  { key: "webhook", label: "الويب هوك", icon: Radio },
  { key: "users", label: "المستخدمين", icon: Users, adminOnly: true },
  { key: "settings", label: "الإعدادات", icon: Settings },
]

export function Topbar({ currentPage, onNavigate, username, role, onLogout }) {
  const { theme, setTheme } = useTheme()
  const roleLabel = role === "admin" ? "مدير" : role === "editor" ? "محرر" : "مشاهد"
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b bg-background/80 backdrop-blur-xl px-4 lg:px-6">
      {/* Right: Logo + Mobile nav trigger + Desktop nav */}
      <div className="flex items-center gap-4 overflow-hidden">
        {/* Mobile menu button + slide-in panel */}
        <button className="md:hidden size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          onClick={() => setMobileOpen(true)}>
          <Menu className="size-5" />
        </button>
        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-black/40 md:hidden"
                onClick={() => setMobileOpen(false)}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed top-0 right-0 z-50 h-full w-[280px] bg-card border-l border-border md:hidden overflow-y-auto"
              >
                <div className="flex items-center gap-3 px-5 h-14 border-b border-border">
                  <span className="text-base font-bold text-foreground">SmartBot</span>
                </div>
                <nav className="flex flex-col gap-0.5 p-3">
                  {navItems
                    .filter((i) => !i.adminOnly || role === "admin")
                    .map((item) => {
                      const Icon = item.icon
                      const active = currentPage === item.key
                      return (
                        <button
                          key={item.key}
                          onClick={() => { onNavigate(item.key); setMobileOpen(false) }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-right ${
                            active
                              ? "topbar-nav-active"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent"
                          }`}
                        >
                          <Icon className="size-5 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      )
                    })}
                </nav>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <span className="text-base font-bold text-foreground tracking-wide shrink-0">SmartBot</span>
        <nav className="hidden md:flex items-center gap-0.5 overflow-x-auto">
          {navItems
            .filter((i) => !i.adminOnly || role === "admin")
            .map((item) => {
              const Icon = item.icon
              const active = currentPage === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    active
                      ? "topbar-nav-active"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              )
            })}
        </nav>
      </div>

      {/* Left: Theme + User */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="size-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={theme === "dark" ? "وضع فاتح" : "وضع غامق"}
        >
          {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <Avatar className="size-7 shrink-0">
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
  )
}
