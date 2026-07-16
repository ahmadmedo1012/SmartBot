import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "الإدارة",
  description: "إدارة اشتراكات SmartBot — مراجعة طلبات الدفع والموافقة عليها",
  alternates: { canonical: `${siteUrl}/admin` },
  robots: { index: false, follow: false },
}

import AuthGuard from "../dashboard/AuthGuard"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard requiredRole="admin">{children}</AuthGuard>
}
