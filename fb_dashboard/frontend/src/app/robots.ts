import type { MetadataRoute } from "next"

/**
 * v6 §D addition — robots.txt (the missing SEO basic; sitemap.ts already
 * existed). Auth-gated areas (dashboard, admin) are disallowed and never
 * appear in sitemap.ts either (same central route registry rule).
 */
const BASE = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/admin", "/connect", "/api", "/_next/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
