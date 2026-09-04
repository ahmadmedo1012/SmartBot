import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // output: "export" was removed — it broke API routes in Next.js 16.
  // The Next.js app builds normally to .next/ and the backend (FastAPI)
  // serves it via SPA catch-all. API calls go directly to api.smart-link.ly.
  // CORS is configured in FastAPI runner.py.
  turbopack: {
    resolveAlias: {},
  },
}

export default nextConfig
