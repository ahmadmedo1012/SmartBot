import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // All assets are served from /static/ by FastAPI — base path aligns with vercel.json rewrite
  // ponytail: assetPrefix if Next.js ever references assets at a different path
}

export default nextConfig
