import type { Metadata } from "next"

const BASE = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "تجربة لوحة التحكم",
  description:
    "جرّب لوحة تحكم SmartBot كاملة ببيانات تجريبية — شاهد الردود التلقائية، التحليلات، والرسائل قبل الاشتراك.",
  alternates: { canonical: `${BASE}/demo` },
  openGraph: {
    title: "تجربة SmartBot الحية",
    description: "لوحة تحكم تفاعلية ببيانات تجريبية — بدون تسجيل.",
    url: `${BASE}/demo`,
    type: "website",
    // v9-E2: a child openGraph object REPLACES the root one (shallow merge)
    // — without this images[] the route loses its og:image card entirely.
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "SmartBot — منصة روبوتات ماسنجر لليبيا" }],
  },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children
}
