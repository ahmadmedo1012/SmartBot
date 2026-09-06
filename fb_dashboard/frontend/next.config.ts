import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: { unoptimized: true },
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
// it skips uploads silently. Runtime behaviour lives in
// src/instrumentation.ts / instrumentation-client.ts (no-op without DSN).
import { withSentryConfig } from "@sentry/nextjs"

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  disableLogger: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
})
