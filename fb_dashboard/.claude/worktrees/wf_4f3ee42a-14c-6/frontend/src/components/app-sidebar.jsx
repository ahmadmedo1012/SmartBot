"use client"

import { useState } from "react"
import { useTheme } from "@/components/theme-provider"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from "@/components/ui/sidebar"
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
} from "lucide-react"

const navSections = [
  {
    label: "التشغيل",
    items: [
      { key: "dashboard", label: "الرئيسية", icon: LayoutDashboard },
      { key: "analytics", label: "التحليلات", icon: BarChart3 },
      { key: "rules", label: "القواعد", icon: Bot },
      { key: "replies", label: "الردود", icon: MessageSquareReply },
      { key: "posts", label: "المنشورات", icon: FileText },
      { key: "messages", label: "الرسائل", icon: MessageSquare },
      { key: "ads", label: "الإعلانات", icon: TrendingUp, adminOnly: true },
      { key: "facebook", label: "فيسبوك", icon: Smartphone },
    ],
  },
  {
    label: "النظام",
    items: [
      { key: "users", label: "المستخدمين", icon: Users, adminOnly: true },
      { key: "settings", label: "الإعدادات", icon: Settings },
    ],
  },
]

function AvatarCircle({ name }) {
  const initial = (name || "?").charAt(0).toUpperCase()
  return (
    <Avatar className="size-8 shrink-0">
      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
        {initial}
      </AvatarFallback>
    </Avatar>
  )
}

function NavItem({ item, active, onClick }) {
  const Icon = item.icon
  return (
    <button
      onClick={() => onClick(item.key)}
      className={`w-full relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.98] group text-right ${
        active
          ? "bg-primary text-primary-foreground font-semibold shadow-sm"
          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
    </button>
  )
}

export function AppSidebar({ currentPage, onNavigate, username, role, onLogout }) {
  const { theme, setTheme } = useTheme()
  const [, setUserMenuOpen] = useState(false)
  const roleLabel = role === "admin" ? "مدير" : role === "editor" ? "محرر" : "مشاهد"

  return (
    <Sidebar collapsible="icon" side="right" className="shrink-0 border-l border-sidebar-border bg-sidebar">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="size-11 shrink-0 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md p-2">
            <img src="/static/favicon.svg" alt="SmartBot" className="w-full h-full brightness-0 invert" />
          </div>
          <span className="text-base font-bold text-sidebar-foreground tracking-wide group-data-[collapsible=icon]:hidden">
            SmartBot
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <nav className="flex-1 px-3 py-2 space-y-5">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="section-group-header group-data-[collapsible=icon]:hidden">
                {section.label}
              </div>
              <div className="space-y-1">
                {section.items
                  .filter((i) => !i.adminOnly || role === "admin")
                  .map((item) => (
                    <NavItem
                      key={item.key}
                      item={item}
                      active={currentPage === item.key}
                      onClick={onNavigate}
                    />
                  ))}
              </div>
            </div>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <div className="p-2 space-y-2">
          {username && (
            <div className="relative">
              <DropdownMenu onOpenChange={setUserMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center">
                    <AvatarCircle name={username} />
                    <div className="flex-1 text-right group-data-[collapsible=icon]:hidden">
                      <div className="text-xs font-medium text-sidebar-foreground truncate">{username}</div>
                      <div className="text-[10px] text-sidebar-foreground/50">{roleLabel}</div>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="w-48">
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
          )}
          <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
            <Button variant="ghost" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="gap-2 px-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg h-8 text-xs flex-1 justify-start group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center">
              {theme === "dark" ? <Sun className="size-3.5 shrink-0" /> : <Moon className="size-3.5 shrink-0" />}
              <span className="group-data-[collapsible=icon]:hidden">{theme === "dark" ? "وضع فاتح" : "وضع غامق"}</span>
            </Button>
            <SidebarTrigger className="size-8 shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg" />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
