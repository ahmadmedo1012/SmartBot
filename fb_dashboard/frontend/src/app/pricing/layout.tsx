import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "الخطط والأسعار",
  description: "اختر الخطة المناسبة لإدارة صفحات فيسبوك — خطط مرنة تبدأ من مجانية وحتى مؤسسي 299 د.ل/شهر",
  alternates: { canonical: `${siteUrl}/pricing` },
  openGraph: { title: "الخطط والأسعار - SmartBot", description: "خطط أسعار مرنة لإدارة صفحات فيسبوك - ابدأ مجاناً" },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
