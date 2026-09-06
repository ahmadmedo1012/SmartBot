"use client"

import * as React from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  LayoutDashboard, MessageCircle, MessageSquare, Newspaper, Clock,
  BarChart3, Users, UserPlus, Target, Radio, Megaphone, FileBarChart,
  FileText, Users2, Calendar, Bot, Activity, Bell, Wrench, CreditCard,
  HelpCircle, Settings, LogOut, Sparkles,
} from "lucide-react"

export interface NavSection {
  label: string
  items: NavItem[]
}

export interface NavItem {
  icon: React.ComponentType<{ className?: string; size?: number }>
  label: string
  href?: string
  badge?: number | string
  /** CSS id for the onboarding tour (react-joyride targets) */
  tourId?: string
}

interface AdminSidebarProps {
  navSections?: NavSection[]
  logo?: string
  title?: string
  onNavigate?: (href: string) => void
  onLogout?: () => void
  onSubscribe?: () => void
  className?: string
  /** v4 plan §3.2 — demo mode: drive the active indicator from an external
   * href (the public /demo page switches tabs without changing the URL).
   * Unset → real pathname, exactly as before. */
  activeHref?: string
}
function isActiveItem(href: string | undefined, pathname: string): boolean {
  if (!href) return false
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname.startsWith(href)
}

export const defaultNavSections: NavSection[] = [
  {
    label: "الرئيسية",
    items: [
      { icon: LayoutDashboard, label: "لوحة التحكم", href: "/dashboard" },
      { icon: MessageCircle, label: "الرسائل", href: "/dashboard/messages" },
      { icon: MessageSquare, label: "التعليقات", href: "/dashboard/comments" },
      { icon: Newspaper, label: "المنشورات", href: "/dashboard/posts" },
      { icon: Clock, label: "المجدول", href: "/dashboard/scheduled" },
    ],
  },
  {
    label: "التحليلات",
    items: [
      { icon: BarChart3, label: "التحليلات", href: "/dashboard/analytics", tourId: "sidebar-analytics" },
      { icon: Users, label: "الجمهور", href: "/dashboard/audience", tourId: "sidebar-subscribers" },
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
      { icon: FileText, label: "الصفحات", href: "/dashboard/pages", tourId: "sidebar-pages" },
      { icon: Users2, label: "الفريق", href: "/dashboard/team" },
      { icon: Calendar, label: "تقويم المحتوى", href: "/dashboard/calendar" },
      { icon: Bot, label: "الردود التلقائية", href: "/dashboard/autoreply", tourId: "sidebar-rules" },
      { icon: Activity, label: "سجل النشاطات", href: "/dashboard/activity" },
    ],
  },
  {
    label: "المزيد",
    items: [
      { icon: Bell, label: "الإشعارات", href: "/dashboard/notifications" },
      { icon: Wrench, label: "الأدوات", href: "/dashboard/tools" },
      { icon: CreditCard, label: "الفواتير", href: "/dashboard/billing", tourId: "subscribe-btn" },
      { icon: HelpCircle, label: "الدعم", href: "/dashboard/support" },
      { icon: Settings, label: "الإعدادات", href: "/dashboard/settings" },
    ],
  },
]

export function AdminSidebar({
  navSections = defaultNavSections,
  logo,
  title = "SmartBot",
  onNavigate,
  onLogout,
  onSubscribe,
  className,
  activeHref,
}: AdminSidebarProps) {
  const pathname = usePathname() ?? ""

  return (
    <aside className={cn("flex flex-col h-full bg-card/80 backdrop-blur-md border-l border-border/50 shadow-sm", className)}>
      {/* Logo — the REAL brand image (v3 §5.1): same /brand-icon.png asset
          Header.tsx already serves, ending the text-"S" placeholder era. */}
      <div className="flex items-center gap-3 border-b border-border/20 px-5 py-5 min-h-[72px]">
        <div className="relative shrink-0">
          <Image
            src="/brand-icon.png"
            alt="SmartBot"
            width={64}
            height={64}
            className="size-8 rounded-lg object-cover"
            priority
          />
          {/* v8-B13: aria-label on a bare span is ignored by AT — role="status"
              exposes the connection state (the dot itself is decorative) */}
          <span role="status" className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full bg-success ring-2 ring-card animate-pulse-dot" aria-label="متصل" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{title}</p>
          <p className="text-2xs text-muted-foreground leading-tight">لوحة التحكم</p>
        </div>
      </div>

      {/* Nav — v6+ framer-free: section stagger is CSS animation-delay,
       * item hover/tap are Tailwind translate/scale (individual CSS props,
       * composable), active indicator renders per-item (no layoutId slide). */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-5 space-y-5">
        {navSections.map((section, si) => (
          <div key={si} className="animate-fade-in" style={{ animationDelay: `${80 + si * 50}ms` }}>
            {/* v9-D2: text-muted-foreground/70 measured 3.21-3.27:1 (axe
             * color-contrast serious). Full-opacity --muted-foreground on the
             * bg-card/80-over-background surface measures 5.62:1 (dark) /
             * 6.49:1 (light) — both ≥ 4.5:1 AA. Size stays text-3xs;
             * the site-wide 2xs/3xs migration is wave-2, not this fix. */}
            <p className="px-3 pb-1.5 text-3xs font-bold text-muted-foreground uppercase tracking-[0.12em]">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item, ii) => {
                const active = isActiveItem(item.href, activeHref ?? pathname)
                return (
                  <div
                    key={ii}
                    id={item.tourId}
                    onClick={() => onNavigate?.(item.href || "#")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate?.(item.href || "#") } }}
                    tabIndex={0}
                    role="link"
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    className={cn(
                      "group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-sm font-medium cursor-pointer transition-[color,background-color,box-shadow,translate,scale] duration-200 outline-none",
                      "hover:translate-x-[3px] active:scale-[0.97]",
                      "focus-visible:ring-2 focus-visible:ring-accent-foreground/60",
                      /* Active/hover treatment unified with Smart-Menu NavLink:
                         soft orange tint + end-side spring indicator, not a solid fill */
                      active
                        ? "bg-accent-foreground/12 text-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-accent-foreground/8 hover:text-foreground"
                    )}
                  >
                    {active && (
                      <span
                        className="absolute end-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    )}
                    <item.icon className={cn(
                      "size-4 shrink-0 transition-[color,transform,translate,scale,rotate,filter] duration-200",
                      active && "text-accent-foreground",
                      !active && "group-hover:scale-110 group-hover:text-primary/70 group-hover:drop-shadow-sm"
                    )} />
                    <span className="truncate flex-1">{item.label}</span>
                    {item.badge !== undefined && (
                      <Badge
                        variant={active ? "outline" : "info"}
                        className={cn(
                          "ms-auto text-3xs px-1.5 py-0 h-4 min-w-4 flex items-center justify-center font-bold",
                          active && "border-accent-foreground/40 text-accent-foreground"
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
      <div className="p-3 border-t border-border/60 space-y-2 bg-card/50">
        {onSubscribe && (
          <button
            onClick={onSubscribe}
            className="group flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-lg bg-gradient-to-l from-accent-foreground to-accent-foreground/85 text-primary-foreground text-sm font-semibold hover:brightness-110 hover:shadow-lg hover:shadow-accent-foreground/20 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <Sparkles className="size-4 transition-transform duration-200 group-hover:rotate-12" /> اشتراك
          </button>
        )}
        <button
          onClick={onLogout}
          className="flex min-h-11 items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60"
        >
          <LogOut className="size-4 rtl:-scale-x-100" /> تسجيل الخروج
        </button>
      </div>
    </aside>
  )
}
