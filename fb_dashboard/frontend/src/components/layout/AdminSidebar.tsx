"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { fadeUp, stagger, springHover } from "@/lib/motion"
import {
  LayoutDashboard, MessageCircle, MessageSquare, Newspaper, Clock,
  BarChart3, Users, UserPlus, Target, Radio, Megaphone, FileBarChart,
  FileText, Users2, Calendar, Bot, Activity, Bell, Wrench, CreditCard,
  HelpCircle, Settings, LogOut, Sparkles,
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
    label: "الرئيسية",
    items: [
      { icon: LayoutDashboard, label: "لوحة البيانات", href: "/dashboard" },
      { icon: MessageCircle, label: "الرسائل", href: "/dashboard/messages" },
      { icon: MessageSquare, label: "التعليقات", href: "/dashboard/comments" },
      { icon: Newspaper, label: "المنشورات", href: "/dashboard/posts" },
      { icon: Clock, label: "المجدول", href: "/dashboard/scheduled" },
    ],
  },
  {
    label: "التحليل",
    items: [
      { icon: BarChart3, label: "التحليلات", href: "/dashboard/analytics" },
      { icon: Users, label: "الجمهور", href: "/dashboard/audience" },
      { icon: UserPlus, label: "العملاء المتوقعون", href: "/dashboard/leads" },
    ],
  },
  {
    label: "الأعمال",
    items: [
      { icon: Target, label: "الإعلانات", href: "/dashboard/ads" },
      { icon: Radio, label: "البث الجماعي", href: "/dashboard/broadcast" },
      { icon: Megaphone, label: "التسويق", href: "/dashboard/marketing" },
      { icon: FileBarChart, label: "التقارير", href: "/dashboard/reports" },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { icon: FileText, label: "الصفحات", href: "/dashboard/pages" },
      { icon: Users2, label: "الفريق", href: "/dashboard/team" },
      { icon: Calendar, label: "تقويم المحتوى", href: "/dashboard/calendar" },
      { icon: Bot, label: "الردود التلقائية", href: "/dashboard/autoreply" },
      { icon: Activity, label: "سجل النشاطات", href: "/dashboard/activity" },
    ],
  },
  {
    label: "أخرى",
    items: [
      { icon: Bell, label: "الإشعارات", href: "/dashboard/notifications" },
      { icon: Wrench, label: "الأدوات", href: "/dashboard/tools" },
      { icon: CreditCard, label: "الفواتير", href: "/dashboard/billing" },
      { icon: HelpCircle, label: "الدعم", href: "/dashboard/support" },
      { icon: Settings, label: "الإعدادات", href: "/dashboard/settings" },
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
  const pathname = usePathname() ?? ""

  return (
    <aside className={cn("flex flex-col h-full bg-card/95 backdrop-blur-md border-l border-border/60 shadow-sm", className)}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 p-4 border-b border-border/60">
        <div className="relative size-9 rounded-lg bg-gradient-to-br from-orange to-orange/70 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md shadow-orange/20 ring-1 ring-orange/30">
          {logo}
          <span className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full bg-green-500 ring-2 ring-card animate-pulse-dot" aria-label="متصل" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm leading-tight truncate">{title}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">لوحة التحكم</p>
        </div>
      </div>

      {/* Nav */}
      <motion.nav variants={stagger} initial="hidden" animate="visible" className="sidebar-scroll flex-1 overflow-y-auto p-3 space-y-5">
        {navSections.map((section, si) => (
          <motion.div key={si} variants={fadeUp}>
            <p className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-[0.12em]">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item, ii) => {
                const active = isActiveItem(item.href, pathname)
                return (
                  <motion.div
                    key={ii}
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.97 }}
                    transition={springHover}
                    onClick={() => onNavigate?.(item.href || "#")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate?.(item.href || "#") } }}
                    tabIndex={0}
                    role="link"
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    className={cn(
                      "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all duration-200 outline-none",
                      "focus-visible:ring-2 focus-visible:ring-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                      active
                        ? "bg-gradient-to-l from-orange to-orange/85 text-orange-foreground font-semibold shadow-md shadow-orange/25"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    {active && (
                      <span className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-e-full bg-orange-foreground/90" aria-hidden="true" />
                    )}
                    <item.icon className={cn("size-4 shrink-0 transition-transform duration-200", !active && "group-hover:scale-110")} />
                    <span className="truncate flex-1">{item.label}</span>
                    {item.badge !== undefined && (
                      <Badge
                        variant={active ? "outline" : "info"}
                        className={cn(
                          "ms-auto text-[10px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center font-bold",
                          active && "border-white/30 text-white"
                        )}
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        ))}
      </motion.nav>

      {/* Bottom */}
      <div className="p-3 border-t border-border/60 space-y-2 bg-card/50">
        {onSubscribe && (
          <button
            onClick={onSubscribe}
            className="group flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg bg-gradient-to-l from-orange to-orange/85 text-orange-foreground text-sm font-semibold hover:brightness-110 hover:shadow-lg hover:shadow-orange/20 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <Sparkles className="size-4 transition-transform duration-200 group-hover:rotate-12" /> اشتراك
          </button>
        )}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
        >
          <LogOut className="size-4" /> تسجيل الخروج
        </button>
      </div>
    </aside>
  )
}
