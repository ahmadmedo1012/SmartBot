"use client"

import * as React from "react"
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
  active?: boolean
}

interface AdminSidebarProps {
  navSections?: NavSection[]
  logo?: string
  title?: string
  onNavigate?: (href: string) => void
  onSubscribe?: () => void
  className?: string
}

const defaultNavSections: NavSection[] = [
  {
    label: "عام",
    items: [
      { icon: LayoutDashboard, label: "لوحة البيانات", href: "/dashboard", active: true },
      { icon: MessageCircle, label: "الرسائل", href: "/messages", badge: 12 },
      { icon: Calendar, label: "التقويم", href: "/calendar" },
      { icon: BarChart3, label: "التقارير", href: "/reports" },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { icon: Users, label: "الجمهور", href: "/audience" },
      { icon: Activity, label: "النشاطات", href: "/activity" },
      { icon: Target, label: "الإعلانات", href: "/ads" },
      { icon: Bot, label: "الردود التلقائية", href: "/autoreply" },
      { icon: Clock, label: "جدولة", href: "/scheduled" },
    ],
  },
  {
    label: "أخرى",
    items: [
      { icon: Settings, label: "الإعدادات", href: "/settings" },
      { icon: HelpCircle, label: "المساعدة", href: "/support" },
    ],
  },
]

export function AdminSidebar({
  navSections = defaultNavSections,
  logo = "S",
  title = "SmartBot",
  onNavigate,
  onSubscribe,
  className,
}: AdminSidebarProps) {
  return (
    <aside className={cn("flex flex-col h-full bg-card border-l border-border", className)}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 p-4 border-b border-border">
        <div className="size-9 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
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
              {section.items.map((item, ii) => (
                <div
                  key={ii}
                  onClick={() => onNavigate?.(item.href || "#")}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all duration-150",
                    item.active
                      ? "bg-orange-500 text-white font-medium shadow-sm shadow-orange-500/20"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <Badge
                      variant={item.active ? "outline" : "info"}
                      className={cn(
                        "ms-auto text-[10px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center",
                        item.active && "border-white/30 text-white"
                      )}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-border space-y-2">
        {onSubscribe && (
          <button
            onClick={onSubscribe}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            <Sparkles className="size-4" /> اشتراك
          </button>
        )}
        <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <LogOut className="size-4" /> تسجيل الخروج
        </button>
      </div>
    </aside>
  )
}
