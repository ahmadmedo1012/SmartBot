import type { Metadata } from "next"
import { Cairo } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from "./providers"
import "./globals.css"

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
  adjustFontFallback: false,
})

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: { default: "SmartBot - منصة إدارة فيسبوك", template: "%s | SmartBot" },
  description: "أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك - المنصة الأولى في ليبيا",
  metadataBase: new URL(siteUrl),
  icons: { icon: "/static/brand-icon.png", apple: "/static/brand-icon.png" },
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ar_LY",
    siteName: "SmartBot",
    title: "SmartBot - منصة إدارة فيسبوك",
    description: "أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك",
    url: "/",
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/static/fonts/fonts.css" />
        <link rel="preload" href="/static/fonts/noto-naskh-arabic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/static/fonts/noto-sans-arabic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/static/fonts/readex-pro.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SmartBot",
            url: siteUrl,
            logo: `${siteUrl}/static/brand-icon.png`,
            description: "منصة إدارة تفاعل فيسبوك الذكية",
            areaServed: "LY",
          }),
        }} />
      </head>
      <body className={`${cairo.variable} min-h-screen flex flex-col antialiased overflow-x-hidden`}
        style={{ background: "var(--background-radial), var(--background)" }}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            {/* Skip to content */}
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-sm focus:bg-card focus:text-foreground">
              تخطي إلى المحتوى
            </a>

            {/* Grain overlay */}
            <div className="grain-overlay" aria-hidden="true" />

            <main id="main-content" className="flex-1 flex flex-col">
              {children}
            </main>

            <Toaster position="top-left" richColors closeButton duration={5000} />
            <Analytics />
            <SpeedInsights />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  )
}
