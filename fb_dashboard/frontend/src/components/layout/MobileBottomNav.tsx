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
 */
import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { LayoutDashboard, MessageCircle, BarChart3, Bell, Menu, X, LogOut } from "lucide-react"
import { defaultNavSections, type NavItem } from "./AdminSidebar"
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
  onNavigate: (href: string) => void
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

  const go = (href: string | undefined) => {
    if (!href) return
    setSheetOpen(false)
    onNavigate(href)
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
            className="size-10 rounded-lg flex items-center justify-center hover:bg-muted shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60 active:scale-95 transition-transform"
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
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => go(item.href)}
                      tabIndex={sheetOpen ? 0 : -1}
                      className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60 active:scale-95 transition-[color,background-color,border-color,transform] ${
                        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <item.icon className="size-5" />
                      <span className="leading-tight text-center">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => { setSheetOpen(false); onLogout() }}
            tabIndex={sheetOpen ? 0 : -1}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm text-muted-foreground hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60 active:scale-[0.98] transition-[color,background-color,border-color,transform]"
          >
            <LogOut className="size-4 rtl:-scale-x-100" /> تسجيل الخروج
          </button>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 md:hidden border-t border-border bg-card/95 backdrop-blur-md safe-area-pb"
        aria-label="التنقل الرئيسي"
      >
        <div className="grid grid-cols-5">
          {BAR_ITEMS.map((item) => {
            const active = isActive(item.href, pathname)
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => go(item.href)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/60 focus-visible:rounded-lg active:scale-90 transition-[color,background-color,border-color,transform] ${
                  active ? "text-accent-foreground" : "text-muted-foreground"
                }`}
              >
                <item.icon className="size-5" />
                <span>{item.label}</span>
                {active && <span className="h-0.5 w-6 rounded-full bg-primary mt-0.5" />}
              </button>
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
