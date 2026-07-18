import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "اشتراك",
  description: "اشترك في SmartBot وابدأ في أتمتة ردود فيسبوك — خطط متنوعة تبدأ من مجانية",
  alternates: { canonical: `${siteUrl}/subscribe` },
  openGraph: { title: "اشتراك | SmartBot", description: "اشترك في SmartBot الآن" },
  robots: { index: true, follow: true },
}

export default function SubscribeLayout({ children }: { children: React.ReactNode }) {
  return children
}
