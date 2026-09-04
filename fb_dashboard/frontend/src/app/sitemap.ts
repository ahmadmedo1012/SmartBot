import type { MetadataRoute } from "next"

export const dynamic = "force-static"

const BASE = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/subscribe`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ]
}
