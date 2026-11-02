import type { Metadata } from "next"

const BASE = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "الأسعار والخطط",
  description:
    "خطط SmartBot المرنة لكل حجم عمل: مجانية، أساسية، مميزة، احترافية، ومؤسسية — دفع بالدينار الليبي عبر ليبيانا ومدار والتحويل البنكي.",
  alternates: { canonical: `${BASE}/pricing` },
  openGraph: {
    title: "خطط وأسعار SmartBot",
    description: "ابدأ مجاناً وارتقِ عند الحاجة — أسعار بالدينار الليبي تناسب السوق الليبي.",
    url: `${BASE}/pricing`,
    type: "website",
    // P42-W7 (SEO audit): og:locale re-declared — the child openGraph
    // object REPLACES the root one, so the r133 ar_AR ruling (FB scrapers
    // only recognize ar_AR) was live on the landing page only; every
    // route that overrides openGraph must re-state it.
    locale: "ar_AR",
    // v9-E2: a child openGraph object REPLACES the root one (shallow merge)
    // — without this images[] the route loses its og:image card entirely.
    // r134: og:image alt rides the family form «الربط الذكي — SmartBot» (root layout twin).
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "الربط الذكي — SmartBot" }],
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
