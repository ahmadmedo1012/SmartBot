import type { Metadata } from "next"

import { AppToaster } from "@/components/ui/app-toaster"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  description: "تسجيل الدخول إلى لوحة تحكم SmartBot - إدارة تفاعل صفحات فيسبوك",
  alternates: { canonical: `${siteUrl}/login` },
  openGraph: {
    title: "تسجيل الدخول | SmartBot",
    description: "تسجيل الدخول إلى SmartBot",
    // P42-W7 (SEO audit): the v9-E2 family doctrine completed — a child
    // openGraph object REPLACES the root one (shallow merge), so the
    // route shipped with NO og:image/og:url/og:type/og:locale while every
    // sibling public route re-declares the full set. /login is a public,
    // cacheable, WhatsApp-shared route (middleware PUBLIC_PAGE_RE) — its
    // link card must not be imageless. r133: og:locale ar_AR re-declared
    // (FB scrapers only recognize ar_AR); r134: image alt family form.
    url: `${siteUrl}/login`,
    type: "website",
    locale: "ar_AR",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "الربط الذكي — SmartBot" }],
  },
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
