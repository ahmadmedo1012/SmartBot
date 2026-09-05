"use client"

/**
 * MobileBottomNav (latest_plan.md Track F.1/F.2).
 *
 * Bottom bar with the 5 highest-traffic sections + a "المزيد" sheet holding
 * ALL 23 sections — same nav data source as AdminSidebar (no duplication).
 * Visible only below md (sidebar is `hidden md:block`).
 * Every section is reachable within 2 taps (bar item = 1, sheet item = 2).
 */
import { useState } from "react"
import { usePathname } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { LayoutDashboard, MessageCircle, BarChart3, Bell, Menu, X, LogOut } from "lucide-react"
import { defaultNavSections, type NavItem } from "./AdminSidebar"

const BAR_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: "الرئيسية", href: "/dashboard" },
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

  const go = (href: string | undefined) => {
    if (!href) return
    setSheetOpen(false)
    onNavigate(href)
  }

  return (
    <>
      {/* ── More sheet (all 23 sections) ── */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={() => setSheetOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="fixed inset-x-0 bottom-0 z-50 md:hidden max-h-[78vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card shadow-2xl"
              role="dialog"
              aria-label="كل الأقسام"
            >
              <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
                <span className="font-bold text-sm">كل الأقسام</span>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="إغلاق"
                  className="size-8 rounded-lg flex items-center justify-center hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="p-4 space-y-5 pb-24">
                {defaultNavSections.map((section) => (
                  <div key={section.label}>
                    <p className="text-[11px] font-bold text-muted-foreground mb-2">{section.label}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {section.items.map((item) => {
                        const active = isActive(item.href, pathname)
                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => go(item.href)}
                            className={`flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-[11px] transition-colors ${
                              active ? "bg-accent-soft text-accent" : "text-muted-foreground hover:bg-muted"
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
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  <LogOut className="size-4" /> تسجيل الخروج
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors ${
                  active ? "text-accent" : "text-muted-foreground"
                }`}
              >
                <item.icon className="size-5" />
                <span>{item.label}</span>
                {active && <span className="h-0.5 w-6 rounded-full bg-accent mt-0.5" />}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            aria-label="المزيد من الأقسام"
            className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-muted-foreground"
          >
            <Menu className="size-5" />
            <span>المزيد</span>
          </button>
        </div>
      </nav>
    </>
  )
}
