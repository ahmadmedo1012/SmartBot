"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import {
  LayoutDashboard, MessageCircle, MessageSquare, Newspaper, Clock,
  BarChart3, Users, UserPlus, Target, Radio, Megaphone, FileBarChart,
  Workflow, FileText, Users2, Calendar, Bot, Activity, Bell, Wrench, CreditCard,
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
  /** r131-F7: directional glyphs (e.g. Send) mirror in RTL — the admin
   * shell's تليجرام slot matches AdminMobileNav's flip for the same icon. */
  rtlFlip?: boolean
}

interface AdminSidebarProps {
  navSections?: NavSection[]
  logo?: string
  title?: string
  /** r131-F7: brand-block subtitle — the tenant shell says «لوحة التحكم»,
   * the /admin platform shell says «الإدارة» (was hardcoded). */
  subtitle?: string
  /* v24-C3 (A2 #2 + B4 — native <Link> nav items): items are real <Link>s
   * now (viewport prefetch of the RSC payload, native Enter/Space/middle-
   * click semantics, no div[role=link] ARIA patching). onNavigate is
   * OPTIONAL and only used as an INTERCEPTOR by hosts that map sidebar
   * hrefs to in-page tabs (the /demo switcher): the click is prevented and
   * delegated, exactly like the old onClick wiring. The real dashboard
   * shell passes nothing → native Link navigation. */
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
  /* Section ROOTS are exact-match only so the root slot doesn't light up
   * on its own children (v17-E-F2 contract). r131-F7: /admin joins
   * /dashboard — the platform-admin shell now routes the same way and
   * «الاشتراكات» must stay cold on /admin/support|telegram|settings. */
  if (href === "/dashboard" || href === "/admin") return pathname === href
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
      /* v17-E-F9: Pro 129 «حملات تسلسلية» — الواجهة كانت غائبة رغم محرك
         حيّ منذ v16؛ MobileBottomNav يرثها تلقائيًا (defaultNavSections). */
      { icon: Workflow, label: "الحملات التسلسلية", href: "/dashboard/sequences" },
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
  logo: _logo,
  title = "SmartBot",
  subtitle = "لوحة التحكم",
  onNavigate,
  onLogout,
  onSubscribe,
  className,
  activeHref,
}: AdminSidebarProps) {
  const pathname = usePathname() ?? ""

  /* v24-C3: Link click contract — when a host passed the onNavigate
   * interceptor (demo tab switch), preventDefault and delegate so the URL
   * never changes; otherwise let <Link> navigate with its prefetch. */
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (onNavigate) {
      e.preventDefault()
      onNavigate(href)
    }
  }

  return (
    /* Madarek sidebar (§5.5): 256px rail, flat hairline chrome. Dark mode
     * paints the سماء مدارك night sky (.mdrk-night-sky — vertical gradient
     * + gold aurora + constellation dust, exact Madarek recipe); light mode
     * reverts to the flat cream surface via the html.light override. */
    <aside className={cn("mdrk-night-sky flex flex-col h-full border-e border-border text-sm", className)}>
      {/* Logo — the REAL brand image (v3 §5.1): same /brand-icon.png asset
          Header.tsx already serves. Madarek brand block: 12px padding,
          28px mark, hairline block-end rule. */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-4 min-h-[72px]">
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
          <p className="text-2xs text-muted-foreground leading-tight">{subtitle}</p>
        </div>
      </div>

      {/* Nav — v6+ framer-free: section stagger is CSS animation-delay.
       * v24-C3 (A2 #2 + B4): items are native <Link>s — App Router
       * prefetches each section's RSC payload while the link is visible
       * (the whole 23-section list sits in the desktop viewport), Enter/Space
       * are native anchor semantics, and the div[role=link] ARIA patch (B4)
       * is now a real link.
       * Madarek anatomy (§5.5): 22px-icon grid items, 8px radius, 13px/500
       * labels, active = gold wash + 3px inline-start rail + breathing halo
       * (dark) / flat neutral-150 wash (light) — all in the .sb-nav-item
       * CSS. Touch floor: 44px min item height (a11y contract). */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {navSections.map((section, si) => (
          // r130 (W1-G SB-P2-6): section stagger 50 → 60ms steps
          // (--motion-stagger-step grammar).
          <div key={si} className="animate-fade-in" style={{ animationDelay: `${80 + si * 60}ms` }}>
            {/* Madarek nav-section-label: 11px/600/muted, zero tracking
             * (Arabic ruling), hairline gradient underline — .sb-section-label. */}
            <p className="sb-section-label">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item, ii) => {
                const active = isActiveItem(item.href, activeHref ?? pathname)
                return (
                  <Link
                    key={ii}
                    id={item.tourId}
                    href={item.href ?? "#"}
                    onClick={(e) => handleLinkClick(e, item.href || "#")}
                    /* v24-C3: prefetch only in native-Link mode — when a host
                     * intercepts clicks (demo tab switch), the href is never
                     * actually navigated, so prefetching it is pure waste. */
                    prefetch={onNavigate ? false : undefined}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    data-active={active ? "true" : undefined}
                    className={cn(
                      "sb-nav-item outline-none",
                      "focus-visible:ring-2 focus-visible:ring-accent-foreground/60"
                    )}
                  >
                    <item.icon className={cn("sb-nav-icon size-[18px] shrink-0", item.rtlFlip && "rtl:-scale-x-100")} />
                    <span className="truncate flex-1 text-start">{item.label}</span>
                    {item.badge !== undefined && (
                      <Badge
                        variant={active ? "outline" : "info"}
                        className={cn(
                          /* r131-F7 (A4 P3-9): nav badge rides the canonical 11px/600 register — font-bold (700) was one rung over. */
                          "ms-auto text-3xs px-1.5 py-0 h-4 min-w-4 flex items-center justify-center font-semibold",
                          active && "border-accent-foreground/40 text-accent-foreground"
                        )}
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom — Madarek sidebar-footer: hairline block-start rule. */}
      <div className="p-3 border-t border-border space-y-2">
        {onSubscribe && (
          /* Madarek .btn.accent: flat brand fill (gold/copper) + accent-fg
           * label — the orange gradient + glow CTA is retired. */
          <button
            onClick={onSubscribe}
            className="group flex items-center justify-center gap-2 w-full min-h-11 py-2.5 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.97] active:duration-(--t-micro) transition-[background-color,transform,box-shadow] duration-(--duration-fast) ease-smooth shadow-sm hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <Sparkles className="size-4 transition-transform duration-(--duration-fast) group-hover:rotate-12" /> اشتراك
          </button>
        )}
        {/* v19 Step 3 — theme toggle inside the dashboard: ThemeToggle existed
            and worked (Header/login/register) but was NEVER mounted here or
            in MobileBottomNav, so the switcher vanished right after login
            (the live complaint). Sits beside logout — the natural spot for a
            personal quick setting; size-11 keeps the 44px touch target. */}
        <div className="flex items-center gap-2">
          <ThemeToggle className="!size-11 shrink-0" />
          <button
            onClick={onLogout}
            className="flex min-h-11 flex-1 items-center justify-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-(--t-fast) outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60"
          >
            <LogOut className="size-4 rtl:-scale-x-100" /> تسجيل الخروج
          </button>
        </div>
      </div>
    </aside>
  )
}
