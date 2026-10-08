"use client"

import { ThemeProvider, useTheme } from "next-themes"
import { ReactNode, useEffect } from "react"

/* v12-E5.1/E5.2 — the root providers went on a diet:
 *
 * 1. MotionConfig (framer-motion) REMOVED — it dragged the ~116KB motion
 *    engine into the shared base chunk of EVERY route (public pages
 *    included) for animations only 2 lazy components actually used.
 *    The eager routes now use the CSS twins in
 *    components/shared/enter-motion.css; the only JS-motion consumer
 *    left (OnboardingWizard) wraps its own root in MotionConfig —
 *    it is dynamic(ssr:false) via AuthGuard, so framer stays in ITS
 *    lazy chunk only.
 * 2. QueryClientProvider REMOVED — react-query was only consumed under
 *    /dashboard (22 pages) + /admin (telegram). It now mounts in those
 *    layouts via components/shared/QueryProvider, so public routes
 *    (landing/pricing/login/register/…) stop shipping it entirely.
 * 3. AppToaster (sonner) REMOVED (v16-E4, D5 MED finding) — mounting it
 *    here meant the sonner async chunk (43.2KB raw / 12.8KB gz, plus
 *    Turbopack duplicating it across three chunks) was emitted on every
 *    route, including 4 public routes that never fire a single toast.
 *    The toaster now mounts ONLY in the layouts whose pages actually
 *    call toast(): dashboard/layout.tsx, admin/layout.tsx, and the
 *    login/register/connect/subscribe layouts (verified by a repo-wide
 *    toast()/brandedToast()/premiumToast() sweep — landing/pricing/
 *    demo/terms/privacy have zero toast call sites and only fetch
 *    public endpoints, so they ship no toaster at all).
 *
 * r131-F7 (A10 F3/F2 — the SO r130 gold-standard treatment):
 *   · enableSystem REMOVED — one resolution path (dark default, light
 *     only when explicitly stored). The latent "system" stored value
 *     could flip the resolved theme under the user's manual choice and
 *     diverged from the fleet ruling.
 *   · the pre-paint theme BOOT SCRIPT now lives in layout.tsx <head>
 *     (SO layout.tsx:72 pattern) — stored-light users get the .light
 *     class before first paint instead of a dark flash on slow loads.
 *   · ThemeColorSync (SL theme-color-sync.tsx port, r14-M7) mounts below
 *     — the browser chrome bar follows the USER's theme, not the OS
 *     (the viewport metas alone are prefers-color-scheme-bound). */

/* The browser bar follows the GROUND (madarek index.html pattern):
 * night #070B16 dark / cream #FBFAF9 light — the exact pair the root
 * viewport.themeColor metas declare. Renders null: zero server markup,
 * zero LCP/CLS impact; adjusts the live <meta name="theme-color"> content
 * only (media attributes stay for the no-JS first paint). */
const THEME_BAR = { dark: "#070B16", light: "#FBFAF9" } as const

function ThemeColorSync() {
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    // resolvedTheme is undefined pre-hydration — ignore silently (no flash)
    if (resolvedTheme !== "dark" && resolvedTheme !== "light") return
    const color = THEME_BAR[resolvedTheme]
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )) {
      if (meta.content !== color) meta.content = color
    }
  }, [resolvedTheme])
  return null
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      /* r131-F7: enableSystem OFF (fleet ruling) — see the header comment. */
      disableTransitionOnChange
    >
      <ThemeColorSync />
      {children}
    </ThemeProvider>
  )
}
