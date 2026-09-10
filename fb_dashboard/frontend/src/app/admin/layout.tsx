import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "الإدارة",
  description: "إدارة اشتراكات SmartBot — مراجعة طلبات الدفع والموافقة عليها",
  alternates: { canonical: `${siteUrl}/admin` },
  robots: { index: false, follow: false },
}

import AuthGuard from "../dashboard/AuthGuard"
import { QueryProvider } from "@/components/shared/QueryProvider"
import { AppToaster } from "@/components/ui/app-toaster"
import { AdminMobileNav } from "@/components/layout/AdminMobileNav"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // v12-E5.2: QueryProvider here for the admin react-query consumers
  // (admin/telegram) — see components/shared/QueryProvider.tsx.
  // v16-E4 (D5): AppToaster (sonner) mounts HERE (plain import in this
  // server layout, same as QueryProvider/AuthGuard) — the admin pages
  // (telegram/settings/approvals) fire brandedToast on every mutation.
  return (
    <QueryProvider>
      {/* v22-D6 (W1-D6 #7-م1): requirePlatformAdmin — every self-registered
          user is role="admin" of their own tenant, so requiredRole="admin"
          alone let the whole /admin shell render for them (empty own-tenant
          queue + honest 403 cards). The /api/me boolean now gates the shell
          (UX only — the API 403s behind require_platform_admin remain the
          real security layer) with an Arabic toast + dashboard redirect. */}
      <AuthGuard requiredRole="admin" requirePlatformAdmin>
        {/* v13-D9-K4: admin routes render their own page shells without the
            public pages' #page-content span — the root layout's skip link
            resolved to nothing here. */}
        <span id="page-content" className="sr-only" tabIndex={-1} />
        {/* v17-E-F2 (D7-P0-2 + D7-P0-3 pair): /admin/* had NO navigation
            below md (no sidebar, no bottom bar) — a platform admin on mobile
            was stranded on the first page they opened. AdminMobileNav is the
            4-section bottom bar; the pb calc below md is its content
            clearance, paired with root layout's viewportFit: "cover" so
            env(safe-area-inset-bottom) is real (bar itself pads via
            .safe-area-pb). Desktop keeps relying on each page's own header
            links (cross-links decision = S1). */}
        <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </div>
        <AdminMobileNav />
      </AuthGuard>
      <AppToaster />
    </QueryProvider>
  )
}
