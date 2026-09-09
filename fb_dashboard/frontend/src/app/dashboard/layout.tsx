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
import { AppToaster } from "@/components/ui/app-toaster"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // v12-E5.2: QueryProvider lives HERE (not in the root providers) — all
  // 22 react-query consumers are dashboard pages; public routes stop
  // shipping @tanstack/react-query in their first-load JS.
  // v16-E4 (D5): AppToaster (sonner) mounts HERE too — every dashboard
  // page fires brandedToast on mutations/errors (plus the global 401
  // session-expiry toast in csrf-client and the AuthGuard-mounted
  // OnboardingWizard). A plain import in this server layout (the same
  // way QueryProvider/AuthGuard are consumed) keeps sonner out of the
  // public routes entirely: landing/pricing/demo/terms/privacy no
  // longer ship the 43.2KB toaster chunk they never used.
  return (
    <QueryProvider>
      <AuthGuard>
        <DashboardShell>{children}</DashboardShell>
      </AuthGuard>
      <AppToaster />
    </QueryProvider>
  )
}
