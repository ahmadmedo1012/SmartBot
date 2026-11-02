import type { Metadata } from "next"

import { AppToaster } from "@/components/ui/app-toaster"

/* v14-E4 (D1 م-1): /connect had no route-level metadata — the browser tab
 * fell back to the root title/description, wrong for a Facebook-page
 * connection screen. Server layout (same pattern as login/register layouts)
 * because the page itself is a client component and cannot export metadata. */
const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "ربط صفحة فيسبوك",
  description:
    "اربط صفحة فيسبوك الخاصة بك بـ SmartBot — أدخل معرف الصفحة ورمز الوصول لتفعيل الردود التلقائية الذكية",
  alternates: { canonical: `${siteUrl}/connect` },
  openGraph: {
    title: "ربط صفحة فيسبوك | SmartBot",
    description: "تفعيل البوت الذكي على صفحتك — ربط واحد يفتح الردود التلقائية والتحليلات",
    // P42-W7 (SEO audit): v9-E2 family doctrine completed (og:image/url/
    // type/locale) for pattern consistency with the sibling routes — the
    // middleware cookie gate 307s anonymous crawlers to /login first, so
    // this card is defense-in-depth like the noindex below, not a crawl
    // surface. Completing it stops the incomplete object being the
    // copy-paste template for the next public route.
    url: `${siteUrl}/connect`,
    type: "website",
    locale: "ar_AR",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "الربط الذكي — SmartBot" }],
  },
  // robots.ts already Disallows /connect — noindex here is defense in depth
  // (the page is an authenticated tool screen, never a search landing page).
  robots: { index: false, follow: true },
}

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  // v16-E4 (D5): the toaster mounts HERE — the connect page fires
  // brandedToast on test-connect/save/copy outcomes and its
  // authenticated fetches (/api/facebook/settings, /api/webhook/check)
  // can hit the global 401 session-expiry toast in csrf-client.
  return (
    <>
      {children}
      <AppToaster />
    </>
  )
}
