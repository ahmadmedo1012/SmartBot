import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "لوحة التحكم التجريبية",
  description: "جرب SmartBot مجاناً — لوحة تحكم تجريبية ببيانات وهمية لتتعرف على ميزات إدارة صفحات فيسبوك",
  alternates: { canonical: `${siteUrl}/demo` },
  openGraph: { title: "تجربة SmartBot", description: "جرب لوحة التحكم التجريبية" },
  robots: { index: true, follow: true },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children
}
