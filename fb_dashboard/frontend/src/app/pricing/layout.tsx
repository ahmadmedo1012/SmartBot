import type { Metadata } from "next"

const BASE = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "الأسعار والباقات",
  description:
    "باقات SmartBot المرنة لكل حجم عمل: مجانية، أساسية، مميزة، احترافية، ومؤسسية — دفع بالدينار الليبي عبر ليبيانا ومدار والتحويل البنكي.",
  alternates: { canonical: `${BASE}/pricing` },
  openGraph: {
    title: "باقات وأسعار SmartBot",
    description: "ابدأ مجاناً وارتقِ عند الحاجة — أسعار بالدينار الليبي تناسب السوق الليبي.",
    url: `${BASE}/pricing`,
    type: "website",
    // v9-E2: a child openGraph object REPLACES the root one (shallow merge)
    // — without this images[] the route loses its og:image card entirely.
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "SmartBot — منصة روبوتات ماسنجر لليبيا" }],
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
