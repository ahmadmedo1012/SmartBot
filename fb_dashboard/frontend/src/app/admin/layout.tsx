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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // v12-E5.2: QueryProvider here for the admin react-query consumers
  // (admin/telegram) — see components/shared/QueryProvider.tsx.
  return (
    <QueryProvider>
      <AuthGuard requiredRole="admin">{children}</AuthGuard>
    </QueryProvider>
  )
}
