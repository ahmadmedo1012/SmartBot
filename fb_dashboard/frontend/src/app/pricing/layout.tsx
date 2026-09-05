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
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
