"use client"

import { ThemeProvider } from "next-themes"
import { ReactNode } from "react"

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
 * The ThemeProvider stays exactly as it was (attribute/defaultTheme/
 * enableSystem/disableTransitionOnChange) — same props, just owned
 * here so layout.tsx stays a pure server component. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}
