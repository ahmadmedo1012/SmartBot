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
  },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children
}
