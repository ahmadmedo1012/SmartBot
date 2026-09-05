import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "إنشاء حساب",
  description: "أنشئ حساب SmartBot مجاناً واربط صفحة فيسبوك الخاصة بك في دقائق — بدون بطاقة ائتمان",
  alternates: { canonical: `${siteUrl}/register` },
  openGraph: {
    title: "إنشاء حساب | SmartBot",
    description: "ابدأ مجاناً — أتمتة الردود وتحليلات صفحات فيسبوك",
  },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
