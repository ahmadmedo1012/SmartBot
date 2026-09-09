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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // v12-E5.2: QueryProvider here for the admin react-query consumers
  // (admin/telegram) — see components/shared/QueryProvider.tsx.
  // v16-E4 (D5): AppToaster (sonner) mounts HERE (plain import in this
  // server layout, same as QueryProvider/AuthGuard) — the admin pages
  // (telegram/settings/approvals) fire brandedToast on every mutation.
  return (
    <QueryProvider>
      <AuthGuard requiredRole="admin">
        {/* v13-D9-K4: admin routes render their own page shells without the
            public pages' #page-content span — the root layout's skip link
            resolved to nothing here. */}
        <span id="page-content" className="sr-only" tabIndex={-1} />
        {children}
      </AuthGuard>
      <AppToaster />
    </QueryProvider>
  )
}
