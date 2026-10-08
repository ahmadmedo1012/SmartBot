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
import AdminShell from "@/components/layout/AdminShell"

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
            resolved to nothing here. (r131-F7: the span now lives inside
            AdminShell's content column — one target per shell.) */}
        {/* r131-F7 (A4 P2-6): AdminShell mounts the night-sky desktop sidebar
            (the /dashboard chrome twin) + keeps AdminMobileNav below md —
            /admin had NO desktop navigation before (per-page text link rows
            only). pb calc pairs with root viewportFit cover (safe-area env
            is real); the mobile bar pads via .safe-area-pb. */}
        <AdminShell>
          {children}
        </AdminShell>
      </AuthGuard>
      <AppToaster />
    </QueryProvider>
  )
}
