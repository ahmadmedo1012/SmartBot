import type { Metadata } from "next"

import { AppToaster } from "@/components/ui/app-toaster"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "إنشاء حساب",
  description: "أنشئ حساب SmartBot مجاناً واربط صفحة فيسبوك الخاصة بك في دقائق — بدون بطاقة ائتمان",
  alternates: { canonical: `${siteUrl}/register` },
  openGraph: {
    title: "إنشاء حساب | SmartBot",
    description: "ابدأ مجاناً — أتمتة الردود وتحليلات صفحات فيسبوك",
    url: `${siteUrl}/register`,
    type: "website",
    // v9-E2: child openGraph replaces the root object (shallow merge) —
    // re-declare images + canonical og:url or the route loses its card.
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "SmartBot — منصة روبوتات ماسنجر لليبيا" }],
  },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  // v16-E4 (D5): the toaster mounts HERE — RegisterForm fires
  // brandedToast on register success/failure. Plain import of the
  // client component in this server layout (same pattern as Providers
  // in the root layout); the root providers no longer ship sonner to
  // toast-less public routes.
  return (
    <>
      {children}
      <AppToaster />
    </>
  )
}
