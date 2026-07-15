import type { Metadata } from "next"

const siteUrl = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  description: "تسجيل الدخول إلى لوحة تحكم SmartBot - إدارة تفاعل صفحات فيسبوك",
  alternates: { canonical: `${siteUrl}/login` },
  openGraph: { title: "تسجيل الدخول | SmartBot", description: "تسجيل الدخول إلى SmartBot" },
  robots: { index: true, follow: true },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
