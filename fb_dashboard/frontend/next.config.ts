import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: {
    resolveAlias: {},
  },
}

export default nextConfig
