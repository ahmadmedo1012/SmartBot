import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // ── v12-E5.4: static asset cache headers (bot-domain Next deployment) ──
  // D8 live finding: /opengraph-image.png answered `no-store, no-cache` on
  // bot.smart-link.ly (middleware.ts page default) — every social preview
  // fetch revalidated. Same class for the public icons + manifest. These
  // rules give the content-stable branding assets a 1y immutable cache and
  // the PWA manifest a short 1h cache. NOTE precedence caveat: middleware.ts
  // still matches .png/.webmanifest paths (its extension-exclusion
  // alternatives lack the `.*` prefix) and sets its own Cache-Control —
  // middleware response headers can override config headers, so the durable
  // og-image fix additionally needs middleware.ts to treat these as cached
  // statics (reported to the coordinator for the middleware owner).
  // Fonts: the effective live rule is middleware's 604800 + SWR (v10-C1
  // deliberately avoided immutable because fonts are not hash-named); the
  // rule below raises the ceiling where middleware doesn't apply.
  headers: async () => [
    {
      source: "/fonts/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
    {
      source: "/opengraph-image.png",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
    {
      source:
        "/(apple-touch-icon.png|favicon.ico|favicon.png|brand-icon.png|icon-192.png|icon-512.png|icon-192-maskable.png|icon-512-maskable.png)",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
    {
      source: "/manifest.webmanifest",
      headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
    },
  ],
  // output: "export" was removed — it broke API routes in Next.js 16.
  // The Next.js app builds normally to .next/ and the backend (FastAPI)
  // serves it via SPA catch-all. API calls go directly to api.smart-link.ly.
  // CORS is configured in FastAPI runner.py.
  // v6 §D — LOCAL_API_PROXY mirrors the production vercel.json rewrite
  // (frontend/vercel.json) so a local `next start` + `uvicorn` stack behaves
  // exactly like production (same-origin cookies, real API responses for
  // authenticated pages). Zero effect unless the env var is set.
  ...(process.env.LOCAL_API_PROXY
    ? {
        rewrites: () => [
          { source: "/api/:path*", destination: `${process.env.LOCAL_API_PROXY}/api/:path*` },
          { source: "/webhook", destination: `${process.env.LOCAL_API_PROXY}/webhook` },
          { source: "/healthz", destination: `${process.env.LOCAL_API_PROXY}/healthz` },
        ],
      }
    : {}),
  turbopack: {
    resolveAlias: {},
  },
}

// ── v6 §C — Sentry/GlitchTip source-map upload wiring ─────────────────
// withSentryConfig is build-time tooling only; with no SENTRY_AUTH_TOKEN
// it skips uploads silently. org/project defaults match the committed
// runtime DSN (org "subnation", project "smartbot-web") so adding ONLY
// SENTRY_AUTH_TOKEN in Vercel later activates symbolicated stack traces.
// Runtime behaviour lives in src/instrumentation.ts /
// instrumentation-client.ts + src/lib/sentry-config.ts.
import { withSentryConfig } from "@sentry/nextjs/config"

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG ?? "subnation",
  project: process.env.SENTRY_PROJECT ?? "smartbot-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // v9-D4: `disableLogger: true` was deprecated by @sentry/nextjs 10.x —
  // the documented replacement is webpack.treeshake.removeDebugLogging
  // (the old option is migrated onto exactly this field internally).
  // Note: this only takes effect on webpack builds; on Turbopack (Next 16
  // default) it is a harmless no-op — kept to silence the deprecation
  // warning without behavior change.
  webpack: { treeshake: { removeDebugLogging: true } },
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
})
