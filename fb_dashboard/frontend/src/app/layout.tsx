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
})

export const metadata: Metadata = {
  title: "SmartBot - منصة إدارة فيسبوك",
  description: "أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك",
  metadataBase: new URL(process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"),
  icons: { icon: "/static/brand-icon.png" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/static/fonts/fonts.css" />
      </head>
      <body className={`${cairo.variable} min-h-screen flex flex-col antialiased overflow-x-hidden`}
        style={{ background: "var(--background)" }}>
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
