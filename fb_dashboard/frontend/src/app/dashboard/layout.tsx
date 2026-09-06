import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "لوحة التحكم",
  description: "لوحة تحكم SmartBot — إدارة ردود، إحصائيات، وتحليلات متقدمة لصفحات فيسبوك",
  alternates: { canonical: `${siteUrl}/dashboard` },
  robots: { index: false, follow: false },
}

import DashboardShell from "./DashboardShell"
import AuthGuard from "./AuthGuard"
import { QueryProvider } from "@/components/shared/QueryProvider"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // v12-E5.2: QueryProvider lives HERE (not in the root providers) — all
  // 22 react-query consumers are dashboard pages; public routes stop
  // shipping @tanstack/react-query in their first-load JS.
  return (
    <QueryProvider>
      <AuthGuard>
        <DashboardShell>{children}</DashboardShell>
      </AuthGuard>
    </QueryProvider>
  )
}
