import type { Metadata } from "next"

const BASE = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "الاشتراك والدفع",
  description:
    "اشترك في SmartBot وادفع بطريقتك: محفظة ليبيانا أو مدار للفئات الصغيرة، أو تحويل بنكي للمبالغ الكبيرة — تفعيل فوري بعد موافقة الإدارة.",
  alternates: { canonical: `${BASE}/subscribe` },
  openGraph: {
    title: "اشترك في SmartBot",
    description: "دفع محلي بسيط: ليبيانا، مدار، أو تحويل بنكي — بدون بطاقات ائتمان.",
    url: `${BASE}/subscribe`,
    type: "website",
    // v9-E2: a child openGraph object REPLACES the root one (shallow merge)
    // — without this images[] the route loses its og:image card entirely.
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "SmartBot — منصة روبوتات ماسنجر لليبيا" }],
  },
}

export default function SubscribeLayout({ children }: { children: React.ReactNode }) {
  return children
}
