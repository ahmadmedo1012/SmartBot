export const contentType = "image/png"

export default function OGImage() {
  // Return a pxiel PNG to avoid Satori font subset bug with Arabic fonts
  // ponytail: replace with proper OG Image generation once next/og supports Arabic GSUB format 3
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")
  return new Response(pixel, { headers: { "Content-Type": "image/png" } })
}

