"use client"

"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  LayoutDashboard, MessageCircle, Calendar, BarChart3, Users, Clock,
  Activity, Target, Settings, HelpCircle, LogOut, Bot, Sparkles,
} from "lucide-react"

interface NavSection {
  label: string
  items: NavItem[]
}

interface NavItem {
  icon: React.ComponentType<{ className?: string; size?: number }>
  label: string
  href?: string
  badge?: number | string
}

interface AdminSidebarProps {
  navSections?: NavSection[]
  logo?: string
  title?: string
  onNavigate?: (href: string) => void
  onLogout?: () => void
  onSubscribe?: () => void
  className?: string
}

function isActiveItem(href: string | undefined, pathname: string): boolean {
  if (!href) return false
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname.startsWith(href)
}

const defaultNavSections: NavSection[] = [
  {
    label: "عام",
    items: [
      { icon: LayoutDashboard, label: "لوحة البيانات", href: "/dashboard" },
      { icon: MessageCircle, label: "الرسائل", href: "/dashboard/messages", badge: 12 },
      { icon: Calendar, label: "التقويم", href: "/dashboard/calendar" },
      { icon: BarChart3, label: "التقارير", href: "/dashboard/reports" },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { icon: Users, label: "الجمهور", href: "/dashboard/audience" },
      { icon: Activity, label: "النشاطات", href: "/dashboard/activity" },
      { icon: Target, label: "الإعلانات", href: "/dashboard/ads" },
      { icon: Bot, label: "الردود التلقائية", href: "/dashboard/autoreply" },
      { icon: Clock, label: "جدولة", href: "/dashboard/scheduled" },
    ],
  },
  {
    label: "أخرى",
    items: [
      { icon: Settings, label: "الإعدادات", href: "/dashboard/settings" },
      { icon: HelpCircle, label: "المساعدة", href: "/dashboard/support" },
    ],
  },
]

export function AdminSidebar({
  navSections = defaultNavSections,
  logo = "S",
  title = "SmartBot",
  onNavigate,
  onLogout,
  onSubscribe,
  className,
}: AdminSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className={cn("flex flex-col h-full bg-card border-l border-border", className)}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 p-4 border-b border-border">
        <div className="size-9 rounded-lg bg-orange flex items-center justify-center text-white font-bold text-sm shrink-0">
          {logo}
        </div>
        <div>
          <p className="font-bold text-sm leading-tight">{title}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">لوحة التحكم</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-6">
        {navSections.map((section, si) => (
          <div key={si}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item, ii) => {
                const active = isActiveItem(item.href, pathname)
                return (
                  <div
                    key={ii}
                    onClick={() => onNavigate?.(item.href || "#")}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all duration-150",
                      active
                        ? "bg-orange text-orange-foreground font-medium shadow-sm shadow-orange/20"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.badge !== undefined && (
                      <Badge
                        variant={active ? "outline" : "info"}
                        className={cn(
                          "ms-auto text-[10px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center",
                          active && "border-white/30 text-white"
                        )}
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-border space-y-2">
        {onSubscribe && (
          <button
            onClick={onSubscribe}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg bg-orange text-orange-foreground text-sm font-medium hover:brightness-110 transition-all"
          >
            <Sparkles className="size-4" /> اشتراك
          </button>
        )}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="size-4" /> تسجيل الخروج
        </button>
      </div>
    </aside>
  )
}
