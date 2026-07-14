import type { NextConfig } from "next"

const API_HOST = process.env.NEXT_PUBLIC_API_HOST || "https://bot.smart-link.ly"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_HOST}/api/:path*` },
      { source: "/static/:path*", destination: `${API_HOST}/static/:path*` },
    ]
  },
  images: { remotePatterns: [{ protocol: "https", hostname: new URL(API_HOST).hostname }] },
}

export default nextConfig
