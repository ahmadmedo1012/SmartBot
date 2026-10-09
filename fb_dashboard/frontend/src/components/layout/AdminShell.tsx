"use client"

import { useRouter } from "next/navigation"
import { brandedToast } from "@/lib/premium-toast"
import { apiFetch } from "@/lib/csrf-client"
import { clearQueryPersistedCache } from "@/lib/query-persist"
import { AdminSidebar, type NavSection } from "@/components/layout/AdminSidebar"
import { AdminMobileNav } from "@/components/layout/AdminMobileNav"
import {
  CreditCard,
  LifeBuoy,
  Send,
  Settings,
  LayoutDashboard,
} from "lucide-react"

/* r131-F7 (A4 P2-6 — the second chrome system): the /admin routes now ride
 * the SAME night-sky shell grammar as /dashboard (DashboardShell twin):
 * desktop = the fixed 256px .mdrk-night-sky sidebar (was: NO desktop nav
 * at all — per-page text link rows were the only affordance), mobile keeps
 * AdminMobileNav (4-slot bottom bar, v17-E-F2) with its pb clearance, and
 * every admin page carries the PageHeader sticky bar (F8 swaps the
 * centered SectionHeader marketing rhythm — PageHeader is the bar pattern
 * all 23 dashboard routes use).
 *
 * The nav is a slim platform-admin variant of the tenant 22-section list:
 * the 4 admin sections + a section-root hop back to the tenant dashboard.
 * Send (تليجرام) mirrors in RTL like AdminMobileNav's slot (paper plane is
 * a directional glyph). */

/* r132-F3a: export dropped — module-internal, consumed by the shell's own
 * <DashboardShell navSections={adminNavSections}> below. */
const adminNavSections: NavSection[] = [
  {
    label: "الإدارة",
    items: [
      { icon: CreditCard, label: "الاشتراكات", href: "/admin" },
      { icon: LifeBuoy, label: "تذاكر الدعم", href: "/admin/support" },
      { icon: Send, label: "تليجرام", href: "/admin/telegram", rtlFlip: true },
      { icon: Settings, label: "إعدادات المنصة", href: "/admin/settings" },
    ],
  },
  {
    label: "المنصة",
    items: [
      { icon: LayoutDashboard, label: "لوحة التحكم", href: "/dashboard" },
    ],
  },
]

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  /* DashboardShell's logout contract verbatim: CSRF POST, success toast,
   * wipe the persisted react-query cache (a same-tab login as a different
   * user must never hydrate the previous account's data), then /login. */
  const handleLogout = async () => {
    try {
      await apiFetch("/api/logout", { method: "POST" })
      brandedToast.success("تم تسجيل الخروج")
    } catch { /* ignore */ }
    clearQueryPersistedCache()
    router.push("/login")
  }

  return (
    <div className="flex min-h-screen bg-background" dir="rtl">
      {/* Madarek --sidebar-w: 256px fixed rail on the inline-start (RIGHT in
          RTL) edge — DashboardShell's exact chrome (z-dropdown rung). The
          brand subtitle says «الإدارة» so the two shells are distinguishable
          at a glance. No onSubscribe: platform admins don't upsell
          themselves (DashboardShell's conditional CTA stays tenant-only). */}
      <div className="fixed top-0 right-0 z-(--z-dropdown) h-full w-64 hidden md:block">
        <AdminSidebar
          navSections={adminNavSections}
          subtitle="الإدارة"
          onLogout={handleLogout}
        />
      </div>
      {/* Skip-link target + content column: ps-64 clears the fixed rail
          above md; the pb calc clears AdminMobileNav below md (same pairing
          as DashboardShell — root layout's viewportFit cover makes the
          safe-area env() real). */}
      <div
        id="page-content"
        tabIndex={-1}
        className="sb-page-enter flex-1 md:ps-64 flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 outline-none"
      >
        {children}
      </div>
      <AdminMobileNav />
    </div>
  )
}
