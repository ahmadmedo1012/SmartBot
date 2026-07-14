import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "https://bot.smart-link.ly/api/:path*" },
      { source: "/static/:path*", destination: "https://bot.smart-link.ly/static/:path*" },
    ]
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "bot.smart-link.ly" }] },
}

export default nextConfig
