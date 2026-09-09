import type { Metadata } from "next"

import { AppToaster } from "@/components/ui/app-toaster"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  description: "تسجيل الدخول إلى لوحة تحكم SmartBot - إدارة تفاعل صفحات فيسبوك",
  alternates: { canonical: `${siteUrl}/login` },
  openGraph: { title: "تسجيل الدخول | SmartBot", description: "تسجيل الدخول إلى SmartBot" },
  robots: { index: false, follow: true },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  // v16-E4 (D5): the toaster mounts HERE (not in the root providers) —
  // /login fires brandedToast.success on a successful login (page.tsx).
  // Plain import of the client component in this server layout, the
  // same way the root layout consumes Providers.
  return (
    <>
      {children}
      <AppToaster />
    </>
  )
}
