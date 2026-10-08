import type { Metadata, Viewport } from "next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from "./providers"
import "./globals.css"

/* Madarek parity: fonts served local-first via /fonts/fonts.css —
 * no next/font module-class dependency, no external Google Fonts round-trip.
 * IBM Plex Sans Arabic (arabic+latin subsets, 400-700) + IBM Plex Mono +
 * IBM Plex Serif italic are @font-face-declared in public/fonts/fonts.css
 * (the 12-file Madarek set). fonts.css also defines the load-bearing
 * --font-cairo shim ("IBM Plex Sans Arabic") BEFORE this sheet loads. */

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: { default: "SmartBot - منصة إدارة فيسبوك", template: "%s | SmartBot" },
  description: "أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك - المنصة الأولى في ليبيا",
  keywords: ["SmartBot", "فيسبوك بوت", "أتمتة الردود", "تحليلات فيسبوك", "إدارة صفحات", "ليبيا", "التجارة الإلكترونية"],
  authors: [{ name: "SmartBot Team" }],
  metadataBase: new URL(siteUrl),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website", locale: "ar_LY", siteName: "SmartBot", url: siteUrl,
    title: "SmartBot - منصة إدارة فيسبوك الذكية",
    description: "أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "SmartBot — منصة إدارة فيسبوك الذكية" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartBot - منصة إدارة فيسبوك",
    description: "أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك",
    images: ["/opengraph-image.png"],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  alternates: { canonical: `${siteUrl}/` },
  category: "technology",
}

export const viewport: Viewport = {
  /* Madarek theme-color sync (index.html pattern): the browser bar follows
   * the GROUND, not the brand — #FBFAF9 cream (light) / #070B16 night
   * (dark). Was the flame #bc4700 in both modes. */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFAF9" },
    { media: "(prefers-color-scheme: dark)", color: "#070B16" },
  ],
  width: "device-width",
  initialScale: 1,
  // v17-E-F2 (D7-P0-3 — PAIRED change): cover extends the web view under
  // the iOS home-indicator / Dynamic Island so env(safe-area-inset-*)
  // resolves to real values — before this, every env() in the app
  // (.safe-area-pb on the bottom bars, FloatingWhatsApp's bottom calc,
  // DashboardShell's pb) was a no-op reading 0. The pair: DashboardShell's
  // content pb-[calc(4rem+env(safe-area-inset-bottom))] must ship in the
  // SAME change — viewport-fit alone would park the fixed bottom bar
  // inside the system gesture area, and the pb alone is dead code.
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
        {/* LCP: preload the two FIRST-PAINT arabic subsets (Madarek
         * index.html pattern — only the 400 + 700 arabic faces, ~86KB):
         * fonts.css uses font-display: swap; preloading moves the font
         * fetch ahead of CSS discovery. */}
        <link rel="preload" as="font" type="font/woff2" href="/fonts/plex-sans-arabic-400-normal-arabic.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/plex-sans-arabic-700-normal-arabic.woff2" crossOrigin="anonymous" />
      </head>
      {/* Madarek de-glow: the body ground is FLAT (cream/night) — the
          orange radial, film grain and grid overlay are retired; hairline
          borders + the elevation ladder carry the depth instead. */}
      <body className="flex min-h-dvh flex-col overflow-x-clip bg-background antialiased">
        {/* ThemeProvider lives inside <Providers> (src/app/providers.tsx) —
            layout.tsx stays a pure server component. v16-E4 truth: AppToaster
            is NOT mounted here anymore (the v12-E5.3 note was stale); it
            mounts per-route in the layouts whose pages actually call toast()
            — dashboard/layout:33, admin/layout:49, login:23, register:31,
            connect:33, subscribe:31 — so public routes with zero toast call
            sites (landing/pricing/demo/terms/privacy) ship no sonner bytes. */}
        <Providers>
          <main id="main-content" className="flex-1 flex flex-col">
            {/* Skip to content — Smart-Menu style (logical offset, brand chip).
                v8-B7: target is #page-content — the per-page content anchor
                (DashboardShell content column / landing hero). The old
                #main-content target wrapped the 23-item sidebar too, so
                skip-link users still tabbed through the whole nav.
                v9-D3: the link itself now lives INSIDE <main> (first child,
                before every page's header) — it was the last element outside
                any landmark, which tripped axe's region best-practice rule on
                every public page. Still the first focusable element in tab
                order (the overlays above are aria-hidden decoration). */}
            {/* v16-E3 (D1 LEAD A — allowlist p11-rtl-tab-order): the reveal
                used focus:absolute focus:end-4 — in RTL `end` = LEFT edge
                (x≈16), so Tab 1 landed far from the RTL reading start, and
                `absolute` used document coords → off-viewport when scrolled
                (measured y=−784). fixed + start-4 reveals at the top-RIGHT
                (RTL reading start) and stays in-viewport at any scrollY. */}
            <a
              href="#page-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[100] focus:px-6 focus:py-3 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium focus:outline-none focus:shadow-lg focus:ring-2 focus:ring-accent-foreground/50"
            >
              تخطي إلى المحتوى الرئيسي
            </a>
            {children}
          </main>

          {/* v17-E-F2 (D8-G3): Vercel-only. On self-hosted `next start`
              the injected /_vercel/speed-insights/script.js answers 404
              with a text/plain MIME, so the browser refuses to execute it
              and logs a console error on EVERY page (12/12 page-views in
              the D8 live probe). Gate on the build-time VERCEL env var —
              zero behavior change where it worked, silent self-host. */}
          {process.env.VERCEL ? <SpeedInsights /> : null}
        </Providers>
      </body>
    </html>
  )
}
