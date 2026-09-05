import type { Metadata, Viewport } from "next"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from "./providers"
import { GridPattern } from "@/components/ui/grid-pattern"
import "./globals.css"

/* ponytail: fonts served local-first via /fonts/fonts.css (Smart-Menu pattern) —
 * no next/font module-class dependency, no external Google Fonts round-trip.
 * Cairo (arabic+latin subsets) + Readex Pro (display) are @font-face-declared
 * in public/fonts/fonts.css — identical file to Smart-Menu. */

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#bc4700" },
    { media: "(prefers-color-scheme: dark)", color: "#bc4700" },
  ],
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
        {/* LCP: preload the Arabic subsets of the two active families —
         * Cairo (body) + Readex Pro (display accents). fonts.css uses
         * font-display: swap; preloading moves the font fetch ahead of CSS
         * discovery (Smart-Menu pattern). */}
        <link rel="preload" as="font" type="font/woff2" href="/fonts/cairo-arabic.woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" type="font/woff2" href="/fonts/readex-pro.woff2" crossOrigin="anonymous" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SmartBot",
            url: siteUrl,
            logo: `${siteUrl}/icon-512.png`,
            description: "منصة إدارة تفاعل فيسبوك الذكية",
            areaServed: "LY",
          }),
        }} />
      </head>
      <body className="flex min-h-dvh flex-col overflow-x-clip bg-background antialiased"
        style={{ background: "var(--background-radial), var(--background)" }}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            {/* Skip to content — Smart-Menu style (logical offset, brand chip) */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:end-4 focus:z-[100] focus:px-6 focus:py-3 focus:rounded-lg focus:bg-orange focus:text-white focus:text-sm focus:font-medium focus:outline-none focus:shadow-lg focus:ring-2 focus:ring-orange/50"
            >
              تخطي إلى المحتوى الرئيسي
            </a>

            {/* Grain overlay */}
            <div className="grain-overlay" aria-hidden="true" />
            {/* Grid pattern overlay — Smart-Menu component + tokens */}
            <GridPattern
              width={60}
              height={60}
              className="[color:var(--grid-line)]"
              style={{ opacity: 0.14 } as React.CSSProperties}
            />

            <main id="main-content" className="flex-1 flex flex-col">
              {children}
            </main>

            <Toaster
              position="top-center"
              richColors
              closeButton
              duration={5000}
              toastOptions={{
                style: {
                  animation: "slide-up 0.35s cubic-bezier(0.16, 1, 0.2, 1)",
                  borderRadius: "12px",
                  padding: "8px",
                },
                className: "border border-border/30 shadow-xl backdrop-blur-xl",
              }}
            />
            <SpeedInsights />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  )
}
