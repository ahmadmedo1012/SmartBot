import type { Metadata } from "next"
import { Cairo } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from "./providers"
import "./globals.css"

const cairo = Cairo({
  subsets: ["latin"], /* ponytail: arabic subset triggers Next.js font subset bug - fonts served via static/fonts/fonts.css */
  variable: "--font-cairo",
  display: "swap",
})

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: { default: "SmartBot - منصة إدارة فيسبوك", template: "%s | SmartBot" },
  description: "أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك - المنصة الأولى في ليبيا",
  keywords: ["SmartBot", "فيسبوك بوت", "أتمتة الردود", "تحليلات فيسبوك", "إدارة صفحات", "ليبيا", "التجارة الإلكترونية"],
  authors: [{ name: "SmartBot Team" }],
  metadataBase: new URL(siteUrl),
  icons: { icon: "/brand-icon.png", apple: "/brand-icon.png" },
  openGraph: {
    type: "website", locale: "ar_LY", siteName: "SmartBot", url: siteUrl,
    title: "SmartBot - منصة إدارة فيسبوك الذكية",
    description: "أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك",
    images: [{ url: "/brand-icon.png", width: 512, height: 512, alt: "SmartBot" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartBot - منصة إدارة فيسبوك",
    description: "أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك",
    images: ["/brand-icon.png"],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  alternates: { canonical: `${siteUrl}/` },
  category: "technology",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <meta name="theme-color" content="#bc4700" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "SmartBot",
            url: siteUrl,
            logo: `${siteUrl}/brand-icon.png`,
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
            {/* Grid pattern overlay */}
            <div className="fixed inset-0 z-0 pointer-events-none opacity-30" aria-hidden="true"
              style={{ backgroundImage: "linear-gradient(color-mix(in oklch, var(--orange) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch, var(--orange) 6%, transparent) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

            <main id="main-content" className="flex-1 flex flex-col">
              {children}
            </main>

            <Toaster position="top-left" richColors closeButton duration={5000} />
            <SpeedInsights />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  )
}
