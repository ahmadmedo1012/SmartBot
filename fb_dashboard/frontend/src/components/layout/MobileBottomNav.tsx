"use client"

/**
 * MobileBottomNav (latest_plan.md Track F.1/F.2).
 *
 * Bottom bar with the 5 highest-traffic sections + a "المزيد" sheet holding
 * ALL 23 sections — same nav data source as AdminSidebar (no duplication).
 * Visible only below md (sidebar is `hidden md:block`).
 * Every section is reachable within 2 taps (bar item = 1, sheet item = 2).
 *
 * v6+: the sheet presence (AnimatePresence + motion) is now pure CSS
 * (.sheet-backdrop/.sheet-panel twins in globals.css) — framer-motion
 * leaves the /demo first-load. The panel stays mounted so the exit
 * transition plays; hidden state is pointer-events-none + tabIndex -1.
 *
 * v24-C3 (A2 #2): every nav item is a real <Link> (not a button +
 * router.push) so App Router prefetches the route's RSC payload while the
 * link is visible — the always-visible 4 bar items make the hottest
 * sections effectively instant after the first visit, and the sheet's 23
 * items prefetch only while the sheet is open (the closed panel is
 * translate3d'd fully below the viewport, so IntersectionObserver never
 * marks it visible). Styling/ARIA/focus-trap contracts are unchanged.
 */
import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, MessageCircle, BarChart3, Bell, Menu, X, LogOut } from "lucide-react"
import { defaultNavSections, type NavItem } from "./AdminSidebar"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { cn } from "@/lib/utils"

const BAR_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: "لوحة التحكم", href: "/dashboard" },
  { icon: MessageCircle, label: "الرسائل", href: "/dashboard/messages" },
  { icon: BarChart3, label: "التحليلات", href: "/dashboard/analytics" },
  { icon: Bell, label: "الإشعارات", href: "/dashboard/notifications" },
]

function isActive(href: string | undefined, pathname: string): boolean {
  if (!href) return false
  if (href === "/dashboard") return pathname === "/dashboard"
  return pathname.startsWith(href)
}

export function MobileBottomNav({
  onNavigate,
  onLogout,
}: {
  /* v24-C3 (A2 #2 — Link prefetch): nav items are real <Link>s now (App
   * Router prefetches the RSC payload when the link enters the viewport →
   * tapping a bar/sheet section skips the cold route fetch entirely).
   * onNavigate is OPTIONAL and only used as an INTERCEPTOR: when a host
   * passes it (the /demo tab switcher), the click is prevented and handed
   * to the host; the real dashboard shell passes nothing → native Link
   * navigation. Logout stays the only programmatic action (onLogout). */
  onNavigate?: (href: string) => void
  onLogout: () => void
}) {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  /* v8-B3: the "more" sheet is a modal dialog — add aria-modal + the full
   * keyboard contract (focus-in, Tab-cycle trap, Escape, restore to the
   * "المزيد" trigger), replicating Header MobileMenu's pattern. */
  const sheetRef = useRef<HTMLDivElement>(null)
  const moreBtnRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (sheetOpen) {
      moreBtnRef.current = document.activeElement as HTMLButtonElement
      requestAnimationFrame(() => {
        const panel = sheetRef.current
        if (!panel) return
        const focusable = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
        if (focusable.length) focusable[0]?.focus()
      })
    } else {
      moreBtnRef.current?.focus?.()
    }
  }, [sheetOpen])
  useEffect(() => {
    if (!sheetOpen) return
    const panel = sheetRef.current
    if (!panel) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setSheetOpen(false); return }
      if (e.key !== "Tab") return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (focusable.length === 0) { e.preventDefault(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    panel.addEventListener("keydown", handleKeyDown)
    return () => panel.removeEventListener("keydown", handleKeyDown)
  }, [sheetOpen])

  /* v24-C3: Link click contract — always close the sheet; when a host
   * passed the onNavigate interceptor (demo tab switch), preventDefault and
   * delegate so the URL never changes; otherwise let <Link> navigate (with
   * the prefetch its viewport visibility already warmed up). */
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string | undefined) => {
    setSheetOpen(false)
    if (onNavigate && href) {
      e.preventDefault()
      onNavigate(href)
    }
  }

  return (
    <>
      {/* ── More sheet (all 23 sections) ── */}
      <div
        className={cn("sheet-backdrop fixed inset-0 z-40 bg-black/40 md:hidden", sheetOpen && "sheet-open")}
        onClick={() => setSheetOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className={cn(
          "sheet-panel fixed inset-x-0 bottom-0 z-50 md:hidden max-h-[78vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card shadow-2xl",
          sheetOpen && "sheet-open"
        )}
        role="dialog"
        aria-modal={sheetOpen}
        aria-label="كل الأقسام"
        aria-hidden={!sheetOpen}
      >
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Real brand mark (v3 §5.4) — the mobile navigation header
                carries the logo, mirroring Smart-Menu's MobileNav header. */}
            <Image
              src="/brand-icon.png"
              alt="SmartBot"
              width={40}
              height={40}
              className="size-10 rounded-xl shrink-0"
            />
            <div className="min-w-0">
              <span className="block text-sm font-bold leading-tight truncate">SmartBot</span>
              <span className="block text-2xs text-muted-foreground leading-tight">كل الأقسام</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="إغلاق"
            tabIndex={sheetOpen ? 0 : -1}
            /* v24-R3/B4 P4: 40px → 44px WCAG 2.5.5 touch target (the sheet's
               most-used dismiss control, in the thumb zone) */
            className="size-11 rounded-lg flex items-center justify-center hover:bg-muted shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60 active:scale-95 transition-transform"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4 space-y-5 pb-24">
          {defaultNavSections.map((section) => (
            <div key={section.label}>
              <p className="text-2xs font-bold text-muted-foreground mb-2">{section.label}</p>
              <div className="grid grid-cols-4 gap-2">
                {section.items.map((item) => {
                  const active = isActive(item.href, pathname)
                  return (
                    <Link
                      key={item.label}
                      href={item.href ?? "#"}
                      onClick={(e) => handleLinkClick(e, item.href)}
                      /* v24-C3: prefetch only in native-Link mode — when a host
                       * intercepts clicks (demo tab switch), the href is never
                       * actually navigated, so prefetching it is pure waste. */
                      prefetch={onNavigate ? false : undefined}
                      tabIndex={sheetOpen ? 0 : -1}
                      className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60 active:scale-95 transition-[color,background-color,border-color,transform] ${
                        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <item.icon className="size-5" />
                      <span className="leading-tight text-center">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
          {/* v19 Step 3 — theme toggle in the mobile dashboard: the sheet is
              the mobile dashboard's quick-settings surface; the switcher
              lived only on public/login pages so it disappeared after login
              (the live complaint). Paired with the logout row. */}
          <div className="flex items-center gap-2">
            <ThemeToggle className="!size-11 shrink-0" tabIndex={sheetOpen ? 0 : -1} />
            <button
              type="button"
              onClick={() => { setSheetOpen(false); onLogout() }}
              tabIndex={sheetOpen ? 0 : -1}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm text-muted-foreground hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60 active:scale-[0.98] transition-[color,background-color,border-color,transform]"
            >
              <LogOut className="size-4 rtl:-scale-x-100" /> تسجيل الخروج
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      {/* v25 (W-15): data-nav-root="mobile" — المحدّد المستقر الذي تستهدفه
          قاعدة إخفاء الخيط الغامر في messages/page.tsx (بدل مطابقة سلاسل
          className الهشة). */}
      <nav
        data-nav-root="mobile"
        className="fixed inset-x-0 bottom-0 z-30 md:hidden border-t border-border bg-card/95 backdrop-blur-md safe-area-pb"
        aria-label="التنقل الرئيسي"
      >
        <div className="grid grid-cols-5">
          {BAR_ITEMS.map((item) => {
            const active = isActive(item.href, pathname)
            return (
              <Link
                key={item.label}
                href={item.href ?? "#"}
                onClick={(e) => handleLinkClick(e, item.href)}
                /* v24-C3: prefetch only in native-Link mode — when a host
                 * intercepts clicks (demo tab switch), the href is never
                 * actually navigated, so prefetching it is pure waste. */
                prefetch={onNavigate ? false : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60 focus-visible:rounded-lg active:scale-90 transition-[color,background-color,border-color,transform] ${
                  active ? "text-accent-foreground" : "text-muted-foreground"
                }`}
              >
                <item.icon className="size-5" />
                <span>{item.label}</span>
                {active && <span className="h-0.5 w-6 rounded-full bg-primary mt-0.5" />}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            aria-label="المزيد من الأقسام"
            className="flex flex-col items-center justify-center gap-0.5 py-2 text-2xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60 focus-visible:rounded-lg active:scale-90 transition-[color,background-color,border-color,transform]"
          >
            <Menu className="size-5" />
            <span>المزيد</span>
          </button>
        </div>
      </nav>
    </>
  )
}
