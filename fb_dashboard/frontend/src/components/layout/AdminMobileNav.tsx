"use client"

/**
 * AdminMobileNav (v17-E-F2 · D7-P0-2).
 *
 * Bottom bar for the four admin sections. /admin/* had NO navigation below
 * md at all — admin/layout.tsx mounted AuthGuard+QueryProvider+Toaster only,
 * no sidebar and no bottom bar, so a platform admin on mobile was stranded
 * on whatever page they opened (browser-back was the only way out).
 *
 * The tenant AdminSidebar can't be reused here (its 22 sections are tenant
 * routes), so this is a dedicated 4-slot bar that mirrors MobileBottomNav's
 * visual + a11y contract:
 *   - md:hidden (below md only — the desktop cross-links decision is S1;
 *     admin/page.tsx's header links remain the desktop affordance)
 *   - real <Link>s (prefetch + middle-click), aria-current="page" on the
 *     active slot, focus-visible ring, active indicator bar
 *   - min-h-11 (44px) touch targets on every slot (D7 §2)
 * Mounted INSIDE AuthGuard in admin/layout.tsx, so it renders only for
 * authorized platform admins (not on the guard's loading/403 screens).
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { CreditCard, LifeBuoy, Send, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

interface AdminNavSection {
  icon: React.ComponentType<{ className?: string }>
  label: string
  href: string
  /** Directional glyph that must mirror in RTL (paper plane). */
  rtlFlip?: boolean
}

const ADMIN_SECTIONS: AdminNavSection[] = [
  { icon: CreditCard, label: "الاشتراكات", href: "/admin" },
  { icon: LifeBuoy, label: "التذاكر", href: "/admin/support" },
  // rtlFlip — Send is a directional glyph (paper plane points "forward"
  // in LTR); mirror it in RTL like MobileBottomNav's LogOut.
  { icon: Send, label: "تليجرام", href: "/admin/telegram", rtlFlip: true },
  { icon: Settings, label: "الإعدادات", href: "/admin/settings" },
]

function isAdminActive(href: string, pathname: string): boolean {
  // /admin is exact-match only so the subscriptions slot doesn't light up
  // on its three sibling sections (same contract as MobileBottomNav's
  // isActive for /dashboard).
  if (href === "/admin") return pathname === "/admin"
  return pathname.startsWith(href)
}

export function AdminMobileNav() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 md:hidden border-t border-border bg-card/95 backdrop-blur-md safe-area-pb"
      aria-label="تنقل الإدارة"
    >
      <div className="grid grid-cols-4">
        {ADMIN_SECTIONS.map((item) => {
          const active = isAdminActive(item.href, pathname)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 py-2 text-2xs outline-none",
                "focus-visible:ring-2 focus-visible:ring-accent-foreground/60 focus-visible:rounded-lg",
                "active:scale-90 transition-[color,background-color,border-color,transform]",
                active ? "text-accent-foreground" : "text-muted-foreground",
              )}
            >
              <item.icon className={cn("size-5", item.rtlFlip && "rtl:-scale-x-100")} />
              <span>{item.label}</span>
              {active && <span className="h-0.5 w-6 rounded-full bg-primary mt-0.5" />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
