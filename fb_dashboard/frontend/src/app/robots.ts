import type { MetadataRoute } from "next"

/**
 * v6 §D addition — robots.txt (the missing SEO basic; sitemap.ts already
 * existed). Auth-gated areas (dashboard, admin) are disallowed and never
 * appear in sitemap.ts either (same central route registry rule).
 *
 * v9-E3: SINGLE SOURCE — the old public/robots.txt (which shadowed this
 * route on `next start`/static hosting and drifted) is deleted.
 * - "/_next/" removed from Disallow: blocking Googlebot from the JS/CSS
 *   assets breaks rendering of the client-rendered pages (Googlebot then
 *   indexes empty shells).
 * - P40-5b (P3-1): "/onboarding" removed from Disallow — the route does
 *   not exist (src/app/onboarding/ ships the OnboardingWizard component
 *   only, mounted inside the dashboard; no page.tsx, no route). A stale
 *   Disallow entry misrepresents the site map to crawlers.
 */
const BASE = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/admin", "/connect", "/api"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
