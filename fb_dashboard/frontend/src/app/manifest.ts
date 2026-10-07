import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SmartBot - منصة إدارة فيسبوك",
    short_name: "SmartBot",
    description: "أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك",
    start_url: "/",
    display: "standalone",
    /* Madarek ground colors: cream splash on the night browser chrome —
     * the PWA follows the app's dark default (مدارك night #070B16) with a
     * warm near-white window (Madarek paper #FBFAF9). Was #0B0A08/#bc4700. */
    background_color: "#FBFAF9",
    theme_color: "#070B16",
    lang: "ar",
    dir: "rtl",
    /* v24-C6 (WCAG 1.3.4 Orientation): `orientation: "portrait"` was removed —
     * installed-PWA users on landscape phones/tablets were locked out of the
     * app. No orientation key = the OS orientation follows the user. */
    categories: ["productivity", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
