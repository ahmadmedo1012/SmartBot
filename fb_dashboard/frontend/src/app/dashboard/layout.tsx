import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "لوحة البيانات",
  description: "لوحة تحكم SmartBot — إدارة ردود، إحصائيات، وتحليلات متقدمة لصفحات فيسبوك",
  alternates: { canonical: `${siteUrl}/dashboard` },
  robots: { index: false, follow: false },
}

import AuthGuard from "./AuthGuard"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>
}
